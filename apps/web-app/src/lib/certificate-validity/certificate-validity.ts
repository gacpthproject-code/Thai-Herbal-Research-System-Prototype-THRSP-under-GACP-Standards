/**
 * How long a certificate issued today lasts, as GET /api/certificate-validity serves it.
 *
 * The term is dated data on the backend (certificate_validity_rules, operator 2026-10-06:
 * "1 ปีไปก่อน อาจเปลี่ยน"): issuance reads the rule in force on the issue date, and the
 * endpoint answers the rule in force now. The web keeps no copy of the number. When the
 * answer cannot be read, a screen says the term is printed on each certificate, which is
 * true whatever the rule is, instead of a remembered number.
 *
 * A page that shows ONE certificate states that certificate's own issue-to-expiry span
 * (app/health/certificates/validity-years.ts), never this rule: a certificate keeps the
 * term it was issued with.
 */

export const CERTIFICATE_VALIDITY_PATH = '/api/certificate-validity';

export interface CertificateValidity {
    /** Term of a certificate issued now, in calendar months. */
    months: number;
    /** ISO instant the rule took effect. */
    effectiveFrom: string;
}

export type ValidityState =
    | { status: 'loading' }
    | { status: 'ready'; validity: CertificateValidity }
    | { status: 'unavailable' };

export const VALIDITY_LOADING_TH = 'กำลังโหลดอายุใบรับรอง';

/** True under any rule, so it is what a screen says when the rule cannot be read. */
export const VALIDITY_UNAVAILABLE_TH = 'อายุใบรับรองระบุไว้บนใบรับรองแต่ละฉบับ';

export function parseCertificateValidity(data: unknown): CertificateValidity | null {
    if (!data || typeof data !== 'object') return null;
    const { months, effectiveFrom } = data as Record<string, unknown>;
    if (typeof months !== 'number' || !Number.isInteger(months) || months <= 0) return null;
    if (typeof effectiveFrom !== 'string' || !Number.isFinite(Date.parse(effectiveFrom))) return null;
    return { months, effectiveFrom };
}

/** "1 ปี", "3 ปี", "18 เดือน" */
export function validityTermTh(months: number): string {
    return months % 12 === 0 ? `${months / 12} ปี` : `${months} เดือน`;
}

/** "ใบรับรองมีอายุ 1 ปี นับจากวันที่ออก", or the notice when there is no served rule. */
export function certificateValidityTh(state: ValidityState): string {
    if (state.status === 'ready') {
        return `ใบรับรองมีอายุ ${validityTermTh(state.validity.months)} นับจากวันที่ออก`;
    }
    return state.status === 'loading' ? VALIDITY_LOADING_TH : VALIDITY_UNAVAILABLE_TH;
}
