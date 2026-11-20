#!/usr/bin/env node
'use strict';

/**
 * Cross-side group memberships, counted (READ-ONLY). Review item M1 of fix/admin-role-split.
 *
 * A group membership is a secondary role. Since the two-sided rule (orders 13, 34(2)) no
 * admin door puts a group of one side on an account of the other side, and no door can take
 * an old one off. From the same branch on, the runtime ignores such a row
 * (shared/user-groups.js membershipGrants). This script tells the operator how many are left,
 * so a cleanup can be ruled on.
 *
 * It prints counts per (group side, account side) and nothing else: no id, name, email or
 * national ID. It writes nothing. It needs nothing but @prisma/client and DATABASE_URL, so
 * it runs inside a backend container that predates this file:
 *
 *   docker exec -i <backend container> sh -c 'cd /app/apps/backend && node -' \
 *     < apps/backend/scripts/ops/count-cross-side-group-memberships.js
 *
 * From a checkout: node apps/backend/scripts/ops/count-cross-side-group-memberships.js
 */

// The side of each role word, copied from ROLE_AFFILIATION_BY_ROLE in shared/canonical-rbac.js
// because an older container must not load repo modules. A unit test keeps the two equal.
const SIDE_BY_ROLE = Object.freeze({
    health: 'public',
    document_reviewer: 'certification_body',
    dispatcher: 'certification_body',
    field_inspector: 'certification_body',
    certificate_approver: 'certification_body',
    finance_officer_dtam: 'certification_body',
    system_admin_dtam: 'certification_body',
    finance_officer_platform: 'platform_operator',
    system_admin_platform: 'platform_operator',
    system: 'system',
});

function sideOf(role) {
    return SIDE_BY_ROLE[String(role || '').trim().toLowerCase()] || 'unknown';
}

/**
 * @param {Array<{ groupCode: string, accountRole: string, accountDeleted: boolean }>} rows active memberships
 * @returns {Array<{ groupSide: string, accountSide: string, memberships: number, crossSide: boolean }>}
 */
function tally(rows) {
    const counts = new Map();
    for (const row of rows) {
        if (row.accountDeleted) { continue; }
        const key = `${sideOf(row.groupCode)}\t${sideOf(row.accountRole)}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, memberships]) => {
        const [groupSide, accountSide] = key.split('\t');
        return { groupSide, accountSide, memberships, crossSide: groupSide !== accountSide };
    });
}

function render(lines) {
    const pad = (value, width) => String(value).padEnd(width);
    const out = ['active group memberships of live accounts, by side (read-only, counts only)',
        `${pad('group side', 20)}${pad('account side', 20)}memberships`];
    for (const line of lines) {
        out.push(`${pad(line.groupSide, 20)}${pad(line.accountSide, 20)}${line.memberships}${line.crossSide ? '   <- cross-side' : ''}`);
    }
    const crossSide = lines.filter((line) => line.crossSide).reduce((sum, line) => sum + line.memberships, 0);
    out.push(`cross-side total: ${crossSide}`);
    return out.join('\n');
}

async function main() {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
        const memberships = await prisma.userGroupMembership.findMany({
            where: { isActive: true },
            select: { group: { select: { code: true } }, user: { select: { role: true, isDeleted: true } } },
        });
        console.log(render(tally(memberships.map((m) => ({
            groupCode: m.group.code, accountRole: m.user.role, accountDeleted: m.user.isDeleted === true,
        })))));
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module || module.id === '[stdin]') {
    main().catch((error) => {
        // The code only: a connection error message can carry the database host.
        console.error(`count failed: ${error.code || error.name}`);
        process.exitCode = 1;
    });
}

module.exports = { SIDE_BY_ROLE, sideOf, tally, render };
