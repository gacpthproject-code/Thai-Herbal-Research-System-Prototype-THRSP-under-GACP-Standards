/**
 * Operator order 68(1), on the certificate-number door GET /verify/:certificateNumber:
 *   - a "ขอบเขตการรับรอง" made of the crop, the cultivation type in Thai and the standard,
 *     read from the certificate's own scope rows;
 *   - purposes (research, export, processing) are never sent;
 *   - issuingAuthority is the order-56(0) future-tense sentence;
 *   - no person's name is sent, masked or not; a company holder's name stays.
 */

'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../../shared/logger', () => {
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...log, createLogger: jest.fn(() => log), stream: { write: jest.fn() } };
});
jest.mock('../../middleware/rate-limiter', () => ({
    createRateLimiter: () => (_req, _res, next) => next(),
}));

const mockFindByCertificateNumber = jest.fn();
jest.mock('../../services/certificate-service', () => ({
    findByCertificateNumber: (...args) => mockFindByCertificateNumber(...args),
    verifyDocumentIntegrity: () => ({ status: 'VALID' }),
    verifyCertificateSignature: async () => ({ signed: false }),
}));

const publicRouter = require('../../routes/api/auth/public');

const ISSUER_SENTENCE =
    'ใบรับรองจะออกโดยกรมการแพทย์แผนไทยและการแพทย์ทางเลือก เมื่อระบบเปิดให้บริการอย่างเป็นทางการ';
const PERSON = 'สมชาย ใจดี';
const COMPANY = 'บริษัท สมุนไพรทดสอบ จำกัด';

function app() {
    const a = express();
    a.use('/', publicRouter);
    return a;
}

function certRow({ areaType = 'OUTDOOR', scopeStatus = 'active', ...over } = {}) {
    return {
        certificateNumber: 'TH-GACP 1/2569',
        verificationCode: 'V1',
        status: 'active',
        issuedDate: new Date('2026-09-09T03:00:00Z'),
        expiryDate: new Date(Date.now() + 300 * 24 * 3600e3),
        farmName: 'ไร่ทดสอบสาธิต',
        applicantName: PERSON,
        holderType: 'JURISTIC',
        holderDisplayName: COMPANY,
        province: 'เชียงใหม่',
        cropType: 'กัญชา',
        standardName: 'GACP Thailand',
        scopes: [{ areaType, status: scopeStatus }],
        application: { formData: { purposes: ['RESEARCH', 'EXPORT', 'PROCESSING'] } },
        ...over,
    };
}

async function verify(row) {
    mockFindByCertificateNumber.mockResolvedValue(row);
    const res = await request(app()).get('/verify/TH-GACP-1-2569');
    expect(res.status).toBe(200);
    return res;
}

beforeEach(() => mockFindByCertificateNumber.mockReset());

describe('order 68(1): the scope line of a certificate in force', () => {
    it.each([
        ['OUTDOOR', 'ปลูกกลางแจ้ง'],
        ['GREENHOUSE', 'ปลูกในโรงเรือน'],
        ['INDOOR', 'ปลูกในอาคาร'],
    ])('%s is "%s", between the crop and the standard', async (areaType, labelTh) => {
        const res = await verify(certRow({ areaType }));
        expect(res.body.data.certificate.scope).toEqual({
            crop: 'กัญชา',
            cultivationTypes: [{ code: areaType, labelTh }],
            standard: 'GACP Thailand',
        });
    });

    it('a scope row withdrawn from the certificate is not shown as certified', async () => {
        const res = await verify(certRow({ areaType: 'INDOOR', scopeStatus: 'suspended' }));
        expect(res.body.data.certificate.scope.cultivationTypes).toEqual([]);
    });

    it('the purposes on the application are never sent', async () => {
        const res = await verify(certRow());
        expect(res.text).not.toMatch(/RESEARCH|EXPORT|PROCESSING|purpose/i);
    });

    it('issuingAuthority is the order-56(0) future-tense sentence', async () => {
        const res = await verify(certRow());
        expect(res.body.data.certificate.issuingAuthority).toBe(ISSUER_SENTENCE);
        expect(res.text).not.toContain('ระบบรับรองมาตรฐาน GACP สมุนไพร');
    });

    it('crop and standard are said once, inside the scope', async () => {
        const res = await verify(certRow());
        expect(res.body.data.certificate).not.toHaveProperty('cropTypes');
        expect(res.body.data.certificate).not.toHaveProperty('standards');
    });
});

describe('order 68(1): no person\'s name, masked or not', () => {
    it.each([
        ['JURISTIC', COMPANY, COMPANY],
        ['COMMUNITY_ENTERPRISE', 'วิสาหกิจชุมชนสมุนไพรบ้านนา', 'วิสาหกิจชุมชนสมุนไพรบ้านนา'],
        ['INDIVIDUAL', PERSON, null],
        ['LEGACY_PERSON', PERSON, null],
        [null, null, null],
    ])('holder type %s named %s is published as %s', async (holderType, holderDisplayName, shown) => {
        const res = await verify(certRow({ holderType, holderDisplayName }));
        expect(res.body.data.certificate.holderDisplayName).toBe(shown);
        expect(res.body.data.certificate).not.toHaveProperty('applicantName');
        expect(res.text).not.toContain('สมชาย');
    });
});

describe('a certificate not in force carries no scope', () => {
    it.each([
        ['suspended', { status: 'suspended' }, 'SUSPENDED'],
        ['revoked', { status: 'revoked' }, 'REVOKED'],
        ['expired', { expiryDate: new Date('2025-01-01T00:00:00Z') }, 'EXPIRED'],
    ])('%s: certificate is null, so no scope, holder or issuer is sent', async (_label, over, reasonCode) => {
        const res = await verify(certRow(over));
        expect(res.body.verified).toBe(false);
        expect(res.body.data.reasonCode).toBe(reasonCode);
        expect(res.body.data.certificate).toBeNull();
        expect(res.text).not.toMatch(/ปลูก|สมชาย|บริษัท/);
    });
});

describe('the projection both public doors share', () => {
    const { PUBLIC_CERTIFICATE_FACTS_SELECT, publicCertificateFacts } = require('../../services/certificate/public-facts');
    const { AREA_TYPES, AREA_TYPE_SCOPE_LABEL_TH } = require('../../validation/canonical-application-validator');

    /** A row that throws on any column the select did not ask for, the way Prisma leaves it undefined. */
    const selectedOnly = (row, select) => new Proxy(row, {
        get(target, key) {
            if (typeof key === 'string' && !(key in select)) {
                throw new Error(`read "${key}", which the select does not ask for`);
            }
            return target[key];
        },
    });

    it('reads no certificate column its select does not ask for', () => {
        const rows = [{ areaType: 'INDOOR', status: 'active' }]
            .map((row) => selectedOnly(row, PUBLIC_CERTIFICATE_FACTS_SELECT.scopes.select));
        const certificate = selectedOnly(
            { cropType: 'กัญชา', standardName: 'GACP Thailand', scopes: rows },
            PUBLIC_CERTIFICATE_FACTS_SELECT,
        );
        expect(publicCertificateFacts(certificate).scope.cultivationTypes).toEqual([{ code: 'INDOOR', labelTh: 'ปลูกในอาคาร' }]);
    });

    it('has a scope word for every cultivation type in the register, and for no other', () => {
        expect(Object.keys(AREA_TYPE_SCOPE_LABEL_TH)).toEqual([...AREA_TYPES]);
    });
});
