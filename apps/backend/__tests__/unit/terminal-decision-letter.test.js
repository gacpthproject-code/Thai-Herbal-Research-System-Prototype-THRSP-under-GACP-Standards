/**
 * The order not to certify (TERMINAL_DECISION letter): R2 M3b made it a letter of its own kind,
 * order 56(2) and spec 5.5 gave it its parts, order 118(1) makes the appeal part come from the appeal setting.
 *
 *   1. title and the issuer sentence of order 56(0)
 *   2. the facts: holder, site, the visit and the inspector's recorded result, the findings, the
 *      correction rounds already run
 *   3. the reason from the fixed list (order 44) with the rule it rests on
 *   4. the approver's consideration (APA s.37), apart from the internal note
 *   5. the order itself
 *   6. the right to appeal, its time limit and channel, from the appeal setting in force
 *   7. the right to file a new application
 *
 * No official's name, position or signature (order 83(3)) and no platform email in the contact
 * (order 78(4)). Every party gets its own letter in the decision's transaction (orders 29 and 32);
 * no letter, no order (D-8); a terminal order writes no correction round.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

// ── fixtures ───────────────────────────────────────────────────────────────

const TERMINAL = 'TERMINAL_DECISION';
const FARMER = { id: 'farmer-1', organizationId: 'org-farm' };

let mockCurrentUser = null;

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../shared/logger', () => ({
    ...mockLogger,
    createLogger: jest.fn(() => mockLogger),
}));

const { TEST_APPEAL_SETUP } = require('../../test-support/appeal-setup');

const APPEAL_SENTENCE = `ท่านมีสิทธิ์อุทธรณ์คำสั่งนี้ภายใน ${TEST_APPEAL_SETUP.timeLimitDays} วันนับแต่วันที่ได้รับแจ้งคำสั่ง`;

jest.mock('../../services/tenant-context', () => ({
    getTenantContext: () => null,
    withoutTenantScope: (fn) => fn(),
}));
jest.mock('../../services/notification-fanout-service', () => ({
    send: jest.fn().mockResolvedValue({ ok: true }),
}));

const mockFindUserByHealthIdSecurely = jest.fn();
jest.mock('../../services/user-lookup-service', () => ({
    findUserByHealthIdSecurely: (...a) => mockFindUserByHealthIdSecurely(...a),
    findUserByProviderIdSecurely: jest.fn(),
    resolveUserIdFromHealthIdSecurely: jest.fn().mockResolvedValue('farmer-1'),
}));

// The inspector's PASS asks the onsite-evidence gate before the write (Batch A item 2);
// the gate has its own suites (onsite-evidence-gate, approver-sees-the-file-pass-doors).
jest.mock('../../services/onsite-evidence-gate', () => ({
    assertOnsiteEvidenceSufficient: jest.fn().mockResolvedValue({}),
    assertOnsiteEvidenceForPass: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../services/application-status-writer', () => ({
    writeApplicationStatus: jest.fn(async () => ({})),
}));
const { writeApplicationStatus } = require('../../services/application-status-writer');

jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue({}), logWithin: jest.fn() },
    AuditCategory: { APPLICATION: 'APPLICATION' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { APPLICATION: 'APPLICATION' },
    statusTransitionAuditHook: jest.fn(() => jest.fn().mockResolvedValue({})),
}));

jest.mock('../../utils/field-encryption', () => ({ maskThaiId: (x) => x || null }));

/**
 * A transaction client that records both the letter write and any (forbidden)
 * correction-round write, so "no round on a terminal decision" is provable.
 */
function makeLetterTx() {
    return {
        notification: {
            create: jest.fn(async ({ data }) => ({ id: 'letter-1', ...data })),
        },
        correctionRound: {
            count: jest.fn(async () => 0),
            create: jest.fn(async ({ data }) => ({ id: 'round-1', ...data })),
        },
    };
}

jest.mock('../../services/certificate-service', () => ({
    revokeCertificateForApplication: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../shared/application-visibility', () => ({
    ...jest.requireActual('../../shared/application-visibility'),
    withVisibility: (where) => where,
}));

