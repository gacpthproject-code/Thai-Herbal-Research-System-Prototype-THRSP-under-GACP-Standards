/**
 * A deadlock between two bookings is retried, not answered as a 500 (security re-review 2026-10-09
 * L-B): Postgres aborts one side with SQLSTATE 40P01, which Prisma reports as P2010 from a raw query
 * and P2034 from its own. The retry re-reads under the locks and either books or refuses with the
 * real reason.
 */

'use strict';

const { runSlotBooking } = require('../../services/audit-scheduling-service');

const deadlock = () => Object.assign(new Error('deadlock detected'), { code: 'P2010', meta: { code: '40P01' } });

describe('runSlotBooking', () => {
    test('a deadlock on the first attempt is retried and the second attempt writes', async () => {
        const tx = { $queryRaw: jest.fn() };
        let attempts = 0;
        const prisma = {
            $transaction: jest.fn(async (work) => {
                attempts += 1;
                if (attempts === 1) { throw deadlock(); }
                return work(tx);
            }),
        };
        const written = await runSlotBooking(prisma, { auditorId: 'inspector-1', scheduledAt: null }, async () => 'written');
        expect(written).toBe('written');
        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    test('deadlocks on every attempt end as the retriable 409, never the raw error', async () => {
        const prisma = { $transaction: jest.fn(async () => { throw deadlock(); }) };
        await expect(runSlotBooking(prisma, { auditorId: 'inspector-1', scheduledAt: null }, async () => 'written'))
            .rejects.toMatchObject({ code: 'AUDITOR_SLOT_CONFLICT', statusCode: 409 });
    });
});
