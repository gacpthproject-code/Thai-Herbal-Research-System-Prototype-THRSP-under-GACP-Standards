#!/usr/bin/env node
'use strict';

/**
 * ทะเบียนรายชื่อเจ้าหน้าที่กับสถานะแอปยืนยันตัวตน (คำสั่ง 86 ข้อ 2 · คำสั่ง 94 ข้อ 4) อ่านอย่างเดียว
 * ทุกบัญชีที่มีบทบาทเจ้าหน้าที่หรือผู้ดูแลระบบ จับคู่บทบาทแบบเดียวกับประตู (normalizeRole: ไม่สนตัวพิมพ์และช่องว่าง)
 * ต่อบัญชี: ลงทะเบียนแล้วหรือไม่ · ถูกตัด session ตั้งแต่การรันสคริปต์เปิดธงครั้งล่าสุดหรือไม่ · เข้าสู่ระบบล่าสุด · สถานะ
 * สรุปท้ายรายการ: ยังไม่ลงทะเบียน · วิธีเดิมที่ปลดแล้ว (ต้องลงทะเบียนใหม่) · ยังไม่ลงทะเบียนและอาจยังมี session ที่ใช้ได้ ·
 * ไม่ได้ใช้งานเกิน UNUSED_DAYS วัน (ให้ผู้ดูแลระบบฝั่งเดียวกันปิดผ่านแอป) · ผู้ดูแลระบบฝั่งกรมที่ใช้งานอยู่ต่อหน่วยงาน
 * (go-live gate ข้อ 7 · คำสั่ง 95 ข้อ 2: อย่างน้อย MIN_DTAM_ADMINS_PER_ORG ทุกหน่วยงาน) · ไม่พิมพ์เลขบัตร อีเมลเต็ม หรือค่าลับ
 */

const { Prisma } = require('@prisma/client');
const { prisma } = require('../../services/prisma-database');
const { withoutTenantScope } = require('../../services/tenant-context');
const { hasUsableSecondFactor, RETIRED_SECOND_FACTOR_METHODS } = require('../../shared/second-factor');
const { STAFF_ROLES, staffRoleLabel } = require('../../shared/role-labels-th');
const { CANONICAL_ROLES, ROLE_AFFILIATIONS, normalizeRole, roleAffiliation } = require('../../shared/canonical-rbac');
const { maskEmail } = require('../../utils/field-encryption');

const HEADER = ['บทบาท', 'หน่วยงาน', 'ชื่อ', 'อีเมล', 'ลงทะเบียนแอปยืนยันตัวตนแล้ว', 'ตัด session ตั้งแต่เปิดธงแล้ว', 'เข้าสู่ระบบล่าสุด', 'สถานะบัญชี'];
const UNUSED_DAYS = 90;
const FLAG_ON_ACTION = 'STAFF_SESSIONS_REVOKED_AT_FLAG_ON';
const MIN_DTAM_ADMINS_PER_ORG = 2;

const bangkokDate = (date) => (date
    ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'ยังไม่เคย');

const onRetiredMethod = (user) => Boolean(user.twoFactorEnabled) && RETIRED_SECOND_FACTOR_METHODS.includes(user.twoFactorMethod || 'TOTP');
const revokedSince = (user, flagOnAt) => Boolean(flagOnAt && user.sessionsRevokedAt && user.sessionsRevokedAt.getTime() >= flagOnAt.getTime());
const unused = (user, now) => !user.lastLoginAt || (now - user.lastLoginAt.getTime()) > UNUSED_DAYS * 24 * 60 * 60 * 1000;
const displayName = (user) => [user.firstName, user.lastName].filter(Boolean).join(' ') || '(ไม่มีชื่อ)';
const organizationName = (user) => user.organizationName || 'ไม่มีหน่วยงาน';
const isDtamAdmin = (user) => normalizeRole(user.role) === CANONICAL_ROLES.SYSTEM_ADMIN_DTAM;

const isDtamSide = (user) => roleAffiliation(user.role) === ROLE_AFFILIATIONS.CERTIFICATION_BODY;

/** One line per organization that holds DTAM-side staff accounts: how many active DTAM admins it holds. A company-side organization is not counted (review L1). */
function dtamAdminsPerOrganization(staff, active) {
    const names = [...new Set(staff.filter(isDtamSide).map(organizationName))].sort((a, b) => a.localeCompare(b, 'th'));
    return names.map((name) => {
        const count = active.filter((user) => isDtamAdmin(user) && organizationName(user) === name).length;
        return `หน่วยงาน ${name}: ผู้ดูแลระบบฝั่งกรมที่ใช้งานอยู่ ${count} บัญชี${count < MIN_DTAM_ADMINS_PER_ORG ? ` (ต่ำกว่าเกณฑ์ ${MIN_DTAM_ADMINS_PER_ORG} บัญชี)` : ''}`;
    });
}

