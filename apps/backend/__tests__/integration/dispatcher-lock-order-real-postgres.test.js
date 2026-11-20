/**
 * One lock order for every door that assigns or books a field inspector (security re-review
 * 2026-10-09 L-B): the officer-load lock first, then the application row. The calendar booking took
 * the officer lock and then the row; the inspector swap took the row and then the officer lock, so
 * the two deadlocked and the swap answered 500. The reviewer's P4 probe, on the real doors and real
 * Postgres: the spy only waits inside assertWithinCapOrStated and calls the real function, so each
 * door holds exactly the locks it holds in production at that point.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');
const { addWorkingDays, startOfLocalDay } = require('../../utils/working-days');

const mockActor = { current: null };
jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const { tenantContextMiddleware } = jest.requireActual('../../middleware/tenant-context-middleware');
    const bindTenant = tenantContextMiddleware();
    const attach = (req, res, next) => {
        req.user = { ...mockActor.current };
        return bindTenant(req, res, next);
    };
    return { ...actual, authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach, authenticateToken: attach };
});

const HOUR = 60 * 60 * 1000;
const visitOn = (n, hour = 9) => new Date(startOfLocalDay(addWorkingDays(new Date(), n)).getTime() + hour * HOUR);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const row4 = () => Math.random().toString(36).slice(2, 10);

// Installed before the routes load: they destructure the function at require time. While the
// booking holds the inspector's workload lock, the spy waits until the swap is blocked on that lock
// and then asks Postgres whether anyone holds the application row: with one lock order the swap
// holds nothing while it waits, so the row is free.
const policy = require('../../services/assignment-policy');
const realAssert = policy.assertWithinCapOrStated;
const plan = { bookingVisitAt: null, holdAfterMs: 0, probeRow: null, swapWaiting: null, rowWhileBookingHeldTheOfficer: null };
jest.spyOn(policy, 'assertWithinCapOrStated').mockImplementation(async (tx, args) => {
    const isBooking = plan.bookingVisitAt && args.visitAt && args.visitAt.getTime() === plan.bookingVisitAt.getTime();
    const result = await realAssert(tx, args);
    if (isBooking && plan.holdAfterMs) {
        const started = Date.now();
        while (!(await plan.swapWaiting()) && Date.now() - started < plan.holdAfterMs) { await sleep(25); }
        plan.rowWhileBookingHeldTheOfficer = await plan.probeRow();
        await sleep(Math.max(0, plan.holdAfterMs - (Date.now() - started)));
    }
    return result;
});

d('one lock order for the inspector swap and the calendar booking (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'lockord' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/audits/reassign', require('../../routes/api/audit/audits-reassign'));
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
    });
    afterAll(async () => { await world.cleanup(); });

    /**
     * Another transaction holds the new inspector's workload lock; the door under test runs into it.
     * While the door waits, the application row must be free: the door has not locked it yet.
     */
    async function rowWhileWaitingForTheOfficer(officerId, rowId, door) {
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        const holder = world.raw.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`officer-load:${officerId}`}))`;
            await held;
        }, { timeout: 20000 });
        await sleep(100);
        const answer = door();
        const waiting = async () => (await world.raw.$queryRaw`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted AND locktype = 'advisory'`)[0].n > 0;
        const started = Date.now();
        while (!(await waiting()) && Date.now() - started < 2500) { await sleep(25); }
        const sawWaiting = await waiting();
        const row = await world.raw.$queryRaw`SELECT id FROM applications WHERE id = ${rowId} FOR UPDATE NOWAIT`
            .then(() => 'free', (error) => (/55P03|could not obtain lock/.test(`${error?.meta?.code || ''} ${error?.message || ''}`) ? 'locked' : `error ${error?.message}`));
        release();
        await holder;
        return { sawWaiting, row, answer: await answer };
    }

    test('the inspector swap takes the workload lock before the application row', async () => {
        const target = await world.staff('field_inspector', fx.orgA);
        const row = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitOn(2, 9),
        });
        as(fx.dispatcherA);
        const seen = await rowWhileWaitingForTheOfficer(target.id, row.id, () => request(app).post(`/api/audits/reassign/${row.id}/reassign`)
            .send({ newAuditorId: target.id, reason: 'ผู้ตรวจเดิมติดราชการ' }).then((res) => res));
        expect([seen.sawWaiting, seen.row, seen.answer.status]).toEqual([true, 'free', 200]);
    });

    test('the reschedule approval takes the workload lock before the application row', async () => {
        const target = await world.staff('field_inspector', fx.orgA);
        const rescheduleId = `rs-${row4()}`;
        const row = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitOn(2, 9),
            formData: { rescheduleRequests: [{ id: rescheduleId, status: 'PENDING', requestedAt: new Date().toISOString(), reason: 'ผู้ยื่นติดธุระ' }] },
        });
        as(fx.dispatcherA);
        const seen = await rowWhileWaitingForTheOfficer(target.id, row.id, () => request(app).post(`/api/audit/scheduling/${rescheduleId}/approve`)
            .send({ newDate: visitOn(4, 9).toISOString(), newAuditor: target.id }).then((res) => res));
        expect([seen.sawWaiting, seen.row, seen.answer.status]).toEqual([true, 'free', 200]);
    });

    test('the booking holds the officer lock while the swap starts: neither answers 500, and the row ends as the booking wrote it', async () => {
        const target = await world.staff('field_inspector', fx.orgA);
        const row = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitOn(2, 9),
        });
        const newDate = visitOn(3, 13);
        plan.bookingVisitAt = newDate;
        plan.holdAfterMs = 2000;
        plan.swapWaiting = async () => (await world.raw.$queryRaw`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted AND locktype = 'advisory'`)[0].n > 0;
        plan.probeRow = () => world.raw.$queryRaw`SELECT id FROM applications WHERE id = ${row.id} FOR UPDATE NOWAIT`
            .then(() => 'free', (error) => (/55P03|could not obtain lock/.test(`${error?.meta?.code || ''} ${error?.message || ''}`) ? 'locked' : `error ${error?.message}`));
        as(fx.dispatcherA);
        const booking = request(app).post('/api/provider/scheduler/audits/schedules')
            .send({ applicationId: row.id, auditorId: target.id, scheduledDate: newDate.toISOString(), location: 'แปลงทดสอบ' });
        const bookingDone = booking.then((res) => res);
        await sleep(300);
        const swap = await request(app).post(`/api/audits/reassign/${row.id}/reassign`)
            .send({ newAuditorId: target.id, reason: 'ผู้ตรวจเดิมติดราชการ' });
        const booked = await bookingDone;
        plan.holdAfterMs = 0;

        expect(plan.rowWhileBookingHeldTheOfficer).toBe('free');
        expect(booked.status).toBe(201);
        expect(swap.status).not.toBe(500);
        expect([200, 409]).toContain(swap.status);
        const stored = await world.rowOf(row.id);
        expect(stored.auditorId).toBe(target.id);
        expect(new Date(stored.scheduledDate).toISOString()).toBe(newDate.toISOString());
    });
});
