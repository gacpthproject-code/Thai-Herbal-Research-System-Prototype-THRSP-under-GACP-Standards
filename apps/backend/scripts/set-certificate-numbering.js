#!/usr/bin/env node
'use strict';

/**
 * Set the three certificate numbering settings (order 134 task 1) and show the number the
 * next issuance would draw.
 *
 * Usage:
 *   node scripts/set-certificate-numbering.js --show
 *   node scripts/set-certificate-numbering.js --year 2569 --start <n>     # start number of that BE year
 *   node scripts/set-certificate-numbering.js --format "{n}/{year}"
 *   node scripts/set-certificate-numbering.js --new-year-first 1          # rule: a new BE year starts here
 *   add --apply to write; without it nothing is written.
 */

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

const { parseNumberFormat } = require('../services/certificate-number-display');
const {
    CERT_NUMBER_FORMAT_KEY, CERT_NUMBER_YEAR_START_KEY, CERT_NUMBER_NEW_YEAR_RULE_KEY, CERTIFICATE_NUMBERING_KEYS,
    parseYearStart, parseNewYearRule,
} = require('../services/certificate-numbering-settings');
const { previewCertificateNumber } = require('../services/certificate-number-allocator');

const TAG = '[set-certificate-numbering]';
const DRY_RUN = Symbol('dry run');

function argValue(argv, flag) {
    const at = argv.indexOf(flag);
    return at >= 0 ? String(argv[at + 1] || '').trim() : '';
}
const integer = (text) => (/^\d+$/.test(text) ? Number(text) : NaN);

function planFromArgs(argv) {
    if (argv.includes('--show')) { return { action: 'show' }; }
    const apply = argv.includes('--apply');
    if (argv.includes('--format')) {
        const value = parseNumberFormat(argValue(argv, '--format'));
        return value
            ? { action: 'set', apply, key: CERT_NUMBER_FORMAT_KEY, value, type: 'STRING' }
            : { action: 'refuse', message: '--format must be "{n}/{year}", optionally after a prefix such as "TH-GACP {n}/{year}"' };
    }
    if (argv.includes('--new-year-first')) {
        const rule = parseNewYearRule({ rule: 'RESTART', firstNumber: integer(argValue(argv, '--new-year-first')) });
        return rule
            ? { action: 'set', apply, key: CERT_NUMBER_NEW_YEAR_RULE_KEY, value: JSON.stringify(rule), type: 'JSON' }
            : { action: 'refuse', message: '--new-year-first must be a whole number from 1' };
    }
    if (argv.includes('--year') || argv.includes('--start')) {
        const start = parseYearStart({ year: integer(argValue(argv, '--year')), start: integer(argValue(argv, '--start')) });
        return start
            ? { action: 'set', apply, key: CERT_NUMBER_YEAR_START_KEY, value: JSON.stringify(start), type: 'JSON' }
            : { action: 'refuse', message: '--year must be a BE year 2500-2599 and --start a whole number from 1' };
    }
    return { action: 'refuse', message: 'nothing to do: use --show, --year <BE> --start <n>, --format "<format>" or --new-year-first <n>' };
}

function auditWriter() {
    const { auditLogger } = require('../middleware/audit-logger');
    return (row, tx) => auditLogger.logWithin(row, tx);
}

async function showState(db, out, at) {
    const rows = await db.systemConfig.findMany({ where: { key: { in: CERTIFICATE_NUMBERING_KEYS } } });
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    for (const key of CERTIFICATE_NUMBERING_KEYS) {
        out.log(`${TAG} ${key} = ${stored.has(key) ? stored.get(key) : '(not set)'}`);
    }
    try {
        const next = await previewCertificateNumber({ db, at });
        const skipped = next.skipped.length ? ` (steps over blocked ${next.skipped.join(', ')})` : '';
        out.log(`${TAG} next number: ${next.certificateNumber}${skipped}`);
    } catch (error) {
        out.error(`${TAG} next number: none, issuance refuses: ${error.code || error.message} ${error.settingKey || ''}`.trim());
    }
}

async function main(argv, { prisma = require('../services/prisma-database').prisma, out = console, audit = auditWriter(), at = new Date() } = {}) {
    const plan = planFromArgs(argv);
    if (plan.action === 'refuse') {
        out.error(`${TAG} REFUSED: ${plan.message}`);
        return 1;
    }
    if (plan.action === 'show') {
        await showState(prisma, out, at);
        return 0;
    }

    const before = await prisma.systemConfig.findUnique({ where: { key: plan.key } });
    out.log(`${TAG} ${plan.key}: ${before ? before.value : '(not set)'} -> ${plan.value}`);
    const write = async (tx) => {
        await tx.systemConfig.upsert({
            where: { key: plan.key },
            update: { value: plan.value, type: plan.type, updatedBy: 'set-certificate-numbering' },
            create: { key: plan.key, value: plan.value, type: plan.type, updatedBy: 'set-certificate-numbering', description: 'ค่าตั้งเลขใบรับรอง (คำสั่ง 134)' },
        });
        await showState(tx, out, at);
        if (!plan.apply) { throw DRY_RUN; }
        await audit({
            category: 'ADMIN',
            action: 'CERTIFICATE_NUMBERING_SET',
            severity: 'WARNING',
            actorId: 'SYSTEM',
            actorRole: 'system',
            actorType: 'SYSTEM',
            resourceType: 'SYSTEM',
            resourceId: plan.key,
            metadata: { source: 'scripts/set-certificate-numbering.js', before: before ? before.value : null, after: plan.value },
        }, tx);
    };
    try {
        await prisma.$transaction(write);
    } catch (error) {
        if (error !== DRY_RUN) { throw error; }
        out.log(`${TAG} dry run: nothing written (add --apply)`);
        return 0;
    }
    out.log(`${TAG} written`);
    return 0;
}

if (require.main === module) {
    main(process.argv.slice(2))
        .then((code) => { process.exitCode = code; })
        .catch((error) => { console.error(`${TAG} FAILED: ${error.message}`); process.exitCode = 1; })
        .finally(() => require('../services/prisma-database').prisma.$disconnect());
}

module.exports = { planFromArgs, main };
