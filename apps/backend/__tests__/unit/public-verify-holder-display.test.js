/**
 * M1 Task B1: the certificate PDF names the HOLDER, not the person who typed.
 *
 * The PDF placeholder map (services/pdf/certificate-template-service.js) prefers
 * `holderDisplayName` and falls back to `applicantName` for rows issued before the
 * backfill. The PDF is the legal document and is never masked.
 *
 * The public verify door publishes no person's name at all (operator order 68(1));
 * that rule is pinned in public-verify-order-68-scope.test.js.
 */

'use strict';

jest.mock('../../shared/logger', () => {
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...log, createLogger: jest.fn(() => log), stream: { write: jest.fn() } };
});

// The PDF service pulls in Puppeteer / MinIO at require time; the mapper under
// test (`buildCertificateContext`) is pure, so the heavy deps are stubbed.
jest.mock('qrcode', () => ({
    toDataURL: jest.fn(async () => 'data:image/png;base64,FAKEQR=='),
}));
jest.mock('../../services/pdf/pdf-generator.service', () => ({
    generatePDF: jest.fn(async () => Buffer.from('%PDF-FAKE')),
    replaceTemplateVariables: jest.fn((template) => template),
    readTemplateCached: jest.fn(() => ''),
}));
jest.mock('../../services/storage-service', () => ({
    BUCKETS: { certificates: 'certificates' },
    uploadBuffer: jest.fn(async () => ({ ok: true })),
    getSignedDownloadUrl: jest.fn(async () => 'https://example/signed-url'),
}));

const { buildCertificateContext } = require('../../services/pdf/certificate-template-service');

describe('PDF placeholder map — APPLICANT_NAME carries the holder', () => {
    const PDF_CERT = Object.freeze({
        certificateNumber: 'GACP-TH-2569-A3F7B2',
        applicantName: 'สมชาย ใจดี',
        issuedDate: new Date('2026-05-16T03:00:00Z'),
        expiryDate: new Date('2027-05-16T03:00:00Z'),
    });

    it('prints the holder name when holderDisplayName is set', () => {
        const ctx = buildCertificateContext({
            ...PDF_CERT,
            holderDisplayName: 'บริษัท สมุนไพรไทย จำกัด',
            holderType: 'JURISTIC',
        });
        // The PDF is the legal document — it is never masked.
        expect(ctx.APPLICANT_NAME).toBe('บริษัท สมุนไพรไทย จำกัด');
    });

    it('falls back to applicantName for pre-backfill rows, then to "-"', () => {
        expect(buildCertificateContext({ ...PDF_CERT }).APPLICANT_NAME).toBe('สมชาย ใจดี');
        expect(buildCertificateContext({ ...PDF_CERT, applicantName: null }).APPLICANT_NAME).toBe('-');
    });
});
