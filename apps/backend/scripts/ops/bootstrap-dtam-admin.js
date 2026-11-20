#!/usr/bin/env node
'use strict';

/**
 * Give an organization that has NO active DTAM admin its DTAM admin, outside the API.
 *
 * Order 13 keeps every admin door on its own side: the platform admin cannot create, enable
 * or promote a DTAM admin, and an organization with no active DTAM admin has nobody left who
 * can (review I1 of fix/admin-role-split). Until the operator rules otherwise, this audited
 * ops script is the way back, and the API has no exception. Runbook (Thai):
 * docs/operations/runbooks/admin-bootstrap.md.
 *
 * It promotes or re-enables an EXISTING DTAM-side staff account of that organization; it
 * never creates an account and never moves one across sides.
 *
 * Usage:
 *   node scripts/ops/bootstrap-dtam-admin.js --organization <id or slug>   # list the candidates
 *   node scripts/ops/bootstrap-dtam-admin.js --organization <id or slug> --user <user uuid> \
 *        --reason "<why, as on the request letter>"            # dry run (default)
 *   ... --apply                                                # write
 *
 * Safety:
 *   - Dry run by default; --apply writes, and needs --reason.
 *   - Refuses when the organization already has an active DTAM admin, so a second run
 *     changes nothing.
 *   - Refuses an account of another organization, a company-side account, an applicant, and
 *     an account whose role is not a current role word.
 *   - In one transaction: role system_admin_dtam, status ACTIVE, an active system_admin_dtam
 *     group membership (memberships come before the role in the work queue, and the new admin
 *     cannot give itself a group), the session epoch (open sessions end), and one audit row
 *     DTAM_ADMIN_BOOTSTRAPPED in the organization's audit chain.
 *   - Prints names and yes/no answers only: no email, no national ID, no credential.
 */

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

const { prisma } = require('../../services/prisma-database');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../middleware/audit-logger');
const {
    CANONICAL_ROLES, ROLE_AFFILIATIONS, normalizeRole, roleAffiliation, isStaffAccount,
} = require('../../shared/canonical-rbac');
const { sessionEpochStamp } = require('../../utils/session-epoch');

const ADMIN = CANONICAL_ROLES.SYSTEM_ADMIN_DTAM;
const MIN_REASON = 10;
const TAG = '[bootstrap-dtam-admin]';
const yesNo = (value) => (value ? 'ใช่' : 'ไม่');

function argValue(argv, flag) {
    const at = argv.indexOf(flag);
    return at >= 0 ? String(argv[at + 1] || '').trim() : '';
}

function refuse(message) {
    console.error(`${TAG} ปฏิเสธ: ${message}`);
    process.exitCode = 1;
}

/** Active DTAM admins of the organization, counted the way the last-admin guard counts them. */
function activeDtamAdmins(client, organizationId) {
    return client.user.count({ where: { organizationId, role: ADMIN, status: 'ACTIVE', isDeleted: false } });
}

/** DTAM-side staff of the organization, by name: the accounts --user may name. Writes nothing. */
async function listCandidates(organizationId) {
    const staff = (await prisma.user.findMany({
        where: { organizationId, isDeleted: false, providerId: { not: null } },
        select: { id: true, role: true, status: true, providerId: true, firstName: true, lastName: true },
        orderBy: { createdAt: 'asc' },
    })).filter((user) => isStaffAccount(user)
        && roleAffiliation(normalizeRole(user.role)) === ROLE_AFFILIATIONS.CERTIFICATION_BODY);
    console.log(`${TAG} เจ้าหน้าที่ฝั่งกรมขององค์กรนี้ ${staff.length} คน (ใช้ user id ในวงเล็บกับ --user):`);
    for (const user of staff) {
        console.log(`${TAG}   ${user.firstName} ${user.lastName} · ${normalizeRole(user.role)} · ใช้งานอยู่: ${yesNo(user.status === 'ACTIVE')} (${user.id})`);
    }
    console.log(`${TAG} รายชื่อเท่านั้น ไม่มีการเขียน`);
}

