/**
 * Payment is settled by the verified gateway webhook only (operator 2026-10-06).
 * No person marks a payment paid: every door that is not the SYSTEM settlement
 * (admin force-status, PATCH status, status override, work inbox, revert) may
 * land on DOC_FEE_PAID / AUDIT_FEE_PAID only when a SETTLED checkout order for
 * that milestone already exists. The fence lives in the one writer every door uses.
 */

'use strict';

jest.mock('../../services/workflow-transition-service', () => ({
    canTransition: () => true,
    normalizeWorkflowStateInput: (v) => String(v || '').toUpperCase() || null,
}));

const { writeApplicationStatus } = require('../../services/application-status-writer');

const PAID_INVOICE = { status: 'paid', metadata: null };

/** `settled` = the milestones that have a SETTLED order; every order carries `invoice`. */
function fakePrisma({ settled = [], invoice = PAID_INVOICE, formData = {} }) {
    return {
        application: {
            findUnique: jest.fn(async () => ({ status: 'PENDING_DOC_FEE', formData })),
            findFirst: jest.fn(async () => ({ status: 'PENDING_DOC_FEE', formData: {} })),
            update: jest.fn(async ({ data }) => ({ id: 'app-1', ...data })),
        },
        checkoutOrder: {
            findMany: jest.fn(async ({ where }) => settled
                .filter((milestone) => where.milestone.in.includes(milestone))
                .map((milestone) => ({ id: `order-${milestone}`, milestone, invoice }))),
        },
    };
}

function write(prisma, toStatus, actorRole) {
    return writeApplicationStatus({
        prisma,
        applicationId: 'app-1',
        fromStatus: toStatus === 'AUDIT_FEE_PAID' ? 'PENDING_AUDIT_FEE' : 'PENDING_DOC_FEE',
        toStatus,
        actorId: 'actor-1',
        actorRole,
        onAudit: false,
    });
}

describe('a paid status needs a settled payment, whoever writes it', () => {
    it.each([
        ['DOC_FEE_PAID', 'M1'],
        ['AUDIT_FEE_PAID', 'M2'],
    ])('an admin cannot write %s with no SETTLED %s order', async (toStatus, milestone) => {
        const prisma = fakePrisma({ settled: milestone === 'M2' ? ['M1'] : [] });
        await expect(write(prisma, toStatus, 'system_admin_dtam'))
            .rejects.toMatchObject({ code: 'PAYMENT_NOT_SETTLED', statusCode: 409 });
        expect(prisma.checkoutOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { applicationId: 'app-1', milestone: { in: [milestone] }, status: 'SETTLED' },
        }));
        expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it.each(['finance_officer_platform', 'finance_officer_dtam', 'dispatcher'])(
        '%s cannot mark phase 1 paid either', async (role) => {
            const prisma = fakePrisma({});
            await expect(write(prisma, 'DOC_FEE_PAID', role)).rejects.toMatchObject({ code: 'PAYMENT_NOT_SETTLED' });
            expect(prisma.application.update).not.toHaveBeenCalled();
        },
    );

    it('a correction back onto a paid state is allowed once the money really settled', async () => {
        const prisma = fakePrisma({ settled: ['M1'] });
        await write(prisma, 'DOC_FEE_PAID', 'system_admin_dtam');
        expect(prisma.application.update).toHaveBeenCalled();
    });

    it.each(['INITIATED', 'BANK_TRANSFER_PENDING', 'COMPLETED'])(
        'a SETTLED order whose invoice carries a %s refund does not let anyone write the paid state', async (refund) => {
            const prisma = fakePrisma({ settled: ['M1', 'M2'], invoice: { status: 'paid', metadata: { refund: { status: refund } } } });
            await expect(write(prisma, 'AUDIT_FEE_PAID', 'system_admin_dtam'))
                .rejects.toMatchObject({ code: 'PAYMENT_NOT_SETTLED', statusCode: 409 });
            expect(prisma.application.update).not.toHaveBeenCalled();
        },
    );

    it('a cancelled refund leaves the payment standing', async () => {
        const prisma = fakePrisma({ settled: ['M1', 'M2'], invoice: { status: 'paid', metadata: { refund: { status: 'CANCELLED' } } } });
        await write(prisma, 'AUDIT_FEE_PAID', 'system_admin_dtam');
        expect(prisma.application.update).toHaveBeenCalled();
    });

    it('the webhook settlement (SYSTEM) writes the paid state without looking up the milestone it settles', async () => {
        const prisma = fakePrisma({ settled: ['M1'] });
        await write(prisma, 'AUDIT_FEE_PAID', 'SYSTEM');
        expect(prisma.checkoutOrder.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.checkoutOrder.findMany.mock.calls[0][0].where.milestone).toEqual({ in: ['M1'] });
        expect(prisma.application.update).toHaveBeenCalled();
    });
});

