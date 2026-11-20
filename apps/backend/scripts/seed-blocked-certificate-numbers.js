#!/usr/bin/env node
'use strict';

/**
 * Load the certificate numbers DTAM issued itself into blocked_certificate_numbers, so the
 * system never issues one of them (order 134 task 1).
 *
 * The register must never be committed, so the list is read from a path OUTSIDE the
 * repository, passed as the first argument: one number per line, `60/2569` (a prefix such as
 * `TH-GACP 60/2569` is read the same way); blank lines and lines starting with # are ignored.
 * Any other line refuses the whole load and is named by line number.
 *
 * Usage:
 *   node scripts/seed-blocked-certificate-numbers.js /path/outside/repo/numbers.txt --source "ทะเบียนกรม 2026-10-22"
 *   add --apply to write. Rerunning adds only numbers not already blocked.
 */

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

const fs = require('fs');
const path = require('path');
const { toCanonicalCertificateNumber } = require('../services/certificate-number-display');

const TAG = '[seed-blocked-certificate-numbers]';
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SOURCE_MAX_LENGTH = 200;

function argValue(argv, flag) {
    const at = argv.indexOf(flag);
    return at >= 0 ? String(argv[at + 1] || '').trim() : '';
}

function insideRepository(file) {
    const relative = path.relative(fs.realpathSync(REPO_ROOT), file);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function realPathOf(file) {
    try { return fs.realpathSync(file); } catch { return path.resolve(file); }
}

function parseNumberList(text) {
    const numbers = new Map();
    const bad = [];
    text.split(/\r?\n/).forEach((raw, index) => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) { return; }
        const m = String(toCanonicalCertificateNumber(line)).match(/^(?:[A-Z][A-Z0-9-]* )?(\d+)\/(25\d{2})$/);
        if (!m || Number(m[1]) < 1) { bad.push({ line: index + 1, text: line }); return; }
        const entry = { year: Number(m[2]), number: Number(m[1]) };
        numbers.set(`${entry.year}/${entry.number}`, entry);
    });
    return { numbers: [...numbers.values()], bad };
}

function countByYear(numbers) {
    const counts = {};
    for (const { year } of numbers) { counts[year] = (counts[year] || 0) + 1; }
    return counts;
}

function auditWriter() {
    const { auditLogger } = require('../middleware/audit-logger');
    return (row, tx) => auditLogger.logWithin(row, tx);
}

async function main(argv, { prisma = require('../services/prisma-database').prisma, out = console, audit = auditWriter() } = {}) {
    const file = argv[0] && !argv[0].startsWith('--') ? realPathOf(argv[0]) : '';
    const source = argValue(argv, '--source');
    if (!file || !source || source.length > SOURCE_MAX_LENGTH) {
        out.error(`${TAG} REFUSED: need <path to the number list> and --source "<where the list came from>"`);
        return 1;
    }
    if (insideRepository(file)) {
        out.error(`${TAG} REFUSED: the list must live outside the repository, so the register is never committed`);
        return 1;
    }
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch (error) {
        out.error(`${TAG} REFUSED: cannot read the list: ${error.code || error.message}`);
        return 1;
    }
    const { numbers, bad } = parseNumberList(text);
    if (bad.length > 0) {
        for (const { line, text: content } of bad) { out.error(`${TAG} line ${line}: not a number of the form n/ปี พ.ศ.: ${content}`); }
        out.error(`${TAG} REFUSED: ${bad.length} unreadable line(s); nothing written`);
        return 1;
    }
    const existing = await prisma.blockedCertificateNumber.findMany({ select: { year: true, number: true } });
    const known = new Set(existing.map((row) => `${row.year}/${row.number}`));
    const fresh = numbers.filter((entry) => !known.has(`${entry.year}/${entry.number}`));
    out.log(`${TAG} in the list: ${numbers.length} ${JSON.stringify(countByYear(numbers))}; already blocked: ${numbers.length - fresh.length}; new: ${fresh.length} ${JSON.stringify(countByYear(fresh))}`);
    if (!argv.includes('--apply')) {
        out.log(`${TAG} dry run: nothing written (add --apply)`);
        return 0;
    }
    if (fresh.length === 0) {
        out.log(`${TAG} nothing new to write`);
        return 0;
    }
    await prisma.$transaction(async (tx) => {
        await tx.blockedCertificateNumber.createMany({ data: fresh.map((entry) => ({ ...entry, source })), skipDuplicates: true });
        await audit({
            category: 'ADMIN',
            action: 'CERTIFICATE_NUMBERS_BLOCKED',
            severity: 'WARNING',
            actorId: 'SYSTEM',
            actorRole: 'system',
            actorType: 'SYSTEM',
            resourceType: 'SYSTEM',
            resourceId: 'blocked_certificate_numbers',
            metadata: { source: 'scripts/seed-blocked-certificate-numbers.js', listSource: source, added: fresh.length, byYear: countByYear(fresh) },
        }, tx);
    });
    out.log(`${TAG} written: ${fresh.length}`);
    return 0;
}

if (require.main === module) {
    main(process.argv.slice(2))
        .then((code) => { process.exitCode = code; })
        .catch((error) => { console.error(`${TAG} FAILED: ${error.message}`); process.exitCode = 1; })
        .finally(() => require('../services/prisma-database').prisma.$disconnect());
}

module.exports = { parseNumberList, main };
