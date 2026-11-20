import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { CheckoutResult } from '@/lib/services/checkout-service';
import { __resetPaymentModeForTests } from '@/hooks/use-payment-mode';
import type { QuotationsBySide } from '@/lib/services/payment-service';
import { HAPPY } from '@/lib/services/__fixtures__/checkout-fixtures';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const APPLICATION_UUID = '2a60c16c-8428-4d48-8bc2-a27bf8e0f445';
const APPLICATION_NUMBER = 'APP-2569-MUJIXOBX-0C1EC3';

type Envelope = { success: boolean; data?: unknown };
const mockApiGet = jest.fn<(path: string) => Promise<Envelope>>();
jest.mock('@/lib/api/api-client', () => {
  const actual = jest.requireActual('@/lib/api/api-client') as Record<string, unknown>;
  const api = { get: (path: string) => mockApiGet(path) };
  return { ...actual, api, apiClient: api };
});

const mockCreateCheckout = jest.fn<(args: unknown) => Promise<CheckoutResult>>();
const mockGetPaymentTermsConsent =
  jest.fn<() => Promise<{ success: boolean; data?: unknown }>>();
const mockAcceptPaymentTerms = jest.fn<() => Promise<{ success: boolean }>>();
const mockGetQuotations = jest.fn<() => Promise<QuotationsBySide | null>>();

jest.mock('@/lib/services/checkout-service', () => {
  const actual = jest.requireActual('@/lib/services/checkout-service') as Record<string, unknown>;
  return {
    ...actual,
    createCheckout: (args: unknown) => mockCreateCheckout(args),
  };
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
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/',
    query: {},
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

const NOTICE = 'ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง';
const TRIAL = {
  mode: 'TRIAL',
  notice: NOTICE,
  documentMark: 'เอกสารทดลอง',
  documentMarkDetail: 'ไม่ใช่เอกสารทางภาษี ยังไม่มีการเก็บเงินจริง',
};

describe('the checkout page in trial and live', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPaymentModeForTests();
    mockSearchParams = new URLSearchParams({ app: APPLICATION_UUID, milestone: 'M1' });
    mockCreateCheckout.mockResolvedValue(HAPPY);
    mockGetPaymentTermsConsent.mockResolvedValue({ success: true, data: { consents: {} } });
    mockAcceptPaymentTerms.mockResolvedValue({ success: true });
    mockGetQuotations.mockResolvedValue({
      dtam: null,
      platform: null,
      applicationNumber: APPLICATION_NUMBER,
    } as QuotationsBySide);
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

  async function mountView(mode: Envelope): Promise<HTMLDivElement> {
    mockApiGet.mockImplementation(async (path: string) =>
      path === '/api/payments/mode' ? mode : { success: true, data: null },
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(<CheckoutClientView />);
    });
    await flushAsync();
    return container;
  }

  it('trial: the notice is on the page before anything is paid', async () => {
    const el = await mountView({ success: true, data: TRIAL });
    const notice = el.querySelector('[data-trial-payment-notice]');
    expect(notice?.textContent).toBe(NOTICE);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it('live: no notice', async () => {
    const el = await mountView({ success: true, data: { ...TRIAL, mode: 'LIVE' } });
    expect(el.querySelector('[data-trial-payment-notice]')).toBeNull();
    expect(el.textContent).not.toContain(NOTICE);
  });
});
