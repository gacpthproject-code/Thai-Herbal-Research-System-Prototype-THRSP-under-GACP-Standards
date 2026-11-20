'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const storageService = require('../../services/storage-service');
const { gateSensitiveUploads, gateUploadsObjectAccess } = require('../../middleware/uploads-access');
const uploadsSecurityHeaders = require('../../middleware/uploads-security-headers');

function raw(req) {
    return req.buffer(true).parse((res, done) => {
        let body = '';
        res.setEncoding('latin1');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => done(null, body));
    });
}

const LINKED_BYTES = /CERTIFICATE COPY|OUTSIDE THE UPLOADS ROOT/;

describe('the public lab-results/ folder serves no link', () => {
    let base;
    let app;

    beforeAll(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-links-'));
        const root = path.join(base, 'uploads');
        const outside = path.join(base, 'outside');
        fs.mkdirSync(path.join(root, 'lab-results'), { recursive: true });
        fs.mkdirSync(path.join(root, 'gacp-certificates'));
        fs.mkdirSync(outside);
        fs.writeFileSync(path.join(root, 'lab-results', 'report.pdf'), 'LAB REPORT');
        fs.writeFileSync(path.join(root, 'gacp-certificates', 'TH-GACP-1-2569.pdf'), 'CERTIFICATE COPY');
        fs.writeFileSync(path.join(outside, 'secret.txt'), 'OUTSIDE THE UPLOADS ROOT');
        fs.symlinkSync('../gacp-certificates/TH-GACP-1-2569.pdf', path.join(root, 'lab-results', 'certificate.pdf'));
        fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'lab-results', 'outside.pdf'));
        fs.symlinkSync('../gacp-certificates', path.join(root, 'lab-results', 'linked-folder'));
        fs.symlinkSync('report.pdf', path.join(root, 'lab-results', 'another-report.pdf'));

        jest.replaceProperty(storageService, 'BASE_UPLOAD_DIR', root);
        app = express();
        app.use('/uploads', gateSensitiveUploads, gateUploadsObjectAccess, uploadsSecurityHeaders,
            express.static(storageService.BASE_UPLOAD_DIR));
    });

    afterAll(() => {
        jest.restoreAllMocks();
        fs.rmSync(base, { recursive: true, force: true });
    });

    test('a lab report still opens without a session', async () => {
        const res = await raw(request(app).get('/uploads/lab-results/report.pdf'));
        expect([res.status, res.body]).toEqual([200, 'LAB REPORT']);
    });

    test.each([
        ['a symlink to a stored certificate copy', 'lab-results/certificate.pdf'],
        ['a symlink to a file outside the uploads root', 'lab-results/outside.pdf'],
        ['a file under a symlinked folder', 'lab-results/linked-folder/TH-GACP-1-2569.pdf'],
    ])('%s answers 404 and sends no bytes', async (_label, rel) => {
        const res = await raw(request(app).get(`/uploads/${rel}`));
        expect([res.status, LINKED_BYTES.test(res.body)]).toEqual([404, false]);
    });

    test('a symlink is refused even when it points at another lab report', async () => {
        const res = await raw(request(app).get('/uploads/lab-results/another-report.pdf'));
        expect([res.status, res.body.includes('LAB REPORT')]).toEqual([404, false]);
    });
});
