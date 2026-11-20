/**
 * ต้นแบบที่ 5 — the herb database a deploy actually gets.
 * Runs the deploy command `node prisma/seed-herbs.js --apply` twice against a throwaway database,
 * then reads it back through the same service the public /api/herbs doors use.
 * Every seeded entry must name a document someone can open, a re-run must not duplicate,
 * and the retired uncited starter rows must go while staff-entered rows stay.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d, getTestDatabase } = require('../../test-support/test-database');

const BACKEND = path.join(__dirname, '../..');
const SCRIPT = path.join(BACKEND, 'prisma/seed-herbs.js');
const { SPECIES, citedRows } = require('../../prisma/seed-herbs');

const ownDbName = `herb_cited_${process.pid}_${Date.now().toString(36)}`;
const urlFor = (dbName) => { const u = new URL(getTestDatabase().url); u.pathname = `/${dbName}`; return u.toString(); };
const CITATION = /^.+ · https:\/\/\S+ · เข้าถึง \d{4}-\d{2}-\d{2}$/;

const runSeed = (args) => spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, DATABASE_URL: urlFor(ownDbName), NODE_ENV: 'test' }, encoding: 'utf8',
});

d('seed-herbs --apply against a real database', () => {
    let admin;
    let prisma;
    let service;
    const firstRun = {};

    beforeAll(async () => {
        admin = new PrismaClient({ datasources: { db: { url: getTestDatabase().url } } });
        await admin.$executeRawUnsafe(`CREATE DATABASE "${ownDbName}"`);
        const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema'], {
            cwd: BACKEND, env: { ...process.env, DATABASE_URL: urlFor(ownDbName) }, encoding: 'utf8',
        });
        if (migrate.status !== 0) { throw new Error(`migrate deploy failed: ${String(migrate.stderr).slice(-400)}`); }
        prisma = new PrismaClient({ datasources: { db: { url: urlFor(ownDbName) } } });

        await prisma.herbSpecies.create({ data: { code: 'GINGER', nameTH: 'ขิง', sortOrder: 3 } });
        await prisma.herbKnowledgeEntry.createMany({
            data: [
                { herbCode: 'GINGER', category: 'GENERAL', title: 'รายการตั้งต้นเดิม', content: 'ไม่มีแหล่ง', source: 'SEED_STARTER' },
                { herbCode: 'GINGER', category: 'GENERAL', title: 'บันทึกของเจ้าหน้าที่', content: 'เพิ่มเองทางหน้าจอ', source: null },
                { herbCode: 'GINGER', category: 'GENERAL', title: 'ร่างเดิม', content: 'ร่าง', source: 'AI_DRAFT: ต้องตรวจสอบ' },
            ],
        });

        const dry = runSeed([]);
        firstRun.dryCount = await prisma.herbKnowledgeEntry.count();
        firstRun.dryStatus = dry.status;
        const first = runSeed(['--apply']);
        if (first.status !== 0) { throw new Error(`seed failed: ${first.stderr}`); }
        firstRun.count = await prisma.herbKnowledgeEntry.count();
        const second = runSeed(['--apply']);
        if (second.status !== 0) { throw new Error(`second seed failed: ${second.stderr}`); }

        process.env.DATABASE_URL = urlFor(ownDbName);
        jest.isolateModules(() => { service = require('../../services/herb-knowledge-service'); });
    }, 240000);

    afterAll(async () => {
        if (prisma) { await prisma.$disconnect(); }
        if (admin) {
            await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${ownDbName}" WITH (FORCE)`).catch(() => {});
            await admin.$disconnect();
        }
    });

    test('a dry run writes nothing', () => {
        expect(firstRun.dryStatus).toBe(0);
        expect(firstRun.dryCount).toBe(3);
    });

    test('all six herbs exist, each with every cited entry the data file holds', async () => {
        const species = await prisma.herbSpecies.findMany({ orderBy: { sortOrder: 'asc' } });
        expect(species.map((s) => s.code)).toEqual(SPECIES.map((s) => s.code));
        for (const s of SPECIES) {
            const expected = citedRows(s.code).length;
            expect(expected).toBeGreaterThanOrEqual(10);
            expect(await prisma.herbKnowledgeEntry.count({ where: { herbCode: s.code, source: { contains: '://' } } })).toBe(expected);
        }
    });

    test('every seeded entry names a document, a link and the date it was read', async () => {
        const rows = await prisma.herbKnowledgeEntry.findMany({ where: { source: { contains: '://' } } });
        expect(rows.length).toBe(SPECIES.reduce((n, s) => n + citedRows(s.code).length, 0));
        for (const row of rows) { expect(row.source).toMatch(CITATION); }
    });

    test('a second run converges: the same rows, no duplicates', async () => {
        expect(await prisma.herbKnowledgeEntry.count()).toBe(firstRun.count);
    });

    test('the uncited starter row is gone; staff-entered and draft rows are kept', async () => {
        const ginger = await prisma.herbKnowledgeEntry.findMany({ where: { herbCode: 'GINGER', OR: [{ source: null }, { NOT: { source: { contains: '://' } } }] } });
        expect(ginger.map((r) => r.title).sort()).toEqual(['บันทึกของเจ้าหน้าที่', 'ร่างเดิม']);
    });

    test('the read API counts cited entries apart from drafts, and can list only cited ones', async () => {
        const species = await service.listSpecies();
        const ginger = species.find((s) => s.code === 'GINGER');
        expect(ginger.citedCount).toBe(citedRows('GINGER').length);
        expect(ginger.entryCount).toBe(citedRows('GINGER').length + 2);

        const coverage = await service.getCoverageStats();
        expect(coverage.totalCited).toBe(SPECIES.reduce((n, s) => n + citedRows(s.code).length, 0));
        expect(coverage.herbs.find((h) => h.code === 'GINGER')).toMatchObject({ cited: citedRows('GINGER').length });

        const onlyCited = await service.listEntries('GINGER', { citedOnly: true, pageSize: 200 });
        expect(onlyCited.total).toBe(citedRows('GINGER').length);
        expect(onlyCited.entries.every((e) => CITATION.test(e.source))).toBe(true);
        const all = await service.listEntries('ginger', { pageSize: 200 });
        expect(all.total).toBe(citedRows('GINGER').length + 2);
    });
});
