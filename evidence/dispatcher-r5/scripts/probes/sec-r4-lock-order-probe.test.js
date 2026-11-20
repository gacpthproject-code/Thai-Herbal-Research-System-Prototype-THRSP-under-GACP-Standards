/**
 * Security re-review round 4 — P4: lock order between the inspector swap (application row, then the
 * officer-load lock) and the calendar's reschedule booking (officer-load lock, then the application
 * row). Real doors, real Postgres. The spy only WAITS inside assertWithinCapOrStated (it calls the
 * real function), so each door holds exactly the locks it holds in production at that point.
 * Written by the reviewer; not part of the branch.
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
const out = (label, value) => { process.stdout.write(`PROBE ${label}: ${JSON.stringify(value)}\n`); };

// Installed before the routes load: they destructure the function at require time.
const policy = require('../../services/assignment-policy');
const realAssert = policy.assertWithinCapOrStated;
const plan = { bookingVisitAt: null, holdAfterMs: 0, waitBeforeMs: 0, entered: [] };
jest.spyOn(policy, 'assertWithinCapOrStated').mockImplementation(async (tx, args) => {
    const isBooking = plan.bookingVisitAt && args.visitAt && args.visitAt.getTime() === plan.bookingVisitAt.getTime();
    plan.entered.push(isBooking ? 'booking' : 'swap');
    if (!isBooking && plan.waitBeforeMs) { await sleep(plan.waitBeforeMs); }
    const result = await realAssert(tx, args);
    if (isBooking && plan.holdAfterMs) { await sleep(plan.holdAfterMs); }
    return result;
});

d('P4 lock order: inspector swap vs calendar reschedule (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'secr4lk' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/audits/reassign', require('../../routes/api/audit/audits-reassign'));
    });
    afterAll(async () => { await world.cleanup(); });

    async function race({ holdAfterMs, gapMs }) {
        const target = await world.staff('field_inspector', fx.orgA);
        const row = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitOn(2, 9),
        });
        const newDate = visitOn(3, 13);
        plan.bookingVisitAt = newDate; plan.holdAfterMs = holdAfterMs; plan.entered = [];
        as(fx.dispatcherA);
        const t0 = Date.now();
        const booking = request(app).post('/api/provider/scheduler/audits/schedules')
            .send({ applicationId: row.id, auditorId: target.id, scheduledDate: newDate.toISOString(), location: 'แปลงทดสอบ' })
            .then((res) => ({ status: res.status, code: res.body.code || null, error: String(res.body.error || '').slice(0, 120), ms: Date.now() - t0 }));
        await sleep(gapMs);
        const swap = request(app).post(`/api/audits/reassign/${row.id}/reassign`)
            .send({ newAuditorId: target.id, reason: 'ผู้ตรวจเดิมติดราชการ' })
            .then((res) => ({ status: res.status, code: res.body.code || null, error: String(res.body.error || '').slice(0, 120), ms: Date.now() - t0 }));
        const [b, s] = await Promise.all([booking, swap]);
        const stored = await world.rowOf(row.id);
        return { booking: b, swap: s, entered: plan.entered, final: { auditorIsTarget: stored.auditorId === target.id, scheduledDate: stored.scheduledDate, version: stored.version } };
    }

    test('control: one after the other, no forced wait', async () => {
        const result = await race({ holdAfterMs: 0, gapMs: 1500 });
        out('P4 control', result);
    });

    test('forced interleaving: booking holds the officer lock while the swap holds the row', async () => {
        const result = await race({ holdAfterMs: 1200, gapMs: 300 });
        out('P4 interleaved', result);
    });
});
