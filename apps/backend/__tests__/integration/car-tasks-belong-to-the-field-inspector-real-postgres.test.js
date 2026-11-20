/**
 * งานแก้ข้อบกพร่องหลังตรวจ (CAR task) เป็นของผู้ตรวจพื้นที่คนที่ตรวจแปลงนั้น ผู้ตรวจเอกสารแตะไม่ได้ (real Postgres)
 *
 * คำสั่ง 27 (operator 2026-10-06): ผู้ตรวจพื้นที่กับผู้ตรวจเอกสารแยกบทบาทกัน · คำสั่ง 29 (2026-10-07):
 * หลักฐานแก้ข้อบกพร่องพิจารณาโดยผู้ตรวจพื้นที่คนเดิม · เดิมประตูเขียนของ /api/post-audit เปิดให้กลุ่ม
 * REVIEWERS ซึ่งรวมทั้งผู้ตรวจเอกสารและผู้ตรวจพื้นที่ไว้ด้วยกัน
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

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

d('งาน CAR หลังตรวจ: เฉพาะผู้ตรวจพื้นที่ของคำขอ (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], appIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };

    async function staff(role) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `car-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `car-${seq}-${sfx}`, email: `car-${seq}-${sfx}@example.test`,
                firstName: `เจ้าหน้าที่${seq}`, lastName: role, organizationId: fx.orgId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId: fx.orgId };
    }

    const taskOf = (id) => raw.postAuditTask.findUnique({ where: { id }, select: { status: true } });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgId = (await raw.organization.create({ data: { name: `car-${sfx}`, slug: `car-${sfx}`, code: `CAR_${sfx}`.toUpperCase() } })).id;
        fx.reviewer = await staff('document_reviewer');
        fx.inspector = await staff('field_inspector');
        const applicantId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: `car-app-${sfx}`, healthId: `car-app-${sfx}`, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `car-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgId,
            },
        });
        fx.userIds.push(applicantId);
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-CAR-${sfx}`, healthId: `car-app-${sfx}`, areaType: 'OUTDOOR',
                organizationId: fx.orgId, submitterId: applicantId, status: 'CAR_PENDING', reviewerId: fx.reviewer.id, auditorId: fx.inspector.id,
                formData: { workflowState: 'CAR_PENDING' },
            },
        });
        fx.appIds.push(row.id);
        fx.application = row;
        fx.task = await raw.postAuditTask.create({
            data: { applicationId: row.id, description: 'แก้ป้ายแปลง', dueDate: new Date('2026-12-01'), organizationId: fx.orgId },
        });

        app = express();
        app.use(express.json());
        app.use('/api/post-audit', require('../../routes/api/audit/post-audit'));
    });

    afterAll(async () => {
        await raw.postAuditTask.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await raw.attachment?.deleteMany({ where: { resModel: 'PostAuditTask', organizationId: fx.orgId } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: fx.appIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    test('ผู้ตรวจเอกสารของคำขอเดียวกัน: สร้าง แก้สถานะ แนบไฟล์งาน CAR ไม่ได้', async () => {
        as(fx.reviewer);
        const created = await request(app).post('/api/post-audit/tasks')
            .send({ applicationId: fx.application.id, description: 'งานใหม่', dueDate: '2026-12-02' });
        expect(created.status).toBe(403);
        const updated = await request(app).put(`/api/post-audit/tasks/${fx.task.id}`).send({ status: 'COMPLETED' });
        expect(updated.status).toBe(403);
        const uploaded = await request(app).post(`/api/post-audit/tasks/${fx.task.id}/upload`)
            .attach('files', Buffer.from('%PDF-1.4'), 'evidence.pdf');
        expect(uploaded.status).toBe(403);
        expect(await taskOf(fx.task.id)).toEqual({ status: 'PENDING' });
        expect(await raw.postAuditTask.count({ where: { applicationId: fx.application.id } })).toBe(1);
    });

    test('ผู้ตรวจพื้นที่ของคำขอ: แก้สถานะงาน CAR ได้', async () => {
        as(fx.inspector);
        const res = await request(app).put(`/api/post-audit/tasks/${fx.task.id}`).send({ status: 'IN_PROGRESS' });
        expect(res.status).toBe(200);
        expect(await taskOf(fx.task.id)).toEqual({ status: 'IN_PROGRESS' });
    });
});
