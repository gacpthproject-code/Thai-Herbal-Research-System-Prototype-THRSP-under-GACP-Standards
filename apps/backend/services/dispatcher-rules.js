'use strict';

/**
 * The dispatcher's dated rules (operator orders 27 and 56(1)): the queue time limit and urgency
 * thresholds in Bangkok working days, how much work one officer should carry, how many visits one
 * field inspector may have a day, and when the applicant is reminded of a visit. The values live in
 * config/business-rules.js DISPATCHER; this module only picks the entry in force at an instant and
 * turns it into dates.
 *
 * @module services/dispatcher-rules
 */

const { DISPATCHER } = require('../config/business-rules');
const { DECISION_QUEUE_STATES } = require('../shared/decision-states');
const {
    localWallClock, addWorkingDays, startOfLocalDay, endOfLocalDay, countWorkingDaysBetween, minusWorkingDays,
} = require('../utils/working-days');

/**
 * The entry whose effectiveFrom (a Bangkok day, from its midnight) is the latest that has come at `at`.
 * @template {{ effectiveFrom: string }} T
 * @param {ReadonlyArray<T>} register
 * @param {Date} at
 * @returns {T|null}
 */
function entryInForceAt(register, at) {
    let inForce = null;
    let inForceFrom = null;
    for (const entry of register) {
        const from = localWallClock(entry.effectiveFrom, '00:00').getTime();
        if (from <= at.getTime() && (inForceFrom === null || from > inForceFrom)) {
            inForce = entry;
            inForceFrom = from;
        }
    }
    return inForce;
}

function queueTimeLimitsAt(at, { register = DISPATCHER.QUEUE_TIME_LIMITS } = {}) {
    return entryInForceAt(register, at);
}

/** The per-role workload caps in force at `at` (order 56(1) 2.2); null when none is. */
function officerWorkloadCapsAt(at, { register = DISPATCHER.OFFICER_WORKLOAD_CAPS } = {}) {
    return entryInForceAt(register, at);
}

/** Visits one field inspector may have on the Bangkok day of `visitAt` (order 56(1) 2.3); null when no rule is in force. */
function dailyVisitCapOn(visitAt, { register = DISPATCHER.INSPECTOR_DAILY_VISITS } = {}) {
    const entry = entryInForceAt(register, startOfLocalDay(visitAt));
    return entry ? entry.visitsPerDay : null;
}

/**
 * The start of the Bangkok working day on which the applicant and the holder are reminded of a visit
 * at `visitAt` (order 56(1) 3.3), under the rule in force at `now`; null when none is.
 */
function visitReminderDayFor(visitAt, now = new Date(), { register = DISPATCHER.VISIT_REMINDER } = {}) {
    const rule = entryInForceAt(register, now);
    return rule ? minusWorkingDays(visitAt, rule.workingDaysBefore) : null;
}

/**
 * Due date of a dispatcher task that entered the queue at `queuedAt`: the end of the Bangkok
 * business day `dueWorkingDays` working days later; the warning starts on the morning of that day.
 * No rule in force means no due date, never a guessed one.
 */
function schedulingDueAt(queuedAt, { register } = {}) {
    const rule = queueTimeLimitsAt(queuedAt, register ? { register } : undefined);
    if (!rule) { return { dueAt: null, warningAt: null }; }
    const dueAt = addWorkingDays(queuedAt, rule.dueWorkingDays);
    return { dueAt, warningAt: startOfLocalDay(dueAt) };
}

/**
 * How long an application has waited in its state, in Bangkok working days, and the urgency the
 * rule in force at `now` gives that wait.
 * @returns {{ workingDaysWaiting: number, severity: 'CRITICAL'|'WARNING'|'INFO' }}
 */
function waitingUrgency(enteredAt, now, { register } = {}) {
    const workingDaysWaiting = Math.max(0, countWorkingDaysBetween(enteredAt, now));
    const rule = queueTimeLimitsAt(now, register ? { register } : undefined);
    let severity = 'INFO';
    if (rule && workingDaysWaiting >= rule.criticalAfterWorkingDays) {
        severity = 'CRITICAL';
    } else if (rule && workingDaysWaiting >= rule.urgentAfterWorkingDays) {
        severity = 'WARNING';
    }
    return { workingDaysWaiting, severity };
}

/**
 * The stages the urgency monitor watches, each with the clock its wait is counted on (order 56(1)
 * 1.2): a stage a member of staff holds is counted from when the application entered it; a booked
 * visit is flagged only once its day has passed without a result. The applicant's own stages
 * (SUBMITTED, REVISION_REQUESTED, the payments) have deadlines of their own and are not watched.
 */
const MONITORED_STAGES = Object.freeze({
    DOC_FEE_PAID: 'STAGE_ENTRY',
    ASSIGNED_FOR_REVIEW: 'STAGE_ENTRY',
    AUDIT_FEE_PAID: 'STAGE_ENTRY',
    CAR_REVIEWING: 'STAGE_ENTRY',
    ...Object.fromEntries([...DECISION_QUEUE_STATES].map((status) => [status, 'STAGE_ENTRY'])),
    AUDIT_CONFIRMED: 'VISIT_DAY',
});

/**
 * The urgency of one watched application at `now`.
 * @param {{ status: string, stageEnteredAt: Date|null, visitAt: Date|null }} application
 * @returns {{ clock: 'STAGE_ENTRY'|'VISIT_DAY', workingDaysWaiting: number, severity: 'CRITICAL'|'WARNING'|'INFO' }|null}
 *   null for a stage the monitor does not watch, or a clock it cannot read
 */
function urgencyOf({ status, stageEnteredAt, visitAt }, now, { register } = {}) {
    const clock = MONITORED_STAGES[status];
    if (!clock) { return null; }
    if (clock === 'STAGE_ENTRY') {
        return stageEnteredAt ? { clock, ...waitingUrgency(stageEnteredAt, now, { register }) } : null;
    }
    if (!visitAt) { return null; }
    const visitDayEnd = endOfLocalDay(visitAt);
    if (now.getTime() <= visitDayEnd.getTime()) { return { clock, workingDaysWaiting: 0, severity: 'INFO' }; }
    const rule = queueTimeLimitsAt(now, register ? { register } : undefined);
    const workingDaysWaiting = Math.max(0, countWorkingDaysBetween(visitDayEnd, now));
    const severity = rule && workingDaysWaiting >= rule.criticalAfterWorkingDays ? 'CRITICAL' : 'WARNING';
    return { clock, workingDaysWaiting, severity };
}

module.exports = {
    entryInForceAt,
    queueTimeLimitsAt,
    officerWorkloadCapsAt,
    dailyVisitCapOn,
    visitReminderDayFor,
    schedulingDueAt,
    waitingUrgency,
    MONITORED_STAGES,
    urgencyOf,
};
