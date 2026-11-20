#!/usr/bin/env node
'use strict';

/**
 * คำสั่ง operator 94 ข้อ 3 (2026-10-20): ตัดการเข้าสู่ระบบและ token ที่ค้างอยู่ของบัญชีเจ้าหน้าที่และผู้ดูแลระบบทุกบัญชี
 * ณ ตอนเปิด REQUIRE_MFA_FOR_PRIVILEGED ธงจึงมีผลทันที ไม่ต้องรอ session เดิมหมดอายุ (12 ชั่วโมง)
 * ไม่มีประตู HTTP · คำสั่ง 105 ข้อ 4
 */

const { Prisma } = require('@prisma/client');
const { STAFF_ROLES } = require('../../shared/role-labels-th');
const { sessionEpochStamp } = require('../../utils/session-epoch');

const USAGE = 'วิธีใช้: node scripts/ops/staff-sessions-revoke-at-flag-on.js --event flag-on|flag-off [--note <ข้อความอ้างอิงการ deploy>]';
const AUDIT_ACTION = 'STAFF_SESSIONS_REVOKED_AT_FLAG_ON';
const ROLLBACK_ACTION = 'STAFF_MFA_FLAG_ROLLED_BACK';
const EXIT = Object.freeze({ DONE: 0, FAILED: 1, REFUSED: 2 });
const HOST_STATE_OF_ACTION = Object.freeze({ [AUDIT_ACTION]: 'on', [ROLLBACK_ACTION]: 'rolled-back' });
const FLAG_EVENTS = Object.freeze({
    'flag-on': Object.freeze({ from: ['off', 'rolled-back'], action: AUDIT_ACTION, flagReadsOn: true }),
    'flag-off': Object.freeze({ from: ['on'], action: ROLLBACK_ACTION, flagReadsOn: false }),
});
const hostState = (latest) => (latest ? HOST_STATE_OF_ACTION[latest.action] : 'off');
const THIS_SCRIPT = 'scripts/ops/staff-sessions-revoke-at-flag-on.js';
const SESSION_REVOKE_EVENTS = Object.freeze({
    'flag-on': THIS_SCRIPT,
    'mfa-clear': 'scripts/ops/staff-2fa-emergency-reset.js',
    'mfa-move': 'routes/api/identity/mfa.js',
});

let db = null;
const database = () => {
    if (!db) { db = require('../../services/prisma-database').prisma; }
    return db;
};
const bangkok = (date) => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(date);

function parseArgs(argv) {
    const out = { note: '', event: '' };
    for (let i = 0; i < argv.length; i += 1) {
        const name = argv[i] === '--note' ? 'note' : argv[i] === '--event' ? 'event' : null;
        if (!name) { return { error: `ไม่รู้จักตัวเลือก ${argv[i]}\n${USAGE}` }; }
        const value = argv[i + 1];
        if (value === undefined || !value.trim()) { return { error: `ตัวเลือก ${argv[i]} ต้องมีค่า\n${USAGE}` }; }
        out[name] = value.trim();
        i += 1;
    }
    return { args: out };
}

function refusal(env, event) {
    const known = [...new Set([...Object.keys(SESSION_REVOKE_EVENTS), ...Object.keys(FLAG_EVENTS)])].join(' ');
    if (!event) { return `ต้องระบุ --event (เหตุการณ์ที่อนุมัติ: ${known})`; }
    const flagEvent = FLAG_EVENTS[event];
    if (!flagEvent) {
        return SESSION_REVOKE_EVENTS[event]
            ? `เหตุการณ์ ${event} ตัด session ที่ ${SESSION_REVOKE_EVENTS[event]} ไม่ใช่สคริปต์นี้`
            : `เหตุการณ์ ${event} ไม่อยู่ในรายการที่อนุมัติ (${known})`;
    }
    const flagOn = env.REQUIRE_MFA_FOR_PRIVILEGED === 'true';
    if (flagEvent.flagReadsOn && !flagOn) {
        return 'REQUIRE_MFA_FOR_PRIVILEGED ยังไม่เปิดในสภาพแวดล้อมนี้ การตัด session โดยไม่มีธงจะปล่อยให้เข้าใหม่ได้โดยไม่ลงทะเบียน จึงไม่ตัด';
    }
    if (!flagEvent.flagReadsOn && flagOn) { return 'REQUIRE_MFA_FOR_PRIVILEGED ยังเปิดอยู่ในสภาพแวดล้อมนี้ จึงไม่บันทึกการย้อนธง'; }
    return null;
}

