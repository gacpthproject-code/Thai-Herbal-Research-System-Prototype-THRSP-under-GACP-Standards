'use strict';
// Real HTTP walk of unit U1 against the scratch backend on 127.0.0.1:8191 (fixture.json from fixture.js).
// Prints statuses, codes and Thai words only: never a token, a password, or a national ID.
const fs = require('fs');

const BASE = 'http://127.0.0.1:8191';
const fx = JSON.parse(fs.readFileSync('/tmp/appeal-u1/walk/fixture.json', 'utf8'));
const FINDING = { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ยย้อนหลัง 3 เดือน', correctiveAction: 'จัดทำสมุดบันทึกการใช้ปัจจัยการผลิต' };
const lines = [];
const say = (line) => { lines.push(line); console.log(line); };
let failures = 0;
const expect = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) { failures += 1; }
    say(`  ${ok ? 'OK  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
};

async function session(loginPath, body) {
    const res = await fetch(`${BASE}${loginPath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]);
    const token = json?.data?.token || json?.data?.accessToken || json?.token || json?.accessToken || null;
    return {
        status: res.status,
        call: async (method, path, payload) => {
            const csrf = require('crypto').randomBytes(16).toString('hex');
            const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
            headers.cookie = [...cookies, `csrf_token=${csrf}`].join('; ');
            if (token) { headers.authorization = `Bearer ${token}`; }
            const r = await fetch(`${BASE}${path}`, { method, headers, body: payload ? JSON.stringify(payload) : undefined });
            return { status: r.status, body: await r.json().catch(() => ({})) };
        },
    };
}

