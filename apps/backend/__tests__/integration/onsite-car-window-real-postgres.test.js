/**
 * A defect found on site gives the applicant 30 calendar days to send the corrective evidence,
 * whichever door the field inspector records it through (operator order 56(2a), 2026-10-09). The
 * 5-working-day window of order 28 stays for document revisions. Real Postgres.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');
const { getZonedParts, startOfLocalCalendarDay, endOfLocalDay } = require('../../utils/working-days');

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

/** The end of the Bangkok day 30 calendar days after the Bangkok day of `at`, independently of the code under test. */
function thirtyDaysAfter(at) {
    const { year, month, day } = getZonedParts(at);
    return endOfLocalDay(startOfLocalCalendarDay(year, month, day + 30)).toISOString();
}

d('the on-site corrective-action window (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'ocw' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        app.use('/api/audit/onsite', require('../../routes/api/audit/onsite'));
        app.use('/api/audits/reassign', require('../../routes/api/audit/audits-reassign'));
    });

    afterAll(async () => { await world.cleanup(); });

    async function bookedVisit() {
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
        as(fx.dispatcherA);
        const booked = await request(app).post('/api/provider/scheduler/audits/schedules').send({
            applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot().toISOString(), location: 'แปลงทดสอบ',
        });
        expect(booked.status).toBe(201);
        const audit = await world.raw.auditChecklist.findFirst({ where: { applicationId: row.id, status: 'IN_PROGRESS' }, select: { id: true } });
        return { row, auditId: audit.id };
    }

    async function expectThirtyDays(applicationId, decidedFrom, decidedTo) {
        const stored = await world.rowOf(applicationId);
        expect(stored.status).toBe('CAR_PENDING');
        expect([thirtyDaysAfter(decidedFrom), thirtyDaysAfter(decidedTo)]).toContain(stored.formData.carDueAt);
        const deadline = await world.raw.revisionDeadline.findUnique({ where: { applicationId } });
        if (deadline) { expect(deadline.revisionDue.toISOString()).toBe(stored.formData.carDueAt); }
        return stored.formData.carDueAt;
    }

    test.each([
        ['the field app decision', async ({ row, auditId }) => request(app).post(`/api/audit/onsite/${auditId}/decision`).send({ decision: 'MAJOR', summary: 'ไม่มีบันทึกการใช้ปุ๋ย', findings: [{ nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ย', correctiveAction: 'จัดทำสมุดบันทึก' }] })],
        ['the inspector\'s decision page', async ({ row }) => request(app).post(`/api/provider/auditor/applications/${row.id}/audit-decisions`).send({ decision: 'MAJOR', notes: 'โรงเก็บไม่มีประตู' })],
        ['the workflow transition door', async ({ row }) => request(app).post(`/api/provider/applications/${row.id}/workflow-transitions`).send({ toState: 'CAR_PENDING', comment: 'ไม่มีบันทึกการใช้ปุ๋ย' })],
    ])('a defect recorded through %s is due 30 calendar days later, at the end of that Bangkok day', async (_door, decide) => {
        const visit = await bookedVisit();
        as(fx.inspectorA);
        const decidedFrom = new Date();
        const res = await decide(visit);
        const decidedTo = new Date();
        expect(res.status).toBeLessThan(300);
        await expectThirtyDays(visit.row.id, decidedFrom, decidedTo);
    });

    test('the applicant and the holder are told the 30-day window when an overdue correction is closed', async () => {
        // Asked for under the 30-day rule; the deadline is set in the past so the close can run now.
        const askedAt = new Date(Date.now() - 60 * 60 * 1000);
        const row = await world.application('CAR_PENDING', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id,
            formData: { carRequestedAt: askedAt.toISOString(), carDueAt: new Date(Date.now() - 60 * 1000).toISOString() },
        });
        const { expireOverdue } = require('../../jobs/correction-deadline-sweep');
        const read = await world.raw.application.findUnique({
            where: { id: row.id },
            select: { id: true, applicationNumber: true, status: true, version: true, organizationId: true, formData: true, workflowHistory: true },
        });
        const { runWithTenantContext } = require('../../services/tenant-context');
        await runWithTenantContext({ organizationId: fx.orgA }, () => expireOverdue(read));
        expect((await world.rowOf(row.id)).status).toBe('EXPIRED');
        const notices = await world.raw.notification.findMany({ where: { userId: { in: [fx.applicant.id, fx.holderMember.id] }, message: { contains: row.applicationNumber } } });
        const told = notices.map((n) => JSON.stringify(n.data || {}) + n.message).join(' ');
        expect(told).toContain('30 วัน');
        expect(told).not.toContain('5 วันทำการ');
    });
});
