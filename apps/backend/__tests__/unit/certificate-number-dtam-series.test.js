// Order 134 task 1: the DTAM series {n}/{ปี พ.ศ.} from three settings, the blocked list, slug 61-2569 (order 136).
'use strict';

const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../shared/logger', () => ({ ...mockLog, createLogger: jest.fn(() => mockLog), stream: { write: jest.fn() } }));
jest.mock('../../middleware/rate-limiter', () => ({
    createRateLimiter: () => (_req, _res, next) => next(),
}));

const DTAM = '61/2569';
const OLD_OURS = 'TH-GACP 3/2569';
const LEGACY = 'GACP-TH-2569-A3F7B2';

function mockCert(certificateNumber) {
    return {
        id: `id-${certificateNumber}`, uuid: 'u1', certificateNumber, status: 'active', isDeleted: false,
        expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000), issuedDate: new Date('2026-01-01'),
        farmName: 'สวนทดสอบ', applicantName: 'สมชาย ใจดี', province: 'เชียงใหม่', cropType: 'กัญชา',
        standardName: 'GACP', documentHash: null, signature: null, scopes: [{ areaType: 'OUTDOOR', status: 'active' }],
    };
}
const { certificateTable } = require('../../test-support/fake-certificate-where');
const mockDoorPrisma = { certificate: certificateTable([DTAM, OLD_OURS, LEGACY].map(mockCert)) };
jest.mock('../../services/prisma-database', () => ({ get prisma() { return mockDoorPrisma; } }));

const express = require('express');
const request = require('supertest');
const {
    toCanonicalCertificateNumber, toCertificateSlug, formatCertificateNumber, parseNumberFormat,
} = require('../../services/certificate-number-display');
const {
    CERT_NUMBER_FORMAT_KEY, CERT_NUMBER_YEAR_START_KEY, CERT_NUMBER_NEW_YEAR_RULE_KEY,
} = require('../../services/certificate-numbering-settings');
const { allocateCertificateNumber } = require('../../services/certificate-number-allocator');

const IN_2569 = new Date('2026-10-22T03:00:00Z');
const NEW_YEAR_2570_BANGKOK = new Date('2026-12-31T17:00:00Z');

function fakeDb({ format = '{n}/{year}', yearStart = { year: 2569, start: 61 }, newYearRule = { rule: 'RESTART', firstNumber: 1 }, blocked = [] } = {}) {
    const config = new Map();
    if (format !== null) { config.set(CERT_NUMBER_FORMAT_KEY, format); }
    if (yearStart) { config.set(CERT_NUMBER_YEAR_START_KEY, JSON.stringify(yearStart)); }
    if (newYearRule) { config.set(CERT_NUMBER_NEW_YEAR_RULE_KEY, JSON.stringify(newYearRule)); }
    const counters = new Map();
    const blockedRows = blocked.map(([year, number]) => ({ year, number }));
    const audits = [];
    const db = {
        config, counters, audits,
        systemConfig: {
            findMany: async ({ where }) => where.key.in.filter((k) => config.has(k)).map((key) => ({ key, value: config.get(key) })),
        },
        receiptSequence: {
            upsert: async ({ where, create, update }) => {
                const k = `${where.prefix_year.prefix}|${where.prefix_year.year}`;
                const now = counters.has(k) ? counters.get(k) + update.counter.increment : create.counter;
                counters.set(k, now);
                return { counter: now };
            },
            update: async ({ where, data }) => {
                counters.set(`${where.prefix_year.prefix}|${where.prefix_year.year}`, data.counter);
                return { counter: data.counter };
            },
        },
        blockedCertificateNumber: {
            findMany: async ({ where }) => blockedRows
                .filter((r) => r.year === where.year && r.number >= where.number.gte)
                .sort((a, b) => a.number - b.number)
                .map(({ number }) => ({ number })),
        },
    };
    return db;
}
const allocate = (db, issuedDate = IN_2569) => allocateCertificateNumber({
    client: db, issuedDate, audit: async (row) => { db.audits.push(row); },
});

