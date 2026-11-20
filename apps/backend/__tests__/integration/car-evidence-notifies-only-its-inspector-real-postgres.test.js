/**
 * ผู้ยื่นส่งหลักฐานแก้ CAR แล้ว แจ้งเฉพาะผู้ตรวจพื้นที่ของคำขอนั้น (real Postgres)
 *
 * D2 (audit 2026-10-07): ประตู POST /api/applications/:id/car แจ้งผู้ตรวจพื้นที่ทุกคนทุกองค์กร
 * (listActiveProviders ไม่มีตัวกรอง) ขัดคำสั่ง 17 และ 29 (หลักฐาน CAR พิจารณาโดยผู้ตรวจพื้นที่คนเดิม)
 */

'use strict';

const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { stageCarFile, carRoundFiles } = require('../../test-support/car-staged-file');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');
const { filedFormData, grantFilingConsents, dropFilingConsents } = require('../../test-support/filed-application');

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

d('หลักฐาน CAR แจ้งเฉพาะผู้ตรวจพื้นที่ของคำขอ (real Postgres)', () => {
    let raw;
    let fx;
    let app;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'car2');
        await grantFilingConsents(raw, { userIds: [fx.applicant.id], organizationId: fx.orgId });
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications-car'));
    });

    afterAll(async () => {
        await raw.correctionSubmissionVersion?.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await dropFilingConsents(raw, [fx.applicant.id]);
        await fx.cleanup();
        await raw.$disconnect();
    });

    async function carPending(auditorId) {
        const due = new Date(Date.now() + 5 * 86400000).toISOString();
        const application = await fx.makeApplication({
            status: 'CAR_PENDING', auditorId, reviewerId: fx.reviewer.id,
            formData: filedFormData({ workflowState: 'CAR_PENDING', carDueAt: due }),
        });
        await fx.settle(application.id, 'M1');
        await fx.settle(application.id, 'M2');
        return application;
    }

    const postCar = async (application) => {
        mockActor.current = { id: fx.applicant.id, role: 'health', canonicalRole: 'health', organizationId: fx.orgId };
        const staged = [await stageCarFile(raw, application.id)];
        return request(app).post(`/api/applications/${application.id}/car`)
            .send({ notes: 'แก้ป้ายแปลงแล้ว', files: carRoundFiles(staged) });
    };

    test('แจ้งผู้ตรวจพื้นที่ของคำขอคนเดียว · ผู้ตรวจพื้นที่คนอื่นทั้งในและนอกองค์กรไม่ได้รับ', async () => {
        const application = await carPending(fx.inspector.id);
        const res = await postCar(application);
        expect(res.status).toBe(200);
        const got = await raw.notification.findMany({
            where: { type: 'CAR_REVIEWING', metadata: { path: ['applicationId'], equals: application.id } },
            select: { userId: true },
        });
        expect(got.map((r) => r.userId)).toEqual([fx.inspector.id]);
    });

    test('คำขอที่ไม่มีผู้ตรวจพื้นที่ ไม่แจ้งใครเลย (ไม่กระจายหาทุกคน)', async () => {
        const application = await carPending(null);
        const res = await postCar(application);
        expect(res.status).toBe(200);
        const count = await raw.notification.count({
            where: { type: 'CAR_REVIEWING', metadata: { path: ['applicationId'], equals: application.id } },
        });
        expect(count).toBe(0);
    });
});
