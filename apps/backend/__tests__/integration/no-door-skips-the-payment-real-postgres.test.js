/**
 * ไม่มีประตูไหนพาคำขอข้ามการชำระเงินได้ และไม่มีประตูเจ้าหน้าที่ไหนข้ามองค์กรได้ (real Postgres)
 *
 * รีวิวความปลอดภัย 2026-10-06 (F1): POST /api/provider/admin/batch-actions เปลี่ยนสถานะคำขอใดก็ได้
 * โดยไม่ดูสถานะต้นทาง ไม่ดูองค์กร และไม่ตรวจ edge · ASSIGN พา PENDING_DOC_FEE ไป
 * ASSIGNED_FOR_REVIEW ได้ หรือ REQUEST_DOCUMENTS (ถอดแล้ว คำสั่ง 31) พาไป REVISION_REQUESTED แล้วผู้ยื่นยื่นกลับ
 * ไปถึงขั้นตรวจเอกสารโดยไม่เคยจ่ายงวดแรก
 *
 * แก้สองชั้น: ประตูนี้รับเฉพาะสถานะต้นทางของ action นั้นและเฉพาะองค์กรของผู้เรียก (คำสั่ง 17) ·
 * และตัวเขียนสถานะตัวเดียวปฏิเสธทุกประตูที่จะพาคำขอเข้าสถานะหลังงวดที่ยังไม่ได้ชำระ
 * (งวดที่คืนเงินเต็มจำนวนนับว่ายังไม่ชำระ คำสั่ง 20)
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

d('ไม่มีประตูไหนข้ามการชำระเงินหรือข้ามองค์กร (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], invoiceIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;
    const auditRows = (id) => raw.auditLog.count({ where: { resourceId: id } });

    async function staff(role, organizationId) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `nd-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `nd-${seq}-${sfx}`, email: `nd-${seq}-${sfx}@example.test`,
                firstName: 'เจ้าหน้าที่', lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function application(status, organizationId = fx.orgA) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-ND-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId, entityId: fx.entity, submitterId: fx.applicant.id, status,
                formData: { workflowState: status },
            },
        });
        fx.appIds.push(row.id);
        return row.id;
    }

    /** งวดที่เงินเข้าจริง: คำสั่งชำระ SETTLED กับใบแจ้งหนี้ที่ชำระแล้ว · refund = สถานะการคืนเงินของงวดนั้น */
    async function settled(applicationId, milestone, { refund = null } = {}) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-ND-${seq}-${sfx}`, applicationId, healthId: fx.applicant.canonicalId,
                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0,
                dueDate: new Date(), status: 'PAID', paidAt: new Date(), organizationId: fx.orgA,
                metadata: refund ? { refund: { status: refund } } : {},
            },
        });
        fx.invoiceIds.push(invoice.id);
        await raw.checkoutOrder.create({
            data: {
                applicationId, milestone, platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0,
                totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id,
                organizationId: fx.orgA,
            },
        });
    }

    const batch = (body) => request(app).post('/api/provider/admin/batch-actions').send(body);

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `nd-${tag}-${sfx}`, slug: `nd-${tag}-${sfx}`, code: `ND${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;

        fx.adminA = await staff('system_admin_dtam', fx.orgA);
        fx.adminB = await staff('system_admin_dtam', fx.orgB);
        // A token whose user the database does not know: nothing resolves an organization for it.
        fx.adminNoOrg = { id: crypto.randomUUID(), role: 'system_admin_dtam', canonicalRole: 'system_admin_dtam', organizationId: null };
        fx.platform = await staff('system_admin_platform', fx.orgB);
        fx.reviewerA = await staff('document_reviewer', fx.orgA);
        fx.reviewerB = await staff('document_reviewer', fx.orgB);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `nd-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `nd-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgA,
            },
        });
        fx.userIds.push(applicantId);
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท nd ${sfx} จำกัด`, organizationId: fx.orgA } })).id;
        fx.entityIds.push(fx.entity);

        app = express();
        app.use(express.json());
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
        app.use('/api/provider/applications', require('../../routes/api/provider/document-reviews'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        for (const model of ['checkoutOrder', 'workActivity', 'applicationDocumentReview', 'applicationDocument']) {
            await wipe(model, byApp);
        }
        await wipe('invoice', { id: { in: fx.invoiceIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await raw.$disconnect();
    });

    describe('ประตู batch-actions', () => {
        test('ASSIGN บนคำขอที่ยังไม่จ่ายงวดแรก ถูกปฏิเสธ และไม่มีอะไรเปลี่ยน', async () => {
            const id = await application('PENDING_DOC_FEE');
            as(fx.adminA);
            const res = await batch({ action: 'ASSIGN', applicationIds: [id], assignTo: fx.reviewerA.id });
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('BATCH_ACTION_WRONG_STATE');
            expect(await statusOf(id)).toBe('PENDING_DOC_FEE');
            expect(await auditRows(id)).toBe(0);
            expect(await raw.assignmentLedgerEntry.count({ where: { entityId: id } })).toBe(0);
        });

        test('REQUEST_DOCUMENTS ไม่มีในประตู batch แล้ว (คำสั่ง 31) จึงไม่มีทางอ้อมไปยื่นกลับ', async () => {
            const id = await application('PENDING_DOC_FEE');
            as(fx.adminA);
            const res = await batch({ action: 'REQUEST_DOCUMENTS', applicationIds: [id] });
            expect(res.status).toBe(400);
            expect(await statusOf(id)).toBe('PENDING_DOC_FEE');
        });

        test('ชุดที่มีใบผิดสถานะปนอยู่ใบเดียว ปฏิเสธทั้งชุดก่อนเขียน', async () => {
            const good = await application('DOC_FEE_PAID');
            await settled(good, 'M1');
            const bad = await application('PENDING_DOC_FEE');
            as(fx.adminA);
            const res = await batch({ action: 'ASSIGN', applicationIds: [good, bad], assignTo: fx.reviewerA.id });
            expect(res.status).toBe(409);
            expect(await statusOf(good)).toBe('DOC_FEE_PAID');
            expect(await statusOf(bad)).toBe('PENDING_DOC_FEE');
        });

        test('ผู้ดูแลองค์กรอื่นแตะคำขอนี้ไม่ได้ ตอบเหมือนไม่มีคำขอ และไม่มีอะไรเปลี่ยน (แม้ปิดตัวกรองชั้นข้อมูล)', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1');
            as(fx.adminB);
            process.env.TENANT_READ_ORG_SCOPE = 'false';
            let res;
            try {
                res = await batch({ action: 'ASSIGN', applicationIds: [id], assignTo: fx.reviewerB.id });
            } finally {
                delete process.env.TENANT_READ_ORG_SCOPE;
            }
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('APPLICATION_NOT_FOUND');
            expect(await statusOf(id)).toBe('DOC_FEE_PAID');
        });

        test('ผู้ดูแลที่ไม่มีองค์กร ถูกปฏิเสธ (ไม่รู้องค์กร = ไม่ให้)', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1');
            as(fx.adminNoOrg);
            const res = await batch({ action: 'ASSIGN', applicationIds: [id], assignTo: fx.reviewerA.id });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('NO_ORGANIZATION');
            expect(await statusOf(id)).toBe('DOC_FEE_PAID');
        });

        test('ผู้ดูแลแพลตฟอร์มมอบหมายข้ามองค์กรได้ ให้ผู้ตรวจขององค์กรเจ้าของคำขอเท่านั้น', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1');
            as(fx.platform);
            const wrongOrg = await batch({ action: 'ASSIGN', applicationIds: [id], assignTo: fx.reviewerB.id });
            expect(wrongOrg.status).toBe(422);
            expect(wrongOrg.body.code).toBe('STAFF_NOT_ASSIGNABLE');
            expect(await statusOf(id)).toBe('DOC_FEE_PAID');
            const res = await batch({ action: 'ASSIGN', applicationIds: [id], assignTo: fx.reviewerA.id });
            expect(res.status).toBe(200);
            expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
        });

        test('ASSIGN เขียนผู้ตรวจลงคอลัมน์ reviewerId ด่านผู้ตรวจที่ได้รับมอบหมายและการแยกหน้าที่จึงทำงาน', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1');
            as(fx.adminA);
            const res = await batch({ action: 'ASSIGN', applicationIds: [id], assignTo: fx.reviewerA.id });
            expect(res.status).toBe(200);
            expect((await raw.application.findUnique({ where: { id }, select: { reviewerId: true } })).reviewerId).toBe(fx.reviewerA.id);
            as(fx.reviewerB);
            process.env.TENANT_READ_ORG_SCOPE = 'false';
            try {
                const other = await request(app).get(`/api/provider/applications/${id}/document-check`);
                expect(other.status).toBe(404);
            } finally {
                delete process.env.TENANT_READ_ORG_SCOPE;
            }
        });

        test('ทางที่ถูกต้องยังเดินได้: ASSIGN จาก DOC_FEE_PAID ที่จ่ายแล้ว', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1');
            as(fx.adminA);
            const assigned = await batch({ action: 'ASSIGN', applicationIds: [id], assignTo: fx.reviewerA.id });
            expect(assigned.status).toBe(200);
            expect(assigned.body.data.affected).toBe(1);
            expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
        });
    });

    describe('ตัวเขียนสถานะ: กันทุกประตูที่จะข้ามงวดที่ยังไม่ได้ชำระ', () => {
        const { writeApplicationStatus } = require('../../services/application-status-writer');
        const write = (id, fromStatus, toStatus, actorRole = 'system_admin_dtam', additionalData = {}) => writeApplicationStatus({
            prisma: raw, applicationId: id, fromStatus, toStatus, actorId: fx.adminA.id, actorRole, reason: 'TEST', additionalData,
        });
        // A booking carries its inspector and date (the writer refuses the edge without them, I2).
        const booking = () => ({ auditorId: fx.reviewerB.id, scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });

        test('สถานะบอกว่าจ่ายแล้ว แต่ไม่มีเงินเข้า: เข้าขั้นตรวจเอกสารไม่ได้', async () => {
            const id = await application('DOC_FEE_PAID');
            await expect(write(id, 'DOC_FEE_PAID', 'ASSIGNED_FOR_REVIEW')).rejects.toMatchObject({ code: 'MILESTONE_NOT_PAID' });
            expect(await statusOf(id)).toBe('DOC_FEE_PAID');
        });

        test('งวดแรกที่คืนเงินเต็มจำนวนแล้ว นับว่ายังไม่ชำระ', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1', { refund: 'COMPLETED' });
            await expect(write(id, 'DOC_FEE_PAID', 'ASSIGNED_FOR_REVIEW')).rejects.toMatchObject({ code: 'MILESTONE_NOT_PAID' });
        });

        test('ระบบเองก็ข้ามไม่ได้: DOC_APPROVED → PENDING_AUDIT_FEE ต้องจ่ายงวดแรกแล้ว', async () => {
            const id = await application('DOC_APPROVED');
            await expect(write(id, 'DOC_APPROVED', 'PENDING_AUDIT_FEE', 'SYSTEM')).rejects.toMatchObject({ code: 'MILESTONE_NOT_PAID' });
            await settled(id, 'M1');
            await write(id, 'DOC_APPROVED', 'PENDING_AUDIT_FEE', 'SYSTEM');
            expect(await statusOf(id)).toBe('PENDING_AUDIT_FEE');
        });

        test('นัดตรวจแปลงต้องจ่ายครบสองงวด', async () => {
            const id = await application('AUDIT_FEE_PAID');
            await settled(id, 'M1');
            await expect(write(id, 'AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', 'dispatcher', booking())).rejects.toMatchObject({ code: 'MILESTONE_NOT_PAID' });
            await settled(id, 'M2');
            await write(id, 'AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', 'dispatcher', booking());
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
        });

        test('ทางออกไม่ถูกกัน: คำขอที่ไม่ได้จ่ายยังหมดอายุได้', async () => {
            const id = await application('PENDING_DOC_FEE');
            await write(id, 'PENDING_DOC_FEE', 'EXPIRED', 'SYSTEM');
            expect(await statusOf(id)).toBe('EXPIRED');
        });
    });

    describe('ประตูตรวจเอกสาร: เฉพาะองค์กรของผู้ตรวจ', () => {
        // ปิดตัวกรองชั้นข้อมูล (kill-switch ของ production) เพื่อให้เห็นว่าประตูกันเองได้
        const flagBefore = process.env.TENANT_READ_ORG_SCOPE;
        beforeAll(() => { process.env.TENANT_READ_ORG_SCOPE = 'false'; });
        afterAll(() => {
            if (flagBefore === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = flagBefore; }
        });

        test('ผู้ตรวจองค์กรอื่นเปิดหน้าตรวจและตัดสินคำขอนี้ไม่ได้', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW');
            await settled(id, 'M1');
            as(fx.reviewerB);
            const check = await request(app).get(`/api/provider/applications/${id}/document-check`);
            expect(check.status).toBe(404);
            const decision = await request(app).post(`/api/provider/applications/${id}/document-decision`).send({ action: 'REQUEST_MORE' });
            expect(decision.status).toBe(404);
            expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
        });

        test('ผู้ตรวจที่ไม่มีองค์กร ถูกปฏิเสธ', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW');
            as({ id: crypto.randomUUID(), role: 'document_reviewer', canonicalRole: 'document_reviewer', organizationId: null });
            const check = await request(app).get(`/api/provider/applications/${id}/document-check`);
            expect(check.status).toBe(400);
            expect(check.body.code).toBe('NO_ORGANIZATION');
        });

        test('ผู้ตรวจที่ถูกมอบในองค์กรเดียวกันยังเปิดหน้าตรวจได้', async () => {
            const id = await application('ASSIGNED_FOR_REVIEW');
            await raw.application.update({ where: { id }, data: { reviewerId: fx.reviewerA.id } });
            as(fx.reviewerA);
            const check = await request(app).get(`/api/provider/applications/${id}/document-check`);
            expect(check.status).toBe(200);
        });
    });
});
