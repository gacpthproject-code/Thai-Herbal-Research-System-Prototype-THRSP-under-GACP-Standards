/**
 * The dispatcher's defaults (operator order 56(1), 2026-10-09) and the reason for moving the field
 * inspector while the applicant corrects an on-site defect (order 60(a)), on real Postgres:
 *
 *   1.2 the urgent monitor watches the stages staff hold, from when the application entered them,
 *       and a booked visit only once its day has passed without a result;
 *   1.3 every visit waiting or booked shows the date the company must inspect by, and a visit
 *       booked after it goes ahead only with a reason;
 *   2.1 2.2 past an officer's workload cap an assignment goes ahead only with a confirmation and a
 *       reason from the fixed list, which the DTAM admin reads in the audit log;
 *   2.3 visits per inspector per day is the dated rule, whatever the environment says;
 *   3.1 3.2 the manual reminder is for the two corrections only, once per round, from a tab the
 *       dispatcher can see.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';
// The old per-day limit read this variable; the dated rule (2 a day) must win over it.
process.env.AUDITOR_MAX_PER_DAY = '3';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');
const { waitUntilQueued } = require('./fixtures/row-lock-race');
const {
    addWorkingDays, startOfLocalDay, countWorkingDaysBetween, isWorkingDay, getZonedParts,
} = require('../../utils/working-days');

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
const DAY = 24 * HOUR;

/** 09:00 (or `hour`) Bangkok on the `n`th working day from today. */
function visitOn(n, hour = 9) {
    return new Date(startOfLocalDay(addWorkingDays(new Date(), n)).getTime() + hour * HOUR);
}

/** An instant on the working day `n` working days before today, counted without the code under test. */
function workingDaysAgo(n) {
    let at = new Date(Date.now() - 2 * HOUR);
    let counted = 0;
    while (counted < n) {
        at = new Date(at.getTime() - DAY);
        if (isWorkingDay(at)) { counted += 1; }
    }
    return at;
}

