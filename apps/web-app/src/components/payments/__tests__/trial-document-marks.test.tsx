import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Envelope = { success: boolean; data?: unknown };
const mockApiGet = jest.fn<(path: string) => Promise<Envelope>>();
jest.mock('@/lib/api/api-client', () => {
    const api = { get: (path: string) => mockApiGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api };
});
jest.mock('@/components/ui/qr-image', () => ({ QrImage: () => null }));

import QuotationDocument from '@/features/permit-form/components/documents/quotation-document';
import { InvoiceDetailModal } from '@/app/provider/accounting/invoice-detail-modal';
import type { InvoiceItem } from '@/app/provider/accounting/accounting-types';
import QuotationReviewSection from '@/components/payments/QuotationReviewSection';
import { __resetPaymentModeForTests } from '@/hooks/use-payment-mode';
import type { QuotationsBySide } from '@/lib/services/payment-service';

const TRIAL = {
    mode: 'TRIAL',
    notice: 'ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง',
    documentMark: 'เอกสารทดลอง',
    documentMarkDetail: 'ไม่ใช่เอกสารทางภาษี ยังไม่มีการเก็บเงินจริง',
};
const STAMP = `${TRIAL.documentMark}${TRIAL.documentMarkDetail}`;

const quotation = (
    <QuotationDocument
        quotationNumber="QT-PRD-2026-000009"
        quotationDate="21 ตุลาคม 2569"
        payer={null}
        items={[{ description: 'ค่าบริการ GACP', quantity: 1, unitPrice: 5500 }]}
        totalAmount={5885}
        totalAmountText="ห้าพันแปดร้อยแปดสิบห้าบาทถ้วน"
        signatory={null}
        issuer={null}
    />
);

const staffInvoiceView = (invoice: Partial<InvoiceItem>) => (
    <InvoiceDetailModal
        invoice={{
            id: 'inv-1',
            invoiceNumber: 'INV-CO-TRIAL-M1',
            applicationNumber: 'APP-2569-TRIAL',
            healthName: 'บริษัท ทดลอง จำกัด',
            amount: 5885,
            status: 'PAID',
            dueDate: '2026-10-30',
            createdAt: '2026-10-21',
            ...invoice,
        } satisfies InvoiceItem}
        onClose={() => undefined}
        onRefresh={() => undefined}
        formatCurrency={(amt) => String(amt)}
        formatDate={(val) => val}
        getStatusBadge={(status) => status}
        canRefund={false}
    />
);
const staffInvoice = staffInvoiceView({});

const quotationCard = (
    <QuotationReviewSection
        applicationId="app-1"
        quotations={{
            dtam: null,
            platform: {
                id: 'q-1',
                applicationId: 'app-1',
                issuerType: 'PLATFORM',
                quotationNumber: 'QT-PRD-2026-000009',
                subtotal: 33000,
                vat: 2310,
                totalAmount: 35310,
                installments: [{ phase: 'PHASE_1', amount: 5885 }, { phase: 'PHASE_2', amount: 29425 }],
                status: 'PENDING',
                createdAt: '2026-10-21T00:00:00.000Z',
                lineItems: [],
            },
        } as QuotationsBySide}
    />
);

async function flushAsync(rounds = 8): Promise<void> {
    for (let i = 0; i < rounds; i += 1) {
        await act(async () => {
            await Promise.resolve();
        });
    }
}

describe.each([
    ['the on-screen quotation', quotation],
    ['the quotation card on the payments page', quotationCard],
    ['the staff invoice view', staffInvoice],
])('%s', (_label, node) => {
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

    async function mount(mode: Envelope): Promise<void> {
        mockApiGet.mockImplementation(async (path: string) =>
            path === '/api/payments/mode' ? mode : { success: true, data: null },
        );
        container = document.createElement('div');
        document.body.appendChild(container);
        await act(async () => {
            root = createRoot(container!);
            root.render(node);
        });
        await flushAsync();
    }

    const stamp = () => document.querySelector('[data-trial-document-mark]')?.textContent ?? null;

    it('trial: carries the stamp', async () => {
        await mount({ success: true, data: TRIAL });
        expect(stamp()).toBe(STAMP);
    });

    it('live: no stamp', async () => {
        await mount({ success: true, data: { ...TRIAL, mode: 'LIVE' } });
        expect(stamp()).toBeNull();
        expect(document.body.textContent).not.toContain(TRIAL.documentMark);
    });
});

describe('the staff invoice view of a paid invoice stamps from the row\'s own settlement record', () => {
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

    async function mount(mode: Envelope, node: React.ReactElement): Promise<void> {
        mockApiGet.mockImplementation(async (path: string) =>
            path === '/api/payments/mode' ? mode : { success: true, data: null },
        );
        container = document.createElement('div');
        document.body.appendChild(container);
        await act(async () => {
            root = createRoot(container!);
            root.render(node);
        });
        await flushAsync();
    }

    const stamp = () => document.querySelector('[data-trial-document-mark]')?.textContent ?? null;

    it('settled in test mode, opened after the live switch: still stamped', async () => {
        await mount({ success: true, data: { ...TRIAL, mode: 'LIVE' } }, staffInvoiceView({ paymentMode: 'TRIAL' }));
        expect(stamp()).toBe(STAMP);
    });

    it('settled live, opened on trial keys: not stamped', async () => {
        await mount({ success: true, data: TRIAL }, staffInvoiceView({ paymentMode: 'LIVE' }));
        expect(stamp()).toBeNull();
    });

    it('no money moved yet (no record): follows the key of the day', async () => {
        await mount({ success: true, data: TRIAL }, staffInvoiceView({ status: 'PENDING', paymentMode: null }));
        expect(stamp()).toBe(STAMP);
    });
});
