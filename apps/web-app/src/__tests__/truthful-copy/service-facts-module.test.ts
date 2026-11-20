/**
 * constants/service-facts.ts is the one place web copy takes its statements
 * about the payee, the payment rail, the refund rule and
 * what the platform is (operator decision 6, 2026-09-17). This file pins the
 * module to the records it names; the pages that read it are pinned by the
 * sibling suites.
 */

import { describe, expect, it } from '@jest/globals';

import * as facts from '@/constants/service-facts';

import {
    backendCheckoutPaymentMethods,
    backendRenewalReminderDays,
    paymentTermsDocument,
} from './backend-record';

const COPY = Object.entries(facts).filter(
    (entry): entry is [string, string | ReadonlyArray<string>] =>
        typeof entry[1] === 'string' || (Array.isArray(entry[1]) && entry[1].every((v) => typeof v === 'string')),
);

function allCopy(): string[] {
    const cells = facts.REFUND_CASES.flatMap((c) => [c.situation, c.application, c.refund, c.nextStep]);
    return [...COPY.flatMap(([, v]) => (typeof v === 'string' ? [v] : [...v])), ...cells];
}

describe('service facts', () => {
    it('reminder days are the backend values', () => {
        expect([...facts.GACP_RENEWAL_REMINDER_DAYS]).toEqual(backendRenewalReminderDays());
    });

    it('states no certificate term: the term is dated data served by the backend', () => {
        for (const line of allCopy()) {
            expect(line).not.toMatch(/มีอายุ\s*\d/);
        }
        expect(Object.keys(facts).filter((k) => /VALIDITY/.test(k))).toEqual([]);
    });

    it('the channel sentence names what the checkout offers and refuses what it does not', () => {
        // A name per method, not a second list of what is offered: the offered
        // list is the backend's CHECKOUT_PAYMENT_METHOD_TYPES.
        const METHOD_NAME_TH: Record<string, string> = { promptpay: 'พร้อมเพย์', card: 'บัตร' };
        const methods = backendCheckoutPaymentMethods();
        expect(methods.length).toBeGreaterThan(0);
        for (const m of methods) {
            expect(Object.keys(METHOD_NAME_TH)).toContain(m);
            expect(facts.PAYMENT_CHANNEL_TH).toContain(METHOD_NAME_TH[m]);
        }
        for (const [m, name] of Object.entries(METHOD_NAME_TH)) {
            if (!methods.includes(m)) expect(facts.PAYMENT_CHANNEL_TH).toContain(`ไม่รับ${name}`);
        }
        // Operator ruling 2026-09-27: the payment provider is not named in any user-facing text.
        expect(facts.PAYMENT_CHANNEL_TH).not.toMatch(/stripe/i);
        expect(facts.PAYMENT_CHANNEL_TH).toContain('ผู้ให้บริการรับชำระเงิน');
        for (const [name, value] of Object.entries(facts)) {
            if (typeof value === 'string') expect(`${name}: ${/stripe/i.test(value)}`).toBe(`${name}: false`);
        }
        expect(facts.PAYMENT_CHANNEL_TH).toContain('ไม่รับโอน');
    });

    it('the payee is the one issuer of payment-terms v1.3 §1', () => {
        expect(paymentTermsDocument()).toContain('ผู้ให้บริการและผู้รับชำระเงินตามเงื่อนไขนี้มีเพียงรายเดียว');
        expect(facts.PAYEE_TH).toBe('บริษัทผู้ให้บริการแพลตฟอร์ม');
        expect(facts.PAYEE_STATEMENT_TH).toContain(facts.PAYEE_TH);
    });

    it('every refund row, reason and line is text payment-terms v1.3 §7 states', () => {
        const raw = paymentTermsDocument().replace(/<!--[\s\S]*?-->/g, '').replace(/\*\*/g, '');
        const s7 = (raw.match(/^## 7\. [\s\S]*?(?=^## )/m) || [''])[0];
        const rows = s7.split('\n').filter((l) => /^\| /.test(l)).slice(1)
            .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
        expect(facts.REFUND_CASES.map((c) => [c.situation, c.application, c.refund, c.nextStep])).toEqual(rows);

        const clause = (n: string) => s7.search(new RegExp(`^${n.replace(/\./g, '\\.')} `, 'm'));
        const reasons = s7.slice(clause('7.2.1'), clause('7.2.2')).split('\n')
            .filter((l) => /^- \(/.test(l)).map((l) => l.replace(/^- \([ก-ฮ]\) /, ''));
        expect(facts.PROVIDER_CANCEL_REASONS_TH).toEqual(reasons);

        const flat = s7.replace(/\s+/g, ' ');
        expect(flat.replace(/ตามข้อ 7\.[23]/g, '')).toContain(facts.REFUND_SUMMARY_TH);
        expect(flat).toContain(`${facts.REFUND_OTHER_CASES_TH}ตามข้อ 7.1`);
        expect(flat).toContain('ภายใน 15 วันทำการ นับจากวันที่บริษัทอนุมัติการคืนเงินและได้รับข้อมูลบัญชีสำหรับรับเงินคืนจากท่านครบถ้วน');
        expect(facts.REFUND_TRANSFER_TH).toContain('ภายใน 15 วันทำการ นับจากวันที่อนุมัติการคืนเงินและได้รับข้อมูลบัญชีครบถ้วน');
        expect(facts.REFUND_TRANSFER_TH).toContain('ใบลดหนี้');
        for (const own of ['เอกสาร', 'ผลการตรวจไม่ผ่าน', 'พ้นกำหนดแก้ไข', 'ขอเลื่อนการตรวจ']) {
            expect(s7.slice(clause('7.2.2'), clause('7.2.3'))).toContain(own === 'ผลการตรวจไม่ผ่าน' ? 'ไม่ผ่าน' : own);
            expect(facts.PROVIDER_CANCEL_EXCLUDES_TH).toContain(own);
        }

        // The v1.2 promises v1.3 withdrew (operator 2026-10-06) are gone from every line.
        const all = [...facts.REFUND_POLICY_TH, facts.REFUND_REQUEST_TH, facts.REFUND_PAID_FEE_TH].join(' ');
        expect(all).not.toContain('บริษัทคืนค่าบริการของงวดนั้น');
        expect(all).not.toContain('มีสิทธิ์ได้รับเงินคืนหรือการเยียวยา');
        expect(all).not.toContain('ไม่คืนเงินเมื่อเอกสารถูกส่งเข้าสู่การตรวจแล้ว');

        // §7.4 + §11.1: the support address is the door for a duplicate charge.
        expect(raw).toContain('support@gacpth.com');
        expect(facts.REFUND_REQUEST_TH).toContain('support@gacpth.com');
        expect(facts.REFUND_REQUEST_TH).not.toContain('เจ้าหน้าที่ผู้ตรวจที่รับผิดชอบคำขอ');
    });

    it('makes no claim the records do not support', () => {
        const text = allCopy().join('\n');
        expect(text).not.toContain('17065');
        expect(text).not.toContain('เว็บไซต์ของรัฐบาล');
        expect(text).not.toContain('รับรองโดย');
        // DOCUMENT_REVISION_DEADLINE_TH (one-fee residue sweep 2026-09-26) is the one
        // "วันทำการ" claim this module backs — PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS
        // (frontend-service-facts-mirror.test.js). Every OTHER "วันทำการ" mention is
        // still an unsupported timetable claim. The on-site correction window is
        // counted in calendar days (order 56(2a)), so it never says วันทำการ.
        expect(facts.DOCUMENT_REVISION_DEADLINE_TH).toMatch(/วันทำการ/);
        expect(facts.ONSITE_CORRECTION_DEADLINE_TH).not.toMatch(/วันทำการ/);
        // The refund transfer timetable is the payment terms' own (v1.3 §7.4),
        // so each "N วันทำการ" left must be printed there.
        const withoutCarDeadline = text.split(facts.DOCUMENT_REVISION_DEADLINE_TH).join('');
        const terms = paymentTermsDocument().replace(/\s+/g, ' ');
        for (const m of withoutCarDeadline.matchAll(/(ภายใน \d+ วันทำการ)/g)) {
            expect(terms).toContain(m[1]);
        }
        expect(withoutCarDeadline.replace(/ภายใน \d+ วันทำการ/g, '')).not.toMatch(/วันทำการ/);
    });

    it('speaks of one ค่าบริการ: no state fee inside the price, no remittance by the company (operator 2026-09-11)', () => {
        // The first port of this module (2026-09-17) said the price held the
        // department's fee and that the company remitted it. The one-fee ruling
        // retired the split (constants/fees.ts header); what the company pays
        // the department is outside this system (payment-terms v1.2 §2.6).
        const text = allCopy().join('\n');
        expect(text).not.toContain('ค่าธรรมเนียมรัฐ');
        expect(text).not.toContain('ค่าบริการแพลตฟอร์ม');
        expect(text).not.toContain('นำส่ง');
        expect(facts.PAYEE_STATEMENT_TH).toContain('ไม่มียอดใดที่ต้องชำระแยก');
    });

    it('calls the one charge ค่าบริการ (operator 2026-09-11 "จะเป็นค่าบริการทั้งหมด")', () => {
        // "ค่าธรรมเนียม" may appear only inside the accepted document's proper name.
        const DOC_NAME = 'เงื่อนไขการชำระค่าธรรมเนียมและการคืนเงิน';
        for (const line of allCopy()) {
            expect(line.split(DOC_NAME).join('')).not.toContain('ค่าธรรมเนียม');
        }
    });

    it('reads as plain Thai UI copy (thai-ui-copy: no em dash, no ท่าน outside legal text)', () => {
        for (const line of allCopy()) {
            expect(line).not.toContain('—');
            expect(line).not.toContain('ท่าน');
        }
    });
});
