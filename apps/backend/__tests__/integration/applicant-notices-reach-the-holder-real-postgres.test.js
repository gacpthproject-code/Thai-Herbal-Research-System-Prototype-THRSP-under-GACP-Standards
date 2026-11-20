/**
 * แจ้งเตือนฝั่งผู้ยื่นทุกขั้นถึงผู้ยื่นและผู้ถือ (real Postgres)
 *
 * คำสั่ง 32 (operator 2026-10-07): "แจ้งผู้ถือ" = สมาชิกบริษัทผู้ถือที่มีสิทธิ์ SUBMIT_APPLICATION
 * รวมผู้ยื่น ตัดคนซ้ำ · คำสั่ง 29: อนุมัติแล้วจบที่ CERTIFIED แจ้งผู้ยื่นและผู้ถือ
 * คำสั่ง 26: แจ้งเตือนที่ไม่ใช่การคืนเงินใช้ "คุณ" ไม่ใช้ "ท่าน" · ไม่มีอีโมจิในหัวเรื่อง
 *
 * เดิมทุกขั้นส่งถึงผู้ยื่นคนเดียว (D5)
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

const EMOJI = /\p{Extended_Pictographic}/u;
const logger = { info() {}, warn() {}, error() {} };

d('แจ้งเตือนฝั่งผู้ยื่นถึงผู้ยื่นและผู้ถือ (real Postgres)', () => {
    let raw;
    let fx;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'hold');
    });

    afterAll(async () => {
        await fx.cleanup();
        await raw.$disconnect();
    });

    async function noticesFor(applicationId) {
        return raw.notification.findMany({
            where: { userId: { in: fx.userIds }, metadata: { path: ['applicationId'], equals: applicationId } },
            select: { userId: true, title: true, message: true, type: true },
        });
    }

    function expectPartiesOnly(rows) {
        const users = [...new Set(rows.map((r) => r.userId))].sort();
        expect(users).toEqual(fx.expectedParties);
        for (const id of fx.nonParties) { expect(users).not.toContain(id); }
        for (const row of rows) {
            expect(row.title).not.toMatch(EMOJI);
            expect(`${row.title} ${row.message}`).not.toContain('ท่าน');
        }
    }

    describe('ขาสถานะของประตู workflow-transitions', () => {
        const { sendTransitionNotifications } = require('../../routes/api/provider/handlers/workflow-side-effects');

        test.each([
            ['REVISION_REQUESTED', { formData: { revisionDueAt: '2026-10-15T16:59:59.999Z' } }],
            ['PENDING_AUDIT_FEE', { formData: {} }],
            ['CERTIFIED', { formData: { certificateNumber: 'TH-GACP 1/2569' } }],
        ])('%s → ผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่น ได้คนละหนึ่งแถว', async (nextState, updateData) => {
            const application = await fx.makeApplication();
            await sendTransitionNotifications(raw, logger, {
                application, transition: { nextState, previousState: 'X', updateData },
                getRevisionDueAt: (f) => (f?.revisionDueAt ? new Date(f.revisionDueAt) : null),
                effectiveComment: 'เหตุผล',
            });
            const rows = await noticesFor(application.id);
            expectPartiesOnly(rows);
            expect(rows).toHaveLength(fx.expectedParties.length);
        });

        test('ผลตรวจแปลงผ่าน (ตัวเขียนสถานะ AUDIT_PASSED) → ผู้ยื่นและผู้ถือ', async () => {
            await require('../../services/notification-fanout-service')._internals._clearDedupeForTests();
            const application = await fx.makeApplication({ status: 'AUDIT_CONFIRMED', auditorId: fx.inspector.id, reviewerId: fx.reviewer.id });
            await fx.settle(application.id, 'M1');
            await fx.settle(application.id, 'M2');
            const { writeApplicationStatus } = require('../../services/application-status-writer');
            await require('../../services/tenant-context').runWithTenantContext({ organizationId: fx.orgId }, () => writeApplicationStatus({
                prisma: raw, applicationId: application.id, fromStatus: 'AUDIT_CONFIRMED', toStatus: 'AUDIT_PASSED',
                actorId: fx.inspector.id, actorRole: 'field_inspector', reason: 'PASS',
            }));
            const rows = (await noticesFor(application.id)).filter((r) => r.type === 'APPLICANT_AUDIT_PASSED');
            expectPartiesOnly(rows);
            expect(rows).toHaveLength(fx.expectedParties.length);
        });

        test('ออกใบรับรอง (ผู้อนุมัติตัดสิน → CERTIFIED) → ผู้ยื่นและผู้ถือได้เลขใบรับรอง', async () => {
            const application = await fx.makeApplication({ status: 'CERTIFIED' });
            await fx.makeCertificate(application.id, { expiryDate: new Date(Date.now() + 365 * 86400e3) });
            const { certificateNumber } = await raw.certificate.findFirst({ where: { applicationId: application.id } });
            await require('../../services/certification-decision-service').notifyCertificateIssued(application.id);
            const rows = await noticesFor(application.id);
            expectPartiesOnly(rows);
            expect(rows).toHaveLength(fx.expectedParties.length);
            expect(rows.every((r) => r.message.includes(certificateNumber))).toBe(true);
        });
    });

    describe('ใบรับรองใกล้หมดอายุ (D14)', () => {
        test('cron เตือนต่ออายุรันซ้ำในวันเดียว → ผู้ยื่นและผู้ถือได้คนละหนึ่งแถวต่อรอบ 30 วัน', async () => {
            await require('../../services/notification-fanout-service')._internals._clearDedupeForTests();
            const application = await fx.makeApplication({ status: 'CERTIFIED' });
            const now = new Date();
            await fx.makeCertificate(application.id, { expiryDate: new Date(now.getTime() + 30 * 86400e3) });
            const cron = require('../../cron/renewal-reminder-cron');
            await cron.run({ now });
            await cron.run({ now });
            const rows = (await noticesFor(application.id)).filter((r) => r.type === 'CERTIFICATE_EXPIRING_SOON');
            expectPartiesOnly(rows);
            expect(rows).toHaveLength(fx.expectedParties.length);
        });

        test('งานเที่ยงคืนที่ส่ง CERTIFICATE_EXPIRING ทุกวันไม่มีแล้ว', () => {
            const src = require('fs').readFileSync(require.resolve('../../jobs/scheduler.js'), 'utf8');
            expect(src).not.toMatch(/NotifyType\.CERTIFICATE_EXPIRING\b/);
            expect(require('../../services/notification-service').NotifyType.CERTIFICATE_EXPIRING).toBeUndefined();
        });
    });

    describe('ตัวช่วยแจ้งเตือนฝั่งผู้ยื่น (ส่งแก้ เอกสารผ่าน ใกล้ครบกำหนด นัดตรวจ)', () => {
        const helpers = require('../../services/notification/domain-helpers');
        const { notifyAuditScheduled } = require('../../services/audit/audit-schedule-notices');

        test.each([
            ['notifyRevisionRequired', (id) => helpers.notifyRevisionRequired(id, 'แนบโฉนดใหม่', new Date('2026-10-15T09:00:00Z'))],
            ['notifyDocumentApproved', (id) => helpers.notifyDocumentApproved(id, null)],
            ['notifyRevisionDeadlineApproaching', (id) => helpers.notifyRevisionDeadlineApproaching(id, 24, { unit: 'hours' })],
            ['notifyAuditScheduled', (id) => notifyAuditScheduled({
                applicationId: id, applicationNumber: 'X', auditorId: null, scheduledAt: new Date('2026-10-20T02:30:00Z'), inspectionMode: 'ONSITE',
            })],
        ])('%s → ผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่นเท่านั้น', async (_name, send) => {
            const application = await fx.makeApplication();
            await send(application.id);
            const rows = await noticesFor(application.id);
            expectPartiesOnly(rows);
            expect(rows).toHaveLength(fx.expectedParties.length);
        });
    });

    describe('ข้อความยกเลิก (เลยกำหนด) (D12)', () => {
        const { NotifyTemplates } = require('../../services/notification-service');
        test('ค้างจ่ายจนถูกปิด: ไม่ชวนขออนุโลม (เปิดต่อไม่ได้)', () => {
            const out = NotifyTemplates.APPLICATION_EXPIRED({ applicationNumber: 'A-1', reason: 'ไม่ชำระค่าบริการภายในกำหนด', closedReason: 'PAYMENT_ABANDONED' });
            expect(out.title).toBe('คำขอถูกยกเลิก (เลยกำหนด)');
            expect(out.message).not.toMatch(/อนุโลม|กรณีพิเศษ/);
            expect(out.message).not.toContain('ท่าน');
        });
        test('เลยกำหนดแก้ไข: บอกทางขอเปิดต่อเป็นรายกรณี', () => {
            const out = NotifyTemplates.APPLICATION_EXPIRED({ applicationNumber: 'A-1', reason: 'ไม่ส่งงานแก้ไขภายใน 5 วันทำการ', closedReason: 'REVISION_OVERDUE' });
            expect(out.message).toMatch(/กรณีพิเศษ/);
            expect(out.message).not.toContain('ฝ่ายบัญชี');
        });
    });
});
