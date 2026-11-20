import { describe, expect, it } from '@jest/globals';
import { lapsedRenewalSentence } from '../renewal-wording';

const LAPSED = {
    successorCertificateNumber: 'TH-GACP 9/2569',
    verifyUrl: 'https://example.test/verify/TH-GACP-9-2569',
    successorIssuedDate: '2026-10-21T03:00:00.000Z',
    lapsedBeforeRenewal: true,
    expiredOn: '2026-09-01T03:00:00.000Z',
};

describe('order 126(b): the sentence for a certificate that expired before its renewal', () => {
    it('names the expiry day, the new number and the day the new one took effect, in Buddhist-era dates', () => {
        expect(lapsedRenewalSentence(LAPSED)).toBe('หมดอายุเมื่อ 01 ก.ย. 2569 · มีใบรับรองฉบับใหม่ TH-GACP 9/2569 มีผลตั้งแต่ 21 ต.ค. 2569');
    });

    it('says nothing for a renewal before expiry, or for no renewal', () => {
        expect(lapsedRenewalSentence({ ...LAPSED, lapsedBeforeRenewal: false, expiredOn: null })).toBeNull();
        expect(lapsedRenewalSentence(null)).toBeNull();
    });
});