const mockFindApplicationStatusOverrideSlice = jest.fn();
jest.mock('../../services/admin-application-service', () => ({
    bulkUpdateRevisionDeadlineStatus: jest.fn().mockResolvedValue(null),
    findRevisionDeadlineByApplicationId: jest.fn().mockResolvedValue(null),
    upsertRevisionDeadline: jest.fn().mockResolvedValue(null),
    findApplicationStatusOverrideSlice: (...a) => mockFindApplicationStatusOverrideSlice(...a),
    ALLOWED_FORCE_STATUSES: jest.requireActual('../../services/admin-application-service').ALLOWED_FORCE_STATUSES,
}));

// ── surface 2: auditor audit-decision handler ──────────────────────────────

const auditorTx = makeLetterTx();
const mockAuditorTransaction = jest.fn(async (cb) => cb(auditorTx));
const mockFindAuditDecisionApplication = jest.fn();

jest.mock('../../routes/api/provider/handlers/auditor-handler-deps', () => ({
    authenticateProvider: (req, _res, next) => { req.user = mockCurrentUser; next(); },
    requireCanonicalPermission: () => (_req, _res, next) => next(),
    PERMISSIONS: { APPLICATION_AUDIT_RECORD: 'perm' },
    logger: mockLogger,
    obj: (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {}),
    arr: (x) => (Array.isArray(x) ? x : []),
    prisma: { $transaction: (...a) => mockAuditorTransaction(...a) },
    workflowTransitionService: { resolveStateFromApplication: () => 'AUDIT_CONFIRMED' },
    getRequestIp: () => '127.0.0.1',
    auditLogger: { log: jest.fn().mockResolvedValue({}) },
    AuditCategory: { APPLICATION: 'APPLICATION' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { APPLICATION: 'APPLICATION' },
    resolveUserIdFromHealthId: jest.fn().mockResolvedValue('farmer-1'),
    applicationService: {
        findAuditDecisionApplication: (...a) => mockFindAuditDecisionApplication(...a),
        findAuditDecisionPostWriteSlice: jest.fn().mockResolvedValue({ id: 'app-1', applicationNumber: 'GACP-001', status: 'REJECTED' }),
    },
}));

jest.mock('../../services/car-deadline-service', () => ({
    computeCarDueDate: jest.fn(() => new Date('2026-08-11T09:59:59.000Z')),
}));

// ── surface 3: legacy admin status-override ────────────────────────────────

const adminTx = makeLetterTx();
const mockAdminTransaction = jest.fn(async (cb) => cb(adminTx));

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        application: { findFirst: jest.fn(), findUnique: jest.fn() },
        user: { findFirst: jest.fn(async () => ({ id: 'farmer-1', organizationId: 'org-farm' })) },
        notification: { create: jest.fn(async ({ data }) => ({ id: 'n-1', ...data })), findMany: jest.fn(async () => []) },
        $transaction: (...a) => mockAdminTransaction(...a),
    },
}));

jest.mock('../../middleware/auth-middleware', () => ({
    authenticateAny: (req, _res, next) => { req.user = mockCurrentUser; next(); },
    authenticateProvider: (req, _res, next) => { req.user = mockCurrentUser; next(); },
    authenticateDTAM: (req, _res, next) => { req.user = mockCurrentUser; next(); },
    requireRole: () => (_req, _res, next) => next(),
}));

jest.mock('../../services/assignment-ledger-service', () => ({ recordAssignment: jest.fn() }));
jest.mock('../../services/provider-user-service', () => ({}));
jest.mock('../../utils/client-ip', () => ({ getRequestIp: () => '127.0.0.1' }));

// ── routers under test ─────────────────────────────────────────────────────

const { auditorAuditDecisions } = require('../../routes/api/provider/handlers/auditor-audit-decision-handler');
const { adminStatusOverride } = require('../../routes/api/provider/handlers/admin');

