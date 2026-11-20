'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('qrcode', () => ({
    toDataURL: jest.fn(async () => 'data:image/png;base64,FAKEQR=='),
}));

const mockGeneratedHtmls = [];
jest.mock('../../services/pdf/pdf-generator.service', () => {
    const mockFs = require('fs');
    return {
        generatePDF: jest.fn(async (html) => {
            mockGeneratedHtmls.push(html);
            return Buffer.from(`%PDF-FAKE-${html.length}`);
        }),
        replaceTemplateVariables: jest.fn((template, data) => template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
            const v = data[key];
            return v === undefined ? m : String(v);
        })),
        readTemplateCached: jest.fn((p) => mockFs.readFileSync(p, 'utf-8')),
    };
});

jest.mock('../../shared/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { buildCertificateContext, generateCertificatePdf } = require('../../services/pdf/certificate-template-service');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'services', 'pdf', 'templates', 'certificate.html');

const HOLDER = 'บริษัท สมุนไพรไทย จำกัด';
const BASE_CERT = Object.freeze({
    certificateNumber: 'GACP-TH-2569-A3F7B2',
    verificationCode: 'A1B2C3D4',
    qrData: 'https://gacpth.com/verify/GACP-TH-2569-A3F7B2',
    holderDisplayName: HOLDER,
    cropType: 'กัญชา / Cannabis sativa L.',
    farmName: 'ฟาร์มสมุนไพรสมชาย',
    province: 'เชียงราย',
    district: 'เมือง',
    subDistrict: 'รอบเวียง',
    address: 'หมู่ 1',
    standardName: 'GACP Thailand',
    issuedDate: new Date('2026-05-16T03:00:00Z'),
    expiryDate: new Date('2027-05-16T03:00:00Z'),
});

const holderLineOf = (html) => {
    const match = html.match(/<div class="holder-id">([^<]*)<\/div>/);
    return match ? match[1] : null;
};

describe('certificate PDF: the holder line without an id', () => {
    beforeEach(() => { mockGeneratedHtmls.length = 0; });

    it('HOLDER_ID_SUFFIX is empty when the holder has no id', () => {
        expect(buildCertificateContext(BASE_CERT).HOLDER_ID_SUFFIX).toBe('');
    });

    it('HOLDER_ID_SUFFIX carries the separator and the masked id when one exists', () => {
        expect(buildCertificateContext({ ...BASE_CERT, applicantId: '1234567890123' }).HOLDER_ID_SUFFIX).toBe(' · 1-XXXX-XXXX-X-0123');
    });

    it('the template prints the suffix placeholder right after the holder name', () => {
        const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
        expect(template).toContain('<div class="holder-id">ผู้ถือใบรับรอง: {{APPLICANT_NAME}}{{HOLDER_ID_SUFFIX}}</div>');
    });

    it('renders "ผู้ถือใบรับรอง: <name>" and nothing after the name when no id exists', async () => {
        await generateCertificatePdf(BASE_CERT);
        expect(holderLineOf(mockGeneratedHtmls[0])).toBe(`ผู้ถือใบรับรอง: ${HOLDER}`);
    });

    it('renders the masked id after the name when one exists', async () => {
        await generateCertificatePdf({ ...BASE_CERT, applicantId: '1234567890123' });
        expect(holderLineOf(mockGeneratedHtmls[0])).toBe(`ผู้ถือใบรับรอง: ${HOLDER} · 1-XXXX-XXXX-X-0123`);
    });

    it('APPLICANT_ID stays "-" for the application summary template', () => {
        expect(buildCertificateContext(BASE_CERT).APPLICANT_ID).toBe('-');
    });
});