describe('the number and its slug', () => {
    test('the DTAM form prints as 61/2569 and travels as 61-2569', () => {
        expect(formatCertificateNumber('{n}/{year}', 61, 2569)).toBe(DTAM);
        expect(toCertificateSlug(DTAM)).toBe('61-2569');
        expect(toCanonicalCertificateNumber('61-2569')).toBe(DTAM);
        expect(toCanonicalCertificateNumber(' 61 / 2569 ')).toBe(DTAM);
        expect(toCanonicalCertificateNumber('061/2569')).toBe(DTAM);
    });
    test('every form issued before keeps resolving to its stored value', () => {
        expect(toCanonicalCertificateNumber('TH-GACP-3-2569')).toBe(OLD_OURS);
        expect(toCanonicalCertificateNumber('th-gacp 3/2569')).toBe(OLD_OURS);
        expect(toCertificateSlug(OLD_OURS)).toBe('TH-GACP-3-2569');
        expect(toCanonicalCertificateNumber('GACP-DTAM-2569-A3F7B2')).toBe(LEGACY);
        expect(toCanonicalCertificateNumber('gacp-th-2569-a3f7b2')).toBe(LEGACY);
        expect(toCertificateSlug(LEGACY)).toBe(LEGACY);
    });
    test('the old prefix and the new form never meet: 3-2569 is not TH-GACP 3/2569', () => {
        expect(toCanonicalCertificateNumber('3-2569')).toBe('3/2569');
    });
    test('the format setting accepts {n}/{year} with an optional prefix, nothing a URL cannot carry', () => {
        expect(parseNumberFormat('{n}/{year}')).toBe('{n}/{year}');
        expect(parseNumberFormat('TH-GACP {n}/{year}')).toBe('TH-GACP {n}/{year}');
        for (const bad of ['{year}/{n}', '{n}-{year}', 'ก {n}/{year}', '{n}/{year} x', '{n}', '', null, 'TH GACP {n}/{year}']) {
            expect(parseNumberFormat(bad)).toBeNull();
        }
    });
    test('the verify URL and the QR carry the slug', () => {
        const { buildCertVerifyUrl } = require('../../services/certificate-verify-url');
        expect(buildCertVerifyUrl(DTAM).endsWith('/verify/61-2569')).toBe(true);
    });
});

describe('one series, any spelling: the fragment a lookup asks the database with', () => {
    const { certificateNumberWhere } = require('../../services/certificate-number-display');
    test.each(['61/2569', 'TH-GACP 61/2569', '61-2569', 'TH-GACP-61-2569', ' th-gacp 061 / 2569 '])(
        '%s asks for the bare number or any prefixed spelling of it', (typed) => {
            expect(certificateNumberWhere(typed)).toEqual({
                OR: [{ certificateNumber: DTAM }, { certificateNumber: { endsWith: ` ${DTAM}` } }],
            });
        },
    );
    test('a legacy number is asked for exactly', () => {
        expect(certificateNumberWhere('gacp-dtam-2569-a3f7b2')).toEqual({ certificateNumber: LEGACY });
    });
    test('text that is no number is asked for as typed, and so finds nothing', () => {
        expect(certificateNumberWhere('ABC')).toEqual({ certificateNumber: 'ABC' });
    });
});

describe('one row per typed number: findCertificateByNumber', () => {
    const { findCertificateByNumber, certificateNumberWhere } = require('../../services/certificate-number-display');
    const clientAnswering = (rows) => {
        const calls = [];
        return { calls, certificate: { findMany: async (args) => { calls.push(args); return rows; } } };
    };

    test('asks for at most two rows with the fragment, the caller\'s filter and its selection, and answers the one row', async () => {
        const client = clientAnswering([mockCert(DTAM)]);
        const row = await findCertificateByNumber(client, 'TH-GACP 61/2569', { where: { isDeleted: false }, select: { id: true } });
        expect(row).toEqual(expect.objectContaining({ certificateNumber: DTAM }));
        expect(client.calls).toEqual([{
            where: { AND: [certificateNumberWhere('TH-GACP 61/2569'), { isDeleted: false }] },
            take: 2,
            select: { id: true },
        }]);
    });
    test('no row is null', async () => {
        expect(await findCertificateByNumber(clientAnswering([]), DTAM)).toBeNull();
    });
    test('two rows with one (number, year) are refused as null and logged, never the first one', async () => {
        mockLog.warn.mockClear();
        const client = clientAnswering([mockCert(DTAM), mockCert('TH-GACP 61/2569')]);
        expect(await findCertificateByNumber(client, DTAM)).toBeNull();
        expect(mockLog.warn).toHaveBeenCalledTimes(1);
        expect(mockLog.warn.mock.calls[0][0]).toContain(DTAM);
    });
    test('an empty or non-string number asks nothing and is null', async () => {
        const client = clientAnswering([mockCert(DTAM)]);
        expect(await findCertificateByNumber(client, '')).toBeNull();
        expect(await findCertificateByNumber(client, ['61/2569'])).toBeNull();
        expect(client.calls).toEqual([]);
    });
});

