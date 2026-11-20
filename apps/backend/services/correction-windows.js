'use strict';

/**
 * How long an applicant has to answer a correction, by the kind of correction: a document revision
 * is 5 Bangkok working days a round (order 28), the evidence for a defect found on site is 30
 * calendar days (order 56(2a)). The rules live in config/business-rules.js; this module turns the
 * one in force into a deadline and into the sentence the applicant is told.
 *
 * @module services/correction-windows
 */

const { PAYMENT, CORRECTIVE_ACTION } = require('../config/business-rules');
const { addWorkingDays, countWorkingDaysBetween, getZonedParts, startOfLocalCalendarDay, startOfLocalDay, endOfLocalDay } = require('../utils/working-days');
const { entryInForceAt } = require('./dispatcher-rules');
const { formatThaiDate } = require('../utils/thai-format');

const DOCUMENT_REVISION_WINDOW = Object.freeze({ workingDays: PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS });
const DAY_MS = 24 * 60 * 60 * 1000;

/** The on-site corrective-action window in force at `at`; null when none is. */
function onsiteCorrectionWindowAt(at, { register = CORRECTIVE_ACTION.ONSITE_WINDOW } = {}) {
    return entryInForceAt(register, at);
}

/**
 * The deadline a window gives a correction asked for at `at`: the end of the Bangkok working day
 * `workingDays` working days later (not counting the asking day), or the end of the Bangkok day
 * `calendarDays` calendar days after the asking day, wherever it falls.
 */
function deadlineUnder(window, at) {
    if (window.calendarDays) {
        const { year, month, day } = getZonedParts(at);
        return endOfLocalDay(startOfLocalCalendarDay(year, month, day + window.calendarDays));
    }
    return addWorkingDays(at, window.workingDays);
}

/** "30 วัน" or "5 วันทำการ": a window as the applicant reads it. */
function windowLabelTh(window) {
    return window.calendarDays ? `${window.calendarDays} วัน` : `${window.workingDays} วันทำการ`;
}

/**
 * Due date of the evidence for a defect found on site, asked for at `at`. No rule in force throws:
 * a corrective action without a deadline would never be closed, and a guessed one is not the rule.
 */
function onsiteCorrectionDueAt(at = new Date()) {
    const window = onsiteCorrectionWindowAt(at);
    if (!window) {
        throw Object.assign(new Error(`no on-site corrective-action window is in force at ${at.toISOString()}`), { code: 'CAR_WINDOW_NOT_IN_FORCE' });
    }
    return deadlineUnder(window, at);
}

/** The statuses in which the applicant owes a correction: a document revision, or the evidence of an on-site defect. */
const APPLICANT_CORRECTION_STATUSES = Object.freeze(['REVISION_REQUESTED', 'CAR_PENDING']);

/**
 * The deadline the applicant's correction waits on, as stamped on the filing; null in any other
 * status or when the filing stamps none. The deadline sweep, the dispatcher's tab and its manual
 * reminder all read it here, so they agree on the round.
 */
function correctionDueAtOf(status, formData) {
    const filing = formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {};
    let raw = null;
    if (status === 'REVISION_REQUESTED') { raw = filing.revisionDueAt || filing.revision_due_at || null; }
    if (status === 'CAR_PENDING') { raw = filing.carDueAt || filing.car_due_at || null; }
    const due = raw ? new Date(raw) : null;
    return due && Number.isFinite(due.getTime()) ? due : null;
}

/** Negative once the deadline has passed; null without one. */
function correctionWorkingDaysLeft(due, now = new Date()) {
    return due instanceof Date && Number.isFinite(due.getTime()) ? countWorkingDaysBetween(now, due) : null;
}

/** Bangkok calendar days from the day of `now` to the day of `due`; negative once past; null without one. */
function correctionCalendarDaysLeft(due, now = new Date()) {
    if (!(due instanceof Date) || !Number.isFinite(due.getTime())) { return null; }
    return Math.round((startOfLocalDay(due).getTime() - startOfLocalDay(now).getTime()) / DAY_MS);
}

/**
 * The time left to the applicant's correction, counted in the unit its window is written in:
 * working days for a document revision (order 28), calendar days for the evidence of a defect
 * found on site (order 56(2a)). The other field is null, so no screen can label a count in the
 * wrong unit, and a status that owes no correction gets neither.
 */
function correctionDaysLeftOf(status, formData, now = new Date()) {
    const due = correctionDueAtOf(status, formData);
    return {
        workingDaysLeft: status === 'REVISION_REQUESTED' ? correctionWorkingDaysLeft(due, now) : null,
        calendarDaysLeft: status === 'CAR_PENDING' ? correctionCalendarDaysLeft(due, now) : null,
    };
}

/** The correction round a manual reminder is counted in: its deadline, or the status when none is stamped (order 56(1) 3.2). */
function correctionRoundOf(status, formData) {
    const due = correctionDueAtOf(status, formData);
    return due ? due.toISOString() : `${status}:no-deadline`;
}

/**
 * Why an application closed when its correction deadline passed, as the applicant and the holder
 * are told: the window it had, under the rule in force when the correction was asked for.
 * @param {string} status the status it waited in (REVISION_REQUESTED or CAR_PENDING)
 * @param {Date} [askedAt] when the correction was asked for
 * @returns {string}
 */
function correctionWindowText(status, askedAt = new Date()) {
    if (status === 'CAR_PENDING') {
        const window = onsiteCorrectionWindowAt(askedAt) || onsiteCorrectionWindowAt(new Date());
        return `ไม่ส่งหลักฐานการแก้ไขข้อบกพร่องภายใน ${windowLabelTh(window)}`;
    }
    return `ไม่ส่งเอกสารแก้ไขภายใน ${windowLabelTh(DOCUMENT_REVISION_WINDOW)}`;
}

/**
 * The note the deadline sweep writes into the filing's history when it closes the filing, as
 * the applicant reads it on the timeline: why, and the day the window ended.
 * @param {string} status the status it waited in (REVISION_REQUESTED or CAR_PENDING)
 * @param {Date} askedAt when the correction was asked for
 * @param {Date} due the deadline that passed
 */
function correctionDeadlineExpiredNote(status, askedAt, due) {
    return `คำขอถูกยกเลิกอัตโนมัติ เนื่องจาก${correctionWindowText(status, askedAt)} (ครบกำหนด ${formatThaiDate(due)})`;
}

const LEGACY_EXPIRED_NOTE = /^Auto-cancelled: correction deadline exceeded\. Original due: (\S+)$/;

/** A history note as the applicant reads it. */
function applicantNoteTh(text) {
    const legacy = LEGACY_EXPIRED_NOTE.exec(text);
    if (!legacy) { return text; }
    return `คำขอถูกยกเลิกอัตโนมัติ เนื่องจากพ้นกำหนดแก้ไข (ครบกำหนด ${formatThaiDate(legacy[1])})`;
}

module.exports = {
    APPLICANT_CORRECTION_STATUSES,
    onsiteCorrectionWindowAt,
    onsiteCorrectionDueAt,
    windowLabelTh,
    correctionWindowText,
    correctionDueAtOf,
    correctionWorkingDaysLeft,
    correctionCalendarDaysLeft,
    correctionDaysLeftOf,
    correctionRoundOf,
    correctionDeadlineExpiredNote,
    applicantNoteTh,
};
