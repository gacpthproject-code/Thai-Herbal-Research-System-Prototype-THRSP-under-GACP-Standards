/**
 * Order 54 (operator 2026-10-09): one quotation number is one document, the full amount of both
 * instalments. The card used to offer "ดูเอกสาร งวดที่ 1" and "ดูเอกสาร งวดที่ 2", two papers under
 * one number, each opened with ?phase=. It now offers the one quotation, and asks the door for
 * no instalment.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { QuotationRecord, QuotationsBySide } from '@/lib/services/payment-service';

declare global {

  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(30_000);

const mockGetQuotations = jest.fn<() => Promise<QuotationsBySide>>();
const mockViewQuotationPdf = jest.fn<(...args: unknown[]) => Promise<boolean>>();

jest.mock('@/lib/services/payment-service', () => {
  const actual = jest.requireActual('@/lib/services/payment-service');
  return {
    ...actual,
    PaymentService: {
      ...actual.PaymentService,
      getQuotations: (...args: unknown[]) => mockGetQuotations(...(args as [])),
      acceptQuotation: jest.fn(),
      viewQuotationPdf: (...args: unknown[]) => mockViewQuotationPdf(...args),
    },
  };
});

import QuotationReviewSection from '../QuotationReviewSection';

const ROW: QuotationRecord = {
  id: 'q-1',
  applicationId: 'app-1',
  issuerType: 'PLATFORM',
  quotationNumber: 'QT-PRD-2569-000123',
  subtotal: 33000,
  vat: 2310,
  totalAmount: 35310,
  installments: [{ phase: 'PHASE_1', amount: 5885 }, { phase: 'PHASE_2', amount: 29425 }],
  status: 'PENDING',
  createdAt: '2026-10-09T00:00:00.000Z',
  lineItems: [
    { method: 'OUTDOOR', label: 'กลางแจ้ง (Outdoor)', phase1Amount: 5885, phase2Amount: 29425, netAmount: 33000, taxAmount: 2310 },
  ],
};

async function flushAsync(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('the quotation card opens ONE document (order 54)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockViewQuotationPdf.mockResolvedValue(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    container?.remove();
    container = null;
  });

  const documentButtons = () => Array.from(container?.querySelectorAll('button') ?? [])
    .filter((b) => /ดูเอกสาร|ดูใบเสนอราคา/.test(b.textContent ?? ''));

  it('offers one button for the one quotation, not one per instalment', async () => {
    mockGetQuotations.mockResolvedValue({ dtam: null, platform: ROW });

    await act(async () => {
      root?.render(<QuotationReviewSection applicationId="app-1" />);
    });
    await flushAsync();

    expect(documentButtons().map((b) => b.textContent?.trim())).toEqual(['ดูใบเสนอราคา (PDF)']);
    expect(container?.textContent).not.toContain('ดูเอกสาร งวดที่');
  });

  it('states the same full total as the paper: both instalments, 35,310', async () => {
    mockGetQuotations.mockResolvedValue({ dtam: null, platform: ROW });

    await act(async () => {
      root?.render(<QuotationReviewSection applicationId="app-1" />);
    });
    await flushAsync();

    const text = container?.textContent ?? '';
    expect(text).toContain('รวมทั้งสิ้น (2 งวด)');
    expect(text).toContain('35,310.00');
  });

  it('opens it without naming an instalment', async () => {
    mockGetQuotations.mockResolvedValue({ dtam: null, platform: ROW });

    await act(async () => {
      root?.render(<QuotationReviewSection applicationId="app-1" />);
    });
    await flushAsync();
    await act(async () => {
      documentButtons()[0]?.click();
    });
    await flushAsync();

    expect(mockViewQuotationPdf.mock.calls).toEqual([['app-1', 'PLATFORM']]);
  });
});
