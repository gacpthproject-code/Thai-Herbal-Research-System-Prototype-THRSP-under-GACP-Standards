'use strict';

const { check } = require('../lib/context');

const CROSS_RUN_SPREAD_DAYS = { from: 20, span: 40 };
const bkkDate = (d) => new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function inspectionSlots(now = new Date()) {
    const slots = [];
    const d = new Date(now.getTime() + (CROSS_RUN_SPREAD_DAYS.from + Math.floor(Math.random() * CROSS_RUN_SPREAD_DAYS.span)) * 86400000);
    while (slots.length < 4) {
        const wd = new Date(d.getTime() + 7 * 3600 * 1000).getUTCDay();
        if (wd !== 0 && wd !== 6) { slots.push([bkkDate(d), slots.length % 2 ? '13:00' : '09:00']); }
        d.setTime(d.getTime() + 86400000);
    }
    return slots;
}

async function appStatus(d, id) {
    const r = await d.api('applicant', 'GET', `/api/applications/${id}`);
    return r.body?.data?.status || r.body?.data?.application?.status || `HTTP ${r.status}`;
}

const ok2xx = (s) => typeof s === 'number' && s >= 200 && s < 300;
const findStatus = (log, tag) => (Array.isArray(log) ? log.filter((x) => Array.isArray(x) && x[0] === tag).pop()?.[1] : undefined);

