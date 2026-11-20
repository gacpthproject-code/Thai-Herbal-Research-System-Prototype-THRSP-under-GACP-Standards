'use strict';

const { check } = require('../lib/context');
const { piiFound } = require('../lib/mask');

const todayBkk = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function lotFrom(body) {
    const lot = parse(body)?.data?.batches?.[0]?.lots?.[0] || {};
    return { lotId: lot.id || null, lotNumber: lot.lotNumber || lot.lotCode || null, qrCode: lot.qrCode || null };
}

module.exports = {
    id: 'tnt',
    title: 'T&T: รอบปลูกหลังได้ใบ · ล็อต · QR หลังมีใบเท่านั้น · หน้าที่สแกนแล้วไปถึง',
    async run(ctx) {
        const S = ctx.state;
        const pending = (id, title) => ({ id, title, status: 'NOT-YET', detail: 'ต้องมีใบรับรองจากแถว cert-path ในรอบเดียวกัน' });
        if (!S.cert) {
            return [pending('planting-after-cert', 'รอบปลูกเปิดได้หลังได้ใบ'), pending('lot', 'เก็บเกี่ยวและสร้างล็อต'), pending('public-lot-door', 'ประตูสาธารณะ /api/trace/lot'), pending('buyer-page', 'หน้าผู้ซื้อ /trace/lot')];
        }
        const d = await ctx.driver();
        const p = `walk-${ctx.runId}-tnt`;
        const checks = [];
        checks.push(await check('qr-only-after-cert', 'แปลงของคำขอเลือกได้ในหน้าเปิดรอบปลูกหลังออกใบเท่านั้น', async () => {
            const before = S.plantingBefore;
            if (!before) { return ctx.notYet('ไม่มีภาพก่อนออกใบจาก cert-path'); }
            const after = await d.run('applicant', 'planting-options', { p: `${p}-after` });
            const has = (r) => r.options.some((o) => o.includes(S.cert.number) || o.includes(S.site)) || r.text.includes(S.site) || r.text.includes(S.cert.number);
            return !has(before) && has(after) ? ctx.pass(`ก่อนออกใบไม่มี · หลังออกใบมีใบ ${S.cert.number}`) : ctx.fail(`ก่อน ${has(before)} หลัง ${has(after)}`);
        }));
        checks.push(await check('planting-cycle', 'ผู้ยื่นเปิดรอบปลูกใต้ใบรับรองใหม่', async () => {
            const log = await d.run('applicant', 'planting', { p: `${p}-cycle`, certRx: escapeRx(S.cert.number), crop: ctx.cfg.walkApplication.plant, cycle: `รอบเดินตรวจ ${ctx.runId}`, day: todayBkk() });
            const c = log.find((x) => Array.isArray(x) && x[0] === 'cycle');
            const id = c && parse(c[2])?.data?.id;
            if (!c || c[1] !== 201 || !id) { return ctx.fail(`บันทึกรอบปลูก ${c ? c[1] : 'ไม่ได้กด'} ${c ? String(c[2]).slice(0, 200) : JSON.stringify(log).slice(0, 300)}`); }
            S.cycleId = id;
            return ctx.pass(`รอบปลูก ${id.slice(0, 8)} 201`);
        }));
        checks.push(await check('lot', 'เก็บเกี่ยววันนี้แล้วระบบสร้างล็อต', async () => {
            if (!S.cycleId) { return ctx.fail('ไม่มีรอบปลูก'); }
            const log = await d.run('applicant', 'harvest', { p: `${p}-lot`, cycle: S.cycleId, dates: [todayBkk()] });
            const last = log[log.length - 1] || [];
            if (!(last[2] >= 200 && last[2] < 300)) { return ctx.fail(`สร้างล็อต ${last[2]} ${String(last[3]).slice(0, 200)}`); }
            S.lot = lotFrom(last[3]);
            if (!S.lot.lotId) { return ctx.fail(`สร้างล็อต ${last[2]} แต่อ่านรหัสล็อตจากคำตอบไม่ได้: ${String(last[3]).slice(0, 200)}`); }
            return ctx.pass(`ล็อต ${S.lot.lotNumber || S.lot.lotId.slice(0, 8)} ${last[2]}`);
        }));
        checks.push(await check('public-lot-door', 'ประตูที่หน้าผู้ซื้อเรียก GET /api/trace/lot/:id ตอบใบรับรองที่ใช้ได้ โดยไม่มีข้อมูลบุคคล', async () => {
            if (!S.lot?.lotId) { return ctx.fail('ไม่มีล็อต'); }
            const r = await ctx.http('GET', `/api/trace/lot/${encodeURIComponent(S.lot.lotId)}`);
            S.publicPayloads = [...(S.publicPayloads || []), ['trace-lot', r.text]];
            if (r.status !== 200 || !r.text.includes(S.cert.number)) { return ctx.fail(`ตอบ ${r.status} ${r.text.includes(S.cert.number) ? '' : 'ไม่มีเลขใบ'}`); }
            const pii = piiFound(r.text);
            return pii.length ? ctx.fail(`มี ${pii.join(', ')} ในคำตอบสาธารณะ`) : ctx.pass(`200 มีเลขใบ ${S.cert.number}`);
        }));
        checks.push(await check('buyer-page', 'หน้า /trace/lot/:id ที่ QR พาไป แสดงเลขใบรับรอง (เปิดด้วยเบราว์เซอร์ ไม่ล็อกอิน)', async () => {
            if (!S.lot?.lotId) { return ctx.fail('ไม่มีล็อต'); }
            const [shot, lines] = await d.run('anon', 'view', { path: `/trace/lot/${encodeURIComponent(S.lot.lotId)}`, name: `${p}-buyer-page`, grep: escapeRx(S.cert.number), wait: 5000 });
            return lines.includes(S.cert.number) ? ctx.pass(`ภาพ ${shot.split(' ')[0]}.png`) : ctx.fail(`หน้าไม่แสดงเลขใบ (ภาพ ${shot.split(' ')[0]}.png)`);
        }));
        return checks;
    },
};
