'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pass, fail, notYet, probeExitToStatus } = require('./verdict');
const { scrub, harvestNames } = require('./mask');
const { DEFAULT_CONFIG, accountCredentials, inContainer } = require('./target');
const { createDriver } = require('./driver');

const REPO = path.join(__dirname, '..', '..', '..');
const WALK_ROLES = ['applicant', 'dispatcher', 'reviewer', 'inspector', 'approver', 'finplat'];
const NO_ACCOUNT = 'WALK_NO_ACCOUNT';

// บัญชีที่เครื่องนี้ยังไม่มี = ยังวัดไม่ได้ (NOT-YET) ไม่ใช่ระบบพัง (FAIL) และไม่มีวันเป็น PASS
const missingAccountsNote = (roles) => `ยังไม่มีบัญชีเดินตรวจ ${roles.join(', ')} บนเครื่องนี้`;
const noAccountError = (role) => Object.assign(new Error(missingAccountsNote([role])), { code: NO_ACCOUNT });
const asMissingAccount = (err) => (err?.code === NO_ACCOUNT ? notYet(err.message) : null);

async function check(id, title, fn) {
    try {
        const r = await fn();
        return { id, title, ...r, detail: scrub(r.detail ?? '') };
    } catch (err) {
        const missing = asMissingAccount(err);
        if (missing) { return { id, title, ...missing }; }
        return { id, title, status: 'FAIL', detail: scrub(`ตรวจไม่จบ: ${String(err.message).split('\n')[0]}`).slice(0, 400) };
    }
}

function createContext({ base, targetName, cfg, outDir, log }) {
    const state = {};
    const accounts = Object.fromEntries(WALK_ROLES.map((r) => [r, accountCredentials(cfg, r)]).filter(([, a]) => a));
    const missingAccounts = WALK_ROLES.filter((r) => !accounts[r]);
    if (missingAccounts.length) { log(missingAccountsNote(missingAccounts)); }
    let driver = null;
    let credChecks = null;
    const signIns = {};

    async function http(method, p, { headers = {}, body } = {}) {
        const r = await fetch(base + p, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(60000) });
        const text = await r.text();
        let json = null; try { json = JSON.parse(text); harvestNames(json); } catch {}
        return { status: r.status, json, text };
    }

    async function checkPasswordsBeforeLogin() {
        if (credChecks) { return credChecks; }
        const rows = await inContainer(cfg, 'credcheck', Object.values(accounts).map((a) => ({ role: a.role, kind: a.staff ? 'staff' : 'health', identifier: a.identifier, password: a.password })));
        credChecks = Object.fromEntries(rows.map((r) => [r.role, r]));
        return credChecks;
    }

    async function getDriver() {
        if (driver) { return driver; }
        driver = createDriver({ base, outDir, accounts, totpScript: cfg.totpScript, fixtures: cfg.fixtures, mfaSlotsFile: path.join(path.dirname(DEFAULT_CONFIG), `.deploy-walk-mfa-slots-${targetName}.json`), log });
        await driver.start();
        return driver;
    }

    async function signIn(role) {
        if (signIns[role]) { return signIns[role]; }
        if (!accounts[role]) { throw noAccountError(role); }
        const cc = (await checkPasswordsBeforeLogin())[role];
        if (!cc || !cc.found || !cc.passwordMatches || cc.locked || !cc.active) {
            signIns[role] = { ok: false, reason: `ไม่ล็อกอิน: บัญชี ${role} ${!cc?.found ? 'ไม่พบ' : !cc.passwordMatches ? 'รหัสผ่านไม่ตรง hash' : cc.locked ? 'ถูกล็อกอยู่' : 'ถือ session ไม่ได้ตาม account-status'}` };
            return signIns[role];
        }
        signIns[role] = await (await getDriver()).signIn(role);
        return signIns[role];
    }

    function runProbe(name, env = {}) {
        const r = spawnSync('bash', [path.join(REPO, 'scripts/probes', `${name}.sh`)], {
            cwd: REPO, env: { ...process.env, PROBE_OUT_DIR: path.join(outDir, 'probe-evidence'), ...env }, encoding: 'utf8', timeout: 300000,
        });
        const out = scrub(`${r.stdout || ''}${r.stderr || ''}`);
        fs.appendFileSync(path.join(outDir, 'probes.log'), `===== ${name} exit ${r.status}\n${out}\n`);
        const verdict = out.split('\n').filter((l) => /^(PASS|FAIL|BLOCKED|PENDING):/.test(l)).pop() || out.trim().split('\n').pop() || '';
        return { status: probeExitToStatus(r.status), detail: `${name}: ${verdict}`.slice(0, 400) };
    }

    // ข้อที่ไม่พบอะไรผิด: PASS เมื่อมีบัญชีครบตาม roles · ขาดบทบาทใด = NOT-YET พร้อมชื่อบทบาท
    const passIfAccounts = (roles, detail) => {
        const lacking = roles.filter((r) => !accounts[r]);
        return lacking.length ? notYet(`${missingAccountsNote(lacking)} · ที่ตรวจได้: ${detail || 'ไม่มี'}`) : pass(detail);
    };

    async function close() { if (driver) { await driver.close(); } }

    return {
        base, targetName, cfg, outDir, log, state, accounts, missingAccounts, passIfAccounts, http, signIn, checkPasswordsBeforeLogin, runProbe,
        inContainer: (name, input, o) => inContainer(cfg, name, input, o),
        driver: () => getDriver(),
        close, pass, fail, notYet,
    };
}

module.exports = { createContext, check, asMissingAccount, WALK_ROLES };
