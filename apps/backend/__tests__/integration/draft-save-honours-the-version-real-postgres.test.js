/**
 * autosave ใช้เวอร์ชันที่ผู้ส่งเห็นล่าสุด (optimistic lock) · real Postgres
 *
 * D10 (audit 2026-10-07): เว็บส่ง expectedVersion แต่ POST /api/applications/draft ไม่อ่านค่านี้
 * และคำตอบไม่มี version ⇒ สมาชิกผู้ถือสองคน (หรือสองแท็บต่าง session) แก้ร่างเดียวกัน คนหลังทับ
 * คนแรกเงียบ ๆ
 */

'use strict';

const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

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

d('POST /api/applications/draft ปฏิเสธการบันทึกทับเวอร์ชันที่เก่ากว่า (real Postgres)', () => {
    let raw;
    let fx;
    let app;
    let seq = 0;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'ver');
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
    });

    afterAll(async () => {
        await raw.auditLog.deleteMany({ where: { resourceId: { in: fx.appIds } } }).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    const save = (user, applicationId, firstName, expectedVersion, session) => {
        mockActor.current = { id: user.id, canonicalId: user.canonicalId, healthId: user.canonicalId, role: 'health', canonicalRole: 'health', organizationId: fx.orgId };
        seq += 1;
        return request(app).post('/api/applications/draft').send({
            applicationId, saveSession: session, saveSeq: seq, step: 2, currentStep: 1, plantId: 'cannabis', areaType: 'OUTDOOR',
            ...(expectedVersion !== undefined ? { expectedVersion } : {}),
            formData: { applicantData: { firstName, lastName: 'ทดสอบ', phone: '0812345678' } },
        });
    };
    const firstNameOf = async (id) => (await raw.application.findUnique({ where: { id } })).formData?.applicantData?.firstName;

    test('สองคนเปิดร่างเวอร์ชันเดียวกัน: คนแรกบันทึกได้ คนหลังได้ 409 และร่างยังเป็นของคนแรก · โหลดใหม่แล้วบันทึกได้', async () => {
        const draft = await fx.makeApplication({ status: 'DRAFT', formData: { workflowState: 'DRAFT' } });
        const seen = draft.version;

        const first = await save(fx.applicant, draft.id, 'คนแรก', seen, 'tab-a');
        expect({ status: first.status, version: first.body?.data?.version }).toEqual({ status: 200, version: seen + 1 });

        const stale = await save(fx.owner, draft.id, 'คนหลัง', seen, 'tab-b');
        expect({ status: stale.status, code: stale.body?.code || stale.body?.error }).toEqual({ status: 409, code: 'DRAFT_VERSION_CONFLICT' });
        expect(await firstNameOf(draft.id)).toBe('คนแรก');

        const reloaded = await save(fx.owner, draft.id, 'คนหลังหลังโหลด', first.body.data.version, 'tab-b');
        expect({ status: reloaded.status, version: reloaded.body?.data?.version }).toEqual({ status: 200, version: seen + 2 });
        expect(await firstNameOf(draft.id)).toBe('คนหลังหลังโหลด');
    });

    // A reminder the server records on the filing is not another session's save (security re-review
    // 2026-10-09 L-C): the claims keep the version where it is, so an applicant fixing a revision when
    // the 48-hour reminder goes out keeps saving. The filing writers check the filing they read instead.
    test('การแจ้งเตือนก่อนครบกำหนดแก้ไขที่ระบบบันทึกระหว่างผู้ยื่นแก้ไข ไม่ทำให้การบันทึกครั้งถัดไปได้ 409', async () => {
        const { runCorrectionDeadlineSweep } = require('../../jobs/correction-deadline-sweep');
        const dueAt = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();
        const revising = await fx.makeApplication({
            status: 'REVISION_REQUESTED', formData: { workflowState: 'REVISION_REQUESTED', revisionDueAt: dueAt, revisionRequestedAt: new Date().toISOString() },
        });
        const first = await save(fx.applicant, revising.id, 'ก่อนเตือน', revising.version, 'tab-r');
        expect(first.status).toBe(200);
        await runCorrectionDeadlineSweep({ now: new Date() });
        const stamped = (await raw.application.findUnique({ where: { id: revising.id } })).formData.deadlineReminders;
        expect(stamped).toMatchObject({ dueAt });
        const next = await save(fx.applicant, revising.id, 'หลังเตือน', first.body.data.version, 'tab-r');
        expect([next.status, next.body?.code || null]).toEqual([200, null]);
        expect(await firstNameOf(revising.id)).toBe('หลังเตือน');
        expect((await raw.application.findUnique({ where: { id: revising.id } })).formData.deadlineReminders).toMatchObject({ dueAt });
    });

    test('ผู้ส่งที่ไม่ส่ง expectedVersion ไม่ถูกเทียบ (ตัวควบคุม)', async () => {
        const draft = await fx.makeApplication({ status: 'DRAFT', formData: { workflowState: 'DRAFT' } });
        expect((await save(fx.applicant, draft.id, 'ไม่มีเวอร์ชัน', undefined, 'tab-c')).status).toBe(200);
    });
});