module.exports = {
    id: 'cert-path',
    title: 'เส้นใบรับรอง 12 ขั้น: ยื่น → ชำระ → จัดคิว → ตรวจเอกสาร → ชำระ → นัด → ตรวจพื้นที่ → อนุมัติ → ออกใบ (คำขอทดสอบ 1 รายการต่อรอบ)',
    async run(ctx) {
        const S = ctx.state;
        const w = ctx.cfg.walkApplication;
        const checks = [];
        const as = async (role) => {
            const s = await ctx.signIn(role);
            if (!s.ok) { throw new Error(`${role} ล็อกอินไม่ได้: ${s.reason}`); }
        };
        const d = await ctx.driver();
        const p = `walk-${ctx.runId}`;
        S.site = `แปลงเดินตรวจ ${ctx.runId}`;
        let stopped = false;
        const step = async (id, title, fn) => {
            if (stopped) { checks.push({ id, title, status: stopped === 'NOT-YET' ? 'NOT-YET' : 'FAIL', detail: `ไม่ได้เดิน เพราะขั้นก่อนหน้า${stopped === 'NOT-YET' ? 'ยังวัดไม่ได้' : 'ไม่ผ่าน'}` }); return; }
            const c = await check(id, title, fn);
            checks.push(c);
            if (c.status !== 'PASS') { stopped = c.status; }
        };

        await step('01-submit', 'ผู้ยื่นกรอก 6 ขั้นและยื่นคำขอ', async () => {
            await as('applicant');
            const r = await d.run('applicant', 'wizard', { p: `${p}-01`, role: 'applicant', holderRx: w.holderRx, plant: w.plant, site: S.site, contact: w.contact }, { timeoutMs: 600000 });
            const [status, id, number, appSt, err] = r;
            if (!ok2xx(status) || !id) { return ctx.fail(`ยื่นได้ ${status} ${err || ''}`); }
            Object.assign(S, { appId: id, appNumber: number });
            ctx.log(`test application ${number} (${id})`);
            return ctx.pass(`${number} สถานะ ${appSt}`);
        });
        await step('02-quotation', 'ระบบออกใบเสนอราคาให้คำขอ', async () => {
            const r = await d.api('applicant', 'GET', `/api/applications/${S.appId}/quotations`);
            const list = Array.isArray(r.body?.data) ? r.body.data : r.body?.data?.quotations || (r.body?.data ? [r.body.data] : []);
            S.quotation = list[0] || null;
            if (r.status !== 200 || !S.quotation) { return ctx.fail(`GET quotations ${r.status} ไม่พบใบเสนอราคา`); }
            const q = S.quotation;
            return ctx.pass(`${JSON.stringify(q).match(/QT-[A-Z]+-\d{4}-\d+/)?.[0] || 'ใบเสนอราคา'} สถานะ ${q.status ?? '-'}`);
        });
        // Each payment gets its own browser context: in a context that already opened Stripe's test
        // popup once, the simulator button opens no second popup (measured 2026-11-04, runs 6 and 7).
        await step('03-pay-m1', 'ชำระงวด 1 ด้วย PromptPay ของ Stripe โหมดทดสอบ จนหน้าเว็บยืนยันการชำระ', async () => {
            const r = await d.run('applicant:pay-m1', 'pay', { p: `${p}-03`, app: S.appId }, { timeoutMs: 420000 });
            S.paidM1 = r === 'paid';
            return S.paidM1 ? ctx.pass(`หน้าเว็บขึ้น "ระบบได้รับการยืนยันการชำระเงิน" · สถานะ ${await appStatus(d, S.appId)}`) : ctx.fail(String(r));
        });
        await step('04-assign', 'ผู้จัดคิวจ่ายงานตรวจเอกสาร', async () => {
            await as('dispatcher');
            const [status, text] = await d.run('dispatcher', 'assign', { p: `${p}-04`, num: S.appNumber });
            return ok2xx(status) ? ctx.pass(`จ่ายงาน ${status} · สถานะ ${await appStatus(d, S.appId)}`) : ctx.fail(`จ่ายงาน ${status} ${text}`);
        });
        await step('05-review', 'ผู้ตรวจเอกสารรับเอกสารทุกช่องและรับคำขอ', async () => {
            await as('reviewer');
            const log = await d.run('reviewer', 'review', { p: `${p}-05`, app: S.appId, mode: 'accept' });
            const st = findStatus(log, 'decision');
            return ok2xx(st) ? ctx.pass(`ตัดสิน ${st} · สถานะ ${await appStatus(d, S.appId)}`) : ctx.fail(`ตัดสิน ${st} ${JSON.stringify(log).slice(0, 300)}`);
        });
        await step('06-pay-m2', 'ชำระงวด 2 ด้วย PromptPay ของ Stripe โหมดทดสอบ', async () => {
            const r = await d.run('applicant:pay-m2', 'pay', { p: `${p}-06`, app: S.appId }, { timeoutMs: 420000 });
            S.paidM2 = r === 'paid';
            return S.paidM2 ? ctx.pass(`ยืนยันการชำระบนหน้าเว็บ · สถานะ ${await appStatus(d, S.appId)}`) : ctx.fail(String(r));
        });
        await step('07-schedule', 'ผู้จัดคิวนัดตรวจพื้นที่', async () => {
            await as('dispatcher');
            const tries = [];
            for (const [day, at] of inspectionSlots()) {
                const [, status, body] = await d.run('dispatcher', 'schedule', { p: `${p}-07-${day}`, num: S.appNumber, day, at });
                tries.push(`${day} ${at}=${status}`);
                if (ok2xx(status)) { S.inspectionDay = day; return ctx.pass(`นัด ${tries.join(', ')}`); }
                if (status !== 409) { return ctx.fail(`นัด ${tries.join(', ')} ${String(body).slice(0, 200)}`); }
            }
            return ctx.fail(`ทุกช่องชน: ${tries.join(', ')}`);
        });
        await step('08-inspect', 'ผู้ตรวจพื้นที่กรอกรายการ แนบภาพ 5 ภาพ และส่งผลผ่าน', async () => {
            await as('inspector');
            const log = await d.run('inspector', 'inspect', { p: `${p}-08`, app: S.appId, decision: 'PASS' }, { timeoutMs: 600000 });
            const st = findStatus(log, 'decision');
            const photos = (Array.isArray(log) ? log : []).filter((x) => x[0] === 'photo');
            const badPhotos = photos.filter((x) => !ok2xx(x[2]));
            if (!ok2xx(st) || badPhotos.length) { return ctx.fail(`ส่งผล ${st} · ภาพไม่ผ่าน ${badPhotos.length}/${photos.length}`); }
            return ctx.pass(`ส่งผล ${st} ภาพ ${photos.length} ภาพ · สถานะ ${await appStatus(d, S.appId)}`);
        });
        await step('09-planting-closed-before-cert', 'ก่อนออกใบ หน้าเปิดรอบปลูกยังไม่ให้เลือกแปลงของคำขอนี้', async () => {
            const r = await d.run('applicant', 'planting-options', { p: `${p}-09-before` });
            S.plantingBefore = r;
            const listed = r.options.some((o) => o.includes(S.site)) || r.text.includes(S.site);
            return listed ? ctx.fail(`แปลง "${S.site}" เลือกได้ก่อนมีใบรับรอง`) : ctx.pass('แปลงของคำขอนี้ยังไม่อยู่ในตัวเลือก');
        });
        await step('10-approve', 'ผู้อนุมัติอนุมัติให้การรับรอง', async () => {
            await as('approver');
            const [url, status, body] = await d.run('approver', 'approve', { p: `${p}-10`, app: S.appId, action: 'approve' });
            const st = await appStatus(d, S.appId);
            return ok2xx(status) && st === 'CERTIFIED' ? ctx.pass(`${url} ${status} · สถานะ ${st}`) : ctx.fail(`${url} ${status} สถานะ ${st} ${String(body).slice(0, 200)}`);
        });
        await step('11-certificate', 'ใบรับรองออกให้ผู้ยื่นและเปิด PDF ได้', async () => {
            const r = await d.api('applicant', 'GET', '/api/certificates/my');
            const list = Array.isArray(r.body?.data) ? r.body.data : r.body?.data?.certificates || [];
            const cert = list.find((c) => c.applicationId === S.appId);
            if (!cert) { return ctx.fail(`GET /api/certificates/my ${r.status} ไม่มีใบของคำขอนี้`); }
            S.cert = { id: cert.id, number: cert.certificateNumber, status: cert.status, expiryDate: cert.expiryDate };
            const pdf = await d.api('applicant', 'GET', `/api/certificates/${cert.id}/download`, undefined, { raw: true });
            const isPdf = pdf.buf.slice(0, 4).toString() === '%PDF';
            return isPdf ? ctx.pass(`เลข ${cert.certificateNumber} สถานะ ${cert.status} PDF ${pdf.buf.length} ไบต์`) : ctx.fail(`ใบ ${cert.certificateNumber} แต่ PDF ตอบ ${pdf.status} ${pdf.type}`);
        });
        return checks;
    },
};
