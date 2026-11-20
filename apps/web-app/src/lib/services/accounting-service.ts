/**
 * Accounting Service — frontend client for the Finance Dashboard
 *
 * Mirrors the standard accounting reports a Thai SME under
 * TFRS for NPAEs needs: Trial Balance, P&L, Balance Sheet,
 * General Ledger, and the monthly ภ.พ.30 Output VAT report.
 *
 * Backend endpoints (batch B19-A/B/C territory):
 *   GET /api/finance/reports/trial-balance
 *   GET /api/finance/reports/profit-and-loss
 *   GET /api/finance/reports/balance-sheet
 *   GET /api/finance/reports/general-ledger
 *   GET /api/finance/tax-reports/output-vat
 *   GET /api/finance/tax-reports/period-closable
 *
 * For CSV downloads we return the absolute URL so the browser
 * handles the file download natively — we do not stream a blob
 * through JS because finance staff often save the file directly
 * from the browser's download manager.
 */

import { apiClient } from '../api/api-client';
import { THAI_TIME_ZONE, bangkokTodayIso, bangkokFirstOfMonthIso } from '@/lib/format/thai-date';

// ── Shared types ───────────────────────────────────────────────
//
// Every type below is the server's own payload, field for field
// (one shape, server truth — live walk F1 2026-10-07). The real
// payloads live in __fixtures__/finance-report-payloads.json, which
// the backend suite regenerates from the live doors and checks.

/** TFRS for NPAEs account class, from the account-code prefix. */
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' | 'SUSPENSE' | 'UNKNOWN';

/** One account of the server's chart (GET /finance/reports/chart-of-accounts). */
export interface ChartAccount {
    code: string;
    name: string;
    nameEn: string;
    type: AccountType;
}

// ── Trial Balance ──────────────────────────────────────────────

export interface TrialBalanceRow {
    accountCode: string;
    accountName: string;
    accountType: AccountType;
    debit: number;
    credit: number;
    balance: number;
}

export interface TrialBalanceResponse {
    asOfDate: string;
    organizationId: string | null;
    rows: TrialBalanceRow[];
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
    discrepancy: number | null;
    warnings: string[];
}

// ── Profit & Loss / Balance Sheet ──────────────────────────────

export interface StatementLine {
    accountCode: string;
    accountName: string;
    amount: number;
}

export interface StatementSection {
    lines: StatementLine[];
    total: number;
}

export interface PLResponse {
    period: { startDate: string; endDate: string };
    organizationId: string | null;
    revenue: StatementSection;
    expense: StatementSection;
    /** Revenue total minus expense total — negative is a loss. */
    netProfit: number;
    warnings: string[];
}

export interface BSResponse {
    asOfDate: string;
    organizationId: string | null;
    assets: StatementSection;
    liabilities: StatementSection;
    equity: StatementSection & { retainedEarnings: number };
    totalLiabilityEquity: number;
    /** The accounting equation holds: assets = liabilities + equity. */
    balanced: boolean;
    discrepancy: number | null;
    warnings: string[];
}

// ── General Ledger ─────────────────────────────────────────────

export interface GLLine {
    entryId: string;
    entryDate: string;
    reference: string;
    description: string;
    lineNumber: number;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    /** Balance after this line, on the account's natural side. */
    runningBalance: number;
}

export interface GLResponse {
    accountCode: string;
    accountName: string | null;
    openingBalance: number;
    lines: GLLine[];
    closingBalance: number;
    totalDebit: number;
    totalCredit: number;
    pagination: { limit: number; offset: number; returned: number; hasMore: boolean; totalRows?: number };
}

// ── Output VAT (ภ.พ.30) ────────────────────────────────────────

export interface VATRow {
    invoiceDate: string;
    /** เลขที่ใบกำกับภาษี */
    invoiceNumber: string | null;
    buyerName: string;
    /** เลขประจำตัวผู้เสียภาษีของผู้ซื้อ; "-" when the buyer has none */
    buyerTaxId: string;
    buyerType: string;
    /** มูลค่าบริการก่อนภาษี */
    taxableAmount: number;
    vatAmount: number;
}

export interface VATResponse {
    period: { year: number; month: number; monthThai: string; filingDueDate: string };
    rows: VATRow[];
    totals: {
        taxableAmount: number;
        /** Output VAT net of credit and debit notes */
        vatAmount: number;
        rowCount: number;
        netVatPayable?: number | null;
    };
}

