#!/usr/bin/env node
'use strict';

/**
 * Record DTAM legal's answer on how an applicant appeals an order not to certify (order 118(1)).
 *
 * Usage:
 *   node scripts/set-appeal-setup.js --show
 *   node scripts/set-appeal-setup.js --effective-from 2026-11-01 --time-limit-days 15 \
 *        --channel "<how the applicant files the appeal>" --source-ref "<DTAM letter number>"   # dry run
 *   node scripts/set-appeal-setup.js --withdraw --effective-from 2026-12-01 --source-ref "<ref>"
 *   add --apply to write.
 */

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

const { APPEAL_SETUP_KEY, parseAppealSetup, parseAppealHistory } = require('../shared/appeal-setup');

const TAG = '[set-appeal-setup]';

function argValue(argv, flag) {
    const at = argv.indexOf(flag);
    return at >= 0 ? String(argv[at + 1] || '').trim() : '';
}

function planFromArgs(argv) {
    if (argv.includes('--show')) { return { action: 'show' }; }
    const apply = argv.includes('--apply');
    if (argv.includes('--withdraw')) {
        const entry = { effectiveFrom: argValue(argv, '--effective-from'), withdrawn: true, sourceRef: argValue(argv, '--source-ref') };
        return parseAppealHistory([entry])
            ? { action: 'add', apply, entry }
            : { action: 'refuse', message: 'withdrawing needs --effective-from YYYY-MM-DD and --source-ref' };
    }
    const days = argValue(argv, '--time-limit-days');
    const entry = parseAppealSetup({
        effectiveFrom: argValue(argv, '--effective-from'),
        timeLimitDays: /^\d+$/.test(days) ? Number(days) : NaN,
        channel: argValue(argv, '--channel'),
        sourceRef: argValue(argv, '--source-ref'),
    });
    return entry
        ? { action: 'add', apply, entry }
        : { action: 'refuse', message: 'need --effective-from YYYY-MM-DD, --time-limit-days 1-365, --channel and --source-ref' };
}

function auditWriter() {
    const { auditLogger } = require('../middleware/audit-logger');
    return (row, tx) => auditLogger.logWithin(row, tx);
}

async function main(argv, { prisma = require('../services/prisma-database').prisma, out = console, audit = auditWriter() } = {}) {
    const plan = planFromArgs(argv);
    if (plan.action === 'refuse') {
        out.error(`${TAG} REFUSED: ${plan.message}`);
        return 1;
    }
    const row = await prisma.systemConfig.findUnique({ where: { key: APPEAL_SETUP_KEY } });
    const history = row ? parseAppealHistory(row.value) : [];
    if (!history) {
        out.error(`${TAG} REFUSED: the stored ${APPEAL_SETUP_KEY} does not parse; fix it by hand before adding to it`);
        return 1;
    }
    out.log(`${TAG} entries: ${history.length ? JSON.stringify(history) : 'none'}`);
    if (plan.action === 'show') { return 0; }

    if (history.some((entry) => entry.effectiveFrom === plan.entry.effectiveFrom)) {
        out.error(`${TAG} REFUSED: an entry already starts on ${plan.entry.effectiveFrom}`);
        return 1;
    }
    out.log(`${TAG} new entry: ${JSON.stringify(plan.entry)}`);
    if (!plan.apply) { out.log(`${TAG} dry run: nothing written (add --apply)`); return 0; }

    const value = JSON.stringify([...history, plan.entry].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)));
    const withdrawn = plan.entry.withdrawn === true;
    await prisma.$transaction(async (tx) => {
        await tx.systemConfig.upsert({
            where: { key: APPEAL_SETUP_KEY },
            update: { value, type: 'JSON', updatedBy: 'set-appeal-setup' },
            create: {
                key: APPEAL_SETUP_KEY, value, type: 'JSON', updatedBy: 'set-appeal-setup',
                description: 'การอุทธรณ์คำสั่งไม่ให้การรับรอง ตามคำตอบนิติกร (คำสั่ง 118(1))',
            },
        });
        await audit({
            category: 'ADMIN',
            action: withdrawn ? 'APPEAL_SETUP_WITHDRAWN' : 'APPEAL_SETUP_SET',
            severity: 'WARNING',
            actorId: 'SYSTEM',
            actorRole: 'system',
            actorType: 'SYSTEM',
            resourceType: 'SYSTEM',
            resourceId: APPEAL_SETUP_KEY,
            metadata: { source: 'scripts/set-appeal-setup.js', entry: plan.entry, entriesBefore: history.length },
        }, tx);
    });
    out.log(`${TAG} written: ${withdrawn ? 'withdrawn' : 'in force'} from ${plan.entry.effectiveFrom} (Bangkok)`);
    return 0;
}

if (require.main === module) {
    main(process.argv.slice(2))
        .then((code) => { process.exitCode = code; })
        .catch((error) => { console.error(`${TAG} FAILED: ${error.message}`); process.exitCode = 1; })
        .finally(() => require('../services/prisma-database').prisma.$disconnect());
}

module.exports = { planFromArgs, main };
