'use strict';

/**
 * Payment terms v1.3 §7.2.1 (ง), operator 2026-10-06: the company owes the field
 * inspection within 60 working days of the milestone-2 payment, counted on
 * Bangkok business days with the Thai public holidays skipped. The window is a
 * property of the terms version stamped on the payment; an older version has
 * none, and a version the table does not know is refused, never read as "none".
 */

const {
    PAYMENT_TERMS_VERSIONS,
    PROVIDER_CANCELLATION_REASONS,
    companyInspectionDeadline,
    providerCancellationReasonText,
} = require('../../shared/refund-kinds');
const { ConsentVersions } = require('../../middleware/consent-manager');

const V13 = 'payment-terms-th-v1.3';
const bangkokDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);

describe('the company inspection window', () => {
    it('only v1.3 sets a window, of 60 working days', () => {
        expect(PAYMENT_TERMS_VERSIONS).toEqual({
            '1.0.0': { companyInspectWorkingDays: null },
            'payment-terms-th-v1.1': { companyInspectWorkingDays: null },
            'payment-terms-th-v1.2': { companyInspectWorkingDays: null },
            [V13]: { companyInspectWorkingDays: 60 },
        });
    });

    it('the version payments are stamped with today is in the table', () => {
        expect(Object.keys(PAYMENT_TERMS_VERSIONS)).toContain(ConsentVersions.PAYMENT_TERMS);
    });

    it('a payment on Wed 7 Oct 2026 is due by the end of Thu 7 Jan 2027 in Bangkok (6 holidays skipped)', () => {
        const due = companyInspectionDeadline(new Date('2026-10-07T03:00:00Z'), V13);
        expect(due.toISOString()).toBe('2027-01-07T16:59:59.999Z');
        expect(bangkokDate(due)).toBe('2027-01-07');
    });

    it('counts from the Bangkok date of the payment, not the UTC date', () => {
        const lateNightBangkok = new Date('2026-10-07T20:00:00Z');
        expect(bangkokDate(companyInspectionDeadline(lateNightBangkok, V13))).toBe('2027-01-08');
    });

    it('a payment under an older version, or with no payment date, has no window', () => {
        expect(companyInspectionDeadline(new Date('2026-10-07T03:00:00Z'), 'payment-terms-th-v1.2')).toBeNull();
        expect(companyInspectionDeadline(null, V13)).toBeNull();
    });

    it.each(['payment-terms-v1.3', 'payment-terms-th-v1.3 ', null, undefined])(
        'a version the table does not know (%p) is refused, not read as "no window"',
        (version) => {
            expect(() => companyInspectionDeadline(new Date('2026-10-07T03:00:00Z'), version))
                .toThrow(expect.objectContaining({ code: 'REFUND_TERMS_VERSION_UNKNOWN', statusCode: 409 }));
            expect(() => providerCancellationReasonText('COMPANY_CANNOT_INSPECT', version))
                .toThrow(expect.objectContaining({ code: 'REFUND_TERMS_VERSION_UNKNOWN' }));
        },
    );

    it('the reason finance picks states the window of the newest version', () => {
        expect(PROVIDER_CANCELLATION_REASONS.COMPANY_CANNOT_INSPECT).toContain('ภายใน 60 วันทำการ นับจากวันที่ชำระเงินงวดที่ 2');
    });

    it('the reason printed for a payment states the window of that payment\'s version, and none when it had none', () => {
        expect(providerCancellationReasonText('COMPANY_CANNOT_INSPECT', V13)).toBe(PROVIDER_CANCELLATION_REASONS.COMPANY_CANNOT_INSPECT);
        const v12 = providerCancellationReasonText('COMPANY_CANNOT_INSPECT', 'payment-terms-th-v1.2');
        expect(v12).not.toMatch(/วันทำการ/);
        expect(v12).toBe('บริษัทไม่สามารถตรวจประเมินแปลงได้ ด้วยเหตุฝ่ายบริษัท เช่น ไม่มีผู้ตรวจที่จะไปตรวจได้');
        expect(providerCancellationReasonText('COMPANY_STOPPED_SERVICE', undefined)).toBe(PROVIDER_CANCELLATION_REASONS.COMPANY_STOPPED_SERVICE);
    });
});