export interface PeriodClosableResponse {
    year: number;
    month: number;
    closable: boolean;
    lastPaidInvoiceDate: string | null;
    /** Invoices in the month still waiting for their receipt. */
    openInvoices: number;
    warnings: string[];
}

// ── AR Aging (B20-D, รายงานลูกหนี้ค้างชำระ) ────────────────────

export type ArAgingBucket =
    | 'NOT_YET_DUE'
    | '0_30'
    | '31_60'
    | '61_90'
    | 'OVER_90';

export interface ArAgingRow {
    invoiceId: string;
    invoiceNumber: string;
    applicantHealthIdMasked: string | null;
    applicantNameMasked: string | null;
    applicationId: string | null;
    applicationNumber: string | null;
    invoiceDate: string;
    dueDate: string;
    daysOverdue: number;
    bucket: ArAgingBucket;
    amount: number;
    serviceType: string;
}

export interface ArAgingResponse {
    asOfDate: string;
    bookSide: 'DTAM' | 'PLATFORM';
    organizationId: string;
    totalsByBucket: Record<ArAgingBucket, { amount: number; count: number }>;
    totalOutstanding: number;
    rowCount: number;
    rows: ArAgingRow[];
}

// ── Service ────────────────────────────────────────────────────

interface CsvCapable {
    format?: 'csv';
}

const BASE = '/finance';

function ok<T>(payload: { success: boolean; data?: T }): T {
    if (!payload?.success || payload.data === undefined) {
        throw new Error('การเรียกข้อมูลล้มเหลว');
    }
    return payload.data as T;
}

/**
 * Build an absolute URL the browser can hit directly for CSV
 * downloads. Auth is via the JWT cookie + Authorization header
 * which the browser carries automatically because the API is
 * same-origin under /api/* via the Next.js proxy.
 */
function buildAbsoluteUrl(path: string, params: Record<string, string | number>): string {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        search.set(k, String(v));
    }
    const qs = search.toString();
    return qs ? `/api${path}?${qs}` : `/api${path}`;
}

