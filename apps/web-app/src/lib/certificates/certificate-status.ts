/**
 * Every screen that shows a certificate status reads its label here: the staging walk of
 * ccc4f707d saw "renewed" in English on two pages that each kept their own list.
 */

export type CertificateStatusKey =
    | 'active'
    | 'expired'
    | 'revoked'
    | 'suspended'
    | 'renewed'
    | 'unknown';

const KNOWN_STATUSES: ReadonlyArray<Exclude<CertificateStatusKey, 'unknown'>> = [
    'active',
    'expired',
    'revoked',
    'suspended',
    'renewed',
];

export function normalizeCertificateStatus(raw: string | null | undefined): CertificateStatusKey {
    const lower = String(raw || '').trim().toLowerCase();
    return (KNOWN_STATUSES as ReadonlyArray<string>).includes(lower)
        ? (lower as CertificateStatusKey)
        : 'unknown';
}

/** The words the operator approved for the approver's tools (orders 29 and 34(4)): พักใช้, เพิกถอน. */
export const CERTIFICATE_STATUS_LABEL_TH: Readonly<Record<CertificateStatusKey, string>> = Object.freeze({
    active: 'กำลังใช้งาน',
    expired: 'หมดอายุ',
    revoked: 'เพิกถอนแล้ว',
    suspended: 'พักใช้',
    renewed: 'ต่ออายุแล้ว',
    unknown: 'ไม่ทราบสถานะ',
});

export function certificateStatusLabelTh(raw: string | null | undefined): string {
    return CERTIFICATE_STATUS_LABEL_TH[normalizeCertificateStatus(raw)];
}
