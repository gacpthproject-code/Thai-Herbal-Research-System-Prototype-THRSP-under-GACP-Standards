'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

process.env.UPLOADS_URL_SIGNING_SECRET = 'closed-by-default-test-only-signing-secret-0123456789';

jest.mock('../../middleware/auth-middleware', () => {
    const attach = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role) { return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_TOKEN' }); }
        req.user = { id: `u-${role}`, canonicalId: `tok-${role}`, role, canonicalRole: role, organizationId: 'org-1' };
        return next();
    };
    return { authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach };
});
jest.mock('../../services/prisma-database', () => {
    const none = () => Promise.resolve(null);
    return {
        prisma: {
            application: { findFirst: jest.fn(none) },
            attachment: { findFirst: jest.fn(none) },
            applicationDocument: { findFirst: jest.fn(none) },
            applicationDraft: { findFirst: jest.fn(none) },
            auditChecklist: { findUnique: jest.fn(none) },
            user: { findUnique: jest.fn(none) },
        },
    };
});
jest.mock('../../shared/logger', () => {
    const noop = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    return { ...noop, createLogger: () => noop };
});

const { gateSensitiveUploads, gateUploadsObjectAccess, classifyUploadsPath } = require('../../middleware/uploads-access');
const uploadsSecurityHeaders = require('../../middleware/uploads-security-headers');

const CERTIFICATE = 'gacp-certificates/TH-GACP-1-2569.pdf';
const BYTES = '%PDF-1.4 planted';
const PLANTED = [
    CERTIFICATE,
    'gacp-uploads/application-drafts/1760000000000-draft.pdf',
    'lab-reports/1760000000000-report.pdf',
    'wizard-drafts/1760000000000-draft.pdf',
    'documents/1760000000000-doc.pdf',
];
const LAB_REPORT = 'lab-results/1760000000000-0b6f5a7e.pdf';

function raw(req) {
    return req.buffer(true).parse((res, done) => {
        let body = '';
        res.setEncoding('latin1');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => done(null, body));
    });
}

describe('classifyUploadsPath: public is an allowlist of one folder', () => {
    test('a lab report is public', () => {
        expect(classifyUploadsPath(LAB_REPORT)).toEqual({ kind: 'public', sensitive: false });
    });

    test.each([
        ...PLANTED,
        'LAB-RESULTS/x.pdf',
        'lab-results-old/x.pdf',
        'lab-resultsx.pdf',
        'gacp-certificates/GACP-TH-2569-A3F7B2.pdf',
    ])('%s is sensitive', (rel) => {
        expect(classifyUploadsPath(rel).sensitive).toBe(true);
    });
});

describe('the /uploads mount serves no folder it does not know', () => {
    let root;
    let app;

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-closed-'));
        for (const rel of [...PLANTED, LAB_REPORT]) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), BYTES);
        }
        app = express();
        app.use(express.json());
        app.use('/uploads', gateSensitiveUploads, gateUploadsObjectAccess, uploadsSecurityHeaders, express.static(root));
        app.use('/api/files', require('../../routes/api/files/files'));
    });

    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    test.each(PLANTED)('no session: GET /uploads/%s answers 401 and sends no bytes', async (rel) => {
        const res = await raw(request(app).get(`/uploads/${rel}`));
        expect([res.status, res.body.includes(BYTES)]).toEqual([401, false]);
    });

    test.each([
        ['health'],
        ['system_admin_dtam'],
        ['finance_officer_platform'],
    ])('a %s session gets 404 for the certificate: only the holder door renders it', async (role) => {
        const res = await raw(request(app).get(`/uploads/${CERTIFICATE}`).set('x-test-role', role));
        expect([res.status, res.body.includes(BYTES)]).toEqual([404, false]);
    });

    test.each(PLANTED)('a session gets 404 for /uploads/%s', async (rel) => {
        const res = await raw(request(app).get(`/uploads/${rel}`).set('x-test-role', 'health'));
        expect([res.status, res.body.includes(BYTES)]).toEqual([404, false]);
    });

    test.each(PLANTED)('the signed-URL mint refuses /uploads/%s', async (rel) => {
        const res = await request(app).post('/api/files/signed-url')
            .set('x-test-role', 'health').send({ fileUrl: `/uploads/${rel}` });
        expect([res.status, res.body.data]).toEqual([404, undefined]);
    });

    test('a lab report still opens without a session for the consumer trace page', async () => {
        const res = await raw(request(app).get(`/uploads/${LAB_REPORT}`));
        expect([res.status, res.body]).toEqual([200, BYTES]);
    });

    test('the mint still hands out a lab report link', async () => {
        const res = await request(app).post('/api/files/signed-url')
            .set('x-test-role', 'health').send({ fileUrl: `/uploads/${LAB_REPORT}` });
        expect(res.status).toBe(200);
    });
});
