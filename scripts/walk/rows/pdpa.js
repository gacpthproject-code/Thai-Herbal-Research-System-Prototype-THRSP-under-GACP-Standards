'use strict';

const { check } = require('../lib/context');
const { piiFound } = require('../lib/mask');

module.exports = {
    id: 'pdpa',
    title: 'PDPA: ประกาศความเป็นส่วนตัว · บันทึกความยินยอม · ประตูสาธารณะไม่มีข้อมูลบุคคล · สิทธิ์ลบข้อมูล',
    async run(ctx) {
        const S = ctx.state;
        return [
            await check('privacy-notice', 'ประกาศความเป็นส่วนตัวเปิดอ่านได้โดยไม่ล็อกอิน ทั้งประตูข้อมูลและหน้าที่ประตูชี้ไป', async () => {
                const r = await ctx.http('GET', '/api/consent/document/PRIVACY_POLICY');
                const url = r.json?.data?.url;
                if (r.status !== 200 || !url) { return ctx.fail(`/api/consent/document/PRIVACY_POLICY ตอบ ${r.status}`); }
                const page = await ctx.http('GET', url);
                return page.status === 200 ? ctx.pass(`ประตู 200 ชี้ ${url} ตอบ 200`) : ctx.fail(`ประตูชี้ ${url} แต่หน้านั้นตอบ ${page.status}`);
            }),
            await check('consent-record', 'ความยินยอมของผู้ยื่นอ่านได้เฉพาะเจ้าของ', async () => {
                const anon = await ctx.http('GET', '/api/consent');
                const d = await ctx.driver();
                if (!(await ctx.signIn('applicant')).ok) { return ctx.fail('ผู้ยื่นล็อกอินไม่ได้'); }
                const own = await d.api('applicant', 'GET', '/api/consent');
                const ok = [401, 403].includes(anon.status) && own.status === 200;
                return ok ? ctx.pass(`ไม่ล็อกอิน ${anon.status} · เจ้าของ 200`) : ctx.fail(`ไม่ล็อกอิน ${anon.status} · เจ้าของ ${own.status}`);
            }),
            await check('public-payloads', 'คำตอบของประตูสาธารณะในรอบนี้ (ตรวจใบ ล็อต) ไม่มีเลข 13 หลัก เบอร์ หรืออีเมล', async () => {
                const payloads = S.publicPayloads || [];
                if (!payloads.length) { return ctx.notYet('ไม่มีคำตอบสาธารณะในรอบนี้ (ต้องเดิน cert-path, verify, tnt)'); }
                const hits = payloads.map(([n, t]) => [n, piiFound(t)]).filter(([, h]) => h.length);
                return hits.length ? ctx.fail(hits.map(([n, h]) => `${n}: ${h.join(',')}`).join(' · ')) : ctx.pass(payloads.map(([n]) => n).join(', '));
            }),
            await check('erasure', 'คำขอลบข้อมูล (สิทธิ์ตาม PDPA) เดินจริงบนเครื่องที่ deploy', async () => ctx.notYet('ยังไม่มี probe: ต้องมีบัญชีผู้ยื่นแบบใช้แล้วทิ้งต่อรอบ เพราะการลบจะลบบัญชีเดินตรวจ · ตอนนี้พิสูจน์ด้วยเทสต์ pdpa-erasure-* บน Postgres ชั่วคราวเท่านั้น')),
        ];
    },
};
