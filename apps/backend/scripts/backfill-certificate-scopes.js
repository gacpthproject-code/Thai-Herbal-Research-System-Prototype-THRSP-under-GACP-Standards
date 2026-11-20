#!/usr/bin/env node
/**
 * Backfill `certificate_scopes` for certificates issued without their own scope rows.
 *
 * The scope table and a one-time backfill arrived on 2026-09-11, but issuance wrote no
 * scope row until fix/public-verify round 2. Every certificate issued in between holds no
 * record of what it certified: the planting gate answers for it by reading the application
 * live (services/certified-scope.js), and the public verify answer (operator order 68(1))
 * shows no cultivation type for it.
 *
 * Each such certificate gets one row per cultivation type its application declares in its own
 * data, read with deriveDimensions, the derivation issuance and the planting gate use.
 * grantedDate is the issue date. auditId is the decided audit pinned on the application, or
 * NULL ("not known"), as the 2026-09-11 backfill left it.
 *
 * A certificate whose type would come only from the applications.areaType column is skipped:
 * three writers default that column to OUTDOOR, so the word there was never declared and must not
 * be frozen as the certificate's scope. A certificate with no type anywhere is skipped too. Both
 * are counted on every run for the operator to decide.
 *
 * Read-only by default. Nothing is written without `--apply`. Idempotent: only certificates
 * with no scope row are read, and the insert skips duplicates. Standard output carries counts
 * only; the skipped certificates' numbers go to a 0600 file whose path is printed.
 *
 *   node apps/backend/scripts/backfill-certificate-scopes.js
 *   node apps/backend/scripts/backfill-certificate-scopes.js --apply
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

if (require.main === module) {
    process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
}
const { deriveDimensions } = require('../services/application-requirements-service');

/** `where` narrows the certificates read, e.g. { organizationId } for one organization at a time. */
async function backfillCertificateScopes(prisma, { apply = false, where = {} } = {}) {
    const certificates = await prisma.certificate.findMany({
        where: { ...where, scopes: { none: {} } },
        select: {
            id: true,
            certificateNumber: true,
            issuedDate: true,
            application: { select: { formData: true, areaType: true } },
        },
        orderBy: { issuedDate: 'asc' },
    });
    const rows = [];
    const columnOnly = [];
    const undeclared = [];
    for (const certificate of certificates) {
        const formData = certificate.application?.formData;
        const { areaTypes } = deriveDimensions({ formData });
        if (areaTypes.length === 0) {
            const skipped = { certificateNumber: certificate.certificateNumber, areaTypeColumn: certificate.application?.areaType ?? null };
            const fromColumn = deriveDimensions(certificate.application).areaTypes;
            (fromColumn.length > 0 ? columnOnly : undeclared).push(skipped);
            continue;
        }
        for (const areaType of areaTypes) {
            rows.push({
                certificateId: certificate.id,
                areaType,
                grantedDate: certificate.issuedDate,
                auditId: formData?.onsiteAuditId ?? null,
            });
        }
    }
    const written = apply && rows.length > 0
        ? (await prisma.certificateScope.createMany({ data: rows, skipDuplicates: true })).count
        : 0;
    const byType = rows.reduce((counts, row) => ({ ...counts, [row.areaType]: (counts[row.areaType] || 0) + 1 }), {});
    return {
        certificatesWithoutScope: certificates.length,
        rowsToWrite: rows.length,
        byType,
        written,
        columnOnly,
        undeclared,
    };
}

function writeSkippedList({ columnOnly, undeclared }) {
    const lines = [
        ...columnOnly.map((skipped) => ['type from the column only', skipped.certificateNumber, skipped.areaTypeColumn]),
        ...undeclared.map((skipped) => ['no cultivation type at all', skipped.certificateNumber, skipped.areaTypeColumn]),
    ];
    if (lines.length === 0) { return null; }
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-certificate-scopes-')), 'skipped.tsv');
    const table = [['reason', 'certificateNumber', 'applications.areaType'], ...lines].map((line) => line.join('\t')).join('\n');
    fs.writeFileSync(file, `${table}\n`, { mode: 0o600 });
    return file;
}

async function main() {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const { PrismaClient } = require('@prisma/client');
    const apply = process.argv.includes('--apply');
    const prisma = new PrismaClient();
    try {
        const result = await backfillCertificateScopes(prisma, { apply });
        console.log(`mode: ${apply ? 'APPLY' : 'dry run (nothing written; pass --apply to write)'}`);
        console.log(`certificates without a scope row: ${result.certificatesWithoutScope}`);
        console.log(`scope rows to write: ${result.rowsToWrite} ${JSON.stringify(result.byType)}`);
        console.log(`scope rows written: ${result.written}`);
        console.log(`type from the column only, skipped: ${result.columnOnly.length}`);
        console.log(`no cultivation type at all, skipped: ${result.undeclared.length}`);
        const listFile = writeSkippedList(result);
        if (listFile) { console.log(`skipped certificates listed in (0600): ${listFile}`); }
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`backfill-certificate-scopes failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { backfillCertificateScopes };