describe('allocation from the three settings', () => {
    beforeEach(() => { mockLog.warn.mockClear(); });

    test('the first certificate after the start is set to 61 for 2569 is 61/2569, then 62/2569', async () => {
        const db = fakeDb();
        expect(await allocate(db)).toBe('61/2569');
        expect(await allocate(db)).toBe('62/2569');
    });
    test('numbering already past the start continues from where it is', async () => {
        const db = fakeDb();
        db.counters.set('TH-GACP|2569', 70);
        expect(await allocate(db)).toBe('71/2569');
    });
    test('no start set for the year: numbering continues from what the database holds (order 135)', async () => {
        const db = fakeDb({ yearStart: null });
        db.counters.set('TH-GACP|2569', 4);
        expect(await allocate(db)).toBe('5/2569');
    });
    test('a blocked number is skipped, the skip is logged and audited', async () => {
        const db = fakeDb({ blocked: [[2569, 61], [2569, 62], [2569, 64]] });
        expect(await allocate(db)).toBe('63/2569');
        expect(await allocate(db)).toBe('65/2569');
        expect(db.audits.map((a) => a.metadata.skipped)).toEqual([[61, 62], [64]]);
        expect(db.audits[0]).toMatchObject({ action: 'CERTIFICATE_NUMBER_SKIPPED_BLOCKED', metadata: { year: 2569, issued: 63 } });
        expect(mockLog.warn).toHaveBeenCalledTimes(2);
    });
    test('a blocked number in another year does not skip', async () => {
        const db = fakeDb({ blocked: [[2568, 61]] });
        expect(await allocate(db)).toBe('61/2569');
        expect(db.audits).toEqual([]);
    });
    test('the first issuance of 2570 in Bangkok is 1/2570; the 2569 start does not carry over', async () => {
        const db = fakeDb();
        expect(await allocate(db)).toBe('61/2569');
        expect(await allocate(db, NEW_YEAR_2570_BANGKOK)).toBe('1/2570');
    });
    test('changing a setting changes the next number, with no code change', async () => {
        const db = fakeDb();
        expect(await allocate(db)).toBe('61/2569');
        db.config.set(CERT_NUMBER_YEAR_START_KEY, JSON.stringify({ year: 2569, start: 100 }));
        expect(await allocate(db)).toBe('100/2569');
        db.config.set(CERT_NUMBER_FORMAT_KEY, 'TH-GACP {n}/{year}');
        expect(await allocate(db)).toBe('TH-GACP 101/2569');
        db.config.set(CERT_NUMBER_NEW_YEAR_RULE_KEY, JSON.stringify({ rule: 'RESTART', firstNumber: 5 }));
        expect(await allocate(db, NEW_YEAR_2570_BANGKOK)).toBe('TH-GACP 5/2570');
    });
    test('lowering the start below a number already issued never reissues it', async () => {
        const db = fakeDb();
        await allocate(db);
        db.config.set(CERT_NUMBER_YEAR_START_KEY, JSON.stringify({ year: 2569, start: 1 }));
        expect(await allocate(db)).toBe('62/2569');
    });
    test.each([
        ['format missing', { format: null }],
        ['format unreadable', { format: '{year}-{n}' }],
        ['new-year rule missing', { newYearRule: null }],
        ['new-year rule unknown', { newYearRule: { rule: 'CONTINUE', firstNumber: 1 } }],
        ['start unreadable', { yearStart: { year: 2569, start: 0 } }],
    ])('%s: issuance refuses and draws no number', async (_label, settings) => {
        const db = fakeDb(settings);
        await expect(allocate(db)).rejects.toMatchObject({ code: 'CERTIFICATE_NUMBERING_SETTING_INVALID' });
        expect(db.counters.size).toBe(0);
    });
});

describe('the public verify door finds every form', () => {
    const publicRouter = require('../../routes/api/auth/public');
    const app = express();
    app.use('/api/v1/public', publicRouter);

    test.each([
        ['61-2569', DTAM], [encodeURIComponent('61/2569'), DTAM],
        ['TH-GACP-3-2569', OLD_OURS], [encodeURIComponent(OLD_OURS), OLD_OURS],
        ['GACP-DTAM-2569-A3F7B2', LEGACY], ['gacp-th-2569-a3f7b2', LEGACY],
    ])('%s', async (param, stored) => {
        const res = await request(app).get(`/api/v1/public/verify/${param}`);
        expect(res.body.verified).toBe(true);
        expect(res.body.data.certificateNumber).toBe(stored);
    });
    test('a number in the new form that was never issued is not found', async () => {
        const res = await request(app).get('/api/v1/public/verify/62-2569');
        expect(res.body.verified).toBe(false);
    });
});