d('the dispatcher\'s defaults (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'ddf' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
        app.use('/api/audits/reassign', require('../../routes/api/audit/audits-reassign'));
    });

    afterAll(async () => { await world.cleanup(); });

    /** The milestone-2 payment settled at `settledAt` under the payment terms `version`. */
    const paidM2 = (applicationId, settledAt, version = 'payment-terms-th-v1.3') => world.raw.checkoutOrder.updateMany({
        where: { applicationId, milestone: 'M2' }, data: { settledAt, paymentTermsVersion: version },
    });
    const auditRowsOf = async (applicationId, action) => (await world.raw.auditLog.findMany({ where: { resourceId: applicationId, action } }))
        .map((row) => ({ ...row, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata }));
    const noticesOf = (userId, applicationNumber) => world.raw.notification.findMany({ where: { userId, message: { contains: applicationNumber } } });

    describe('1.2 the urgent monitor', () => {
        const monitored = async (applicationNumber) => {
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/scheduler/urgent-monitor');
            expect(res.status).toBe(200);
            return res.body.data.stuckItems.find((item) => item.applicationNumber === applicationNumber) || null;
        };

        test.each(['SUBMITTED', 'PENDING_DOC_FEE', 'REVISION_REQUESTED', 'PENDING_AUDIT_FEE', 'CAR_PENDING'])(
            'an application waiting on the applicant (%s) is not on the monitor, however long it has waited',
            async (status) => {
                const milestones = { PENDING_AUDIT_FEE: ['M1'], REVISION_REQUESTED: ['M1'], CAR_PENDING: ['M1', 'M2'] }[status] || [];
                const row = await world.application(status, { milestones, reviewerId: fx.reviewerA.id, formData: { workflowStateUpdatedAt: new Date(Date.now() - 20 * DAY).toISOString() } });
                await world.raw.$executeRaw`UPDATE applications SET "updatedAt" = now() - interval '20 days' WHERE id = ${row.id}`;
                expect(await monitored(row.applicationNumber)).toBeNull();
            },
        );

        test('a stage staff hold is counted from when the application entered it, not from its last edit', async () => {
            const entered = workingDaysAgo(3);
            const row = await world.application('DOC_FEE_PAID', { milestones: ['M1'], formData: { workflowStateUpdatedAt: entered.toISOString() } });
            const item = await monitored(row.applicationNumber);
            expect(item).toMatchObject({ clock: 'STAGE_ENTRY', workingDaysWaiting: countWorkingDaysBetween(entered, new Date()) });
            const { queueTimeLimitsAt } = require('../../services/dispatcher-rules');
            const rule = queueTimeLimitsAt(new Date());
            expect(item.severity).toBe(item.workingDaysWaiting >= rule.criticalAfterWorkingDays ? 'CRITICAL' : 'WARNING');
        });

        test('a booked visit whose day has not come is not on the monitor, however long ago it was booked', async () => {
            const row = await world.application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitOn(2),
                formData: { workflowStateUpdatedAt: new Date(Date.now() - 20 * DAY).toISOString() },
            });
            await world.raw.$executeRaw`UPDATE applications SET "updatedAt" = now() - interval '20 days' WHERE id = ${row.id}`;
            expect(await monitored(row.applicationNumber)).toBeNull();
        });

        test('a visit whose day has passed without a result is on the monitor, counted from the visit day', async () => {
            const visitDay = workingDaysAgo(1);
            const row = await world.application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitDay,
                formData: { workflowStateUpdatedAt: new Date().toISOString() },
            });
            const item = await monitored(row.applicationNumber);
            expect(item).toMatchObject({ clock: 'VISIT_DAY', severity: 'WARNING' });
            expect(new Date(item.scheduledDate).toISOString()).toBe(visitDay.toISOString());
        });
    });

    describe('1.3 the date the company must inspect by', () => {
        const sixtyWorkingDaysAfter = (at) => addWorkingDays(at, 60).toISOString();

        test('the scheduling queue and the dispatcher\'s board show it on every visit waiting to be booked', async () => {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            const paidAt = new Date(Date.now() - 3 * DAY);
            await paidM2(row.id, paidAt);
            const older = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            await paidM2(older.id, paidAt, 'payment-terms-th-v1.2');
            as(fx.dispatcherA);

            const queue = await request(app).get('/api/audit/scheduling/queue');
            expect(queue.status).toBe(200);
            const queued = (id) => queue.body.data.items.find((item) => item.applicationId === id);
            expect(queued(row.id).inspectBy).toBe(sixtyWorkingDaysAfter(paidAt));
            // Payment terms before v1.3 set no inspection window: no date is shown, none is guessed.
            expect(queued(older.id).inspectBy).toBeNull();

            const board = await request(app).get('/api/provider/scheduler/dashboard?limit=200');
            expect(board.status).toBe(200);
            const ready = board.body.data.queues.readyToSchedule.items.find((item) => item.applicationId === row.id);
            expect(ready.inspectBy).toBe(sixtyWorkingDaysAfter(paidAt));
        });

        const BOOKING_DOORS = [
            ['the calendar', (row, inspector, at, extra = {}) => request(app).post('/api/provider/scheduler/audits/schedules')
                .send({ applicationId: row.id, auditorId: inspector.id, scheduledDate: at.toISOString(), location: 'แปลงทดสอบ', ...extra })],
            ['the scheduling queue', (row, inspector, at, extra = {}) => request(app).post('/api/audit/scheduling/assign')
                .send({ applicationId: row.id, auditorId: inspector.id, scheduledDate: at.toISOString(), location: 'แปลงทดสอบ', ...extra })],
        ];

        test.each(BOOKING_DOORS)('through %s, a visit after that date asks for a reason, and goes ahead with one', async (_door, book) => {
            const inspector = await world.staff('field_inspector', fx.orgA);
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            const paidAt = new Date(Date.now() - 100 * DAY);
            await paidM2(row.id, paidAt);
            const at = visitOn(8);
            as(fx.dispatcherA);

            const asked = await book(row, inspector, at);
            expect(asked.status).toBe(409);
            expect(asked.body.code).toBe('LATE_VISIT_REASON_REQUIRED');
            expect(asked.body.data.inspectBy).toBe(sixtyWorkingDaysAfter(paidAt));
            expect(asked.body.data.reasons.map((reason) => reason.code)).toContain('OTHER');
            expect((await world.rowOf(row.id)).status).toBe('AUDIT_FEE_PAID');

            const booked = await book(row, inspector, at, { lateVisit: { reasonCode: 'SITE_NOT_READY' } });
            expect(booked.status).toBe(201);
            const stored = await world.rowOf(row.id);
            expect(stored.status).toBe('AUDIT_CONFIRMED');
            expect(stored.formData.auditSchedule.statedReasons.lateVisit).toMatchObject({ reasonCode: 'SITE_NOT_READY', inspectBy: sixtyWorkingDaysAfter(paidAt) });
            const [logged] = await auditRowsOf(row.id, 'VISIT_BOOKED_AFTER_INSPECTION_DUE');
            expect(logged).toMatchObject({ organizationId: fx.orgA, actorId: fx.dispatcherA.id });
            expect(logged.metadata).toMatchObject({ reasonCode: 'SITE_NOT_READY', visitAt: at.toISOString() });
        });

        test('a visit on or before that date is booked without a reason', async () => {
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            await paidM2(row.id, new Date());
            as(fx.dispatcherA);
            const res = await BOOKING_DOORS[0][1](row, await world.staff('field_inspector', fx.orgA), visitOn(9));
            expect(res.status).toBe(201);
            expect((await world.rowOf(row.id)).formData.auditSchedule.statedReasons ?? null).toBeNull();
        });
    });

    describe('2.1 2.2 an officer past the workload cap', () => {
        /** A document reviewer holding five applications: three to review, two waiting on the applicant. */
        async function reviewerAtCap() {
            const reviewer = await world.staff('document_reviewer', fx.orgA);
            for (const status of ['ASSIGNED_FOR_REVIEW', 'ASSIGNED_FOR_REVIEW', 'ASSIGNED_FOR_REVIEW', 'REVISION_REQUESTED', 'REVISION_REQUESTED']) {
                await world.application(status, { milestones: ['M1'], reviewerId: reviewer.id });
            }
            return reviewer;
        }

        const REVIEWER_DOORS = [
            ['the dispatcher\'s assignment', async (reviewer, extra = {}) => {
                const row = await world.settledInto('DOC_FEE_PAID');
                as(fx.dispatcherA);
                return { row, res: await request(app).post('/api/provider/scheduler/reviewer-assignments').send({ applicationId: row.id, reviewerId: reviewer.id, ...extra }) };
            }],
            ['the provider assignment door', async (reviewer, extra = {}) => {
                const row = await world.settledInto('DOC_FEE_PAID');
                as(fx.dispatcherA);
                return { row, res: await request(app).post(`/api/provider/applications/${row.id}/assign`).send({ reviewerId: reviewer.id, ...extra }) };
            }],
            ['the reviewer swap', async (reviewer, extra = {}) => {
                const row = await world.application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: fx.reviewerA2.id });
                as(fx.dispatcherA);
                return { row, res: await request(app).post(`/api/provider/scheduler/reviewer-assignments/${row.id}/reassign`).send({ newReviewerId: reviewer.id, reason: 'ผู้ตรวจเดิมลาป่วย', ...extra }) };
            }],
            ['the DTAM admin\'s batch', async (reviewer, extra = {}) => {
                const row = await world.settledInto('DOC_FEE_PAID');
                as(fx.adminA);
                return { row, res: await request(app).post('/api/provider/admin/batch-actions').send({ applicationIds: [row.id], action: 'ASSIGN', assignTo: reviewer.id, ...extra }) };
            }],
        ];

        test.each(REVIEWER_DOORS)('%s: a reviewer holding five asks for a confirmation and a listed reason; nothing is written until then', async (_door, assign) => {
            const reviewer = await reviewerAtCap();
            const { row, res } = await assign(reviewer);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('OFFICER_OVER_CAP_CONFIRMATION_REQUIRED');
            expect(res.body.data).toMatchObject({ role: 'document_reviewer', load: 5, cap: 5 });
            expect(res.body.data.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining(['NO_OTHER_OFFICER_AVAILABLE', 'OTHER']));
            expect((await world.rowOf(row.id)).reviewerId).not.toBe(reviewer.id);
        });

        test.each(REVIEWER_DOORS)('%s: confirmed with a listed reason, the assignment goes ahead and the DTAM admin reads why', async (_door, assign) => {
            const reviewer = await reviewerAtCap();
            const refused = await assign(reviewer, { overCap: { reasonCode: 'OTHER', reasonText: 'สั้น' } });
            expect(refused.res.status).toBe(400);
            expect(refused.res.body.code).toBe('ASSIGNMENT_REASON_INVALID');

            const { row, res } = await assign(reviewer, { overCap: { reasonCode: 'NO_OTHER_OFFICER_AVAILABLE' } });
            expect(res.status).toBeLessThan(300);
            expect((await world.rowOf(row.id)).reviewerId).toBe(reviewer.id);
            const [logged] = await auditRowsOf(row.id, 'OFFICER_ASSIGNED_OVER_CAP');
            expect(logged).toMatchObject({ organizationId: fx.orgA });
            expect(logged.metadata).toMatchObject({ officerId: reviewer.id, role: 'document_reviewer', load: 5, cap: 5, reasonCode: 'NO_OTHER_OFFICER_AVAILABLE' });

            as(fx.adminA);
            const read = await request(app).get(`/api/provider/admin/audit-log?actor=${encodeURIComponent(logged.actorId)}&limit=200`);
            expect(read.status).toBe(200);
            expect(read.body.data.map((entry) => `${entry.action}:${entry.resourceId}`)).toContain(`OFFICER_ASSIGNED_OVER_CAP:${row.id}`);
        });

        test('a reviewer holding four is assigned without a confirmation and nothing is logged as over the cap', async () => {
            const reviewer = await world.staff('document_reviewer', fx.orgA);
            for (let i = 0; i < 4; i += 1) { await world.application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: reviewer.id }); }
            const { row, res } = await REVIEWER_DOORS[0][1](reviewer);
            expect(res.status).toBe(200);
            expect(await auditRowsOf(row.id, 'OFFICER_ASSIGNED_OVER_CAP')).toHaveLength(0);
        });

        test('an assignment counted while another assignment of the same reviewer is in flight waits for it and counts it', async () => {
            const reviewer = await world.staff('document_reviewer', fx.orgA);
            for (let i = 0; i < 4; i += 1) { await world.application('ASSIGNED_FOR_REVIEW', { milestones: ['M1'], reviewerId: reviewer.id }); }
            const inFlight = await world.settledInto('DOC_FEE_PAID');
            const target = await world.settledInto('DOC_FEE_PAID');
            const { assertWithinCapOrStated } = require('../../services/assignment-policy');
            let pending;
            await world.raw.$transaction(async (tx) => {
                const counted = await assertWithinCapOrStated(tx, { role: 'document_reviewer', officerId: reviewer.id, excludeApplicationId: inFlight.id });
                expect(counted).toMatchObject({ overCap: false, load: 4 });
                await tx.application.update({ where: { id: inFlight.id }, data: { reviewerId: reviewer.id, status: 'ASSIGNED_FOR_REVIEW' } });
                const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
                as(fx.dispatcherA);
                pending = request(app).post('/api/provider/scheduler/reviewer-assignments').send({ applicationId: target.id, reviewerId: reviewer.id }).then((res) => res);
                await waitUntilQueued(world.raw, pid, 1, 15000);
            }, { timeout: 30000, maxWait: 10000 });
            const res = await pending;
            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: 'OFFICER_OVER_CAP_CONFIRMATION_REQUIRED', data: { load: 5 } });
        });

        /** A field inspector with five visits in the next five working days, two a day at most. */
        async function inspectorAtCap() {
            const inspector = await world.staff('field_inspector', fx.orgA);
            for (const at of [visitOn(1, 9), visitOn(1, 13), visitOn(2, 9), visitOn(2, 13), visitOn(3, 9)]) {
                await world.application('AUDIT_CONFIRMED', { milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: inspector.id, scheduledDate: at });
            }
            return inspector;
        }

        const INSPECTOR_DOORS = [
            ['the calendar', async (inspector, at, extra = {}) => {
                const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
                as(fx.dispatcherA);
                return { row, res: await request(app).post('/api/provider/scheduler/audits/schedules').send({ applicationId: row.id, auditorId: inspector.id, scheduledDate: at.toISOString(), location: 'แปลงทดสอบ', ...extra }) };
            }],
            ['the scheduling queue', async (inspector, at, extra = {}) => {
                const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
                as(fx.dispatcherA);
                return { row, res: await request(app).post('/api/audit/scheduling/assign').send({ applicationId: row.id, auditorId: inspector.id, scheduledDate: at.toISOString(), ...extra }) };
            }],
            ['the inspector swap', async (inspector, at, extra = {}) => {
                const row = await world.application('AUDIT_CONFIRMED', { milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA2.id, scheduledDate: at });
                as(fx.dispatcherA);
                return { row, res: await request(app).post(`/api/audits/reassign/${row.id}/reassign`).send({ newAuditorId: inspector.id, reason: 'ผู้ตรวจเดิมติดราชการ', ...extra }) };
            }],
            ['the reschedule approval', async (inspector, at, extra = {}) => {
                const rescheduleId = `rs-${Math.random().toString(36).slice(2, 10)}`;
                const row = await world.application('AUDIT_CONFIRMED', {
                    milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA2.id, scheduledDate: visitOn(12),
                    formData: { rescheduleRequests: [{ id: rescheduleId, status: 'PENDING', requestedDate: at.toISOString(), reason: 'ผู้ยื่นขอเลื่อน' }] },
                });
                as(fx.dispatcherA);
                return { row, res: await request(app).post(`/api/audit/scheduling/${rescheduleId}/approve`).send({ newDate: at.toISOString(), newAuditor: inspector.id, ...extra }) };
            }],
        ];

        test.each(INSPECTOR_DOORS)('%s: a field inspector with five visits in the next five working days asks for a confirmation; with one the visit is booked', async (_door, assign) => {
            const inspector = await inspectorAtCap();
            const asked = await assign(inspector, visitOn(4));
            expect(asked.res.status).toBe(409);
            expect(asked.res.body.code).toBe('OFFICER_OVER_CAP_CONFIRMATION_REQUIRED');
            expect(asked.res.body.data).toMatchObject({ role: 'field_inspector', load: 5, cap: 5 });
            expect((await world.rowOf(asked.row.id)).auditorId).not.toBe(inspector.id);

            const { row, res } = await assign(inspector, visitOn(4, 13), { overCap: { reasonCode: 'NEAR_A_VISIT_THAT_DAY' } });
            expect(res.status).toBeLessThan(300);
            expect((await world.rowOf(row.id)).auditorId).toBe(inspector.id);
            const [logged] = await auditRowsOf(row.id, 'OFFICER_ASSIGNED_OVER_CAP');
            expect(logged.metadata).toMatchObject({ officerId: inspector.id, role: 'field_inspector', load: 5, cap: 5, reasonCode: 'NEAR_A_VISIT_THAT_DAY' });
        });

        test.each(INSPECTOR_DOORS)('%s: a visit after the five working days is not counted against the cap', async (_door, assign) => {
            const inspector = await inspectorAtCap();
            const { row, res } = await assign(inspector, visitOn(7));
            expect(res.status).toBeLessThan(300);
            expect((await world.rowOf(row.id)).auditorId).toBe(inspector.id);
        });
    });

    describe('2.3 visits per inspector per day', () => {
        test('the dated rule of two a day holds though the environment asks for three', async () => {
            const inspector = await world.staff('field_inspector', fx.orgA);
            for (const hour of [9, 13]) {
                await world.application('AUDIT_CONFIRMED', { milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: inspector.id, scheduledDate: visitOn(10, hour) });
            }
            const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules')
                .send({ applicationId: row.id, auditorId: inspector.id, scheduledDate: visitOn(10, 15.5).toISOString(), location: 'แปลงทดสอบ' });
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('AUDITOR_OVER_CAP');
            expect(res.body.data.cap).toBe(2);

            const from = startOfLocalDay(visitOn(10)).toISOString();
            const to = new Date(startOfLocalDay(visitOn(10)).getTime() + DAY - 1).toISOString();
            const availability = await request(app).get(`/api/audit/scheduling/auditor-availability/${inspector.id}?from=${from}&to=${to}`);
            expect(availability.status).toBe(200);
            expect(availability.body.data.overCapDays).toEqual([expect.objectContaining({ day: getZonedParts(visitOn(10)).isoDate, count: 2 })]);
        });
    });

    describe('3.1 3.2 the dispatcher\'s manual reminder', () => {
        const remind = (row) => request(app).post(`/api/provider/scheduler/applications/${row.id}/send-reminder`).send({});
        const awaiting = async () => {
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/scheduler/dashboard?limit=200');
            expect(res.status).toBe(200);
            return res.body.data.queues.awaitingApplicant.items;
        };

        test.each(['PENDING_AUDIT_FEE', 'DOC_FEE_PAID', 'AUDIT_CONFIRMED'])('is refused for %s, where the applicant has nothing to correct', async (status) => {
            const milestones = { PENDING_AUDIT_FEE: ['M1'], DOC_FEE_PAID: ['M1'], AUDIT_CONFIRMED: ['M1', 'M2'] }[status];
            const row = await world.application(status, { milestones, reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id });
            as(fx.dispatcherA);
            const res = await remind(row);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('REMINDER_NOT_APPLICABLE');
            expect(await noticesOf(fx.applicant.id, row.applicationNumber)).toHaveLength(0);
        });

        test.each([
            ['REVISION_REQUESTED', 'revisionDueAt', ['M1']],
            ['CAR_PENDING', 'carDueAt', ['M1', 'M2']],
        ])('%s: the application is on the dispatcher\'s tab, one reminder goes out per round, and a new round may be reminded again', async (status, dueKey, milestones) => {
            const firstDue = new Date(Date.now() + 3 * DAY);
            const row = await world.application(status, { milestones, reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, formData: { [dueKey]: firstDue.toISOString() } });

            const listed = (await awaiting()).find((item) => item.applicationId === row.id);
            expect(listed).toMatchObject({ correctionDueAt: firstDue.toISOString(), reminderThisRound: null });

            const first = await remind(row);
            expect(first.status).toBe(200);
            const told = await noticesOf(fx.applicant.id, row.applicationNumber);
            expect(told).toHaveLength(1);
            expect(told[0].message).toContain('ภายในวันที่');
            expect(await noticesOf(fx.holderMember.id, row.applicationNumber)).toHaveLength(1);
            expect((await awaiting()).find((item) => item.applicationId === row.id).reminderThisRound).toMatchObject({ sentBy: fx.dispatcherA.id });

            const again = await remind(row);
            expect(again.status).toBe(409);
            expect(again.body.code).toBe('REMINDER_ALREADY_SENT_THIS_ROUND');
            expect(await noticesOf(fx.applicant.id, row.applicationNumber)).toHaveLength(1);

            const stored = (await world.rowOf(row.id)).formData;
            const secondDue = new Date(firstDue.getTime() + 7 * DAY);
            await world.raw.application.update({ where: { id: row.id }, data: { formData: { ...stored, [dueKey]: secondDue.toISOString() } } });
            expect((await awaiting()).find((item) => item.applicationId === row.id).reminderThisRound).toBeNull();
            expect((await remind(row)).status).toBe(200);
            expect(await noticesOf(fx.applicant.id, row.applicationNumber)).toHaveLength(2);
        });

        test('two dispatchers pressing together send one reminder', async () => {
            const row = await world.application('REVISION_REQUESTED', { milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: { revisionDueAt: new Date(Date.now() + 3 * DAY).toISOString() } });
            as(fx.dispatcherA);
            const answers = await Promise.all([remind(row), remind(row)]);
            expect(answers.map((res) => res.status).sort()).toEqual([200, 409]);
            expect(await noticesOf(fx.applicant.id, row.applicationNumber)).toHaveLength(1);
        });
    });

    describe('60(a) moving the field inspector during a correction', () => {
        const swap = (row, body) => request(app).post(`/api/audits/reassign/${row.id}/reassign`).send({ newAuditorId: fx.inspectorA2.id, ...body });

        test.each(['CAR_PENDING', 'CAR_REVIEWING'])('%s: without a listed reason the inspector stays; with one it moves and the reason is logged', async (status) => {
            const row = await world.application(status, {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: workingDaysAgo(3),
            });
            as(fx.dispatcherA);

            const unsaid = await swap(row, { reason: 'ย้ายงาน' });
            expect(unsaid.status).toBe(400);
            expect(unsaid.body.code).toBe('CORRECTION_REASSIGN_REASON_REQUIRED');
            expect(unsaid.body.data.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining(['INSPECTOR_UNAVAILABLE', 'OTHER']));
            const vague = await swap(row, { reasonCode: 'OTHER', reasonText: 'สั้น' });
            expect(vague.status).toBe(400);
            expect(vague.body.code).toBe('ASSIGNMENT_REASON_INVALID');
            expect((await world.rowOf(row.id)).auditorId).toBe(fx.inspectorA.id);

            const moved = await swap(row, { reasonCode: 'OTHER', reasonText: 'ผู้ตรวจเดิมย้ายไปประจำสำนักงานเขตอื่น' });
            expect(moved.status).toBe(200);
            const stored = await world.rowOf(row.id);
            expect(stored.auditorId).toBe(fx.inspectorA2.id);
            expect(stored.formData._reassignmentHistory.at(-1)).toMatchObject({
                reason: 'ผู้ตรวจเดิมย้ายไปประจำสำนักงานเขตอื่น', reasonCode: 'OTHER', reasonText: 'ผู้ตรวจเดิมย้ายไปประจำสำนักงานเขตอื่น',
            });
            const [logged] = await auditRowsOf(row.id, 'INSPECTOR_REASSIGNED_DURING_CORRECTION');
            expect(logged).toMatchObject({ organizationId: fx.orgA, actorId: fx.dispatcherA.id });
            expect(logged.metadata).toMatchObject({ from: fx.inspectorA.id, to: fx.inspectorA2.id, status, reasonCode: 'OTHER' });
        });

        test('the new inspector\'s own visits on the day of a visit already made do not stop the move', async () => {
            const inspector = await world.staff('field_inspector', fx.orgA);
            const visited = workingDaysAgo(5);
            for (const at of [visited, new Date(visited.getTime() + 3 * HOUR)]) {
                await world.application('CAR_REVIEWING', { milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: inspector.id, scheduledDate: at });
            }
            const row = await world.application('CAR_PENDING', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visited,
            });
            as(fx.dispatcherA);
            const res = await request(app).post(`/api/audits/reassign/${row.id}/reassign`)
                .send({ newAuditorId: inspector.id, reasonCode: 'INSPECTOR_UNAVAILABLE' });
            expect(res.status).toBe(200);
            expect((await world.rowOf(row.id)).auditorId).toBe(inspector.id);
        });

        test('before the visit the dispatcher\'s own words are enough, as before', async () => {
            const row = await world.application('AUDIT_CONFIRMED', {
                milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitOn(11),
            });
            as(fx.dispatcherA);
            const res = await swap(row, { reason: 'ผู้ตรวจเดิมติดราชการวันนัด' });
            expect(res.status).toBe(200);
            expect(await auditRowsOf(row.id, 'INSPECTOR_REASSIGNED_DURING_CORRECTION')).toHaveLength(0);
        });
    });
});
