'use strict';

/**
 * F21: the legacy `quotes` table and invoices."quoteId" are dropped by
 * 20261008090000_drop_legacy_quotes, and that migration refuses to drop rows that exist,
 * including a quote the old image writes while the migration runs.
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { raceBehind } = require('./fixtures/row-lock-race');

const MIGRATION = fs.readFileSync(path.resolve(
    __dirname, '../../prisma/migrations/20261008090000_drop_legacy_quotes/migration.sql',
), 'utf8');
const STATEMENTS = MIGRATION.split(/;\s*\n(?=ALTER|DROP|DO|LOCK)/);

d('legacy quotes are gone from the schema (real Postgres)', () => {
    let raw;
    beforeAll(async () => { raw = new PrismaClient(); await raw.$connect(); });
    afterAll(async () => { await raw?.$disconnect(); });

    test('the migrated database has no quotes table and no invoices.quoteId', async () => {
        const [row] = await raw.$queryRaw`SELECT to_regclass('public.quotes')::text AS t`;
        expect(row.t).toBeNull();
        const cols = await raw.$queryRaw`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'quoteId'`;
        expect(cols).toHaveLength(0);
    });

    async function runMigrationOn(seed) {
        const schema = `a3_quotes_${Date.now()}`;
        try {
            await raw.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
                await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${schema}`);
                await tx.$executeRawUnsafe('CREATE TABLE "quotes" ("id" TEXT PRIMARY KEY)');
                await tx.$executeRawUnsafe('CREATE TABLE "invoices" ("id" TEXT PRIMARY KEY, "quoteId" TEXT REFERENCES "quotes"("id"))');
                await seed(tx);
                for (const stmt of STATEMENTS) {
                    await tx.$executeRawUnsafe(stmt);
                }
                const [left] = await tx.$queryRawUnsafe(`SELECT to_regclass('${schema}.quotes')::text AS t`);
                throw Object.assign(new Error('ROLLBACK'), { dropped: left.t === null });
            });
        } catch (err) {
            return err;
        }
        return null;
    }

    test('negative control: a quote row stops the migration and nothing is dropped', async () => {
        const err = await runMigrationOn((tx) => tx.$executeRawUnsafe(`INSERT INTO "quotes" VALUES ('q-1')`));
        expect(String(err.message)).toMatch(/refusing to drop/);
    });

    test('negative control: an invoice still pointing at a quote stops the migration', async () => {
        const err = await runMigrationOn(async (tx) => {
            await tx.$executeRawUnsafe(`INSERT INTO "quotes" VALUES ('q-1')`);
            await tx.$executeRawUnsafe(`INSERT INTO "invoices" VALUES ('i-1', 'q-1')`);
        });
        expect(String(err.message)).toMatch(/refusing to drop/);
    });

    test('an empty table is dropped', async () => {
        const err = await runMigrationOn(async () => {});
        expect(err.message).toBe('ROLLBACK');
        expect(err.dropped).toBe(true);
    });

    test('a quote the old image commits while the migration runs stops the migration, and the quote stays', async () => {
        const schema = `a3_race_${Date.now()}`;
        await raw.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
        try {
            await raw.$executeRawUnsafe(`CREATE TABLE ${schema}."quotes" ("id" TEXT PRIMARY KEY)`);
            await raw.$executeRawUnsafe(`CREATE TABLE ${schema}."invoices" ("id" TEXT PRIMARY KEY, "quoteId" TEXT REFERENCES ${schema}."quotes"("id"))`);
            const migrate = () => raw.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${schema}`);
                for (const stmt of STATEMENTS) {
                    await tx.$executeRawUnsafe(stmt);
                }
            }).then(() => 'applied', (err) => err.message);

            const [outcome] = await raceBehind(
                raw,
                (tx) => tx.$executeRawUnsafe(`INSERT INTO ${schema}."quotes" VALUES ('q-late')`),
                [migrate],
            );

            const [left] = await raw.$queryRawUnsafe(`SELECT to_regclass('${schema}.quotes')::text AS t`);
            expect({ outcome, quotesTable: left.t }).toEqual({
                outcome: expect.stringMatching(/refusing to drop/), quotesTable: `${schema}.quotes`,
            });
        } finally {
            await raw.$executeRawUnsafe(`DROP SCHEMA ${schema} CASCADE`);
        }
    });
});
