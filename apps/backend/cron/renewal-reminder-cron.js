/**
 * Renewal Reminder Cron — Iter 26 (2026-05-16).
 *
 * Daily script (suggested 09:00 ICT) that walks each cadence tier
 * [60, 30, 15] days and dispatches the CERTIFICATE_EXPIRING_SOON
 * notification to the parties of every ACTIVE certificate inside the
 * tier's window that has not had that tier yet.
 *
 * Scheduling: this file is a self-contained script. The orchestrator
 * (cron daemon, Kubernetes CronJob, or jobs/scheduler.js if we wire it
 * into the in-process node-cron stack) decides cadence. Two common
 * invocations:
 *
 *   1) System cron / supervisord:
 *      `0 2 * * *  node apps/backend/cron/renewal-reminder-cron.js`
 *      (02:00 UTC = 09:00 ICT)
 *
 *   2) Kubernetes CronJob:
 *      apiVersion: batch/v1
 *      kind: CronJob
 *      spec: { schedule: "0 2 * * *", ... }
 *
 *   3) In-process (only if you want single-process scheduling):
 *      add a node-cron entry inside apps/backend/jobs/scheduler.js
 *      that requires this module's `run()` export.
 *
 * The body exits the process when invoked as a top-level script so a
 * supervisord / k8s CronJob has a clean exit code (0 success, 1 failure).
 * When `require()`d from the in-process scheduler we just return the
 * summary object — no process.exit.
 *
 * Notification dispatch: fanoutToApplicationParties → notification-fanout-service
 * (IN_APP; its 60-minute dedupe collapses a double trigger on the same day).
 *
 * @module cron/renewal-reminder-cron
 */

'use strict';

const logger = require('../shared/logger');
const renewalService = require('../services/renewal-service');
const { fanoutToApplicationParties } = require('../services/notification/application-parties');
const { appBaseUrl } = require('../config/public-urls');

function renewalUrlFor(certificateId) {
    return `${appBaseUrl()}/health/applications/renewal?certId=${encodeURIComponent(certificateId)}`;
}

function _buildRenewalPayload({ certificate }) {
    const renewalUrl = renewalUrlFor(certificate.id);
    return {
        certificateId: certificate.id,
        certNumber: certificate.certificateNumber,
        farmName: certificate.farmName,
        daysLeft: certificate.daysLeft,
        expiryDate: certificate.expiryDate,
        renewalUrl,
        actionUrl: renewalUrl,
        priority: certificate.daysLeft <= 15 ? 'HIGH' : 'NORMAL',
    };
}

/**
 * Process a single cadence tier (e.g. 60 days). Returns
 * { tier, found, sent, skipped, unreachable, failed } for the summary.
 */
async function _processTier({ daysBeforeExpiry, now }) {
    const tierType = renewalService.REMINDER_TYPE_BY_DAYS[daysBeforeExpiry];
    if (!tierType) {
        logger.warn('[renewal-reminder-cron] unknown tier, skipping', { daysBeforeExpiry });
        return { tier: daysBeforeExpiry, found: 0, sent: 0, skipped: 0, unreachable: 0, failed: 0 };
    }

    const certificates = await renewalService.getApplicationsForRenewalReminder({
        daysBeforeExpiry,
        now,
    });

    let sent = 0;
    let skipped = 0;
    let unreachable = 0;
    let failed = 0;

    for (const cert of certificates) {
        try {
            if (await renewalService.hasRenewalReminderBeenSent({ certificateId: cert.id, reminderType: tierType })) {
                skipped += 1;
                continue;
            }

            const payload = _buildRenewalPayload({ certificate: cert });
            // The holder's people with the right to file, and the applicant (order 32): a
            // certificate outlives the employee who filed for it.
            const outcome = await fanoutToApplicationParties(cert.applicationId, { type: 'CERTIFICATE_EXPIRING_SOON', payload });
            if (outcome.lookupFailed || outcome.failed > 0) {
                throw new Error(`fanout: lookupFailed=${outcome.lookupFailed} failed=${outcome.failed} of ${outcome.recipients.length}`);
            }
            if (outcome.delivered === 0) {
                unreachable += 1;
                logger.warn('[renewal-reminder-cron] no recipient reached, left unmarked', {
                    certificateId: cert.id,
                    applicationId: cert.applicationId,
                    tier: tierType,
                });
                continue;
            }

            await renewalService.markRenewalReminderSent({
                certificateId: cert.id,
                reminderType: tierType,
                sentAt: now,
            });
            sent += 1;
        } catch (err) {
            failed += 1;
            logger.error('[renewal-reminder-cron] failed to send reminder', {
                certificateId: cert.id,
                tier: tierType,
                error: err?.message,
            });
        }
    }

    return {
        tier: daysBeforeExpiry,
        type: tierType,
        found: certificates.length,
        sent,
        skipped,
        unreachable,
        failed,
    };
}

/**
 * Run the cron — walks all configured cadence tiers and returns a
 * per-tier summary. Safe to call repeatedly on the same day (idempotent).
 *
 * @param {object} [opts]
 * @param {Date} [opts.now]   — clock injection (tests)
 * @returns {Promise<{ ranAt: string, summary: Array }>}
 */
async function run({ now } = {}) {
    const clock = now instanceof Date ? now : new Date();
    const ranAt = clock.toISOString();
    logger.info('[renewal-reminder-cron] start', { ranAt });

    const summary = [];
    for (const days of renewalService.REMINDER_DAYS) {
        try {
            const tierSummary = await _processTier({ daysBeforeExpiry: days, now: clock });
            summary.push(tierSummary);
            logger.info('[renewal-reminder-cron] tier complete', tierSummary);
        } catch (err) {
            logger.error('[renewal-reminder-cron] tier failed', {
                tier: days,
                error: err?.message,
            });
            summary.push({ tier: days, error: err?.message });
        }
    }

    const totals = summary.reduce(
        (acc, t) => {
            acc.found += t.found || 0;
            acc.sent += t.sent || 0;
            acc.skipped += t.skipped || 0;
            acc.unreachable += t.unreachable || 0;
            acc.failed += t.failed || 0;
            return acc;
        },
        { found: 0, sent: 0, skipped: 0, unreachable: 0, failed: 0 },
    );

    logger.info('[renewal-reminder-cron] finished', { ranAt, totals });
    return { ranAt, summary, totals };
}

// CLI entry-point — when invoked directly as `node renewal-reminder-cron.js`
// we exit with a status code so supervisord / k8s CronJob can report success.
if (require.main === module) {
    run()
        .then((result) => {
             
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch((err) => {
            logger.error('[renewal-reminder-cron] fatal', { error: err?.message });
            process.exit(1);
        });
}

module.exports = {
    run,
    _internals: {
        _buildRenewalPayload,
        _processTier,
    },
};
