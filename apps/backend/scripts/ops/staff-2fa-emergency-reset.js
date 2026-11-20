#!/usr/bin/env node
'use strict';

/**
 * ทางฉุกเฉินของคำสั่ง operator 89 ข (2026-10-20) แก้ไขโดยคำสั่ง 93: ล้างปัจจัยที่สองของบัญชีเจ้าหน้าที่ที่ระบุ
 * เมื่อไม่มีรหัสสำรองเหลือ และตัดการเข้าสู่ระบบกับ token ที่ค้างอยู่ทั้งหมดของบัญชีนั้นในธุรกรรมเดียวกัน
 * ไม่มีประตู HTTP (มติ 2026-09-26 ยังมีผล) รันในคอนเทนเนอร์ backend ผ่าน scripts/ops/staff-2fa-emergency-reset.sh
 * หลังผู้ดูแลระบบฝั่งเดียวกันยืนยันตัวตนเป็นลายลักษณ์อักษร และ operator อนุมัติครั้งนั้น
 *
 * การตัด: ประทับ sessionsRevokedAt (epoch) ในแถวเดียวกับการล้าง ทุก access token ตั๋วคำท้าทาย ตั๋วลงทะเบียน
 * และ refresh token ที่ออกก่อนเวลานั้นถูกปฏิเสธด้วย epoch เพียงอย่างเดียว · สิ่งที่อยู่นอกฐานข้อมูล (allowlist ของ
 * refresh token ช่องพักการย้ายเครื่อง และหลักฐานการเข้าสู่ระบบใน Redis) ถูกลบหลัง commit ถ้าลบไม่ได้สคริปต์บอกดัง ๆ
 * และออกด้วยรหัส 3 แต่ epoch ปฏิเสธของเหล่านั้นอยู่แล้ว
 *
 * exit 0 ล้างและตัดแล้ว · 2 ปฏิเสธหรือใช้ผิด (ไม่แตะฐานข้อมูล) · 3 ล้างในฐานข้อมูลแล้วแต่ลบใน Redis ไม่สำเร็จ · 1 ผิดพลาด
 */

const { isProviderRole, assertSameSideChange, normalizeRole, CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { hasUsableSecondFactor, backupCodeHashes } = require('../../shared/second-factor');
const { maskEmail } = require('../../utils/field-encryption');
const { staffRoleLabel } = require('../../shared/role-labels-th');
const { sessionEpochStamp } = require('../../utils/session-epoch');

const USAGE = 'วิธีใช้: node scripts/ops/staff-2fa-emergency-reset.js --target <รหัสบัญชีเป้าหมาย> --requester <รหัสบัญชีผู้ดูแลระบบฝั่งเดียวกัน> --confirmation <เลขอ้างอิงหนังสือยืนยันตัวตน> --approval <ข้อความอ้างอิงการอนุมัติของ operator>';
const INPUTS = Object.freeze(['target', 'requester', 'confirmation', 'approval']);
const SELECT = Object.freeze({
    id: true, role: true, status: true, organizationId: true, isDeleted: true, email: true,
    twoFactorEnabled: true, twoFactorMethod: true, twoFactorBackupCodes: true,
});

let db = null;
const database = () => {
    if (!db) { db = require('../../services/prisma-database').prisma; }
    return db;
};
const bangkok = (date) => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(date);

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i += 1) {
        const match = /^--([a-z]+)$/.exec(argv[i]);
        if (!match || !INPUTS.includes(match[1])) { return { error: `ไม่รู้จักตัวเลือก ${argv[i]}\n${USAGE}` }; }
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--') || !value.trim()) { return { error: `ตัวเลือก --${match[1]} ต้องมีค่า\n${USAGE}` }; }
        out[match[1]] = value.trim();
        i += 1;
    }
    const missing = INPUTS.filter((name) => !out[name]);
    if (missing.length) { return { error: `ขาด ${missing.map((name) => `--${name}`).join(' ')}\n${USAGE}` }; }
    return { args: out };
}

