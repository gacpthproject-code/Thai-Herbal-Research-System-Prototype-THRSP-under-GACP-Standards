'use strict';

/**
 * อายุใบรับรองเป็นข้อมูลที่มีวันมีผล (redesign phase 0, operator 2026-10-06)
 *
 * The rule read itself (latest effectiveFrom at or before the issue instant, a later rule leaves
 * an issued certificate alone) is proved on a real database by
 * __tests__/integration/redesign-p0-real-postgres.test.js. This file pins what needs no database:
 * the calendar arithmetic of a term, the refusal when no rule is in force, and that moving the
 * stored term from years to months leaves every signed certificate's hash unchanged.
 */

const { addLocalMonths } = require('../../utils/working-days');
const { validityRuleAt, certificateTermAt } = require('../../services/certificate-validity-rule-service');
const certificateService = require('../../services/certificate-service');
const { computeLookupHmac } = require('../../utils/field-encryption');

describe('a term is calendar months at the same Bangkok wall-clock time', () => {
    it.each([
        ['2026-10-06T03:04:05.000Z', 12, '2027-10-06T03:04:05.000Z'],
        ['2026-10-06T03:04:05.000Z', 36, '2029-10-06T03:04:05.000Z'],
        ['2026-10-06T03:04:05.000Z', 18, '2028-04-06T03:04:05.000Z'],
        // 29 Feb rolls to 1 Mar, as the retired whole-year path did.
        ['2028-02-29T05:00:00.000Z', 12, '2029-03-01T05:00:00.000Z'],
        // 01:00 on 1 Jan in Bangkok is still 31 Dec in UTC: the month counted is Bangkok's.
        ['2026-12-31T18:00:00.000Z', 1, '2027-01-31T18:00:00.000Z'],
    ])('%s + %i months = %s', (issued, months, expiry) => {
        expect(addLocalMonths(new Date(issued), months).toISOString()).toBe(expiry);
    });
});

describe('no rule in force, no certificate', () => {
    const empty = { certificateValidityRule: { findFirst: async () => null } };

    it('validityRuleAt refuses with a named code instead of inventing a term', async () => {
        await expect(validityRuleAt(new Date('2026-10-06T00:00:00Z'), { client: empty }))
            .rejects.toMatchObject({ code: 'CERTIFICATE_VALIDITY_RULE_MISSING', statusCode: 503 });
    });

    it('certificateTermAt carries the rule months and the expiry they give', async () => {
        const client = {
            certificateValidityRule: {
                findFirst: async () => ({ id: 'r', months: 36, effectiveFrom: new Date('2026-01-01T00:00:00Z') }),
            },
        };
        await expect(certificateTermAt(new Date('2026-10-06T03:04:05.000Z'), { client })).resolves.toEqual({
            validityMonths: 36,
            expiryDate: new Date('2029-10-06T03:04:05.000Z'),
        });
    });
});

describe('the signed field list did not move with the column', () => {
    const row = {
        certificateNumber: 'TH-GACP 1/2569',
        verificationCode: 'ABCD1234',
        applicationId: 'app-1',
        userId: 'user-1',
        farmId: 'farm-1',
        farmName: 'ฟาร์มทดสอบ',
        applicantName: 'ทดสอบ ระบบ',
        cropType: 'กัญชา',
        farmSize: 5.5,
        province: 'เชียงราย',
        district: 'เมือง',
        subDistrict: 'รอบเวียง',
        standardName: 'GACP Thailand',
        standardId: 'GACP-TH',
        issuedDate: new Date('2026-05-16T03:00:00Z'),
        expiryDate: new Date('2029-05-16T03:00:00Z'),
        issuedBy: 'provider-1',
    };

    it('a 36-month row hashes exactly as the 3-year row it was signed as', () => {
        // The canonical JSON as it was before the column moved, written out here, not
        // produced by the code under test.
        const signedJson = JSON.stringify({
            certificateNumber: row.certificateNumber,
            verificationCode: row.verificationCode,
            applicationId: row.applicationId,
            userId: row.userId,
            farmId: row.farmId,
            farmName: row.farmName,
            applicantName: row.applicantName,
            cropType: row.cropType,
            farmSize: row.farmSize,
            province: row.province,
            district: row.district,
            subDistrict: row.subDistrict,
            standardName: row.standardName,
            standardId: row.standardId,
            validityYears: 3,
            issuedDate: row.issuedDate.toISOString(),
            expiryDate: row.expiryDate.toISOString(),
            issuedBy: row.issuedBy,
        });
        const signedHash = `hmac-sha256:${computeLookupHmac(`gacp-cert-integrity:v1:${signedJson}`)}`;
        expect(certificateService.buildCertificateDocumentHash({ ...row, validityMonths: 36 })).toBe(signedHash);
    });

    it('a different term is a different hash', () => {
        expect(certificateService.buildCertificateDocumentHash({ ...row, validityMonths: 12 }))
            .not.toBe(certificateService.buildCertificateDocumentHash({ ...row, validityMonths: 36 }));
    });
});
