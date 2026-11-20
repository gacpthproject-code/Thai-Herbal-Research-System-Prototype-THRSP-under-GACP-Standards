'use strict';

/**
 * คำสั่ง 138: งานกวาดไฟล์ CAR ที่ไม่ได้ส่งอ่านกำหนดส่งล่าสุดของรอบตอนที่รัน และหน้าอัปโหลดบอกผู้ยื่นว่าไฟล์จะถูกลบเมื่อไร
 * จากฟังก์ชันเดียวกับที่งานกวาดใช้
 *
 * ไม่มีประตูใดต่อกำหนดส่ง CAR ในที่เดิม (คำสั่ง 28, 32 · no-door-extends-the-revision-deadline.test.js)
 * ประตูเดียวที่เลื่อน carDueAt ของคำขอที่ยังถือไฟล์ค้างออกไปคือการอนุโลมเปิดคำขอที่หมดเวลาแล้ว
 * (POST /api/provider/waiver-reopen/.../approve) เทสต์นี้เดินผ่านประตูนั้นจริง
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');
const { filedFormData, grantFilingConsents, dropFilingConsents } = require('../../test-support/filed-application');
const { CAR_DIR } = require('../../test-support/car-staged-file');

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

const DAY = 86400000;
const HOUR = 3600000;
const shifted = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();

d('งานกวาดไฟล์ CAR ที่ไม่ได้ส่งใช้กำหนดส่งล่าสุดของรอบ (real Postgres, ประตูจริง)', () => {
    let raw;
    let fx;
    let app;
    let finance;
    let runCarStagedFilesSweep;
    let runCorrectionDeadlineSweep;
    const flagBefore = process.env.CAR_UNSENT_SWEEP_ENABLED;

    beforeAll(async () => {
        process.env.CAR_UNSENT_SWEEP_ENABLED = 'true';
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'carlate');
        await grantFilingConsents(raw, { userIds: [fx.applicant.id], organizationId: fx.orgId });
        const key = `carlate-fin-${crypto.randomUUID().slice(0, 8)}`;
        finance = await raw.user.create({
            data: {
                id: crypto.randomUUID(), canonicalId: key, providerId: key, password: 'x', role: 'finance_officer_platform',
                authType: 'PROVIDER_ID', accountType: 'PROVIDER', email: `${key}@example.test`, firstName: 'การเงิน',
                lastName: 'ทดสอบ', organizationId: fx.orgId, status: 'ACTIVE',
            },
        });
        fx.userIds.push(finance.id);
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications-car'));
        app.use('/api/applications', require('../../routes/api/applications/application-workflow-handlers'));
        app.use('/api/provider/waiver-reopen', require('../../routes/api/provider/waiver-reopen'));
        ({ runCarStagedFilesSweep } = require('../../services/car-staged-files-sweep'));
        ({ runCorrectionDeadlineSweep } = require('../../jobs/correction-deadline-sweep'));
    }, 120000);

    afterAll(async () => {
        if (flagBefore === undefined) { delete process.env.CAR_UNSENT_SWEEP_ENABLED; } else { process.env.CAR_UNSENT_SWEEP_ENABLED = flagBefore; }
        await raw.waiverReopenRequest.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await dropFilingConsents(raw, [fx.applicant.id]);
        await fx.cleanup();
        await raw.$disconnect();
    });

    const asApplicant = () => { mockActor.current = { id: fx.applicant.id, role: 'health', canonicalRole: 'health', organizationId: fx.orgId }; };
    const as = (user) => { mockActor.current = { id: user.id, role: user.role, canonicalRole: user.role, organizationId: fx.orgId }; };
    const formDataOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { formData: true } })).formData;
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;
    const stored = (entry) => fs.existsSync(path.join(CAR_DIR, entry.id));
    const metadataOf = (row) => (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata);
    const deletionsOf = async (id) => (await raw.auditLog.findMany({ where: { action: 'CAR_UNSENT_FILE_DELETED' } }))
        .filter((row) => metadataOf(row).applicationId === id);
    const shownDeletion = async (id) => {
        asApplicant();
        const res = await request(app).get(`/api/applications/${id}`);
        expect(res.status).toBe(200);
        return res.body.data.carRound.stagedFiles.map((file) => file.deletesAt);
    };

    async function carRoundDueTomorrow() {
        const requestedAt = new Date(Date.now() - HOUR).toISOString();
        const application = await fx.makeApplication({
            status: 'CAR_PENDING', auditorId: fx.inspector.id, reviewerId: fx.reviewer.id,
            formData: filedFormData({
                workflowState: 'CAR_PENDING',
                carRequestedAt: requestedAt,
                carDueAt: new Date(Date.now() + DAY).toISOString(),
                carRequest: { message: null, requestedAt, items: [{ nonConformity: 'ป้ายแปลงไม่ครบ', correctiveAction: 'ติดป้าย' }] },
            }),
        });
        await fx.settle(application.id, 'M1');
        await fx.settle(application.id, 'M2');
        return application;
    }

    async function upload(application) {
        asApplicant();
        const res = await request(app).post(`/api/applications/${application.id}/car/files`)
            .field('findingNo', '1')
            .attach('file', Buffer.from(`%PDF-1.4\n% ${crypto.randomUUID()}\n${'%'.repeat(4096)}\n%%EOF\n`), { filename: 'หลักฐาน.pdf', contentType: 'application/pdf' });
        expect(res.status).toBe(200);
        return res.body.data.file;
    }

    test('กำหนดส่งเลื่อนออกหลังอัปโหลด: งานกวาดใช้กำหนดใหม่ ไฟล์อยู่ต่อระหว่างกำหนดเดิมกับกำหนดใหม่ และหน้าอัปโหลดแสดงวันลบใหม่', async () => {
        const application = await carRoundDueTomorrow();
        const file = await upload(application);
        const d1 = (await formDataOf(application.id)).carDueAt;
        expect(file.deletesAt).toBe(new Date(d1).toISOString());
        expect(await shownDeletion(application.id)).toEqual([new Date(d1).toISOString()]);

        const { uploadedAt } = (await formDataOf(application.id)).carStagedFiles[0];
        const afterD1 = Date.parse(d1) + HOUR;
        await runCorrectionDeadlineSweep({ now: new Date(afterD1) });
        expect(await statusOf(application.id)).toBe('EXPIRED');
        expect(stored(file)).toBe(true);

        as(fx.inspector);
        const asked = await request(app).post(`/api/provider/waiver-reopen/applications/${application.id}/requests`)
            .send({ reason: 'โทรหาผู้ยื่นแล้ว ผู้ยื่นแจ้งว่ารอผลแก้ไขป้ายแปลงจากผู้รับเหมา' });
        expect(asked.status).toBe(201);
        as(finance);
        const approved = await request(app).post(`/api/provider/waiver-reopen/requests/${asked.body.data.requestId}/approve`).send({ note: 'อนุโลม' });
        expect(approved.status).toBe(200);
        expect(approved.body.data.reopenedTo).toBe('CAR_PENDING');
        const d2 = approved.body.data.dueAt;
        expect((await formDataOf(application.id)).carDueAt).toBe(d2);
        const sevenDays = shifted(uploadedAt, 7 * DAY);
        expect(Date.parse(sevenDays)).toBeLessThan(Date.parse(d2));

        expect(await shownDeletion(application.id)).toEqual([sevenDays]);

        await runCarStagedFilesSweep({ prisma: raw, now: new Date(afterD1 + HOUR) });
        expect(stored(file)).toBe(true);
        expect((await formDataOf(application.id)).carStagedFiles.map((entry) => entry.id)).toEqual([file.id]);
        expect(await deletionsOf(application.id)).toEqual([]);

        await runCarStagedFilesSweep({ prisma: raw, now: new Date(Date.parse(sevenDays) + 60000) });
        expect(stored(file)).toBe(false);
        expect((await formDataOf(application.id)).carStagedFiles).toEqual([]);
        expect((await deletionsOf(application.id)).map((row) => [row.resourceId, metadataOf(row).reason, metadataOf(row).roundId]))
            .toEqual([[file.id, '7days', new Date(d2).toISOString()]]);
    });

    test('ก่อน operator เปิด CAR_UNSENT_SWEEP_ENABLED หน้าอัปโหลดไม่บอกวันลบ เพราะงานกวาดยังไม่ลบอะไร', async () => {
        const application = await carRoundDueTomorrow();
        process.env.CAR_UNSENT_SWEEP_ENABLED = '';
        try {
            const file = await upload(application);
            expect(file.deletesAt).toBeNull();
            expect(await shownDeletion(application.id)).toEqual([null]);
        } finally {
            process.env.CAR_UNSENT_SWEEP_ENABLED = 'true';
        }
    });
});
