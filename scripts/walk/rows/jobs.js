'use strict';

const { check } = require('../lib/context');

const SWEEP_INTERVAL_HOURS = 1;
const GRACE_HOURS = SWEEP_INTERVAL_HOURS * 2;

module.exports = {
    id: 'jobs',
    title: 'งานที่ระบบรันเอง: ยกเลิกเมื่อพ้นกำหนดแก้ไข · CAR 30 วัน · หมดอายุ · การแจ้งเตือน',
    async run(ctx) {
        const S = ctx.state;
        let effects;
        const read = async () => { effects = effects || await ctx.inContainer('job-effects', { graceHours: GRACE_HOURS }); return effects; };
        const overdue = (status, label) => async () => {
            const e = await read();
            const late = e.overdue.filter((a) => a.status === status);
            if (late.length) { return ctx.fail(`${late.length} คำขอ ${status} เลยกำหนดเกิน ${GRACE_HOURS} ชม. แล้วยังไม่ถูกปิด: ${late.map((a) => a.number).slice(0, 5).join(', ')}`); }
            const waiting = e.waiting[status] || 0;
            if (!waiting && !e.closedBySweep) { return ctx.notYet(`ไม่มีคำขอ ${status} ให้สังเกตบนเครื่องนี้ และยังไม่เคยมีคำขอที่ระบบปิดเอง`); }
            return ctx.pass(`สังเกตสถานะ ไม่ได้กระตุ้น job: ${label} ค้างที่เลยกำหนด 0 · รออยู่ในกำหนด ${waiting} · เคยปิดเอง ${e.closedBySweep}`);
        };
        return [
            await check('db-session-timezone', 'connection ใหม่ของ backend รันใน UTC งานที่เทียบเวลากับ NOW() จึงไม่เงียบหรือคลาด 7 ชั่วโมง (คำสั่งเดียวกับ scripts/probes/db-session-timezone.sh รันในคอนเทนเนอร์)', async () => {
                const r = await ctx.inContainer('db-session-timezone');
                if (r.error) { return ctx.fail(`อ่านไม่ได้ (${r.error})`); }
                return r.timezone === 'UTC' ? ctx.pass('SHOW timezone = UTC') : ctx.fail(`SHOW timezone = ${r.timezone}`);
            }),
            await check('revision-deadline', 'ไม่มีคำขอรอแก้เอกสาร (REVISION_REQUESTED) ที่เลยกำหนดแล้วค้าง (runCorrectionDeadlineSweep dryRun)', overdue('REVISION_REQUESTED', 'รอแก้เอกสาร')),
            await check('car-30-days', 'ไม่มีคำขอรอแก้ข้อบกพร่อง (CAR_PENDING) ที่เลยกำหนด 30 วันแล้วค้าง', overdue('CAR_PENDING', 'รอ CAR')),
            await check('expiry', 'ใบที่เลยวันหมดอายุ ตรวจสาธารณะแล้วไม่ขึ้นว่าใช้ได้', async () => {
                const e = await read();
                if (!e.expiredCerts.length) { return ctx.notYet('บนเครื่องนี้ไม่มีใบที่เลยวันหมดอายุให้สังเกต'); }
                const res = [];
                for (const c of e.expiredCerts) {
                    const r = await ctx.http('GET', `/api/v1/public/verify/${encodeURIComponent(c.number.replace('/', '-'))}`);
                    res.push([c.number, r.json?.valid, r.json?.data?.status]);
                }
                const bad = res.filter(([, v]) => v === true);
                const detail = res.map(([n, v, s]) => `${n} valid=${v} ${s}`).join(' · ');
                return bad.length ? ctx.fail(detail) : ctx.pass(detail);
            }),
            await check('notifications', 'ผู้ยื่นได้รับแจ้งเตือนของคำขอทดสอบตลอดเส้นทาง', async () => {
                if (!S.cert) { return ctx.notYet('ต้องมีคำขอทดสอบที่เดินถึงออกใบจากแถว cert-path ในรอบเดียวกัน'); }
                const d = await ctx.driver();
                const r = await d.api('applicant', 'GET', '/api/notifications?limit=100');
                const list = r.body?.data?.notifications || r.body?.data || [];
                const mine = (Array.isArray(list) ? list : []).filter((n) => JSON.stringify(n).includes(S.appId) || JSON.stringify(n).includes(S.appNumber));
                if (r.status !== 200) { return ctx.fail(`GET /api/notifications ${r.status}`); }
                const types = [...new Set(mine.map((n) => n.type))];
                return mine.length >= 3 ? ctx.pass(`${mine.length} รายการ: ${types.join(', ')}`) : ctx.fail(`มีแค่ ${mine.length} รายการ: ${types.join(', ')}`);
            }),
        ];
    },
};