function buildAuditorApp() {
    const app = express();
    app.use(express.json());
    app.post('/auditor/applications/:id/audit-decisions', ...auditorAuditDecisions);
    return app;
}
function buildAdminApp() {
    const app = express();
    app.use(express.json());
    app.post('/admin/status-override', ...adminStatusOverride);
    return app;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** The single letter row written through the given tx (asserts exactly one). */
function letterWrittenThrough(tx) {
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    return tx.notification.create.mock.calls[0][0].data;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = null;
    mockFindUserByHealthIdSecurely.mockResolvedValue({ ...FARMER });
    writeApplicationStatus.mockResolvedValue({});
    mockAuditorTransaction.mockImplementation(async (cb) => cb(auditorTx));
    mockAdminTransaction.mockImplementation(async (cb) => cb(adminTx));
    for (const tx of [auditorTx, adminTx]) {
        tx.notification.create.mockImplementation(async ({ data }) => ({ id: 'letter-1', ...data }));
        tx.correctionRound.count.mockResolvedValue(0);
        tx.correctionRound.create.mockImplementation(async ({ data }) => ({ id: 'round-1', ...data }));
    }
});

// ───────────────────────────────────────────────────────────────────────────
// 1. Template — shared/terminal-letter-template.js (spec 5.5 items 1 to 5 and 7; until DTAM answers,
// today's reservation sentence stands in for item 6 and no official is named: order 83(3))
// ───────────────────────────────────────────────────────────────────────────

const FACTS = Object.freeze({
    holderName: 'บริษัท ทดสอบหนังสือ จำกัด',
    siteName: 'ฟาร์มทดสอบหนังสือ',
    siteAddress: '9 หมู่ 1 จ.นครปฐม',
    visitedAt: '2026-10-12T03:00:00.000Z',
    inspectorVerdict: 'FAIL',
    inspectorDecidedAt: '2026-10-12T08:00:00.000Z',
    findings: ['ไม่มีบันทึกการใช้ปุ๋ยย้อนหลัง 3 เดือน', 'โรงเก็บผลผลิตไม่มีประตูล็อก'],
    correctionRounds: 2,
});
const ORDER = Object.freeze({
    applicationNumber: 'GACP-001',
    stage: 'AUDIT_NOT_PASSED',
    reason: 'พบข้อบกพร่องร้ายแรงที่ขัดต่อมาตรฐาน GACP และแก้ไขให้เป็นไปตามมาตรฐานไม่ได้',
    consideration: 'ข้อบกพร่องทั้งสองข้อกระทบการควบคุมผลผลิตโดยตรง และผู้ยื่นแก้ไขในระยะสั้นไม่ได้',
    facts: FACTS,
    appeal: TEST_APPEAL_SETUP,
    refusalId: '0b4f2c1e-6f1a-4c43-9d55-8d5bb3f7f0a1',
});