function refusal({ env, target, requester }) {
    if (env.REQUIRE_MFA_FOR_PRIVILEGED !== 'true') {
        return 'REQUIRE_MFA_FOR_PRIVILEGED ยังไม่เปิดในสภาพแวดล้อมนี้ การเข้าสู่ระบบครั้งถัดไปจะไม่บังคับให้ลงทะเบียนใหม่ จึงไม่ล้าง';
    }
    if (!target || target.isDeleted) { return 'ไม่พบบัญชีเป้าหมาย'; }
    if (!isProviderRole(target.role)) { return 'บัญชีเป้าหมายไม่ใช่บัญชีเจ้าหน้าที่ สคริปต์นี้ใช้กับบัญชีเจ้าหน้าที่เท่านั้น'; }
    if (!requester || requester.isDeleted || String(requester.status).toUpperCase() !== 'ACTIVE') {
        return 'ไม่พบบัญชีผู้ดูแลระบบที่ขอ หรือบัญชีนั้นไม่ได้ใช้งานอยู่';
    }
    try {
        assertSameSideChange({ actorRole: requester.role, target });
    } catch (err) {
        if (err.code !== 'CROSS_SIDE_USER_CHANGE_FORBIDDEN') { throw err; }
        return 'ผู้ขอไม่ใช่ผู้ดูแลระบบฝั่งเดียวกับบัญชีเป้าหมาย (คำสั่ง 13)';
    }
    if (normalizeRole(requester.role) === CANONICAL_ROLES.SYSTEM_ADMIN_DTAM && requester.organizationId !== target.organizationId) {
        return 'ผู้ดูแลระบบฝั่งกรมล้างได้เฉพาะบัญชีในหน่วยงานของตนเอง (คำสั่ง 17)';
    }
    if (requester.id === target.id) {
        return 'ผู้ขอเป็นบัญชีเป้าหมายเอง ต้องให้ผู้ดูแลระบบฝั่งเดียวกันอีกคนเป็นผู้ยืนยันตัวตนและขอ (คำสั่ง 89 ข2)';
    }
    if (!hasUsableSecondFactor(target)) {
        return 'บัญชีเป้าหมายไม่ได้เปิดการยืนยันตัวตนสองชั้นอยู่ ไม่มีอะไรให้ล้าง เข้าสู่ระบบแล้วลงทะเบียนได้เลย';
    }
    const unused = backupCodeHashes(target.twoFactorBackupCodes).length;
    if (unused > 0) {
        return `บัญชีเป้าหมายยังมีรหัสสำรองที่ไม่ได้ใช้ ${unused} รหัส ให้ใช้ขั้นตอน ก (ย้ายเครื่องด้วยรหัสสำรอง) แทน`;
    }
    return null;
}

// What lives outside the database for this account: the refresh-token allowlist, the pending
// device move and the sign-in proof. Counted before the transaction (the audit row records the
// count), deleted after it. No REDIS_URL means no store in this environment.
async function tokenStore(env) {
    if (!env.REDIS_URL) { return null; }
    const redisService = require('../../services/redis-service');
    const client = await redisService.connect();
    if (!client) { throw new Error('เชื่อมต่อ Redis ไม่ได้'); }
    await client.ping();
    return redisService;
}

async function countRefreshTokens(store, userId) {
    if (!store) { return 'no store configured'; }
    try {
        return (await store.client.keys(`auth:refresh:${userId}:*`)).length;
    } catch {
        return 'store unreachable';
    }
}

async function clearStore(store, userId) {
    const { revokeAllUserTokens } = require('../../services/token-revocation-service');
    await revokeAllUserTokens(userId);
    await store.delStrict(require('../../services/auth/mfa-rebind-proof-store').keyFor(userId));
    if (await store.getStrict(require('../../services/auth/mfa-reenrol-store').keyFor(userId))) {
        throw new Error('ช่องพักการย้ายเครื่องยังอยู่');
    }
}

