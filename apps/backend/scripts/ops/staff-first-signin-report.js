#!/usr/bin/env node
'use strict';

/**
 * คำสั่ง operator 94 ข้อ 5 (2026-10-20): รายงานอ่านอย่างเดียวจากบันทึกการตรวจสอบ ว่าการเข้าระบบครั้งแรกที่ได้ session
 * ของเจ้าหน้าที่แต่ละคน เกิดหลังการลงทะเบียน 2FA หรือไม่ · พิมพ์ชื่อ บทบาท หน่วยงาน อีเมลปิดบางส่วน ไม่มีเลขบัตรหรือค่าลับ
 */

const { Prisma } = require('@prisma/client');
const { prisma } = require('../../services/prisma-database');
const { withoutTenantScope } = require('../../services/tenant-context');
const { STAFF_ROLES, staffRoleLabel } = require('../../shared/role-labels-th');
const { maskEmail } = require('../../utils/field-encryption');

const ENROLMENT_ACTIONS = ['MFA_ENABLED'];
const SESSION_ACTIONS = ['MFA_VERIFY_SUCCESS', 'PROVIDER_LOGIN_SESSION_ISSUED'];
const HEADER = ['บทบาท', 'หน่วยงาน', 'ชื่อ', 'อีเมล', 'ผล', 'ลงทะเบียน 2FA ครั้งแรก', 'ได้ session ครั้งแรก'];

const bangkok = (date) => (date
    ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '-');

const UNKNOWN = 'ไม่ทราบ';

const everSignedIn = (user) => Boolean(user.lastLoginAt);
const existedBeforeCountStarted = (user, countingFrom) => Boolean(countingFrom) && user.createdAt.getTime() < countingFrom.getTime();

function verdict(firstEnrolment, firstSession, user, countingFrom) {
    if (existedBeforeCountStarted(user, countingFrom) && everSignedIn(user)) { return UNKNOWN; }
    if (!firstSession) { return 'ยังไม่เคยเข้าระบบ'; }
    if (firstEnrolment && firstSession.getTime() >= firstEnrolment.getTime()) { return 'ผ่าน'; }
    return 'ไม่ผ่าน';
}

async function firstEventAt(actions, userId) {
    const row = await withoutTenantScope(() => prisma.auditLog.findFirst({
        where: { action: { in: actions }, OR: [{ actorId: userId }, { resourceId: userId }] },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
    }));
    return row ? row.createdAt : null;
}

async function countingFromDate() {
    const row = await withoutTenantScope(() => prisma.auditLog.findFirst({
        where: { action: 'PROVIDER_LOGIN_SESSION_ISSUED' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true },
    }));
    return row ? row.createdAt : null;
}

async function listStaff() {
    return withoutTenantScope(() => prisma.$queryRaw`
        SELECT u."id", u."role", u."firstName", u."lastName", u."email", u."createdAt", u."lastLoginAt", o."name" AS "organizationName"
        FROM "users" u
        LEFT JOIN "organizations" o ON o."id" = u."organizationId"
        WHERE u."isDeleted" = false AND lower(trim(u."role")) IN (${Prisma.join(STAFF_ROLES)})`);
}

async function main() {
    const [staff, countingFrom] = await Promise.all([listStaff(), countingFromDate()]);
    const rows = [];
    const totals = { 'ผ่าน': 0, 'ไม่ผ่าน': 0, 'ยังไม่เคยเข้าระบบ': 0, [UNKNOWN]: 0 };
    for (const user of staff) {
        const [firstEnrolment, firstSession] = await Promise.all([firstEventAt(ENROLMENT_ACTIONS, user.id), firstEventAt(SESSION_ACTIONS, user.id)]);
        const result = verdict(firstEnrolment, firstSession, user, countingFrom);
        totals[result] += 1;
        rows.push([
            staffRoleLabel(user.role),
            user.organizationName || 'ไม่มีหน่วยงาน',
            [user.firstName, user.lastName].filter(Boolean).join(' ') || '(ไม่มีชื่อ)',
            maskEmail(user.email) || '(ไม่มีอีเมล)',
            result,
            bangkok(firstEnrolment),
            bangkok(firstSession),
        ]);
    }
    rows.sort((a, b) => a[1].localeCompare(b[1], 'th') || a[0].localeCompare(b[0], 'th') || a[2].localeCompare(b[2], 'th'));
    const lines = [HEADER, ...rows].map((row) => row.join('\t'));
    lines.push('');
    lines.push(`สรุป: ผ่าน ${totals['ผ่าน']} บัญชี ไม่ผ่าน ${totals['ไม่ผ่าน']} บัญชี ยังไม่เคยเข้าระบบ ${totals['ยังไม่เคยเข้าระบบ']} บัญชี ไม่ทราบ ${totals[UNKNOWN]} บัญชี (ทั้งหมด ${staff.length} บัญชี)`);
    lines.push(countingFrom
        ? `เริ่มนับตั้งแต่ ${bangkok(countingFrom)} (เหตุการณ์ PROVIDER_LOGIN_SESSION_ISSUED แรกในบันทึก) · บัญชีที่มีอยู่ก่อนวันนั้นและเคยเข้าระบบเป็น "${UNKNOWN}" ไม่ใช่ "ผ่าน" เพราะ session ก่อนวันนั้นไม่มีบันทึก`
        : 'ยังไม่มีเหตุการณ์ PROVIDER_LOGIN_SESSION_ISSUED ในบันทึก จึงไม่มีวันเริ่มนับ: ใช้ผล "ผ่าน" ได้เฉพาะที่เปิดธงมาตั้งแต่ session แรกของเจ้าหน้าที่ทุกคน (production วันขึ้นระบบ)');
    process.stdout.write(`${lines.join('\n')}\n`);
}

main()
    .catch((error) => {
        process.stderr.write(`ทำรายงานไม่สำเร็จ: ${error.message}\n`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect().catch(() => {}));