describe('buildTerminalDecisionLetter — the order not to certify (spec 5.5)', () => {
    const load = () => require('../../shared/terminal-letter-template');

    test('title, issuer, facts, reason with the rule, consideration, the order, the appeal setting and the new-application right', () => {
        const { buildTerminalDecisionLetter } = load();
        const { CERTIFICATE_ISSUER_TH } = require('../../services/certificate/public-facts');
        const letter = buildTerminalDecisionLetter(ORDER);
        expect(letter.title).toBe('หนังสือแจ้งคำสั่งไม่ให้การรับรองมาตรฐาน GACP คำขอเลขที่ GACP-001');
        for (const part of [
            CERTIFICATE_ISSUER_TH, FACTS.holderName, FACTS.siteName, FACTS.siteAddress,
            'ผู้ตรวจพื้นที่', 'ไม่ผ่าน', ...FACTS.findings, 'มาแล้ว 2 รอบ',
            ORDER.reason, 'มาตรฐาน GACP', ORDER.consideration,
            'จึงมีคำสั่งไม่ให้การรับรองคำขอเลขที่ GACP-001', APPEAL_SENTENCE, `ช่องทางการอุทธรณ์: ${TEST_APPEAL_SETUP.channel}`, 'ยื่นคำขอรับรองใหม่',
        ]) {
            expect([part, letter.message.includes(part)]).toEqual([part, true]);
        }
        expect(letter.metadata).toEqual({
            applicationNumber: 'GACP-001', stage: 'AUDIT_NOT_PASSED', letterType: TERMINAL,
            reason: ORDER.reason, refusalId: ORDER.refusalId, appeal: TEST_APPEAL_SETUP,
        });
    });

    test('a file the inspector passed states that result, with no findings list', () => {
        const { buildTerminalDecisionLetter } = load();
        const letter = buildTerminalDecisionLetter({
            ...ORDER, stage: 'AUDIT_PASSED', facts: { ...FACTS, inspectorVerdict: 'PASS', findings: [], correctionRounds: 0 },
        });
        expect(letter.message).toContain('บันทึกผลว่า ผ่าน');
        expect(letter.message).not.toContain('ข้อบกพร่องที่พบ');
        expect(letter.message).not.toContain('รอบ');
    });

    test('no status label, no official named, no platform email, no time limit but the setting\'s (orders 78(4), 83(3), 118(1))', () => {
        const { buildTerminalDecisionLetter } = load();
        const { STATUS_PRESENTATION } = require('../../shared/status-machine-contract');
        for (const stage of ['AUDIT_PASSED', 'AUDIT_NOT_PASSED']) {
            const letter = buildTerminalDecisionLetter({ ...ORDER, stage });
            expect(letter.message).not.toContain(STATUS_PRESENTATION[stage].label);
            for (const word of ['อธิบดี', 'ปฏิบัติราชการแทน', 'ลงนาม', 'contact@gacpth.com']) {
                expect([word, letter.message.includes(word)]).toEqual([word, false]);
            }
            expect(letter.message.match(/ภายใน\s*\d+\s*วัน/g)).toEqual([`ภายใน ${TEST_APPEAL_SETUP.timeLimitDays} วัน`]);
        }
    });

    test.each([
        ['reason', { reason: '   ' }, /reason/i],
        ['consideration', { consideration: '' }, /consideration/i],
        ['consideration', { consideration: undefined }, /consideration/i],
        ['stage', { stage: 'NOT_A_STATE' }, /stage/i],
        ['facts', { facts: undefined }, /facts/i],
        ['appeal setting', { appeal: undefined }, /appeal/i],
    ])('a missing %s THROWS: an order without it is not served (D-8)', (_name, change, message) => {
        const { buildTerminalDecisionLetter } = load();
        expect(() => buildTerminalDecisionLetter({ ...ORDER, ...change })).toThrow(message);
    });

    test('NO deadline: no dueAt in metadata and no กำหนดส่ง wording', () => {
        const { buildTerminalDecisionLetter } = load();
        const letter = buildTerminalDecisionLetter({ ...ORDER, dueAt: new Date('2026-08-11T09:59:59.000Z') });
        expect(letter.metadata.dueAt).toBeUndefined();
        expect(letter.message).not.toContain('กำหนดส่ง');
    });

    test('the template file re-spells no phone, email or URL', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'terminal-letter-template.js'), 'utf8');
        expect(src).not.toMatch(/\d[\d-]{6,}/);
        expect(src).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
        expect(src).not.toMatch(/https?:\/\//);
    });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Mint point — services/decision-letter-service.js: one letter per party, in the decision's tx
// ───────────────────────────────────────────────────────────────────────────

