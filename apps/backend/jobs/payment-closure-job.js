'use strict';

/**
 * Payment-closure sweep — an unpaid milestone left past its due date is closed as
 * EXPIRED ("ยกเลิก (เลยกำหนด)") with closedReason PAYMENT_ABANDONED.
 *
 * Operator order 32 (2026-10-07): the clock counts from when the milestone's price was
 * issued (M1: the quotation; M2: the document approval), not from an invoice, which exists
 * only once the applicant pressed "pay". A PAYMENT_ABANDONED close cannot be reopened
 * (waiver-reopen-service refuses it).
 *
 * Never moves money. It retires the milestone's unpaid checkout (order → CANCELLED, unpaid
 * invoice soft-deleted, pending charge row CANCELLED) in the same transaction as the close, and
 * cancels the open payment intents at the gateway BEFORE that transaction, so no QR left open
 * can take money for an EXPIRED application (security review 2026-10-07 M3). Close condition,
 * ALL must hold:
 *   1. the application still stands at the milestone's payment gate (PENDING_DOC_FEE for M1,
 *      PENDING_AUDIT_FEE for M2) — also the idempotency guard;
 *   2. now is MORE than PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS calendar days past the due
 *      date (config/business-rules.js, never hardcoded here);
 *   3. all three reminders of that milestone were delivered (sentAt stamped: they reached a
 *      recipient, not merely a ledger row), AND at least the dated grace (order 39: 7 calendar
 *      days, config PAYMENT_CLOSURE_GRACE_AFTER_FINAL_REMINDER) has passed since the third
 *      (OVERDUE_NOTICE) was actually sent;
 *   4. no intent of that milestone is succeeded / processing / requires_capture, and every open
 *      one was cancelled (services/checkout/release-open-intents.js; fail-SAFE on a gateway
 *      error). A checkout opened after that check makes the transaction skip the close.
 *
 * The close goes through the canonical machinery like the revision-deadline cron:
 * cross-tenant scan → runWithTenantContext → buildTransitionUpdate → writeApplicationStatus
 * with an optimistic lock and one audit row.
 *
 * Registered in jobs/scheduler.js — daily '0 3 * * *' Asia/Bangkok.
 *
 * @module jobs/payment-closure-job
 */

const { prisma } = require('../services/prisma-database');
const { releaseOpenIntents } = require('../services/checkout/release-open-intents');
const { retirePendingOrdersInTx, RETIRE_REASONS } = require('../services/checkout/retire-checkout-order');
const { lockApplicationRow } = require('../services/checkout/application-row-lock');
const { NotifyType } = require('../services/notification-service');
const { notifyApplicationParties } = require('../services/notification/application-parties');
const { notifyAdminPaymentClosureHalted } = require('../services/notification/domain-helpers');
const { runWithTenantContext, withoutTenantScope } = require('../services/tenant-context');
const { createLogger } = require('../shared/logger');
const { APPLICATION_STATUSES } = require('../shared/workflow-state-machine');
const { writeApplicationStatus } = require('../services/application-status-writer');
const { buildTransitionUpdate } = require('../services/workflow-transition-service');
const { auditLogger, AuditCategory, ResourceType } = require('../middleware/audit-logger');
const { PAYMENT } = require('../config/business-rules');
const { GATE_MILESTONE, listUnpaidMilestones } = require('../services/billing/unpaid-milestones');
const { closureGraceDaysAt, graceElapsed } = require('../services/billing/closure-grace');

const logger = createLogger('payment-closure');

/** All three must have been delivered for the milestone before it may be closed. */
const REQUIRED_REMINDER_TYPES = ['PRE_DUE', 'DUE_DATE', 'OVERDUE_NOTICE'];
/** The third reminder: the grace counts from when this one was sent. */
const FINAL_REMINDER_TYPE = 'OVERDUE_NOTICE';

/** The only terminal close-reason this cron may stamp (frozen M4 vocab). */
const CLOSED_REASON = 'PAYMENT_ABANDONED';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thrown inside closeOne's transaction: roll back whatever it retired and skip the case this run. */
const ORDER_CHANGED = 'PAYMENT_CLOSURE_ORDER_CHANGED';
const SKIP_THIS_RUN = new Set([ORDER_CHANGED, 'CONCURRENCY_CONFLICT']);

