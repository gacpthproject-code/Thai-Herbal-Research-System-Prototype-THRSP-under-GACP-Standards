'use strict';

/**
 * Real-HTTP walk of the admin doors, door × actor (fix/admin-role-split round 2, review item I7).
 *
 * Talks to a backend started from the tree (WALK_BASE, default http://127.0.0.1:8097) and creates
 * its fixtures in the database that backend uses (DATABASE_URL), under a fresh suffix per run.
 * Every actor logs in through POST /api/auth/provider/login; every case is sent over HTTP; the
 * cell records the status, the error code and whether the target row (or the new account) changed.
 * Prints no token, password, email or national ID.
 *
 * Not walkable over HTTP: an admin with no organization (users.organizationId is NOT NULL, the token
 * and the tenant middleware always carry one) and the last-platform-admin refusal (the acting
 * platform admin is itself active, so the target is never the last one). Both are proved by the
 * route-level tests instead.
 *
 * usage: DATABASE_URL=<walk db> node walk.js <out.json> <out.md> <title>
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const backend = path.resolve(__dirname, '../../../apps/backend');
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [backend] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: [backend] }));

const BASE = process.env.WALK_BASE || 'http://127.0.0.1:8097';
const [outJson, outMd, title] = process.argv.slice(2);
const db = new PrismaClient();
const sfx = crypto.randomUUID().slice(0, 8);
const PASSWORD = `Walk#${crypto.randomBytes(6).toString('hex')}Aa1`;
const REASON = 'ปรับตามคำสั่งหน่วยงาน';
let seq = 0;
const fx = {};

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const nationalId = () => String(crypto.randomInt(1e12, 1e13));

async function account(role, { org = fx.orgA, status = 'ACTIVE', locked = false, login = false, groups = [], granted = false } = {}) {
    seq += 1;
    const canonicalId = `walk-${sfx}-${seq}`;
    const id13 = nationalId();
    const identity = role === 'health'
        ? { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: id13 }
        : { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: id13, providerIdHash: sha256(id13) };
    const user = await db.user.create({
        data: {
            canonicalId, email: `${canonicalId}@walk.test`,
            password: login ? await bcrypt.hash(PASSWORD, 10) : 'x',
            role, status, firstName: `เดิน${seq}`, lastName: 'ทดสอบ', organizationId: org, ...identity,
            ...(locked ? { isLocked: true, lockedUntil: new Date(Date.now() + 3600e3) } : {}),
        },
        select: { id: true },
    });
    for (const code of groups) {
        const group = await db.roleGroup.findUnique({ where: { code }, select: { id: true } });
        await db.userGroupMembership.create({ data: { userId: user.id, groupId: group.id, organizationId: org } });
    }
    if (granted) {
        await db.userPermissionGrant.create({
            data: { userId: user.id, permission: 'report.export', effect: 'GRANT', reason: REASON, organizationId: org },
        });
    }
    return { id: user.id, role, providerId: identity.providerId, canonicalId };
}

async function login(actor) {
    const res = await fetch(`${BASE}/api/auth/provider/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId: actor.providerId, password: PASSWORD }),
    });
    const body = await res.json();
    const token = body?.data?.token || body?.token;
    if (!token) { throw new Error(`login failed for a ${actor.role} actor: HTTP ${res.status} ${body?.code || ''}`); }
    return { ...actor, token };
}

async function call(actor, method, url, body) {
    const res = await fetch(`${BASE}${url}`, {
        method,
        headers: { authorization: `Bearer ${actor.token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, code: (json && (json.code || (typeof json.error === 'string' && /^[A-Z_]+$/.test(json.error) ? json.error : null))) || null, json };
}

async function snapshot(id) {
    const user = await db.user.findUnique({
        where: { id }, select: { role: true, status: true, isDeleted: true, isLocked: true, firstName: true },
    });
    const groups = (await db.userGroupMembership.findMany({
        where: { userId: id, isActive: true }, select: { group: { select: { code: true } } },
    })).map((m) => m.group.code).sort();
    const grants = (await db.userPermissionGrant.findMany({ where: { userId: id }, select: { permission: true, effect: true } }))
        .map((g) => `${g.permission}:${g.effect}`).sort();
    return JSON.stringify({ user, groups, grants });
}

function newStaff(role) {
    seq += 1;
    const id13 = nationalId();
    return {
        email: `walk-new-${seq}-${sfx}@walk.test`, providerId: id13, password: PASSWORD,
        firstName: `ใหม่${seq}`, lastName: 'ทดสอบ', ...(role === undefined ? {} : { role }),
    };
}

async function workItem() {
    fx.applicant = fx.applicant || await account('health');
    seq += 1;
    const application = await db.application.create({
        data: {
            applicationNumber: `APP-WALK-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
            organizationId: fx.orgA, status: 'DOC_FEE_PAID',
        },
        select: { id: true },
    });
    return db.workActivity.create({
        data: {
            applicationId: application.id, workType: 'SCHEDULING', candidateGroup: 'dispatcher', state: 'TODO',
            triggeredAtStage: 'DOC_FEE_PAID', organizationId: fx.orgA,
        },
        select: { id: true },
    });
}

const T = {
    dtamStaff: () => account('dispatcher'),
    dtamStaffLocked: () => account('dispatcher', { locked: true }),
    companyStaff: () => account('finance_officer_platform'),
    companyStaffInactive: () => account('finance_officer_platform', { status: 'INACTIVE' }),
    companyStaffLocked: () => account('finance_officer_platform', { locked: true }),
    companyStaffGranted: () => account('finance_officer_platform', { granted: true }),
    companyStaffInGroup: () => account('finance_officer_platform', { groups: ['finance_officer_platform'] }),
    applicant: () => account('health'),
    otherPlatformAdmin: () => account('system_admin_platform'),
};

/**
 * One row per door and target. `send` returns [method, url, body]; `create` rows check the new
 * account by email instead of a target snapshot.
 */
