'use strict';

/**
 * Payment reminder sweep — three reminders per unpaid milestone (PRE_DUE / DUE_DATE /
 * OVERDUE_NOTICE), counted from when the milestone's clock started (operator order 32,
 * 2026-10-07: M1 from the quotation, M2 from the document approval), not from an invoice.
 *
 *   - The send days are the working-day-shifted days of
 *     checkout-schedule-service.computeReminderDates(dueDate); this job holds no calendar.
 *   - Catch-up: a reminder whose day has come and that has no ledger row of its type yet is
 *     sent now, the earliest one first and at most one per milestone per sweep (one sweep a
 *     day), so a sweep the server missed, or the first one after deploy, never skips a warning.
 *     A late one is worded for where the milestone stands today (the latest reminder day that
 *     has come), never "due today" after the due day.
 *   - Durable dedup: a reminder counts as given only once its PaymentReminderLog row carries
 *     sentAt (it reached a recipient). A row is inserted BEFORE the first dispatch (P2002 = another
 *     sweep holds it → skip); a row left unsent (it reached nobody) is resent on a later sweep by
 *     updating that same row, never by inserting a second one. Dispatch runs under a row lock
 *     (SKIP LOCKED), so two sweeps never both send it. The closure sweep needs sentAt on all three,
 *     so a reminder that reached nobody must not stay "given" for ever (security re-review N1).
 *   - Exactly once: the in-app notices are written with the reminder row's own transaction client,
 *     so they commit together with sentAt or not at all; a stamp that fails cannot leave a delivered
 *     reminder to be sent again tomorrow (security veto M-a).
 *   - A reminder that reached nobody alerts platform staff, once per application (security veto
 *     M-b): the application cannot be closed for non-payment until one does. The closure rule
 *     (order 39) is unchanged.
 *   - Told to the applicant and the holder (order 32) through application-parties.
 *   - NEVER writes invoice, payment or application state.
 *   - Fault isolation: an error on one application is logged and counted; the sweep goes on.
 *
 * Registered in jobs/scheduler.js — daily '0 9 * * *' Asia/Bangkok.
 *
 * @module jobs/payment-reminder-job
 */

const { prisma } = require('../services/prisma-database');
const { withoutTenantScope } = require('../services/tenant-context');
const { NotifyType } = require('../services/notification-service');
const { notifyApplicationParties } = require('../services/notification/application-parties');
const { notifyAdminPaymentReminderReachedNobody } = require('../services/notification/domain-helpers');
const { computeReminderDates } = require('../services/checkout/checkout-schedule-service');
const { listUnpaidMilestones } = require('../services/billing/unpaid-milestones');
const { getZonedParts } = require('../utils/working-days');
const { isRenewalFiling } = require('../shared/instalment-service-names');
const { createLogger } = require('../shared/logger');

const logger = createLogger('payment-reminder');

/**
 * One reminder for one unpaid milestone: make sure its ledger row exists, then dispatch under the
 * row lock and stamp sentAt. An unsent row of the same type (an earlier attempt reached nobody) is
 * the row this attempt reuses.
 * @returns {Promise<'sent'|'deduped'|'no-recipient'|'unconfirmed'>}
 */
