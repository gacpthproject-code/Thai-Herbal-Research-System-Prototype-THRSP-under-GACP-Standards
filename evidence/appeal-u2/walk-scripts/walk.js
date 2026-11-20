'use strict';
// Prints statuses, codes and Thai words only: never a token, a password, or a national ID (13-digit numbers are masked).
const fs = require('fs');
const path = require('path');

const DIR = '/home/ubuntu/work/state/reviews/appeal-u2-takeover/walk';
const BASE = process.env.WALK_BASE || 'http://127.0.0.1:8192';
const fx = JSON.parse(fs.readFileSync(path.join(DIR, 'fixture.json'), 'utf8'));
const env = (k) => { const v = process.env[k]; if (!v) { throw new Error(`missing ${k}`); } return v; };
const FINDINGS = [
    { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ยย้อนหลัง 3 เดือน', correctiveAction: 'จัดทำสมุดบันทึกการใช้ปัจจัยการผลิต' },
    { nonConformity: 'โรงเก็บผลผลิตไม่มีประตูล็อก', correctiveAction: 'ติดตั้งประตูที่ล็อกได้และบันทึกผู้ถือกุญแจ' },
];
const CONSIDERATION = 'ข้อบกพร่องทั้งสองข้อกระทบการควบคุมผลผลิตโดยตรง และแก้ไขในระยะสั้นไม่ได้';
const NOTE = 'บันทึกภายในห้ามหลุดถึงผู้ยื่น';
const lines = [];
const mask = (s) => String(s).replace(/\b\d{13}\b/g, 'X-XXXX-XXXXX-XX-X').replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt>');
const say = (line) => { const l = mask(line); lines.push(l); console.log(l); };
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
    // Double-submit CSRF: echo the server's csrf_token cookie when the login set one, else mint one.
    const served = cookies.find((c) => c.startsWith('csrf_token='));
    const csrf = served ? served.slice('csrf_token='.length) : require('crypto').randomBytes(16).toString('hex');
    const jar = [...cookies.filter((c) => !c.startsWith('csrf_token=')), `csrf_token=${csrf}`].join('; ');
    const headersFor = (extra = {}) => {
        const headers = { 'x-csrf-token': csrf, cookie: jar, ...extra };
        if (token) { headers.authorization = `Bearer ${token}`; }
        return headers;
    };
    return {
        status: res.status,
        call: async (method, p, payload) => {
            const r = await fetch(`${BASE}${p}`, { method, headers: headersFor({ 'content-type': 'application/json' }), body: payload ? JSON.stringify(payload) : undefined });
            return { status: r.status, body: await r.json().catch(() => ({})) };
        },
        upload: async (p, field, fileName, bytes, type) => {
            const form = new FormData();
            form.append(field, new Blob([bytes], { type }), fileName);
            form.append('notes', 'แนบภาพประตูที่ติดตั้งแล้วและสมุดบันทึก');
            const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: headersFor(), body: form });
            return { status: r.status, body: await r.json().catch(() => ({})) };
        },
    };
}
const listOf = (body) => (Array.isArray(body?.data) ? body.data : (body?.data?.notifications || body?.data?.items || []));
const about = (list, number) => list.filter((n) => String(n.title || '').includes(number) || String(n.message || '').includes(number));

