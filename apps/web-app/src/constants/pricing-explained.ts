/**
 * Where the money goes — the split behind each fee, for the public pricing page.
 *
 * Operator order 38 (2026-10-07): the page explains each ค่าบริการ as the
 * department's inspection fee plus the platform's service fee. This is WEB TEXT
 * ONLY. Quotations, invoices, tax invoices and checkout still bill one ค่าบริการ
 * in the company's name; nothing here reaches them.
 *
 * This is the one place the split is written down, as dated data. It is not a
 * price list: the amounts a farmer pays are the served ones (GET /api/pricing/fees).
 * explainFees() returns the split only when it adds up to the served fee on every
 * line; otherwise the page falls back to the served totals with no split, so a
 * fee that changes in the fee engine can never leave a stale explanation on screen.
 * src/__tests__/pricing-explained.test.tsx also pins these sums to the backend's
 * FEE_DEFAULTS, so the suite turns red the day they diverge.
 *
 * VAT is never typed here: it is the served total minus the served ค่าบริการ.
 */

import type { PublicFees } from '@/lib/pricing/public-fees';

/** The date this split takes effect (operator ruling 2026-10-07). */
export const PRICING_SPLIT_EFFECTIVE_FROM = '2026-10-07';

/** The agency whose inspection fee is the first part of each line. */
export const PRICING_SPLIT_AGENCY_TH = 'กรมการแพทย์แผนไทยและการแพทย์ทางเลือก';

export interface FeeSplit {
  /** ค่าตรวจรับรองของหน่วยงาน, THB before VAT */
  agency: number;
  /** ค่าบริการแพลตฟอร์ม, THB before VAT */
  platform: number;
}

export const PRICING_SPLIT = {
  effectiveFrom: PRICING_SPLIT_EFFECTIVE_FROM,
  phase1: { agency: 5000, platform: 500 },
  phase2: { agency: 25000, platform: 2500 },
  renewal: { agency: 30000, platform: 3000 },
} as const;

export interface ExplainedLine {
  agency: number;
  platform: number;
  /** agency + platform: the served ค่าบริการ */
  serviceFee: number;
  vat: number;
  total: number;
}

export interface ExplainedFees {
  phase1: ExplainedLine;
  phase2: ExplainedLine;
  renewal: ExplainedLine;
  /** phase 1 + phase 2, VAT included: the price of a new application per scope */
  newApplicationTotal: number;
}

function line(split: FeeSplit, servedFee: number, servedTotal: number): ExplainedLine | null {
  const serviceFee = split.agency + split.platform;
  if (serviceFee !== servedFee || servedTotal < servedFee) return null;
  return { ...split, serviceFee, vat: servedTotal - servedFee, total: servedTotal };
}

/** The split of the served fees, or null when it does not add up to them. */
export function explainFees(fees: PublicFees | null): ExplainedFees | null {
  if (!fees) return null;
  const phase1 = line(PRICING_SPLIT.phase1, fees.applicationFee, fees.phase1TotalPerScope);
  const phase2 = line(PRICING_SPLIT.phase2, fees.inspectionFee, fees.phase2TotalPerScope);
  const renewal = line(PRICING_SPLIT.renewal, fees.renewalFee, fees.renewalTotalPerScope);
  if (!phase1 || !phase2 || !renewal) return null;
  return { phase1, phase2, renewal, newApplicationTotal: phase1.total + phase2.total };
}
