/**
 * checkout-terms-are-v1-3.test.tsx — the disclosure above the tick is v1.3.
 *
 * Operator 2026-10-06 ("งั้นก็ต้องแก้เอกสารให้ตรง"): docs/legal/payment-terms-th-v1.3.md
 * replaces v1.2 for new acceptances, and the backend records every new grant
 * as payment-terms-th-v1.3. v1.3 changes only the refund rules (§7, §10), and
 * every one of them must be on this screen before the applicant ticks (owner
 * ruling 2026-07-08: disclosure before payment). v1.2's refund promises, which
 * no longer hold, must not appear. The §2.5 and §2.6 lines and the §3.4 price
 * binding are unchanged from v1.2.
 *
 * Harness: the createRoot + act pattern of checkout-shows-quotation-and-terms.test.tsx.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { CheckoutResult } from '@/lib/services/checkout-service';
import type { QuotationsBySide } from '@/lib/services/payment-service';
import { HAPPY } from '@/lib/services/__fixtures__/checkout-fixtures';

declare global {

  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockCreateCheckout = jest.fn<(args: unknown) => Promise<CheckoutResult>>();
const mockGetPaymentTermsConsent =
  jest.fn<() => Promise<{ success: boolean; data?: unknown }>>();
const mockAcceptPaymentTerms = jest.fn<() => Promise<{ success: boolean }>>();
const mockGetQuotations = jest.fn<() => Promise<QuotationsBySide | null>>();

jest.mock('@/lib/services/checkout-service', () => {
  const actual = jest.requireActual('@/lib/services/checkout-service') as Record<string, unknown>;
  return { ...actual, createCheckout: (args: unknown) => mockCreateCheckout(args) };
});

jest.mock('@/lib/services/payment-service', () => {
  const actual = jest.requireActual('@/lib/services/payment-service') as {
    PaymentService: Record<string, unknown>;
  };
  return {
    ...actual,
    PaymentService: {
      ...actual.PaymentService,
      getPaymentTermsConsent: () => mockGetPaymentTermsConsent(),
      acceptPaymentTerms: () => mockAcceptPaymentTerms(),
      getQuotations: () => mockGetQuotations(),
    },
  };
});

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => {
  const router = {
    push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(),
    forward: jest.fn(), prefetch: jest.fn(), pathname: '/', query: {},
  };
  return {
    useRouter: () => router,
    usePathname: () => '/health/payments/checkout',
    useSearchParams: () => mockSearchParams,
  };
});

import CheckoutClientView from '../client-view';

async function flushAsync(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('the checkout disclosure summarises payment-terms v1.3', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams({ app: 'app-1', milestone: 'M1' });
    mockCreateCheckout.mockResolvedValue(HAPPY);
    mockGetPaymentTermsConsent.mockResolvedValue({ success: true, data: { consents: {} } });
    mockAcceptPaymentTerms.mockResolvedValue({ success: true });
    mockGetQuotations.mockResolvedValue({ dtam: null, platform: null });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
  });

  async function mountView(): Promise<void> {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(<CheckoutClientView />);
    });
    await flushAsync();
  }

  function termsText(): string {
    const section = container!.querySelector('[data-testid="checkout-terms-section"]');
    expect(section).not.toBeNull();
    return (section!.textContent || '').replace(/\s+/g, ' ');
  }

  it('names the document and its edition: ฉบับที่ 1.3', async () => {
    await mountView();
    const version = container!.querySelector('[data-testid="checkout-terms-version"]');
    expect(version).not.toBeNull();
    expect(version!.textContent).toContain('เงื่อนไขการชำระค่าบริการและการคืนเงิน');
    expect(version!.textContent).toContain('ฉบับที่ 1.3');
    expect(version!.textContent).toContain('7 ตุลาคม 2569');
  });

  it('names every line with the catalogue names the finance documents print', async () => {
    await mountView();
    const text = termsText();
    expect(text).toContain('งวดที่ 1 ค่าบริการตรวจสอบเอกสาร');
    expect(text).toContain('งวดที่ 2 ค่าบริการตรวจประเมินแปลงและออกใบรับรอง');
    expect(text).toContain('ค่าบริการต่ออายุใบรับรอง');
  });

  it('states what each line covers (§2.5)', async () => {
    await mountView();
    const text = termsText();
    expect(text).toContain('รับและตรวจความครบถ้วน ความถูกต้องของเอกสารคำขอตามหลักเกณฑ์ GACP');
    expect(text).toContain('นัดหมายและตรวจประเมินแปลงปลูก ณ สถานที่จริง');
    expect(text).toContain('ตรวจประเมินเพื่อต่ออายุ');
  });

  it('states one fee with no state part, and what it does not include (§2.6)', async () => {
    await mountView();
    expect(termsText()).toContain(
      'ค่าบริการเป็นจำนวนเดียวที่บริษัทเรียกเก็บ ไม่แยกเป็นส่วนของหน่วยงานรัฐ และไม่รวมค่าเดินทาง ค่าที่พัก หรือค่าตอบแทนของผู้ตรวจ',
    );
  });

  it('carries none of the retired v1.1 wording', async () => {
    await mountView();
    const text = termsText();
    expect(text).not.toContain('ค่าธรรมเนียมรัฐ');
    expect(text).not.toContain('ค่าบริการแพลตฟอร์ม');
    expect(text).not.toContain('ล็อกราคา ณ วันยื่นคำขอ');
    // §3.4: the accepted quotation binds every instalment.
    expect(text).toContain('ราคาตามใบเสนอราคานั้นผูกพันทุกงวดของคำขอนี้จนชำระครบ');
  });

  it('shows every refund case of §7 with its outcome, and the closed list of company/state reasons', async () => {
    await mountView();
    const text = termsText();
    expect(text).toContain('ค่าบริการที่ชำระแล้วไม่อยู่ในเงื่อนไขการคืนเงิน ยกเว้นสองกรณี');
    expect(text).toContain('ขอยกเลิกคำขอเอง: คำขอถูกยกเลิก ไม่คืนเงิน ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจากบริษัทเริ่มเตรียมการให้บริการตั้งแต่ได้รับชำระค่าบริการ สิ่งที่ต้องทำ: ไม่ต้องดำเนินการเพิ่ม');
    expect(text).toContain('บริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการ: บริษัทขออภัยในความไม่สะดวก คำขอถูกปิดเป็นยกเลิก คืนเงินเต็มจำนวนเฉพาะงวดที่ยังไม่ได้เริ่มดำเนินการตรวจ พร้อมออกใบลดหนี้ สิ่งที่ต้องทำ: แจ้งข้อมูลบัญชีสำหรับรับเงินคืน');
    expect(text).toContain('คำขอถูกยกเลิกเพราะความผิดพลาดของระบบ: บริษัทขออภัยและคืนสถานะคำขอให้ดำเนินการต่อในคำขอเดิม ไม่คืนเงิน ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจาก');
    expect(text).toContain('ระบบเรียกเก็บเงินซ้ำหรือเกิน: สถานะคำขอไม่เปลี่ยน และงวดนั้นยังถือว่าชำระแล้ว คืนเงินเฉพาะส่วนที่เก็บซ้ำหรือเกิน');
    expect(text).toContain('กรณีอื่น เช่น ผลการตรวจไม่ผ่าน');
    const cases = container!.querySelectorAll('[data-testid="checkout-terms-refund"] ul li');
    expect(cases).toHaveLength(4);
    const reasons = container!.querySelectorAll('[data-testid="checkout-terms-refund"] ol li');
    expect(reasons).toHaveLength(4);
    expect(text).toContain('ภายใน 15 วันทำการ');
  });

  it('carries none of the v1.2 refund promises that v1.3 withdrew', async () => {
    await mountView();
    const text = termsText();
    expect(text).not.toContain('บริษัทคืนค่าบริการของงวดนั้น');
    expect(text).not.toContain('มีสิทธิ์ได้รับเงินคืนหรือการเยียวยา');
    expect(text).not.toContain('เริ่มดำเนินการตรวจแล้ว ไม่สามารถขอคืนได้');
    expect(text).not.toContain('เงินที่เก็บซ้ำหรือเก็บผิดพลาดมีสิทธิ์ได้รับคืน');
    expect(text).not.toMatch(/stripe|webhook/i);
  });

  it('an applicant whose grant is v1.2 is shown the box again, not "already accepted"', async () => {
    mockGetPaymentTermsConsent.mockResolvedValue({
      success: true,
      data: {
        consents: {
          PAYMENT_TERMS: {
            granted: true,
            version: 'payment-terms-th-v1.2',
            currentVersion: 'payment-terms-th-v1.3',
          },
        },
      },
    });
    await mountView();
    expect(container!.querySelector('[data-testid="checkout-terms-checkbox"]')).not.toBeNull();
    expect(container!.querySelector('[data-testid="checkout-terms-recorded"]')).toBeNull();
  });
});
