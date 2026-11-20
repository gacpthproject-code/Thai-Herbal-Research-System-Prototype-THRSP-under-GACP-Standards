'use strict';

const { writeApplicationStatus } = require('../../services/application-status-writer');

jest.mock('../../services/application-status-writer', () => ({
    writeApplicationStatus: jest.fn(async () => ({})),
}));

const {
    assertCorrectionNotExpired,
    resolveCorrectionDueAt,
} = require('../../services/application-service/correction-deadline-guard');

const DAY = 24 * 60 * 60 * 1000;
const PAST = new Date(Date.now() - DAY);
const FUTURE = new Date(Date.now() + DAY);
const past = () => PAST.toISOString();
const future = () => FUTURE.toISOString();

function buildPrisma(row = null) {
    const prisma = {
        revisionDeadline: {
            findUnique: jest.fn(async () => row),
            updateMany: jest.fn(async () => ({ count: 1 })),
        },
    };
    prisma.$transaction = jest.fn(async (fn) => fn(prisma));
    return prisma;
}

const filing = (status, formData) => ({ id: `app-${status}`, status, formData, workflowHistory: [{ action: 'EARLIER' }] });

beforeEach(() => { writeApplicationStatus.mockClear(); });

describe('each correction state waits on its own clock', () => {
    test('REVISION_REQUESTED reads the revision clock', async () => {
        expect(await resolveCorrectionDueAt(filing('REVISION_REQUESTED', { revisionDueAt: past(), carDueAt: future() }), buildPrisma())).toEqual(PAST);
        const late = await assertCorrectionNotExpired(filing('REVISION_REQUESTED', { revisionDueAt: past() }), { prisma: buildPrisma() });
        expect(late.expired).toBe(true);
        const onlyCarPast = await assertCorrectionNotExpired(filing('REVISION_REQUESTED', { carDueAt: past(), revisionDueAt: future() }), { prisma: buildPrisma() });
        expect(onlyCarPast.expired).toBe(false);
    });

    test('CAR_PENDING reads the CAR clock, never the revision clock an earlier document round left', async () => {
        const prisma = buildPrisma();
        const result = await assertCorrectionNotExpired(filing('CAR_PENDING', { revisionDueAt: past(), revision_due_at: past(), carDueAt: future() }), { prisma });
        expect(result).toEqual({ expired: false, dueAt: FUTURE });
        expect(writeApplicationStatus).not.toHaveBeenCalled();
        expect(prisma.revisionDeadline.updateMany).not.toHaveBeenCalled();
        expect(prisma.revisionDeadline.findUnique).not.toHaveBeenCalled();

        const late = await assertCorrectionNotExpired(filing('CAR_PENDING', { carDueAt: past() }), { prisma: buildPrisma() });
        expect(late.expired).toBe(true);
    });

    test('with no stamp on the filing, the open RevisionDeadline row the cron reads is the clock; a closed row is not', async () => {
        const open = buildPrisma({ revisionDue: PAST, status: 'PENDING' });
        expect((await assertCorrectionNotExpired(filing('CAR_PENDING', {}), { prisma: open })).expired).toBe(true);
        const extended = buildPrisma({ revisionDue: FUTURE, status: 'EXTENDED' });
        expect(await assertCorrectionNotExpired(filing('REVISION_REQUESTED', {}), { prisma: extended })).toEqual({ expired: false, dueAt: FUTURE });
        for (const status of ['SUBMITTED', 'APPROVED', 'FAILED']) {
            const closed = buildPrisma({ revisionDue: PAST, status });
            expect(await assertCorrectionNotExpired(filing('CAR_PENDING', { revisionDueAt: past() }), { prisma: closed })).toEqual({ expired: false, dueAt: null });
        }
        expect(writeApplicationStatus).toHaveBeenCalledTimes(1);
    });

    test('the state the caller resolved wins when status and workflowState disagree', async () => {
        const disagreeing = { ...filing('UNDER_REVIEW', { workflowState: 'CAR_PENDING', carDueAt: past(), revisionDueAt: future() }) };
        const late = await assertCorrectionNotExpired(disagreeing, { prisma: buildPrisma(), fromStatus: 'CAR_PENDING' });
        expect(late.expired).toBe(true);
        expect(late.refusal.body.code).toBe('CAR_DEADLINE_EXCEEDED');
        const onRevisionClock = await assertCorrectionNotExpired(disagreeing, { prisma: buildPrisma(), fromStatus: 'REVISION_REQUESTED' });
        expect(onRevisionClock.expired).toBe(false);
        await expect(assertCorrectionNotExpired(disagreeing, { prisma: buildPrisma() })).rejects.toThrow(TypeError);
    });

    test('a state that waits on no correction deadline is a programming error, not a pass', async () => {
        await expect(assertCorrectionNotExpired(filing('DRAFT', {}), { prisma: buildPrisma() })).rejects.toThrow(TypeError);
        await expect(assertCorrectionNotExpired(filing('CAR_PENDING', {}), {})).rejects.toThrow(TypeError);
    });
});

