/**
 * ลิงก์ที่ backend สร้างให้คนกด ต้องพาไปหน้าที่มีอยู่จริงบนเว็บ
 *
 * operator กดจริง 2026-09-07: การแจ้งเตือน "เอกสารผ่านการตรวจสอบ" พาไป
 * /health/applications/:id/payment → **404** — หน้านั้นไม่เคยมีในระบบ
 *
 * ไล่ทั้งไฟล์แล้วเจอลิงก์ตายสามใบ ไม่ใช่ใบเดียว (ตรวจกับ src/app จริงทีละเส้น):
 *
 *   /health/applications/:id/payment   → ไม่มี  (ของจริง: /health/payments?app=:id)
 *   /provider/review/:id               → ไม่มี  (ของจริง: /provider/reviewer — คิวof ผู้ตรวจ)
 *   /provider/audit/:id                → ไม่มี  (ของจริง: /provider/audits/:id — หน้ารับ
 *                                                params.id เป็น applicationId อยู่แล้ว)
 *
 * ลิงก์แจ้งเตือนคือปุ่มที่คนกดตอน "มีงานมาถึงมือ" — reviewer ที่เพิ่งได้รับมอบหมาย และ
 * auditor ที่เพิ่งได้คิวตรวจ กดแล้วเจอ 404 มาตลอด ทุกใบ ตั้งแต่ระบบแจ้งเตือนเกิด
 * ไม่มีเทสไหนจับ เพราะเทสของ service ตรวจว่า "ส่งการแจ้งเตือนแล้ว" ไม่เคยถามว่า
 * "ปลายทางมีจริงไหม" — เทสนี้ถามด้วยการอ่านโครง src/app ของเว็บจริง
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..', '..');
const SOURCE_DIRS = ['services', 'routes', 'jobs', 'cron', 'controllers']
    .map((d) => path.join(BACKEND_DIR, d));
const APP_DIR = path.join(BACKEND_DIR, '..', 'web-app', 'src', 'app');

function runtimeSources(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            if (name !== '__tests__' && name !== 'node_modules') { runtimeSources(full, out); }
        } else if (name.endsWith('.js') && !name.endsWith('.test.js')) {
            out.push(full);
        }
    }
    return out;
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const WEB_PATH_PREFIXES = ['health', 'provider', 'admin', 'verify', 'trace', 'dashboard'];
const WEB_PATH_START = new RegExp(`^/(?:${WEB_PATH_PREFIXES.join('|')})(?:[/?#]|$)`);

const LITERAL = String.raw`\x60[^\x60]*\x60|'[^'\n]*'|"[^"\n]*"`;
const OPERAND = String.raw`(?:${LITERAL}|[\w.$]+(?:\([^()]*\))?)`;
const CHAIN = String.raw`(?<chain>(?:${LITERAL})(?:\s*\+\s*${OPERAND})*)`;
const LINK_CHAIN = new RegExp(String.raw`(?<open>[=:(+,\[?]|return|&&)\s*(?:[\w.?]+\s*\|\|\s*)?\(?${CHAIN}`, 'g');
const BASE_DECLARATION = new RegExp(String.raw`(?:const|let|var)\s+(?<name>\w+)\s*=\s*(?:[\w.?]+\s*\|\|\s*)?\(?${CHAIN}`, 'g');
const EXPRESS_ROUTE_REGISTRATION = /\.(?:get|post|put|patch|delete|head|options|all|use|route)\s*\($/;
const isExpressRoutePath = (src, { index, groups: { open } }) => open === '(' && EXPRESS_ROUTE_REGISTRATION.test(src.slice(0, index + 1));
const isApiHost = (hostExpression) => /ROUTE_BASE|API/.test(hostExpression || '');
const UNKNOWN_SEGMENT = 'x-value';

function renderChain(chain, bases) {
    let host = null;
    let out = '';
    chain.match(new RegExp(OPERAND, 'g')).forEach((operand, index) => {
        if (operand[0] === '\x60') {
            out += operand.slice(1, -1).replace(/\$\{([^}]+)\}/g, (_m, expression, offset) => {
                const name = expression.trim().replace(/\(\)$/, '');
                if (bases[name] !== undefined) { return bases[name]; }
                if (index === 0 && offset === 0) { host = expression; return ''; }
                return UNKNOWN_SEGMENT;
            });
        } else if (operand[0] === "'" || operand[0] === '"') {
            out += operand.slice(1, -1);
        } else {
            out += bases[operand.replace(/\(\)$/, '')] ?? UNKNOWN_SEGMENT;
        }
    });
    return { host, path: out.replace(/^https?:\/\/[^/]+/, '') };
}

function webPathBasesIn(src) {
    const bases = {};
    for (const { groups: { name, chain } } of src.matchAll(BASE_DECLARATION)) {
        const { path: webPath } = renderChain(chain, bases);
        if (WEB_PATH_START.test(webPath)) { bases[name] = webPath; }
    }
    return bases;
}

function webLinksIn(file) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const bases = webPathBasesIn(src);
    const found = [];
    for (const match of src.matchAll(LINK_CHAIN)) {
        if (isExpressRoutePath(src, match)) { continue; }
        const { host, path: webPath } = renderChain(match.groups.chain, bases);
        if (isApiHost(host) || !WEB_PATH_START.test(webPath)) { continue; }
        found.push(`${path.relative(BACKEND_DIR, file)} → ${webPath}`);
    }
    return found;
}

function routeDir(pathname) {
    const segments = pathname.split(/[?#]/)[0].split('/').filter(Boolean);
    let dirs = [APP_DIR];
    for (const seg of segments) {
        const next = [];
        for (const dir of dirs) {
            // route group (public) ไม่ปรากฏใน URL — มองทะลุเข้าไป
            const groups = fs.readdirSync(dir).filter((n) => n.startsWith('(')).map((n) => path.join(dir, n));
            for (const base of [dir, ...groups]) {
                const names = fs.readdirSync(base);
                if (seg === UNKNOWN_SEGMENT) {
                    names.filter((n) => n.startsWith('[')).forEach((n) => next.push(path.join(base, n)));
                } else if (names.includes(seg)) {
                    next.push(path.join(base, seg));
                }
            }
        }
        dirs = next;
        if (dirs.length === 0) { return null; }
    }
    return dirs.find((d) => fs.existsSync(path.join(d, 'page.tsx'))) || null;
}

function queryKeysReadBy(dir) {
    const keys = new Set();
    for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.tsx') || name.endsWith('.test.tsx')) { continue; }
        const src = fs.readFileSync(path.join(dir, name), 'utf8');
        if (!src.includes('useSearchParams')) { continue; }
        for (const m of src.matchAll(/\.get\(['"]([^'"]+)['"]\)/g)) { keys.add(m[1]); }
    }
    return keys;
}

describe('ทุกลิงก์ฝั่งเว็บที่ backend ประกอบขึ้น ลงจอดบนหน้าที่มีจริง', () => {
    const links = SOURCE_DIRS.flatMap((d) => runtimeSources(d)).flatMap(webLinksIn);

    it('สกัดลิงก์ได้จริง (อย่างน้อย 20 ใบ จากทุกโฟลเดอร์ runtime)', () => {
        expect(links.length).toBeGreaterThanOrEqual(20);
        expect(links.some((l) => l.startsWith('jobs/'))).toBe(true);
        expect(links.some((l) => l.startsWith('services/pdf/'))).toBe(true);
    });

    it.each(links)('%s มีหน้าอยู่จริง', (link) => {
        expect(routeDir(link.split(' → ')[1])).not.toBeNull();
    });

    it('ปุ่มจ่ายเงินพาไปหน้า payments พร้อมเลือกคำขอให้ ไม่ใช่หน้าที่ไม่มี', () => {
        const src = fs.readFileSync(path.join(BACKEND_DIR, 'services', 'notification', 'domain-helpers.js'), 'utf8');
        expect(src).toContain('/health/payments?app=');
        expect(src).not.toContain('}/payment`');
    });
});

describe('ลิงก์ในจดหมายเตือนต่ออายุ (cron/renewal-reminder-cron.js)', () => {
    const APP_PUBLIC_URL = 'https://web.example.test';
    let buildRenewalPayload;

    beforeAll(() => {
        jest.resetModules();
        process.env.APP_PUBLIC_URL = APP_PUBLIC_URL;
        jest.doMock('../../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
        jest.doMock('../../services/renewal-service', () => ({ REMINDER_DAYS: [60, 30, 15], REMINDER_TYPE_BY_DAYS: {} }));
        jest.doMock('../../services/notification/application-parties', () => ({ fanoutToApplicationParties: jest.fn() }));
        ({ _internals: { _buildRenewalPayload: buildRenewalPayload } } = require('../../cron/renewal-reminder-cron'));
    });

    afterAll(() => {
        delete process.env.APP_PUBLIC_URL;
    });

    const certificate = {
        id: '3f0c4e5a-1d2b-4c6e-9a8f-0b1c2d3e4f5a',
        certificateNumber: 'TH-GACP 87/2568',
        farmName: 'ไร่ตัวอย่าง',
        expiryDate: '2027-01-15T00:00:00.000Z',
        daysLeft: 30,
    };

    it('ใช้ที่อยู่เว็บจาก config/public-urls ตัวเดียวกับลิงก์ verify ไม่ใช่โฮสต์ที่เขียนตายตัว', () => {
        const { renewalUrl, actionUrl } = buildRenewalPayload({ certificate });
        expect(new URL(renewalUrl).origin).toBe(APP_PUBLIC_URL);
        expect(actionUrl).toBe(renewalUrl);
    });

    it('พาไปหน้าที่มีจริง และหน้านั้นอ่าน query ที่ลิงก์ส่งไป เพื่อเริ่มต่ออายุใบนั้น', () => {
        const { renewalUrl } = buildRenewalPayload({ certificate });
        const url = new URL(renewalUrl);
        const landing = routeDir(url.pathname);
        expect(landing).not.toBeNull();

        const keys = [...url.searchParams.keys()];
        expect(keys.length).toBeGreaterThan(0);
        const readByPage = queryKeysReadBy(landing);
        for (const key of keys) { expect(readByPage).toContain(key); }
        expect([...url.searchParams.values()]).toContain(certificate.id);
    });

    it('ส่งเลขที่ใบ จำนวนวัน และวันหมดอายุให้เทมเพลต CERTIFICATE_EXPIRING_SOON อ่าน', () => {
        const payload = buildRenewalPayload({ certificate });
        expect(payload).toMatchObject({
            certNumber: certificate.certificateNumber,
            farmName: certificate.farmName,
            daysLeft: 30,
            expiryDate: certificate.expiryDate,
        });
    });
});
