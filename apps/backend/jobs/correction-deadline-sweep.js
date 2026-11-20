'use strict';

/**
 * The correction-deadline sweep: for every application waiting on a document revision
 * (REVISION_REQUESTED) or a corrective action (CAR_PENDING), remind the applicant and the holder
 * 48 and 24 hours before the deadline stamped on the filing, and close the application as EXPIRED
 * once that deadline has passed (order 28; the reminder cannot be muted, order 52).
 *
 * It runs in the backend's own scheduler (jobs/scheduler.js, hourly). GET /api/cron/auto-cancel
 * runs the same sweep by hand. Until 2026-10-09 the HTTP door was the only way in and nothing on
 * staging called it, so the reminders never went out there (dispatcher-defaults memo).
 *
 * A reminder is recorded per deadline, under the server-owned formData.deadlineReminders
 * ({ dueAt, sent: { '48': iso, '24': iso } }): a new round stamps a new deadline, so its reminders
 * go out again (security re-review 2026-10-09 M2). The record is claimed before the notice goes
 * out, so two runs at once send one notice, and released when the notice reached nobody, so the
 * next run tries again.
 *
 * @module jobs/correction-deadline-sweep
 */

const { prisma } = require('../services/prisma-database');
const { withoutTenantScope, runWithTenantContext } = require('../services/tenant-context');
const { notifyRevisionDeadlineApproaching, NotifyType } = require('../services/notification-service');
const { notifyApplicationParties } = require('../services/notification/application-parties');
const { writeApplicationStatus } = require('../services/application-status-writer');
const { countWorkingDaysBetween } = require('../utils/working-days');
const { APPLICANT_CORRECTION_STATUSES, correctionWindowText, correctionDueAtOf } = require('../services/correction-windows');
const logger = require('../shared/logger');

