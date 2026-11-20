/**
 * คำขอที่ยกเลิกแล้วและคืนเงินแล้ว เปิดกลับไม่ได้ทางประตูไหน (real Postgres)
 *
 * คำสั่ง 20/22: ระบบไม่คืนเงินเอง บริษัทคืนนอกระบบแล้วบันทึกด้วยใบลดหนี้ งวดที่คืนเต็มนับว่ายังไม่ชำระ
 * คำขอที่ยกเลิกพร้อมคืนเงินจึงปิดแล้ว ถ้าจะทำต่อต้องยื่นและชำระใหม่ผ่านระบบรับชำระ
 * รั้วนี้อยู่ในตัวเขียนสถานะ จึงครอบทุกประตู:
 * - PATCH /api/admin/applications/:id/status
 * - POST  /api/admin/applications/:id/force-status
 * - POST  /api/admin/applications/:id/revert-last-transition
 * - POST  /api/provider/admin/status-override
 * - POST  /api/provider/admin/batch-actions (ตรวจสถานะต้นทางก่อนเขียน)
 * การคืนเงินที่ยังมีผล = metadata.refund ของใบแจ้งหนี้ (INITIATED/BANK_TRANSFER_PENDING/COMPLETED)
 * หรือใบลดหนี้เหตุ CANCELLATION ที่ ISSUED/POSTED
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');

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

d('คำขอที่ยกเลิกพร้อมคืนเงิน ปิดถาวร (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], invoiceIds: [], creditNoteIds: [] };
    let seq = 0;

    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;

    /** คำขอที่ถูกยกเลิกจาก PENDING_AUDIT_FEE · refund = 'metadata' | 'credit-note' | null */
    async function cancelled(refund) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-RC-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.entity, submitterId: fx.applicant.id, status: 'CANCELLED',
                formData: { workflowState: 'CANCELLED' },
                workflowHistory: [{ timestamp: new Date().toISOString(), fromStatus: 'SUBMITTED', toStatus: 'CANCELLED', action: 'CANCEL' }],
            },
        });
        fx.appIds.push(row.id);
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-RC-${seq}-${sfx}`, applicationId: row.id, healthId: fx.applicant.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 0, totalAmount: 0, dueDate: new Date(),
                status: 'paid', paidAt: new Date(), organizationId: fx.org,
                metadata: refund === 'metadata' ? { refund: { status: 'COMPLETED' } } : {},
            },
        });
        fx.invoiceIds.push(invoice.id);
        if (refund === 'credit-note') {
            const note = await raw.creditNote.create({
                data: {
                    creditNoteNumber: `CN-RC-${seq}-${sfx}`, originalInvoiceId: invoice.id, reason: 'ยกเลิกบริการ',
                    reasonCode: 'CANCELLATION', subtotal: 0, vat: 0, totalAmount: 0, status: 'ISSUED',
                    issuedAt: new Date(), organizationId: fx.org,
                },
            });
            fx.creditNoteIds.push(note.id);
        }
        return row.id;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `rc-${sfx}`, slug: `rc-${sfx}`, code: `RC_${sfx}`.toUpperCase() } });
        fx.org = org.id;
        fx.orgIds.push(org.id);
        const adminId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: adminId, canonicalId: `rc-admin-${sfx}`, password: 'x', role: 'system_admin_dtam', authType: 'PROVIDER_ID',
                providerId: `rc-admin-${sfx}`, email: `rc-admin-${sfx}@example.test`, firstName: 'ผู้ดูแล', lastName: 'ระบบ',
                organizationId: fx.org, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(adminId);
        mockActor.current = { id: adminId, role: 'system_admin_dtam', canonicalRole: 'system_admin_dtam', organizationId: fx.org };

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `rc-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `rc-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.org,
            },
        });
        fx.userIds.push(applicantId);
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท rc ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.entity);

        app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.user = { ...mockActor.current }; next(); });
        app.use('/api/admin/applications', require('../../routes/api/admin/applications'));
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        await wipe('creditNote', { id: { in: fx.creditNoteIds } });
        await wipe('checkoutOrder', { applicationId: { in: fx.appIds } });
        await wipe('invoice', { id: { in: fx.invoiceIds } });
        await wipe('invoice', { applicationId: { in: fx.appIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('workActivity', { applicationId: { in: fx.appIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await raw.$disconnect();
    });

    const doors = {
        'PATCH /api/admin/applications/:id/status': (id) => request(app).patch(`/api/admin/applications/${id}/status`)
            .send({ status: 'SUBMITTED', reasonCode: 'DATA_CORRECTION', comment: 'เปิดคำขอกลับมา' }),
        'POST /api/admin/applications/:id/force-status': (id) => request(app).post(`/api/admin/applications/${id}/force-status`)
            .send({ toStatus: 'SUBMITTED', reasonCode: 'DATA_CORRECTION', reason: 'เปิดคำขอกลับมาตรวจต่อ' }),
        'POST /api/admin/applications/:id/revert-last-transition': (id) => request(app).post(`/api/admin/applications/${id}/revert-last-transition`)
            .send({ reason: 'ยกเลิกผิดคำขอ ขอคืนสถานะเดิม' }),
        'POST /api/provider/admin/status-override': (id) => request(app).post('/api/provider/admin/status-override')
            .send({ applicationId: id, newStatus: 'SUBMITTED', reason: 'เปิดคำขอกลับมา' }),
    };

    describe.each(Object.entries(doors))('%s', (_name, call) => {
        test.each(['metadata', 'credit-note'])('ยกเลิกพร้อมคืนเงิน (%s): ปฏิเสธ 409 สถานะคงเป็น CANCELLED', async (refund) => {
            const id = await cancelled(refund);
            const res = await call(id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('APPLICATION_REFUNDED_CANCELLED');
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        // คำสั่ง 30 (2026-10-07): CANCELLED ปิดถาวรสำหรับคน ไม่ว่ามีการคืนเงินหรือไม่
        test('ยกเลิกโดยไม่มีการคืนเงิน: ปฏิเสธเหมือนกัน เพราะยกเลิกคือปิดถาวร', async () => {
            const id = await cancelled(null);
            const res = await call(id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('APPLICATION_CANCELLED_FINAL');
            expect(await statusOf(id)).toBe('CANCELLED');
        });
    });

    test('batch-actions: คำขอที่ยกเลิกพร้อมคืนเงินไม่อยู่ในสถานะต้นทาง จึงไม่มีอะไรถูกเขียน', async () => {
        const id = await cancelled('credit-note');
        const res = await request(app).post('/api/provider/admin/batch-actions')
            .send({ applicationIds: [id], action: 'ASSIGN', assignTo: mockActor.current.id, reason: 'มอบผู้ตรวจ' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('BATCH_ACTION_WRONG_STATE');
        expect(await statusOf(id)).toBe('CANCELLED');
    });

    describe('ตัวเขียนสถานะอ่านสถานะจริงเอง ไม่เชื่อ fromStatus ที่ผู้เรียกส่งมา', () => {
        const { writeApplicationStatus } = require('../../services/application-status-writer');
        const reopen = (id, fromStatus) => writeApplicationStatus({
            prisma: raw, applicationId: id, fromStatus, toStatus: 'SUBMITTED',
            actorId: mockActor.current.id, actorRole: 'system_admin_dtam', reason: 'stale caller',
        });

        test.each(['metadata', 'credit-note'])('fromStatus เก่า (PENDING_AUDIT_FEE) บนคำขอที่ยกเลิกพร้อมคืนเงิน (%s): ปฏิเสธ', async (refund) => {
            const id = await cancelled(refund);
            await expect(reopen(id, 'PENDING_AUDIT_FEE')).rejects.toMatchObject({ code: 'APPLICATION_REFUNDED_CANCELLED' });
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        test('fromStatus เก่าบนคำขอที่ยกเลิกโดยไม่มีการคืนเงิน: ปฏิเสธ (ยกเลิกคือปิดถาวร)', async () => {
            const id = await cancelled(null);
            await expect(reopen(id, 'PENDING_AUDIT_FEE')).rejects.toMatchObject({ code: 'APPLICATION_CANCELLED_FINAL' });
            expect(await statusOf(id)).toBe('CANCELLED');
        });
    });

    describe('ยกเลิกพร้อมคืนเงินที่ commit ระหว่างที่ตัวเขียนสถานะกำลังเขียน: ตัวเขียนไม่ทับ', () => {
        const { writeApplicationStatus } = require('../../services/application-status-writer');

        /** คำขอที่ชำระสองงวดแล้ว รอผู้จัดคิว */
        async function paidAwaitingSchedule() {
            seq += 1;
            const row = await raw.application.create({
                data: {
                    applicationNumber: `APP-RC-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                    organizationId: fx.org, entityId: fx.entity, submitterId: fx.applicant.id, status: 'AUDIT_FEE_PAID',
                    formData: { workflowState: 'AUDIT_FEE_PAID' },
                },
            });
            fx.appIds.push(row.id);
            await settleMilestones(raw, { id: row.id, healthId: fx.applicant.canonicalId, organizationId: fx.org }, ['M1', 'M2']);
            return row.id;
        }

        /**
         * Cancel and refund in one transaction that holds the row until the writer is seen
         * waiting on a lock, then commits. The writer's own reads ran before the commit.
         */
        async function cancelAndRefundWhile(id, write) {
            let release;
            const held = new Promise((resolve) => { release = resolve; });
            const canceller = raw.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM "applications" WHERE id = ${id} FOR UPDATE`;
                await tx.application.update({ where: { id }, data: { status: 'CANCELLED', version: { increment: 1 } } });
                await tx.invoice.updateMany({
                    where: { applicationId: id, serviceType: 'CERTIFICATION_CHECKOUT_M2' },
                    data: { metadata: { refund: { status: 'COMPLETED' } } },
                });
                await held;
            }, { timeout: 20000 });
            const writing = write().then((v) => ({ ok: v }), (e) => ({ error: e }));
            let settled = false;
            writing.finally(() => { settled = true; });
            const deadline = Date.now() + 10000;
            while (!settled && Date.now() < deadline) {
                const [{ n }] = await raw.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
                    WHERE wait_event_type = 'Lock' AND datname = current_database()`;
                if (n > 0) { break; }
                await new Promise((r) => setTimeout(r, 25));
            }
            release();
            await canceller;
            return writing;
        }

        const stale = (prisma, id) => writeApplicationStatus({
            prisma, applicationId: id, fromStatus: 'AUDIT_FEE_PAID', toStatus: 'AUDIT_CONFIRMED',
            actorId: mockActor.current.id, actorRole: 'system_admin_dtam', reason: 'stale admin write',
        });

        test('ตัวเขียนเปิดธุรกรรมเอง: ปฏิเสธ คำขอคง CANCELLED', async () => {
            const id = await paidAwaitingSchedule();
            const result = await cancelAndRefundWhile(id, () => stale(raw, id));
            expect(result.error).toMatchObject({ code: 'APPLICATION_REFUNDED_CANCELLED' });
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        test('ตัวเขียนอยู่ในธุรกรรมของผู้เรียก: ปฏิเสธ คำขอคง CANCELLED', async () => {
            const id = await paidAwaitingSchedule();
            const result = await cancelAndRefundWhile(id, () => raw.$transaction((tx) => stale(tx, id), { timeout: 20000 }));
            expect(result.error).toMatchObject({ code: 'APPLICATION_REFUNDED_CANCELLED' });
            expect(await statusOf(id)).toBe('CANCELLED');
        });
    });
});