const ROWS = [
    { id: 'A1', door: 'POST /api/admin/users/provider', what: 'สร้างเจ้าหน้าที่กรม (dispatcher)', create: 'dispatcher', send: (b) => ['POST', '/api/admin/users/provider', b] },
    { id: 'A2', door: 'POST /api/admin/users/provider', what: 'สร้างการเงินบริษัท', create: 'finance_officer_platform', send: (b) => ['POST', '/api/admin/users/provider', b] },
    { id: 'A3', door: 'POST /api/admin/users/provider', what: 'สร้างโดยไม่ระบุบทบาท', create: null, send: (b) => ['POST', '/api/admin/users/provider', b] },
    { id: 'A4', door: 'PATCH /api/admin/users/:id/role', what: 'เจ้าหน้าที่กรม → field_inspector', target: 'dtamStaff', send: (t) => ['PATCH', `/api/admin/users/${t.id}/role`, { role: 'field_inspector' }] },
    { id: 'A5', door: 'PATCH /api/admin/users/:id/role', what: 'การเงินบริษัท → ปิดบัญชี', target: 'companyStaff', send: (t) => ['PATCH', `/api/admin/users/${t.id}/role`, { status: 'INACTIVE' }] },
    { id: 'A6', door: 'PATCH /api/admin/users/:id/disable', what: 'เจ้าหน้าที่กรม', target: 'dtamStaff', send: (t) => ['PATCH', `/api/admin/users/${t.id}/disable`, { reason: REASON }] },
    { id: 'A7', door: 'PATCH /api/admin/users/:id/disable', what: 'การเงินบริษัท', target: 'companyStaff', send: (t) => ['PATCH', `/api/admin/users/${t.id}/disable`, { reason: REASON }] },
    { id: 'A8', door: 'PATCH /api/admin/users/:id/enable', what: 'การเงินบริษัทที่ถูกปิด', target: 'companyStaffInactive', send: (t) => ['PATCH', `/api/admin/users/${t.id}/enable`, {}] },
    { id: 'A9', door: 'PATCH /api/admin/users/:id/change-role', what: 'เจ้าหน้าที่กรม → certificate_approver', target: 'dtamStaff', send: (t) => ['PATCH', `/api/admin/users/${t.id}/change-role`, { newRole: 'certificate_approver', reason: REASON }] },
    { id: 'A10', door: 'PATCH /api/admin/users/:id/change-role', what: 'การเงินบริษัท → dispatcher', target: 'companyStaff', send: (t) => ['PATCH', `/api/admin/users/${t.id}/change-role`, { newRole: 'dispatcher', reason: REASON }] },
    { id: 'B1', door: 'PUT /api/admin/user-permissions/:id/:permission', what: 'ให้สิทธิ์เจ้าหน้าที่กรม', target: 'dtamStaff', send: (t) => ['PUT', `/api/admin/user-permissions/${t.id}/report.export`, { effect: 'GRANT', reason: REASON }] },
    { id: 'B2', door: 'PUT /api/admin/user-permissions/:id/:permission', what: 'ถอนสิทธิ์การเงินบริษัท', target: 'companyStaff', send: (t) => ['PUT', `/api/admin/user-permissions/${t.id}/report.export`, { effect: 'REVOKE', reason: REASON }] },
    { id: 'B3', door: 'DELETE /api/admin/user-permissions/:id/:permission', what: 'คืนค่าสิทธิ์การเงินบริษัท', target: 'companyStaffGranted', send: (t) => ['DELETE', `/api/admin/user-permissions/${t.id}/report.export`] },
    { id: 'C1', door: 'GET /api/provider/admin/user-groups/:userId', what: 'อ่านกลุ่มของเจ้าหน้าที่กรม', target: 'dtamStaff', read: true, send: (t) => ['GET', `/api/provider/admin/user-groups/${t.id}`] },
    { id: 'C2', door: 'POST /api/provider/admin/user-groups/:userId', what: 'กลุ่ม dispatcher ให้เจ้าหน้าที่กรม', target: 'dtamStaff', send: (t) => ['POST', `/api/provider/admin/user-groups/${t.id}`, { groupCode: 'field_inspector' }] },
    { id: 'C3', door: 'POST /api/provider/admin/user-groups/:userId', what: 'กลุ่มการเงินบริษัทให้เจ้าหน้าที่กรม', target: 'dtamStaff', send: (t) => ['POST', `/api/provider/admin/user-groups/${t.id}`, { groupCode: 'finance_officer_platform' }] },
    { id: 'C4', door: 'POST /api/provider/admin/user-groups/:userId', what: 'กลุ่มกรมให้การเงินบริษัท', target: 'companyStaff', send: (t) => ['POST', `/api/provider/admin/user-groups/${t.id}`, { groupCode: 'dispatcher' }] },
    { id: 'C5', door: 'POST /api/provider/admin/user-groups/:userId', what: 'กลุ่มกรมให้ผู้ขอรับรอง (L4)', target: 'applicant', send: (t) => ['POST', `/api/provider/admin/user-groups/${t.id}`, { groupCode: 'dispatcher' }] },
    { id: 'C6', door: 'POST /api/provider/admin/user-groups/:userId', what: 'ให้กลุ่ม certificate_approver แก่ตัวเอง (L4)', target: 'self', send: (t) => ['POST', `/api/provider/admin/user-groups/${t.id}`, { groupCode: 'certificate_approver' }] },
    { id: 'C7', door: 'DELETE /api/provider/admin/user-groups/:userId/:groupCode', what: 'ถอดกลุ่มของการเงินบริษัท', target: 'companyStaffInGroup', send: (t) => ['DELETE', `/api/provider/admin/user-groups/${t.id}/finance_officer_platform`] },
    { id: 'D1', door: 'POST /api/provider/directory', what: 'สร้างเจ้าหน้าที่กรม (dispatcher)', create: 'dispatcher', send: (b) => ['POST', '/api/provider/directory', b] },
    { id: 'D2', door: 'POST /api/provider/directory', what: 'สร้างการเงินบริษัท', create: 'finance_officer_platform', send: (b) => ['POST', '/api/provider/directory', b] },
    { id: 'D3', door: 'POST /api/provider/directory', what: 'สร้างโดยไม่ระบุบทบาท (L1)', create: null, send: (b) => ['POST', '/api/provider/directory', b] },
    { id: 'D4', door: 'PATCH /api/provider/directory/:id', what: 'เจ้าหน้าที่กรม → field_inspector', target: 'dtamStaff', send: (t) => ['PATCH', `/api/provider/directory/${t.id}`, { role: 'field_inspector' }] },
    { id: 'D5', door: 'PATCH /api/provider/directory/:id', what: 'ปิดบัญชีการเงินบริษัท', target: 'companyStaff', send: (t) => ['PATCH', `/api/provider/directory/${t.id}`, { isActive: false }] },
    { id: 'D6', door: 'PUT /api/provider/directory/:id', what: 'แก้ชื่อการเงินบริษัท', target: 'companyStaff', send: (t) => ['PUT', `/api/provider/directory/${t.id}`, { firstName: 'แก้ชื่อ' }] },
    { id: 'D7', door: 'POST /api/provider/directory/:id/unlock', what: 'ปลดล็อกการเงินบริษัท', target: 'companyStaffLocked', send: (t) => ['POST', `/api/provider/directory/${t.id}/unlock`, {}] },
    { id: 'D8', door: 'DELETE /api/provider/directory/:id', what: 'ลบการเงินบริษัท', target: 'companyStaff', send: (t) => ['DELETE', `/api/provider/directory/${t.id}`] },
    { id: 'D9', door: 'PATCH /api/provider/directory/:id', what: 'ปิดบัญชีผู้ดูแลแพลตฟอร์มอีกคน (ยังเหลือผู้ทำ) (I3)', target: 'otherPlatformAdmin', send: (t) => ['PATCH', `/api/provider/directory/${t.id}`, { isActive: false }] },
    { id: 'D10', door: 'DELETE /api/provider/directory/:id', what: 'ลบเจ้าหน้าที่กรม', target: 'dtamStaff', send: (t) => ['DELETE', `/api/provider/directory/${t.id}`] },
    { id: 'E1', door: 'POST /api/platform-admin/organizations/:id/users', what: 'สร้างการเงินบริษัท', create: 'finance_officer_platform', send: (b) => ['POST', `/api/platform-admin/organizations/${fx.orgA}/users`, b] },
    { id: 'E2', door: 'POST /api/platform-admin/organizations/:id/users', what: 'สร้างผู้ดูแลกรม', create: 'system_admin_dtam', send: (b) => ['POST', `/api/platform-admin/organizations/${fx.orgA}/users`, b] },
    { id: 'F1', door: 'GET /api/provider/admin/work-config', what: 'รายการกลุ่มผู้รับงาน มีการเงินบริษัทไหม (L3)', workConfigList: true },
    { id: 'F2', door: 'POST /api/provider/admin/work-config/stage-configs', what: 'ส่งงานกรมให้การเงินบริษัท (L3)', stage: 'finance_officer_platform' },
    { id: 'F3', door: 'POST /api/provider/admin/work-config/stage-configs', what: 'ส่งงานกรมให้ dispatcher', stage: 'dispatcher' },
    { id: 'G1', door: 'GET /api/provider/work/my', what: 'เห็นงานจัดคิวของกรม (M1)', work: 'my' },
    { id: 'G2', door: 'GET /api/provider/work/queue?group=dispatcher', what: 'เปิดคิวของ dispatcher (M1)', work: 'queue' },
    { id: 'G3', door: 'GET /api/provider/work/:id', what: 'อ่านงานจัดคิวของกรม (M1)', work: 'detail' },
    { id: 'G4', door: 'POST /api/provider/work/:id/claim', what: 'รับงานจัดคิวของกรม (M1)', work: 'claim' },
];

