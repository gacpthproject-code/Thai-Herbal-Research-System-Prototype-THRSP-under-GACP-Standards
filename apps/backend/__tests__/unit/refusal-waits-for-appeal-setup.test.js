'use strict';

const { APPEAL_SETUP_KEY, parseAppealSetup, parseAppealHistory, appealSetupInForce } = require('../../shared/appeal-setup');
const { TEST_APPEAL_SETUP } = require('../../test-support/appeal-setup');
const { buildTerminalDecisionLetter } = require('../../shared/terminal-letter-template');
const { ERROR_CODES } = require('../../shared/error-codes');

const dbHolding = (value) => ({
    systemConfig: {
        findUnique: jest.fn(async ({ where }) => (where.key === APPEAL_SETUP_KEY && value !== undefined
            ? { key: APPEAL_SETUP_KEY, value: typeof value === 'string' ? value : JSON.stringify(Array.isArray(value) ? value : [value]) }
            : null)),
    },
});

describe('the appeal setting is one dated record, and anything short of a whole one counts as not set', () => {
    it('reads a whole record', () => {
        expect(parseAppealSetup(JSON.stringify(TEST_APPEAL_SETUP))).toEqual(TEST_APPEAL_SETUP);
    });

    it.each([
        ['missing channel', { ...TEST_APPEAL_SETUP, channel: '  ' }],
        ['missing source of the answer', { ...TEST_APPEAL_SETUP, sourceRef: '' }],
        ['time limit not a whole number of days', { ...TEST_APPEAL_SETUP, timeLimitDays: 7.5 }],
        ['time limit zero', { ...TEST_APPEAL_SETUP, timeLimitDays: 0 }],
        ['date not a calendar day', { ...TEST_APPEAL_SETUP, effectiveFrom: '2026-02-30' }],
        ['not JSON', '{nope'],
        ['a list', '[]'],
    ])('%s', (_label, value) => {
        expect(parseAppealSetup(typeof value === 'string' ? value : JSON.stringify(value))).toBeNull();
    });

    it('is in force from its Bangkok date, not before', async () => {
        const db = dbHolding({ ...TEST_APPEAL_SETUP, effectiveFrom: '2026-10-21' });
        expect(await appealSetupInForce({ db, at: new Date('2026-10-20T16:59:59Z') })).toBeNull();
        expect(await appealSetupInForce({ db, at: new Date('2026-10-20T17:00:00Z') })).toMatchObject({ timeLimitDays: 15 });
    });

    it('is dated data: a later entry takes over on its day, the earlier one stays in force until then', async () => {
        const next = { ...TEST_APPEAL_SETUP, effectiveFrom: '2026-11-01', timeLimitDays: 30, sourceRef: 'คำตอบฉบับที่ 2' };
        const db = dbHolding([next, TEST_APPEAL_SETUP]);
        expect(await appealSetupInForce({ db, at: new Date('2026-10-25T03:00:00Z') })).toMatchObject({ timeLimitDays: 15 });
        expect(await appealSetupInForce({ db, at: new Date('2026-11-01T03:00:00Z') })).toMatchObject({ timeLimitDays: 30, sourceRef: 'คำตอบฉบับที่ 2' });
    });

    it('a withdrawal is an entry too: refusing is held again from its day', async () => {
        const db = dbHolding([TEST_APPEAL_SETUP, { effectiveFrom: '2026-11-01', withdrawn: true, sourceRef: 'ถอนตามหนังสือ' }]);
        expect(await appealSetupInForce({ db, at: new Date('2026-10-25T03:00:00Z') })).not.toBeNull();
        expect(await appealSetupInForce({ db, at: new Date('2026-11-01T03:00:00Z') })).toBeNull();
    });

    it('two entries on one date, or any entry that does not parse, makes the whole record not set', () => {
        expect(parseAppealHistory(JSON.stringify([TEST_APPEAL_SETUP, { ...TEST_APPEAL_SETUP, channel: 'อื่น' }]))).toBeNull();
        expect(parseAppealHistory(JSON.stringify([TEST_APPEAL_SETUP, { effectiveFrom: '2026-11-01', withdrawn: true }]))).toBeNull();
        expect(parseAppealHistory(JSON.stringify([]))).toBeNull();
    });

    it('no row, or an unreadable table, is not set', async () => {
        expect(await appealSetupInForce({ db: dbHolding(undefined) })).toBeNull();
        const broken = { systemConfig: { findUnique: jest.fn().mockRejectedValue(new Error('relation does not exist')) } };
        expect(await appealSetupInForce({ db: broken })).toBeNull();
    });
});

