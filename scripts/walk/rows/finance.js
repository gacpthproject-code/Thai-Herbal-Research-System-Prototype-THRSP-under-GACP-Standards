'use strict';

const { check } = require('../lib/context');

const listOf = (body, key) => (Array.isArray(body?.data) ? body.data : body?.data?.[key] || []);

module.exports = {
    id: 'finance',
    title: 'การเงิน: ใบเสนอราคา · PromptPay ผ่าน Stripe โหมดทดสอบ · webhook ตัดยอด · ใบเสร็จอัตโนมัติ · ใบลดหนี้/คืนเงิน · หน้ากระทบยอด · สมการเงิน',
    async run(ctx) {
        const S = ctx.state;
        const needWalk = 'ต้องมีคำขอทดสอบจากแถว cert-path ในรอบเดียวกัน';
        const checks = [];
        checks.push(await check('stripe-test-key', 'กุญแจ Stripe ของเครื่องเป็นโหมดทดสอบและเรียก Stripe /v1/balance ได้ (ยิงจากในคอนเทนเนอร์ คืนแค่ HTTP status)', async () => {
            if (!S.stripeGate?.ok) { return ctx.fail('ด่านกุญแจทดสอบไม่ผ่าน'); }
            const k = await ctx.inContainer('stripe-keys', { balance: true });
            if (k.secret !== 'test') { return ctx.fail(`กุญแจลับเป็น ${k.secret} ไม่ใช่ test ไม่ยิง Stripe`); }
            return k.balanceStatus === 200 ? ctx.pass('Stripe โหมดทดสอบ /v1/balance HTTP 200') : ctx.fail(`/v1/balance HTTP ${k.balanceStatus ?? 'เรียกไม่ได้'}`);
        }));
        checks.push(await check('quotation', 'ระบบออกใบเสนอราคาให้คำขอทดสอบ', async () => {
            if (!S.appId) { return ctx.notYet(needWalk); }
            const q = S.quotation;
            return q ? ctx.pass(JSON.stringify(q).match(/QT-[A-Z]+-\d{4}-\d+/)?.[0] || 'มีใบเสนอราคา') : ctx.fail('ไม่พบใบเสนอราคา');
        }));
        checks.push(await check('promptpay-test', 'ชำระทั้งสองงวดด้วย PromptPay ของ Stripe โหมดทดสอบผ่านหน้าจริง', async () => {
            if (!S.appId) { return ctx.notYet(needWalk); }
            return S.paidM1 && S.paidM2 ? ctx.pass('งวด 1 และงวด 2 หน้าเว็บยืนยันการชำระ') : ctx.fail(`งวด 1 ${!!S.paidM1} · งวด 2 ${!!S.paidM2}`);
        }));
        checks.push(await check('webhook-settle-receipt', 'webhook ตัดยอดแล้ว ใบแจ้งหนี้ของคำขอเป็นจ่ายแล้ว มีเลขใบเสร็จ และเปิด PDF ใบเสร็จได้', async () => {
            if (!S.paidM1) { return ctx.notYet(needWalk); }
            const d = await ctx.driver();
            const r = await d.api('applicant', 'GET', '/api/invoices/my');
            const mine = listOf(r.body, 'invoices').filter((i) => i.applicationId === S.appId || JSON.stringify(i).includes(S.appId));
            if (r.status !== 200 || !mine.length) { return ctx.fail(`GET /api/invoices/my ${r.status} ไม่พบใบแจ้งหนี้ของคำขอ`); }
            const res = [];
            for (const inv of mine) {
                const paid = /^paid$/i.test(inv.status) || !!inv.paidAt;
                const pdf = paid ? await d.api('applicant', 'GET', `/api/invoices/my/${inv.id}/receipt/pdf`, undefined, { raw: true }) : null;
                res.push({ n: inv.invoiceNumber || inv.id, paid, receipt: inv.receiptNumber || null, pdf: pdf ? pdf.buf.slice(0, 4).toString() === '%PDF' : false });
            }
            const bad = res.filter((x) => !x.paid || !x.pdf);
            const detail = res.map((x) => `${x.n} ${x.paid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'} ใบเสร็จ ${x.receipt || '-'} PDF ${x.pdf ? 'เปิดได้' : 'ไม่ได้'}`).join(' · ');
            return bad.length || res.length < 2 ? ctx.fail(`${detail}${res.length < 2 ? ' (คาดสองงวด)' : ''}`) : ctx.pass(detail);
        }));
        checks.push(await check('credit-notes-recorded', 'ใบลดหนี้ที่บันทึกไว้บนเครื่องอ่านได้และเปิด PDF ได้ (อ่านอย่างเดียว)', async () => {
            const d = await ctx.driver();
            if (!(await ctx.signIn('finplat')).ok) { return ctx.fail('การเงินบริษัทล็อกอินไม่ได้'); }
            const r = await d.api('finplat', 'GET', '/api/finance/credit-notes');
            const list = listOf(r.body, 'creditNotes');
            if (r.status !== 200) { return ctx.fail(`GET /api/finance/credit-notes ${r.status}`); }
            if (!list.length) { return ctx.notYet('บนเครื่องนี้ยังไม่มีใบลดหนี้ให้อ่าน'); }
            const pdf = await d.api('finplat', 'GET', `/api/finance/credit-notes/${list[0].id}/pdf`, undefined, { raw: true });
            return pdf.buf.slice(0, 4).toString() === '%PDF' ? ctx.pass(`${list.length} ใบ · ${list[0].creditNoteNumber || list[0].number || list[0].id} เปิด PDF ได้`) : ctx.fail(`PDF ตอบ ${pdf.status}`);
        }));
        checks.push({ id: 'refund-this-run', title: 'บันทึกคืนเงินใหม่ในรอบนี้', status: 'NOT-YET',
            detail: 'ยังไม่มี probe: คืนเงินแบบบริษัทยกเลิก (PROVIDER_CANCELLED) ปิดคำขอ จึงต้องมีคำขอทดสอบที่สอง ซึ่งเกินกติกาหนึ่งคำขอต่อรอบ · แบบเก็บซ้ำ (DUPLICATE) ต้องมีการจ่ายเกินจริงก่อน' });
        checks.push(await check('reconciliation-page', 'การเงินบริษัทเปิดหน้ากระทบยอด /provider/accounting แท็บออกใบเสร็จแล้ว และเห็นรายการ', async () => {
            const d = await ctx.driver();
            if (!(await ctx.signIn('finplat')).ok) { return ctx.fail('การเงินบริษัทล็อกอินไม่ได้'); }
            const [rows, , url] = await d.run('finplat', 'fin', { tag: `walk-${ctx.runId}-fin` });
            return rows > 0 ? ctx.pass(`${url} ${rows} แถว`) : ctx.fail(`${url} ไม่มีแถว`);
        }));
        let counts;
        const countCheck = (key, zero, many) => async () => {
            counts = counts || await ctx.inContainer('money-counts');
            const r = counts[key];
            if (!Number.isInteger(r?.count)) { return ctx.fail(`นับไม่ได้ (${r?.error ?? 'ไม่มีผล'})`); }
            return r.count === 0 ? ctx.pass(zero) : ctx.fail(`${r.count} ${many}`);
        };
        checks.push(await check('money-equation', 'ทุกแถว checkout_orders: gross = net + vat และ total = gross ยกเว้น CANCELLED (SQL เดียวกับ scripts/probes/money-equation.sh รันในคอนเทนเนอร์)',
            countCheck('moneyEquation', '0 แถวผิดสมการเงิน', 'แถว checkout_orders ผิด gross = net + vat หรือ total = gross')));
        checks.push(await check('quotation-closure', 'ทุกคำสั่งชำระที่ตัดยอดแล้วปิดงวดบนใบเสนอราคา (SQL เดียวกับ scripts/probes/quotation-closure.sh รันในคอนเทนเนอร์)',
            countCheck('quotationClosure', '0 คำสั่งชำระที่ตัดยอดแล้วค้างงวดบนใบเสนอราคา', 'คำสั่งชำระ SETTLED ที่ใบเสนอราคายังไม่ปิดงวด')));
        return checks;
    },
};
