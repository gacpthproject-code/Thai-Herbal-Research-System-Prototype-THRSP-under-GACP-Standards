/**
 * การเงินสองบทบาทเห็นหน้าบัญชีเดียวกัน — ทุกหน้า ทุกแท็บ
 *
 * operator 2026-09-11: "finance ต้องเห็นเหมือนกัน หรือว่าตัวเลขที่ต้องมากระทบยอด ต้องเท่ากัน
 * เพื่อแสดงความโปร่งใส" · operator 2026-09-27: "กรมฯ ดูอย่างเดียว" — finance_officer_dtam
 * เห็นทุกอย่างที่ finance_officer_platform เห็น แต่ไม่มีปุ่มเขียนบัญชีเลย
 *
 * วิธี: mount หน้าจริง (createRoot + act) ด้วยข้อมูลชุดเดียวกัน ครั้งหนึ่งเป็นการเงินกรม อีกครั้ง
 * เป็นการเงินบริษัท แล้วเทียบ "เนื้อหาอ่าน" = ข้อความทั้งหน้าหลังตัดปุ่มเขียนออก · ปุ่มเขียน
 * (ชื่อใน WRITE_LABELS) ต้องไม่มีเลยในหน้าของการเงินกรม และต้องมีในหน้าของการเงินบริษัท
 * (ไม่งั้นการตัดปุ่มออกจะพิสูจน์อะไรไม่ได้)
 * ของปลอม: ผู้ใช้ที่ล็อกอิน · กรอบหน้า (ProviderLayout) · ชั้นเรียก API
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockRole = 'finance_officer_platform';

jest.mock('@/lib/services/auth-provider', () => ({
    useAuth: () => ({ user: { id: 'u-1', role: mockRole }, isLoading: false }),
}));
jest.mock('next/navigation', () => ({
    usePathname: () => '/provider/accounting',
    useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('../../components/provider-layout', () => ({
    __esModule: true,
    default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
        <div data-testid="provider-layout">{title}{children}</div>
    ),
}));
jest.mock('sonner', () => ({ toast: { success: () => undefined, error: () => undefined } }));
// Radix Dialog portals out of the container in jsdom — render inline (same as invoice-detail-modal tests).
jest.mock('@/components/ui/primitives/dialog', () => ({
    Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));

const INVOICES = [
    {
        id: 'inv-1', invoiceNumber: 'INV-2569-0001', applicationNumber: 'APP-0001', totalAmount: 35310,
        status: 'PAID_PENDING_RECEIPT', dueDate: '2026-09-20T00:00:00Z', paidAt: '2026-09-18T00:00:00Z',
        createdAt: '2026-09-10T00:00:00Z', applicant: { firstName: 'สมชาย', lastName: 'ใจดี' }, items: [],
        serviceType: 'CERTIFICATION_CHECKOUT_M1',
    },
    {
        id: 'inv-2', invoiceNumber: 'INV-2569-0002', applicationNumber: 'APP-0002', totalAmount: 12000,
        status: 'RECEIPT_ISSUED', erpStatus: 'RECEIPT_ISSUED', dueDate: '2026-09-21T00:00:00Z',
        createdAt: '2026-09-11T00:00:00Z', applicant: { companyName: 'บริษัท สมุนไพร จำกัด' }, items: [],
        serviceType: 'CERTIFICATION_CHECKOUT_M2',
    },
];
function mockApiGet(url: string) {
    if (url.startsWith('/invoices/summary')) {
        return { success: true, data: {
            month: { year: 2026, month: 10 },
            revenue: {
                month: { gross: 41425, credited: 5885, net: 35540 },
                allTime: { gross: 47310, credited: 5885, net: 41425 },
            },
            pendingAmount: 0, overdueAmount: 0, invoiceCount: { total: 2, paid: 2, pending: 0, overdue: 0 },
        } };
    }
    if (url.startsWith('/finance/refunds/')) { return { success: true, data: { cancellation: null, duplicateChargeRefunds: [] } }; }
    if (url.startsWith('/invoices/receipts/exceptions')) { return { success: true, data: { exceptions: [] } }; }
    if (url.startsWith('/invoices')) { return { success: true, data: { invoices: INVOICES } }; }
    return { success: true, data: {} };
}
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (url: string) => Promise.resolve(mockApiGet(url)),
        post: () => Promise.resolve({ success: true, data: {} }),
        getBlob: () => Promise.resolve(null),
    },
}));

jest.mock('@/lib/services/wht-service', () => {
    const actual = jest.requireActual('@/lib/services/wht-service') as Record<string, unknown>;
    return {
        ...actual,
        WhtCertificateService: {
            listCertificates: () => Promise.resolve({ count: 0, certificates: [] }),
            checkApplicable: () => Promise.resolve({ applicable: false }),
        },
    };
});

jest.mock('@/lib/services/accounting-service', () => {
    const actual = jest.requireActual('@/lib/services/accounting-service') as Record<string, unknown>;
    return {
        ...actual,
        AccountingService: {
            ...(actual.AccountingService as Record<string, unknown>),
            getTrialBalance: () => Promise.resolve({
                asOfDate: '2026-09-27', rows: [], totals: { debit: 0, credit: 0, isBalanced: true },
            }),
            getArAging: (args: { bookSide: string }) => Promise.resolve({
                asOfDate: '2026-09-27', bookSide: args.bookSide, organizationId: 'org-1',
                totalsByBucket: {}, totalOutstanding: args.bookSide === 'PLATFORM' ? 35310 : 0,
                rowCount: 0, rows: [],
            }),
        },
    };
});

import { AccountingDashboardClient } from '../accounting-dashboard-client';
import WhtClientView from '../wht/client-view';
import ReportsClientView from '../reports/client-view';
import { ArAgingReport } from '../reports/ArAgingReport';
import { moduleTabsFor } from '../../components/provider-module-tabs';
import { providerLandingPath, providerRoleCanOpen } from '@/lib/provider-role-config';
import { PROVIDER_CANCELLATION_REASONS } from '@/constants/refund-kinds';

const D = 'finance_officer_dtam';
const P = 'finance_officer_platform';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
});
afterEach(async () => {
    if (root) { await act(async () => { root?.unmount(); }); root = null; }
    container.remove();
});

async function renderAs(role: string, element: React.ReactElement): Promise<HTMLElement> {
    mockRole = role;
    await act(async () => {
        root = createRoot(container);
        root.render(element);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const snapshot = container.cloneNode(true) as HTMLElement;
    await act(async () => { root?.unmount(); });
    root = null;
    container.innerHTML = '';
    return snapshot;
}

/** ข้อความทั้งหน้า หลังตัดปุ่ม/ลิงก์ที่เป็นการเขียนออก และตัดประกาศสิทธิ์ของผู้ดู */
function readContent(snapshot: HTMLElement, writeLabels: readonly string[]): string {
    const copy = snapshot.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-role-notice]').forEach((el) => el.remove());
    copy.querySelectorAll('button, a').forEach((el) => {
        if (isWriteControl(el, writeLabels)) { el.remove(); }
    });
    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
}

