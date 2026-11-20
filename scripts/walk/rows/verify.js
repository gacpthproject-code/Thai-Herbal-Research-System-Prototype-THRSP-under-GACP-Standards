'use strict';

const { check } = require('../lib/context');
const { piiFound } = require('../lib/mask');

const door = (n) => `/api/v1/public/verify/${encodeURIComponent(n.replace('/', '-'))}`;

module.exports = {
    id: 'verify',
    title: 'ตรวจสอบใบรับรองสาธารณะ',
    async run(ctx) {
        const S = ctx.state;
        return [
            await check('unknown-number', 'เลขที่ไม่มีอยู่ได้ NOT_FOUND', async () => {
                const r = await ctx.http('GET', door(`9${Date.now() % 100000}/2500`));
                return r.status === 200 && r.json?.valid === false && r.json?.data?.reasonCode === 'NOT_FOUND' ? ctx.pass('valid=false NOT_FOUND') : ctx.fail(`ตอบ ${r.status} ${r.text.slice(0, 160)}`);
            }),
            await check('new-certificate', 'ใบที่ออกในรอบนี้ตรวจแล้วใช้ได้ ลายเซ็นถูก และไม่มีข้อมูลบุคคล', async () => {
                if (!S.cert) { return ctx.notYet('ต้องมีใบรับรองจากแถว cert-path ในรอบเดียวกัน'); }
                const r = await ctx.http('GET', door(S.cert.number));
                S.publicPayloads = [...(S.publicPayloads || []), ['verify', r.text]];
                const ok = r.status === 200 && r.json?.valid === true && r.json?.data?.signatureValid === true && r.json?.data?.certificateNumber === S.cert.number;
                if (!ok) { return ctx.fail(`ตอบ ${r.status} valid=${r.json?.valid} signature=${r.json?.data?.signatureValid}`); }
                const pii = piiFound(r.text);
                return pii.length ? ctx.fail(`มี ${pii.join(', ')} ในคำตอบสาธารณะ`) : ctx.pass(`${S.cert.number} valid · integrity ${r.json.data.integrity}`);
            }),
            await check('verify-page', 'หน้า /verify/<เลข> ที่ QR บนใบพาไปแสดงว่าใช้ได้ (เบราว์เซอร์ ไม่ล็อกอิน)', async () => {
                if (!S.cert) { return ctx.notYet('ต้องมีใบรับรองจากแถว cert-path ในรอบเดียวกัน'); }
                const d = await ctx.driver();
                const [shot, lines] = await d.run('anon', 'view', { path: `/verify/${S.cert.number.replace('/', '-')}`, name: `walk-${ctx.runId}-verify-page`, grep: 'ใช้ได้|ไม่พบ|หมดอายุ|เพิกถอน', wait: 5000 });
                return /ใช้ได้/.test(lines) && !/ไม่พบ/.test(lines) ? ctx.pass(`ภาพ ${shot.split(' ')[0]}.png`) : ctx.fail(`หน้าแสดง: ${lines.slice(0, 160)}`);
            }),
        ];
    },
};
