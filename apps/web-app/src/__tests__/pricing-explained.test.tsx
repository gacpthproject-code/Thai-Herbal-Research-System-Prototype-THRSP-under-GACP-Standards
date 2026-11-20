/**
 * Order 38 (operator 2026-10-07): the pricing page explains where the money goes.
 * The split is dated web data; the amounts are the served ones. These tests pin
 * that the two cannot drift apart and that the page renders both sections.
 */

import type * as React from 'react';
import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import PricingPage from '@/app/(marketing)/pricing/page';
import {
  PRICING_SPLIT,
  PRICING_SPLIT_EFFECTIVE_FROM,
  explainFees,
} from '@/constants/pricing-explained';
import type { PublicFees } from '@/lib/pricing/public-fees';

// The backend fee engine's defaults: the existing fee constants the web split must equal.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FEE_DEFAULTS, FEES } = require('../../../backend/config/business-rules.js');

const vatRate: number = FEES.VAT_RATE;
const withVat = (fee: number) => Math.round(fee * (1 + vatRate));

const SERVED: PublicFees = {
  applicationFee: FEE_DEFAULTS.PHASE1_PER_SCOPE,
  inspectionFee: FEE_DEFAULTS.PHASE2_PER_SCOPE,
  renewalFee: FEE_DEFAULTS.RENEWAL_PER_SCOPE,
  phase1TotalPerScope: withVat(FEE_DEFAULTS.PHASE1_PER_SCOPE),
  phase2TotalPerScope: withVat(FEE_DEFAULTS.PHASE2_PER_SCOPE),
  renewalTotalPerScope: withVat(FEE_DEFAULTS.RENEWAL_PER_SCOPE),
  vatRate,
};

async function render(fees: PublicFees): Promise<string> {
  (globalThis as { fetch?: unknown }).fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: fees }),
  });
  const html = renderToStaticMarkup((await (PricingPage as () => Promise<unknown>)()) as React.ReactElement);
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ');
}

describe('the dated split equals the existing fee constants', () => {
  it('is dated', () => {
    expect(PRICING_SPLIT_EFFECTIVE_FROM).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each([
    ['phase1', 'PHASE1_PER_SCOPE'],
    ['phase2', 'PHASE2_PER_SCOPE'],
    ['renewal', 'RENEWAL_PER_SCOPE'],
  ] as const)('%s: agency + platform = backend %s', (key, backendKey) => {
    expect(PRICING_SPLIT[key].agency + PRICING_SPLIT[key].platform).toBe(FEE_DEFAULTS[backendKey]);
  });

  it('the sums are consistent end to end', () => {
    const e = explainFees(SERVED);
    expect(e).not.toBeNull();
    if (!e) return;
    expect(e.phase1.agency + e.phase1.platform).toBe(e.phase1.serviceFee);
    expect(e.phase1.serviceFee + e.phase1.vat).toBe(e.phase1.total);
    expect(e.phase2.serviceFee + e.phase2.vat).toBe(e.phase2.total);
    expect(e.renewal.serviceFee + e.renewal.vat).toBe(e.renewal.total);
    expect(e.newApplicationTotal).toBe(e.phase1.total + e.phase2.total);
    expect(e.newApplicationTotal).toBe(e.renewal.total);
  });

  it('refuses to explain fees the split does not add up to', () => {
    expect(explainFees({ ...SERVED, applicationFee: SERVED.applicationFee + 1 })).toBeNull();
    expect(explainFees(null)).toBeNull();
  });
});

describe('the pricing page explains where the money goes', () => {
  it('renders the summary, both sections and the footer', async () => {
    const text = await render(SERVED);
    const e = explainFees(SERVED)!;
    const fmt = (n: number) => n.toLocaleString('th-TH');
    expect(text).toContain(`ยื่นขอใหม่ 1 ขอบเขตการปลูก รวม ${fmt(e.newApplicationTotal)} บาท`);
    expect(text).toContain('ชำระครั้งเดียวให้บริษัท ไม่ต้องจ่ายแยกให้หน่วยงานใด');
    expect(text).toContain('ยื่นขอใหม่ (ชำระ 2 งวด)');
    expect(text).toContain('ต่ออายุใบรับรอง (ชำระครั้งเดียว)');
    expect(text).toContain('รวมค่าบริการ');
    for (const n of [e.phase1.serviceFee, e.phase2.serviceFee, e.renewal.serviceFee]) {
      expect(text).toContain(`${fmt(n)} บาท`);
    }
    for (const n of [e.phase1.agency, e.phase1.platform, e.phase1.vat, e.phase1.total,
      e.phase2.agency, e.phase2.platform, e.phase2.vat, e.phase2.total,
      e.renewal.agency, e.renewal.platform, e.renewal.vat, e.renewal.total]) {
      expect(text).toContain(`${fmt(n)} บาท`);
    }
    expect(text).toContain('ค่าตรวจรับรองของกรมการแพทย์แผนไทยและการแพทย์ทางเลือก');
    expect(text).toContain('สิ่งที่ได้รับ');
    expect(text).toContain('ใบรับรองที่หมดอายุแล้วต้องยื่นคำขอใหม่');
    expect(text).toContain('ภาษีมูลค่าเพิ่ม 7% คิดจากค่าบริการทั้งจำนวน');
    expect(text).toContain('ฉบับที่ 1.3');
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('has accessible headings: one h1, sections named by h2', async () => {
    (globalThis as { fetch?: unknown }).fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: SERVED }) });
    const html = renderToStaticMarkup((await (PricingPage as () => Promise<unknown>)()) as React.ReactElement);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('id="new-application-title"');
    expect(html).toContain('id="renewal-title"');
  });

  it('shows no split when the served fees differ from it', async () => {
    const text = await render({ ...SERVED, applicationFee: 6_000, phase1TotalPerScope: 6_420 });
    expect(text).not.toContain('ค่าตรวจรับรองของกรมการแพทย์แผนไทยและการแพทย์ทางเลือก');
  });
});
