/**
 * The payments list opens this screen with `?app=` only (staging walk
 * 2026-10-06 D7). The server picks the milestone the application can pay now,
 * so the screen sends none of its own, and when nothing is payable it shows
 * the Thai reason for CHECKOUT_MILESTONE_NOT_PAYABLE, not a fallback (O6).
 *
 * Scaffold: checkout-does-not-promise-online-payment.test.tsx.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { CheckoutResult } from '@/lib/services/checkout-service';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockCreateCheckout = jest.fn<(args: unknown) => Promise<CheckoutResult>>();

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
      getPaymentTermsConsent: async () => ({ success: true, data: { consents: {} } }),
      acceptPaymentTerms: async () => ({ success: true }),
      getQuotations: async () => ({ dtam: null, platform: null }),
    },
  };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/health/payments/checkout',
  useSearchParams: () => new URLSearchParams({ app: 'APP-1' }),
}));

import CheckoutClientView, { CHECKOUT_ERROR_MAP } from '../client-view';

async function flushAsync(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('checkout opened with ?app= only', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  async function pressStart(): Promise<string> {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(<CheckoutClientView />);
    });
    await flushAsync();
    const box = container.querySelector<HTMLInputElement>('[data-testid="checkout-terms-checkbox"]');
    await act(async () => {
      box!.click();
    });
    await flushAsync();
    const btn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      (b.textContent || '').includes('เริ่มขั้นตอนชำระเงิน'),
    );
    await act(async () => {
      btn!.click();
    });
    await flushAsync();
    return container.textContent || '';
  }

  it('names no milestone, so the server chooses the payable one', async () => {
    mockCreateCheckout.mockResolvedValue({ success: false, status: 500, error: 'X', code: 'X' } as CheckoutResult);
    await pressStart();
    expect(mockCreateCheckout).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 'APP-1', milestone: '' }));
  });

  it('a 409 CHECKOUT_MILESTONE_NOT_PAYABLE shows its Thai reason', async () => {
    mockCreateCheckout.mockResolvedValue({
      success: false,
      status: 409,
      error: 'CHECKOUT_MILESTONE_NOT_PAYABLE',
      code: 'CHECKOUT_MILESTONE_NOT_PAYABLE',
    } as CheckoutResult);
    const text = await pressStart();
    expect(text).toContain(CHECKOUT_ERROR_MAP.CHECKOUT_MILESTONE_NOT_PAYABLE);
    expect(text).toContain('ยังไม่ได้เรียกเก็บเงิน');
    expect(text).not.toContain('CHECKOUT_MILESTONE_NOT_PAYABLE');
  });
});