(async () => {
    say(`walk U1 against ${BASE} at ${new Date().toISOString()}`);
    // The seeded accounts of prisma/seed-gacp.js on the scratch database, passed in the environment.
    const env = (name) => process.env[name];
    const inspector = await session('/api/auth/provider/login', { providerId: env('WALK_INSPECTOR_ID'), password: env('WALK_OFFICER_PASSWORD') });
    const approver = await session('/api/auth/provider/login', { providerId: env('WALK_APPROVER_ID'), password: env('WALK_OFFICER_PASSWORD') });
    const admin = await session('/api/auth/provider/login', { providerId: env('WALK_ADMIN_ID'), password: env('WALK_ADMIN_PASSWORD') });
    const applicant = await session('/api/auth/health/login', { identifier: env('WALK_APPLICANT_ID'), password: env('WALK_APPLICANT_PASSWORD') });
    say('STEP 0 logins (field inspector, certificate approver, DTAM admin, applicant)');
    expect('login statuses', [inspector.status, approver.status, admin.status, applicant.status], [200, 200, 200, 200]);

    say(`STEP 1 field inspector records "ไม่ผ่าน" on the job sheet: POST /api/provider/auditor/applications/:id/audit-decisions (${fx.jobSheet.number})`);
    const r1 = await inspector.call('POST', `/api/provider/auditor/applications/${fx.jobSheet.id}/audit-decisions`, { decision: 'FAIL', notes: 'แปลงยังไม่พร้อม', findings: [FINDING] });
    expect('status / application status', [r1.status, r1.body?.data?.status], [200, 'AUDIT_NOT_PASSED']);

    say(`STEP 2 field inspector records "ไม่ผ่าน" on the field screen: POST /api/audit/onsite/:auditId/decision (${fx.field.number})`);
    const r2 = await inspector.call('POST', `/api/audit/onsite/${fx.field.auditId}/decision`, { decision: 'FAIL', summary: 'แปลงยังไม่พร้อม', findings: [FINDING] });
    expect('status / application status', [r2.status, r2.body?.data?.transition?.status], [200, 'AUDIT_NOT_PASSED']);

    say(`STEP 3 refusals at the result doors (${fx.refusals.number})`);
    const r3a = await inspector.call('POST', `/api/provider/auditor/applications/${fx.refusals.id}/audit-decisions`, { decision: 'FAIL', notes: 'ไม่ผ่าน', findings: [] });
    expect('FAIL with no finding', [r3a.status, r3a.body?.code], [400, 'FINDINGS_REQUIRED']);
    const r3b = await inspector.call('POST', `/api/provider/auditor/applications/${fx.refusals.id}/audit-decisions`, { decision: 'REJECT', notes: 'ปฏิเสธ' });
    expect('the retired word REJECT', [r3b.status], [400]);
    const r3c = await inspector.call('POST', `/api/provider/applications/${fx.refusals.id}/workflow-transitions`, { toState: 'REJECTED', comment: 'ปฏิเสธ' });
    expect('generic door, inspector to REJECTED', [r3c.status], [422]);

    say('STEP 4 the applicant reads the stage word of both files: GET /api/applications');
    const r4 = await applicant.call('GET', '/api/applications');
    const rows = Array.isArray(r4.body?.data) ? r4.body.data : (r4.body?.data?.items || r4.body?.data?.applications || []);
    for (const target of [fx.jobSheet, fx.field]) {
        const row = rows.find((a) => a.id === target.id || a.applicationNumber === target.number) || {};
        expect(`${target.number} status / dashboardStage / stage word`, [row.status, row.dashboardStage, row.dashboardStageLabel || row.stageLabel || row.statusLabel || null], [
            'AUDIT_NOT_PASSED', 'PENDING_DECISION', row.dashboardStageLabel || row.stageLabel || row.statusLabel || null,
        ]);
        const { STAGE_LABEL_TH } = require('/home/ubuntu/work/wt-appeal/apps/backend/shared/health-dashboard-stage');
        say(`       stage word the applicant reads (STAGE_LABEL_TH.${row.dashboardStage}): ${STAGE_LABEL_TH[row.dashboardStage]}`);
    }
    const notices = await applicant.call('GET', '/api/notifications');
    const list = Array.isArray(notices.body?.data) ? notices.body.data : (notices.body?.data?.notifications || notices.body?.data?.items || []);
    const told = list.filter((n) => String(n.message || '').includes(fx.jobSheet.number));
    say(`       applicant notice about ${fx.jobSheet.number}: ${told.map((n) => n.title).join(' | ') || '(none)'}`);
    expect('notice names the finding and the approver', [told.some((n) => String(n.message).includes(FINDING.nonConformity) && String(n.message).includes('ผู้อนุมัติจะพิจารณา'))], [true]);

    say('STEP 5 the certificate approver\'s queue: GET /api/provider/auditor/final-approval-queue');
    const r5 = await approver.call('GET', '/api/provider/auditor/final-approval-queue');
    const queued = (r5.body?.data?.items || []).filter((i) => [fx.jobSheet.id, fx.field.id].includes(i.id)).map((i) => `${i.applicationNumber}:${i.status}`).sort();
    expect('both files wait in the queue as AUDIT_NOT_PASSED', [r5.status, queued], [200, [`${fx.jobSheet.number}:AUDIT_NOT_PASSED`, `${fx.field.number}:AUDIT_NOT_PASSED`].sort()]);
    const r5b = await approver.call('GET', `/api/provider/auditor/applications/${fx.jobSheet.id}/decision-file`);
    expect('decision file opens (read only until U2)', [r5b.status, r5b.body?.data?.decidable], [200, false]);
    const approverNotices = await approver.call('GET', '/api/notifications');
    const aList = Array.isArray(approverNotices.body?.data) ? approverNotices.body.data : (approverNotices.body?.data?.notifications || approverNotices.body?.data?.items || []);
    say(`       approver notices: ${aList.filter((n) => String(n.message || '').includes('ไม่ผ่าน')).map((n) => n.title).slice(0, 2).join(' | ') || '(none)'}`);

    say(`STEP 6 an admin door cannot revive a refused application (${fx.refused.number})`);
    const r6 = await admin.call('POST', '/api/provider/admin/status-override', { applicationId: fx.refused.id, newStatus: 'AUDIT_CONFIRMED', reason: 'ตรวจพื้นที่ใหม่' });
    expect('status-override REJECTED to AUDIT_CONFIRMED', [r6.status, r6.body?.code], [409, 'CERTIFICATION_TRACK_LOCKED']);

    say(`walk finished: ${failures === 0 ? 'every check held' : `${failures} check(s) did not hold`}`);
    fs.writeFileSync('/tmp/appeal-u1/walk/walk-output.txt', `${lines.join('\n')}\n`);
    process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('walk crashed:', e.message); process.exit(2); });