async function run(argv, env = process.env) {
    const parsed = parseArgs(argv);
    if (parsed.error) { return { exitCode: 2, line: parsed.error }; }
    const { args } = parsed;
    const prisma = database();
    const { withoutTenantScope } = require('../../services/tenant-context');
    const { auditLogger, AuditCategory, AuditSeverity } = require('../../middleware/audit-logger');

    const [target, requester] = await withoutTenantScope(() => Promise.all([
        prisma.user.findUnique({ where: { id: args.target }, select: SELECT }),
        prisma.user.findUnique({ where: { id: args.requester }, select: SELECT }),
    ]));
    const refused = refusal({ env, target, requester });
    if (refused) { return { exitCode: 2, line: `ไม่ล้าง: ${refused}` }; }

    const store = await tokenStore(env);
    const refreshTokensInStore = await countRefreshTokens(store, target.id);
    const runAt = new Date();
    const stamp = sessionEpochStamp();
    await withoutTenantScope(() => prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: target.id },
            data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null, sessionsRevokedAt: stamp },
        });
        await auditLogger.logWithin({
            category: AuditCategory.SECURITY,
            action: 'MFA_EMERGENCY_RESET',
            severity: AuditSeverity.WARNING,
            actorId: requester.id,
            actorRole: requester.role,
            resourceType: 'USER',
            resourceId: target.id,
            ipAddress: 'ops-script',
            userAgent: 'scripts/ops/staff-2fa-emergency-reset.js',
            organizationId: target.organizationId,
            metadata: {
                approvalReference: args.approval,
                confirmationReference: args.confirmation,
                runAt: runAt.toISOString(),
                requesterId: requester.id,
                requesterRole: requester.role,
                targetRole: target.role,
                cleared: ['twoFactorEnabled', 'twoFactorSecret', 'twoFactorBackupCodes'],
                sessionsRevokedAt: stamp.toISOString(),
                revoked: {
                    sessions: 'all issued before sessionsRevokedAt',
                    challengeAndSetupTickets: 'all issued before sessionsRevokedAt',
                    refreshTokensInStore,
                },
            },
        }, tx);
    }));

    const line = `ล้างการยืนยันตัวตนสองชั้นของบัญชี ${target.id} (${staffRoleLabel(target.role)} ${maskEmail(target.email) || ''}) แล้วเมื่อ ${bangkok(runAt)}`
        + ` และตัดการเข้าสู่ระบบกับ token ที่ค้างอยู่ทั้งหมดของบัญชีนี้ (epoch ${stamp.toISOString()})`
        + ` ผู้ขอ ${requester.id} (${staffRoleLabel(requester.role)}) หนังสือยืนยันตัวตน ${args.confirmation} อนุมัติโดย operator: ${args.approval}`
        + ' บัญชีนี้ต้องลงทะเบียนแอปยืนยันตัวตนใหม่ในการเข้าสู่ระบบครั้งถัดไป';
    if (!store) {
        return { exitCode: 0, line: `${line} (ไม่มี REDIS_URL ในสภาพแวดล้อมนี้ จึงไม่มีช่องพักหรือ refresh token ให้ลบ)` };
    }
    try {
        await clearStore(store, target.id);
    } catch (err) {
        return { exitCode: 3, line: `${line} แต่ลบช่องพักการย้ายเครื่องและ refresh token ใน Redis ไม่สำเร็จ: ${err.message} (epoch ปฏิเสธของเหล่านั้นอยู่แล้ว ให้ตรวจ Redis แล้วลบคีย์ของบัญชีนี้)` };
    } finally {
        await store.disconnect().catch(() => {});
    }
    return { exitCode: 0, line: `${line} ลบช่องพักการย้ายเครื่องและ refresh token ใน Redis แล้ว` };
}

if (require.main === module) {
    run(process.argv.slice(2))
        .then(({ exitCode, line }) => {
            (exitCode === 0 ? process.stdout : process.stderr).write(`${line}\n`);
            process.exitCode = exitCode;
        })
        .catch((error) => {
            process.stderr.write(`ล้างไม่สำเร็จ: ${error.message}\n`);
            process.exitCode = 1;
        })
        .finally(() => (db ? db.$disconnect().catch(() => {}) : undefined));
}

module.exports = { parseArgs, refusal, run, USAGE };
