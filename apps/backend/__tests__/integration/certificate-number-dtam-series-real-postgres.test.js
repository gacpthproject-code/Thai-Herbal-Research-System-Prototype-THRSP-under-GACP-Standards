'use strict';

// The 2569 and 2570 cases run in a rolled-back transaction so the shared counter and settings are left as found.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const ROLLBACK = Symbol('rollback');
const CONCURRENT_YEAR = 2577;
const IN_2569 = new Date('2026-10-22T03:00:00Z');
const FIRST_MINUTE_OF_2570_BANGKOK = new Date('2026-12-31T17:00:00Z');
const SCRIPT_YEAR = 2578;
const SCRIPT_AT = new Date(`${SCRIPT_YEAR - 543}-03-01T05:00:00Z`);

d('certificate numbering in the DTAM series on real Postgres', () => {
    let prisma;
    let settings;
    let allocateCertificateNumber;
    let bucket;

    beforeAll(() => {
        const { PrismaClient } = require('@prisma/client');
        const url = new URL(process.env.DATABASE_URL);
        url.searchParams.set('connection_limit', '5');
        url.searchParams.set('pool_timeout', '30');
        prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
        settings = require('../../services/certificate-numbering-settings');
        ({ allocateCertificateNumber } = require('../../services/certificate-number-allocator'));
        bucket = settings.CERTIFICATE_SEQUENCE_BUCKET;
    });

    afterAll(async () => {
        try {
            await prisma.receiptSequence.deleteMany({ where: { prefix: bucket, year: CONCURRENT_YEAR } });
            await prisma.blockedCertificateNumber.deleteMany({ where: { year: CONCURRENT_YEAR } });
        } finally {
            await prisma.$disconnect();
        }
    });

    const setStart = (db, year, start) => db.systemConfig.upsert({
        where: { key: settings.CERT_NUMBER_YEAR_START_KEY },
        update: { value: JSON.stringify({ year, start }), type: 'JSON' },
        create: { key: settings.CERT_NUMBER_YEAR_START_KEY, value: JSON.stringify({ year, start }), type: 'JSON' },
    });

    async function inRolledBackTransaction(work) {
        let outcome;
        await prisma.$transaction(async (tx) => {
            await tx.receiptSequence.deleteMany({ where: { prefix: bucket, year: { in: [2569, 2570] } } });
            outcome = await work(tx);
            throw ROLLBACK;
        }, { timeout: 30000 }).catch((error) => { if (error !== ROLLBACK) { throw error; } });
        return outcome;
    }

    test('the migration seeded the format and the new-year rule, and no start number', async () => {
        const rows = await prisma.systemConfig.findMany({ where: { key: { in: settings.CERTIFICATE_NUMBERING_KEYS } } });
        const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        expect(byKey[settings.CERT_NUMBER_FORMAT_KEY]).toBe('{n}/{year}');
        expect(JSON.parse(byKey[settings.CERT_NUMBER_NEW_YEAR_RULE_KEY])).toEqual({ rule: 'RESTART', firstNumber: 1 });
    });

    test('start 61 for 2569: the first certificate is 61/2569; changing the start changes the next one', async () => {
        const got = await inRolledBackTransaction(async (tx) => {
            await setStart(tx, 2569, 61);
            const first = await allocateCertificateNumber({ client: tx, issuedDate: IN_2569 });
            const second = await allocateCertificateNumber({ client: tx, issuedDate: IN_2569 });
            await setStart(tx, 2569, 90);
            const afterChange = await allocateCertificateNumber({ client: tx, issuedDate: IN_2569 });
            return [first, second, afterChange];
        });
        expect(got).toEqual(['61/2569', '62/2569', '90/2569']);
    });

    test('a blocked number is skipped and the skip is written to the audit log in the same transaction', async () => {
        const got = await inRolledBackTransaction(async (tx) => {
            await setStart(tx, 2569, 61);
            await tx.blockedCertificateNumber.createMany({
                data: [61, 62].map((number) => ({ year: 2569, number, source: 'ทดสอบ-เลขสังเคราะห์' })),
            });
            const number = await allocateCertificateNumber({ client: tx, issuedDate: IN_2569 });
            const audit = await tx.auditLog.findFirst({
                where: { action: 'CERTIFICATE_NUMBER_SKIPPED_BLOCKED' },
                orderBy: { sequenceNumber: 'desc' },
                select: { metadata: true },
            });
            return { number, audit };
        });
        expect(got.number).toBe('63/2569');
        const metadata = typeof got.audit.metadata === 'string' ? JSON.parse(got.audit.metadata) : got.audit.metadata;
        expect(metadata).toMatchObject({ year: 2569, skipped: [61, 62], issued: 63 });
    });

    test('the first issuance of BE 2570 (Bangkok midnight) is 1/2570', async () => {
        const got = await inRolledBackTransaction(async (tx) => {
            await setStart(tx, 2569, 61);
            await allocateCertificateNumber({ client: tx, issuedDate: IN_2569 });
            return allocateCertificateNumber({ client: tx, issuedDate: FIRST_MINUTE_OF_2570_BANGKOK });
        });
        expect(got).toBe('1/2570');
    });

    test('a failed issuance takes its number back with it', async () => {
        const got = await inRolledBackTransaction(async (tx) => {
            await setStart(tx, 2569, 61);
            await tx.$executeRaw`SAVEPOINT issuance`;
            const lost = await allocateCertificateNumber({ client: tx, issuedDate: IN_2569 });
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT issuance`;
            const next = await allocateCertificateNumber({ client: tx, issuedDate: IN_2569 });
            return [lost, next];
        });
        expect(got).toEqual(['61/2569', '61/2569']);
    });

    test('20 concurrent issuances draw 20 distinct numbers from the start, around a blocked one', async () => {
        await prisma.receiptSequence.deleteMany({ where: { prefix: bucket, year: CONCURRENT_YEAR } });
        await prisma.blockedCertificateNumber.deleteMany({ where: { year: CONCURRENT_YEAR } });
        await prisma.blockedCertificateNumber.create({ data: { year: CONCURRENT_YEAR, number: 65, source: 'ทดสอบ-เลขสังเคราะห์' } });
        const before = await prisma.systemConfig.findUnique({ where: { key: settings.CERT_NUMBER_YEAR_START_KEY } });
        await setStart(prisma, CONCURRENT_YEAR, 61);
        const issuedDate = new Date(`${CONCURRENT_YEAR - 543}-06-01T05:00:00Z`);
        try {
            const got = await Promise.all(
                Array.from({ length: 20 }, () => allocateCertificateNumber({ client: prisma, issuedDate })),
            );
            const numbers = got.map((n) => Number(n.match(new RegExp(`^(\\d+)/${CONCURRENT_YEAR}$`))[1])).sort((a, b) => a - b);
            expect(new Set(numbers).size).toBe(20);
            expect(numbers).not.toContain(65);
            expect(numbers[0]).toBe(61);
            expect(numbers[19]).toBe(81);
        } finally {
            if (before) {
                await prisma.systemConfig.update({ where: { key: before.key }, data: { value: before.value } });
            } else {
                await prisma.systemConfig.delete({ where: { key: settings.CERT_NUMBER_YEAR_START_KEY } });
            }
        }
    });
});

d('certificate numbering scripts on real Postgres', () => {
    let prisma;
    let settings;
    let seed;
    let setNumbering;
    let before;
    let dir;
    const lines = [];
    const out = { log: (l) => lines.push(l), error: (l) => lines.push(l) };

    beforeAll(async () => {
        const { PrismaClient } = require('@prisma/client');
        prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
        settings = require('../../services/certificate-numbering-settings');
        seed = require('../../scripts/seed-blocked-certificate-numbers');
        setNumbering = require('../../scripts/set-certificate-numbering');
        before = await prisma.systemConfig.findMany({ where: { key: { in: settings.CERTIFICATE_NUMBERING_KEYS } } });
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'certno-register-'));
    });

    afterAll(async () => {
        try {
            await prisma.blockedCertificateNumber.deleteMany({ where: { year: SCRIPT_YEAR } });
            await prisma.receiptSequence.deleteMany({ where: { prefix: settings.CERTIFICATE_SEQUENCE_BUCKET, year: SCRIPT_YEAR } });
            const kept = new Set(before.map((row) => row.key));
            await prisma.systemConfig.deleteMany({ where: { key: { in: settings.CERTIFICATE_NUMBERING_KEYS.filter((k) => !kept.has(k)) } } });
            for (const row of before) {
                await prisma.systemConfig.update({ where: { key: row.key }, data: { value: row.value } });
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
            await prisma.$disconnect();
        }
    });

    beforeEach(() => { lines.length = 0; });

    const listFile = (name, text) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, text);
        return file;
    };

    test('a list inside the repository is refused, so the register is never written into it', async () => {
        const inside = path.join(__dirname, 'register-should-not-be-here.txt');
        expect(await seed.main([inside, '--source', 'ทดสอบ', '--apply'], { prisma, out })).toBe(1);
        expect(lines.join('\n')).toMatch(/outside the repository/);
    });

    test('a list with an unreadable line writes nothing and names the line', async () => {
        const file = listFile('bad.txt', `1/${SCRIPT_YEAR}\nสิบ/${SCRIPT_YEAR}\n`);
        expect(await seed.main([file, '--source', 'ทดสอบ', '--apply'], { prisma, out })).toBe(1);
        expect(lines.join('\n')).toMatch(/line 2/);
        expect(await prisma.blockedCertificateNumber.count({ where: { year: SCRIPT_YEAR } })).toBe(0);
    });

    test('dry run writes nothing; --apply loads every number once, and a rerun adds none', async () => {
        const file = listFile('register.txt', `# synthetic\n1/${SCRIPT_YEAR}\n2/${SCRIPT_YEAR}\nTH-GACP 2/${SCRIPT_YEAR}\n\n4 / ${SCRIPT_YEAR}\n`);
        expect(await seed.main([file, '--source', 'ทดสอบ-เลขสังเคราะห์'], { prisma, out })).toBe(0);
        expect(await prisma.blockedCertificateNumber.count({ where: { year: SCRIPT_YEAR } })).toBe(0);

        expect(await seed.main([file, '--source', 'ทดสอบ-เลขสังเคราะห์', '--apply'], { prisma, out })).toBe(0);
        const rows = await prisma.blockedCertificateNumber.findMany({ where: { year: SCRIPT_YEAR }, orderBy: { number: 'asc' } });
        expect(rows.map((r) => r.number)).toEqual([1, 2, 4]);
        expect(rows[0].source).toBe('ทดสอบ-เลขสังเคราะห์');

        expect(await seed.main([file, '--source', 'ทดสอบ-เลขสังเคราะห์', '--apply'], { prisma, out })).toBe(0);
        expect(await prisma.blockedCertificateNumber.count({ where: { year: SCRIPT_YEAR } })).toBe(3);
    });

    test('setting the start shows the next number before issuance, stepping over blocked ones', async () => {
        const startBefore = await prisma.systemConfig.findUnique({ where: { key: settings.CERT_NUMBER_YEAR_START_KEY } });
        expect(await setNumbering.main(['--year', String(SCRIPT_YEAR), '--start', '1'], { prisma, out, at: SCRIPT_AT })).toBe(0);
        expect(lines.join('\n')).toContain('dry run');
        expect(await prisma.systemConfig.findUnique({ where: { key: settings.CERT_NUMBER_YEAR_START_KEY } })).toEqual(startBefore);

        lines.length = 0;
        expect(await setNumbering.main(['--year', String(SCRIPT_YEAR), '--start', '1', '--apply'], { prisma, out, at: SCRIPT_AT })).toBe(0);
        const stored = await prisma.systemConfig.findUnique({ where: { key: settings.CERT_NUMBER_YEAR_START_KEY } });
        expect(JSON.parse(stored.value)).toEqual({ year: SCRIPT_YEAR, start: 1 });
        expect(lines.join('\n')).toContain(`next number: 3/${SCRIPT_YEAR}`);

        lines.length = 0;
        expect(await setNumbering.main(['--show'], { prisma, out, at: SCRIPT_AT })).toBe(0);
        expect(lines.join('\n')).toContain(`next number: 3/${SCRIPT_YEAR}`);

        const { allocateCertificateNumber } = require('../../services/certificate-number-allocator');
        expect(await allocateCertificateNumber({ client: prisma, issuedDate: SCRIPT_AT })).toBe(`3/${SCRIPT_YEAR}`);
        lines.length = 0;
        await setNumbering.main(['--show'], { prisma, out, at: SCRIPT_AT });
        expect(lines.join('\n')).toContain(`next number: 5/${SCRIPT_YEAR}`);
    });

    test('the format and the new-year rule are written the same way, audited, and a bad value is refused', async () => {
        expect(await setNumbering.main(['--format', '{year}/{n}', '--apply'], { prisma, out, at: SCRIPT_AT })).toBe(1);
        expect(await setNumbering.main(['--new-year-first', '0', '--apply'], { prisma, out, at: SCRIPT_AT })).toBe(1);
        lines.length = 0;
        expect(await setNumbering.main(['--format', 'TH-GACP {n}/{year}'], { prisma, out, at: SCRIPT_AT })).toBe(0);
        expect(lines.join('\n')).toContain(`next number: TH-GACP 5/${SCRIPT_YEAR}`);
        const auditsBefore = await prisma.auditLog.count({ where: { action: 'CERTIFICATE_NUMBERING_SET' } });
        expect(await setNumbering.main(['--format', '{n}/{year}', '--apply'], { prisma, out, at: SCRIPT_AT })).toBe(0);
        expect(await setNumbering.main(['--new-year-first', '1', '--apply'], { prisma, out, at: SCRIPT_AT })).toBe(0);
        expect(await prisma.auditLog.count({ where: { action: 'CERTIFICATE_NUMBERING_SET' } })).toBe(auditsBefore + 2);
    });
});
