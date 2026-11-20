/**
 * Public certificate verification — response field mapping.
 *
 * GET /verify/:certificateNumber returns a JSON payload that a public QR
 * scanner renders. findByCertificateNumber returns the RAW Certificate row,
 * whose schema is flat: `province`, `cropType` (singular), `issuedDate`,
 * `standardName`. The route previously read `location.province`, `cropTypes`/
 * `plantType`, `issueDate`, and `certificationStandards` — none of which exist
 * on the model — so a valid cert verified with a blank province, empty crop,
 * and null issue date. These tests lock the correct mapping.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../../shared/logger', () => {
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...log, createLogger: jest.fn(() => log), stream: { write: jest.fn() } };
});

// Rate limiter → pass-through middleware in tests.
jest.mock('../../middleware/rate-limiter', () => ({
    createRateLimiter: () => (_req, _res, next) => next(),
}));

const mockFindByCertificateNumber = jest.fn();
const mockVerifyDocumentIntegrity = jest.fn(() => ({ status: 'VALID' }));
// H1: public.js now also calls verifyCertificateSignature. Default to an
// unsigned verdict so these field-mapping tests are unaffected (signatureValid
// → null, sealed → false); individual tests can override if needed.
const mockVerifyCertificateSignature = jest.fn(async () => ({ signed: false }));
jest.mock('../../services/certificate-service', () => ({
    findByCertificateNumber: (...args) => mockFindByCertificateNumber(...args),
    verifyDocumentIntegrity: (...args) => mockVerifyDocumentIntegrity(...args),
    verifyCertificateSignature: (...args) => mockVerifyCertificateSignature(...args),
}));

const publicRouter = require('../../routes/api/auth/public');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', publicRouter);
    return app;
}

// A raw Certificate row as returned by prisma.certificate.findUnique.
function rawCert(overrides = {}) {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    return {
        certificateNumber: 'GACP-TH-2569-A3F7B2',
        verificationCode: 'A1B2C3D4',
        status: 'active',
        issuedDate: new Date('2026-05-16T03:00:00Z'),
        expiryDate: future,
        farmName: 'ฟาร์มสมุนไพรสมชาย',
        applicantName: 'สมชาย ใจดี',
        province: 'เชียงราย',
        cropType: 'กัญชา / Cannabis sativa L.',
        standardName: 'GACP Thailand',
        documentHash: 'abc',
        scopes: [{ areaType: 'OUTDOOR', status: 'active' }],
        ...overrides,
    };
}

describe('GET /verify/:certificateNumber — field mapping', () => {
    beforeEach(() => {
        mockFindByCertificateNumber.mockReset();
        mockVerifyDocumentIntegrity.mockReturnValue({ status: 'VALID' });
    });

    it('maps province / cropType / issuedDate / standardName from the raw model', async () => {
        mockFindByCertificateNumber.mockResolvedValue(rawCert());
        const res = await request(buildApp()).get('/verify/GACP-TH-2569-A3F7B2');

        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(true);
        const c = res.body.data.certificate;
        expect(c).not.toBeNull();
        // The bug produced province:undefined, an empty crop and issueDate:undefined.
        expect(c.province).toBe('เชียงราย');
        expect(c.scope.crop).toBe('กัญชา / Cannabis sativa L.');
        expect(c.issueDate).toBe(new Date('2026-05-16T03:00:00Z').toISOString());
        expect(c.scope.standard).toBe('GACP Thailand');
    });

    it('surfaces the BE-#4 integrity status', async () => {
        mockFindByCertificateNumber.mockResolvedValue(rawCert());
        mockVerifyDocumentIntegrity.mockReturnValue({ status: 'TAMPERED', expected: 'x', actual: 'y' });
        const res = await request(buildApp()).get('/verify/GACP-TH-2569-A3F7B2');
        expect(res.body.data.integrity).toBe('TAMPERED');
    });

    it('returns verified:false for an expired cert (no certificate block)', async () => {
        mockFindByCertificateNumber.mockResolvedValue(
            rawCert({ expiryDate: new Date('2000-01-01T00:00:00Z') }),
        );
        const res = await request(buildApp()).get('/verify/GACP-TH-2569-A3F7B2');
        expect(res.body.valid).toBe(false);
        expect(res.body.data.status).toBe('expired');
        expect(res.body.data.certificate).toBeNull();
    });

    it('returns valid:false when the cert is not found', async () => {
        mockFindByCertificateNumber.mockResolvedValue(null);
        const res = await request(buildApp()).get('/verify/UNKNOWN');
        expect(res.body.valid).toBe(false);
        expect(res.body.data.status).toBe('invalid');
    });
});

// The HTML twin of this door had no caller and printed a person-shaped holder's name and the
// retired issuer name. Pre-production it is deleted (order 12), leaving one JSON door for order 68(1).
describe('GET /verify/:certificateNumber/page (HTML) is gone', () => {
    beforeEach(() => {
        mockFindByCertificateNumber.mockReset();
    });

    it.each([
        ['a certificate in force', () => rawCert()],
        ['an unknown number', () => null],
    ])('%s: 404, the register is never read, and no name is printed', async (_label, row) => {
        mockFindByCertificateNumber.mockResolvedValue(row());
        const res = await request(buildApp()).get('/verify/GACP-TH-2569-A3F7B2/page');

        expect(res.status).toBe(404);
        expect(mockFindByCertificateNumber).not.toHaveBeenCalled();
        expect(res.text).not.toContain('สมชาย');
    });

    it('nothing in the web app or the mobile app still calls it', () => {
        const fs = require('fs');
        const path = require('path');
        const repo = path.join(__dirname, '..', '..', '..', '..');
        const skip = new Set(['node_modules', '.next', '.dart_tool', 'build', 'coverage', 'dist', 'test-results', 'playwright-report']);
        const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) { return skip.has(entry.name) ? [] : sources(file); }
            return /\.(?:[cm]?js|tsx?|dart)$/.test(entry.name) ? [file] : [];
        });
        const callers = ['apps/web-app', 'apps/mobile-app']
            .flatMap((app) => sources(path.join(repo, app)))
            .filter((file) => /public\/verify\/[^\s'"`]*\/page\b/.test(fs.readFileSync(file, 'utf8')))
            .map((file) => path.relative(repo, file));
        expect(callers).toEqual([]);
    });
});