export const AccountingService = {
    /**
     * GET /api/finance/reports/trial-balance?asOfDate=YYYY-MM-DD
     */
    async getTrialBalance(args: { asOfDate: string }): Promise<TrialBalanceResponse> {
        const params = new URLSearchParams({ asOfDate: args.asOfDate });
        const res = await apiClient.get<TrialBalanceResponse>(
            `${BASE}/reports/trial-balance?${params.toString()}`,
        );
        return ok(res);
    },

    /**
     * GET /api/finance/reports/profit-and-loss?from=YYYY-MM-DD&to=YYYY-MM-DD
     */
    async getProfitAndLoss(args: { from: string; to: string }): Promise<PLResponse> {
        const params = new URLSearchParams({ from: args.from, to: args.to });
        const res = await apiClient.get<PLResponse>(
            `${BASE}/reports/profit-and-loss?${params.toString()}`,
        );
        return ok(res);
    },

    /**
     * GET /api/finance/reports/balance-sheet?asOfDate=YYYY-MM-DD
     */
    async getBalanceSheet(args: { asOfDate: string }): Promise<BSResponse> {
        const params = new URLSearchParams({ asOfDate: args.asOfDate });
        const res = await apiClient.get<BSResponse>(
            `${BASE}/reports/balance-sheet?${params.toString()}`,
        );
        return ok(res);
    },

    /**
     * GET /api/finance/reports/general-ledger?accountCode=…&from=…&to=…
     */
    async getGeneralLedger(args: {
        accountCode: string;
        from: string;
        to: string;
    }): Promise<GLResponse> {
        const params = new URLSearchParams({
            accountCode: args.accountCode,
            from: args.from,
            to: args.to,
        });
        const res = await apiClient.get<GLResponse>(
            `${BASE}/reports/general-ledger?${params.toString()}`,
        );
        return ok(res);
    },

    /**
     * GET /api/finance/tax-reports/output-vat?year=YYYY&month=MM
     */
    async getOutputVatReport(args: { year: number; month: number }): Promise<VATResponse> {
        const params = new URLSearchParams({
            year: String(args.year),
            month: String(args.month).padStart(2, '0'),
        });
        const res = await apiClient.get<VATResponse>(
            `${BASE}/tax-reports/output-vat?${params.toString()}`,
        );
        return ok(res);
    },

    /**
     * GET /api/finance/tax-reports/period-closable?year=…&month=…
     */
    async getPeriodClosable(args: {
        year: number;
        month: number;
    }): Promise<PeriodClosableResponse> {
        const params = new URLSearchParams({
            year: String(args.year),
            month: String(args.month).padStart(2, '0'),
        });
        const res = await apiClient.get<PeriodClosableResponse>(
            `${BASE}/tax-reports/period-closable?${params.toString()}`,
        );
        return ok(res);
    },

    /**
     * GET /api/finance/reports/chart-of-accounts — the server's chart, the only list.
     */
    async getChartOfAccounts(): Promise<ChartAccount[]> {
        const res = await apiClient.get<{ accounts: ChartAccount[] }>(
            `${BASE}/reports/chart-of-accounts`,
        );
        return ok(res).accounts;
    },

    // ── CSV download URL builders ──────────────────────────────

    trialBalanceCsvUrl(args: { asOfDate: string } & CsvCapable): string {
        return buildAbsoluteUrl('/finance/reports/trial-balance', {
            asOfDate: args.asOfDate,
            format: 'csv',
        });
    },

    profitAndLossCsvUrl(args: { from: string; to: string }): string {
        return buildAbsoluteUrl('/finance/reports/profit-and-loss', {
            from: args.from,
            to: args.to,
            format: 'csv',
        });
    },

    balanceSheetCsvUrl(args: { asOfDate: string }): string {
        return buildAbsoluteUrl('/finance/reports/balance-sheet', {
            asOfDate: args.asOfDate,
            format: 'csv',
        });
    },

    generalLedgerCsvUrl(args: {
        accountCode: string;
        from: string;
        to: string;
    }): string {
        return buildAbsoluteUrl('/finance/reports/general-ledger', {
            accountCode: args.accountCode,
            from: args.from,
            to: args.to,
            format: 'csv',
        });
    },

    outputVatCsvUrl(args: { year: number; month: number }): string {
        return buildAbsoluteUrl('/finance/tax-reports/output-vat', {
            year: args.year,
            month: String(args.month).padStart(2, '0'),
            format: 'csv',
        });
    },

    /**
     * GET /api/finance/ar-aging?bookSide=…&asOfDate=YYYY-MM-DD
     * B20-D — AR Aging Report (รายงานลูกหนี้ค้างชำระ).
     */
    async getArAging(args: {
        bookSide: 'DTAM' | 'PLATFORM';
        asOfDate: string;
    }): Promise<ArAgingResponse> {
        const params = new URLSearchParams({
            bookSide: args.bookSide,
            asOfDate: args.asOfDate,
        });
        const res = await apiClient.get<ArAgingResponse>(
            `${BASE}/ar-aging?${params.toString()}`,
        );
        return ok(res);
    },

    arAgingCsvUrl(args: {
        bookSide: 'DTAM' | 'PLATFORM';
        asOfDate: string;
    }): string {
        return buildAbsoluteUrl('/finance/ar-aging', {
            bookSide: args.bookSide,
            asOfDate: args.asOfDate,
            format: 'csv',
        });
    },

};


// ── Utility formatters used across the report components ───────

/**
 * Format a numeric amount as Thai Baht with thousand separators.
 * Pass `withSymbol=false` for inline table cells where the
 * column header already says "เดบิต / เครดิต".
 */
export function formatTHB(amount: number, withSymbol = true): string {
    const value = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat('th-TH', {
        style: withSymbol ? 'currency' : 'decimal',
        currency: 'THB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/** Format ISO date as Thai short date (DD/MM/YYYY in Buddhist era). */
export function formatThaiDate(iso: string): string {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleDateString('th-TH', {
            timeZone: THAI_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    } catch {
        return iso;
    }
}

/** Default the "as of" date picker to today (ISO YYYY-MM-DD). */
export function todayIso(): string {
    return bangkokTodayIso(); // today in Bangkok, not UTC
}

/** Default the period picker to the first day of the current month. */
export function firstOfMonthIso(): string {
    // The 1st of the Bangkok month. The old local-midnight → toISOString() read
    // gave the last day of the previous month even in a Bangkok browser.
    return bangkokFirstOfMonthIso();
}
