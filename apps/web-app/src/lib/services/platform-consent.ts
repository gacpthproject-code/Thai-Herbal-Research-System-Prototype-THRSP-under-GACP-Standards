/**
 * นโยบายความเป็นส่วนตัว (รับทราบ ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ม.23) และข้อกำหนดการใช้บริการ (ยอมรับ)
 *
 * คนละอย่างกับคำรับรอง ส่วนที่ ๔ ของ กทล.1 ซึ่งเป็นคำรับรองต่อกรมฯ เกี่ยวกับตัวคำขอ
 * หลังบ้านปฏิเสธการยื่นคำขอด้วย 403 `CONSENT_REQUIRED` จนกว่าทั้งสองใบจะบันทึกไว้ที่ฉบับสาระสำคัญล่าสุด
 * (คำสั่ง 160) · หลังบ้านเป็นผู้ตัดสิน `standing` ของแต่ละใบ หน้านี้อ่านค่านั้นอย่างเดียว ไม่คิดเอง
 *
 * เก็บเป็นสองใบแยกกัน ไม่ยุบเป็นติ๊กเดียว: หลังบ้านบันทึกเป็นคนละหมวด มีเลขฉบับของตัวเอง
 * และการรับทราบการแจ้งกับการยอมรับข้อตกลงเป็นคนละเรื่อง
 */
import { api } from '@/lib/api/api-client';

export const PLATFORM_CONSENT_CATEGORIES = Object.freeze([
    'TERMS_OF_SERVICE',
    'PRIVACY_POLICY',
] as const);

export type PlatformConsentCategory = (typeof PLATFORM_CONSENT_CATEGORIES)[number];

export const PLATFORM_CONSENT_COPY_TH: Record<PlatformConsentCategory, string> = Object.freeze({
    TERMS_OF_SERVICE: 'ข้าพเจ้ายอมรับข้อกำหนดการใช้บริการของระบบรับรองมาตรฐาน GACP',
    PRIVACY_POLICY: 'ข้าพเจ้าได้อ่านและรับทราบนโยบายความเป็นส่วนตัวแล้ว',
});

export const LEGAL_DOCUMENT_TITLE_TH: Record<PlatformConsentCategory, string> = Object.freeze({
    TERMS_OF_SERVICE: 'ข้อกำหนดการใช้บริการ',
    PRIVACY_POLICY: 'นโยบายความเป็นส่วนตัว',
});

const DOCUMENT_PAGES: Record<PlatformConsentCategory, string> = Object.freeze({
    TERMS_OF_SERVICE: '/terms-of-service',
    PRIVACY_POLICY: '/privacy-policy',
});

export function platformConsentDocumentUrl(category: PlatformConsentCategory): string {
    return DOCUMENT_PAGES[category];
}

export type LegalDocumentStanding = 'CURRENT' | 'WORDING_NOTICE' | 'MUST_ACKNOWLEDGE';

type ConsentRow = {
    granted?: boolean;
    standing?: LegalDocumentStanding | null;
    currentVersion?: string | null;
    currentEffectiveDate?: string | null;
};
type ConsentsPayload = { consents?: Record<string, ConsentRow> };

export type PendingEdition = { category: PlatformConsentCategory; version: string; effectiveDate: string };

export function missingPlatformConsents(payload: ConsentsPayload | null | undefined): PlatformConsentCategory[] {
    const consents = payload?.consents;
    if (!consents || typeof consents !== 'object') { return [...PLATFORM_CONSENT_CATEGORIES]; }
    return PLATFORM_CONSENT_CATEGORIES.filter((category) => consents[category]?.granted !== true
        || consents[category]?.standing === 'MUST_ACKNOWLEDGE');
}

function editionsWith(payload: ConsentsPayload | null | undefined, pick: (row: ConsentRow) => boolean): PendingEdition[] {
    const consents = payload?.consents;
    if (!consents || typeof consents !== 'object') { return []; }
    return PLATFORM_CONSENT_CATEGORIES.flatMap((category) => {
        const row = consents[category];
        if (!row || !pick(row) || !row.currentVersion || !row.currentEffectiveDate) { return []; }
        return [{ category, version: row.currentVersion, effectiveDate: row.currentEffectiveDate }];
    });
}

export function editionsToAcknowledge(payload: ConsentsPayload | null | undefined): PendingEdition[] {
    const missing = new Set(missingPlatformConsents(payload));
    return editionsWith(payload, () => true).filter((edition) => missing.has(edition.category));
}

export function wordingNotices(payload: ConsentsPayload | null | undefined): PendingEdition[] {
    return editionsWith(payload, (row) => row.granted === true && row.standing === 'WORDING_NOTICE');
}

export async function readConsentsPayload(): Promise<ConsentsPayload | null> {
    const response = await api.get<ConsentsPayload>('/consent');
    return response.success ? response.data ?? null : null;
}

export async function readPlatformConsents(): Promise<PlatformConsentCategory[]> {
    return missingPlatformConsents(await readConsentsPayload());
}

export type ConsentScreen = 'APPLICATION_REVIEW' | 'UPDATE_PROMPT' | 'WORDING_NOTICE';

export async function grantPlatformConsents(
    categories: readonly PlatformConsentCategory[],
    source: ConsentScreen,
): Promise<PlatformConsentCategory[]> {
    const failed: PlatformConsentCategory[] = [];
    for (const category of categories) {
        const response = await api.post<{ granted?: boolean }>('/consent', { category, granted: true, source });
        if (!response.success) { failed.push(category); }
    }
    return failed;
}
