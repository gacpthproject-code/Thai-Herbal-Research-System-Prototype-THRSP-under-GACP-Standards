export const PAYMENT_MODE_PATH = '/api/payments/mode';

export interface TrialPaymentCopy {
    notice: string;
    documentMark: string;
    documentMarkDetail: string;
}

/** The mode a settlement recorded on its row: TRIAL or LIVE once money moved, null before. */
export type SettledPaymentMode = 'TRIAL' | 'LIVE' | null;

/** The key of the day, with the trial copy served in both modes for documents recorded in test mode. */
export type PaymentMode =
    | { mode: 'TRIAL' | 'LIVE'; copy: TrialPaymentCopy }
    | { mode: 'UNKNOWN' };

export const UNKNOWN_PAYMENT_MODE: PaymentMode = { mode: 'UNKNOWN' };

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function parsePaymentMode(data: unknown): PaymentMode {
    if (!data || typeof data !== 'object') return UNKNOWN_PAYMENT_MODE;
    const d = data as Record<string, unknown>;
    if (d.mode !== 'TRIAL' && d.mode !== 'LIVE') return UNKNOWN_PAYMENT_MODE;
    if (!isText(d.notice) || !isText(d.documentMark) || !isText(d.documentMarkDetail)) return UNKNOWN_PAYMENT_MODE;
    return {
        mode: d.mode,
        copy: { notice: d.notice, documentMark: d.documentMark, documentMarkDetail: d.documentMarkDetail },
    };
}

/** A row's recorded settlement mode from the wire; anything else is no record. */
export function parseSettledPaymentMode(value: unknown): SettledPaymentMode {
    return value === 'TRIAL' || value === 'LIVE' ? value : null;
}
