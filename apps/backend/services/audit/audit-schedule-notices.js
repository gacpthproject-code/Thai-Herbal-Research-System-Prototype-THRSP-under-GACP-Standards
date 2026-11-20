'use strict';

/**
 * The one place that words and sends "your inspection is booked / moved".
 *
 * Both scheduling doors (the queue, audit-scheduling-service.assignAuditor, and the
 * calendar, scheduler-audit-schedules-post-handler) call this. Before it existed they
 * disagreed: the queue told only the farmer, the calendar told both in English with a raw
 * ISO instant ("scheduled for 2026-10-12T02:30:00.000Z").
 *
 * Dates are printed the way a Thai reader reads them (business-dates rule): the Bangkok
 * day and Bangkok wall clock, in the Buddhist year. The process clock is UTC, so reading
 * the instant's own fields would print the day before for anything booked before 07:00.
 *
 * Delivery is in-app, the only business channel left (external-services
 * cleanup). It never throws: the schedule has already been written when this runs.
 */

const logger = require('../../shared/logger');
const { THAI_MONTHS_FULL } = require('../../utils/thai-format');
const { getZonedParts, DEFAULT_TIME_ZONE } = require('../../utils/working-days');
const { createNotification } = require('../notification-service');
const { notifyApplicationParties } = require('../notification/application-parties');

function toDate(value) {
    if (!value) { return null; }
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** "12 ตุลาคม 2569" — Bangkok day, Buddhist year. */
function formatBangkokThaiDate(value) {
    const d = toDate(value);
    if (!d) { return ''; }
    const { year, month, day } = getZonedParts(d);
    return `${day} ${THAI_MONTHS_FULL[month - 1]} ${year + 543}`;
}

/** "09:30" — Bangkok wall clock, 24 hours. */
function formatBangkokTime(value) {
    const d = toDate(value);
    if (!d) { return ''; }
    return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: DEFAULT_TIME_ZONE,
    }).format(d);
}

function whenText(value) {
    return `วันที่ ${formatBangkokThaiDate(value)} เวลา ${formatBangkokTime(value)} น.`;
}

/**
 * @param {object} p
 * @param {string} p.applicationId
 * @param {string} p.applicationNumber
 * @param {Date|string} p.scheduledAt
 * @param {string} [p.auditorName]
 * @param {string|null} [p.location]
 * @param {string|null} [p.mapLink]
 * @param {boolean} [p.rescheduled]
 * @param {boolean} [p.reinspection] the second visit the field inspector asked for after a major finding
 * @param {Date|string|null} [p.previousScheduledAt]
 * @returns {{ farmer: {type, title, message, data}, inspector: {type, title, message, data} }}
 */
function buildAuditScheduleNotices(p = {}) {
    const number = p.applicationNumber || '-';
    const rescheduled = Boolean(p.rescheduled);
    const reinspection = Boolean(p.reinspection);
    const previous = toDate(p.previousScheduledAt);
    const when = whenText(p.scheduledAt);
    const movedFrom = rescheduled && previous ? ` (เดิม ${whenText(previous)})` : '';
    const where = p.location || p.mapLink
        ? `ตรวจที่พื้นที่ ${[p.location, p.mapLink].filter(Boolean).join(' ')}`
        : 'ตรวจที่พื้นที่';

    let action = 'AUDIT_SCHEDULED';
    if (rescheduled) { action = 'AUDIT_RESCHEDULED'; }
    if (reinspection) { action = 'REINSPECTION_SCHEDULED'; }
    const data = {
        applicationId: p.applicationId,
        applicationNumber: p.applicationNumber,
        scheduledDate: toDate(p.scheduledAt) ? toDate(p.scheduledAt).toISOString() : null,
        action,
    };

    let farmerLead = 'มีนัดตรวจประเมิน';
    let farmerTitle = 'นัดหมายตรวจประเมิน';
    let inspectorLead = 'ได้รับมอบหมายให้ตรวจ';
    let inspectorTitle = 'ได้รับมอบหมายงานตรวจประเมิน';
    if (rescheduled) {
        farmerLead = 'เลื่อนนัดตรวจประเมินเป็น';
        farmerTitle = 'เลื่อนนัดตรวจประเมิน';
        inspectorLead = 'มีการเลื่อนนัดตรวจ';
        inspectorTitle = 'เลื่อนนัดตรวจประเมิน';
    }
    if (reinspection) {
        farmerLead = 'มีนัดลงพื้นที่ตรวจซ้ำเพื่อดูการแก้ไขข้อบกพร่อง';
        farmerTitle = 'นัดลงพื้นที่ตรวจซ้ำ';
        inspectorLead = 'มีนัดลงพื้นที่ตรวจซ้ำ';
        inspectorTitle = 'นัดลงพื้นที่ตรวจซ้ำ';
    }

    return {
        farmer: {
            type: 'INFO',
            title: farmerTitle,
            message: `คำขอเลขที่ ${number} ${farmerLead} ${when}${movedFrom} ผู้ตรวจพื้นที่คือ ${p.auditorName || 'ผู้ที่ได้รับมอบหมาย'} ${where}`,
            data: { ...data, auditorName: p.auditorName || null },
        },
        inspector: {
            type: 'INFO',
            title: inspectorTitle,
            message: `คุณ${inspectorLead}คำขอเลขที่ ${number} ${when}${movedFrom} ${where}`,
            data: { ...data, mapLink: p.mapLink || null, location: p.location || null },
        },
    };
}

/**
 * Tell the applicant and the holder (order 27, 32) and the inspector. Best effort: a
 * failure is logged, never thrown.
 * @param {object} p  everything buildAuditScheduleNotices takes, plus
 * @param {string|null} p.auditorId
 * @returns {Promise<{ farmer: object|null, inspector: object|null }>}
 */
async function notifyAuditScheduled(p = {}) {
    const notices = buildAuditScheduleNotices(p);
    const attempt = async (who, fn) => {
        try {
            return await fn();
        } catch (err) {
            logger.warn(`[audit-schedule-notices] ${who} notification failed: ${err && err.message}`);
            return null;
        }
    };
    const [farmer, inspector] = await Promise.all([
        p.applicationId ? attempt('applicant', () => notifyApplicationParties(p.applicationId, notices.farmer)) : null,
        p.auditorId ? attempt('inspector', () => createNotification({ userId: p.auditorId, ...notices.inspector })) : null,
    ]);
    return { farmer, inspector };
}

module.exports = {
    buildAuditScheduleNotices,
    notifyAuditScheduled,
    formatBangkokThaiDate,
    formatBangkokTime,
};