const REMINDER_BUCKETS_HOURS = Object.freeze([24, 48]);

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function toValidDate(value) {
    if (!value) { return null; }
    const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** The deadline the filing waits on; a revision stamped only on its RevisionDeadline row reads that row. */
function dueDateOf(application) {
    const stamped = correctionDueAtOf(application.status, application.formData);
    if (stamped || application.status !== 'REVISION_REQUESTED') { return stamped; }
    return toValidDate(application.revisionDeadline?.revisionDue || null);
}

/** 24 when the deadline is a day away or less, 48 when two days or less, else no reminder. */
function reminderBucket(hoursRemaining) {
    if (!Number.isFinite(hoursRemaining) || hoursRemaining <= 0) { return null; }
    return REMINDER_BUCKETS_HOURS.find((bucket) => hoursRemaining <= bucket) || null;
}

function deadlineTypeOf(status) {
    return status === 'CAR_PENDING' ? 'CAR' : 'REVISION';
}

function wasReminded(formData, dueIso, bucket) {
    const record = asObject(formData.deadlineReminders);
    return Boolean(record && record.dueAt === dueIso && asObject(record.sent) && record.sent[String(bucket)]);
}

/**
 * Record the reminder of `bucket` for this deadline, only while the application still waits in
 * `status` and its filing is an object. With `onlyIfUnrecorded` the write is a claim: it succeeds
 * only when nobody recorded this reminder for this deadline yet. Returns whether a row was written.
 */
async function recordReminder({ applicationId, status, dueIso, bucket, at, onlyIfUnrecorded }) {
    const key = String(bucket);
    const written = await prisma.$executeRaw`
        UPDATE applications
        SET "formData" = jsonb_set("formData", '{deadlineReminders}',
            CASE WHEN "formData"->'deadlineReminders'->>'dueAt' = ${dueIso}
                 THEN jsonb_set(COALESCE("formData"->'deadlineReminders', '{}'::jsonb) || jsonb_build_object('sent', COALESCE("formData"->'deadlineReminders'->'sent', '{}'::jsonb)),
                                ARRAY['sent', ${key}]::text[], to_jsonb(${at}::text), true)
                 ELSE jsonb_build_object('dueAt', ${dueIso}::text, 'sent', jsonb_build_object(${key}::text, ${at}::text))
            END, true)
        WHERE id = ${applicationId}
          AND status = ${status}
          AND jsonb_typeof("formData") = 'object'
          AND NOT (${onlyIfUnrecorded} AND COALESCE(
            "formData"->'deadlineReminders'->>'dueAt' = ${dueIso}
            AND jsonb_exists("formData"->'deadlineReminders'->'sent', ${key}),
            false))`;
    return written > 0;
}

/** Give the claim back when the notice reached nobody, so the next run tries again. */
async function releaseReminder({ applicationId, dueIso, bucket }) {
    await prisma.$executeRaw`
        UPDATE applications
        SET "formData" = "formData" #- ARRAY['deadlineReminders', 'sent', ${String(bucket)}]::text[]
        WHERE id = ${applicationId}
          AND jsonb_typeof("formData") = 'object'
          AND "formData"->'deadlineReminders'->>'dueAt' = ${dueIso}`;
}

/** When the correction was asked for, as the filing records it; the rule then in force is the one told. */
function askedAtOf(application) {
    const formData = asObject(application.formData) || {};
    const raw = application.status === 'CAR_PENDING'
        ? (formData.carRequestedAt || formData.car_requested_at)
        : (formData.revisionRequestedAt || formData.revision_requested_at);
    const at = toValidDate(raw);
    return at || new Date();
}

/**
 * Close one application whose correction deadline has passed, as the sweep read it, and tell the
 * applicant and the holder why. A write committed since that read refuses this one.
 */
async function expireOverdue(application, now = new Date()) {
    const nowIso = now.toISOString();
    const reason = application.status === 'CAR_PENDING' ? 'CAR_OVERDUE' : 'REVISION_OVERDUE';
    const formData = asObject(application.formData) || {};
    await prisma.$transaction(async (tx) => {
        await writeApplicationStatus({
            prisma: tx,
            applicationId: application.id,
            fromStatus: application.status,
            toStatus: 'EXPIRED',
            // The filing below is the one this sweep read: a resubmission committed since refuses
            // this write (CONCURRENCY_CONFLICT) instead of being cancelled with a stale copy.
            expectedVersion: application.version,
            actorId: 'cron',
            actorRole: 'system',
            reason: `AUTO_EXPIRED:${reason}`,
            additionalData: {
                formData: {
                    ...formData,
                    workflowState: 'EXPIRED',
                    workflowStateUpdatedAt: nowIso,
                    cancelReason: reason,
                    canceledExpiredAt: nowIso,
                },
                workflowHistory: [
                    ...(Array.isArray(application.workflowHistory) ? application.workflowHistory : []),
                    { timestamp: nowIso, action: 'AUTO_EXPIRED', fromStatus: application.status, toStatus: 'EXPIRED', reason, actorRole: 'system' },
                ],
            },
        });
        await tx.revisionDeadline.updateMany({
            where: { applicationId: application.id, status: { in: ['PENDING', 'EXTENDED'] } },
            data: { status: 'FAILED', updatedBy: 'system' },
        });
    });
    // The applicant and the holder are told what happened and why (best effort: the expiry stands).
    try {
        await notifyApplicationParties(application.id, {
            type: NotifyType.APPLICATION_EXPIRED,
            data: {
                applicationNumber: application.applicationNumber,
                reason: correctionWindowText(application.status, askedAtOf(application)),
                closedReason: 'REVISION_OVERDUE',
                expiredAt: nowIso,
            },
        });
    } catch (notifyErr) {
        logger.error(`[correction-deadline-sweep] expiry notice failed for ${application.applicationNumber} (non-fatal): ${notifyErr?.message}`);
    }
    return { id: application.id, applicationNumber: application.applicationNumber, fromStatus: application.status, toStatus: 'EXPIRED' };
}

/**
 * @param {{ now?: Date, dryRun?: boolean }} [options]
 * @returns {Promise<object>} what was checked, reminded and closed
 */
async function runCorrectionDeadlineSweep({ now = new Date(), dryRun = false } = {}) {
    const applications = await withoutTenantScope(() => prisma.application.findMany({
        where: { isDeleted: false, status: { in: [...APPLICANT_CORRECTION_STATUSES] } },
        select: {
            id: true, applicationNumber: true, status: true, version: true, organizationId: true,
            formData: true, workflowHistory: true, revisionDeadline: { select: { revisionDue: true } },
        },
        orderBy: { updatedAt: 'asc' },
    }));

    const expired = [];
    const reminders = [];
    let skipped = 0;
    for (const application of applications) {
        if (!asObject(application.formData) || !application.organizationId) {
            // A filing that is JSON null, an array or a scalar cannot carry a reminder record, and a
            // row with no organization has no tenant to write in: either is left for a person to
            // look at instead of stopping the whole run (I3).
            skipped += 1;
            logger.warn(`[correction-deadline-sweep] ${application.applicationNumber}: formData is not an object or no organization, skipped`);
            continue;
        }
        const dueDate = dueDateOf(application);
        if (!dueDate) { continue; }
        if (dueDate < now) {
            expired.push(application);
            continue;
        }
        const hoursRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (60 * 60 * 1000));
        const bucket = reminderBucket(hoursRemaining);
        const dueIso = dueDate.toISOString();
        if (!bucket || wasReminded(application.formData, dueIso, bucket)) { continue; }
        reminders.push({
            application,
            applicationId: application.id,
            applicationNumber: application.applicationNumber,
            status: application.status,
            deadlineType: deadlineTypeOf(application.status),
            dueAt: dueIso,
            reminderBucketHours: bucket,
            hoursRemaining,
            workingDaysRemaining: Math.max(0, countWorkingDaysBetween(now, dueDate)),
        });
    }

    const report = (items) => items.map(({ application: _application, ...item }) => item);
    if (dryRun) {
        return {
            dryRun: true,
            checked: applications.length,
            skipped,
            expired: expired.map((application) => ({ id: application.id, applicationNumber: application.applicationNumber, status: application.status })),
            reminders: report(reminders),
            remindersSentCount: 0,
            cancelledCount: 0,
        };
    }

    const remindersSent = [];
    for (const reminder of reminders) {
        const at = new Date().toISOString();
        try {
            const record = { applicationId: reminder.applicationId, status: reminder.status, dueIso: reminder.dueAt, bucket: reminder.reminderBucketHours, at };
            if (!(await recordReminder({ ...record, onlyIfUnrecorded: true }))) { continue; }
            const delivered = await runWithTenantContext({ organizationId: reminder.application.organizationId }, () => notifyRevisionDeadlineApproaching(
                reminder.applicationId, reminder.reminderBucketHours, { unit: 'hours', deadlineType: reminder.deadlineType },
            ));
            if (!delivered) {
                logger.warn(`[correction-deadline-sweep] reminder for ${reminder.applicationNumber} (${reminder.reminderBucketHours}h) reached nobody; released for the next run`);
                await releaseReminder({ applicationId: reminder.applicationId, dueIso: reminder.dueAt, bucket: reminder.reminderBucketHours });
                continue;
            }
            // Again after the notice: a save that read the filing before the claim and wrote it
            // back meanwhile would otherwise have erased the record, and the next run would remind twice.
            await recordReminder({ ...record, onlyIfUnrecorded: false });
            remindersSent.push({ ...report([reminder])[0], sentAt: at });
        } catch (error) {
            logger.error(`[correction-deadline-sweep] reminder for ${reminder.applicationNumber} failed: ${error?.message}`);
        }
    }

    const cancelled = [];
    for (const application of expired) {
        try {
            cancelled.push(await runWithTenantContext({ organizationId: application.organizationId }, () => expireOverdue(application, now)));
        } catch (error) {
            // A resubmission that landed meanwhile, or one bad row, never stops the rest of the run.
            logger.warn(`[correction-deadline-sweep] ${application.applicationNumber} not expired: ${error?.code || ''} ${error?.message}`);
        }
    }

    return {
        dryRun: false,
        checked: applications.length,
        skipped,
        remindersSentCount: remindersSent.length,
        remindersSent,
        cancelledCount: cancelled.length,
        cancelled,
    };
}

module.exports = { runCorrectionDeadlineSweep, expireOverdue, dueDateOf, reminderBucket };
