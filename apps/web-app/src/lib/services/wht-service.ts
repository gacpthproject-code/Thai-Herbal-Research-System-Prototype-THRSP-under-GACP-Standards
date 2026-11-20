/**
 * WHT service — frontend client for the ทบ.50 ทวิ register at /api/finance/wht
 * (backend services/wht-service.js, which holds the compliance basis).
 */
import { apiClient, type ApiResponse } from '../api/api-client';
import { THAI_TIME_ZONE, bangkokTodayIso, bangkokFirstOfMonthIso } from '@/lib/format/thai-date';

// ── Shared internals ───────────────────────────────────────────────────

const BASE = '/finance';

/**
 * Unwrap the canonical `{ success, data }` envelope. Throws a uniform error
 * when the backend says `success: false`, carrying apiClient's Thai message,
 * the backend's `code` (or the legacy `error` string) and every `meta.*` field
 * spread onto it.
 */
function ok<T>(payload: ApiResponse<T>): T {
    if (!payload?.success || payload.data === undefined) {
        const err = new Error(payload?.error || 'การเรียกข้อมูลล้มเหลว');
        (err as Error & { code?: string }).code =
            payload?.code || payload?.error || 'UNKNOWN';
        if (payload?.meta && typeof payload.meta === 'object') {
            Object.assign(err, payload.meta);
        }
        throw err;
    }
    return payload.data as T;
}

/**
 * Build a query string from a flat record, skipping null/undefined.
 */
function qs(params: Record<string, string | number | null | undefined>): string {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === null || v === undefined || v === '') continue;
        search.set(k, String(v));
    }
    const s = search.toString();
    return s ? `?${s}` : '';
}

// ── WHT (Withholding Tax 3%) ──────────────────────────────────────────

/**
 * Reason codes returned by `isWhtApplicable`. Mirrors the strings in
 * `apps/backend/services/wht-service.js:531-580` so the UI can switch
 * on them without round-tripping a free-text Thai label.
 */
export type WhtApplicabilityReason =
    | 'CORPORATE_BUYER_PLATFORM_PAID'
    | 'INDIVIDUAL_BUYER'
    | 'INVOICE_NOT_PAID'
    | 'NOT_PLATFORM_INVOICE'
    | 'INVOICE_NOT_FOUND'
    | 'DB_UNAVAILABLE';

export interface WhtApplicabilityResult {
    applicable: boolean;
    reason: WhtApplicabilityReason | string;
    /** Indicative 3% withholding amount when applicable. */
    indicativeWht?: number;
    /** True when a cert is already on file. */
    alreadyRecorded?: boolean;
}

export interface WhtCertificateRecord {
    invoiceId: string;
    invoiceNumber: string;
    organizationId?: string | null;
    invoiceSubtotal: number;
    certificateNumber: string;
    issuedByTaxId: string;
    issuedByName: string;
    certificateDate: string;
    whtAmount: number;
    rate: number;
    attachmentId?: string | null;
    recordedAt: string;
    recordedBy?: string | null;
    source: 'BUYER_ISSUED';
}

export interface WhtCertificatesListResponse {
    count: number;
    certificates: WhtCertificateRecord[];
}

export interface RecordWhtCertificateInput {
    invoiceId: string;
    certificateNumber: string;
    /** 13-digit Thai TIN (buyer). */
    issuedByTaxId: string;
    issuedByName: string;
    /** ISO date stamped on the ทบ.50 ทวิ cert. */
    certificateDate: string;
    /** > 0; capped by invoice.subtotal on backend. */
    whtAmount: number;
    attachmentId?: string | null;
    /** Reserved for future GL hook; default false. */
    recordJournal?: boolean;
}

export interface RecordWhtCertificateResult {
    invoiceId: string;
    invoiceNumber?: string;
    certificateNumber: string;
    whtAmount: number;
    recordedAt: string;
    journalRef?: unknown;
    /** True when the same certificateNumber was already on file. */
    alreadyRecorded?: boolean;
}

export interface WhtCertificatesListFilters {
    /** ISO date — inclusive lower bound on certificateDate. */
    startDate?: string;
    /** ISO date — exclusive upper bound on certificateDate. */
    endDate?: string;
}

async function _whtRecord(input: RecordWhtCertificateInput): Promise<RecordWhtCertificateResult> {
    const res = await apiClient.post<RecordWhtCertificateResult>(
        `${BASE}/wht/certificate`,
        input,
    );
    return ok(res);
}

async function _whtList(
    filters: WhtCertificatesListFilters = {},
): Promise<WhtCertificatesListResponse> {
    const res = await apiClient.get<WhtCertificatesListResponse>(
        `${BASE}/wht/certificates${qs({
            startDate: filters.startDate,
            endDate: filters.endDate,
        })}`,
    );
    return ok(res);
}

async function _whtApplicable(invoiceId: string): Promise<WhtApplicabilityResult> {
    const res = await apiClient.get<WhtApplicabilityResult>(
        `${BASE}/wht/applicable/${encodeURIComponent(invoiceId)}`,
    );
    return ok(res);
}

export const WhtCertificateService = {
    /** POST /api/finance/wht/certificate — ACCOUNT_PLATFORM / ADMIN. */
    recordCertificate: _whtRecord,
    /** GET /api/finance/wht/certificates?startDate=&endDate= */
    listCertificates: _whtList,
    /** GET /api/finance/wht/applicable/:invoiceId */
    isWhtApplicable: _whtApplicable,
    /** Alias consumed by R1-D's applicability-probe component. */
    checkApplicable: _whtApplicable,
};

// ── Shared formatters (small to keep clients self-contained) ─────────

/**
 * Format a numeric amount as Thai Baht with thousand separators.
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

/**
 * Format an ISO datetime/date as Thai short date (DD/MM/YYYY in
 * Buddhist era).
 */
export function formatThaiDate(iso: string | null | undefined): string {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleDateString('th-TH', {
            timeZone: THAI_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    } catch {
        return String(iso);
    }
}

/** First day of the current month as ISO yyyy-mm-dd. */
export function firstOfMonthIso(): string {
    // The 1st of the Bangkok month. The old local-midnight → toISOString() read
    // gave the last day of the previous month even in a Bangkok browser.
    return bangkokFirstOfMonthIso();
}

/** Today as ISO yyyy-mm-dd. */
export function todayIso(): string {
    return bangkokTodayIso(); // today in Bangkok, not UTC
}
