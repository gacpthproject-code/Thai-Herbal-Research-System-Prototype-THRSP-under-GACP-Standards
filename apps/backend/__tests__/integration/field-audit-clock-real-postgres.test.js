/**
 * The field inspector's task for a booked visit is timed from the visit, not from the booking (the
 * dispatcher-defaults memo, operator order 56(1)): a visit booked further ahead than the task's time
 * limit used to show as overdue before its day came. A visit moved to another day moves the clock.
 * Real Postgres.
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

function visitOn(n, hour = 9) {
    return new Date(startOfLocalDay(addWorkingDays(new Date(), n)).getTime() + hour * HOUR);
}

d('the field audit task is timed from the visit (real Postgres)', () => {
    let world;
    let fx;
    let app;
    let policy;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'fac' });
        ({ fx } = world);
        policy = await world.raw.slaPolicy.findFirst({ where: { workType: 'FIELD_AUDIT' } });
        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
    });

    afterAll(async () => { await world.cleanup(); });

    const fieldTask = async (applicationId) => world.raw.workActivity.findFirst({
        where: { applicationId, workType: 'FIELD_AUDIT', state: { in: ['TODO', 'CLAIMED', 'IN_PROGRESS'] } },
    });
    const timedFrom = (visitAt) => ({
        dueAt: new Date(visitAt.getTime() + policy.targetHours * HOUR),
        warningAt: new Date(visitAt.getTime() + policy.warningHours * HOUR),
    });

    test('the field audit time limit is in force on this database', () => {
        expect(policy).toMatchObject({ workType: 'FIELD_AUDIT' });
        expect(policy.targetHours).toBeGreaterThan(0);
    });

    test.each([
        ['the calendar', 15, (row, at) => request(app).post('/api/provider/scheduler/audits/schedules')
            .send({ applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: at.toISOString(), location: 'แปลงทดสอบ' })],
        ['the scheduling queue', 17, (row, at) => request(app).post('/api/audit/scheduling/assign')
            .send({ applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: at.toISOString() })],
    ])('a visit booked through %s weeks ahead is due a time limit after the visit, not after the booking', async (_door, workingDaysAhead, book) => {
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
        const at = visitOn(workingDaysAhead);
        as(fx.dispatcherA);
        expect((await book(row, at)).status).toBe(201);
        const task = await fieldTask(row.id);
        expect({ dueAt: task.dueAt, warningAt: task.warningAt }).toEqual(timedFrom(at));
    });

    test('moving the visit through the calendar moves the clock, and a warning sent for the old day can go out again', async () => {
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
        as(fx.dispatcherA);
        expect((await request(app).post('/api/provider/scheduler/audits/schedules')
            .send({ applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: visitOn(21).toISOString(), location: 'แปลงทดสอบ' })).status).toBe(201);
        const booked = await fieldTask(row.id);
        await world.raw.workActivity.update({ where: { id: booked.id }, data: { warnedAt: new Date() } });

        const moved = visitOn(24, 13);
        expect((await request(app).post('/api/provider/scheduler/audits/schedules')
            .send({ applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: moved.toISOString(), location: 'แปลงทดสอบ' })).status).toBe(201);
        const task = await fieldTask(row.id);
        expect(task.id).toBe(booked.id);
        expect({ dueAt: task.dueAt, warningAt: task.warningAt, warnedAt: task.warnedAt }).toEqual({ ...timedFrom(moved), warnedAt: null });
    });

    test('approving the applicant\'s request to move the visit moves the clock', async () => {
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
        as(fx.dispatcherA);
        expect((await request(app).post('/api/provider/scheduler/audits/schedules')
            .send({ applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: visitOn(22).toISOString(), location: 'แปลงทดสอบ' })).status).toBe(201);
        const stored = await world.rowOf(row.id);
        const rescheduleId = `rs-${row.id.slice(0, 8)}`;
        const moved = visitOn(26, 10);
        await world.raw.application.update({
            where: { id: row.id },
            data: { formData: { ...stored.formData, rescheduleRequests: [{ id: rescheduleId, status: 'PENDING', requestedDate: moved.toISOString(), reason: 'ติดธุระวันเดิม' }] } },
        });
        const res = await request(app).post(`/api/audit/scheduling/${rescheduleId}/approve`).send({ newDate: moved.toISOString() });
        expect(res.status).toBe(200);
        const task = await fieldTask(row.id);
        expect({ dueAt: task.dueAt, warningAt: task.warningAt }).toEqual(timedFrom(moved));
    });
});
