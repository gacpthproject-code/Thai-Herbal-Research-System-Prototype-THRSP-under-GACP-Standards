import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Envelope = { success: boolean; data?: unknown; error?: string };

const mockApiGet = jest.fn<(path: string) => Promise<Envelope>>();

jest.mock('@/lib/api/api-client', () => {
  const api = {
    get: (path: string) => mockApiGet(path),
    post: jest.fn(),
    getBlob: jest.fn(),
  };
  return { api, apiClient: api };
});

jest.mock('@/lib/services/payment-service', () => {
  const actual = jest.requireActual('@/lib/services/payment-service') as {
    PaymentService: Record<string, unknown>;
  };
  return {
    ...actual,
    PaymentService: {
      ...actual.PaymentService,
      downloadInvoicePdf: jest.fn(),
    },
  };
});

jest.mock('@/lib/services/auth-service', () => ({
  AuthService: {
    getUser: () => ({ id: 'user-1', role: 'HEALTH', email: 'farmer@test' }),
    getToken: () => 'test-token',
  },
}));

jest.mock('@/components/payments/RefundVisibilitySection', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/payments/QuotationReviewSection', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('next/navigation', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/',
    query: {},
  };
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => router,
    usePathname: () => '/',
    useSearchParams: () => searchParams,
  };
});

jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,FAKE') },
}));

import HealthPaymentsPage from '../client-view';
import { __resetPaymentModeForTests } from '@/hooks/use-payment-mode';

const APP_ID = 'APP-1';
const RECEIPT_NUMBER = 'TAX-PRD-2026-000005';
const RECEIPT_ISSUED_AT = '2026-08-27T04:27:41.396Z';

const checkoutM1LineItems = [
  { lineNumber: 1, description: 'ค่าบริการ GACP', quantity: 1, unitPrice: '5500.00', amount: '5500.00', isTaxable: true },
  { lineNumber: 2, code: 'VAT', description: 'ภาษีมูลค่าเพิ่ม 7%', quantity: 1, unitPrice: '385.00', amount: '385.00', isTaxable: false },
];

const rawPaidWithReceipt = {
  id: 'inv-co-m1-receipted',
  invoiceNumber: 'INV-CO-D810DEBF-M1',
  applicationId: APP_ID,
  totalAmount: '5885.00',
  status: 'RECEIPT_ISSUED',
  erpStatus: 'RECEIPT_ISSUED',
  receiptNumber: RECEIPT_NUMBER,
  receiptIssuedAt: RECEIPT_ISSUED_AT,
  createdAt: '2026-08-26T03:00:00.000Z',
  paidAt: '2026-08-26T03:05:00.000Z',
  serviceType: 'CERTIFICATION_CHECKOUT_M1',
  lineItems: checkoutM1LineItems,
};

async function flushAsync(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function phase1CheckoutCard(container: HTMLElement): HTMLElement {
  const section = container.querySelector<HTMLElement>('[data-testid="two-card-phase-งวดที่ 1"]');
  if (!section) throw new Error('phase section not found');
  const cards = section.querySelectorAll<HTMLElement>('[data-testid="payment-invoice-card-CHECKOUT"]');
  expect(cards).toHaveLength(1);
  return cards[0]!;
}

function detailButton(card: HTMLElement): HTMLButtonElement {
  const btn = Array.from(card.querySelectorAll('button')).find(
    (b) => (b.textContent || '').trim() === 'ดูรายละเอียด',
  );
  if (!btn) throw new Error('detail button not found on the phase card');
  return btn as HTMLButtonElement;
}

const TRIAL = {
  mode: 'TRIAL',
  notice: 'ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง',
  documentMark: 'เอกสารทดลอง',
  documentMarkDetail: 'ไม่ใช่เอกสารทางภาษี ยังไม่มีการเก็บเงินจริง',
};

describe('payments page in trial and live', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPaymentModeForTests();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container?.remove();
    container = null;
  });

  async function mountPage(mode: Envelope | Error, row: Record<string, unknown> = rawPaidWithReceipt): Promise<HTMLDivElement> {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/invoices/my') return { success: true, data: [row] };
      if (path === '/api/payments/mode') {
        if (mode instanceof Error) throw mode;
        return mode;
      }
      return { success: true, data: [] };
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(<HealthPaymentsPage />);
    });
    await flushAsync();
    const btn = detailButton(phase1CheckoutCard(container));
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushAsync();
    return container;
  }

  function notice(el: HTMLElement): string | null {
    return el.querySelector('[data-trial-payment-notice]')?.textContent ?? null;
  }

  function dialogMark(el: HTMLElement): string | null {
    return el.querySelector('[role="dialog"] [data-trial-document-mark]')?.textContent ?? null;
  }

  const STAMP = `${TRIAL.documentMark}${TRIAL.documentMarkDetail}`;
  const LIVE = { ...TRIAL, mode: 'LIVE' };

  it('trial keys, receipt settled in test mode: the page notice shows and the opened receipt carries the stamp', async () => {
    const el = await mountPage({ success: true, data: TRIAL }, { ...rawPaidWithReceipt, paymentMode: 'TRIAL' });
    expect(notice(el)).toBe(TRIAL.notice);
    expect(dialogMark(el)).toBe(STAMP);
  });

  it('live keys, receipt settled live: no notice and no stamp', async () => {
    const el = await mountPage({ success: true, data: LIVE }, { ...rawPaidWithReceipt, paymentMode: 'LIVE' });
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(notice(el)).toBeNull();
    expect(dialogMark(el)).toBeNull();
    expect(el.textContent).not.toContain(TRIAL.documentMark);
  });

  it('live keys, a receipt settled in test mode reopened after the switch: no page notice, but the receipt is still stamped', async () => {
    const el = await mountPage({ success: true, data: LIVE }, { ...rawPaidWithReceipt, paymentMode: 'TRIAL' });
    expect(notice(el)).toBeNull();
    expect(dialogMark(el)).toBe(STAMP);
  });

  it('trial keys, a receipt settled live: the page notice shows, the receipt is not stamped', async () => {
    const el = await mountPage({ success: true, data: TRIAL }, { ...rawPaidWithReceipt, paymentMode: 'LIVE' });
    expect(notice(el)).toBe(TRIAL.notice);
    expect(dialogMark(el)).toBeNull();
  });

  it('an unreadable answer draws nothing rather than guessing', async () => {
    const el = await mountPage(new Error('network down'));
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(notice(el)).toBeNull();
    expect(dialogMark(el)).toBeNull();
  });
});