describe('no state after a milestone without its money, whoever writes it (security review 2026-10-06, F1)', () => {
    const move = (prisma, fromStatus, toStatus, actorRole) => writeApplicationStatus({
        prisma, applicationId: 'app-1', fromStatus, toStatus, actorId: 'actor-1', actorRole, onAudit: false,
    });

    it.each([
        ['DOC_FEE_PAID', 'ASSIGNED_FOR_REVIEW', 'dispatcher', [], ['M1']],
        ['PENDING_DOC_FEE', 'REVISION_REQUESTED', 'document_reviewer', [], ['M1']],
        ['DOC_APPROVED', 'PENDING_AUDIT_FEE', 'SYSTEM', [], ['M1']],
        ['PENDING_AUDIT_FEE', 'AUDIT_FEE_PAID', 'SYSTEM', [], ['M1']],
        ['AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', 'dispatcher', ['M1'], ['M2']],
        ['AUDIT_PASSED', 'CERTIFIED', 'certificate_approver', ['M2'], ['M1']],
    ])('%s → %s by %s with %j paid is refused for %j', async (fromStatus, toStatus, actorRole, settled, unpaid) => {
        const prisma = fakePrisma({ settled });
        await expect(move(prisma, fromStatus, toStatus, actorRole))
            .rejects.toMatchObject({ code: 'MILESTONE_NOT_PAID', statusCode: 409, milestones: unpaid });
        expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('a fully refunded first milestone does not open the review', async () => {
        const prisma = fakePrisma({ settled: ['M1'], invoice: { status: 'paid', metadata: { refund: { status: 'COMPLETED' } } } });
        await expect(move(prisma, 'DOC_FEE_PAID', 'ASSIGNED_FOR_REVIEW', 'dispatcher'))
            .rejects.toMatchObject({ code: 'MILESTONE_NOT_PAID', milestones: ['M1'] });
    });

    it('a paid first milestone opens the review', async () => {
        const prisma = fakePrisma({ settled: ['M1'] });
        await move(prisma, 'DOC_FEE_PAID', 'ASSIGNED_FOR_REVIEW', 'dispatcher');
        expect(prisma.application.update).toHaveBeenCalled();
    });

    it('a renewal owes no M1: it enters at PENDING_AUDIT_FEE and is inspected on M2 alone (operator 2026-09-07)', async () => {
        const renewal = { renewalOf: 'cert-1' };
        const entering = fakePrisma({ formData: renewal });
        await move(entering, 'SUBMITTED', 'PENDING_AUDIT_FEE', 'system');
        expect(entering.application.update).toHaveBeenCalled();
        const inspected = fakePrisma({ settled: ['M2'], formData: renewal });
        await move(inspected, 'AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', 'dispatcher');
        expect(inspected.application.update).toHaveBeenCalled();
        const unpaid = fakePrisma({ formData: renewal });
        await expect(move(unpaid, 'AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', 'dispatcher'))
            .rejects.toMatchObject({ code: 'MILESTONE_NOT_PAID', milestones: ['M2'] });
    });

    it.each([['EXPIRED', 'SYSTEM'], ['REJECTED', 'certificate_approver']])('leaving to %s needs no payment', async (toStatus, role) => {
        const prisma = fakePrisma({});
        await move(prisma, 'PENDING_DOC_FEE', toStatus, role);
        expect(prisma.checkoutOrder.findMany).not.toHaveBeenCalled();
        expect(prisma.application.update).toHaveBeenCalled();
    });
});