async function run(argv, env = process.env) {
    const parsed = parseArgs(argv);
    if (parsed.error) { return { exitCode: EXIT.REFUSED, line: parsed.error }; }
    const { event, note } = parsed.args;
    const refused = refusal(env, event);
    if (refused) { return { exitCode: EXIT.REFUSED, line: `ไม่ตัด: ${refused}` }; }
    const transition = FLAG_EVENTS[event];

    const prisma = database();
    const { withoutTenantScope } = require('../../services/tenant-context');
    const { auditLogger, AuditCategory, AuditSeverity } = require('../../middleware/audit-logger');
    const runAt = new Date();
    const stamp = sessionEpochStamp();
    const outcome = await withoutTenantScope(() => prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${AUDIT_ACTION}))`;
        const latest = await tx.auditLog.findFirst({
            where: { action: { in: [AUDIT_ACTION, ROLLBACK_ACTION] } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { action: true, createdAt: true },
        });
        const from = hostState(latest);
        if (!transition.from.includes(from)) { return { from, latest }; }
        const audit = (metadata) => auditLogger.logWithin({
            category: AuditCategory.SECURITY,
            action: transition.action,
            severity: AuditSeverity.WARNING,
            actorId: 'ops-script',
            actorRole: 'system',
            resourceType: 'USER',
            resourceId: 'staff-and-admin-accounts',
            ipAddress: 'ops-script',
            userAgent: 'scripts/ops/staff-sessions-revoke-at-flag-on.js',
            metadata: { event, runAt: runAt.toISOString(), note, ...metadata },
        }, tx);
        if (event === 'flag-off') {
            await audit({ revokedAt: latest.createdAt.toISOString() });
            return { rolledBack: true };
        }
        const count = await tx.$executeRaw`
            UPDATE "users" SET "sessionsRevokedAt" = ${stamp}
            WHERE "isDeleted" = false AND lower(trim("role")) IN (${Prisma.join(STAFF_ROLES)})`;
        await audit({ accounts: count, sessionsRevokedAt: stamp.toISOString() });
        return { accounts: count };
    }));
    if (outcome.rolledBack) {
        return { exitCode: EXIT.DONE, line: `บันทึกการย้อนธงแล้ว (แถว ${ROLLBACK_ACTION}) การเปิดธงครั้งถัดไปจะตัด session อีกครั้ง` };
    }
    if (outcome.from && event === 'flag-off') {
        return { exitCode: EXIT.DONE, line: `ฐานข้อมูลนี้อยู่ในสถานะ ${outcome.from} ไม่ใช่ on ไม่มีการย้อนให้บันทึก` };
    }
    if (outcome.from) {
        return { exitCode: EXIT.REFUSED, line: `ไม่ตัด: ฐานข้อมูลนี้ตัด session ตอนเปิดธงไปแล้วเมื่อ ${bangkok(outcome.latest.createdAt)} (แถว ${AUDIT_ACTION}) รันได้ครั้งเดียวต่อเครื่องจนกว่าจะ rollback` };
    }
    const { accounts } = outcome;
    return {
        exitCode: EXIT.DONE,
        line: `ตัดการเข้าสู่ระบบและ token ที่ค้างอยู่ของบัญชีเจ้าหน้าที่และผู้ดูแลระบบ ${accounts} บัญชีแล้วเมื่อ ${bangkok(runAt)} (epoch ${stamp.toISOString()})`
            + (note ? ` อ้างอิง: ${note}` : '')
            + ' ทุกบัญชีต้องเข้าสู่ระบบใหม่ และบัญชีที่ยังไม่ลงทะเบียนแอปยืนยันตัวตนจะได้ตั๋วลงทะเบียนเท่านั้น',
    };
}

if (require.main === module) {
    run(process.argv.slice(2))
        .then(({ exitCode, line }) => {
            (exitCode === EXIT.DONE ? process.stdout : process.stderr).write(`${line}\n`);
            process.exitCode = exitCode;
        })
        .catch((error) => {
            process.stderr.write(`ตัดไม่สำเร็จ: ${error.message}\n`);
            process.exitCode = EXIT.FAILED;
        })
        .finally(() => (db ? db.$disconnect().catch(() => {}) : undefined));
}

module.exports = { parseArgs, refusal, run, USAGE, AUDIT_ACTION, ROLLBACK_ACTION, SESSION_REVOKE_EVENTS };