describe('mintTerminalDecisionLetters — D-8 atomic, every party, no round', () => {
    const load = () => require('../../services/decision-letter-service');
    const withUsers = (tx, users) => Object.assign(tx, {
        user: { findMany: jest.fn(async () => users) },
    });

    test('writes one letter per party through the caller tx, each with the same refusalId, and NEVER a CorrectionRound row', async () => {
        const { mintTerminalDecisionLetters } = load();
        const tx = withUsers(makeLetterTx(), [{ id: 'u-1', organizationId: 'org-a' }, { id: 'u-2', organizationId: 'org-b' }]);
        await mintTerminalDecisionLetters({ tx, recipientUserIds: ['u-1', 'u-2'], applicationId: 'app-1', order: ORDER });
        expect(tx.notification.create).toHaveBeenCalledTimes(2);
        const rows = tx.notification.create.mock.calls.map(([{ data }]) => data);
        expect(rows.map((r) => [r.userId, r.organizationId, r.kind, r.metadata.refusalId, r.metadata.applicationId])).toEqual([
            ['u-1', 'org-a', 'OFFICIAL_LETTER', ORDER.refusalId, 'app-1'],
            ['u-2', 'org-b', 'OFFICIAL_LETTER', ORDER.refusalId, 'app-1'],
        ]);
        expect(tx.correctionRound.create).not.toHaveBeenCalled();
        expect(tx.correctionRound.count).not.toHaveBeenCalled();
    });

    test('no party to serve REJECTS before any row is written (no letter, no order)', async () => {
        const { mintTerminalDecisionLetters } = load();
        const tx = withUsers(makeLetterTx(), []);
        await expect(mintTerminalDecisionLetters({ tx, recipientUserIds: [], applicationId: 'app-1', order: ORDER }))
            .rejects.toThrow(/recipient/i);
        expect(tx.notification.create).not.toHaveBeenCalled();
    });

    test('a party without an account or a tenant REJECTS the whole order', async () => {
        const { mintTerminalDecisionLetters } = load();
        const tx = withUsers(makeLetterTx(), [{ id: 'u-1', organizationId: 'org-a' }]);
        await expect(mintTerminalDecisionLetters({ tx, recipientUserIds: ['u-1', 'u-gone'], applicationId: 'app-1', order: ORDER }))
            .rejects.toThrow(/recipient/i);
        expect(tx.notification.create).not.toHaveBeenCalled();
    });

    test('an order missing its consideration REJECTS before any row is written', async () => {
        const { mintTerminalDecisionLetters } = load();
        const tx = withUsers(makeLetterTx(), [{ id: 'u-1', organizationId: 'org-a' }]);
        await expect(mintTerminalDecisionLetters({ tx, recipientUserIds: ['u-1'], applicationId: 'app-1', order: { ...ORDER, consideration: ' ' } }))
            .rejects.toThrow(/consideration/i);
        expect(tx.notification.create).not.toHaveBeenCalled();
    });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Surface — the job sheet: REJECT is retired (order 56(2)): the inspector records "ไม่ผ่าน" and
// the certificate approver decides, so no inspector door mints a refusal letter
// ───────────────────────────────────────────────────────────────────────────

describe('auditor audit-decision — REJECT is retired, nothing is written (order 56(2))', () => {
    test('REJECT = 400, no status write, no letter', async () => {
        mockCurrentUser = { id: 'aud-1', role: 'field_inspector', canonicalRole: 'field_inspector', organizationId: 'org-1' };
        mockFindAuditDecisionApplication.mockResolvedValue({
            id: 'app-1', applicationNumber: 'GACP-001', auditorId: 'aud-1', healthId: 'h-1',
            status: 'AUDIT_CONFIRMED', formData: {}, workflowHistory: [],
        });
        const res = await request(buildAuditorApp())
            .post('/auditor/applications/app-1/audit-decisions')
            .send({ decision: 'REJECT', notes: 'แปลงไม่ผ่านเกณฑ์' });

        expect(res.status).toBe(400);
        expect(mockAuditorTransaction).not.toHaveBeenCalled();
        expect(writeApplicationStatus).not.toHaveBeenCalled();
        expect(auditorTx.notification.create).not.toHaveBeenCalled();
    });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Surface — legacy admin status-override (no longer a REJECTED writer, order 35)
// ───────────────────────────────────────────────────────────────────────────

describe('admin status-override — no terminal letter (order 35)', () => {
    beforeEach(() => {
        mockCurrentUser = {
            id: 'admin-1', role: 'admin', canonicalRole: 'system_admin_dtam', organizationId: 'org-1',
            firstName: 'Admin', lastName: 'One',
        };
        mockFindApplicationStatusOverrideSlice.mockResolvedValue({
            id: 'app-1',
            applicationNumber: 'GACP-001',
            healthId: 'h-1',
            status: 'AUDIT_CONFIRMED',
            workflowHistory: [],
        });
    });

    test('the override mints no letter: REJECTED is not an admin\'s to write (order 35; the writer refuses it, staff-access-2-real-postgres)', async () => {
        await request(buildAdminApp())
            .post('/admin/status-override')
            .send({ applicationId: 'app-1', newStatus: 'REJECTED', reason: 'คำสั่งศาลให้ยุติการพิจารณาคำขอนี้' });

        expect(adminTx.notification.create).not.toHaveBeenCalled();
        expect(fs.readFileSync(path.join(__dirname, '..', '..', 'routes/api/provider/handlers/admin.js'), 'utf8'))
            .not.toMatch(/decision-letter-service/);
    });

    test('a non-terminal override (CAR_REVIEWING) mints NO letter (negative control)', async () => {
        // Not a decision state: order 31 refuses an admin override into AUDIT_PASSED.
        const res = await request(buildAdminApp())
            .post('/admin/status-override')
            .send({ applicationId: 'app-1', newStatus: 'CAR_REVIEWING', reason: 'แก้ไขสถานะที่บันทึกผิด' });

        expect(res.status).toBe(200);
        expect(adminTx.notification.create).not.toHaveBeenCalled();
    });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. SSOT — the terminal copy lives in exactly one file (Law 3.5/3.6)
// ───────────────────────────────────────────────────────────────────────────

describe('terminal letter template SSOT', () => {
    const BACKEND = path.join(__dirname, '..', '..');
    const TEMPLATE_PATH = path.join(BACKEND, 'shared', 'terminal-letter-template.js');

    function walkJsFiles(dir, out = []) {
        const SKIP = new Set([
            'node_modules', '__tests__', 'chaos-tests', 'coverage',
            '.next', 'dist', 'build', '.turbo',
        ]);
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (SKIP.has(entry.name)) { continue; }
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walkJsFiles(p, out);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                out.push(p);
            }
        }
        return out;
    }

    test('the terminal Thai copy is defined ONLY in shared/terminal-letter-template.js', () => {
        expect(fs.existsSync(TEMPLATE_PATH)).toBe(true);
        for (const phrase of [
            'ท่านมีสิทธิ์โต้แย้งคำสั่งตามที่กฎหมายกำหนด',
            'เหตุผลและหลักเกณฑ์ที่ใช้พิจารณา',
            'หนังสือแจ้งคำสั่งไม่ให้การรับรอง',
        ]) {
            const offenders = walkJsFiles(BACKEND)
                .filter((f) => f !== TEMPLATE_PATH)
                .filter((f) => fs.readFileSync(f, 'utf8').includes(phrase))
                .map((f) => path.relative(BACKEND, f));
            expect(offenders).toEqual([]);
        }
    });

    test('the refusal letter is minted by the approver\'s decision alone; the inspector\'s doors and the generic door mint none (order 56(2))', () => {
        const read = (rel) => fs.readFileSync(path.join(BACKEND, rel), 'utf8');
        for (const rel of [
            'routes/api/provider/handlers/auditor-audit-decision-handler.js',
            'routes/api/provider/handlers/workflow-transitions-handler.js',
            'services/inspection-result-service.js',
            'services/audit-onsite-service.js',
        ]) {
            expect([rel, /mintTerminalDecisionLetter/.test(read(rel))]).toEqual([rel, false]);
            expect(read(rel)).not.toContain('โต้แย้งคำสั่ง');
        }
        const approver = read('services/certification-decision-service.js');
        expect(approver).toMatch(/mintTerminalDecisionLetters/);
        expect(approver).not.toContain('โต้แย้งคำสั่ง');
    });

    test('the terminal template never reaches for the correction template deadline copy', () => {
        const src = fs.readFileSync(TEMPLATE_PATH, 'utf8');
        expect(src).not.toContain('กำหนดส่งการแก้ไข');
        expect(src).not.toContain('ช่องทางการส่งการแก้ไข');
        expect(src).not.toMatch(/dueAt/);
    });

    test('the terminal mint never writes a correction round (grep pin, both directions)', () => {
        const src = fs.readFileSync(path.join(BACKEND, 'services', 'decision-letter-service.js'), 'utf8');
        // Non-vacuous: the function must EXIST before its body can be pinned.
        expect(src).toContain('async function mintTerminalDecisionLetters');
        const terminalFn = src.slice(src.indexOf('async function mintTerminalDecisionLetters'));
        expect(terminalFn).not.toMatch(/correctionRound/);
        // ...and the correction mint must still keep its round ledger (M3 pin
        // stays true — this change must not delete the correction-round append).
        expect(src).toMatch(/correctionRound\s*\.\s*create/);
    });
});