/** ปุ่ม/ลิงก์ที่เป็นการเขียน — จับจากข้อความบนปุ่มหรือ aria-label */
function isWriteControl(el: Element, writeLabels: readonly string[]): boolean {
    const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`;
    return writeLabels.some((label) => text.includes(label));
}

function writeButtons(snapshot: HTMLElement, writeLabels: readonly string[]): string[] {
    return Array.from(snapshot.querySelectorAll('button, a'))
        .filter((el) => isWriteControl(el, writeLabels))
        .map((el) => `${(el.textContent || '').trim()} ${el.getAttribute('aria-label') || ''}`.trim());
}

const PAGES: ReadonlyArray<[string, () => React.ReactElement, readonly string[]]> = [
    ['แดชบอร์ดบัญชี /provider/accounting', () => <AccountingDashboardClient />, []],
    ['ภาษีหัก ณ ที่จ่าย /wht', () => <WhtClientView />, ['บันทึก ทบ.50 ทวิ ใหม่']],
    ['รายงานการเงิน /reports', () => <ReportsClientView />, []],
    ['ลูกหนี้ค้างชำระ /ar-aging', () => <ArAgingReport />, []],
];

describe('หน้าบัญชี — การเงินกรมกับการเงินบริษัทเห็นเนื้อหาอ่านเดียวกัน', () => {
    it.each(PAGES)('%s', async (_name, make, writeLabels) => {
        const asD = await renderAs(D, make());
        const asP = await renderAs(P, make());
        expect(readContent(asD, writeLabels)).toEqual(readContent(asP, writeLabels));
        expect(readContent(asD, writeLabels)).not.toContain('ไม่มีสิทธิ์เข้าถึง');
    });
});

describe('ปุ่มเขียนบัญชี — การเงินกรมไม่เห็นเลย การเงินบริษัทเห็น (กรมฯ ดูอย่างเดียว)', () => {
    it.each(PAGES.filter(([, , labels]) => labels.length > 0))('%s', async (_name, make, writeLabels) => {
        const asD = await renderAs(D, make());
        const asP = await renderAs(P, make());
        expect(writeButtons(asD, writeLabels)).toEqual([]);
        expect(writeButtons(asP, writeLabels).length).toBeGreaterThan(0);
    });
});

describe('หัวข้อหน้าบัญชี — กลาง ๆ เดียวกันทั้งสองบทบาท', () => {
    it('ไม่มีคำว่า "บัญชี DTAM" หรือ "บัญชี Platform" ในหน้าของใครเลย', async () => {
        for (const role of [D, P]) {
            const text = (await renderAs(role, <AccountingDashboardClient />)).textContent || '';
            expect(text).toContain('บัญชีและใบเสร็จ');
            expect(text).not.toMatch(/บัญชี DTAM|บัญชี Platform|ฝั่งรัฐ \(DTAM\)|ฝั่งแพลตฟอร์ม/);
        }
    });
});

describe('ตัวเลขแดชบอร์ด — เดือนกับทั้งหมดแยกกัน หักใบลดหนี้แล้ว (F11 audit 2026-10-06)', () => {
    it('the month card names its month and shows the net; all-time is its own card', async () => {
        const text = ((await renderAs(P, <AccountingDashboardClient />)).textContent || '').replace(/\s+/g, ' ');
        expect(text).toContain('รายรับสุทธิเดือน ต.ค. 2569');
        expect(text).toContain('฿35,540');
        expect(text).toContain('รายรับสุทธิทั้งหมด');
        expect(text).toContain('฿41,425');
        expect(text).toContain('หักใบลดหนี้ ฿5,885');
        expect(text).not.toContain('รายรับเดือนนี้');
    });
});

describe('แท็บเมนูบัญชี — ชุดเดียวกัน', () => {
    it('moduleTabsFor ไม่รับบทบาทเลย — แท็บเดียวกันทุกคน ครบสามแท็บที่เหลือ (F-A8b-15)', () => {
        // เดิม: moduleTabsFor(pathname, role) และการเงินกรมได้แท็บเดียว (ลูกหนี้ค้างชำระ)
        expect(moduleTabsFor.length).toBe(1);
        expect(moduleTabsFor('/provider/accounting')?.tabs.map((t) => t.href)).toHaveLength(3);
    });
});

describe('รายละเอียดใบแจ้งหนี้ — คืนเงินเฉพาะบทบาทที่หลังบ้านยอมให้เขียน · ไม่มีปุ่มแตะสถานะการชำระเงิน', () => {
    const MODAL_WRITE = ['ระงับ / Hold', 'ปลดล็อก', 'คืนเงิน'];

    async function openFirstInvoiceAs(role: string): Promise<string[]> {
        mockRole = role;
        await act(async () => {
            root = createRoot(container);
            root.render(<AccountingDashboardClient />);
        });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const eye = container.querySelector('button[aria-label="ดูรายละเอียดใบแจ้งหนี้"]') as HTMLButtonElement | null;
        expect(eye).not.toBeNull();
        await act(async () => { eye?.click(); });
        const found = writeButtons(container, MODAL_WRITE);
        const dialogText = container.querySelector('[data-testid="dialog"]')?.textContent || '';
        await act(async () => { root?.unmount(); });
        root = null;
        container.innerHTML = '';
        expect(dialogText).toContain('INV-2569-0001');
        return found;
    }

    it('การเงินกรมเปิดรายละเอียดได้ แต่ไม่มีปุ่มเขียนเลย (เดิมปุ่มคืนเงินขึ้นแล้วได้ 403)', async () => {
        expect(await openFirstInvoiceAs(D)).toEqual([]);
    });

    it('การเงินบริษัทเห็นปุ่มคืนเงิน แต่ไม่มีปุ่มระงับ/ปลดล็อก (operator 2026-10-06)', async () => {
        const found = await openFirstInvoiceAs(P);
        expect(found.some((t) => t.includes('ระงับ / Hold') || t.includes('ปลดล็อก'))).toBe(false);
        expect(found.some((t) => t.includes('คืนเงิน'))).toBe(true);
    });

    /** The cancellation reasons the refund form offers on one row of GET /invoices, as company finance. */
    async function cancellationReasonsOf(invoiceNumber: string, tabLabel: string): Promise<string[]> {
        mockRole = P;
        await act(async () => {
            root = createRoot(container);
            root.render(<AccountingDashboardClient />);
        });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const tab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) => (el.textContent || '').includes(tabLabel));
        await act(async () => { (tab as HTMLButtonElement).click(); });
        const row = Array.from(container.querySelectorAll('tr')).find((tr) => (tr.textContent || '').includes(invoiceNumber));
        await act(async () => { (row?.querySelector('button[aria-label="ดูรายละเอียดใบแจ้งหนี้"]') as HTMLButtonElement).click(); });
        expect(container.querySelector('[data-testid="dialog"]')?.textContent || '').toContain(invoiceNumber);
        const openForm = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'บันทึกการคืนเงิน');
        await act(async () => { openForm?.click(); });
        await act(async () => { (container.querySelector('input[value="PROVIDER_CANCELLED"]') as HTMLInputElement).click(); });
        const reasons = Array.from(container.querySelectorAll('#refund-reason option'))
            .map((o) => (o as HTMLOptionElement).value).filter(Boolean);
        await act(async () => { root?.unmount(); });
        root = null;
        container.innerHTML = '';
        return reasons;
    }

    // The form knows the instalment only from the serviceType the dashboard carries over from GET /invoices
    // (check of f45c9a987, Low-2).
    it('แบบฟอร์มคืนเงินเสนอเหตุ (ง) บริษัทตรวจแปลงไม่ได้ เฉพาะใบแจ้งหนี้งวดที่ 2', async () => {
        const all = Object.keys(PROVIDER_CANCELLATION_REASONS);
        const m1 = await cancellationReasonsOf('INV-2569-0001', 'ชำระแล้ว ยังไม่มีใบเสร็จ');
        const m2 = await cancellationReasonsOf('INV-2569-0002', 'ออกใบเสร็จแล้ว');
        expect({ m1, m2 }).toEqual({ m1: all.filter((code) => code !== 'COMPANY_CANNOT_INSPECT'), m2: all });
    });
});

describe('ส่งออกสรุปประจำเดือน บอกว่าเป็นยอดรับชำระก่อนหักใบลดหนี้ (L7 security review 2026-10-09)', () => {
    it('the monthly export names its amount as received before credit notes, unlike the net cards', async () => {
        mockRole = P;
        await act(async () => {
            root = createRoot(container);
            root.render(<AccountingDashboardClient />);
        });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const toggle = Array.from(container.querySelectorAll('button'))
            .find((b) => (b.textContent || '').includes('ส่งออกรายงานการเงิน'));
        await act(async () => { toggle?.click(); });
        const monthly = (container.querySelector('[data-testid="export-btn-monthly"]')?.textContent || '').replace(/\s+/g, ' ');
        await act(async () => { root?.unmount(); });
        root = null;
        container.innerHTML = '';
        expect(monthly).toContain('ยอดรับชำระ');
        expect(monthly).toContain('ก่อนหักใบลดหนี้');
        expect(monthly).not.toContain('รายได้');
    });
});

describe('หน้าแรกหลังล็อกอิน — ที่เดียวกันสำหรับการเงินทั้งสองบทบาท', () => {
    it('providerLandingPath ส่งทั้งคู่ไป /provider/accounting และเปิดทุกแท็บได้', () => {
        expect(providerLandingPath(D)).toBe('/provider/accounting');
        expect(providerLandingPath(P)).toBe('/provider/accounting');
        for (const path of ['/provider/accounting', '/provider/accounting/reports', '/provider/accounting/wht',
            '/provider/accounting/ar-aging']) {
            expect([path, providerRoleCanOpen(D, path)]).toEqual([path, providerRoleCanOpen(P, path)]);
            expect(providerRoleCanOpen(D, path)).toBe(true);
        }
    });
});

describe('S6 (operator 2026-09-27) — ผู้ตรวจประเมินไม่เห็นหน้าบัญชี', () => {
    it('field_inspector เปิด /provider/accounting ไม่ได้ และไม่มีแท็บเมนูบัญชี', () => {
        for (const path of ['/provider/accounting', '/provider/accounting/reports']) {
            expect([path, providerRoleCanOpen('field_inspector', path)]).toEqual([path, false]);
        }
    });

    it('หน้ารายงานของ field_inspector แสดงไม่มีสิทธิ์เข้าถึง', async () => {
        const text = (await renderAs('field_inspector', <ReportsClientView />)).textContent || '';
        expect(text).toContain('ไม่มีสิทธิ์เข้าถึง');
    });
});
