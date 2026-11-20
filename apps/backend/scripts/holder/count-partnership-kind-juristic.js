'use strict';

/**
 * Read-only count for the deploy runbook (docs/runbooks/holder-single-source-deploy.md):
 * how many JURISTIC (บริษัท) holders created before order 145 carry a DBD number whose 4th
 * digit says partnership (2 ห้างหุ้นส่วนสามัญนิติบุคคล, 3 ห้างหุ้นส่วนจำกัด). The new door
 * refuses such a number under บริษัท; the rows that already exist keep working as companies
 * until the operator decides whether to relabel them. `juristicId` is encrypted at rest, so
 * this goes through prisma (decrypted on read) and not through SQL.
 *
 *   node scripts/holder/count-partnership-kind-juristic.js          # counts only
 *   node scripts/holder/count-partnership-kind-juristic.js --ids    # also the entity ids
 *
 * Prints counts by 4th digit and entity ids on request. Never prints a registration number.
 */

const path = require('path');
const { JURISTIC_KINDS } = require('../../shared/holder-registry');

async function count({ prisma, withoutTenantScope }) {
    const byKind = Object.fromEntries(Object.keys(JURISTIC_KINDS).map((k) => [k, 0]));
    const partnershipKindIds = [];
    let other = 0;
    let unreadable = 0;
    let total = 0;
    await withoutTenantScope(async () => {
        const rows = await prisma.entity.findMany({
            where: { type: 'JURISTIC', isDeleted: false },
            select: { id: true, juristicId: true },
        });
        total = rows.length;
        for (const row of rows) {
            const no = typeof row.juristicId === 'string' ? row.juristicId.trim() : '';
            if (!/^\d{13}$/.test(no)) { unreadable += 1; continue; }
            const kind = no[3];
            if (kind in byKind) { byKind[kind] += 1; } else { other += 1; }
            if (kind === '2' || kind === '3') { partnershipKindIds.push(row.id); }
        }
    });
    return { total, byKind, other, unreadable, partnershipKind: partnershipKindIds.length, partnershipKindIds };
}

if (require.main === module) {
    const { prisma } = require(path.resolve(__dirname, '../../services/prisma-database'));
    const { withoutTenantScope } = require(path.resolve(__dirname, '../../services/tenant-context'));
    count({ prisma, withoutTenantScope })
        .then(({ partnershipKindIds, ...counts }) => {
            console.log(JSON.stringify(process.argv.includes('--ids') ? { ...counts, partnershipKindIds } : counts));
            return prisma.$disconnect();
        })
        .catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { count };
