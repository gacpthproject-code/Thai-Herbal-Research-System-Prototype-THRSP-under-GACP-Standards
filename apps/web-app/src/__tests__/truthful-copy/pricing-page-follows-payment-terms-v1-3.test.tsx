/**
 * The public price list states what payment-terms v1.3 states (operator
 * 2026-10-06, effective 7 ตุลาคม 2569; v1.2 2026-10-03 set the names and coverage).
 *
 * Before: its refund section said it summarised "เงื่อนไขการชำระค่าธรรมเนียมและ
 * การคืนเงิน" (the v1.1 title), its rows used names no finance document prints
 * ("งวดที่ 1 · ค่าตรวจเอกสาร", "งวดที่ 2 ค่าตรวจประเมินภาคสนาม"), and the phase-2
 * row said the price covered "ค่าตอบแทนคณะผู้ตรวจ ค่าเดินทาง และค่าที่พัก
 * เจ้าหน้าที่ตรวจ" — the exact items v1.2 §2.6 says the price does NOT include.
 * Names and coverage now come from the catalogue (fix/fee-line-descriptions).
 */

import type * as React from 'react';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import PricingPage from '@/app/(marketing)/pricing/page';
import type { PublicFees } from '@/lib/pricing/public-fees';

const SERVED: PublicFees = {
    applicationFee: 6_000,
    inspectionFee: 30_000,
    renewalFee: 40_000,
    renewalTotalPerScope: 42_800,
    phase1TotalPerScope: 6_420,
    phase2TotalPerScope: 32_100,
    vatRate: 0.07,
};

async function pricingText(): Promise<string> {
    (globalThis as { fetch?: unknown }).fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: SERVED }),
    });
    const html = renderToStaticMarkup((await (PricingPage as () => Promise<unknown>)()) as React.ReactElement);
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').replace(/\s+/g, ' ');
}

describe('pricing page follows payment-terms v1.3', () => {
    let text = '';
    beforeAll(async () => {
        text = await pricingText();
    });

    it('says its refund section summarises v1.3 by its own title and edition', () => {
        expect(text).toContain('สรุปจากเงื่อนไขการชำระค่าบริการและการคืนเงิน ฉบับที่ 1.3');
        expect(text).not.toContain('เงื่อนไขการชำระค่าธรรมเนียมและการคืนเงิน');
    });

    it('names the rows with the catalogue the quotation, invoice and receipt print', () => {
        expect(text).toContain('งวดที่ 1 ค่าบริการตรวจสอบเอกสาร');
        expect(text).toContain('งวดที่ 2 ค่าบริการตรวจประเมินแปลงและออกใบรับรอง');
        expect(text).toContain('ค่าบริการต่ออายุใบรับรอง');
    });

    it('states what each row covers as §2.5 does (the catalogue words)', () => {
        expect(text).toContain('รับและตรวจความครบถ้วน ความถูกต้องของเอกสารคำขอตามหลักเกณฑ์ GACP');
        expect(text).toContain('นัดหมายและตรวจประเมินแปลงปลูก ณ สถานที่จริง');
        expect(text).toContain('ตรวจประเมินเพื่อต่ออายุ');
        // §2.6 (no travel/lodging/inspector pay) is shown on the checkout disclosure, not
        // here: pricing-names-from-server.test.tsx (fix/fee-line-descriptions) forbids
        // those words anywhere on this page, the negative sentence included.
    });

    it('no longer claims the price covers inspector pay, travel or lodging', () => {
        expect(text).not.toContain('ค่าตอบแทนคณะผู้ตรวจ ค่าเดินทาง และค่าที่พักเจ้าหน้าที่ตรวจ');
    });

    it('gives the v1.3 refund door and every §7 case, and no longer promises the v1.2 §7.2 (ง) refund', () => {
        expect(text).toContain('support@gacpth.com');
        expect(text).toContain('ขอยกเลิกคำขอเอง');
        expect(text).toContain('เงินคืน: ไม่คืนเงิน ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจากบริษัทเริ่มเตรียมการให้บริการตั้งแต่ได้รับชำระค่าบริการ');
        expect(text).toContain('ผลต่อคำขอ: บริษัทขออภัยในความไม่สะดวก คำขอถูกปิดเป็นยกเลิก');
        expect(text).toContain('กรณีอื่น เช่น ผลการตรวจไม่ผ่าน');
        expect(text).toContain('เงินคืน: คืนเงินเต็มจำนวนเฉพาะงวดที่ยังไม่ได้เริ่มดำเนินการตรวจ พร้อมออกใบลดหนี้');
        expect(text).toContain('เงินคืน: คืนเงินเฉพาะส่วนที่เก็บซ้ำหรือเกิน');
        expect(text).toContain('เหตุที่นับว่าบริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการมีเพียง');
        expect(text).not.toContain('บริษัทคืนค่าบริการของงวดนั้น');
        expect(text).not.toContain('มีสิทธิ์ได้รับเงินคืนหรือการเยียวยา');
        expect(text).not.toContain('ไม่คืนเงินเมื่อเอกสารถูกส่งเข้าสู่การตรวจแล้ว');
    });
});
