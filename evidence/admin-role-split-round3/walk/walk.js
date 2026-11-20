'use strict';

/**
 * Round-2 security re-review of fix/admin-role-split (c1ea2dd63): real-HTTP measurements against a
 * backend booted from the reviewed tree on the reviewer's own scratch database.
 *
 * Sections:
 *   S1 Jev #3  demotion of a DTAM admin that holds the system_admin_dtam group
 *   S2 Jev #2  a document_reviewer group on a field inspector (order 27)
 *   S3 M1      a cross-side leftover group grants nothing, through real login
 *   S4 L4      group doors: applicant target, self-grant
 *   S5 Jev #4  two admins removing each other at the same moment (last-admin guard race)
 *   S6 I1      the two ops scripts, run as the operator runs them
 *   S7 M1      the counting script from the tree
 *
 * usage: node walk.js [--keep]      (--keep leaves the fixtures and writes fixtures.json for --cleanup)
 *        node walk.js --cleanup
 * Prints no token, password, email or national ID.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND = '/home/ubuntu/work/wt-rolesplit/apps/backend';
const D = process.env.WALK_DIR || '/home/ubuntu/work/state/rolesplit-r3/walk';
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [BACKEND] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: [BACKEND] }));
const userGroups = require(path.join(BACKEND, 'shared/user-groups'));

const BASE = process.env.WALK_BASE || 'http://127.0.0.1:8099';
if (!process.env.DATABASE_URL) { throw new Error('set DATABASE_URL explicitly'); }
const db = new PrismaClient();
const sfx = crypto.randomUUID().slice(0, 8);
const PASSWORD = `Rev#${crypto.randomBytes(6).toString('hex')}Aa1`;
const REASON = 'ตรวจสอบตามรายงานรีวิวรอบสอง';
const FIX = path.join(D, 'fixtures.json');
const fx = { users: [], apps: [], orgs: [] };
let seq = 0;
const rows = [];

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const nationalId = () => String(crypto.randomInt(1e12, 1e13));
const record = (section, step, expected, got, note = '') => {
    rows.push({ section, step, expected, got: String(got), ok: expected === '-' ? '' : (String(got) === String(expected) ? 'yes' : 'NO'), note });
};

async function organization() {
    seq += 1;
    const org = await db.organization.create({
        data: { name: `secrev ${seq} ${sfx}`, slug: `secrev-${seq}-${sfx}`, code: `SECREV${seq}_${sfx}`.toUpperCase() },
        select: { id: true, slug: true },
    });
    fx.orgs.push(org.id);
    return org;
}

async function account(role, { org, status = 'ACTIVE', groups = [], login = false } = {}) {
    seq += 1;
    const canonicalId = `secrev-${sfx}-${seq}`;
    const id13 = nationalId();
    const identity = role === 'health'
        ? { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: id13 }
        : { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: id13, providerIdHash: sha256(id13) };
    const user = await db.user.create({
        data: {
            canonicalId, email: `${canonicalId}@secrev.test`,
            password: login ? await bcrypt.hash(PASSWORD, 10) : 'x',
            role, status, firstName: `รีวิว${seq}`, lastName: 'ทดสอบ', organizationId: org, ...identity,
        },
        select: { id: true },
    });
    fx.users.push(user.id);
    for (const code of groups) {
        const group = await db.roleGroup.findUnique({ where: { code }, select: { id: true } });
        await db.userGroupMembership.create({ data: { userId: user.id, groupId: group.id, organizationId: org } });
    }
    const actor = { id: user.id, role, providerId: identity.providerId, canonicalId, org, name: `รีวิว${seq}`, email: `${canonicalId}@secrev.test`, id13 };
    return login ? signIn(actor) : actor;
}

async function signIn(actor) {
    const res = await fetch(`${BASE}/api/auth/provider/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId: actor.providerId, password: PASSWORD }),
    });
    const body = await res.json().catch(() => null);
    const token = body?.data?.token || body?.token;
    if (!token) { throw new Error(`login failed for a ${actor.role} actor: HTTP ${res.status} ${body?.code || body?.error || ''}`); }
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
    const code = json && (json.code || (typeof json.error === 'string' && /^[A-Z_]+$/.test(json.error) ? json.error : null));
    return { status: res.status, code: code || null, json };
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const cell = (r) => `${r.status}${r.code ? ' ' + r.code : ''}`;

async function workItem(org, applicant, { candidateGroup = 'dispatcher', assignedUserId = null } = {}) {
    seq += 1;
    const application = await db.application.create({
        data: {
            applicationNumber: `APP-SECREV-${seq}-${sfx}`, healthId: applicant.canonicalId, areaType: 'OUTDOOR',
            organizationId: org, status: 'DOC_FEE_PAID',
        },
        select: { id: true },
    });
    fx.apps.push(application.id);
    return db.workActivity.create({
        data: {
            applicationId: application.id, workType: 'SCHEDULING', candidateGroup, organizationId: org,
            triggeredAtStage: 'DOC_FEE_PAID',
            ...(assignedUserId ? { state: 'CLAIMED', assignedUserId, claimedAt: new Date() } : { state: 'TODO' }),
        },
        select: { id: true },
    });
}
const stateOf = (id) => db.workActivity.findUnique({ where: { id }, select: { state: true, assignedUserId: true, completedBy: true } });
const userRow = (id) => db.user.findUnique({ where: { id }, select: { role: true, status: true, isDeleted: true } });
const groupsOf = async (id) => (await db.userGroupMembership.findMany({
    where: { userId: id, isActive: true }, select: { group: { select: { code: true } } },
})).map((m) => m.group.code).sort().join('+') || '(none)';

function runScript(script, args) {
    const env = { ...process.env, LOG_LEVEL: 'warn' };
    const res = spawnSync(process.execPath, [path.join(BACKEND, script), ...args], { cwd: BACKEND, env, encoding: 'utf8', timeout: 90000 });
    return { status: res.status, output: `${res.stdout || ''}${res.stderr || ''}` };
}
const leaks = (output, who) => (output.includes(who.email) ? 'email printed' : output.includes(who.id13) ? 'national id printed' : 'none');

async function s1Demotion() {
    const S = 'S1 Jev#3 demotion';
    const org = (await organization()).id;
    const applicant = await account('health', { org });
    const admin = await account('system_admin_dtam', { org, groups: ['system_admin_dtam'], login: true });
    const target = await account('system_admin_dtam', { org, groups: ['system_admin_dtam'], login: true });
    const dispatcher = await account('dispatcher', { org, groups: ['dispatcher'], login: true });
    const control = await account('document_reviewer', { org, groups: ['document_reviewer'], login: true });
    const claimed = await workItem(org, applicant, { assignedUserId: dispatcher.id });
    const open = await workItem(org, applicant);
    const inspector = await workItem(org, applicant, { candidateGroup: 'field_inspector' });

    record(S, 'before: target (admin) GET /work/queue?group=dispatcher', 200, (await call(target, 'GET', '/api/provider/work/queue?group=dispatcher')).status);
    record(S, 'before: target (admin) GET /admin/users', 200, (await call(target, 'GET', '/api/admin/users')).status);

    const demote = await call(admin, 'PATCH', `/api/admin/users/${target.id}/change-role`, { newRole: 'document_reviewer', reason: REASON });
    record(S, 'admin demotes target to document_reviewer (PATCH /admin/users/:id/change-role)', 200, demote.status, `row: ${(await userRow(target.id)).role}, groups: ${await groupsOf(target.id)}`);
    record(S, 'target old token after demotion: GET /work/my', 401, (await call(target, 'GET', '/api/provider/work/my')).status, 'session epoch');
    await pause(1500);
    const demoted = await signIn(target);
    record(S, 'demoted re-signs in (1.5 s after the revocation stamp)', 'yes', 'yes');
    record(S, 'demoted GET /admin/users (role gate)', 403, (await call(demoted, 'GET', '/api/admin/users')).status);
    record(S, 'demoted GET /work/queue?group=dispatcher', '403', cell(await call(demoted, 'GET', '/api/provider/work/queue?group=dispatcher')), 'a document_reviewer without the admin group gets 403');
    record(S, 'demoted GET /work/queue?group=field_inspector', '403', cell(await call(demoted, 'GET', '/api/provider/work/queue?group=field_inspector')));
    const my = await call(demoted, 'GET', '/api/provider/work/my');
    record(S, 'demoted GET /work/my lists the open dispatcher item', false, my.status === 200 && (my.json?.data || []).some((a) => a.id === open.id));
    record(S, 'demoted GET /work/:id of the dispatcher\'s claimed item', '404', cell(await call(demoted, 'GET', `/api/provider/work/${claimed.id}`)));
    const done = await call(demoted, 'POST', `/api/provider/work/${claimed.id}/done`, {});
    record(S, 'demoted POST /work/:id/done on the dispatcher\'s claimed item', '400', cell(done), `row after: ${JSON.stringify(await stateOf(claimed.id)).replace(dispatcher.id, 'dispatcher').replace(demoted.id, 'demoted')}`);
    const claim = await call(demoted, 'POST', `/api/provider/work/${inspector.id}/claim`, {});
    record(S, 'demoted POST /work/:id/claim on field_inspector work', '400', cell(claim), `row after: ${JSON.stringify(await stateOf(inspector.id)).replace(demoted.id, 'demoted')}`);

    record(S, 'control document_reviewer GET /work/queue?group=dispatcher', 403, (await call(control, 'GET', '/api/provider/work/queue?group=dispatcher')).status);
    record(S, 'control document_reviewer POST /work/:id/claim on field_inspector work', 400, (await call(control, 'POST', `/api/provider/work/${inspector.id}/claim`, {})).status);
    const open2 = await workItem(org, applicant);
    record(S, 'control document_reviewer POST /work/:id/done on open dispatcher work', 400, (await call(control, 'POST', `/api/provider/work/${open2.id}/done`, {})).status);

    const target2 = await account('system_admin_dtam', { org, login: true });
    record(S, 'variant: admin WITHOUT a membership row is demoted', 200, (await call(admin, 'PATCH', `/api/admin/users/${target2.id}/change-role`, { newRole: 'document_reviewer', reason: REASON })).status, `groups: ${await groupsOf(target2.id)}`);
    await pause(1500);
    const demoted2 = await signIn(target2);
    record(S, 'variant: demoted (no membership) GET /work/queue?group=dispatcher', 403, (await call(demoted2, 'GET', '/api/provider/work/queue?group=dispatcher')).status, 'role fallback only');

    // variant B: the demoted role is a pool role (dispatcher), whose work scope is the whole organization
    const target3 = await account('system_admin_dtam', { org, groups: ['system_admin_dtam'], login: true });
    const claimed3 = await workItem(org, applicant, { assignedUserId: dispatcher.id });
    const inspector3 = await workItem(org, applicant, { candidateGroup: 'field_inspector' });
    record(S, 'variant B: admin WITH the admin group is demoted to dispatcher', 200, (await call(admin, 'PATCH', `/api/admin/users/${target3.id}/change-role`, { newRole: 'dispatcher', reason: REASON })).status, `row: ${(await userRow(target3.id)).role}, groups: ${await groupsOf(target3.id)}`);
    await pause(1500);
    const demoted3 = await signIn(target3);
    record(S, 'variant B: demoted GET /admin/users (role gate)', 403, (await call(demoted3, 'GET', '/api/admin/users')).status);
    const q3 = await call(demoted3, 'GET', '/api/provider/work/queue?group=field_inspector');
    record(S, 'variant B: demoted GET /work/queue?group=field_inspector', '403', cell(q3), `items listed: ${(q3.json?.data || []).length}`);
    record(S, 'variant B: demoted GET /work/:id of field_inspector work', '403', cell(await call(demoted3, 'GET', `/api/provider/work/${inspector3.id}`)));
    const done3 = await call(demoted3, 'POST', `/api/provider/work/${claimed3.id}/done`, {});
    record(S, "variant B: demoted POST /work/:id/done on the dispatcher's claimed item", '400', cell(done3), `row after: ${JSON.stringify(await stateOf(claimed3.id)).replace(dispatcher.id, 'dispatcher').replace(demoted3.id, 'demoted')}`);
    const claim3 = await call(demoted3, 'POST', `/api/provider/work/${inspector3.id}/claim`, {});
    record(S, 'variant B: demoted POST /work/:id/claim on field_inspector work', '400', cell(claim3), `row after: ${JSON.stringify(await stateOf(inspector3.id)).replace(demoted3.id, 'demoted')}`);
    const claimed4 = await workItem(org, applicant, { assignedUserId: control.id });
    const inspector4 = await workItem(org, applicant, { candidateGroup: 'field_inspector' });
    record(S, 'control plain dispatcher GET /work/queue?group=field_inspector', 403, (await call(dispatcher, 'GET', '/api/provider/work/queue?group=field_inspector')).status);
    record(S, "control plain dispatcher POST /work/:id/done on another's claimed item", 400, (await call(dispatcher, 'POST', `/api/provider/work/${claimed4.id}/done`, {})).status, `row after: ${JSON.stringify(await stateOf(claimed4.id)).replace(control.id, 'reviewer')}`);
    record(S, 'control plain dispatcher POST /work/:id/claim on field_inspector work', 400, (await call(dispatcher, 'POST', `/api/provider/work/${inspector4.id}/claim`, {})).status);
    return { org, applicant, admin };
}

async function s2InspectorReviewer(ctx) {
    const S = 'S2 Jev#2 inspector+doc-review';
    const { org, applicant, admin } = ctx;
    const inspector = await account('field_inspector', { org, groups: ['field_inspector'], login: true });
    const review = await workItem(org, applicant, { candidateGroup: 'document_reviewer' });
    record(S, 'inspector GET /work/queue?group=document_reviewer before', 403, (await call(inspector, 'GET', '/api/provider/work/queue?group=document_reviewer')).status);
    const give = await call(admin, 'POST', `/api/provider/admin/user-groups/${inspector.id}`, { groupCode: 'document_reviewer' });
    record(S, 'DTAM admin gives document_reviewer group to a field inspector (POST /provider/admin/user-groups/:id)', '-', cell(give), `groups: ${await groupsOf(inspector.id)}`);
    const q = await call(inspector, 'GET', '/api/provider/work/queue?group=document_reviewer');
    record(S, 'inspector GET /work/queue?group=document_reviewer after', '-', cell(q), `items listed: ${(q.json?.data || []).length} (the open document_reviewer item exists)`);
    const claim = await call(inspector, 'POST', `/api/provider/work/${review.id}/claim`, {});
    record(S, 'inspector POST /work/:id/claim on document_reviewer work', '-', cell(claim), `error: ${String(claim.json?.error || '').slice(0, 80)} · row after: ${JSON.stringify(await stateOf(review.id)).replace(inspector.id, 'inspector')}`);
    userGroups.clearCache();
    const members = await userGroups.listGroupMemberUserIds(db, org, 'document_reviewer');
    record(S, 'listGroupMemberUserIds(org, document_reviewer) names the inspector', '-', members.includes(inspector.id), 'the document-assignment list of order 27');
}

async function s3CrossSide(ctx) {
    const S = 'S3 M1 cross-side leftover';
    const { org, applicant } = ctx;
    const leftover = await account('finance_officer_platform', { org, groups: ['system_admin_dtam'], login: true });
    const item = await workItem(org, applicant);
    record(S, 'company finance + leftover system_admin_dtam group: GET /work/queue?group=dispatcher', 403, (await call(leftover, 'GET', '/api/provider/work/queue?group=dispatcher')).status);
    const my = await call(leftover, 'GET', '/api/provider/work/my');
    record(S, 'same: GET /work/my lists the DTAM item', false, my.status === 200 && (my.json?.data || []).some((a) => a.id === item.id));
    record(S, 'same: GET /work/:id', 403, (await call(leftover, 'GET', `/api/provider/work/${item.id}`)).status);
    record(S, 'same: POST /work/:id/claim', 400, (await call(leftover, 'POST', `/api/provider/work/${item.id}/claim`, {})).status, `row after: ${JSON.stringify(await stateOf(item.id))}`);
    record(S, 'same: POST /work/:id/done', 400, (await call(leftover, 'POST', `/api/provider/work/${item.id}/done`, {})).status);
    userGroups.clearCache();
    record(S, 'listGroupMemberUserIds(org, system_admin_dtam) leaves it out', false, (await userGroups.listGroupMemberUserIds(db, org, 'system_admin_dtam')).includes(leftover.id));
}

async function s4GroupDoors(ctx) {
    const S = 'S4 L4 group doors';
    const { org, applicant, admin } = ctx;
    record(S, 'DTAM admin POST group on an applicant account', 404, (await call(admin, 'POST', `/api/provider/admin/user-groups/${applicant.id}`, { groupCode: 'dispatcher' })).status, `groups: ${await groupsOf(applicant.id)}`);
    const self = await call(admin, 'POST', `/api/provider/admin/user-groups/${admin.id}`, { groupCode: 'certificate_approver' });
    record(S, 'DTAM admin POST group on itself', '403 SELF_ROLE_CHANGE_FORBIDDEN', cell(self), `groups: ${await groupsOf(admin.id)}`);
    const company = await account('finance_officer_platform', { org });
    record(S, 'DTAM admin POST DTAM group on a company account', '403 CROSS_SIDE_USER_CHANGE_FORBIDDEN', cell(await call(admin, 'POST', `/api/provider/admin/user-groups/${company.id}`, { groupCode: 'dispatcher' })), `groups: ${await groupsOf(company.id)}`);
}

async function s5Race() {
    const S = 'S5 Jev#4 last-admin race';
    const TRIALS = Number(process.env.WALK_TRIALS || 15);
    const kinds = { dtam: {}, platform: {} };
    const tally = (side, rs) => { const k = rs.map(cell).sort().join(' / '); kinds[side][k] = (kinds[side][k] || 0) + 1; };
    let dtamBoth = 0; let dtamZero = 0;
    for (let i = 0; i < TRIALS; i += 1) {
        const org = (await organization()).id;
        const a = await account('system_admin_dtam', { org, login: true });
        const b = await account('system_admin_dtam', { org, login: true });
        const [ra, rb] = await Promise.all([
            call(a, 'PATCH', `/api/admin/users/${b.id}/disable`, { reason: REASON }),
            call(b, 'PATCH', `/api/admin/users/${a.id}/disable`, { reason: REASON }),
        ]);
        tally('dtam', [ra, rb]);
        if (ra.status === 200 && rb.status === 200) { dtamBoth += 1; }
        const active = await db.user.count({ where: { organizationId: org, role: 'system_admin_dtam', status: 'ACTIVE', isDeleted: false } });
        if (active === 0) { dtamZero += 1; }
    }
    record(S, `DTAM: two admins disable each other at once, ${TRIALS} trials: both 200`, `0/${TRIALS}`, `${dtamBoth}/${TRIALS}`);
    record(S, `DTAM: outcomes over ${TRIALS} trials`, '-', JSON.stringify(kinds.dtam));
    record(S, `DTAM: trials ending with ZERO active admins in the organization`, `0/${TRIALS}`, `${dtamZero}/${TRIALS}`, 'guard intends 0');

    let platBoth = 0; let platZero = 0;
    for (let i = 0; i < TRIALS; i += 1) {
        const org = (await organization()).id;
        const p = await account('system_admin_platform', { org, login: true });
        const q = await account('system_admin_platform', { org, login: true });
        const [rp, rq] = await Promise.all([
            call(p, 'DELETE', `/api/provider/directory/${q.id}`),
            call(q, 'DELETE', `/api/provider/directory/${p.id}`),
        ]);
        tally('platform', [rp, rq]);
        if (rp.status === 200 && rq.status === 200) { platBoth += 1; }
        const active = await db.user.count({ where: { role: 'system_admin_platform', status: 'ACTIVE', isDeleted: false } });
        if (active === 0) { platZero += 1; }
        // retire the pair so the next trial's count sees only its own pair
        await db.user.updateMany({ where: { id: { in: [p.id, q.id] } }, data: { isDeleted: true, status: 'INACTIVE' } });
    }
    record(S, `platform: two platform admins delete each other at once, ${TRIALS} trials: both 200`, `0/${TRIALS}`, `${platBoth}/${TRIALS}`);
    record(S, `platform: outcomes over ${TRIALS} trials`, '-', JSON.stringify(kinds.platform));
    record(S, `platform: trials ending with ZERO active platform admins`, `0/${TRIALS}`, `${platZero}/${TRIALS}`, 'guard intends 0');

    // sequential control: the guard holds when the two requests do not overlap
    const org = (await organization()).id;
    const a = await account('system_admin_dtam', { org, login: true });
    const b = await account('system_admin_dtam', { org, login: true });
    const first = await call(a, 'PATCH', `/api/admin/users/${b.id}/disable`, { reason: REASON });
    const c = await account('system_admin_dtam', { org, login: true });
    const second = await call(c, 'PATCH', `/api/admin/users/${a.id}/disable`, { reason: REASON });
    const third = await call(a, 'PATCH', `/api/admin/users/${c.id}/disable`, { reason: REASON });
    record(S, 'sequential control: a disables b (2 admins left)', 200, first.status);
    record(S, 'sequential control: c disables a (c is the last)', 200, second.status);
    record(S, 'sequential control: a (now disabled) token on the door', 401, third.status, 'disabled session rejected');
}

async function s6OpsScripts(ctx) {
    const S = 'S6 I1 ops scripts';
    const { org } = ctx;
    const staff = await account('dispatcher', { org, groups: ['dispatcher'] });
    let r = runScript('scripts/ops/bootstrap-dtam-admin.js', ['--organization', org, '--user', staff.id, '--reason', REASON, '--apply']);
    record(S, 'bootstrap --apply on an organization that already has an active DTAM admin', 1, r.status, `refused: ${r.output.includes('ปฏิเสธ')} · row: ${(await userRow(staff.id)).role} · leaks: ${leaks(r.output, staff)}`);

    const org2 = await organization();
    const cand = await account('dispatcher', { org: org2.id, status: 'INACTIVE', groups: ['dispatcher'] });
    const company = await account('finance_officer_platform', { org: org2.id });
    r = runScript('scripts/ops/bootstrap-dtam-admin.js', ['--organization', org2.slug]);
    record(S, 'bootstrap with no --user lists DTAM-side staff only, writes nothing', 0, r.status, `lists candidate: ${r.output.includes(cand.id)} · lists company account: ${r.output.includes(company.id)} · row: ${(await userRow(cand.id)).status} · leaks: ${leaks(r.output, cand)}`);
    r = runScript('scripts/ops/bootstrap-dtam-admin.js', ['--organization', org2.slug, '--user', cand.id, '--reason', REASON]);
    const dry = await userRow(cand.id);
    record(S, 'bootstrap dry run (default) writes nothing', 0, r.status, `row: ${dry.role}/${dry.status} · audit rows: ${await db.auditLog.count({ where: { resourceId: cand.id, action: 'DTAM_ADMIN_BOOTSTRAPPED' } })} · leaks: ${leaks(r.output, cand)}`);
    r = runScript('scripts/ops/bootstrap-dtam-admin.js', ['--organization', org2.slug, '--user', cand.id, '--reason', REASON, '--apply']);
    const applied = await userRow(cand.id);
    record(S, 'bootstrap --apply promotes + enables + admin group + 1 audit row', 0, r.status, `row: ${applied.role}/${applied.status} · groups: ${await groupsOf(cand.id)} · audit rows: ${await db.auditLog.count({ where: { resourceId: cand.id, action: 'DTAM_ADMIN_BOOTSTRAPPED' } })} · leaks: ${leaks(r.output, cand)}`);
    r = runScript('scripts/ops/bootstrap-dtam-admin.js', ['--organization', org2.slug, '--user', company.id, '--reason', REASON, '--apply']);
    record(S, 'bootstrap --apply again (admin now exists) is refused', 1, r.status, `refused: ${r.output.includes('ปฏิเสธ')} · company row: ${(await userRow(company.id)).role}`);

    const fin = await account('finance_officer_platform', { org: org2.id });
    r = runScript('scripts/grant-platform-admin.js', ['--id', fin.id]);
    record(S, 'grant-platform-admin dry run (default) writes nothing', 0, r.status, `row: ${(await userRow(fin.id)).role} · leaks: ${leaks(r.output, fin)}`);
    r = runScript('scripts/grant-platform-admin.js', ['--id', fin.id, '--apply']);
    record(S, 'grant-platform-admin --apply writes the canonical word + 1 audit row', 0, r.status, `row: ${(await userRow(fin.id)).role} · audit rows: ${await db.auditLog.count({ where: { resourceId: fin.id, action: 'USER_ROLE_GRANTED' } })} · leaks: ${leaks(r.output, fin)}`);
    await db.user.update({ where: { id: fin.id }, data: { isDeleted: true, status: 'INACTIVE' } });
    const dtam = await account('dispatcher', { org: org2.id });
    r = runScript('scripts/grant-platform-admin.js', ['--id', dtam.id, '--apply']);
    record(S, 'grant-platform-admin --apply on a DTAM-side account is refused', 1, r.status, `row: ${(await userRow(dtam.id)).role}`);
}

async function s7Count() {
    const S = 'S7 M1 counting script (new tree)';
    const r = runScript('scripts/ops/count-cross-side-group-memberships.js', []);
    record(S, 'exit code', 0, r.status);
    const lines = r.output.trim().split('\n');
    record(S, 'prints counts only (no uuid, no @, no 13 digits)', true, !/[0-9a-f]{8}-[0-9a-f]{4}|@|\d{13}/.test(r.output));
    for (const line of lines.slice(1)) { record(S, `output: ${line.replace(/\s+/g, ' ')}`, '-', ''); }
}

async function s8Promotion(ctx) {
    const S = 'S8 promotion keeps a leftover group';
    const { org, applicant, admin } = ctx;
    const promoted = await account('dispatcher', { org, groups: ['dispatcher'], login: true });
    const inspectorWork = await workItem(org, applicant, { candidateGroup: 'field_inspector' });
    record(S, 'admin promotes a dispatcher holding the dispatcher row to system_admin_dtam', 200, (await call(admin, 'PATCH', `/api/admin/users/${promoted.id}/change-role`, { newRole: 'system_admin_dtam', reason: REASON })).status, `row: ${(await userRow(promoted.id)).role}, groups: ${await groupsOf(promoted.id)}`);
    await pause(1500);
    const again = await signIn(promoted);
    record(S, 'promoted GET /admin/users (role gate)', 200, (await call(again, 'GET', '/api/admin/users')).status);
    record(S, 'promoted GET /work/queue?group=field_inspector', '-', cell(await call(again, 'GET', '/api/provider/work/queue?group=field_inspector')), 'the leftover dispatcher row hides the role fallback');
    record(S, 'promoted POST /work/:id/claim on field_inspector work', '-', cell(await call(again, 'POST', `/api/provider/work/${inspectorWork.id}/claim`, {})));
}

async function cleanup(ids) {
    const { users, apps, orgs } = ids;
    await db.workActivity.deleteMany({ where: { applicationId: { in: apps } } }).catch(() => {});
    await db.assignmentLedgerEntry.deleteMany({ where: { OR: [{ assigneeUserId: { in: users } }, { assignedByUserId: { in: users } }] } }).catch(() => {});
    await db.application.deleteMany({ where: { id: { in: apps } } }).catch(() => {});
    await db.userGroupMembership.deleteMany({ where: { userId: { in: users } } }).catch(() => {});
    await db.userPermissionGrant.deleteMany({ where: { userId: { in: users } } }).catch(() => {});
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { resourceId: { in: users } }] } }).catch(() => {});
    await db.notification.deleteMany({ where: { userId: { in: users } } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: users } } }).catch(() => {});
    await db.organization.deleteMany({ where: { id: { in: orgs } } }).catch(() => {});
}

async function main() {
    if (process.argv.includes('--cleanup')) {
        const ids = JSON.parse(fs.readFileSync(FIX, 'utf8'));
        await cleanup(ids);
        console.log(`cleaned ${ids.users.length} users, ${ids.apps.length} applications, ${ids.orgs.length} organizations`);
        return;
    }
    try {
        const onlyArg = process.argv.find((a) => a.startsWith('--only='));
        const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
        const want = (k) => !only || only.has(k);
        const ctx = await s1Demotion();
        if (want('s2')) { await s2InspectorReviewer(ctx); }
        if (want('s3')) { await s3CrossSide(ctx); }
        if (want('s4')) { await s4GroupDoors(ctx); }
        if (want('s5')) { await s5Race(); }
        if (want('s6')) { await s6OpsScripts(ctx); }
        if (want('s7')) { await s7Count(); }
        if (only && only.has('s8')) { await s8Promotion(ctx); }
    } catch (error) {
        rows.push({ section: 'ERROR', step: error.message, expected: '', got: '', ok: 'NO', note: '' });
    } finally {
        const md = ['| section | step | expected | got | ok | note |', '|---|---|---|---|---|---|',
            ...rows.map((r) => `| ${r.section} | ${r.step} | ${r.expected} | ${r.got} | ${r.ok} | ${r.note} |`)].join('\n');
        fs.writeFileSync(path.join(D, process.env.WALK_REPORT || 'walk-report.md'), `${md}\n`);
        console.log(md);
        if (process.argv.includes('--keep')) {
            fs.writeFileSync(FIX, JSON.stringify(fx));
            console.log(`fixtures kept: ${fx.users.length} users (run --cleanup later)`);
        } else {
            await cleanup(fx);
        }
    }
}

main().catch((e) => { console.error('walk failed:', e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
