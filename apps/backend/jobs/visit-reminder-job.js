'use strict';

/**
 * The reminder before a field visit (operator order 56(1) 3.3, 2026-10-09): from the start of the
 * Bangkok working day two working days before the visit (the dated rule DISPATCHER.VISIT_REMINDER),
 * the applicant and the holder are told the day, the time and the place, and to have the documents
 * and the person on site ready. Nobody can mute it (notification-preferences-service ALWAYS_ON_TYPES).
 *
 * One reminder per booked visit. The server-owned formData.visitReminder ({ forVisit, sentAt }) is
 * claimed before the notice goes out and given back when the notice reached nobody or threw, so the
 * next run tries again; a visit moved to another day is a new visit and is reminded again. A visit
 * booked on or after its reminder day is not reminded: the booking notice has just told them.
 *
 * Not registered in jobs/scheduler.js yet: the text tells the applicant to ask for another date
 * through the application page, and that request (order 65(3)) deploys together with this job.
 *
 * @module jobs/visit-reminder-job
 */

const { prisma } = require('../services/prisma-database');
const { withoutTenantScope, runWithTenantContext } = require('../services/tenant-context');
const { NotifyType } = require('../services/notification-service');
const { notifyApplicationParties } = require('../services/notification/application-parties');
const { formatBangkokThaiDate, formatBangkokTime } = require('../services/audit/audit-schedule-notices');
const { visitReminderDayFor } = require('../services/dispatcher-rules');
const logger = require('../shared/logger');

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function toValidDate(value) {
    if (!value) { return null; }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** Where the visit is: the place the dispatcher booked, else the site the filing names. */
function placeOf(formData) {
    const booked = asObject(formData.auditSchedule)?.location;
    if (booked && String(booked).trim()) { return String(booked).trim(); }
    const farm = asObject(formData.farmData) || {};
    const site = [farm.siteName, farm.siteAddress, farm.subDistrict, farm.district, farm.province]
        .map((part) => (part ? String(part).trim() : ''))
        .filter(Boolean)
        .join(' ');
    return site || 'สถานที่ปลูกตามคำขอ';
}

/** When the visit was booked or last moved, as the booking recorded it. */
function bookedAtOf(formData) {
    const schedule = asObject(formData.auditSchedule) || {};
    return toValidDate(schedule.rescheduledAt || schedule.scheduledAt);
}

/** Record the reminder of this visit; with `onlyIfUnrecorded`, only when nobody recorded it yet. */
async function recordReminder({ applicationId, visitAt, record, onlyIfUnrecorded }) {
    const written = await prisma.$executeRaw`
        UPDATE applications
        SET "formData" = jsonb_set("formData", '{visitReminder}', ${JSON.stringify(record)}::jsonb, true)
        WHERE id = ${applicationId}
          AND status = 'AUDIT_CONFIRMED'
          AND "scheduledDate" = ${visitAt}
          AND jsonb_typeof("formData") = 'object'
          AND NOT (${onlyIfUnrecorded} AND COALESCE("formData"->'visitReminder'->>'forVisit', '') = ${record.forVisit})`;
    return written > 0;
}

async function releaseReminder({ applicationId, sentAt }) {
    await prisma.$executeRaw`
        UPDATE applications SET "formData" = "formData" - 'visitReminder'
        WHERE id = ${applicationId} AND "formData"->'visitReminder'->>'sentAt' = ${sentAt}`;
}

/**
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ checked: number, skipped: number, reminded: number }>}
 */
async function runVisitReminders({ now = new Date() } = {}) {
    const visits = await withoutTenantScope(() => prisma.application.findMany({
        where: { isDeleted: false, status: 'AUDIT_CONFIRMED', scheduledDate: { gt: now } },
        select: { id: true, applicationNumber: true, organizationId: true, scheduledDate: true, formData: true },
        orderBy: { scheduledDate: 'asc' },
    }));

    let skipped = 0;
    let reminded = 0;
    for (const visit of visits) {
        const formData = asObject(visit.formData);
        if (!formData || !visit.organizationId) {
            skipped += 1;
            logger.warn(`[visit-reminder] ${visit.applicationNumber}: formData is not an object or no organization, skipped`);
            continue;
        }
        const remindFrom = visitReminderDayFor(visit.scheduledDate, now);
        const forVisit = visit.scheduledDate.toISOString();
        const bookedAt = bookedAtOf(formData);
        if (!remindFrom || now < remindFrom || asObject(formData.visitReminder)?.forVisit === forVisit) { continue; }
        if (bookedAt && bookedAt >= remindFrom) { continue; }

        const record = { forVisit, sentAt: new Date().toISOString() };
        try {
            if (!(await recordReminder({ applicationId: visit.id, visitAt: visit.scheduledDate, record, onlyIfUnrecorded: true }))) { continue; }
            let delivered = 0;
            try {
                const told = await runWithTenantContext({ organizationId: visit.organizationId }, () => notifyApplicationParties(visit.id, {
                    type: NotifyType.AUDIT_VISIT_REMINDER,
                    data: {
                        applicationNumber: visit.applicationNumber,
                        visitDate: formatBangkokThaiDate(visit.scheduledDate),
                        visitTime: `${formatBangkokTime(visit.scheduledDate)} น.`,
                        place: placeOf(formData),
                        visitAt: forVisit,
                    },
                }));
                delivered = told?.delivered ?? 0;
            } catch (error) {
                logger.error(`[visit-reminder] notice for ${visit.applicationNumber} threw: ${error?.message}`);
            }
            if (delivered === 0) {
                logger.warn(`[visit-reminder] reminder for ${visit.applicationNumber} reached nobody; released for the next run`);
                await releaseReminder({ applicationId: visit.id, sentAt: record.sentAt });
                continue;
            }
            // Again after the notice: a save that read the filing before the claim and wrote it back
            // meanwhile would otherwise have erased the record, and the next run would remind twice.
            await recordReminder({ applicationId: visit.id, visitAt: visit.scheduledDate, record, onlyIfUnrecorded: false });
            reminded += 1;
        } catch (error) {
            logger.error(`[visit-reminder] reminder for ${visit.applicationNumber} failed: ${error?.message}`);
        }
    }
    return { checked: visits.length, skipped, reminded };
}

module.exports = { runVisitReminders };
