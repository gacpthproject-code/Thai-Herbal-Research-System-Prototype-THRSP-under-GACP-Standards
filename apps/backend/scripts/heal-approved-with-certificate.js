#!/usr/bin/env node
/**
 * heal-approved-with-certificate — คำขอที่ออกใบรับรองแล้วแต่ค้างสถานะ APPROVED
 *
 * ทำไมต้องมี: ก่อนคำสั่ง 29 (operator 2026-10-07) ประตูอนุมัติพาคำขอไปแค่ APPROVED แล้วออกใบ
 * ไม่มีขั้นไหนพาต่อไป CERTIFIED คำขอจึงค้าง พร้อมงานเจ้าหน้าที่ที่ยังเปิด (live walk 2026-10-07 F2:
 * APP-…80E5FE ถือใบ TH-GACP 1/2569 แต่ยัง APPROVED มีงานค้าง 4 งาน) · ตอนนี้ประตูอนุมัติจบที่
 * CERTIFIED เองแล้ว สคริปต์นี้ซ่อมแถวที่เกิดก่อนหน้า
 *
 * ทำอะไร: คำขอ APPROVED ที่มีใบรับรองที่ยังไม่ถูกเพิกถอนและไม่ถูกลบ → CERTIFIED ผ่านตัวเขียนสถานะ
 * ในนามผู้อนุมัติที่ตัดสินคำขอนั้น (application.headAuditorId) เพราะ CERTIFIED เป็นสถานะการตัดสิน
 * ของผู้อนุมัติ (shared/decision-states.js) SYSTEM ไม่ถือขา APPROVED→CERTIFIED จึงเขียนแทนไม่ได้
 * · ตัวเขียนยกเลิกงานที่ยังเปิดของคำขอที่จบแล้ว และเขียนแถวบันทึกการเปลี่ยนสถานะ
 * · คำขอ APPROVED ที่ไม่มีใบไม่แตะ · นับเป็น refused เมื่อ: ใบที่ยังใช้ได้ไม่ใช่หนึ่งใบพอดี · ไม่มีผู้อนุมัติ
 *   บันทึกไว้ · ผู้นั้นไม่ใช่ผู้อนุมัติ บัญชีไม่ ACTIVE หรืออยู่คนละองค์กรกับคำขอ
 * · แถวบันทึกตรวจสอบระบุ executedBy: 'script' แยกจากการกดของคนจริง
 *
 * ปลอดภัยต่อการรันซ้ำ: แถวที่ซ่อมแล้วเป็น CERTIFIED จึงไม่เข้าเงื่อนไขอีก
 *
 *   DATABASE_URL=... node scripts/heal-approved-with-certificate.js          ดูอย่างเดียว พิมพ์จำนวน
 *   DATABASE_URL=... node scripts/heal-approved-with-certificate.js --apply  เขียน (operator เท่านั้น)
 *
 * พิมพ์เฉพาะจำนวน ไม่พิมพ์ connection string เลขคำขอ หรือข้อมูลบุคคล
 */

'use strict';

// Snapshot before anything else is required: @prisma/client loads a .env file into
// process.env when DATABASE_URL is missing, and that value must never be the target.
const STARTUP_DATABASE_URL = process.env.DATABASE_URL;

const REVOKED = ['revoked', 'REVOKED'];
const HEAL_REASON = 'HEAL_APPROVED_WITH_CERTIFICATE';

/** Applications to heal and the open work tasks they carry. Writes nothing. */
async function planHeal(prisma) {
    const { withoutTenantScope } = require('../services/tenant-context');
    return withoutTenantScope(async () => {
        const rows = await prisma.application.findMany({
            where: {
                status: 'APPROVED',
                isDeleted: false,
                certificates: { some: { isDeleted: false, status: { notIn: REVOKED } } },
            },
            select: {
                id: true,
                organizationId: true,
                headAuditor: { select: { id: true, role: true, status: true, isDeleted: true, organizationId: true } },
                _count: { select: { certificates: { where: { isDeleted: false, status: { notIn: REVOKED } } } } },
            },
        });
        const openTasks = rows.length
            ? await prisma.workActivity.count({
                where: { applicationId: { in: rows.map((r) => r.id) }, completedAt: null, cancelledAt: null },
            })
            : 0;
        return { rows, counts: { applications: rows.length, openTasks } };
    });
}

