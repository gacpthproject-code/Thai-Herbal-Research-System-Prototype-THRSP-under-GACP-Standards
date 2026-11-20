'use strict';

const STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', NOT_YET: 'NOT-YET' });

const TARGETS = Object.freeze({
    staging: Object.freeze({ hosts: Object.freeze(['staging.gacpth.com']) }),
    demo: Object.freeze({ hosts: Object.freeze(['demo.gacpth.com', '119.59.105.140']) }),
});

const pass = (detail) => ({ status: STATUS.PASS, detail });
const fail = (detail) => ({ status: STATUS.FAIL, detail });
const notYet = (detail) => ({ status: STATUS.NOT_YET, detail });

const KNOWN = new Set(Object.values(STATUS));

function normalizeCheck(c) {
    if (KNOWN.has(c.status)) { return c; }
    return { ...c, status: STATUS.FAIL, detail: `สถานะของข้อไม่รู้จัก (${JSON.stringify(c.status) ?? 'ไม่มี'}) นับเป็นไม่ผ่าน · ${c.detail ?? ''}` };
}

function foldRow(checks) {
    if (!checks.length) { return STATUS.NOT_YET; }
    if (checks.every((c) => c.status === STATUS.PASS)) { return STATUS.PASS; }
    if (checks.some((c) => c.status !== STATUS.PASS && c.status !== STATUS.NOT_YET)) { return STATUS.FAIL; }
    return STATUS.NOT_YET;
}

function exitCodeFor(rows) {
    return rows.some((r) => r.status === STATUS.FAIL) ? 1 : 0;
}

const PROBE_EXIT = Object.freeze({ 0: STATUS.PASS, 1: STATUS.FAIL, 2: STATUS.FAIL, 3: STATUS.NOT_YET });

function probeExitToStatus(code) {
    return PROBE_EXIT[code] ?? STATUS.FAIL;
}

function resolveTarget(baseUrl, explicitTarget) {
    let url;
    try { url = new URL(baseUrl); } catch { return { ok: false, reason: `base URL อ่านไม่ได้: ${baseUrl}` }; }
    if (url.protocol !== 'https:') { return { ok: false, reason: 'base URL ต้องเป็น https' }; }
    const name = Object.keys(TARGETS).find((t) => TARGETS[t].hosts.includes(url.hostname));
    if (!name) { return { ok: false, reason: `ไม่รู้จักเครื่อง ${url.hostname} (รู้จักแค่ ${Object.values(TARGETS).flatMap((t) => t.hosts).join(', ')})` }; }
    if (explicitTarget && explicitTarget !== name) { return { ok: false, reason: `--target ${explicitTarget} ไม่ตรงกับเครื่อง ${url.hostname} (${name})` }; }
    if (name === 'demo' && explicitTarget !== 'demo') { return { ok: false, reason: 'demo ต้องสั่งด้วย --target demo อย่างชัดเจน' }; }
    return { ok: true, name, base: url.origin };
}

function classifyStripeKey(prefixClass) {
    return ['test', 'live', 'absent'].includes(prefixClass) ? prefixClass : 'unknown';
}

function stripeGate({ paymentMode, secretKeyClass, publishableKeyClass }) {
    const reasons = [];
    if (paymentMode !== 'TRIAL') { reasons.push(`/api/payments/mode ตอบ ${paymentMode ?? 'ไม่ได้'} ไม่ใช่ TRIAL`); }
    if (classifyStripeKey(secretKeyClass) !== 'test') { reasons.push(`STRIPE_SECRET_KEY ของเครื่องเป็น ${classifyStripeKey(secretKeyClass)} ไม่ใช่ test`); }
    if (classifyStripeKey(publishableKeyClass) !== 'test') { reasons.push(`STRIPE_PUBLISHABLE_KEY ของเครื่องเป็น ${classifyStripeKey(publishableKeyClass)} ไม่ใช่ test`); }
    return reasons.length ? { ok: false, reason: reasons.join(' · ') } : { ok: true };
}

function selectRows(registry, wanted) {
    if (!wanted || !wanted.length) { return { ok: true, rows: registry }; }
    const known = new Set(registry.map((r) => r.id));
    const unknown = wanted.filter((id) => !known.has(id));
    if (unknown.length) { return { ok: false, reason: `ไม่รู้จักแถว ${unknown.join(', ')} (มี ${[...known].join(', ')})` }; }
    return { ok: true, rows: registry.filter((r) => wanted.includes(r.id)) };
}

function parseArgs(argv) {
    const opts = { base: null, target: null, rows: null, out: null, list: false };
    const seen = new Set();
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a.startsWith('--') && seen.has(a)) { throw new Error(`ตัวเลือก ${a} ซ้ำ`); }
        seen.add(a);
        if (a === '--target') { opts.target = argv[++i]; }
        else if (a === '--rows') { opts.rows = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean); }
        else if (a === '--out') { opts.out = argv[++i]; }
        else if (a === '--list') { opts.list = true; }
        else if (a.startsWith('--')) { throw new Error(`ไม่รู้จักตัวเลือก ${a}`); }
        else if (!opts.base) { opts.base = a; }
        else { throw new Error(`อาร์กิวเมนต์เกิน: ${a}`); }
    }
    return opts;
}

module.exports = {
    STATUS, TARGETS, pass, fail, notYet,
    normalizeCheck, foldRow, exitCodeFor, probeExitToStatus, resolveTarget, classifyStripeKey, stripeGate, selectRows, parseArgs,
};