describe('refuseCertification waits for the appeal setting', () => {
    const { refuseCertification } = require('../../services/certification-decision-service');
    const { CERTIFICATION_REFUSAL_REASONS } = require('../../shared/certification-decision-reasons');
    const args = {
        applicationRef: 'app-118',
        actor: { id: 'approver-1', role: 'certificate_approver', organizationId: 'org-1' },
        reasonCode: Object.keys(CERTIFICATION_REFUSAL_REASONS)[0],
        consideration: 'หลักฐานในแฟ้มไม่พอยืนยันว่าแปลงเป็นไปตามมาตรฐาน GACP ตามเหตุที่เลือก',
    };

    it.each([
        ['no setting', undefined],
        ['a setting dated in the future', { ...TEST_APPEAL_SETUP, effectiveFrom: '2999-01-01' }],
        ['a setting without a channel', { ...TEST_APPEAL_SETUP, channel: '' }],
    ])('%s: refused with the catalogued code before the file is touched', async (_label, value) => {
        const tx = dbHolding(value);
        const prisma = { $transaction: jest.fn((work) => work(tx)) };
        await expect(refuseCertification({ ...args, prisma })).rejects.toMatchObject({
            code: 'REFUSAL_AWAITS_APPEAL_SETUP',
            statusCode: 409,
            messageTh: ERROR_CODES.REFUSAL_AWAITS_APPEAL_SETUP.messageTh,
        });
        expect(tx.systemConfig.findUnique).toHaveBeenCalledWith({ where: { key: APPEAL_SETUP_KEY } });
    });

    it('the catalogue tells the approver in Thai that the refusal waits for the appeal setup', () => {
        const row = ERROR_CODES.REFUSAL_AWAITS_APPEAL_SETUP;
        expect(row.httpStatus).toBe(409);
        expect(row.messageTh).toMatch(/อุทธรณ์/);
        expect(row.messageTh).toMatch(/[฀-๿]/);
    });
});

describe('the order not to certify states the appeal setting', () => {
    const ORDER = {
        applicationNumber: 'APP-118-1',
        stage: 'AUDIT_NOT_PASSED',
        reason: 'แปลงปลูกไม่เป็นไปตามมาตรฐานที่ยื่นขอ',
        consideration: 'ข้อบกพร่องทั้งสองข้อกระทบความปลอดภัยของผลผลิตโดยตรง และยังไม่มีหลักฐานการแก้ไข',
        facts: { holderName: 'บริษัท ทดสอบ จำกัด', inspectorVerdict: 'FAIL', findings: ['ไม่มีบันทึกการใช้ปุ๋ย'], correctionRounds: 0 },
    };

    it('prints the right, the time limit and the channel from the setting', () => {
        const lines = buildTerminalDecisionLetter({ ...ORDER, appeal: TEST_APPEAL_SETUP }).message.split('\n');
        expect(lines).toContain('ท่านมีสิทธิ์อุทธรณ์คำสั่งนี้ภายใน 15 วันนับแต่วันที่ได้รับแจ้งคำสั่ง');
        expect(lines).toContain(`ช่องทางการอุทธรณ์: ${TEST_APPEAL_SETUP.channel}`);
        expect(lines.join('\n')).not.toContain('จะแจ้งรายละเอียดให้ทราบต่อไป');
    });

    it('the letter keeps which setting it stated', () => {
        expect(buildTerminalDecisionLetter({ ...ORDER, appeal: TEST_APPEAL_SETUP }).metadata.appeal).toEqual(TEST_APPEAL_SETUP);
    });

    it('refuses to build an order that cannot say how to appeal', () => {
        expect(() => buildTerminalDecisionLetter(ORDER)).toThrow(/appeal/);
        expect(() => buildTerminalDecisionLetter({ ...ORDER, appeal: { ...TEST_APPEAL_SETUP, timeLimitDays: 0 } })).toThrow(/appeal/);
    });
});