/**
 * Why a row may not be healed, or null. The write goes out in the recorded approver's name, so
 * that person must still be an active certificate approver of the application's organisation,
 * and exactly one live certificate must stand behind the CERTIFIED it writes.
 */
function healRefusal(row, { CANONICAL_ROLES, normalizeRole }) {
    if (row._count.certificates !== 1) { return 'NOT_EXACTLY_ONE_LIVE_CERTIFICATE'; }
    const approver = row.headAuditor;
    if (!approver || normalizeRole(approver.role) !== CANONICAL_ROLES.CERTIFICATE_APPROVER) { return 'NO_RECORDED_APPROVER'; }
    if (approver.status !== 'ACTIVE' || approver.isDeleted) { return 'APPROVER_NOT_ACTIVE'; }
    if (approver.organizationId !== row.organizationId) { return 'APPROVER_OF_ANOTHER_ORGANIZATION'; }
    return null;
}

/**
 * @returns {Promise<{ healed: number, refused: number, planned: object }>}
 */
async function applyHeal(prisma) {
    const { writeApplicationStatus } = require('../services/application-status-writer');
    const { statusTransitionAuditHook } = require('../middleware/audit-logger');
    const { runWithTenantContext } = require('../services/tenant-context');
    const { CANONICAL_ROLES, normalizeRole } = require('../shared/canonical-rbac');
    const plan = await planHeal(prisma);
    let healed = 0;
    let refused = 0;
    for (const row of plan.rows) {
        const refusal = healRefusal(row, { CANONICAL_ROLES, normalizeRole });
        if (refusal) {
            refused += 1;
            console.error(`[heal-approved-with-certificate] one application refused: ${refusal}`);
            continue;
        }
        const approver = row.headAuditor;
        try {
            await runWithTenantContext({ organizationId: row.organizationId }, () => prisma.$transaction((tx) => writeApplicationStatus({
                prisma: tx,
                applicationId: row.id,
                fromStatus: 'APPROVED',
                toStatus: 'CERTIFIED',
                actorId: approver.id,
                actorRole: CANONICAL_ROLES.CERTIFICATE_APPROVER,
                reason: HEAL_REASON,
                autoIssueCertificate: false,
                onAudit: statusTransitionAuditHook({ tx, metadata: { reasonCode: HEAL_REASON, executedBy: 'script' } }),
            })));
            healed += 1;
        } catch (err) {
            refused += 1;
            console.error(`[heal-approved-with-certificate] one application refused: ${err?.code || err?.message}`);
        }
    }
    return { healed, refused, planned: plan.counts };
}

async function main() {
    if (!STARTUP_DATABASE_URL) {
        console.error('Set DATABASE_URL in this shell (a value from a .env file is refused).');
        process.exit(2);
    }
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: STARTUP_DATABASE_URL } }, log: ['error'] });
    try {
        if (process.argv.includes('--apply')) {
            const out = await applyHeal(prisma);
            console.log(`applied: planned applications=${out.planned.applications} openTasks=${out.planned.openTasks} healed=${out.healed} refused=${out.refused}`);
            process.exitCode = out.refused ? 1 : 0;
        } else {
            const { counts } = await planHeal(prisma);
            console.log(`dry-run: applications=${counts.applications} openTasks=${counts.openTasks} (nothing written; add --apply to heal)`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error(`[heal-approved-with-certificate] failed: ${err?.message}`);
        process.exit(1);
    });
}

module.exports = { planHeal, applyHeal, HEAL_REASON };
