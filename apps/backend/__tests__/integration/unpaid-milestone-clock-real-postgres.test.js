/**
 * ไม่ชำระ: นับกำหนดงวด 1 จากวันออกใบเสนอราคา งวด 2 จากวันที่เอกสารผ่าน เลยกำหนด = EXPIRED
 * ขออนุโลมไม่ได้ (operator คำสั่ง 32, 2026-10-07) · real Postgres, นาฬิกาฉีดเข้า
 *
 * D3 (audit 2026-10-07): ตัวเตือนและตัวปิดทำงานจากใบแจ้งหนี้ ซึ่งมินต์ตอนผู้ยื่นกด "ชำระ" เท่านั้น
 * ⇒ ยื่นแล้วไม่กดจ่าย = ค้าง PENDING_DOC_FEE / PENDING_AUDIT_FEE ตลอดไป ไม่มีเตือน ไม่มีปิด
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');
const { addWorkingDays } = require('../../utils/working-days');
const { computeReminderDates } = require('../../services/checkout/checkout-schedule-service');
const { PAYMENT } = require('../../config/business-rules');

const DAY_MS = 86400e3;

d('นาฬิกาค้างชำระเริ่มจากใบเสนอราคา (งวด 1) และวันที่เอกสารผ่าน (งวด 2) (real Postgres)', () => {
    let raw;
    let fx;
    let seq = 0;
    const { runPaymentReminderSweep } = require('../../jobs/payment-reminder-job');
    const { runPaymentClosureSweep } = require('../../jobs/payment-closure-job');

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'clock');
    });

    afterAll(async () => {
        await raw.waiverReopenRequest?.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await raw.paymentReminderLog.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    async function quotationAt(applicationId, createdAt) {
        seq += 1;
        return raw.quotation.create({
            data: {
                applicationId, issuerType: 'PLATFORM', quotationNumber: `QT-CLOCK-${seq}-${fx.sfx}`,
                subtotal: 5500, vat: 385, totalAmount: 5885, status: 'SENT', organizationId: fx.orgId, createdAt,
            },
        });
    }

    const reminders = (applicationId) => raw.notification.findMany({
        where: { type: 'PAYMENT_REMINDER', metadata: { path: ['applicationId'], equals: applicationId } },
        select: { userId: true, metadata: true },
    });
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true, closedReason: true } }));

    async function remindAllThree(due) {
        const startedAt = new Date();
        for (const at of Object.values(computeReminderDates(due))) {
            await runPaymentReminderSweep(new Date(at.getTime() - 3 * 3600e3));
        }
        // The job stamps the wall clock; these sweeps run on injected days, so sentAt follows the intended day.
        await raw.$executeRaw`UPDATE payment_reminder_logs SET "sentAt" = "intendedDate" WHERE "sentAt" >= ${startedAt}`;
    }

    test('งวด 1: ไม่เคยกดจ่าย (ไม่มีใบแจ้งหนี้) → เตือนสามครั้งถึงผู้ยื่นและผู้ถือ แล้วปิดเมื่อเลยกำหนด', async () => {
        const issuedAt = new Date('2026-11-03T03:00:00.000Z');
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE', reviewerId: fx.reviewer.id });
        await quotationAt(application.id, issuedAt);
        expect(await raw.invoice.count({ where: { applicationId: application.id } })).toBe(0);
        const due = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);

        await remindAllThree(due);
        await remindAllThree(due);

        const sent = await reminders(application.id);
        expect(sent).toHaveLength(3 * fx.expectedParties.length);
        expect([...new Set(sent.map((r) => r.userId))].sort()).toEqual(fx.expectedParties);
        expect(new Set(sent.map((r) => r.metadata.reminderType))).toEqual(new Set(['PRE_DUE', 'DUE_DATE', 'OVERDUE_NOTICE']));

        await runPaymentClosureSweep(new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS - 1) * DAY_MS));
        expect((await statusOf(application.id)).status).toBe('PENDING_DOC_FEE');

        await runPaymentClosureSweep(new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS));
        expect(await statusOf(application.id)).toEqual({ status: 'EXPIRED', closedReason: 'PAYMENT_ABANDONED' });

        const closedNotices = await raw.notification.findMany({
            where: { type: 'APPLICATION_EXPIRED', metadata: { path: ['applicationId'], equals: application.id } },
            select: { userId: true, message: true },
        });
        expect(closedNotices.map((n) => n.userId).sort()).toEqual(fx.expectedParties);
        for (const n of closedNotices) { expect(n.message).not.toMatch(/อนุโลม|กรณีพิเศษ/); }

        const waiver = require('../../services/waiver-reopen-service');
        await expect(waiver.createReopenRequest({
            applicationId: application.id, user: { ...fx.reviewer }, reason: 'ผู้ยื่นโทรแจ้งว่าป่วยหนักช่วงครบกำหนดชำระ ขอผ่อนผันเป็นกรณีพิเศษ', reasonCode: 'LENIENCY',
        })).rejects.toMatchObject({ code: 'WAIVER_PAYMENT_ABANDONED', statusCode: 409 });
    });

    test('งวด 1: เตือนไม่ครบสามครั้ง → ไม่ปิดแม้เลยกำหนด', async () => {
        const issuedAt = new Date('2026-11-04T03:00:00.000Z');
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        await quotationAt(application.id, issuedAt);
        const due = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
        const { PRE_DUE } = computeReminderDates(due);
        await runPaymentReminderSweep(new Date(PRE_DUE.getTime() - 3 * 3600e3));

        await runPaymentClosureSweep(new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS));
        expect((await statusOf(application.id)).status).toBe('PENDING_DOC_FEE');
    });

    test('งวด 2: นับจากวันที่เอกสารผ่าน ไม่ใช่วันออกใบเสนอราคา', async () => {
        const quotedAt = new Date('2026-11-01T03:00:00.000Z');
        const approvedAt = new Date('2026-11-10T03:00:00.000Z');
        const application = await fx.makeApplication({
            status: 'PENDING_AUDIT_FEE', formData: { docApprovedAt: approvedAt.toISOString() },
        });
        await quotationAt(application.id, quotedAt);
        await fx.settle(application.id, 'M1');

        const wrongDue = addWorkingDays(quotedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M2);
        await runPaymentReminderSweep(new Date(computeReminderDates(wrongDue).PRE_DUE.getTime() - 3 * 3600e3));
        expect(await reminders(application.id)).toHaveLength(0);

        const due = addWorkingDays(approvedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M2);
        await remindAllThree(due);
        const sent = await reminders(application.id);
        expect(sent).toHaveLength(3 * fx.expectedParties.length);
        expect(sent.every((r) => r.metadata.milestone === 'M2')).toBe(true);

        await runPaymentClosureSweep(new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS));
        expect(await statusOf(application.id)).toEqual({ status: 'EXPIRED', closedReason: 'PAYMENT_ABANDONED' });
    });

    const gateway = () => require('../../services/payment/payment-adapter').getPaymentAdapter();

    async function openCheckout(application, intentStatus, dueDate = new Date()) {
        seq += 1;
        const intent = await gateway().createCheckoutSession({ amountSatang: 588500, currency: 'thb', idempotencyKey: `clock-${application.id}` });
        (await gateway().getPaymentIntent(intent.id)).status = intentStatus;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-CLOCK-${seq}-${fx.sfx}`, applicationId: application.id, healthId: fx.applicant.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 5500, totalAmount: 5885, dueDate, status: 'pending',
                organizationId: fx.orgId, metadata: {},
            },
        });
        const order = await raw.checkoutOrder.create({
            data: {
                applicationId: application.id, milestone: 'M1', platformFeeNet: 5500, platformFeeVat: 385, platformFeeGross: 5885,
                totalPayableAmount: 5885, status: 'PENDING_PAYMENT', invoiceId: invoice.id, stripePaymentIntentId: intent.id,
                organizationId: fx.orgId,
            },
        });
        return { intentId: intent.id, invoice, order };
    }

    async function abandonedM1(issuedAt) {
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        await quotationAt(application.id, issuedAt);
        const due = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
        await remindAllThree(due);
        return { application, due, closeAt: new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS) };
    }

    test('ปิดเป็น EXPIRED พร้อมยกเลิก QR ที่ gateway และปลดคำสั่งชำระกับใบแจ้งหนี้ที่ค้างอยู่ (security review M3)', async () => {
        const { application, due, closeAt } = await abandonedM1(new Date('2026-11-05T03:00:00.000Z'));
        const { intentId, invoice, order } = await openCheckout(application, 'requires_payment_method', due);

        await runPaymentClosureSweep(closeAt);

        expect(await statusOf(application.id)).toEqual({ status: 'EXPIRED', closedReason: 'PAYMENT_ABANDONED' });
        expect((await gateway().getPaymentIntent(intentId)).status).toBe('canceled');
        expect((await raw.checkoutOrder.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
        expect((await raw.invoice.findUnique({ where: { id: invoice.id } })).isDeleted).toBe(true);
    });

    test.each(['processing', 'succeeded'])('เงินกำลังเข้า (PaymentIntent %s) → ไม่ปิด · คำสั่งชำระไม่ถูกแตะ', async (intentStatus) => {
        const { application, due, closeAt } = await abandonedM1(new Date('2026-11-06T03:00:00.000Z'));
        const { intentId, order } = await openCheckout(application, intentStatus, due);

        await runPaymentClosureSweep(closeAt);

        expect((await statusOf(application.id)).status).toBe('PENDING_DOC_FEE');
        expect((await gateway().getPaymentIntent(intentId)).status).toBe(intentStatus);
        expect((await raw.checkoutOrder.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
    });

    test('มีใบแจ้งหนี้แล้ว: ข้อความเตือนและการปิดใช้วันครบกำหนดบนใบ (L2: ไม่ให้สองวันที่ขัดกัน)', async () => {
        const issuedAt = new Date('2026-11-12T03:00:00.000Z');
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        await quotationAt(application.id, issuedAt);
        const recomputed = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
        const printed = addWorkingDays(recomputed, 2);
        await openCheckout(application, 'requires_payment_method', printed);

        await runPaymentReminderSweep(new Date(computeReminderDates(recomputed).DUE_DATE.getTime() - 3 * 3600e3));
        await remindAllThree(printed);
        const sent = await reminders(application.id);
        expect(sent).toHaveLength(3 * fx.expectedParties.length);
        expect(new Set(sent.map((r) => r.metadata.dueDate))).toEqual(new Set([printed.toISOString()]));
        expect(new Set(sent.map((r) => r.metadata.reminderType))).toEqual(new Set(['PRE_DUE', 'DUE_DATE', 'OVERDUE_NOTICE']));

        await runPaymentClosureSweep(new Date(recomputed.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS));
        expect((await statusOf(application.id)).status).toBe('PENDING_DOC_FEE');
        await runPaymentClosureSweep(new Date(printed.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS));
        expect((await statusOf(application.id)).status).toBe('EXPIRED');
    });

    describe('L6: ปิดได้เมื่อเตือนถึงคนจริงครบสามครั้ง · ตัวเตือนตามส่งที่พลาด · งวด 2 ไม่มี docApprovedAt', () => {
        test('มีแถวเตือนครบสามแต่ส่งไม่ถึงใคร (sentAt ว่าง) → ไม่ปิด', async () => {
            const issuedAt = new Date('2026-11-17T03:00:00.000Z');
            const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
            await quotationAt(application.id, issuedAt);
            const due = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
            for (const [reminderType, intendedDate] of Object.entries(computeReminderDates(due))) {
                await raw.paymentReminderLog.create({
                    data: { applicationId: application.id, milestone: 'M1', reminderType, intendedDate, organizationId: fx.orgId },
                });
            }
            await runPaymentClosureSweep(new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS));
            expect((await statusOf(application.id)).status).toBe('PENDING_DOC_FEE');
        });

        test('N1: เตือนครั้งแรกไม่ถึงใคร → รอบถัดไปที่มีผู้รับแล้วส่งซ้ำบนแถวเดิมและประทับ sentAt · ปิดได้หลังช่วงรอ', async () => {
            const loneId = crypto.randomUUID();
            const loneKey = `clock-lone-${loneId.slice(0, 8)}-${fx.sfx}`;
            await raw.user.create({
                data: {
                    id: loneId, canonicalId: loneKey, healthId: loneKey, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                    email: `${loneKey}@example.test`, firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgId,
                },
            });
            fx.userIds.push(loneId);
            const holder = await raw.entity.create({
                data: { type: 'JURISTIC', displayName: `บริษัท ว่าง ${fx.sfx} จำกัด`, juristicId: '0105561234586', organizationId: fx.orgId },
            });
            fx.entityIds.push(holder.id);

            const issuedAt = new Date('2026-11-24T03:00:00.000Z');
            const application = await fx.makeApplication({
                status: 'PENDING_DOC_FEE', healthId: loneKey, submitterId: loneId, entityId: holder.id,
            });
            await quotationAt(application.id, issuedAt);
            const due = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
            const { PRE_DUE } = computeReminderDates(due);
            const ledger = () => raw.paymentReminderLog.findMany({
                where: { applicationId: application.id }, select: { reminderType: true, sentAt: true },
            });

            await runPaymentReminderSweep(new Date(PRE_DUE.getTime() - 3 * 3600e3));
            expect(await ledger()).toEqual([{ reminderType: 'PRE_DUE', sentAt: null }]);
            expect(await reminders(application.id)).toHaveLength(0);

            await raw.entityMembership.create({ data: { userId: loneId, entityId: holder.id, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgId } });
            expect(await runPaymentReminderSweep(new Date(PRE_DUE.getTime() - 1 * 3600e3))).toMatchObject({ failed: 0 });
            const rows = await ledger();
            expect(rows).toHaveLength(1);
            expect(rows[0].reminderType).toBe('PRE_DUE');
            expect(rows[0].sentAt).toBeInstanceOf(Date);
            const told = await reminders(application.id);
            expect(told.map((r) => r.userId)).toEqual([loneId]);

            await runPaymentReminderSweep(new Date(PRE_DUE.getTime() - 30 * 60e3));
            expect(await reminders(application.id)).toHaveLength(1);
            expect(await ledger()).toHaveLength(1);

            await remindAllThree(due);
            await runPaymentClosureSweep(new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 10) * DAY_MS));
            expect(await statusOf(application.id)).toEqual({ status: 'EXPIRED', closedReason: 'PAYMENT_ABANDONED' });
        });

        test('ตัวเตือนไม่ได้รันในวันกำหนด → รอบถัดไปตามส่งทีละฉบับตามลำดับ ข้อความบอกสถานะจริงของวันนั้น', async () => {
            const issuedAt = new Date('2026-11-18T03:00:00.000Z');
            const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
            await quotationAt(application.id, issuedAt);
            const due = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
            const late = new Date(computeReminderDates(due).OVERDUE_NOTICE.getTime() + 2 * DAY_MS);

            const ledger = async () => (await raw.paymentReminderLog.findMany({
                where: { applicationId: application.id, sentAt: { not: null } }, select: { reminderType: true },
            })).map((r) => r.reminderType).sort();

            await runPaymentReminderSweep(late);
            expect(await ledger()).toEqual(['PRE_DUE']);
            const first = await reminders(application.id);
            expect(first).toHaveLength(fx.expectedParties.length);
            expect(first.every((r) => r.metadata.reminderType === 'OVERDUE_NOTICE')).toBe(true);

            await runPaymentReminderSweep(new Date(late.getTime() + DAY_MS));
            expect(await ledger()).toEqual(['DUE_DATE', 'PRE_DUE']);
            await runPaymentReminderSweep(new Date(late.getTime() + 2 * DAY_MS));
            expect(await ledger()).toEqual(['DUE_DATE', 'OVERDUE_NOTICE', 'PRE_DUE']);

            await runPaymentClosureSweep(new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS));
            expect((await statusOf(application.id)).status).toBe('EXPIRED');
        });

        test('งวด 2 ไม่มี docApprovedAt → นับจากเหตุการณ์ DOC_APPROVED ใน workflowHistory', async () => {
            const approvedAt = new Date('2026-11-19T03:00:00.000Z');
            const application = await fx.makeApplication({
                status: 'PENDING_AUDIT_FEE',
                formData: {},
                workflowHistory: [
                    { action: 'WORKFLOW_TRANSITION', fromStatus: 'UNDER_REVIEW', toStatus: 'DOC_APPROVED', timestamp: approvedAt.toISOString() },
                    { action: 'WORKFLOW_TRANSITION', fromStatus: 'DOC_APPROVED', toStatus: 'PENDING_AUDIT_FEE', timestamp: new Date(approvedAt.getTime() + 60e3).toISOString() },
                ],
            });
            await fx.settle(application.id, 'M1');
            const due = addWorkingDays(approvedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M2);
            await remindAllThree(due);
            const sent = await reminders(application.id);
            expect(sent).toHaveLength(3 * fx.expectedParties.length);
            expect(new Set(sent.map((r) => r.metadata.dueDate))).toEqual(new Set([due.toISOString()]));
        });

        describe('คำสั่ง 39: ปิดได้เมื่อผ่าน 7 วันหลังการเตือนครั้งที่ 3 ที่ส่งถึงผู้รับจริง', () => {
            async function remindedM1(issuedAtIso, thirdSentAt) {
                const issuedAt = new Date(issuedAtIso);
                const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
                await quotationAt(application.id, issuedAt);
                const due = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
                const now = new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 10) * DAY_MS);
                for (const [reminderType, intendedDate] of Object.entries(computeReminderDates(due))) {
                    await raw.paymentReminderLog.create({
                        data: {
                            applicationId: application.id, milestone: 'M1', reminderType, intendedDate, organizationId: fx.orgId,
                            sentAt: reminderType === 'OVERDUE_NOTICE' ? thirdSentAt(now) : intendedDate,
                        },
                    });
                }
                return { application, now };
            }

            test('เตือนครั้งที่ 3 ส่งไปเมื่อ 6 วันก่อน → ไม่ปิด', async () => {
                const { application, now } = await remindedM1('2026-11-03T03:00:00.000Z', (n) => new Date(n.getTime() - 6 * DAY_MS));
                await runPaymentClosureSweep(now);
                expect((await statusOf(application.id)).status).toBe('PENDING_DOC_FEE');
            });

            test('เตือนครั้งที่ 3 ส่งไปเมื่อ 7 วันก่อน → ปิด', async () => {
                const { application, now } = await remindedM1('2026-11-04T03:00:00.000Z', (n) => new Date(n.getTime() - 7 * DAY_MS));
                await runPaymentClosureSweep(now);
                expect(await statusOf(application.id)).toEqual({ status: 'EXPIRED', closedReason: 'PAYMENT_ABANDONED' });
            });

            test('เตือนครั้งที่ 3 มีแถวแต่ sentAt ว่าง (ไม่ถึงผู้รับ) → ไม่ปิด แม้ผ่านไปนานแล้ว', async () => {
                const { application, now } = await remindedM1('2026-11-05T03:00:00.000Z', () => null);
                await runPaymentClosureSweep(now);
                expect((await statusOf(application.id)).status).toBe('PENDING_DOC_FEE');
            });

            test('dry-run นับเฉพาะแถวที่พ้นช่วงรอ 7 วัน', async () => {
                const inGrace = await remindedM1('2026-11-06T03:00:00.000Z', (n) => new Date(n.getTime() - 6 * DAY_MS));
                const pastGrace = await remindedM1('2026-11-06T03:00:00.000Z', (n) => new Date(n.getTime() - 7 * DAY_MS));
                const dry = await runPaymentClosureSweep(pastGrace.now, { dryRun: true });
                const before = dry.wouldClose;
                await raw.paymentReminderLog.updateMany({
                    where: { applicationId: pastGrace.application.id, reminderType: 'OVERDUE_NOTICE' },
                    data: { sentAt: new Date(pastGrace.now.getTime() - 6 * DAY_MS) },
                });
                const dry2 = await runPaymentClosureSweep(pastGrace.now, { dryRun: true });
                expect(before - dry2.wouldClose).toBe(1);
                expect((await statusOf(inGrace.application.id)).status).toBe('PENDING_DOC_FEE');
                expect((await statusOf(pastGrace.application.id)).status).toBe('PENDING_DOC_FEE');
            });
        });

        test('dry-run นับอย่างเดียว: ไม่เขียนสมุดเตือน ไม่ส่ง ไม่ปิด', async () => {
            const issuedAt = new Date('2026-11-20T03:00:00.000Z');
            const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
            await quotationAt(application.id, issuedAt);
            const due = addWorkingDays(issuedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
            const late = new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS);

            const dry = await runPaymentReminderSweep(late, { dryRun: true });
            expect(dry.matched).toBeGreaterThanOrEqual(1);
            expect(await raw.paymentReminderLog.count({ where: { applicationId: application.id } })).toBe(0);
            expect(await reminders(application.id)).toHaveLength(0);

            await remindAllThree(due);
            const closeDry = await runPaymentClosureSweep(late, { dryRun: true });
            expect(closeDry).toMatchObject({ closed: 0 });
            expect(closeDry.wouldClose).toBeGreaterThanOrEqual(1);
            expect((await statusOf(application.id)).status).toBe('PENDING_DOC_FEE');
        });
    });
});
