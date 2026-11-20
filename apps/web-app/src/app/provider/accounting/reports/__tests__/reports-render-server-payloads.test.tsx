/**
 * F1 (live walk 2026-10-07): the reports page died on "reading 'isBalanced'" because it
 * read a shape the server never sent. Each report tab here renders the server's real
 * payload — the fixture the backend suite captures from the live doors on Postgres and
 * holds the server to (apps/backend/__tests__/integration/finance-report-contract-real-postgres.test.js).
 */

import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import payloads from '@/lib/services/__fixtures__/finance-report-payloads.json';
import { TrialBalanceTable } from '../TrialBalanceTable';
import { ProfitAndLossStatement } from '../ProfitAndLossStatement';
import { BalanceSheetStatement } from '../BalanceSheetStatement';
import { GeneralLedgerViewer } from '../GeneralLedgerViewer';
import { OutputVatReport } from '../OutputVatReport';

const ROUTES: Array<[string, unknown]> = [
    ['/finance/reports/trial-balance', payloads.trialBalance],
    ['/finance/reports/profit-and-loss', payloads.profitAndLoss],
    ['/finance/reports/balance-sheet', payloads.balanceSheet],
    ['/finance/reports/general-ledger', payloads.generalLedger],
    ['/finance/reports/chart-of-accounts', payloads.chartOfAccounts],
    ['/finance/tax-reports/output-vat', payloads.outputVat],
    ['/finance/tax-reports/period-closable', payloads.periodClosable],
];

jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (url: string) => {
            const hit = ROUTES.find(([prefix]) => url.startsWith(prefix));
            return Promise.resolve(hit ? { success: true, data: hit[1] } : { success: false });
        },
    },
}));

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

afterEach(async () => {
    if (root) { await act(async () => { root?.unmount(); }); root = null; }
    container?.remove();
});

async function mount(element: React.ReactElement): Promise<string> {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        root = createRoot(container);
        root.render(element);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return container.textContent || '';
}

function expectNoCrash(text: string) {
    expect(text).not.toMatch(/Cannot read properties/);
    expect(text).not.toContain('การเรียกข้อมูลล้มเหลว');
    expect(text).not.toContain('เกิดข้อผิดพลาด');
}

describe('finance report tabs render the server payload', () => {
    it('trial balance: rows, totals and the balanced state', async () => {
        const text = await mount(<TrialBalanceTable />);
        expectNoCrash(text);
        expect(text).toContain('รายได้ค่าบริการ');
        expect(text.split('5,885.00').length - 1).toBeGreaterThanOrEqual(2);
        expect(text).not.toContain('ยอดเดบิตไม่เท่ากับยอดเครดิต');
    });

    it('profit and loss: revenue, expense and net profit', async () => {
        const text = await mount(<ProfitAndLossStatement />);
        expectNoCrash(text);
        expect(text).toContain('รายได้ค่าบริการ');
        expect(text).toContain('ค่าใช้จ่ายในการดำเนินงาน');
        expect(text).toContain('5,400.00');
    });

    it('balance sheet: sections and the accounting equation', async () => {
        const text = await mount(<BalanceSheetStatement />);
        expectNoCrash(text);
        expect(text).toContain('เงินสด/เงินฝากธนาคาร · บัญชีหลัก');
        expect(text.split('5,785.00').length - 1).toBeGreaterThanOrEqual(2);
    });

    it('general ledger: the account picker lists the server chart and the lines render', async () => {
        const text = await mount(<GeneralLedgerViewer />);
        expectNoCrash(text);
        expect(text).toContain('รับชำระค่าบริการ');
        const options = Array.from(container.querySelectorAll('option')).map((o) => o.textContent || '');
        expect(options.some((o) => o.startsWith('4110-001'))).toBe(true);
        expect(options.some((o) => o.startsWith('2120 '))).toBe(false);
    });

    it('output VAT: rows, totals and whether the month can close', async () => {
        const text = await mount(<OutputVatReport />);
        expectNoCrash(text);
        expect(text).toContain('5,500.00');
        expect(text).toContain('385.00');
        expect(text).toContain('ปิดงวดได้');
    });
});
