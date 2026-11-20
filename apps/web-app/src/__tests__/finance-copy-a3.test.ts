/**
 * Finance copy from the live walk 2026-10-07:
 *   F6   the quotation said งวดที่ 2 is paid after the on-site assessment; terms v1.3 §5.4
 *        and the pricing page say after the documents pass, before the farm inspection.
 *   F10  the journal page said approval is "ADMIN เท่านั้น"; order 29: a second company
 *        finance officer approves, the DTAM admin writes nothing.
 *   F11  the first accounting tab was "รอยืนยัน", as if someone confirmed payments; nobody
 *        does (order 9): those rows are paid with no receipt yet.
 * FINANCE_COPY_ROOT points the suite at another tree (the RED run reads main's files).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { MILESTONE_PAY_WHEN_TH } from '@/constants/service-facts';

const ROOT = process.env.FINANCE_COPY_ROOT || resolve(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const WEB = 'apps/web-app/src';

describe('F6: the quotation and the pricing page say when งวดที่ 2 is paid in the same words', () => {
    const quotation = read(`${WEB}/components/payments/QuotationReviewSection.tsx`);

    it('the M2 timing follows terms §5.4: after the documents pass, before the inspection', () => {
        expect(MILESTONE_PAY_WHEN_TH.M2).toContain('เอกสารผ่านการตรวจ');
        expect(MILESTONE_PAY_WHEN_TH.M2).toContain('ก่อนวันตรวจประเมินแปลง');
    });

    it('the quotation takes both timings from the shared facts, not words of its own', () => {
        expect(quotation).not.toContain('ผ่านการตรวจประเมินหน้างาน');
        expect(quotation).toContain('MILESTONE_PAY_WHEN_TH.M1');
        expect(quotation).toContain('MILESTONE_PAY_WHEN_TH.M2');
    });
});

describe('F11: the accounting tab does not suggest anyone confirms a payment', () => {
    const dashboard = read(`${WEB}/app/provider/accounting/accounting-dashboard-client.tsx`);

    it('no "รอยืนยัน" label; the tab says paid without a receipt', () => {
        expect(dashboard).not.toContain('รอยืนยัน');
        expect(dashboard).toContain("label: 'ชำระแล้ว ยังไม่มีใบเสร็จ'");
    });
});