(async () => {
    say(`walk U2 against ${BASE} at ${new Date().toISOString()}`);
    const staff = (k) => session('/api/auth/provider/login', { providerId: env(`WALK_${k}_PID`), password: env(`WALK_${k}_PW`) });
    const member = (k) => session('/api/auth/health/login', { identifier: env(`WALK_${k}_HID`), password: env(`WALK_${k}_PW`) });
    const inspector = await staff('INSPECTOR');
    const approver = await staff('APPROVER');
    const admin = await staff('ADMIN');
    const applicant = await member('APPLICANT');
    const colleague = await member('COLLEAGUE');
    const viewer = await member('VIEWER');
    say('STEP 0 logins through the real doors (field inspector, certificate approver, DTAM admin, applicant OWNER, holder MANAGER with SUBMIT_APPLICATION, holder VIEWER)');
    expect('login statuses', [inspector.status, approver.status, admin.status, applicant.status, colleague.status, viewer.status], [200, 200, 200, 200, 200, 200]);

    const fail = (app) => inspector.call('POST', `/api/provider/auditor/applications/${app.id}/audit-decisions`, { decision: 'FAIL', notes: 'แปลงยังไม่พร้อมรับรอง', findings: FINDINGS });
    const fileOf = (app, who = approver) => who.call('GET', `/api/provider/auditor/applications/${app.id}/decision-file`);
    const open = (app, who = approver) => who.call('POST', `/api/provider/auditor/applications/${app.id}/decision-file/opened`);

    say(`STEP 1 refusal path (${fx.refusal.number}): the inspector records "ไม่ผ่าน", the approver refuses from the decision file`);
    const f1 = await fail(fx.refusal);
    expect('inspector FAIL', [f1.status, f1.body?.data?.status], [200, 'AUDIT_NOT_PASSED']);
    const file1 = await fileOf(fx.refusal);
    expect('decision file: decidable, actions, inspector result, findings', [
        file1.status, file1.body?.data?.decidable, file1.body?.data?.actions, file1.body?.data?.inspectorSummary?.decision,
        (file1.body?.data?.inspectorSummary?.findings || []).length,
    ], [200, true, ['REFUSE', 'REQUEST_CORRECTION'], 'FAIL', 2]);
    const queue = await approver.call('GET', '/api/provider/work/queue?group=certificate_approver');
    const tasks = listOf(queue.body).concat(queue.body?.data?.activities || []).filter((t) => t.applicationId === fx.refusal.id);
    say(`       approver work queue rows for ${fx.refusal.number}: ${tasks.map((t) => `${t.workType}@${t.triggeredAtStage}`).join(', ') || '(none)'}`);
    expect('work queue holds the decision task of the file that did not pass', [queue.status, tasks.some((t) => t.workType === 'FINAL_APPROVAL' && t.triggeredAtStage === 'AUDIT_NOT_PASSED')], [200, true]);
    expect('open the file', [(await open(fx.refusal)).status], [200]);
    const r1 = await approver.call('POST', `/api/provider/auditor/applications/${fx.refusal.id}/certification-refusals`, { reasonCode: 'CRITICAL_NONCONFORMITY', consideration: CONSIDERATION, note: NOTE });
    expect('refuse', [r1.status, r1.body?.data?.status], [200, 'REJECTED']);
    for (const [name, who, count] of [['applicant', applicant, 1], ['holder MANAGER', colleague, 1], ['holder VIEWER', viewer, 0]]) {
        const notes = listOf((await who.call('GET', '/api/notifications')).body);
        const letters = about(notes, fx.refusal.number).filter((n) => n.kind === 'OFFICIAL_LETTER');
        expect(`${name}: official letters of the order`, letters.length, count);
        if (letters[0]) {
            const m = String(letters[0].message);
            say(`       ${name} letter title: ${letters[0].title}`);
            expect(`${name}: letter states facts, findings, reason, consideration, order, reservation, new application`, [
                m.includes('ผู้ตรวจพื้นที่บันทึกผลว่า ไม่ผ่าน'), FINDINGS.every((f) => m.includes(f.nonConformity)), m.includes('พบข้อบกพร่องร้ายแรง'),
                m.includes(CONSIDERATION), m.includes('จึงมีคำสั่งไม่ให้การรับรอง'), m.includes('ทั้งนี้ ท่านมีสิทธิ์โต้แย้งคำสั่งตามที่กฎหมายกำหนด'), m.includes('ยื่นคำขอรับรองใหม่'),
            ], [true, true, true, true, true, true, true]);
            expect(`${name}: no internal note, no appeal days, no official named, no platform mailbox`, [
                m.includes(NOTE), /อุทธรณ์ภายใน|ภายใน\s*\d+\s*วัน/.test(m), /อธิบดี|ปฏิบัติราชการแทน|ลงนาม/.test(m), m.includes('contact@gacpth.com'),
            ], [false, false, false, false]);
            expect(`${name}: the reservation names no body, channel or deadline, only that the details will be announced (order 91)`, [
                m.includes('โดยจะแจ้งรายละเอียดให้ทราบต่อไป'), /สอบถามรายละเอียดได้ที่|โทร|https?:\/\/|www\./.test(m),
            ], [true, false]);
            const failNotices = about(notes, fx.refusal.number).filter((n) => n.kind !== 'OFFICIAL_LETTER' && String(n.title || '').includes('ไม่ผ่าน'));
            expect(`${name}: the notice of the failed visit names no deciding official (order 91)`, [failNotices.length > 0, failNotices.some((n) => String(n.message).includes('ผู้อนุมัติ'))], [true, false]);
            expect(`${name}: no CERTIFICATION_REFUSED notice beside the letter`, about(notes, fx.refusal.number).filter((n) => n.metadata?.notice === 'CERTIFICATION_REFUSED').length, 0);
        }
    }
    const detail = await applicant.call('GET', `/api/applications/${fx.refusal.id}`);
    const refusalView = detail.body?.data?.certificationRefusal || null;
    expect('applicant detail: the order\'s reason, consideration and date, no officer id', [
        detail.status, refusalView && refusalView.consideration, Boolean(refusalView && refusalView.reasonLabel), Boolean(refusalView && refusalView.decidedAt),
        JSON.stringify(detail.body || {}).includes(fx.approverId),
    ], [200, CONSIDERATION, true, true, false]);
    const tracking = await applicant.call('GET', `/api/applications/${fx.refusal.id}/status`);
    expect('applicant action card', [tracking.status, tracking.body?.data?.actionCard?.key], [200, 'NOT_CERTIFIED']);
    const after1 = await fileOf(fx.refusal);
    expect('decided file: read only, no actions, outcome with consideration', [after1.body?.data?.decidable, after1.body?.data?.actions, after1.body?.data?.decision?.outcome, after1.body?.data?.decision?.consideration], [false, [], 'REFUSED', CONSIDERATION]);

    say(`STEP 2 correction path (${fx.correction.number}): "ไม่ผ่าน", the approver sends finding 2 back, the applicant answers, the inspector asks to see the site again`);
    const f2 = await fail(fx.correction);
    expect('inspector FAIL', [f2.status, f2.body?.data?.status], [200, 'AUDIT_NOT_PASSED']);
    expect('open the file', [(await open(fx.correction)).status], [200]);
    const c2 = await approver.call('POST', `/api/provider/auditor/applications/${fx.correction.id}/certification-corrections`, { findingIndexes: [2], note: 'แนบภาพประตูที่ติดตั้งแล้ว' });
    expect('send back for correction', [c2.status, c2.body?.data?.status], [200, 'CAR_PENDING']);
    const due = c2.body?.data?.carDueAt;
    say(`       carDueAt ${due} (decision at ${new Date().toISOString()}; 30 calendar days, end of the Bangkok day)`);
    const aNotes = listOf((await applicant.call('GET', '/api/notifications')).body);
    const carLetters = about(aNotes, fx.correction.number).filter((n) => n.kind === 'OFFICIAL_LETTER');
    expect('applicant: one correction letter naming finding 2 only', [carLetters.length, carLetters[0] && String(carLetters[0].message).includes(FINDINGS[1].nonConformity), carLetters[0] && String(carLetters[0].message).includes(FINDINGS[0].nonConformity)], [1, true, false]);
    expect('the correction letter carries the approver\'s instruction', [Boolean(carLetters[0] && String(carLetters[0].message).includes('คำสั่งเพิ่มเติม\nแนบภาพประตูที่ติดตั้งแล้ว'))], [true]);
    const cNotes = listOf((await colleague.call('GET', '/api/notifications')).body);
    expect('holder MANAGER: told what to correct', about(cNotes, fx.correction.number).some((n) => String(n.message).includes(FINDINGS[1].nonConformity)), true);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const u2 = await applicant.upload(`/api/applications/${fx.correction.id}/car`, 'carDocument', 'evidence.pdf', pdf, 'application/pdf');
    expect('applicant sends the correction evidence', [u2.status], [200]);
    const s2 = await applicant.call('GET', `/api/applications/${fx.correction.id}/status`);
    expect('status after the evidence', [s2.body?.data?.status], ['CAR_REVIEWING']);
    const re2 = await inspector.call('POST', `/api/provider/auditor/applications/${fx.correction.id}/audit-decisions`, { decision: 'REINSPECT', notes: 'ต้องดูประตูโรงเก็บของจริง' });
    expect('the same inspector asks to see the site again (re-inspection path as before)', [re2.status], [200]);
    const s2b = await applicant.call('GET', `/api/applications/${fx.correction.id}/status`);
    say(`       status after the request: ${s2b.body?.data?.status}`);

    say(`STEP 3 rules on a file that did not pass (${fx.checks.number})`);
    const f3 = await fail(fx.checks);
    expect('inspector FAIL', [f3.status, f3.body?.data?.status], [200, 'AUDIT_NOT_PASSED']);
    const notOpened = await approver.call('POST', `/api/provider/auditor/applications/${fx.checks.id}/certification-corrections`, {});
    expect('send back before opening the file', [notOpened.status, notOpened.body?.code], [409, 'DECISION_FILE_NOT_OPENED']);
    await open(fx.checks);
    const ap3 = await approver.call('POST', `/api/provider/auditor/applications/${fx.checks.id}/final-approvals`, { reason: 'ลองอนุมัติ' });
    expect('approve a file that did not pass', [ap3.status, ap3.body?.code], [409, 'OUTCOME_NOT_OFFERED']);
    const nc3 = await approver.call('POST', `/api/provider/auditor/applications/${fx.checks.id}/certification-refusals`, { reasonCode: 'CRITICAL_NONCONFORMITY', consideration: 'สั้นไป' });
    expect('refuse with a consideration under 20 characters', [nc3.status, nc3.body?.code], [400, 'DECISION_CONSIDERATION_REQUIRED']);
    const in3 = await inspector.call('POST', `/api/provider/auditor/applications/${fx.checks.id}/certification-refusals`, { reasonCode: 'CRITICAL_NONCONFORMITY', consideration: CONSIDERATION });
    const ad3 = await admin.call('POST', `/api/provider/auditor/applications/${fx.checks.id}/certification-corrections`, {});
    expect('field inspector refuses / DTAM admin sends back', [in3.status, ad3.status], [403, 403]);
    const g3 = await approver.call('POST', `/api/provider/applications/${fx.checks.id}/workflow-transitions`, { toState: 'CAR_PENDING', comment: 'ผ่านประตูทั่วไป' });
    expect('generic door, approver to CAR_PENDING', [g3.status, g3.body?.code], [409, 'CERTIFICATION_DECISION_USE_FILE']);
    const s3 = await applicant.call('GET', `/api/applications/${fx.checks.id}/status`);
    expect('still waiting for the approver', [s3.body?.data?.status], ['AUDIT_NOT_PASSED']);

    say(`STEP 4 a file the inspector passed (${fx.passed.number}) and the queue`);
    const file4 = await fileOf(fx.passed);
    expect('passed file offers approve, refuse, return', [file4.body?.data?.actions], [['APPROVE', 'REFUSE', 'RETURN']]);
    await open(fx.passed);
    const c4 = await approver.call('POST', `/api/provider/auditor/applications/${fx.passed.id}/certification-corrections`, {});
    expect('send a passed file back for correction', [c4.status, c4.body?.code], [409, 'OUTCOME_NOT_OFFERED']);
    const q4 = await approver.call('GET', '/api/provider/auditor/final-approval-queue');
    const queued = (q4.body?.data?.items || []).filter((i) => [fx.checks.id, fx.passed.id].includes(i.id)).map((i) => `${i.applicationNumber}:${i.status}`).sort();
    expect('queue holds both kinds of file', [q4.status, queued], [200, [`${fx.checks.number}:AUDIT_NOT_PASSED`, `${fx.passed.number}:AUDIT_PASSED`].sort()]);

    say(`walk finished: ${failures === 0 ? 'every check held' : `${failures} check(s) did not hold`}`);
    fs.writeFileSync(path.join(DIR, 'walk-output.txt'), `${lines.join('\n')}\n`);
    process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('walk crashed:', e.message); process.exit(2); });