async function main(argv) {
    const apply = argv.includes('--apply');
    const orgKey = argValue(argv, '--organization');
    const userId = argValue(argv, '--user');
    const reason = argValue(argv, '--reason');
    if (!orgKey) {
        refuse('ต้องระบุ --organization <id หรือ slug>');
        return;
    }
    if (apply && reason.length < MIN_REASON) {
        refuse(`การเขียนจริงต้องมี --reason อย่างน้อย ${MIN_REASON} ตัวอักษร (เหตุผลตามหนังสือที่ขอ)`);
        return;
    }

    const org = await prisma.organization.findFirst({
        where: { OR: [{ id: orgKey }, { slug: orgKey }] },
        select: { id: true, name: true, slug: true, isDeleted: true },
    });
    if (!org || org.isDeleted) {
        refuse('ไม่พบองค์กรนี้');
        return;
    }
    console.log(`${TAG} โหมด: ${apply ? 'เขียนจริง' : 'ทดลอง ยังไม่เขียน (ใส่ --apply เพื่อเขียนจริง)'}`);
    console.log(`${TAG} องค์กร: ${org.name} (${org.slug})`);

    const admins = await activeDtamAdmins(prisma, org.id);
    console.log(`${TAG} มีผู้ดูแลกรมที่ใช้งานอยู่แล้ว: ${yesNo(admins > 0)}`);
    if (admins > 0) {
        refuse('องค์กรนี้มีผู้ดูแลกรมที่ใช้งานอยู่แล้ว ให้ผู้ดูแลคนนั้นตั้งผ่านหน้าจอ');
        return;
    }
    if (!userId) {
        await listCandidates(org.id);
        return;
    }

    const user = await prisma.user.findFirst({
        where: { id: userId, isDeleted: false },
        select: {
            id: true, role: true, status: true, isLocked: true, providerId: true,
            organizationId: true, firstName: true, lastName: true,
        },
    });
    if (!user || user.organizationId !== org.id) {
        refuse('ไม่พบบัญชีนี้ในองค์กรนี้');
        return;
    }
    const currentRole = normalizeRole(user.role);
    const dtamStaff = isStaffAccount(user) && roleAffiliation(currentRole) === ROLE_AFFILIATIONS.CERTIFICATION_BODY;
    console.log(`${TAG} บัญชี: ${user.firstName} ${user.lastName}`);
    console.log(`${TAG}   บทบาทตอนนี้: ${currentRole || 'อ่านไม่ออก'} · เป็นเจ้าหน้าที่ฝั่งกรม: ${yesNo(dtamStaff)}`);
    console.log(`${TAG}   ใช้งานอยู่: ${yesNo(user.status === 'ACTIVE')} · ถูกล็อก: ${yesNo(user.isLocked)}`);
    if (!dtamStaff) {
        refuse('ตั้งได้เฉพาะบัญชีเจ้าหน้าที่ฝั่งกรมขององค์กรนี้ บัญชีฝั่งบริษัทและผู้ขอรับรองข้ามฝั่งไม่ได้ (คำสั่ง 13, 34(2))');
        return;
    }

    const adminGroup = await prisma.roleGroup.findUnique({ where: { code: ADMIN }, select: { id: true } });
    const membership = adminGroup && await prisma.userGroupMembership.findUnique({
        where: { userId_groupId: { userId: user.id, groupId: adminGroup.id } },
        select: { isActive: true },
    });
    const plan = {
        promote: currentRole !== ADMIN,
        enable: user.status !== 'ACTIVE',
        addGroup: Boolean(adminGroup) && !membership?.isActive,
    };
    console.log(`${TAG} จะตั้งเป็น ${ADMIN}: ${yesNo(plan.promote)} · จะเปิดใช้งาน: ${yesNo(plan.enable)} · จะเพิ่มกลุ่ม ${ADMIN}: ${yesNo(plan.addGroup)}`);
    if (!apply) {
        console.log(`${TAG} ทดลองเสร็จ ไม่มีการเขียน`);
        return;
    }

    await prisma.$transaction(async (tx) => {
        if (await activeDtamAdmins(tx, org.id) > 0) {
            throw Object.assign(new Error('the organization gained an active DTAM admin meanwhile'), { code: 'ALREADY_HAS_ADMIN' });
        }
        await tx.user.update({
            where: { id: user.id },
            data: { role: ADMIN, status: 'ACTIVE', sessionsRevokedAt: sessionEpochStamp() },
        });
        if (plan.addGroup) {
            await tx.userGroupMembership.upsert({
                where: { userId_groupId: { userId: user.id, groupId: adminGroup.id } },
                update: { isActive: true, assignedBy: null },
                create: { userId: user.id, groupId: adminGroup.id, organizationId: org.id, isActive: true },
            });
        }
        await auditLogger.logWithin({
            category: AuditCategory.ADMIN,
            action: 'DTAM_ADMIN_BOOTSTRAPPED',
            severity: AuditSeverity.WARNING,
            actorId: 'SYSTEM',
            actorRole: CANONICAL_ROLES.SYSTEM,
            actorType: 'SYSTEM',
            resourceType: ResourceType.USER,
            resourceId: user.id,
            organizationId: org.id,
            metadata: {
                source: 'scripts/ops/bootstrap-dtam-admin.js',
                reason,
                before: { role: currentRole, status: user.status },
                after: { role: ADMIN, status: 'ACTIVE' },
                adminGroupAdded: plan.addGroup,
            },
        }, tx);
    });
    console.log(`${TAG} เสร็จ: ${user.firstName} ${user.lastName} เป็นผู้ดูแลกรมขององค์กรนี้แล้ว ให้เข้าสู่ระบบใหม่`);
}

main(process.argv.slice(2))
    .catch((error) => {
        if (error.code === 'ALREADY_HAS_ADMIN') {
            refuse('ระหว่างทำงาน องค์กรนี้มีผู้ดูแลกรมที่ใช้งานอยู่แล้ว ไม่มีการเขียน');
            return;
        }
        console.error(`${TAG} ล้มเหลว: ${error.code || error.name}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
