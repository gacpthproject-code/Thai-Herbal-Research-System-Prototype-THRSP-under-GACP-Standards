/**
 * ประตูยื่นคำขอปฏิเสธ 403 CONSENT_REQUIRED จนกว่าจะมีบันทึกความยินยอมสองใบ
 * และ wizard หกขั้นไม่มีที่ให้ผู้ยื่นให้ความยินยอมเลย ตั้งแต่ขั้น "ความยินยอม" ของรุ่นก่อน
 * ถูกลบไปพร้อมการกวาดล้าง ⇒ ไม่มีคำขอใดยื่นได้ (เดินจริง 2026-09-06)
 */
import { describe, expect, it } from '@jest/globals';
import {
    missingPlatformConsents, PLATFORM_CONSENT_CATEGORIES, PLATFORM_CONSENT_COPY_TH, platformConsentDocumentUrl, wordingNotices,
} from '../platform-consent';

describe('อ่านว่ายังขาดความยินยอมใบไหน', () => {
    it('ยังไม่เคยให้เลย = ขาดทั้งสองใบ', () => {
        expect(missingPlatformConsents({ consents: {} })).toEqual([...PLATFORM_CONSENT_CATEGORIES]);
    });

    it('ให้ครบแล้ว = ไม่ขาดอะไร', () => {
        expect(missingPlatformConsents({
            consents: { TERMS_OF_SERVICE: { granted: true }, PRIVACY_POLICY: { granted: true } },
        })).toEqual([]);
    });

    it('ให้ใบเดียว = ยังขาดอีกใบ และบอกว่าใบไหน', () => {
        expect(missingPlatformConsents({
            consents: { TERMS_OF_SERVICE: { granted: true }, PRIVACY_POLICY: { granted: false } },
        })).toEqual(['PRIVACY_POLICY']);
    });

    it('อ่านไม่ได้ = ถือว่ายังไม่ได้ให้ ไม่ใช่ถือว่าให้แล้ว', () => {
        expect(missingPlatformConsents(null)).toEqual([...PLATFORM_CONSENT_CATEGORIES]);
        expect(missingPlatformConsents({})).toEqual([...PLATFORM_CONSENT_CATEGORIES]);
        expect(missingPlatformConsents({ consents: undefined })).toEqual([...PLATFORM_CONSENT_CATEGORIES]);
    });

    it('ถอนความยินยอมแล้วต้องนับว่าขาด', () => {
        expect(missingPlatformConsents({
            consents: { TERMS_OF_SERVICE: { granted: false }, PRIVACY_POLICY: { granted: true } },
        })).toEqual(['TERMS_OF_SERVICE']);
    });
});

describe('order 160: the notice is acknowledged, the terms accepted, against the latest material edition', () => {
    const row = (standing: string, granted = true) => ({ granted, standing });

    it('a grant recorded before the latest material edition counts as missing', () => {
        expect(missingPlatformConsents({
            consents: { TERMS_OF_SERVICE: row('CURRENT'), PRIVACY_POLICY: row('MUST_ACKNOWLEDGE') },
        })).toEqual(['PRIVACY_POLICY']);
    });

    it('a newer wording edition is not missing; it is a notice', () => {
        const payload = {
            consents: {
                TERMS_OF_SERVICE: row('CURRENT'),
                PRIVACY_POLICY: { ...row('WORDING_NOTICE'), currentVersion: '1.4.1', currentEffectiveDate: '2026-11-10' },
            },
        };
        expect(missingPlatformConsents(payload)).toEqual([]);
        expect(wordingNotices(payload)).toEqual([{ category: 'PRIVACY_POLICY', version: '1.4.1', effectiveDate: '2026-11-10' }]);
    });

    it('"อ่านฉบับเต็ม" opens the real page, not the JSON door', () => {
        expect(platformConsentDocumentUrl('PRIVACY_POLICY')).toBe('/privacy-policy');
        expect(platformConsentDocumentUrl('TERMS_OF_SERVICE')).toBe('/terms-of-service');
    });

    it('the notice line says รับทราบ, never ยินยอม', () => {
        expect(PLATFORM_CONSENT_COPY_TH.PRIVACY_POLICY).toContain('รับทราบ');
        expect(PLATFORM_CONSENT_COPY_TH.PRIVACY_POLICY).not.toContain('ยินยอม');
        expect(PLATFORM_CONSENT_COPY_TH.TERMS_OF_SERVICE).toContain('ยอมรับ');
    });
});