/**
 * Whether the milestone is fully reminded and the grace after the third reminder has run out.
 * Only rows with sentAt count; the grace counts from the latest sentAt of the third reminder.
 */
async function remindedAndGraceElapsed(applicationId, milestone, graceDays, now) {
    const logs = await withoutTenantScope(() => prisma.paymentReminderLog.findMany({
        where: { applicationId, milestone, sentAt: { not: null } },
        select: { reminderType: true, sentAt: true },
    }));
    const types = new Set(logs.map((l) => l.reminderType));
    if (!REQUIRED_REMINDER_TYPES.every((t) => types.has(t))) { return false; }
    const thirdSentAt = logs
        .filter((l) => l.reminderType === FINAL_REMINDER_TYPE && l.sentAt)
        .map((l) => l.sentAt)
        .reduce((latest, at) => (!latest || at > latest ? at : latest), null);
    return Boolean(thirdSentAt) && graceElapsed(thirdSentAt, graceDays, now);
}

/** The intent ids of every order of the milestone: the gateway decides whether the close may run. */
async function milestoneIntentIds(applicationId, milestone) {
    const orders = await withoutTenantScope(() => prisma.checkoutOrder.findMany({
        where: { applicationId, milestone, stripePaymentIntentId: { not: null } },
        select: { stripePaymentIntentId: true },
    }));
    return orders.map((o) => o.stripePaymentIntentId);
}

/**
 * Daily sweep.
 * @param {Date} [now] — clock injection (tests); defaults to the real clock.
 * @param {{ dryRun?: boolean }} [opts] dryRun = count the closes that pass conditions 1-3 incl. the grace (the
 *   gateway is not asked: asking may cancel an intent), write nothing
 * @returns {Promise<{ scanned: number, closed: number, wouldClose: number, skipped: number, errors: number }>}
 */
async function runPaymentClosureSweep(now = new Date(), { dryRun = false } = {}) {
    const halt = async (cause) => {
        if (!dryRun) { await notifyAdminPaymentClosureHalted({ cause }); }
        throw new Error(`[payment-closure] ${cause} — refusing to close`);
    };
    const thresholdDays = PAYMENT?.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS;
    if (!Number.isFinite(thresholdDays)) { await halt('PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS is not configured'); }
    const graceDays = closureGraceDaysAt(now);
    if (!Number.isFinite(graceDays)) { await halt('no PAYMENT_CLOSURE_GRACE_AFTER_FINAL_REMINDER entry is in force'); }

    const unpaid = await listUnpaidMilestones();
    const summary = { scanned: unpaid.length, closed: 0, wouldClose: 0, skipped: 0, errors: 0 };

    for (const { application: app, milestone, dueDate } of unpaid) {
        if (!dueDate || now.getTime() <= dueDate.getTime() + thresholdDays * DAY_MS) {
            summary.skipped += 1;
            continue;
        }
        if (!app.organizationId) {
            summary.errors += 1;
            logger.error(`[payment-closure] application ${app.id} has no organizationId; skipping`);
            continue;
        }
        try {
            if (!(await remindedAndGraceElapsed(app.id, milestone, graceDays, now))) {
                summary.skipped += 1;
                continue;
            }
            if (dryRun) {
                summary.wouldClose += 1;
                continue;
            }
            const intentIds = await milestoneIntentIds(app.id, milestone);
            const gate = await releaseOpenIntents(intentIds);
            if (!gate.released) {
                summary.skipped += 1;
                logger.error('[payment-closure] payment in flight or gateway unavailable — skipped close + alert', {
                    applicationId: app.id, milestone, intentId: gate.intentId, cause: gate.cause,
                });
                continue;
            }

            const closed = await runWithTenantContext({ organizationId: app.organizationId }, () => closeOne({
                app, milestone, dueDate, thresholdDays, checkedIntents: new Set(intentIds),
            }));
            if (!closed) {
                summary.skipped += 1;
                continue;
            }
            summary.closed += 1;
            logger.info(`[payment-closure] Auto-closed: ${app.applicationNumber} (${milestone} due ${dueDate.toISOString()}) -> EXPIRED, ${CLOSED_REASON}`);

            await notifyApplicationParties(app.id, {
                type: NotifyType.APPLICATION_EXPIRED,
                data: {
                    applicationNumber: app.applicationNumber,
                    reason: 'ไม่ชำระค่าบริการภายในกำหนด',
                    closedReason: CLOSED_REASON,
                    milestone,
                    expiredAt: new Date().toISOString(),
                },
            });
        } catch (itemError) {
            summary.errors += 1;
            logger.error(`[payment-closure] failed to close application ${app.id}; sweep continues: ${itemError?.message}`);
        }
    }

    logger.info(`[payment-closure] Completed: ${summary.scanned} scanned, ${summary.closed} closed, ${summary.skipped} skipped, ${summary.errors} errors`);
    return summary;
}

