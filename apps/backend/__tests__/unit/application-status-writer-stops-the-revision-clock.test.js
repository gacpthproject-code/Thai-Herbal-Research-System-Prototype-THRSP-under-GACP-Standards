'use strict';

jest.mock('../../services/workflow-transition-service', () => ({
    canTransition: () => true,
    normalizeWorkflowStateInput: (v) => String(v || '').toUpperCase() || null,
}));

const { writeApplicationStatus } = require('../../services/application-status-writer');

const PAID_INVOICE = { status: 'paid', metadata: null };

function transactionClient({ stored, settled }) {
    const order = [];
    const client = {
        $queryRaw: jest.fn(async () => { order.push('lock'); return [{ status: stored, version: 1 }]; }),
        application: {
            findUnique: jest.fn(async () => ({ status: stored, formData: {} })),
            findFirst: jest.fn(async () => ({ status: stored, formData: {} })),
            update: jest.fn(async ({ data }) => { order.push('status'); return { id: 'app-1', ...data }; }),
        },
        checkoutOrder: {
            findMany: jest.fn(async ({ where }) => settled
                .filter((milestone) => where.milestone.in.includes(milestone))
                .map((milestone) => ({ id: `order-${milestone}`, milestone, invoice: PAID_INVOICE }))),
        },
        revisionDeadline: { updateMany: jest.fn(async () => { order.push('clock'); return { count: 1 }; }) },
    };
    return { client, order };
}

const write = (client, fromStatus, toStatus, actorRole = 'health') => writeApplicationStatus({
    prisma: client, applicationId: 'app-1', fromStatus, toStatus, actorId: 'actor-1', actorRole, onAudit: false,
});

describe('an answer edge stops the open revision clock on the same client, after the status row', () => {
    test.each([
        ['REVISION_REQUESTED', 'ASSIGNED_FOR_REVIEW', ['M1']],
        ['CAR_PENDING', 'CAR_REVIEWING', ['M1', 'M2']],
    ])('%s → %s', async (from, to, settled) => {
        const { client, order } = transactionClient({ stored: from, settled });
        await write(client, from, to);
        expect(client.revisionDeadline.updateMany).toHaveBeenCalledWith({
            where: { applicationId: 'app-1', status: { in: ['PENDING', 'EXTENDED'] } },
            data: expect.objectContaining({ status: 'SUBMITTED', submittedBy: 'actor-1', updatedBy: 'actor-1' }),
        });
        expect(order).toEqual(['lock', 'status', 'clock']);
    });

    test('an admin forcing REVISION_REQUESTED → ASSIGNED_FOR_REVIEW is a rescue, not an answer: no deadline write', async () => {
        const { client } = transactionClient({ stored: 'REVISION_REQUESTED', settled: ['M1'] });
        await write(client, 'REVISION_REQUESTED', 'ASSIGNED_FOR_REVIEW', 'system_admin_dtam');
        expect(client.application.update).toHaveBeenCalled();
        expect(client.revisionDeadline.updateMany).not.toHaveBeenCalled();
    });

    test('the reviewer accepting the papers is not an answer: no deadline write', async () => {
        const { client } = transactionClient({ stored: 'ASSIGNED_FOR_REVIEW', settled: ['M1'] });
        await write(client, 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED', 'document_reviewer');
        expect(client.application.update).toHaveBeenCalled();
        expect(client.revisionDeadline.updateMany).not.toHaveBeenCalled();
    });
});
