'use strict';

/**
 * Security review of 1b554df0c, M2: an absolute-form request target skipped the /uploads gate.
 *
 *   GET http://host/uploads/gacp-pdfs/x.pdf HTTP/1.1   sent straight to the backend
 *
 * Express routed it into the /uploads mount and express.static served the bytes, while the gate
 * read the path from req.originalUrl ("http://host/uploads/...") as a string, classified it
 * public and let it through. Measured 200 plus the PDF on the exact server.js chain. The same
 * held for ID-card files at the root and for applicant drafts. nginx rewrites such a target to
 * origin form, so only the host loopback or the docker network could send it.
 *
 * Driven over a raw socket, because an HTTP client library always sends origin form, against
 * the real app from server.js with its real /uploads chain and static root. The database is
 * connected only because server.js answers 503 until it is; every request here is decided
 * before a row is read.
 */

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const UPLOADS = path.join(__dirname, '../../public/uploads');
const STUB = `b0r2-stub-${crypto.randomUUID()}`;

function rawRequest(port, target) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        let raw = '';
        socket.setEncoding('latin1');
        socket.on('data', (chunk) => { raw += chunk; });
        socket.on('end', () => resolve({ status: Number((raw.match(/^HTTP\/1\.1 (\d{3})/) || [])[1]), raw }));
        socket.on('error', reject);
        socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
}

d('the /uploads gate reads every request target the way the static handler serves it (real server)', () => {
    let server;
    let port;
    const createdDirs = [];
    const plantedFiles = [];
    const files = {
        receipt: `gacp-pdfs/receipts-TAX-PRD-2569-${crypto.randomInt(1e6)}.pdf`,
        nestedReceipt: `gacp-pdfs/receipts/TAX-PRD-2569-${crypto.randomInt(1e6)}.pdf`,
        idCard: `${Date.now()}-${crypto.randomUUID()}.jpg`,
        draft: `application-drafts/${Date.now()}-${crypto.randomUUID()}.pdf`,
        labReport: `lab-results/${Date.now()}-${crypto.randomUUID()}.pdf`,
    };

    const plant = (rel) => {
        const full = path.join(UPLOADS, rel);
        let dir = path.dirname(full);
        const missing = [];
        while (!fs.existsSync(dir)) { missing.unshift(dir); dir = path.dirname(dir); }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        createdDirs.push(...missing);
        fs.writeFileSync(full, `%PDF-1.4 ${STUB}`);
        plantedFiles.push(full);
    };

    beforeAll(async () => {
        Object.values(files).forEach(plant);
        const app = require('../../server');
        await require('../../services/prisma-database').connect();
        server = app.listen(0, '127.0.0.1');
        await new Promise((resolve) => server.once('listening', resolve));
        ({ port } = server.address());
    }, 60000);

    afterAll(async () => {
        if (server) { await new Promise((resolve) => server.close(resolve)); }
        for (const file of plantedFiles) { fs.rmSync(file, { force: true }); }
        for (const dir of createdDirs.reverse()) { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    test.each([
        ['a receipt under gacp-pdfs', 'receipt'],
        ['a receipt in a gacp-pdfs subfolder', 'nestedReceipt'],
        ['an ID-card image at the root', 'idCard'],
        ['an applicant draft document', 'draft'],
        ['a public lab report', 'labReport'],
    ])('absolute form: %s is refused with 400 and no bytes', async (_label, key) => {
        for (const origin of ['http://127.0.0.1', 'http://gacp-backend:8000', 'https://staging.example.test']) {
            const res = await rawRequest(port, `${origin}/uploads/${files[key]}`);
            expect([origin, res.status, res.raw.includes(STUB)]).toEqual([origin, 400, false]);
        }
    });

    test.each([
        ['a receipt under gacp-pdfs', 'receipt'],
        ['an ID-card image at the root', 'idCard'],
        ['an applicant draft document', 'draft'],
    ])('origin form without a session: %s answers 401 and no bytes, as before', async (_label, key) => {
        const res = await rawRequest(port, `/uploads/${files[key]}`);
        expect([res.status, res.raw.includes(STUB)]).toEqual([401, false]);
    });

    test('origin form: the public lab report still opens for the consumer trace page', async () => {
        const res = await rawRequest(port, `/uploads/${files.labReport}`);
        expect([res.status, res.raw.includes(STUB)]).toEqual([200, true]);
    });
});