describe('past the deadline, the deadline closes the filing', () => {
    test('REVISION_REQUESTED: EXPIRED by the system, the row failed, both in one transaction, and the refusal every door answers', async () => {
        const prisma = buildPrisma();
        const result = await assertCorrectionNotExpired(filing('REVISION_REQUESTED', { revisionDueAt: past(), plantId: 'cannabis' }), { prisma });

        expect(result.expired).toBe(true);
        expect(result.refusal.httpStatus).toBe(400);
        expect(result.refusal.body).toMatchObject({ success: false, error: 'REVISION_DEADLINE_EXCEEDED', code: 'REVISION_DEADLINE_EXCEEDED' });
        expect(typeof result.refusal.body.messageTh).toBe('string');

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(writeApplicationStatus).toHaveBeenCalledTimes(1);
        const write = writeApplicationStatus.mock.calls[0][0];
        expect(write).toMatchObject({ prisma, applicationId: 'app-REVISION_REQUESTED', fromStatus: 'REVISION_REQUESTED', toStatus: 'EXPIRED', actorRole: 'system', reason: 'REVISION_DEADLINE_EXPIRED' });
        expect(String(write.actorId)).toMatch(/system/);
        expect(write.additionalData.formData).toMatchObject({ plantId: 'cannabis', workflowState: 'EXPIRED', expiredReason: 'REVISION_OVERDUE' });
        const events = write.additionalData.workflowHistory;
        expect(events[0]).toEqual({ action: 'EARLIER' });
        expect(events[events.length - 1]).toMatchObject({ action: 'REVISION_DEADLINE_EXPIRED', fromState: 'REVISION_REQUESTED', toState: 'EXPIRED', actorRole: 'system' });
        expect(String(events[events.length - 1].actorId)).toMatch(/system/);

        const failed = prisma.revisionDeadline.updateMany.mock.calls[0][0];
        expect(failed.where).toEqual({ applicationId: 'app-REVISION_REQUESTED', status: { in: ['PENDING', 'EXTENDED'] } });
        expect(failed.data.status).toBe('FAILED');
    });

    test('CAR_PENDING: the same closing, with the CAR record and the CAR refusal', async () => {
        const prisma = buildPrisma();
        const result = await assertCorrectionNotExpired(filing('CAR_PENDING', { carDueAt: past() }), { prisma });

        expect(result.refusal.body).toMatchObject({ error: 'CAR_DEADLINE_EXCEEDED', code: 'CAR_DEADLINE_EXCEEDED' });
        const write = writeApplicationStatus.mock.calls[0][0];
        expect(write).toMatchObject({ toStatus: 'EXPIRED', actorId: 'system:car-deadline', actorRole: 'system', reason: 'CAR_DEADLINE_EXPIRED' });
        expect(write.additionalData.formData).toMatchObject({ workflowState: 'EXPIRED', cancelReason: 'CAR_OVERDUE' });
        expect(typeof write.additionalData.formData.carOverdueDetectedOnSubmitAt).toBe('string');
        const events = write.additionalData.workflowHistory;
        expect(events[events.length - 1]).toMatchObject({ action: 'CAR_DEADLINE_EXPIRED', actorId: 'system:car-deadline', actorRole: 'system' });
        expect(prisma.revisionDeadline.updateMany.mock.calls[0][0].data.status).toBe('FAILED');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    test('within the deadline, or with no deadline anywhere, nothing is written', async () => {
        for (const [status, formData] of [['REVISION_REQUESTED', { revisionDueAt: future() }], ['CAR_PENDING', { carDueAt: future() }], ['REVISION_REQUESTED', {}], ['CAR_PENDING', {}]]) {
            const prisma = buildPrisma();
            const result = await assertCorrectionNotExpired(filing(status, formData), { prisma });
            expect(result.expired).toBe(false);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        }
        expect(writeApplicationStatus).not.toHaveBeenCalled();
    });
});

describe('judgeFiling hands the guard the state it resolved', () => {
    test('a CAR filing whose status column disagrees with its workflowState is refused as late, not a 500', async () => {
        const { judgeFiling } = require('../../services/application-filing-gates');
        const application = filing('UNDER_REVIEW', { workflowState: 'CAR_PENDING', carDueAt: past() });
        const verdict = await judgeFiling({ prisma: buildPrisma(), application, fromStatus: 'CAR_PENDING' });
        expect(verdict.refusal.body.code).toBe('CAR_DEADLINE_EXCEEDED');
    });
});