describe('scripts/set-appeal-setup.js is the setting\'s writer', () => {
    const { planFromArgs, main } = require('../../scripts/set-appeal-setup');
    const full = ['--effective-from', '2026-11-01', '--time-limit-days', '15', '--channel', TEST_APPEAL_SETUP.channel, '--source-ref', 'กม 0701/123'];
    const quiet = { log: () => {}, error: () => {} };
    const stored = (entries) => (entries ? { key: APPEAL_SETUP_KEY, value: JSON.stringify(entries) } : null);
    const fakePrisma = (entries) => {
        const tx = { systemConfig: { findUnique: jest.fn().mockResolvedValue(stored(entries)), upsert: jest.fn() } };
        return { tx, prisma: { ...tx, $transaction: jest.fn((work) => work(tx)) } };
    };

    it('refuses a partial record and dry-runs a whole one', async () => {
        expect(planFromArgs(['--effective-from', '2026-11-01', '--channel', 'x']).action).toBe('refuse');
        expect(planFromArgs(['--withdraw', '--effective-from', '2026-11-01']).action).toBe('refuse');
        const { prisma, tx } = fakePrisma(null);
        const audit = jest.fn();
        expect(await main(full, { prisma, out: quiet, audit })).toBe(0);
        expect(tx.systemConfig.upsert).not.toHaveBeenCalled();
        expect(audit).not.toHaveBeenCalled();
    });

    it('--apply adds a dated entry, keeps the earlier ones, and writes the audit row in the same transaction', async () => {
        const { prisma, tx } = fakePrisma([TEST_APPEAL_SETUP]);
        const audit = jest.fn();
        expect(await main([...full, '--apply'], { prisma, out: quiet, audit })).toBe(0);
        const { where, create, update } = tx.systemConfig.upsert.mock.calls[0][0];
        expect(where).toEqual({ key: APPEAL_SETUP_KEY });
        expect(create.value).toBe(update.value);
        expect(parseAppealHistory(update.value)).toEqual([
            TEST_APPEAL_SETUP,
            { effectiveFrom: '2026-11-01', timeLimitDays: 15, channel: TEST_APPEAL_SETUP.channel, sourceRef: 'กม 0701/123' },
        ]);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'APPEAL_SETUP_SET', resourceId: APPEAL_SETUP_KEY,
            metadata: expect.objectContaining({ entry: expect.objectContaining({ effectiveFrom: '2026-11-01' }) }),
        }), tx);
    });

    it('--withdraw adds a withdrawal entry from its date and audits it', async () => {
        const { prisma, tx } = fakePrisma([TEST_APPEAL_SETUP]);
        const audit = jest.fn();
        expect(await main(['--withdraw', '--effective-from', '2026-11-01', '--source-ref', 'ถอนตามหนังสือ', '--apply'], { prisma, out: quiet, audit })).toBe(0);
        expect(parseAppealHistory(tx.systemConfig.upsert.mock.calls[0][0].update.value)).toEqual([
            TEST_APPEAL_SETUP, { effectiveFrom: '2026-11-01', withdrawn: true, sourceRef: 'ถอนตามหนังสือ' },
        ]);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPEAL_SETUP_WITHDRAWN' }), tx);
    });

    it('refuses a second entry on a date that already has one', async () => {
        const { prisma, tx } = fakePrisma([{ ...TEST_APPEAL_SETUP, effectiveFrom: '2026-11-01' }]);
        expect(await main([...full, '--apply'], { prisma, out: quiet, audit: jest.fn() })).toBe(1);
        expect(tx.systemConfig.upsert).not.toHaveBeenCalled();
    });
});
