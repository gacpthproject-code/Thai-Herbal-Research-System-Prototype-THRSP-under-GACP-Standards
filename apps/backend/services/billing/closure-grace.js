'use strict';

/**
 * The wait between the third payment reminder and the closure of an unpaid milestone
 * (operator order 39, 2026-10-07). The days are dated data in config/business-rules.js;
 * this module only resolves which entry is in force at an instant (Bangkok day boundaries).
 *
 * @module services/billing/closure-grace
 */

const { PAYMENT } = require('../../config/business-rules');
const { localWallClock } = require('../../utils/working-days');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calendar days to wait after the third reminder, as in force at `at`.
 * @param {Date} at
 * @param {ReadonlyArray<{effectiveFrom: string, calendarDays: number}>} [register]
 * @returns {number|null} null when no entry is in force at `at`
 */
function closureGraceDaysAt(at, register = PAYMENT.PAYMENT_CLOSURE_GRACE_AFTER_FINAL_REMINDER) {
    let inForce = null;
    for (const entry of register) {
        const from = localWallClock(entry.effectiveFrom, '00:00');
        if (from.getTime() <= at.getTime() && (!inForce || from.getTime() > inForce.from.getTime())) {
            inForce = { from, days: entry.calendarDays };
        }
    }
    return inForce ? inForce.days : null;
}

/**
 * Whether the grace has run out: `at` is at least `graceDays` calendar days after `finalReminderSentAt`.
 * Bangkok has no daylight saving, so a calendar day is 24 hours.
 */
function graceElapsed(finalReminderSentAt, graceDays, at) {
    return at.getTime() >= finalReminderSentAt.getTime() + graceDays * DAY_MS;
}

module.exports = { closureGraceDaysAt, graceElapsed };
