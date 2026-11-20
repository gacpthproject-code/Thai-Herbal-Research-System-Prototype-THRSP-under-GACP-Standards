/**
 * การเตือนชำระค่าบริการ (security veto 2026-10-07 M-a, M-b) · real Postgres · ตัวเตือนจริง
 *
 * M-a: แจ้งเตือนเขียนผ่าน connection หลักนอกทรานแซกชันของแถวเตือน ถ้าประทับ sentAt ไม่สำเร็จ แจ้งเตือนที่ส่งไปแล้ว
 *      ยังอยู่ แต่แถวยังไม่ถูกนับ → วันถัดไปส่งซ้ำ ผู้รับได้การเตือนเดียวกันสองครั้ง
 * M-b: คำขอที่การเตือนไปไม่ถึงใครเลย ค้างเปิดอยู่เงียบ ๆ (ตัวปิดต้องมี sentAt ครบสามครั้ง) → แจ้งเจ้าหน้าที่แพลตฟอร์ม
 *      ครั้งเดียวต่อคำขอ ไม่ใช่ทุกวัน · กติกาการปิด (คำสั่ง 39) ไม่เปลี่ยน
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

d('ตัวเตือนชำระค่าบริการ: ส่งครั้งเดียว และบอกเจ้าหน้าที่เมื่อไม่มีผู้รับ (real Postgres)', () => {
    let raw;
    let fx;
    let admin;
    let seq = 0;
    const { runPaymentReminderSweep } = require('../../jobs/payment-reminder-job');
    const { computeReminderDates } = require('../../services/checkout/checkout-schedule-service');
    const { addWorkingDays } = require('../../utils/working-days');
    const { PAYMENT } = require('../../config/business-rules');

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'remind');
        admin = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: admin, canonicalId: `remind-admin-${fx.sfx}`, providerId: `remind-admin-${fx.sfx}`, password: 'x',
                role: 'system_admin_platform', authType: 'PROVIDER_ID', accountType: 'PROVIDER', email: `remind-admin-${fx.sfx}@example.test`,
                firstName: 'ผู้ดูแล', lastName: 'แพลตฟอร์ม', organizationId: fx.orgId, status: 'ACTIVE',
            },
        });
        fx.userIds.push(admin);
    });

    afterAll(async () => {
        await raw.paymentReminderLog.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    async function unpaidM1(issuedAt, data = {}) {
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE', ...data });
        seq += 1;
        await raw.quotation.create({
            data: {
                applicationId: application.id, issuerType: 'PLATFORM', quotationNumber: `QT-REMIND-${seq}-${fx.sfx}`,
                subtotal: 5500, vat: 385, totalAmount: 5885, status: 'SENT', organizationId: fx.orgId, createdAt: issuedAt,
            },
        });
        const reminderDays = computeReminderDates(addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1));
        const morningOf = (day) => new Date(day.getTime() - 3 * 3600e3);
        return { application, preDue: morningOf(reminderDays.PRE_DUE), dueDay: morningOf(reminderDays.DUE_DATE) };
    }

    const reminded = (applicationId, reminderType) => raw.notification.count({
        where: {
            type: 'PAYMENT_REMINDER',
            AND: [
                { metadata: { path: ['applicationId'], equals: applicationId } },
                { metadata: { path: ['reminderType'], equals: reminderType } },
            ],
        },
    });

    test('M-a: ประทับ sentAt ไม่สำเร็จ → การเตือนที่ส่งไปถูกย้อนด้วย · รอบถัดไปส่งครั้งเดียว ผู้รับแต่ละคนได้หนึ่งครั้ง', async () => {
        const { application, preDue } = await unpaidM1(new Date('2026-12-02T03:00:00.000Z'));
        const trigger = `remind_refuse_${fx.sfx}`;
        await raw.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW."sentAt" IS NOT NULL AND NEW."applicationId" = '${application.id}' THEN RAISE EXCEPTION 'stamp refused'; END IF;
                RETURN NEW;
            END $$`);
        await raw.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON payment_reminder_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
        try {
            await runPaymentReminderSweep(preDue);
        } finally {
            await raw.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON payment_reminder_logs`);
            await raw.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
        }
        expect(await reminded(application.id, 'PRE_DUE')).toBe(0);

        await runPaymentReminderSweep(preDue);
        expect(await reminded(application.id, 'PRE_DUE')).toBe(fx.expectedParties.length);
        const rows = await raw.paymentReminderLog.findMany({ where: { applicationId: application.id }, select: { reminderType: true, sentAt: true } });
        expect(rows).toEqual([{ reminderType: 'PRE_DUE', sentAt: expect.any(Date) }]);
    });

    test('M-b: การเตือนไปไม่ถึงใคร → เจ้าหน้าที่แพลตฟอร์มได้รับแจ้งครั้งเดียวต่อคำขอ แม้เตือนไม่ถึงซ้ำอีกวัน · คำขอยังไม่ถูกปิด', async () => {
        const orphan = await raw.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท ไร้สมาชิก ${fx.sfx} จำกัด`, juristicId: '0105561234586', organizationId: fx.orgId },
        });
        fx.entityIds.push(orphan.id);
        const { application, preDue, dueDay } = await unpaidM1(new Date('2026-12-03T03:00:00.000Z'), { entityId: orphan.id });

        await runPaymentReminderSweep(preDue);
        await runPaymentReminderSweep(dueDay);

        const alerts = await raw.notification.findMany({
            where: { userId: admin, metadata: { path: ['applicationId'], equals: application.id } },
            select: { type: true, title: true, message: true },
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0].type).toBe('PAYMENT_REMINDER_REACHED_NOBODY');
        expect(alerts[0].message).toContain(application.applicationNumber);
        expect(await raw.paymentReminderLog.count({ where: { applicationId: application.id, sentAt: { not: null } } })).toBe(0);
        expect((await raw.application.findUnique({ where: { id: application.id }, select: { status: true } })).status).toBe('PENDING_DOC_FEE');
    });

    test('มติ 2026-10-08 (ข): ปิดการแจ้งเตือนชำระไว้ก่อนแล้วก็ยังได้รับ → นับว่าส่งแล้ว ไม่แจ้งเจ้าหน้าที่', async () => {
        const { application, preDue } = await unpaidM1(new Date('2026-12-07T03:00:00.000Z'));
        const optedOut = { channels: { PAYMENT_REMINDER: { inApp: false } } };
        await raw.user.updateMany({ where: { id: { in: fx.expectedParties } }, data: { notificationSettings: optedOut } });
        try {
            await runPaymentReminderSweep(preDue);
        } finally {
            await raw.user.updateMany({ where: { id: { in: fx.expectedParties } }, data: { notificationSettings: null } });
        }
        expect(await reminded(application.id, 'PRE_DUE')).toBe(fx.expectedParties.length);
        expect(await raw.paymentReminderLog.count({ where: { applicationId: application.id, sentAt: { not: null } } })).toBe(1);
        expect(await raw.notification.count({ where: { userId: admin, metadata: { path: ['applicationId'], equals: application.id } } })).toBe(0);
    });

    test('ตัวควบคุม: ปิดการแจ้งเตือนชนิดอื่นยังได้ผล (นัดตรวจ ไม่ถึงผู้ที่ปิด)', async () => {
        const { notifyApplicationParties } = require('../../services/notification/application-parties');
        const application = await fx.makeApplication({ status: 'AUDIT_SCHEDULED' });
        const [muted] = fx.expectedParties;
        await raw.user.update({ where: { id: muted }, data: { notificationSettings: { channels: { AUDIT_SCHEDULED: { inApp: false } } } } });
        try {
            await notifyApplicationParties(application.id, { type: 'AUDIT_SCHEDULED', data: { scheduledDate: '1 ม.ค.', scheduledTime: '09:00' } });
        } finally {
            await raw.user.update({ where: { id: muted }, data: { notificationSettings: null } });
        }
        const got = await raw.notification.findMany({
            where: { type: 'AUDIT_SCHEDULED', metadata: { path: ['applicationId'], equals: application.id } }, select: { userId: true },
        });
        expect(got.map((n) => n.userId)).not.toContain(muted);
        expect(got).toHaveLength(fx.expectedParties.length - 1);
    });

    test('แจ้งเจ้าหน้าที่ครั้งเดียวต่องวด: งวด 1 ซ้ำไม่แจ้งอีก งวด 2 ของคำขอเดียวกันแจ้งใหม่', async () => {
        const { notifyAdminPaymentReminderReachedNobody } = require('../../services/notification/domain-helpers');
        const application = await fx.makeApplication({ status: 'PENDING_AUDIT_FEE' });
        const alert = (milestone) => notifyAdminPaymentReminderReachedNobody({
            applicationId: application.id, applicationNumber: application.applicationNumber, milestone,
        });
        await alert('M1');
        await alert('M1');
        await alert('M2');
        await alert('M2');
        const alerts = await raw.notification.findMany({
            where: { userId: admin, type: 'PAYMENT_REMINDER_REACHED_NOBODY', metadata: { path: ['applicationId'], equals: application.id } },
            select: { metadata: true },
        });
        expect(alerts.map((a) => a.metadata.milestone).sort()).toEqual(['M1', 'M2']);
    });

    test('อ่านการแจ้งเจ้าหน้าที่ครั้งก่อนแล้ว และยังไม่มีผู้รับ → แจ้งใหม่อีกครั้ง · ยังไม่อ่าน → ไม่แจ้งซ้ำ', async () => {
        const { notifyAdminPaymentReminderReachedNobody } = require('../../services/notification/domain-helpers');
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        const alert = () => notifyAdminPaymentReminderReachedNobody({
            applicationId: application.id, applicationNumber: application.applicationNumber, milestone: 'M1',
        });
        const where = { userId: admin, type: 'PAYMENT_REMINDER_REACHED_NOBODY', metadata: { path: ['applicationId'], equals: application.id } };
        await alert();
        await alert();
        expect(await raw.notification.count({ where })).toBe(1);
        const { userId: _staff, ...everyStaffCopy } = where;
        await raw.notification.updateMany({ where: everyStaffCopy, data: { isRead: true, readAt: new Date() } });
        await alert();
        expect(await raw.notification.count({ where })).toBe(2);
        expect(await raw.notification.count({ where: { ...where, isRead: false } })).toBe(1);
    });

    test('ตัวควบคุม: เตือนถึงผู้รับ → ไม่แจ้งเจ้าหน้าที่', async () => {
        const { application, preDue } = await unpaidM1(new Date('2026-12-04T03:00:00.000Z'));
        await runPaymentReminderSweep(preDue);
        expect(await reminded(application.id, 'PRE_DUE')).toBe(fx.expectedParties.length);
        expect(await raw.notification.count({ where: { userId: admin, metadata: { path: ['applicationId'], equals: application.id } } })).toBe(0);
    });

    async function staffUser(role, organizationId) {
        const id = crypto.randomUUID();
        const key = `remind-staff-${fx.userIds.length}-${fx.sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId: key, providerId: key, password: 'x', role, authType: 'PROVIDER_ID',
                accountType: 'PROVIDER', email: `${key}@example.test`, firstName: 'ผู้ดูแล', lastName: role, organizationId, status: 'ACTIVE',
            },
        });
        fx.userIds.push(id);
        return id;
    }
    const dtamAdmin = (organizationId) => staffUser('system_admin_dtam', organizationId);
    const reachedNobody = (applicationId) => raw.notification.findMany({
        where: { type: 'PAYMENT_REMINDER_REACHED_NOBODY', metadata: { path: ['applicationId'], equals: applicationId } },
        select: { userId: true, isRead: true },
    });

    test('N5: อ่านแล้วคนเดียว อีกคนไม่เคยเปิด → คนที่อ่านแล้วได้แจ้งใหม่ · คนที่ยังไม่อ่านไม่ได้ซ้ำ', async () => {
        const { notifyAdminPaymentReminderReachedNobody } = require('../../services/notification/domain-helpers');
        const dormant = await staffUser('system_admin_platform', fx.orgId);
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        const alert = () => notifyAdminPaymentReminderReachedNobody({
            applicationId: application.id, applicationNumber: application.applicationNumber, milestone: 'M1',
        });
        await alert();
        await raw.notification.updateMany({
            where: { userId: admin, type: 'PAYMENT_REMINDER_REACHED_NOBODY', metadata: { path: ['applicationId'], equals: application.id } },
            data: { isRead: true, readAt: new Date() },
        });
        await alert();
        const rows = await reachedNobody(application.id);
        expect(rows.filter((r) => r.userId === admin).map((r) => r.isRead).sort()).toEqual([false, true]);
        expect(rows.filter((r) => r.userId === dormant)).toEqual([{ userId: dormant, isRead: false }]);
    });

    test('X1: แจ้งเจ้าหน้าที่ถึงผู้ดูแลแพลตฟอร์มและผู้ดูแลกรมขององค์กรของคำขอเท่านั้น ไม่ถึงผู้ดูแลกรมขององค์กรอื่น (รวมองค์กร default)', async () => {
        const { notifyAdminPaymentReminderReachedNobody } = require('../../services/notification/domain-helpers');
        const defaultOrg = await raw.organization.findUnique({ where: { slug: 'default' }, select: { id: true } });
        const ownAdmin = await dtamAdmin(fx.orgId);
        const defaultOrgAdmin = await dtamAdmin(defaultOrg.id);
        const foreignAdmin = await dtamAdmin(fx.foreignOrgId);
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        await notifyAdminPaymentReminderReachedNobody({
            applicationId: application.id, applicationNumber: application.applicationNumber, milestone: 'M1',
        });
        const told = (await reachedNobody(application.id)).map((r) => r.userId);
        expect(told.filter((id) => [defaultOrgAdmin, foreignAdmin].includes(id))).toEqual([]);
        expect(told).toEqual(expect.arrayContaining([admin, ownAdmin]));
    });
});