function rowOf(user, flagOnAt) {
    return [
        staffRoleLabel(user.role),
        organizationName(user),
        displayName(user),
        maskEmail(user.email) || '(ไม่มีอีเมล)',
        hasUsableSecondFactor(user) ? 'ใช่' : (onRetiredMethod(user) ? 'ไม่ใช่ (วิธีเดิมที่ปลดแล้ว)' : 'ไม่ใช่'),
        flagOnAt ? (revokedSince(user, flagOnAt) ? 'ใช่' : 'ไม่ใช่') : 'ยังไม่เคยรันสคริปต์เปิดธง',
        bangkokDate(user.lastLoginAt),
        user.status,
    ];
}

async function listStaff() {
    return withoutTenantScope(() => prisma.$queryRaw`
        SELECT u."id", u."role", u."firstName", u."lastName", u."email", u."status", u."lastLoginAt",
               u."twoFactorEnabled", u."twoFactorMethod", u."sessionsRevokedAt", o."name" AS "organizationName"
        FROM "users" u
        LEFT JOIN "organizations" o ON o."id" = u."organizationId"
        WHERE u."isDeleted" = false AND lower(trim(u."role")) IN (${Prisma.join(STAFF_ROLES)})`);
}

async function latestFlagOnRun() {
    const row = await withoutTenantScope(() => prisma.auditLog.findFirst({
        where: { action: FLAG_ON_ACTION }, orderBy: { createdAt: 'desc' }, select: { metadata: true, createdAt: true },
    }));
    if (!row) { return null; }
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    return metadata.sessionsRevokedAt ? new Date(metadata.sessionsRevokedAt) : row.createdAt;
}

async function main() {
    const [staff, flagOnAt] = await Promise.all([listStaff(), latestFlagOnRun()]);
    const now = Date.now();
    const rows = staff.map((user) => rowOf(user, flagOnAt)).sort((a, b) => a[1].localeCompare(b[1], 'th') || a[0].localeCompare(b[0], 'th') || a[2].localeCompare(b[2], 'th'));
    const lines = [HEADER, ...rows].map((row) => row.join('\t'));
    const active = staff.filter((user) => user.status === 'ACTIVE');
    const enrolled = active.filter(hasUsableSecondFactor);
    const notEnrolled = active.filter((user) => !hasUsableSecondFactor(user));
    const retired = notEnrolled.filter(onRetiredMethod);
    const liveWithoutFactor = flagOnAt ? notEnrolled.filter((user) => !revokedSince(user, flagOnAt)) : notEnrolled;
    const idle = active.filter((user) => unused(user, now));
    lines.push('');
    lines.push(`สรุป: บัญชีเจ้าหน้าที่ที่ใช้งานอยู่ ${active.length} บัญชี ลงทะเบียนแอปยืนยันตัวตนแล้ว ${enrolled.length} บัญชี ยังไม่ลงทะเบียน ${notEnrolled.length} บัญชี (บัญชีที่ไม่ได้ใช้งานอีก ${staff.length - active.length} บัญชี)`);
    lines.push(`วิธีเดิมที่ปลดแล้ว (เปิดไว้แต่ไม่มีแอป ต้องลงทะเบียนใหม่ในการเข้าสู่ระบบครั้งถัดไป): ${retired.length} บัญชี`);
    lines.push(flagOnAt
        ? `ตัด session ตอนเปิดธงครั้งล่าสุดเมื่อ ${bangkokDate(flagOnAt)}: ยังไม่ลงทะเบียนและอาจยังมี session ที่ใช้ได้ ${liveWithoutFactor.length} บัญชี`
        : `ยังไม่เคยรันสคริปต์ตัด session ตอนเปิดธง: ยังไม่ลงทะเบียนและอาจยังมี session ที่ใช้ได้ ${liveWithoutFactor.length} บัญชี`);
    lines.push(`ผู้ดูแลระบบฝั่งกรมที่ใช้งานอยู่ต่อหน่วยงาน (go-live gate ข้อ 7 ต้องมีอย่างน้อย ${MIN_DTAM_ADMINS_PER_ORG} บัญชีทุกหน่วยงาน):`);
    lines.push(...dtamAdminsPerOrganization(staff, active));
    lines.push(`ไม่ได้ใช้งานเกิน ${UNUSED_DAYS} วันหรือไม่เคยเข้าสู่ระบบ (ให้ผู้ดูแลระบบฝั่งเดียวกันพิจารณาปิดผ่านแอป): ${idle.length} บัญชี${idle.length ? ` ได้แก่ ${idle.map((user) => `${staffRoleLabel(user.role)} ${displayName(user)} (${maskEmail(user.email) || '-'})`).join(', ')}` : ''}`);
    process.stdout.write(`${lines.join('\n')}\n`);
}

main()
    .catch((error) => {
        process.stderr.write(`ทำรายชื่อไม่สำเร็จ: ${error.message}\n`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect().catch(() => {}));
