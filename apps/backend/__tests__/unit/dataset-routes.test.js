'use strict';

/**
 * Dataset routes — สัญญา C05F680149 ภาคผนวก 4 ข้อ 3, mounted at /api/datasets:
 *   GET /                     — catalog (any provider role)
 *   GET /dictionary           — data dictionary markdown (any provider role)
 *   GET /:domain/export       — one domain (ADMIN only + audit stamp)
 *   GET /:domain/:list        — deletion list (ADMIN only + audit stamp)
 *   GET /bundle               — full set ZIP (ADMIN only + audit stamp)
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const mockAuditLog = jest.fn();
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: (...a) => mockAuditLog(...a) },
    AuditCategory: { ADMIN: 'ADMIN' },
    AuditSeverity: { INFO: 'INFO' },
    ResourceType: { SYSTEM: 'SYSTEM' },
}));

jest.mock('../../middleware/auth-middleware', () => ({
    authenticateProvider: (req, res, next) => {
        const raw = req.headers['x-test-user'];
        if (!raw) {
            return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_TOKEN' });
        }
        req.user = JSON.parse(raw);
        next();
    },
}));

const mockService = {
    listDomains: jest.fn(),
    exportDomain: jest.fn(),
    exportList: jest.fn(),
    exportBundle: jest.fn(),
    generateDataDictionaryMarkdown: jest.fn(),
};
jest.mock('../../services/dataset-export-service', () => mockService);

const datasetsRouter = require('../../routes/api/datasets/datasets');

function makeApp() {
    const app = express();
    app.use('/api/datasets', datasetsRouter);
    return app;
}

const asUser = (u) => JSON.stringify(u);
const ADMIN = { id: 'admin-uuid', canonicalRole: 'system_admin_dtam', organizationId: 'org-1' };
const REVIEWER = { id: 'rev-uuid', canonicalRole: 'DOCUMENT_REVIEWER' };

beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLog.mockResolvedValue({ id: 'audit-row' });
});

describe('GET /api/datasets (catalog)', () => {
    test('any provider role → 200 with domain list; only system_admin_dtam is told it may export', async () => {
        mockService.listDomains.mockReturnValue([{ key: 'cultivation-logs', thaiName: 'x', fieldCount: 8 }]);
        const res = await request(makeApp()).get('/api/datasets').set('x-test-user', asUser(REVIEWER));
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ canExport: false, domains: [{ key: 'cultivation-logs', thaiName: 'x', fieldCount: 8 }] });
        const admin = await request(makeApp()).get('/api/datasets').set('x-test-user', asUser(ADMIN));
        expect(admin.body.data.canExport).toBe(true);
    });

    test('no token → 401', async () => {
        const res = await request(makeApp()).get('/api/datasets');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/datasets/dictionary', () => {
    test('returns markdown with text content-type', async () => {
        mockService.generateDataDictionaryMarkdown.mockReturnValue('# คู่มือ');
        const res = await request(makeApp()).get('/api/datasets/dictionary').set('x-test-user', asUser(REVIEWER));
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/markdown');
        expect(res.text).toContain('คู่มือ');
    });
});

describe('GET /api/datasets/:domain/export', () => {
    test('non-admin provider → 403 (no service call)', async () => {
        const res = await request(makeApp())
            .get('/api/datasets/cultivation-logs/export?format=csv')
            .set('x-test-user', asUser(REVIEWER));
        expect({ status: res.status, code: res.body.error }).toEqual({ status: 403, code: 'DATASET_EXPORT_FORBIDDEN' });
        expect(mockService.exportDomain).not.toHaveBeenCalled();
    });

    test('ADMIN csv → 200 text/csv attachment + audit stamped', async () => {
        mockService.exportDomain.mockResolvedValue({ body: '﻿"id"\n"a1"', rows: 1, keyFingerprint: 'f'.repeat(16) });
        const res = await request(makeApp())
            .get('/api/datasets/cultivation-logs/export?format=csv')
            .set('x-test-user', asUser(ADMIN));
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toContain('attachment');
        expect(mockService.exportDomain).toHaveBeenCalledWith('cultivation-logs', 'csv', { scope: { organizationId: 'org-1' } });
        expect(mockAuditLog).toHaveBeenCalled();
    });

    test('ADMIN jsonl → 200 application/x-ndjson', async () => {
        mockService.exportDomain.mockResolvedValue({ body: '{"id":"a1"}\n', rows: 1, keyFingerprint: 'f'.repeat(16) });
        const res = await request(makeApp())
            .get('/api/datasets/cultivation-logs/export?format=jsonl')
            .set('x-test-user', asUser(ADMIN));
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/x-ndjson');
    });

    test('default format = csv when query omitted', async () => {
        mockService.exportDomain.mockResolvedValue({ body: '﻿"id"', rows: 0, keyFingerprint: 'f'.repeat(16) });
        await request(makeApp())
            .get('/api/datasets/cultivation-logs/export')
            .set('x-test-user', asUser(ADMIN));
        expect(mockService.exportDomain).toHaveBeenCalledWith('cultivation-logs', 'csv', { scope: { organizationId: 'org-1' } });
    });

    test('service 404 DATASET_NOT_FOUND propagates', async () => {
        const err = new Error('nope');
        err.statusCode = 404;
        err.code = 'DATASET_NOT_FOUND';
        mockService.exportDomain.mockRejectedValue(err);
        const res = await request(makeApp())
            .get('/api/datasets/nope/export?format=csv')
            .set('x-test-user', asUser(ADMIN));
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('DATASET_NOT_FOUND');
    });
});

describe('deletion lists and the bundle', () => {
    test('non-admin provider → 403 on every export door, no service call', async () => {
        for (const path of ['/api/datasets/bundle', '/api/datasets/harvest-batches/deleted', '/api/datasets/survey-responses/withdrawn']) {
            const res = await request(makeApp()).get(path).set('x-test-user', asUser(REVIEWER));
            expect({ path, status: res.status, code: res.body.error }).toEqual({ path, status: 403, code: 'DATASET_EXPORT_FORBIDDEN' });
        }
        expect(mockService.exportList).not.toHaveBeenCalled();
        expect(mockService.exportBundle).not.toHaveBeenCalled();
    });

    test('ADMIN deleted list → service gets the list key and the organization scope', async () => {
        mockService.exportList.mockResolvedValue({ body: '{"id":"x"}\n', rows: 1, keyFingerprint: 'f'.repeat(16) });
        const res = await request(makeApp()).get('/api/datasets/harvest-batches/deleted?format=jsonl').set('x-test-user', asUser(ADMIN));
        expect(res.status).toBe(200);
        expect(mockService.exportList).toHaveBeenCalledWith('harvest-batches/deleted', 'jsonl', { scope: { organizationId: 'org-1' } });
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DATASET_DELETION_LIST_EXPORTED', resourceId: 'harvest-batches/deleted' }));
    });

    test('ADMIN bundle → application/zip named by the Bangkok export day, audit stamped', async () => {
        mockService.exportBundle.mockResolvedValue({
            zip: Buffer.from('PK'), manifestSha256: 'a'.repeat(64),
            manifest: { exportedAt: '2026-10-08T09:00:00+07:00', pseudonymKeyFingerprint: 'f'.repeat(16), files: [] },
        });
        const res = await request(makeApp()).get('/api/datasets/bundle').set('x-test-user', asUser(ADMIN));
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/zip');
        expect(res.headers['content-disposition']).toContain('gacp-research-dataset-20261008.zip');
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DATASET_BUNDLE_EXPORTED' }));
    });

    test('admin without an organization → refused before any export', async () => {
        const res = await request(makeApp()).get('/api/datasets/bundle').set('x-test-user', asUser({ id: 'a', canonicalRole: 'system_admin_dtam' }));
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'NO_ORGANIZATION' });
        expect(mockService.exportBundle).not.toHaveBeenCalled();
    });
});

describe('an export leaves only with its audit row, and never from a cache (K15/K16 L3, L6)', () => {
    const crypto = require('crypto');
    // digests in SRI form and the fingerprint grouped by ':': the audit logger masks any 13-digit run in metadata
    const sri = (data) => `sha256-${crypto.createHash('sha256').update(data).digest('base64')}`;
    const BODY = '\uFEFF"questionId"\n"secret-row-a1"\n';
    const FINGERPRINT = '0123456789abcdef';
    const GROUPED = '0123:4567:89ab:cdef';
    const MANIFEST_HEX = '1234567890123'.padEnd(64, 'a');
    const ZIP = Buffer.from('PK-secret-zip-bytes');
    const MANIFEST = {
        exportedAt: '2026-10-08T09:00:00+07:00', pseudonymKeyFingerprint: FINGERPRINT,
        files: [{ path: 'survey-questions.csv', rows: 2 }, { path: 'data-dictionary.md', rows: null }],
    };
    const DOORS = [
        ['one domain', '/api/datasets/survey-questions/export?format=csv', 'exportDomain', { body: BODY, rows: 1, keyFingerprint: FINGERPRINT }],
        ['a deletion list', '/api/datasets/survey-responses/withdrawn?format=csv', 'exportList', { body: BODY, rows: 1, keyFingerprint: FINGERPRINT }],
        ['the bundle', '/api/datasets/bundle', 'exportBundle', { zip: ZIP, manifest: MANIFEST, manifestSha256: MANIFEST_HEX }],
    ];
    const raw = (req) => req.buffer(true).parse((r, cb) => { const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });

    test.each(DOORS)('%s: no audit row = 503 DATASET_EXPORT_AUDIT_FAILED and no byte of the file leaves', async (label, path, fn, result) => {
        mockService[fn].mockResolvedValue(result);
        mockAuditLog.mockResolvedValueOnce(null);
        const res = await raw(request(makeApp()).get(path).set('x-test-user', asUser(ADMIN)));
        const text = res.body.toString('utf8');
        expect({ status: res.status, code: JSON.parse(text).error }).toEqual({ status: 503, code: 'DATASET_EXPORT_AUDIT_FAILED' });
        expect({ row: text.includes('secret-row-a1'), zip: text.includes('PK-secret-zip-bytes') }).toEqual({ row: false, zip: false });
    });

    test.each(DOORS)('%s: Cache-Control no-store on success and on refusal', async (label, path, fn, result) => {
        mockService[fn].mockResolvedValue(result);
        const ok = await raw(request(makeApp()).get(path).set('x-test-user', asUser(ADMIN)));
        const refused = await request(makeApp()).get(path).set('x-test-user', asUser(REVIEWER));
        expect({ status: ok.status, cache: ok.headers['cache-control'] }).toEqual({ status: 200, cache: 'no-store' });
        expect({ status: refused.status, cache: refused.headers['cache-control'] }).toEqual({ status: 403, cache: 'no-store' });
    });

    test('a file export audit names the format, the rows, the sha256 of the bytes sent and the key fingerprint', async () => {
        mockService.exportDomain.mockResolvedValue({ body: BODY, rows: 1, keyFingerprint: FINGERPRINT });
        const res = await raw(request(makeApp()).get('/api/datasets/survey-questions/export?format=csv').set('x-test-user', asUser(ADMIN)));
        expect(res.status).toBe(200);
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'DATASET_EXPORTED', resourceId: 'survey-questions',
            metadata: { format: 'csv', rows: 1, sha256: sri(res.body), keyFingerprint: GROUPED },
        }));
    });

    test('a bundle audit names the rows per file, the sha256 of the zip and of its manifest, and the key fingerprint', async () => {
        mockService.exportBundle.mockResolvedValue({ zip: ZIP, manifest: MANIFEST, manifestSha256: MANIFEST_HEX });
        const res = await raw(request(makeApp()).get('/api/datasets/bundle').set('x-test-user', asUser(ADMIN)));
        expect(res.status).toBe(200);
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'DATASET_BUNDLE_EXPORTED',
            metadata: {
                format: 'zip', rows: { 'survey-questions.csv': 2 }, sha256: sri(ZIP),
                manifestSha256: `sha256-${Buffer.from(MANIFEST_HEX, 'hex').toString('base64')}`, keyFingerprint: GROUPED,
            },
        }));
    });
});
