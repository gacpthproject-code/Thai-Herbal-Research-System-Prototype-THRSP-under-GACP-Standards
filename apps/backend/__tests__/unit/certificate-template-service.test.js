/**
 * Tests for the B23 certificate-template-service rewrite (2026-05-16).
 *
 * Coverage:
 *   - `buildCertificateContext` is pure and emits the full B23 placeholder set
 *   - DTAM-namespaced cert number is projected from `GACP-TH-…` form
 *   - Thai BE date formatting goes through the canonical formatter
 *   - Cultivation methods accept both string + array shapes
 *   - Farm location concatenates from {address, subDistrict, district, province}
 *   - Template HTML carries the new B23 placeholders (anchored at file)
 *   - `generateCertificatePdf` is wrapped (qrcode + puppeteer mocked) and
 *     returns a Buffer with the certificate number embedded in the
 *     templating call.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Mock heavy deps before requiring the service ────────────────────────────
//
// Puppeteer launch + QR encode are slow and require a real browser binary.
// We isolate them so the unit tests stay fast (<1s) and deterministic.
jest.mock('qrcode', () => ({
    toDataURL: jest.fn(async () => 'data:image/png;base64,FAKEQR=='),
}));

// Jest only permits factory-scoped references that are prefixed with `mock`
// (case-insensitive). The `mockGeneratedHtmls` array is the one shared piece
// of state the assertions inspect; `mockFs` re-requires `fs` inside the
// factory so it doesn't reach the test-scope `fs` import.
const mockGeneratedHtmls = [];
jest.mock('../../services/pdf/pdf-generator.service', () => {
    const mockFs = require('fs');
    return {
        generatePDF: jest.fn(async (html) => {
            mockGeneratedHtmls.push(html);
            return Buffer.from(`%PDF-FAKE-${html.length}`);
        }),
        replaceTemplateVariables: jest.fn((template, data) => {
            // Mirror the real implementation enough to satisfy assertions:
            // substitute {{KEY}} with String(data[KEY]) when present.
            return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
                const v = data[key];
                return v === undefined ? m : String(v);
            });
        }),
        readTemplateCached: jest.fn((p) => mockFs.readFileSync(p, 'utf-8')),
    };
});

jest.mock('../../services/storage-service', () => ({
    uploadBuffer: jest.fn(async () => ({ ok: true })),
}));

jest.mock('../../shared/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

const certificateTemplateService = require('../../services/pdf/certificate-template-service');
const {
    buildCertificateContext,
    buildDtamCertNumberDisplay,
    buildFarmLocation,
    formatCultivationMethods,
    buildVerifyUrl,
    generateCertificatePdf,
    DEFAULT_SIGNER,
} = certificateTemplateService;

const SAMPLE_CERT = Object.freeze({
    certificateNumber: 'GACP-TH-2569-A3F7B2',
    verificationCode: 'A1B2C3D4',
    qrData: 'https://gacpth.com/verify/GACP-TH-2569-A3F7B2',
    applicantName: 'สมชาย ใจดี',
    applicantId: '1234567890123',
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

describe('[B23] certificate-template-service — helpers', () => {

    describe('the holder ID on the paper', () => {
        const idOf = (applicantId) => buildCertificateContext({ ...SAMPLE_CERT, applicantId }).APPLICANT_ID;

        it('keeps the first digit and the last 4 of a 13-digit ID', () => {
            expect(idOf('1234567890123')).toBe('1-XXXX-XXXX-X-0123');
        });

        it('masks an already-grouped ID the same way', () => {
            expect(idOf('1-2345-67890-12-3')).toBe('1-XXXX-XXXX-X-0123');
        });

        it('prints "-" when the row carries no ID', () => {
            expect(idOf(null)).toBe('-');
            expect(idOf(undefined)).toBe('-');
        });
    });

    describe('buildDtamCertNumberDisplay', () => {
        it('projects GACP-TH-{year}-{suffix} into GACP-DTAM-{year}-{suffix}', () => {
            expect(buildDtamCertNumberDisplay('GACP-TH-2569-A3F7B2'))
                .toBe('GACP-DTAM-2569-A3F7B2');
        });

        it('passes through unrecognised shapes untouched', () => {
            expect(buildDtamCertNumberDisplay('LEGACY-2024-001'))
                .toBe('LEGACY-2024-001');
        });

        it('returns "-" for missing input', () => {
            expect(buildDtamCertNumberDisplay(null)).toBe('-');
            expect(buildDtamCertNumberDisplay(undefined)).toBe('-');
            expect(buildDtamCertNumberDisplay('')).toBe('-');
        });
    });

    describe('formatCultivationMethods', () => {
        it('joins arrays with " / "', () => {
            expect(formatCultivationMethods(['กัญชา', 'กระท่อม']))
                .toBe('กัญชา / กระท่อม');
        });

        it('returns trimmed string for string input', () => {
            expect(formatCultivationMethods('  กัญชา  ')).toBe('กัญชา');
        });

        it('returns "-" for falsy / empty', () => {
            expect(formatCultivationMethods(null)).toBe('-');
            expect(formatCultivationMethods('')).toBe('-');
            expect(formatCultivationMethods([])).toBe('-');
        });
    });

    describe('buildFarmLocation', () => {
        it('composes a Thai address from the structured fields', () => {
            const out = buildFarmLocation({
                address: 'หมู่ 1',
                subDistrict: 'รอบเวียง',
                district: 'เมือง',
                province: 'เชียงราย',
            });
            expect(out).toBe('หมู่ 1 ตำบลรอบเวียง อำเภอเมือง จังหวัดเชียงราย');
        });

        it('skips placeholder values like "Unknown" and "-"', () => {
            const out = buildFarmLocation({
                address: 'Unknown',
                subDistrict: '-',
                district: 'เมือง',
                province: 'เชียงราย',
            });
            expect(out).toBe('อำเภอเมือง จังหวัดเชียงราย');
        });

        it('returns "-" when nothing is supplied', () => {
            expect(buildFarmLocation({})).toBe('-');
        });
    });

    describe('buildVerifyUrl', () => {
        it('prefers an existing qrData field on the cert', () => {
            expect(buildVerifyUrl({ qrData: 'https://example/v/X' }))
                .toBe('https://example/v/X');
        });

        it('falls back to the DTAM verify base + cert number', () => {
            const url = buildVerifyUrl({ certificateNumber: 'GACP-TH-2569-A3F7B2' });
            expect(url).toContain('/verify/GACP-TH-2569-A3F7B2');
        });
    });
});

describe('[B23] certificate-template-service — buildCertificateContext (pure)', () => {

    it('emits the full B23 placeholder set', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT, null, {
            qrCodeDataUrl: 'data:image/png;base64,QRX',
            ministryLogoDataUrl: 'data:image/png;base64,MINISTRY-SEAL',
        });
        // Canonical B23 placeholders
        const required = [
            'CERT_NUMBER', 'CERT_NUMBER_TH',
            'APPLICANT_NAME', 'APPLICANT_ID',
            'CULTIVATION_METHODS', 'FARM_LOCATION',
            'ISSUE_DATE_TH', 'EXPIRY_DATE_TH',
            'SIGNER_NAME', 'SIGNER_POSITION',
            'VERIFY_URL', 'QR_CODE_DATA_URL',
            'MINISTRY_LOGO_DATA_URL',
        ];
        for (const key of required) {
            expect(ctx[key]).toBeDefined();
            expect(ctx[key]).not.toBe('');
        }
    });

    it('renders the cert number with the DTAM prefix and the Thai-numeral mirror', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT);
        expect(ctx.CERT_NUMBER).toBe('GACP-DTAM-2569-A3F7B2');
        // Thai numerals only replace the digits — the letters A3F7B2
        // contain '3' and '7' which both transliterate.
        expect(ctx.CERT_NUMBER_TH).toContain('๒๕๖๙');
        expect(ctx.CERT_NUMBER_TH).toContain('A๓F๗B๒');
    });

    it('formats issue + expiry dates in Thai BE form with พุทธศักราช', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT);
        // 2026-05-16 CE → 2569 BE = ๒๕๖๙
        expect(ctx.ISSUE_DATE_TH).toContain('พฤษภาคม');
        expect(ctx.ISSUE_DATE_TH).toContain('พุทธศักราช');
        expect(ctx.ISSUE_DATE_TH).toContain('๒๕๖๙');
        // 2027-05-16 CE → 2570 BE
        expect(ctx.EXPIRY_DATE_TH).toContain('๒๕๗๐');
    });

    it('masks the applicant national ID to its first digit and last 4', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT);
        expect(ctx.APPLICANT_ID).toBe('1-XXXX-XXXX-X-0123');
    });

    it('composes the farm location from structured fields', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT);
        expect(ctx.FARM_LOCATION).toContain('จังหวัดเชียงราย');
        expect(ctx.FARM_LOCATION).toContain('อำเภอเมือง');
        expect(ctx.FARM_LOCATION).toContain('ตำบลรอบเวียง');
    });

    it('uses the default DTAM Director-General signer when none supplied', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT);
        expect(ctx.SIGNER_NAME).toBe(DEFAULT_SIGNER.name);
        expect(ctx.SIGNER_POSITION).toBe(DEFAULT_SIGNER.position);
    });

    it('honours an explicit signer override', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT, {
            name: 'นายแพทย์ สมศักดิ์ มั่นคง',
            position: 'รองอธิบดี',
        });
        expect(ctx.SIGNER_NAME).toBe('นายแพทย์ สมศักดิ์ มั่นคง');
        expect(ctx.SIGNER_POSITION).toBe('รองอธิบดี');
    });

    it('prefers cert.qrData for the verify URL when present', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT);
        expect(ctx.VERIFY_URL).toBe(SAMPLE_CERT.qrData);
    });

    it('throws if cert is missing — guards the render path against null Prisma rows', () => {
        expect(() => buildCertificateContext(null)).toThrow(TypeError);
        expect(() => buildCertificateContext(undefined)).toThrow(TypeError);
    });

    it('retains the legacy placeholders so older renders do not regress', () => {
        const ctx = buildCertificateContext(SAMPLE_CERT, null, {
            qrCodeDataUrl: 'data:image/png;base64,QR',
        });
        // The pre-B23 template used these keys — emit them so a fallback
        // render against an older template fragment doesn't surface a
        // "surviving placeholder" warning at runtime.
        expect(ctx.FARM_NAME).toBe('ฟาร์มสมุนไพรสมชาย');
        expect(ctx.STANDARD_NAME).toBe('GACP Thailand');
        expect(ctx.VERIFICATION_CODE).toBe('A1B2C3D4');
        expect(ctx.QR_DATA_URL).toBe('data:image/png;base64,QR');
    });
});

describe('[B23] certificate-template-service — template HTML anchors', () => {
    // Sanity-check that the new placeholders are actually present in the
    // template file.  If a future refactor renames any, this test fails
    // before the rename ships and breaks production renders.
    const TEMPLATE_PATH = path.join(
        __dirname, '..', '..', 'services', 'pdf', 'templates', 'certificate.html',
    );
    let html;
    beforeAll(() => { html = fs.readFileSync(TEMPLATE_PATH, 'utf-8'); });

    it('contains every B23 canonical placeholder', () => {
        const placeholders = [
            'CERT_NUMBER', 'CERT_NUMBER_TH',
            'APPLICANT_NAME', 'HOLDER_ID_SUFFIX',
            'CULTIVATION_METHODS', 'FARM_LOCATION',
            'ISSUE_DATE_TH', 'EXPIRY_DATE_TH',
            'SIGNER_NAME', 'SIGNER_POSITION',
            'VERIFY_URL', 'QR_CODE_DATA_URL',
        ];
        for (const key of placeholders) {
            expect(html).toContain(`{{${key}}}`);
        }
    });

    it('declares A4 portrait orientation', () => {
        expect(html).toContain('size: A4 portrait');
    });

    it('carries the approved Claude Design canvas tokens — operator 2026-09-07 "ต้อง claude design เท่านั้น"', () => {
        // แหล่งเดียวของ look-and-feel คือ canvas โครง Wizard กทล.1 (artifact 0a821aff)
        expect(html).toContain('#18803f'); // canvas green
        expect(html).toContain('#00663d'); // canvas deep green
        expect(html).toContain('#8a6d1f'); // canvas gold
        expect(html).toContain("'Sukhumvit Set', 'Anuphan'"); // stack ตาม canvas + ตัวฝังที่ถูกลิขสิทธิ์
        expect(html).not.toContain('#3730A3'); // indigo ต้องไม่กลับมา
    });

    it('contains the DTAM ministry footer line', () => {
        expect(html).toContain('DTAM');
        expect(html).toContain('กรมการแพทย์แผนไทยและการแพทย์ทางเลือก');
        expect(html).toContain('Ministry of Public Health');
    });

    it('does NOT contain FlowAccount-style corner triangles (post-B22 directive)', () => {
        // The pre-B22 template used a clip-path triangle in the top-right;
        // the brand directive says it must not return.
        expect(html).not.toContain('clip-path');
        // Belt-and-suspenders: the pre-B23 template had a `.corner-accent`
        // helper; ensure we did not silently re-introduce it.
        expect(html).not.toContain('.corner-accent');
    });
});

describe('[B23] certificate-template-service — generateCertificatePdf', () => {
    beforeEach(() => {
        mockGeneratedHtmls.length = 0;
        jest.clearAllMocks();
    });

    it('returns a Buffer and feeds the rendered HTML through Puppeteer', async () => {
        const buffer = await generateCertificatePdf(SAMPLE_CERT);
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(mockGeneratedHtmls).toHaveLength(1);
        const html = mockGeneratedHtmls[0];
        // The applicant name + DTAM-prefixed cert number should both make
        // it into the substituted HTML.
        expect(html).toContain('สมชาย ใจดี');
        expect(html).toContain('GACP-DTAM-2569-A3F7B2');
    });

    it('asks QRCode.toDataURL for a CI-green-on-white code targeting the verify URL', async () => {
        const QRCode = require('qrcode');
        await generateCertificatePdf(SAMPLE_CERT);
        expect(QRCode.toDataURL).toHaveBeenCalledTimes(1);
        const [payload, opts] = QRCode.toDataURL.mock.calls[0];
        expect(payload).toBe(SAMPLE_CERT.qrData);
        expect(opts.color.dark).toBe('#00663d');
        expect(opts.errorCorrectionLevel).toBe('H');
    });

    it.each([
        ['by default', undefined],
        ['even when a caller asks to upload', { upload: true }],
    ])('stores no copy of the certificate %s', async (_label, opts) => {
        const storage = require('../../services/storage-service');
        const buffer = await generateCertificatePdf(SAMPLE_CERT, opts);
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });

    it('prints the holder ID with only its first digit and last 4', async () => {
        await generateCertificatePdf(SAMPLE_CERT);
        const html = mockGeneratedHtmls[0];
        expect(html).toContain('1-XXXX-XXXX-X-0123');
        expect(html).not.toMatch(/2345|6789/);
    });
});
