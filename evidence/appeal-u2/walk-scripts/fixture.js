'use strict';
// Run from apps/backend of the worktree with the scratch env sourced and the script on stdin (its requires are relative).
// Credentials go to walk.env (0600) and ids to fixture.json; nothing secret is printed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { identityLookupColumns, AUTH_TYPE_HEALTH, AUTH_TYPE_PROVIDER } = require('./services/auth/identity-lookup-columns');
const { resolveCanonicalIdForWrite } = require('./shared/fk-token');
const { settleMilestones } = require('./test-support/settled-milestones');

const DIR = '/home/ubuntu/work/state/reviews/appeal-u2-takeover/walk';
const pw = () => `Walk-${crypto.randomBytes(9).toString('base64url')}1a`;

function thaiId13(first) {
    const d = [Number(first)];
    while (d.length < 12) { d.push(crypto.randomInt(10)); }
    const sum = d.reduce((acc, n, i) => acc + n * (13 - i), 0);
    d.push((11 - (sum % 11)) % 10);
    return d.join('');
}

(async () => {
    const raw = new PrismaClient();
    const org = await raw.organization.findFirst({ where: { code: 'DEFAULT' } })
        || await raw.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) { throw new Error('no organization on the scratch database'); }
    const sfx = crypto.randomUUID().slice(0, 6);
    const env = [`WALK_ORG_ID=${org.id}`];

    async function staff(key, role, firstName) {
        const id = crypto.randomUUID();
        const pid = thaiId13('8');
        const secret = pw();
        await raw.user.create({
            data: {
                id, canonicalId: resolveCanonicalIdForWrite({ actualIdentifier: pid, isProvider: true, userId: id }),
                email: `walk-u2-${key}-${sfx}@example.test`, password: await bcrypt.hash(secret, 12),
                firstName, lastName: 'เดินประตู', role, organizationId: org.id,
                authType: 'PROVIDER_ID', providerId: pid, ...identityLookupColumns(pid, AUTH_TYPE_PROVIDER),
                accountType: 'PROVIDER', status: 'ACTIVE', ministryVerified: true, ministryVerifiedAt: new Date(),
            },
        });
        env.push(`WALK_${key}_ID=${id}`, `WALK_${key}_PID=${pid}`, `WALK_${key}_PW=${secret}`);
        return id;
    }
    async function member(key, firstName) {
        const id = crypto.randomUUID();
        const hid = thaiId13('9');
        const secret = pw();
        await raw.user.create({
            data: {
                id, canonicalId: resolveCanonicalIdForWrite({ actualIdentifier: hid, userId: id }),
                email: `walk-u2-${key}-${sfx}@example.test`, password: await bcrypt.hash(secret, 12),
                firstName, lastName: 'เดินประตู', role: 'health', organizationId: org.id,
                authType: 'HEALTH_ID', healthId: hid, ...identityLookupColumns(hid, AUTH_TYPE_HEALTH),
                accountType: 'HEALTH', status: 'ACTIVE',
            },
        });
        env.push(`WALK_${key}_ID=${id}`, `WALK_${key}_HID=${hid}`, `WALK_${key}_PW=${secret}`);
        return { id, canonicalId: resolveCanonicalIdForWrite({ actualIdentifier: hid, userId: id }) };
    }

    const inspector = await staff('INSPECTOR', 'field_inspector', 'ผู้ตรวจพื้นที่');
    const approver = await staff('APPROVER', 'certificate_approver', 'ผู้อนุมัติ');
    await staff('ADMIN', 'system_admin_dtam', 'ผู้ดูแลกรม');
    const reviewer = await staff('REVIEWER', 'document_reviewer', 'ผู้ตรวจเอกสาร');
    const applicant = await member('APPLICANT', 'ผู้ยื่น');
    const colleague = await member('COLLEAGUE', 'ผู้จัดการ');
    const viewer = await member('VIEWER', 'ผู้ดู');

    const entity = await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท เดินทดสอบหน่วยสอง ${sfx} จำกัด`, organizationId: org.id } });
    for (const [who, role, permissions] of [[applicant, 'OWNER', []], [colleague, 'MANAGER', ['SUBMIT_APPLICATION']], [viewer, 'VIEWER', []]]) {
        await raw.entityMembership.create({ data: { userId: who.id, entityId: entity.id, role, permissions, status: 'ACTIVE', organizationId: org.id } });
    }
    const farm = {
        plantId: 'cannabis', locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
        farmData: { farmName: 'ฟาร์มเดินทดสอบหน่วยสอง', address: '9 หมู่ 1', province: 'นครปฐม', district: 'เมืองนครปฐม', subdistrict: 'พระปฐมเจดีย์', postalCode: '73000', totalAreaSize: '3', totalAreaUnit: 'Rai', gpsLat: '13.82', gpsLng: '100.06' },
        plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
    };
    let n = 0;
    async function seat(status, extraForm = {}) {
        n += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-WALK-U2-${sfx}-${n}`, healthId: applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: org.id, entityId: entity.id, submitterId: applicant.id, status,
                auditorId: inspector, reviewerId: reviewer, certificationPurposes: ['RESEARCH'], scheduledDate: new Date(),
                formData: { workflowState: status, ...farm, ...extraForm },
            },
        });
        await settleMilestones(raw, row);
        return { id: row.id, number: row.applicationNumber };
    }
    const refusal = await seat('AUDIT_CONFIRMED');
    const correction = await seat('AUDIT_CONFIRMED');
    const checks = await seat('AUDIT_CONFIRMED');
    const passed = await seat('AUDIT_PASSED', {
        auditResult: 'PASS',
        auditDecision: { decision: 'PASS', notes: 'ผ่านทุกข้อสำคัญ', findings: [], decidedAt: new Date().toISOString(), decidedBy: inspector },
    });
    fs.writeFileSync(path.join(DIR, 'walk.env'), `${env.join('\n')}\n`, { mode: 0o600 });
    fs.writeFileSync(path.join(DIR, 'fixture.json'), JSON.stringify({ refusal, correction, checks, passed, approverId: approver, entity: entity.displayName }, null, 2));
    console.log('fixture written: walk.env (0600) and fixture.json', [refusal, correction, checks, passed].map((a) => a.number).join(' '));
    await raw.$disconnect();
})().catch((e) => { console.error('fixture failed:', e.message); process.exit(1); });