async function dispatchReminder({ application, milestone, dueDate }, reminderType, intendedDate, wordedAs) {
    const unsent = await withoutTenantScope(() => prisma.paymentReminderLog.findFirst({
        where: { applicationId: application.id, milestone, reminderType, sentAt: null },
        select: { id: true },
    }));
    if (!unsent) {
        try {
            await withoutTenantScope(() => prisma.paymentReminderLog.create({
                data: {
                    applicationId: application.id,
                    milestone,
                    reminderType,
                    intendedDate,
                    organizationId: application.organizationId,
                },
            }));
        } catch (err) {
            if (err && err.code === 'P2002') { return 'deduped'; }
            throw err;
        }
    }

    return withoutTenantScope(() => prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw`
            SELECT id FROM payment_reminder_logs
            WHERE "applicationId" = ${application.id} AND milestone = ${milestone}
              AND "reminderType" = ${reminderType} AND "sentAt" IS NULL
            ORDER BY "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`;
        if (!row) { return 'deduped'; }

        const { recipients, delivered, lookupFailed } = await notifyApplicationParties(application.id, {
            type: NotifyType.PAYMENT_REMINDER,
            data: {
                applicationNumber: application.applicationNumber,
                milestone,
                isRenewal: isRenewalFiling(application),
                reminderType: wordedAs,
                dueDate: dueDate.toISOString(),
                intendedDate: new Date(intendedDate).toISOString(),
            },
            actionUrl: `/health/payments?app=${application.id}`,
        }, { db: tx });
        if (delivered === 0) {
            logger.warn(`[payment-reminder] ${reminderType} ${milestone} for ${application.applicationNumber} reached nobody (sentAt left NULL; resent on a later sweep)`);
            // Only an empty party list is "nobody to tell". A failed send or a failed lookup is
            // not, and staff are not alerted for it. Nobody can mute this reminder (ruling 2026-10-08).
            return recipients.length === 0 && !lookupFailed ? 'no-recipient' : 'unconfirmed';
        }
        await tx.paymentReminderLog.update({ where: { id: row.id }, data: { sentAt: new Date() } });
        return 'sent';
    }, { timeout: 30000 }));
}

/** The reminder types this milestone has actually delivered (sentAt stamped), whatever their intended day. */
async function sentTypes(applicationId, milestone) {
    const rows = await withoutTenantScope(() => prisma.paymentReminderLog.findMany({
        where: { applicationId, milestone, sentAt: { not: null } },
        select: { reminderType: true },
    }));
    return new Set(rows.map((r) => r.reminderType));
}

/**
 * Daily sweep: for every unpaid milestone, send the earliest reminder whose day has come (ICT)
 * and that has not yet reached anyone.
 *
 * @param {Date} [now] — clock injection (tests); defaults to the real clock.
 * @param {{ dryRun?: boolean }} [opts] dryRun = count what would go out, write and send nothing
 * @returns {Promise<{ checked: number, matched: number, late: number, sent: number, deduped: number, failed: number }>}
 *   late = matched reminders whose own day has passed (catch-up)
 */
async function runPaymentReminderSweep(now = new Date(), { dryRun = false } = {}) {
    const today = getZonedParts(now).isoDate;
    const unpaid = await listUnpaidMilestones();
    const summary = { checked: unpaid.length, matched: 0, late: 0, sent: 0, deduped: 0, failed: 0 };

    for (const item of unpaid) {
        try {
            if (!item.dueDate) {
                logger.warn(`[payment-reminder] ${item.application.applicationNumber} (${item.milestone}) has no clock start on record; skipping`);
                continue;
            }
            const arrived = Object.entries(computeReminderDates(item.dueDate))
                .filter(([, intendedDate]) => getZonedParts(intendedDate).isoDate <= today);
            if (arrived.length === 0) { continue; }
            const sent = await sentTypes(item.application.id, item.milestone);
            const next = arrived.find(([reminderType]) => !sent.has(reminderType));
            if (!next) { continue; }
            summary.matched += 1;
            const [reminderType, intendedDate] = next;
            if (getZonedParts(intendedDate).isoDate < today) { summary.late += 1; }
            if (dryRun) { continue; }
            const wordedAs = arrived[arrived.length - 1][0];
            const outcome = await dispatchReminder(item, reminderType, intendedDate, wordedAs);
            if (outcome === 'sent') { summary.sent += 1; }
            if (outcome === 'deduped') { summary.deduped += 1; }
            if (outcome === 'no-recipient') {
                await notifyAdminPaymentReminderReachedNobody({
                    applicationId: item.application.id, applicationNumber: item.application.applicationNumber, milestone: item.milestone,
                });
            }
        } catch (err) {
            summary.failed += 1;
            logger.error(`[payment-reminder] ${item.application.id} failed (sweep continues): ${err?.message}`);
        }
    }

    return summary;
}

module.exports = { runPaymentReminderSweep };
