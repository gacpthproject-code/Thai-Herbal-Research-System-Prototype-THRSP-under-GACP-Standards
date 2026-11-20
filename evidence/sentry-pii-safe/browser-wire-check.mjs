// Browser wire check for the web Sentry client (evidence script, not part of the suite).
//
// Prerequisite: a production build whose baked DSN points at this sink:
//   NEXT_PUBLIC_SENTRY_DSN=http://publickey@127.0.0.1:18999/42 \
//   NEXT_PUBLIC_SENTRY_RELEASE=testbuild pnpm exec next build --no-lint
//   pnpm exec next start -p 3999
// Then: node evidence/sentry-pii-safe/browser-wire-check.mjs <page-path>
//
// Opens the page in real Chromium, throws an uncaught error whose message carries
// a fake national ID and email, and records what reaches the sink. Prints a
// summary only: counts, item types, the scrubbed exception value, and whether
// any fake value survived. Exit 1 if a fake value reached the sink or nothing did.
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/web-app/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const PAGE = process.argv[2] || '/';
const FAKE = ['1-2345-67890-12-3', '1234567890123', 'test@example.com'];
const received = [];

const sink = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
        let body = Buffer.concat(chunks);
        if (req.headers['content-encoding'] === 'gzip') body = zlib.gunzipSync(body);
        if (req.method === 'POST') received.push({ url: req.url, text: body.toString('utf8') });
        res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'application/json' });
        res.end('{}');
    });
});
await new Promise((r) => sink.listen(18999, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage();
const cspViolations = [];
page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text()); });
const response = await page.goto(`http://127.0.0.1:3999${PAGE}`, { waitUntil: 'networkidle' });
const csp = response.headers()['content-security-policy'] || '';
const connectSrc = (csp.match(/connect-src ([^;]+)/) || [])[1] || '';
// Let the lazily-imported SDK initialise, then throw from the page itself.
await page.waitForFunction(() => Boolean(globalThis.__SENTRY__), null, { timeout: 15000 }).catch(() => {});
await page.evaluate(() => {
    setTimeout(() => {
        throw new Error('[TEST] ทดสอบ 1-2345-67890-12-3 test@example.com — browser wire check, ignore');
    }, 0);
});
const deadline = Date.now() + 15000;
while (Date.now() < deadline && !received.some((r) => r.text.includes('"type":"event"'))) {
    await new Promise((r) => setTimeout(r, 200));
}
await browser.close();
sink.close();

const raw = received.map((r) => r.text).join('\n');
const leaked = FAKE.filter((v) => raw.includes(v));
const itemTypes = [];
let exceptionValue = null;
let user = null;
for (const { text } of received) {
    const lines = text.split('\n').filter(Boolean);
    for (let i = 1; i + 1 < lines.length; i += 2) {
        const h = JSON.parse(lines[i]);
        itemTypes.push(h.type);
        if (h.type === 'event') {
            const ev = JSON.parse(lines[i + 1]);
            exceptionValue = ev.exception?.values?.[0]?.value ?? null;
            user = ev.user ?? null;
        }
    }
}
const summary = {
    page: PAGE,
    httpStatus: response.status(),
    connectSrcAdmitsSink: connectSrc.split(/\s+/).includes('http://127.0.0.1:18999'),
    connectSrcCarriesPublicKey: connectSrc.includes('publickey'),
    cspViolations: cspViolations.length,
    envelopesReceived: received.length,
    itemTypes,
    exceptionValue,
    user,
    fakeValuesThatReachedTheSink: leaked,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(leaked.length === 0 && exceptionValue ? 0 : 1);
