'use strict';

/**
 * Routes for สัญญา C05F680149 ต้นแบบที่ 1 (ระบบวิเคราะห์มาตรฐาน GACP 3 ระบบ),
 * mounted at /api/standards (routes/api/certificates/standards.js):
 *
 *   GET /                          — the three standards and the documents they were read from (public)
 *   GET /comparison                — ไทย · WHO · ASEAN topic by topic (authenticateProvider)
 *   GET /comparison/export.csv     — the same table as CSV (authenticateProvider)
 *   GET /asean/comparison          — 1.3 ASEAN 10-country reference table, draft (public)
 *   GET /:code/analyze/:appId      — 1.1/1.2 gap analysis (authenticateAny;
 *                                    HEALTH owner or any provider role)
 *
 * Auth middleware is mocked: x-test-user header injects req.user, absence → 401
 * (mirrors the real authenticateAny/authenticateProvider contract for unit purposes).
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

jest.mock('../../middleware/auth-middleware', () => {
    const fromTestHeader = (req, res, next) => {
        const raw = req.headers['x-test-user'];
        if (!raw) {
            return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_TOKEN' });
        }
        req.user = JSON.parse(raw);
        next();
    };
    return { authenticateAny: fromTestHeader, authenticateProvider: fromTestHeader };
});

const mockAnalyze = jest.fn();
const mockVisible = jest.fn();

jest.mock('../../middleware/require-visible-application', () => ({
    isApplicationVisibleTo: (...a) => mockVisible(...a),
}));

jest.mock('../../services/holder-access', () => ({
    holderScope: async (req) => ({ userId: req.user.id, readIds: [], editIds: [] }),
}));

jest.mock('../../services/standards-analyzer-service', () => ({
    analyzeApplication: (...a) => mockAnalyze(...a),
    getComparison: () => ({ standards: [{ code: 'THAI_GACP' }, { code: 'WHO' }, { code: 'ASEAN' }], topics: [{ id: 'WATER' }] }),
    comparisonCsv: () => '\uFEFF"หัวข้อ"\r\n',
    getAseanComparison: () =>
        jest.requireActual('../../data/standards/asean-gacp-comparison').ASEAN_COMPARISON,
}));

const standardsRouter = require('../../routes/api/certificates/standards');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/standards', standardsRouter);
    return app;
}

const APP_ID = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const STAFF = JSON.stringify({ canonicalRole: 'DOCUMENT_REVIEWER', canonicalId: 'tok_staff', organizationId: ORG });

describe('GET /api/standards (public reference)', () => {
    test('lists the three compared standards without auth', async () => {
        const res = await request(makeApp()).get('/api/standards');
        expect(res.status).toBe(200);
        expect(res.body.data.map((s) => s.code)).toEqual(['THAI_GACP', 'WHO', 'ASEAN']);
        expect(res.body.count).toBe(3);
    });
});

describe('GET /api/standards/comparison (staff only, like the rest of /provider/standards)', () => {
    test.each(['/api/standards/comparison', '/api/standards/comparison/export.csv'])('%s without a token → 401', async (url) => {
        const res = await request(makeApp()).get(url);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('NO_TOKEN');
    });

    test('serves the comparison to a provider actor', async () => {
        const res = await request(makeApp()).get('/api/standards/comparison').set('x-test-user', STAFF);
        expect(res.status).toBe(200);
        expect(res.body.data.topics).toEqual([{ id: 'WATER' }]);
    });

    test('serves the CSV as a download, not as an analyze call', async () => {
        const res = await request(makeApp()).get('/api/standards/comparison/export.csv').set('x-test-user', STAFF);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toContain('gacp-standards-comparison.csv');
        expect(res.text).toContain('หัวข้อ');
        expect(mockAnalyze).not.toHaveBeenCalled();
    });
});

describe('GET /api/standards/asean/comparison', () => {
    test('returns the 10-country reference table without auth (public reference data)', async () => {
        const res = await request(makeApp()).get('/api/standards/asean/comparison');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(10);
        expect(res.body.count).toBe(10);
    });
});

describe('GET /api/standards/:code/analyze/:applicationId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockVisible.mockResolvedValue(true);
    });

    test('staff refused by the visibility helper → 404 with the catalog Thai text, service never called', async () => {
        mockVisible.mockResolvedValue(false);
        const res = await request(makeApp())
            .get(`/api/standards/WHO/analyze/${APP_ID}`)
            .set('x-test-user', STAFF);

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, error: 'APPLICATION_NOT_FOUND', message: 'ไม่พบใบสมัคร' });
        expect(mockVisible).toHaveBeenCalledWith(expect.objectContaining({ canonicalId: 'tok_staff', organizationId: ORG }), APP_ID);
        expect(mockAnalyze).not.toHaveBeenCalled();
    });

    test('health actor is not routed through the staff visibility helper', async () => {
        mockAnalyze.mockResolvedValue({ standard: { code: 'WHO' }, requirements: [], summary: { total: 0 } });
        const res = await request(makeApp())
            .get(`/api/standards/WHO/analyze/${APP_ID}`)
            .set('x-test-user', JSON.stringify({ canonicalRole: 'HEALTH', id: 'u_health', canonicalId: 'tok_health' }));

        expect(res.status).toBe(200);
        expect(mockVisible).not.toHaveBeenCalled();
    });

    test('no token → 401 (authenticateAny gate)', async () => {
        const res = await request(makeApp()).get(`/api/standards/WHO/analyze/${APP_ID}`);
        expect(res.status).toBe(401);
        expect(mockAnalyze).not.toHaveBeenCalled();
    });

    test('provider actor → 200 with analysis payload; actor and organization scope forwarded to service', async () => {
        mockAnalyze.mockResolvedValue({ standard: { code: 'WHO' }, requirements: [], summary: { total: 0 } });
        const res = await request(makeApp())
            .get(`/api/standards/who/analyze/${APP_ID}`)
            .set('x-test-user', STAFF);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.standard.code).toBe('WHO');
        expect(mockAnalyze).toHaveBeenCalledWith(APP_ID, 'who', expect.objectContaining({
            actor: expect.objectContaining({ role: expect.any(String), canonicalId: 'tok_staff' }),
            organizationWhere: { organizationId: ORG },
            holderScope: null,
        }));
    });

    test('provider actor without an organization → 400 NO_ORGANIZATION without hitting the service', async () => {
        const res = await request(makeApp())
            .get(`/api/standards/who/analyze/${APP_ID}`)
            .set('x-test-user', JSON.stringify({ canonicalRole: 'DOCUMENT_REVIEWER', canonicalId: 'tok_staff' }));

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('NO_ORGANIZATION');
        expect(mockAnalyze).not.toHaveBeenCalled();
    });

    test('system_admin_platform → no organization scope (crosses organizations, ADR-014)', async () => {
        mockAnalyze.mockResolvedValue({ standard: { code: 'WHO' }, requirements: [], summary: { total: 0 } });
        const res = await request(makeApp())
            .get(`/api/standards/who/analyze/${APP_ID}`)
            .set('x-test-user', JSON.stringify({ canonicalRole: 'SYSTEM_ADMIN_PLATFORM', canonicalId: 'tok_platform' }));

        expect(res.status).toBe(200);
        expect(mockAnalyze).toHaveBeenCalledWith(APP_ID, 'who', expect.objectContaining({ organizationWhere: null }));
    });

    test('service 404 (STANDARD_NOT_FOUND) propagates statusCode + code', async () => {
        const err = new Error('Unknown certification standard');
        err.statusCode = 404;
        err.code = 'STANDARD_NOT_FOUND';
        mockAnalyze.mockRejectedValue(err);

        const res = await request(makeApp())
            .get(`/api/standards/NOPE/analyze/${APP_ID}`)
            .set('x-test-user', JSON.stringify({ canonicalRole: 'ADMIN', canonicalId: 'tok_admin', organizationId: ORG }));

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('STANDARD_NOT_FOUND');
    });

    test('invalid application id (not a UUID) → 400 without hitting the service', async () => {
        const res = await request(makeApp())
            .get('/api/standards/WHO/analyze/not-a-uuid')
            .set('x-test-user', JSON.stringify({ canonicalRole: 'ADMIN', canonicalId: 'tok_admin', organizationId: ORG }));

        expect(res.status).toBe(400);
        expect(mockAnalyze).not.toHaveBeenCalled();
    });

    test('unexpected service error → 500 generic (no stack leak)', async () => {
        mockAnalyze.mockRejectedValue(new Error('boom'));
        const res = await request(makeApp())
            .get(`/api/standards/WHO/analyze/${APP_ID}`)
            .set('x-test-user', JSON.stringify({ canonicalRole: 'ADMIN', canonicalId: 'tok_admin', organizationId: ORG }));

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});
