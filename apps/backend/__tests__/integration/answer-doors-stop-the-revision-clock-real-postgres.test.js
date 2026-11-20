/**
 * นาฬิกาแก้ไขของคำสั่ง 28 คือแถว revision_deadlines ที่ cron รายชั่วโมงอ่านแล้วยกเลิกคำขอที่เลยกำหนด
 * ประตูตัวตนและความยินยอมพิสูจน์ที่อื่น ที่นี่สวมผู้ยื่นเข้าไปตรง ๆ แล้วผูกบริบทองค์กรของจริง
 */

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { stageCarFile, carRoundFiles } = require('../../test-support/car-staged-file');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');
const { addWorkingDays } = require('../../utils/working-days');
const { writeApplicationStatus } = require('../../services/application-status-writer');
const { checkExpiredDeadlines } = require('../../jobs/revision-deadline-checker');

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
jest.mock('../../middleware/consent-manager', () => ({
    ...jest.requireActual('../../middleware/consent-manager'),
    requireConsent: (_req, _res, next) => next(),
}));

const STAMP = { serverRequirementSnapshot: { slotIds: ['land_rights'], rules: [] } };
const completeFormData = () => ({
    plantId: 'cannabis', serviceType: 'NEW', certificationPurposes: ['EXPORT'], locationType: 'OUTDOOR',
    cultivationMethods: ['outdoor'], consentedPDPA: true, acknowledgedStandards: true,
    applicantData: {
        applicantType: 'JURISTIC', companyName: 'บริษัท ทดสอบนาฬิกาแก้ไข จำกัด', registrationNumber: '0105560000001',
        directorName: 'สมชาย ใจดี', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '1100000000008',
        phone: '0812345678', email: 'somchai@example.com', address: '123 หมู่ 4',
    },
    farmData: {
        farmName: 'ฟาร์มสมชาย', address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
        subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai',
        landOwnership: 'OWN', gpsLat: '13.12', gpsLng: '100.65',
        siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
    },
    plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
    productionData: { propagationType: ['SEED'], plantParts: ['FLOWER'] },
    harvestData: { harvestMethod: 'MANUAL', dryingMethod: 'SUN', storageSystem: 'AMBIENT' },
    documents: [{ name: 'doc.pdf', url: '/uploads/doc.pdf', type: 'LAND_RIGHT' }],
});

const DOORS = [
    ['POST /:id/revision-resubmit', 'resubmit', 'REVISION_REQUESTED', 'ASSIGNED_FOR_REVIEW'],
    ['POST /submit from REVISION_REQUESTED', 'submit', 'REVISION_REQUESTED', 'ASSIGNED_FOR_REVIEW'],
    ['POST /:id/car', 'car', 'CAR_PENDING', 'CAR_REVIEWING'],
];