const ACTORS = [
    { key: 'dtam', label: 'system_admin_dtam' },
    { key: 'platform', label: 'system_admin_platform' },
    { key: 'finance', label: 'finance_officer_platform (มีกลุ่ม system_admin_dtam ค้าง)' },
];

async function runCase(row, actorKey) {
    const actor = actorKey === 'dtam' && row.target === 'self' ? fx.actors.dtamSelf : fx.actors[actorKey];
    if (row.create !== undefined) {
        const body = newStaff(row.create === null ? undefined : row.create);
        const [method, url, payload] = row.send(body);
        const res = await call(actor, method, url, payload);
        const created = await db.user.count({ where: { email: body.email } });
        return { status: res.status, code: res.code, effect: created ? 'สร้างแล้ว' : 'ไม่สร้าง' };
    }
    if (row.workConfigList) {
        const res = await call(actor, 'GET', '/api/provider/admin/work-config');
        const groups = res.json?.data?.candidateGroups;
        return { status: res.status, code: res.code, effect: Array.isArray(groups) ? `มีการเงินบริษัท: ${groups.includes('finance_officer_platform') ? 'ใช่' : 'ไม่'} · ${groups.join(',')}` : '-' };
    }
    if (row.stage) {
        const workType = `WALK_${sfx}_${row.id}_${actorKey}`.toUpperCase();
        const res = await call(actor, 'POST', '/api/provider/admin/work-config/stage-configs', {
            workflowStage: 'DOC_FEE_PAID', workType, candidateGroup: row.stage,
        });
        const created = await db.stageActivityConfig.count({ where: { workType } });
        return { status: res.status, code: res.code, effect: created ? 'สร้างแล้ว' : 'ไม่สร้าง' };
    }
    if (row.work) {
        const item = await workItem();
        if (row.work === 'my') {
            const res = await call(actor, 'GET', '/api/provider/work/my');
            const seen = Array.isArray(res.json?.data) && res.json.data.some((a) => a.id === item.id);
            return { status: res.status, code: res.code, effect: seen ? 'เห็นงาน' : 'ไม่เห็นงาน' };
        }
        if (row.work === 'queue') {
            const res = await call(actor, 'GET', '/api/provider/work/queue?group=dispatcher');
            const seen = Array.isArray(res.json?.data) && res.json.data.some((a) => a.id === item.id);
            return { status: res.status, code: res.code, effect: seen ? 'เห็นงาน' : 'ไม่เห็นงาน' };
        }
        if (row.work === 'detail') {
            const res = await call(actor, 'GET', `/api/provider/work/${item.id}`);
            return { status: res.status, code: res.code, effect: res.json?.data?.id === item.id ? 'เห็นงาน' : 'ไม่เห็นงาน' };
        }
        const res = await call(actor, 'POST', `/api/provider/work/${item.id}/claim`, {});
        const after = await db.workActivity.findUnique({ where: { id: item.id }, select: { assignedUserId: true } });
        return { status: res.status, code: res.code, effect: after.assignedUserId === actor.id ? 'รับงานแล้ว' : 'ไม่ได้รับงาน' };
    }
    const target = row.target === 'self' ? actor : await T[row.target]();
    const before = await snapshot(target.id);
    const [method, url, payload] = row.send(target);
    const res = await call(actor, method, url, payload);
    const changed = (await snapshot(target.id)) !== before;
    return { status: res.status, code: res.code, effect: row.read ? (res.status === 200 ? 'อ่านได้' : 'อ่านไม่ได้') : (changed ? 'เปลี่ยน' : 'ไม่เปลี่ยน') };
}

