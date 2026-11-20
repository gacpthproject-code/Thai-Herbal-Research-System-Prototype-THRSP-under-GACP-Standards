/**
 * Operator order 65(1), 2026-10-09: the reason the dispatcher records for a late visit or for moving
 * the field inspector during a correction carries its responsible side, the applicant reads it in
 * Thai on the application page, and a move for conflict of interest flags the file the certificate
 * approver decides on. The record it is read from cannot be written by the applicant. Real doors,
 * real Postgres.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');

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
jest.mock('../../middleware/consent-manager', () => {
    const actual = jest.requireActual('../../middleware/consent-manager');
    return { ...actual, requireConsent: (req, res, next) => next() };
});

const DAY = 24 * 60 * 60 * 1000;

d('the dispatcher\'s recorded reasons reach the applicant and the approver (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };
    const asApplicant = () => as({
        id: fx.applicant.id, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId,
        role: 'health', canonicalRole: 'health', organizationId: fx.orgA,
    });

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'reasons' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        app.use('/api/audits/reassign', require('../../routes/api/audit/audits-reassign'));
    });
    afterAll(async () => { await world.cleanup(); });

    const recordedReasonsOf = async (applicationId) => {
        asApplicant();
        const res = await request(app).get(`/api/applications/${applicationId}`);
        expect(res.status).toBe(200);
        return res.body.data.recordedReasons;
    };

    test('a visit booked after the date the company must inspect by: the applicant reads why, and whose side the delay is', async () => {
        const row = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id });
        await world.raw.checkoutOrder.updateMany({
            where: { applicationId: row.id, milestone: 'M2' },
            data: { settledAt: new Date(Date.now() - 200 * DAY), paymentTermsVersion: 'payment-terms-th-v1.3' },
        });
        as(fx.dispatcherA);
        const booking = { applicationId: row.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot().toISOString(), location: 'แปลงทดสอบ' };
        const unstated = await request(app).post('/api/provider/scheduler/audits/schedules').send(booking);
        expect([unstated.status, unstated.body.code]).toEqual([409, 'LATE_VISIT_REASON_REQUIRED']);
        const booked = await request(app).post('/api/provider/scheduler/audits/schedules').send({ ...booking, lateVisit: { reasonCode: 'NO_INSPECTOR_AVAILABLE' } });
        expect(booked.status).toBe(201);

        expect(await recordedReasonsOf(row.id)).toEqual([expect.objectContaining({
            kind: 'LATE_VISIT', kindLabel: 'นัดตรวจพื้นที่หลังวันที่ต้องตรวจภายใน',
            label: 'ไม่มีผู้ตรวจพื้นที่ว่างก่อนกำหนด', side: 'INSPECTION_BODY', sideLabel: 'หน่วยตรวจ',
        })]);
    });

    test('an inspector moved for conflict of interest during a correction: the applicant reads why, and the approver\'s file is flagged', async () => {
        const row = await world.application('CAR_PENDING', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(Date.now() - 3 * DAY),
            formData: { carDueAt: new Date(Date.now() + 20 * DAY).toISOString() },
        });
        as(fx.dispatcherA);
        const moved = await request(app).post(`/api/audits/reassign/${row.id}/reassign`).send({ newAuditorId: fx.inspectorA2.id, reasonCode: 'CONFLICT_OF_INTEREST' });
        expect(moved.status).toBe(200);

        expect(await recordedReasonsOf(row.id)).toEqual([expect.objectContaining({
            kind: 'INSPECTOR_CHANGED', kindLabel: 'เปลี่ยนผู้ตรวจพื้นที่ระหว่างแก้ไขข้อบกพร่อง',
            label: 'พบว่าผู้ตรวจพื้นที่คนเดิมมีส่วนได้เสียกับผู้ยื่นหรือสถานที่ปลูก', side: 'INSPECTION_BODY', sideLabel: 'หน่วยตรวจ',
        })]);

        await world.raw.application.update({ where: { id: row.id }, data: { status: 'AUDIT_PASSED' } });
        as(fx.approverA);
        const file = await request(app).get(`/api/provider/auditor/applications/${row.id}/decision-file`);
        expect(file.status).toBe(200);
        expect(file.body.data.impartialityFlags).toEqual([expect.objectContaining({
            reasonCode: 'CONFLICT_OF_INTEREST', label: 'พบว่าผู้ตรวจพื้นที่คนเดิมมีส่วนได้เสียกับผู้ยื่นหรือสถานที่ปลูก',
        })]);
    });

    test('a move for any other reason flags nothing, and an "อื่น ๆ" reason reads as the dispatcher\'s words, not yet assigned to a side', async () => {
        const row = await world.application('CAR_PENDING', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(Date.now() - 3 * DAY),
        });
        as(fx.dispatcherA);
        const moved = await request(app).post(`/api/audits/reassign/${row.id}/reassign`)
            .send({ newAuditorId: fx.inspectorA2.id, reasonCode: 'OTHER', reasonText: 'ผู้ตรวจเดิมย้ายไปประจำอีกจังหวัดหนึ่ง' });
        expect(moved.status).toBe(200);
        expect(await recordedReasonsOf(row.id)).toEqual([expect.objectContaining({
            kind: 'INSPECTOR_CHANGED', label: 'ผู้ตรวจเดิมย้ายไปประจำอีกจังหวัดหนึ่ง', side: 'UNASSIGNED', sideLabel: 'ยังไม่จัดฝ่าย',
        })]);
        await world.raw.application.update({ where: { id: row.id }, data: { status: 'AUDIT_PASSED' } });
        as(fx.approverA);
        expect((await request(app).get(`/api/provider/auditor/applications/${row.id}/decision-file`)).body.data.impartialityFlags).toEqual([]);
    });

    test('the applicant cannot rewrite the reassignment record the flag and the reason are read from', async () => {
        const row = await world.application('CAR_PENDING', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(Date.now() - 3 * DAY),
        });
        as(fx.dispatcherA);
        expect((await request(app).post(`/api/audits/reassign/${row.id}/reassign`).send({ newAuditorId: fx.inspectorA2.id, reasonCode: 'CONFLICT_OF_INTEREST' })).status).toBe(200);
        asApplicant();
        // /prepare lays the body over the filing, all but the server-owned keys.
        const saved = await request(app).post('/api/applications/prepare').send({ applicationId: row.id, _reassignmentHistory: [] });
        expect(saved.status).toBe(200);
        const history = (await world.rowOf(row.id)).formData._reassignmentHistory;
        expect(history).toEqual([expect.objectContaining({ reasonCode: 'CONFLICT_OF_INTEREST' })]);
    });
});
