#!/usr/bin/env node
'use strict';

/**
 * What the payment reminder and closure sweeps would do on their next run, as counts only.
 * Writes nothing, sends nothing, asks no gateway. Run it after migration
 * 20261007090000_payment_reminders_by_milestone and before the first sweep, so the operator
 * sees how many applications the catch-up will remind and how many would be closed.
 *
 *   node scripts/payment-sweeps-dry-run.js [--at=YYYY-MM-DD]
 *
 * --at picks the Bangkok day to evaluate (default today). Output: one JSON line of counts.
 * wouldCloseBeforeGatewayCheck counts only milestones the real sweep could close that day: past the
 * due-date threshold, fully reminded, AND past the dated grace after the third sent reminder (order 39).
 */

const { prisma } = require('../services/prisma-database');
const { refreshSpecialHolidays } = require('../services/special-holiday-service');
const { runPaymentReminderSweep } = require('../jobs/payment-reminder-job');
const { runPaymentClosureSweep } = require('../jobs/payment-closure-job');
const { localWallClock } = require('../utils/working-days');

async function main() {
    const at = (process.argv.find((a) => a.startsWith('--at=')) || '').slice('--at='.length);
    const reminderTime = at ? localWallClock(at, '09:00') : new Date();
    const closureTime = at ? localWallClock(at, '03:00') : new Date();
    if (Number.isNaN(reminderTime.getTime())) { throw new Error(`--at must be YYYY-MM-DD, got ${at}`); }

    await refreshSpecialHolidays();
    const closure = await runPaymentClosureSweep(closureTime, { dryRun: true });
    const reminders = await runPaymentReminderSweep(reminderTime, { dryRun: true });
    console.log(JSON.stringify({
        evaluatedAt: reminderTime.toISOString(),
        unpaidMilestones: reminders.checked,
        wouldRemind: reminders.matched,
        ofWhichLateCatchUp: reminders.late,
        wouldCloseBeforeGatewayCheck: closure.wouldClose,
        closureErrors: closure.errors,
    }));
}

main()
    .catch((err) => { console.error(`[payment-sweeps-dry-run] ${err.message}`); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