function cell(r) {
    if (!r) { return '·'; }
    return `${r.status}${r.code ? ` ${r.code}` : ''} · ${r.effect}`;
}

async function main() {
    fx.orgA = (await db.organization.create({ data: { name: `walk-a-${sfx}`, slug: `walk-a-${sfx}`, code: `WALKA_${sfx}`.toUpperCase() } })).id;
    const peerDtamAdmin = await account('system_admin_dtam');
    const actors = {
        dtam: await account('system_admin_dtam', { login: true }),
        dtamSelf: await account('system_admin_dtam', { login: true }),
        platform: await account('system_admin_platform', { login: true }),
        finance: await account('finance_officer_platform', { login: true, groups: ['system_admin_dtam'] }),
    };
    fx.actors = {};
    for (const [key, actor] of Object.entries(actors)) { fx.actors[key] = await login(actor); }
    const results = [];
    for (const row of ROWS) {
        const line = { id: row.id, door: row.door, what: row.what, cells: {} };
        for (const { key } of ACTORS) {
            try {
                line.cells[key] = await runCase(row, key);
            } catch (error) {
                line.cells[key] = { status: 'ERR', code: null, effect: String(error.message).slice(0, 120) };
            }
        }
        results.push(line);
    }
    const head = `| แถว | ประตู | กรณี | ${ACTORS.map((a) => a.label).join(' | ')} |\n|---|---|---|${ACTORS.map(() => '---').join('|')}|`;
    const body = results.map((l) => `| ${l.id} | \`${l.door}\` | ${l.what} | ${ACTORS.map((a) => cell(l.cells[a.key])).join(' | ')} |`).join('\n');
    fs.writeFileSync(outJson, `${JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), peerDtamAdmin: Boolean(peerDtamAdmin), results }, null, 2)}\n`);
    fs.writeFileSync(outMd, `# ${title}\n\nเซลล์ = สถานะ HTTP · รหัส · ผลต่อแถวในฐานข้อมูล (· = ไม่ได้เดินกรณีนั้นด้วยผู้ทำคนนี้)\n\n${head}\n${body}\n`);
    console.log(`walk: ${results.length} rows written`);
}

main()
    .catch((error) => { console.error('walk failed:', error.message); process.exitCode = 1; })
    .finally(() => db.$disconnect());