d('ประตูตอบคำขอแก้ไขทุกบาน หยุดนาฬิกาในธุรกรรมเดียวกับสถานะ (real Postgres)', () => {
    let raw;
    let fx;
    let app;
    const carDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'car');
    const carFilesBefore = new Set();

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'rl2');
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/revision-resubmit'));
        app.use('/api/applications', require('../../routes/api/applications/applications-car'));
        app.use('/api/applications', require('../../routes/api/applications/application-workflow-handlers'));
        app.use('/api/applications', require('../../routes/api/applications/applications'));
        if (fs.existsSync(carDir)) { for (const f of fs.readdirSync(carDir)) { carFilesBefore.add(f); } }
    });

    afterAll(async () => {
        if (fs.existsSync(carDir)) {
            for (const f of fs.readdirSync(carDir)) {
                if (!carFilesBefore.has(f)) { fs.rmSync(path.join(carDir, f), { force: true }); }
            }
        }
        const apps = { applicationId: { in: fx.appIds } };
        for (const model of ['correctionSubmissionVersion', 'applicationDocumentReview', 'applicationDocument']) {
            await raw[model].deleteMany({ where: apps }).catch(() => {});
        }
        await fx.cleanup();
        await raw.$disconnect();
    });

    const asApplicant = () => {
        mockActor.current = { id: fx.applicant.id, role: 'health', canonicalRole: 'health', organizationId: fx.orgId };
    };
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;
    const clockOf = (id) => raw.revisionDeadline.findUnique({ where: { applicationId: id } });

    async function filingAwaitingAnswer(status, { dueAt = addWorkingDays(new Date(), 3) } = {}) {
        const askedAt = new Date(Date.now() - 3600e3);
        const clock = status === 'CAR_PENDING'
            ? { carDueAt: dueAt.toISOString() }
            : { revisionDueAt: dueAt.toISOString(), revision_due_at: dueAt.toISOString() };
        const row = await fx.makeApplication({
            status, reviewerId: fx.reviewer.id, auditorId: status === 'CAR_PENDING' ? fx.inspector.id : null,
            formData: {
                plantId: 'cannabis', workflowState: status, ...completeFormData(), ...STAMP,
                declarationsAcceptedAt: askedAt.toISOString(), ...clock,
            },
        });
        await fx.settle(row.id, 'M1');
        if (status === 'CAR_PENDING') { await fx.settle(row.id, 'M2'); }
        if (status === 'REVISION_REQUESTED') {
            await raw.applicationDocumentReview.create({
                data: {
                    applicationId: row.id, slotId: 'land_rights', verdict: 'MORE_REQUESTED', reason: 'ภาพโฉนดไม่ชัด กรุณาแนบใหม่',
                    dueDate: dueAt, reviewerId: fx.reviewer.id, round: 1, organizationId: fx.orgId, createdAt: askedAt,
                },
            });
        }
        await raw.applicationDocument.create({
            data: {
                applicationId: row.id, documentType: 'LAND_RIGHTS', slotId: 'land_rights', fileName: 'land-fixed.pdf',
                fileUrl: `/uploads/rl2/${row.id.slice(0, 8)}/land-fixed.pdf`, currentForSlot: 'LAND_RIGHTS', uploadedBy: fx.applicant.id,
            },
        });
        await raw.revisionDeadline.create({
            data: { applicationId: row.id, organizationId: fx.orgId, revisionDue: dueAt, status: 'PENDING', revisionCount: 1, createdBy: fx.reviewer.id },
        });
        return row.id;
    }

    const doors = {
        resubmit: (id) => request(app).post(`/api/applications/${id}/revision-resubmit`).send({}),
        submit: (id) => request(app).post('/api/applications/submit').send({ applicationId: id }),
        car: async (id) => {
            const staged = [await stageCarFile(raw, id)];
            return request(app).post(`/api/applications/${id}/car`).send({ notes: 'แก้ป้ายแปลงแล้ว', files: carRoundFiles(staged) });
        },
    };

    async function withClockRefusingToStop(applicationId, run) {
        if (!/^[0-9a-f-]{36}$/.test(applicationId)) { throw new Error('applicationId must be a uuid'); }
        const name = `rl2_refuse_${applicationId.replace(/-/g, '').slice(0, 12)}`;
        await raw.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'rl2: the revision clock refuses to stop'; END $$ LANGUAGE plpgsql`);
        await raw.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE UPDATE ON revision_deadlines FOR EACH ROW WHEN (NEW.status = 'SUBMITTED' AND NEW."applicationId" = '${applicationId}') EXECUTE FUNCTION ${name}()`);
        try {
            return await run();
        } finally {
            await raw.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON revision_deadlines`);
            await raw.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`);
        }
    }

    test.each(DOORS)('%s: ตอบแล้ว แถว revision_deadlines เป็น SUBMITTED โดยผู้ยื่น', async (_label, door, from, to) => {
        const id = await filingAwaitingAnswer(from);
        asApplicant();
        const res = await doors[door](id);
        expect([res.status, res.body.code || res.body.error]).toEqual([200, undefined]);
        expect(await statusOf(id)).toBe(to);
        const clock = await clockOf(id);
        expect([clock.status, clock.submittedBy]).toEqual(['SUBMITTED', fx.applicant.id]);
        expect(clock.submittedAt).toBeInstanceOf(Date);
    });

    test.each(DOORS)('%s: ถ้านาฬิกาหยุดไม่ได้ สถานะไม่ขยับ และกดซ้ำได้เมื่อหายขัดข้อง', async (_label, door, from, to) => {
        const id = await filingAwaitingAnswer(from);
        asApplicant();
        const refused = await withClockRefusingToStop(id, () => doors[door](id));
        expect(refused.status).toBe(500);
        expect(await statusOf(id)).toBe(from);
        expect((await clockOf(id)).status).toBe('PENDING');

        const retry = await doors[door](id);
        expect([retry.status, retry.body.code || retry.body.error]).toEqual([200, undefined]);
        expect(await statusOf(id)).toBe(to);
        expect((await clockOf(id)).status).toBe('SUBMITTED');
    });

    test('POST /submit จาก CAR_PENDING ไม่ใช่ประตูแล้ว (หลักฐานการแก้ไขยื่นที่ /:id/car): 409 สถานะไม่ขยับ และนาฬิกายังเดิน', async () => {
        const id = await filingAwaitingAnswer('CAR_PENDING');
        asApplicant();
        const res = await doors.submit(id);
        expect([res.status, res.body.error]).toEqual([409, 'INVALID_STATUS_FOR_SUBMIT']);
        expect(await statusOf(id)).toBe('CAR_PENDING');
        expect((await clockOf(id)).status).toBe('PENDING');
    });

    test('PUT /:id/revision ไม่ใช่ประตูแล้ว: 404 สถานะไม่ขยับ และนาฬิกายังเดิน', async () => {
        const id = await filingAwaitingAnswer('REVISION_REQUESTED');
        asApplicant();
        const res = await request(app).put(`/api/applications/${id}/revision`).send({ formData: completeFormData(), notes: 'แก้ไขแล้ว' });
        expect(res.status).toBe(404);
        expect(await statusOf(id)).toBe('REVISION_REQUESTED');
        expect((await clockOf(id)).status).toBe('PENDING');
    });

    test('POST /:id/revision-resubmit: ตอบหลังเลยกำหนด = ถูกปฏิเสธอย่างที่ /submit ปฏิเสธ คำขอถูกยกเลิก และนาฬิกาบันทึกว่าพลาด (คำสั่ง 28)', async () => {
        const id = await filingAwaitingAnswer('REVISION_REQUESTED', { dueAt: new Date(Date.now() - 3600e3) });
        asApplicant();
        const res = await doors.resubmit(id);
        expect([res.status, res.body.code]).toEqual([400, 'REVISION_DEADLINE_EXCEEDED']);
        expect(await statusOf(id)).toBe('EXPIRED');
        expect((await clockOf(id)).status).toBe('FAILED');
    });

    const queuedBehind = async (pid) => (await raw.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`)[0].n;
    async function untilQueuedBehind(pid) {
        const end = Date.now() + 10000;
        while (Date.now() < end) {
            if (await queuedBehind(pid) > 0) { return; }
            await new Promise((resolve) => { setTimeout(resolve, 25); });
        }
        throw new Error('the checker never queued behind the answer');
    }

    test('คำตอบกับ cron หมดเวลาแก้ไขชนกันที่คำขอเดียว: cron รอแถวคำขอโดยยังไม่จับแถวนาฬิกา คำตอบจึงหยุดนาฬิกาได้ทันที ไม่ deadlock', async () => {
        const id = await filingAwaitingAnswer('REVISION_REQUESTED', { dueAt: new Date(Date.now() - 3600e3) });
        let checker = null;
        const answered = raw.$transaction(async (tx) => {
            const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
            await tx.$queryRaw`SELECT id FROM applications WHERE id = ${id} FOR UPDATE`;
            checker = checkExpiredDeadlines();
            await untilQueuedBehind(pid);
            await writeApplicationStatus({
                prisma: tx, applicationId: id, fromStatus: 'REVISION_REQUESTED', toStatus: 'ASSIGNED_FOR_REVIEW',
                actorId: fx.applicant.id, actorRole: 'health', reason: 'REVISION_RESUBMITTED', onAudit: false,
            });
            const clock = await tx.revisionDeadline.findUnique({ where: { applicationId: id } });
            return { clockStoppedBy: clock.submittedBy, checkerStillWaitsOnTheAnswer: (await queuedBehind(pid)) > 0 };
        }, { timeout: 30000 }).catch((error) => ({ answerFailed: error.message }));
        const outcome = await answered;
        await checker;
        expect(outcome).toEqual({ clockStoppedBy: fx.applicant.id, checkerStillWaitsOnTheAnswer: true });
    });
});
