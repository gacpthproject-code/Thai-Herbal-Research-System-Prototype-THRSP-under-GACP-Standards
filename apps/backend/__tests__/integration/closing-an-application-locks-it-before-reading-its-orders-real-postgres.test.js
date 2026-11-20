/**
 * การปิดคำขอที่ด่านชำระ (ผู้ยื่นถอน / ตัวปิดเพราะไม่ชำระ) ต้องล็อกแถวคำขอก่อนอ่านคำสั่งชำระ
 * (security veto 2026-10-07 V1/V2) · real Postgres · ประตูถอนจริง ตัวปิดจริง และ createCheckoutForApplication จริง
 *
 * V1: ประตูถอนและ closeOne อ่านคำสั่งชำระที่ค้างก่อนล็อกคำขอ การสร้างคำสั่งชำระที่ล็อกคำขอและใส่แถวคำสั่งชำระ
 *     ไว้ยังไม่ commit จึงมองไม่เห็น → ปิดคำขอโดยไม่ปลดคำสั่งชำระใหม่ → QR ใช้จ่ายได้บนคำขอที่ปิดแล้ว
 * V2: การกลับเข้าหน้าชำระบนคำสั่งชำระเดิมเปลี่ยน intent โดยไม่ล็อกคำขอ และผลปลด (false) ถูกทิ้ง
 *     → ปิดคำขอ ขณะคำสั่งชำระยังค้างพร้อม intent ใหม่
 *
 * ทุกฉากตรวจข้อเดียวกัน: ถ้าคำขอปิดแล้ว ต้องไม่มีคำสั่งชำระค้างจ่ายที่มี intent และการชำระต้องไม่ได้ client secret
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const { dropConsentRows } = require('../../test-support/consent-history');
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

const DAY_MS = 86400e3;
const CLOSED = new Set(['CANCELLED', 'EXPIRED']);

d('ปิดคำขอที่ด่านชำระพร้อมกับการชำระ: ล็อกคำขอก่อนอ่านคำสั่งชำระ (real Postgres)', () => {
    let raw;
    let fx;
    let door;
    let seq = 0;
    const quotationService = require('../../services/quotation-service');
    const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
    const { createCheckoutForApplication } = require('../../services/checkout/stripe-checkout-service');
    const { runPaymentReminderSweep } = require('../../jobs/payment-reminder-job');
    const { runPaymentClosureSweep } = require('../../jobs/payment-closure-job');
    const { computeReminderDates } = require('../../services/checkout/checkout-schedule-service');
    const { addWorkingDays } = require('../../utils/working-days');
    const { PAYMENT } = require('../../config/business-rules');
    const mockAdapter = require('../../services/payment/mock-payment-adapter');
    const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');
    const gateway = () => require('../../services/payment/payment-adapter').getPaymentAdapter();

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        mockAdapter.__reset();
        fx = await buildApplicantParties(raw, 'lockfirst');
        await raw.userConsent.create({
            data: {
                userId: fx.applicant.id, organizationId: fx.orgId, category: ConsentCategory.PAYMENT_TERMS,
                version: ConsentVersions.PAYMENT_TERMS, granted: true, grantedAt: new Date(),
            },
        });
        door = express();
        door.use(express.json());
        door.use('/api/applications', require('../../routes/api/applications/application-withdraw'));
    });

    afterAll(async () => {
        await raw.paymentReminderLog.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await raw.invoiceLineItem?.deleteMany({ where: { invoice: { applicationId: { in: fx.appIds } } } }).catch(() => {});
        await dropConsentRows(raw, fx.applicant.id).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    async function acceptedPendingDocFee() {
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        expect(await issueQuotationOnSubmit({ application, actorId: null })).toEqual({ issued: true });
        const [qt] = await raw.quotation.findMany({ where: { applicationId: application.id, isDeleted: false } });
        await quotationService.markQuotationAccepted(qt.id, { acceptedBy: null, snapshot: quotationService.buildAcceptanceSnapshot(qt) });
        return { application, quotedAt: qt.createdAt };
    }

    const pay = (application) => createCheckoutForApplication({
        applicationId: application.id, milestone: 'M1',
        actor: {
            id: fx.applicant.id, healthId: fx.applicant.canonicalId, role: 'health',
            holderScope: { userId: fx.applicant.id, readIds: [fx.entityId], editIds: [fx.entityId] },
        },
    }).then((r) => ({ ok: true, clientSecret: r.clientSecret }), (err) => ({ ok: false, code: err.code }));

    const withdraw = (application) => {
        mockActor.current = { id: fx.applicant.id, role: 'health', canonicalRole: 'health', organizationId: fx.orgId };
        return request(door).post(`/api/applications/${application.id}/withdraw`).send({ reason: 'เปลี่ยนแผนการปลูกปีนี้' })
            .then((res) => ({ status: res.status, code: res.body.code }));
    };

    /** Reminders delivered on their own days, so the sweep at the returned instant may close M1. */
    async function remindedAndDue(quotedAt) {
        const due = addWorkingDays(quotedAt, PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1);
        const startedAt = new Date();
        for (const at of Object.values(computeReminderDates(due))) {
            await runPaymentReminderSweep(new Date(at.getTime() - 3 * 3600e3));
        }
        await raw.$executeRaw`UPDATE payment_reminder_logs SET "sentAt" = "intendedDate" WHERE "sentAt" >= ${startedAt}`;
        return new Date(due.getTime() + (PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS + 1) * DAY_MS);
    }
    const close = (at) => runPaymentClosureSweep(at);

    async function lockWaiters() {
        const [{ n }] = await raw.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        return n;
    }
    async function untilWaiters(n, alsoDone = null) {
        let done = false;
        if (alsoDone) { alsoDone.then(() => { done = true; }); }
        for (let i = 0; i < 200; i += 1) {
            if (done || (await lockWaiters()) >= n) { return; }
            await new Promise((r) => setTimeout(r, 25));
        }
        throw new Error(`never saw ${n} backends waiting on a lock`);
    }

    /** Another session holds a lock until release(): the interleaving is forced, not hoped for. */
    function hold(work, { commit = false } = {}) {
        let release;
        const released = new Promise((r) => { release = r; });
        let ready;
        const holding = new Promise((r) => { ready = r; });
        const tx = raw.$transaction(async (t) => {
            await work(t);
            ready();
            await released;
            if (!commit) { throw Object.assign(new Error('rollback'), { code: 'HOLD_DONE' }); }
        }, { timeout: 30000 }).catch((err) => { if (err.code !== 'HOLD_DONE') { throw err; } });
        return holding.then(() => ({ release: async () => { release(); await tx; } }));
    }

    /**
     * An uncommitted invoice on (application, M1): checkout's mint blocks on its unique index right after it locked
     * the application and inserted its order. Foreign-key triggers are off in this session only, so the blocker
     * takes no KEY SHARE lock on the application and every wait below is on the lock checkout holds.
     */
    const holdTheMintAfterItsOrder = (application) => hold(async (t) => {
        seq += 1;
        await t.$executeRaw`SET LOCAL session_replication_role = replica`;
        await t.invoice.create({
            data: {
                invoiceNumber: `INV-LOCKFIRST-${seq}-${fx.sfx}`, applicationId: application.id, healthId: fx.applicant.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 5500, totalAmount: 5885, dueDate: new Date(), status: 'pending',
                organizationId: fx.orgId, metadata: {},
            },
        });
    });
    const holdTheApplication = (application) => hold(async (t) => {
        await t.$queryRaw`SELECT id FROM applications WHERE id = ${application.id} FOR UPDATE`;
    });

    async function assertNoMoneyDoorOnAClosedApplication(application, checkout) {
        const { status } = await raw.application.findUnique({ where: { id: application.id }, select: { status: true } });
        const open = await raw.checkoutOrder.count({
            where: { applicationId: application.id, status: 'PENDING_PAYMENT', stripePaymentIntentId: { not: null } },
        });
        const closed = CLOSED.has(status);
        expect({ closed, openOrdersWithIntent: closed ? open : 0, checkoutHandedAQr: closed && checkout.ok })
            .toEqual({ closed, openOrdersWithIntent: 0, checkoutHandedAQr: false });
        return { status, open };
    }

    async function v1(closer, application) {
        const blocker = await holdTheMintAfterItsOrder(application);
        const checkout = pay(application);
        await untilWaiters(1);
        const closing = closer();
        await untilWaiters(2, closing);
        await blocker.release();
        const [outcome] = await Promise.all([checkout, closing]);
        return outcome;
    }

    async function v2(closer, application) {
        const first = await pay(application);
        expect(first.ok).toBe(true);
        const order = await raw.checkoutOrder.findFirst({ where: { applicationId: application.id, status: 'PENDING_PAYMENT' } });
        (await gateway().getPaymentIntent(order.stripePaymentIntentId)).status = 'canceled';

        const blocker = await holdTheApplication(application);
        const closing = closer();
        await untilWaiters(1, closing);
        const checkout = pay(application);
        await untilWaiters(2, checkout);
        await blocker.release();
        const [outcome] = await Promise.all([checkout, closing]);
        return outcome;
    }

    test('V1 ถอน: การชำระล็อกคำขอและใส่คำสั่งชำระไว้ยังไม่ commit → ถอนรอแล้วปลดคำสั่งนั้น · การชำระไม่ได้ QR', async () => {
        const { application } = await acceptedPendingDocFee();
        const checkout = await v1(() => withdraw(application), application);
        const { status } = await assertNoMoneyDoorOnAClosedApplication(application, checkout);
        expect(status).toBe('CANCELLED');
    });

    test('V1 ปิดเพราะไม่ชำระ: เช่นเดียวกัน → EXPIRED พร้อมปลดคำสั่งชำระใหม่ · การชำระไม่ได้ QR', async () => {
        const { application, quotedAt } = await acceptedPendingDocFee();
        const at = await remindedAndDue(quotedAt);
        const checkout = await v1(() => close(at), application);
        const { status } = await assertNoMoneyDoorOnAClosedApplication(application, checkout);
        expect(status).toBe('EXPIRED');
    });

    test('V2 ถอน: กลับเข้าหน้าชำระเปลี่ยน intent ระหว่างถอน → ไม่มีคำสั่งชำระค้างบนคำขอที่ปิด', async () => {
        const { application } = await acceptedPendingDocFee();
        const checkout = await v2(() => withdraw(application), application);
        await assertNoMoneyDoorOnAClosedApplication(application, checkout);
    });

    test('V2 ปิดเพราะไม่ชำระ: กลับเข้าหน้าชำระเปลี่ยน intent ระหว่างปิด → ไม่มีคำสั่งชำระค้างบนคำขอที่ปิด', async () => {
        const { application, quotedAt } = await acceptedPendingDocFee();
        const at = await remindedAndDue(quotedAt);
        const checkout = await v2(() => close(at), application);
        await assertNoMoneyDoorOnAClosedApplication(application, checkout);
    });

    /**
     * A writer that does not take the application lock moves the open order to an intent the closer never
     * released, after the closer read it and before it retired it: the retire matches nothing.
     */
    async function orderMovedUnderTheCloser(closer, application) {
        expect((await pay(application)).ok).toBe(true);
        const order = await raw.checkoutOrder.findFirst({ where: { applicationId: application.id, status: 'PENDING_PAYMENT' } });
        (await gateway().getPaymentIntent(order.stripePaymentIntentId)).status = 'canceled';
        const unlockedWriter = await hold(async (t) => {
            await t.$executeRaw`UPDATE checkout_orders SET stripe_payment_intent_id = ${`pi_moved_${order.id}`} WHERE id = ${order.id}`;
        }, { commit: true });
        const closing = closer();
        await untilWaiters(1, closing);
        await unlockedWriter.release();
        return closing;
    }

    test('V2 ถอน: คำสั่งชำระถูกเปลี่ยน intent ก่อนปลดได้ (ปลดไม่สำเร็จ) → 409 WITHDRAW_PAYMENT_IN_FLIGHT · ไม่ปิดคำขอ', async () => {
        const { application } = await acceptedPendingDocFee();
        const outcome = await orderMovedUnderTheCloser(() => withdraw(application), application);
        expect(outcome).toEqual({ status: 409, code: 'WITHDRAW_PAYMENT_IN_FLIGHT' });
        const { status, open } = await assertNoMoneyDoorOnAClosedApplication(application, { ok: false });
        expect({ status, open }).toEqual({ status: 'PENDING_DOC_FEE', open: 1 });
    });

    test('V2 ปิดเพราะไม่ชำระ: คำสั่งชำระถูกเปลี่ยน intent ก่อนปลดได้ → ข้ามคำขอนี้รอบนี้ ไม่ปิด', async () => {
        const { application, quotedAt } = await acceptedPendingDocFee();
        const at = await remindedAndDue(quotedAt);
        await orderMovedUnderTheCloser(() => close(at), application);
        const { status, open } = await assertNoMoneyDoorOnAClosedApplication(application, { ok: false });
        expect({ status, open }).toEqual({ status: 'PENDING_DOC_FEE', open: 1 });
    });

    test('ตัวควบคุม: ไม่มีการแข่งกัน → ชำระได้ QR แล้วถอนปลดคำสั่งชำระนั้น', async () => {
        const { application } = await acceptedPendingDocFee();
        const checkout = await pay(application);
        expect(checkout.ok).toBe(true);
        expect(await withdraw(application)).toEqual({ status: 200, code: undefined });
        expect(await raw.checkoutOrder.count({ where: { applicationId: application.id, status: 'PENDING_PAYMENT' } })).toBe(0);
    });
});