/**
 * The close itself. The application row lock is the transaction's first statement, so a checkout
 * that is minting an order or recording an intent finishes first and is then seen here
 * (services/checkout/application-row-lock.js); the status is re-read under it (the scan is stale by
 * write time: a settlement may have landed in between). An order whose intent was never released,
 * or that changed under the close, rolls the whole close back. Returns whether it wrote.
 */
async function closeOne({ app, milestone, dueDate, thresholdDays, checkedIntents }) {
    let didClose = false;
    const reason = `Auto-closed: ${milestone} unpaid more than ${thresholdDays} calendar days past its due date `
        + `${dueDate.toISOString()}, fully reminded.`;
    await prisma.$transaction(async (tx) => {
        if (!(await lockApplicationRow(tx, app.id))) { return; }
        const fresh = await tx.application.findUnique({
            where: { id: app.id },
            select: { status: true, version: true, formData: true, workflowHistory: true },
        });
        if (!fresh || GATE_MILESTONE[fresh.status] !== milestone) { return; }
        const retired = await retirePendingOrdersInTx(tx, {
            where: { applicationId: app.id, milestone },
            releasedIntents: checkedIntents,
            reason: RETIRE_REASONS.PAYMENT_ABANDONED,
        });
        if (!retired) { throw Object.assign(new Error('a checkout changed while closing'), { code: ORDER_CHANGED }); }

        const transitionUpdate = buildTransitionUpdate({
            application: { ...app, ...fresh },
            toState: APPLICATION_STATUSES.EXPIRED,
            actorId: 'cron-payment-closure',
            actorRole: 'system',
            reasonCode: CLOSED_REASON,
            comment: reason,
        });
        await writeApplicationStatus({
            prisma: tx,
            applicationId: app.id,
            fromStatus: fresh.status,
            toStatus: APPLICATION_STATUSES.EXPIRED,
            expectedVersion: fresh.version,
            actorId: 'cron-payment-closure',
            actorRole: 'system',
            reason,
            additionalData: {
                ...(transitionUpdate?.updateData || {}),
                closedReason: CLOSED_REASON,
                formData: {
                    ...(typeof fresh.formData === 'object' && fresh.formData ? fresh.formData : {}),
                    _paymentAbandoned: {
                        closedAt: new Date().toISOString(),
                        reason: CLOSED_REASON,
                        milestone,
                        dueDate: dueDate.toISOString(),
                        reopenEligible: false,
                    },
                },
            },
            onAudit: async (entry) => {
                await auditLogger.log({
                    category: AuditCategory.APPLICATION,
                    action: 'APPLICATION_PAYMENT_ABANDONED',
                    severity: 'INFO',
                    actorId: 'cron-payment-closure',
                    actorType: 'SYSTEM',
                    actorRole: 'system',
                    resourceType: ResourceType.APPLICATION,
                    resourceId: app.id,
                    organizationId: app.organizationId,
                    metadata: {
                        closedReason: CLOSED_REASON,
                        milestone,
                        dueDate: dueDate.toISOString(),
                        thresholdDays,
                        fromStatus: entry?.fromStatus ?? fresh.status,
                        toStatus: entry?.toStatus ?? APPLICATION_STATUSES.EXPIRED,
                    },
                });
            },
        });
        didClose = true;
    }).catch((err) => { if (!SKIP_THIS_RUN.has(err?.code)) { throw err; } });
    return didClose;
}

module.exports = { runPaymentClosureSweep };
