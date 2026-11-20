/**
 * Operator order 65(2), 2026-10-09: a filing names the person on site, name AND a Thai phone number,
 * because the dispatcher books the visit and the field inspector meets them through that contact and
 * no other (orders 29 and 56(3)). When the contact is someone other than the applicant, the applicant
 * confirms having told them. The submit door asks exactly what the wizard asks (one rule,
 * @gacp/validation/site-contact).
 */

'use strict';

const { isThaiPhoneNumber, siteContactComplete } = require('@gacp/validation/site-contact');
const { validateCanonicalSubmission } = require('../../validation/canonical-application-validator');

const DOCS = [{ uploaded: true, url: '/uploads/application-documents/x.pdf' }];
const ME = { siteContactName: 'สมชาย ใจดี', sitePhone: '081-234-5678', siteContactIsApplicant: true };

function v2Filing(farmOverrides = {}) {
    return {
        plantId: 'cannabis',
        serviceType: 'new_application',
        certificationPurposes: ['EXPORT'],
        cultivationMethods: ['OUTDOOR'],
        applicantData: { applicantType: 'INDIVIDUAL', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '0005550001110', phone: '0812345678', address: 'ที่อยู่' },
        applicantType: 'INDIVIDUAL',
        farmData: {
            siteName: 'ฟาร์มทดสอบ', siteAddress: '12 หมู่ 3', areaSqm: '800', areaTypes: ['OUTDOOR'],
            province: 'เชียงใหม่', district: 'สันทราย', subDistrict: 'หนองหาร', postalCode: '50290',
            landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '12345' }, coordinates: '13.6069, 100.7061', plantsPerCycle: '500', cyclesPerYear: '2',
            ...ME,
            ...farmOverrides,
        },
        varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],
    };
}

describe('a Thai phone number', () => {
    test.each(['0812345678', '081-234-5678', '091 234 5678', '0612345678', '02-123-4567', '053111222', '+66812345678', '(02) 123 4567'])('%s is one', (value) => {
        expect(isThaiPhoneNumber(value)).toBe(true);
    });
    test.each(['', '12345', '0812', '08123456789', '1812345678', '0012345678', 'โทรมาได้', '081234567x', null, 12345])('%s is not', (value) => {
        expect(isThaiPhoneNumber(value)).toBe(false);
    });
});

describe('the on-site contact is complete', () => {
    test('with a name, a Thai phone, and the applicant themself', () => {
        expect(siteContactComplete(ME)).toBe(true);
    });
    test('with someone else, only once the applicant confirms having told them', () => {
        const other = { siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '0865556666', siteContactIsApplicant: false };
        expect(siteContactComplete(other)).toBe(false);
        expect(siteContactComplete({ ...other, siteContactInformed: true })).toBe(true);
    });
    test('never without a name or with a phone that is not a Thai number', () => {
        expect(siteContactComplete({ ...ME, siteContactName: '  ' })).toBe(false);
        expect(siteContactComplete({ ...ME, sitePhone: '12345' })).toBe(false);
        expect(siteContactComplete(null)).toBe(false);
    });
});

describe('the submit door asks the same', () => {
    test('a filing with the applicant as the contact is valid', () => {
        expect(validateCanonicalSubmission(v2Filing(), DOCS)).toMatchObject({ isValid: true, errorsByStep: {} });
    });
    test('a filing with no contact names both fields', () => {
        const v = validateCanonicalSubmission(v2Filing({ siteContactName: undefined, sitePhone: undefined, siteContactIsApplicant: undefined }), DOCS);
        expect(v.isValid).toBe(false);
        expect(v.missingFields).toEqual(expect.arrayContaining(['step5.site_contact_name', 'step5.site_phone']));
    });
    test('a phone that is not a Thai number is refused', () => {
        const v = validateCanonicalSubmission(v2Filing({ sitePhone: '12345' }), DOCS);
        expect(v.missingFields).toContain('step5.site_phone');
    });
    test('someone else as the contact needs the applicant\'s confirmation', () => {
        const other = { siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '0865556666', siteContactIsApplicant: false };
        expect(validateCanonicalSubmission(v2Filing(other), DOCS).missingFields).toContain('step5.site_contact_informed');
        expect(validateCanonicalSubmission(v2Filing({ ...other, siteContactInformed: true }), DOCS).isValid).toBe(true);
    });
});
