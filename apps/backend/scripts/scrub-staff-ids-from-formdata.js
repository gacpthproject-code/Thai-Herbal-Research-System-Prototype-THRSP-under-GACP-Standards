#!/usr/bin/env node
/**
 * scrub-staff-ids-from-formdata: removes legacy staff 13-digit ids from applications.formData.
 *
 * Before 9c0d5c45 (2026-10-07) the reviewer, inspector and dispatcher doors wrote the
 * staff member's providerId (a national id) into formData: PROVIDERAssignment
 * .reviewerProviderId, reviewHistory[].by, decidedBy, startedBy and carRequest.requestedBy.
 * The code now writes the staff user id. This repairs the rows written before.
 *
 * Rule, per value: PROVIDERAssignment.reviewerProviderId is dropped (reviewerId beside it
 * already names the reviewer). A 13-digit value under by / decidedBy / startedBy /
 * requestedBy, at any depth, becomes the id of the user holding that providerId, or is
 * dropped when no user holds it. Anything else, a user id included, is left alone, so a
 * second run changes nothing.
 *
 * Reads and writes through the application's prisma client, so a leaf the PDPA extension
 * encrypted is decrypted on read and the rewritten formData is encrypted on write.
 * Soft-deleted applications are repaired too: the id is in them all the same.
 *
 * A row whose formData did not decrypt (a leaf reads [PII_DECRYPT_FAILED]) is skipped and
 * counted: writing it back would replace the ciphertext with the marker. A row changed
 * between the read and the write (updatedAt moved) is skipped and counted as a conflict;
 * the next run picks it up.
 *
 *   node scripts/scrub-staff-ids-from-formdata.js            dry run: counts only
 *   node scripts/scrub-staff-ids-from-formdata.js --apply    writes
 *
 * DATABASE_URL must be exported in the shell; a value loaded from a .env file is refused.
 * Prints counts only, never an id, a value or a connection string.
 */

'use strict';

const STARTUP_DATABASE_URL = process.env.DATABASE_URL;

const STAFF_ID_KEYS = new Set(['by', 'decidedBy', 'startedBy', 'requestedBy']);
const NATIONAL_ID = /^\d{13}$/;
const DECRYPT_FAILED = '[PII_DECRYPT_FAILED]';

/**
 * @param {unknown} formData
 * @param {Map<string, string|null>} userIdByProviderId resolved before the walk
 * @returns {{ formData: unknown, replaced: number, dropped: number }}
 */
function scrubFormData(formData, userIdByProviderId) {
    const counts = { replaced: 0, dropped: 0 };
    const walk = (node, parentKey) => {
        if (Array.isArray(node)) { return node.map((item) => walk(item, parentKey)); }
        if (!node || typeof node !== 'object') { return node; }
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            if (parentKey === 'PROVIDERAssignment' && key === 'reviewerProviderId') {
                counts.dropped += 1;
                continue;
            }
            if (STAFF_ID_KEYS.has(key) && typeof value === 'string' && NATIONAL_ID.test(value)) {
                const userId = userIdByProviderId.get(value) || null;
                if (userId) {
                    out[key] = userId;
                    counts.replaced += 1;
                } else {
                    counts.dropped += 1;
                }
                continue;
            }
            out[key] = walk(value, key);
        }
        return out;
    };
    return { formData: walk(formData, null), ...counts };
}

function staffIdsIn(formData) {
    const found = new Set();
    const walk = (node) => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!node || typeof node !== 'object') { return; }
        for (const [key, value] of Object.entries(node)) {
            if (STAFF_ID_KEYS.has(key) && typeof value === 'string' && NATIONAL_ID.test(value)) { found.add(value); }
            walk(value);
        }
    };
    walk(formData);
    return found;
}

/**
 * @param {{ prisma: object, apply: boolean, findUserByProviderId: (id: string) => Promise<{id: string}|null> }} deps
 * @returns {Promise<{ scanned: number, rowsToChange: number, rowsChanged: number, replaced: number,
 *   dropped: number, decryptFailed: number, conflicts: number }>}
 */
function run(deps) {
    const { withDeletedRows } = require('../services/soft-delete-context');
    return withDeletedRows(() => scrubAll(deps));
}

async function scrubAll({ prisma, apply, findUserByProviderId }) {
    const totals = { scanned: 0, rowsToChange: 0, rowsChanged: 0, replaced: 0, dropped: 0, decryptFailed: 0, conflicts: 0 };
    const resolved = new Map();
    let cursor;
    for (;;) {
        const page = await prisma.application.findMany({
            select: { id: true, formData: true, updatedAt: true },
            orderBy: { id: 'asc' },
            take: 200,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (page.length === 0) { break; }
        cursor = page[page.length - 1].id;
        for (const row of page) {
            totals.scanned += 1;
            if (JSON.stringify(row.formData ?? null).includes(DECRYPT_FAILED)) {
                totals.decryptFailed += 1;
                continue;
            }
            for (const providerId of staffIdsIn(row.formData)) {
                if (!resolved.has(providerId)) {
                    resolved.set(providerId, (await findUserByProviderId(providerId))?.id || null);
                }
            }
            const result = scrubFormData(row.formData, resolved);
            if (result.replaced + result.dropped === 0) { continue; }
            totals.rowsToChange += 1;
            totals.replaced += result.replaced;
            totals.dropped += result.dropped;
            if (apply) {
                const { count } = await prisma.application.updateMany({
                    where: { id: row.id, updatedAt: row.updatedAt },
                    data: { formData: result.formData },
                });
                if (count === 1) { totals.rowsChanged += 1; } else { totals.conflicts += 1; }
            }
        }
    }
    return totals;
}

async function main() {
    if (!STARTUP_DATABASE_URL) {
        console.error('[scrub-staff-ids] export DATABASE_URL in this shell first; a .env value is refused');
        process.exit(2);
    }
    const apply = process.argv.includes('--apply');
    const { prisma } = require('../services/prisma-database');
    const { withoutTenantScope } = require('../services/tenant-context');
    const { findUserByProviderIdSecurely } = require('../services/user-lookup-service');
    try {
        const totals = await withoutTenantScope(() => run({
            prisma,
            apply,
            findUserByProviderId: (id) => findUserByProviderIdSecurely(id, { includeDeleted: true }),
        }));
        console.log(`[scrub-staff-ids] mode=${apply ? 'apply' : 'dry-run'} scanned=${totals.scanned} `
            + `rowsToChange=${totals.rowsToChange} rowsChanged=${totals.rowsChanged} `
            + `replacedWithUserId=${totals.replaced} dropped=${totals.dropped} `
            + `skippedDecryptFailed=${totals.decryptFailed} skippedConflict=${totals.conflicts}`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[scrub-staff-ids] failed: ${error?.code || error?.name || 'error'}`);
        process.exit(1);
    });
}

module.exports = { scrubFormData, run, STAFF_ID_KEYS };
