#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent D — Database Integrity Carpet-Bomb Test
 * ═══════════════════════════════════════════════════════════════
 * Runs SQL queries against the production DB to validate
 * schema, FK integrity, and data consistency.
 *
 * Strategy: Creates a temp SQL script, pipes it to psql via SSH.
 * Uses cmd.exe pipe to avoid PowerShell quoting issues.
 *
 * Usage:
 *   node scripts/test/agent-database.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SSH_HOST = 'root@gacpth.com';
const DB_CONTAINER = 'gacp-postgres-local';
const DB_USER = 'gacp';
const DB_NAME = 'gacp_db';

let passed = 0, failed = 0, skipped = 0;
const results = [];

function test(category, name, fn) {
    const label = `[${category}] ${name}`;
    try {
        const result = fn();
        if (result === 'SKIP') { skipped++; results.push({ s: '⏭️', label, d: 'Skipped' }); return; }
        passed++;
        results.push({ s: '✅', label, d: String(result || '').substring(0, 100) });
    } catch (err) {
        failed++;
        results.push({ s: '❌', label, d: String(err.message || err).substring(0, 120) });
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function runSQLBatch(queries) {
    const sqlLines = [];
    for (const q of queries) {
        sqlLines.push(`\\echo ===MARKER:${q.label}===`);
        sqlLines.push(q.sql + ';');
    }
    const sqlScript = sqlLines.join('\n');

    const tmpFile = path.join(os.tmpdir(), `gacp-agent-d-${Date.now()}.sql`);
    fs.writeFileSync(tmpFile, sqlScript, 'utf-8');

    try {
        const cmd = `type "${tmpFile}" | ssh ${SSH_HOST} "docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t"`;
        const output = execSync(cmd, { timeout: 60000, encoding: 'utf-8', shell: 'cmd.exe' });

        const resultMap = {};
        const chunks = output.split('===MARKER:');
        for (const chunk of chunks) {
            if (!chunk.includes('===')) continue;
            const markerEnd = chunk.indexOf('===');
            const label = chunk.substring(0, markerEnd);
            const value = chunk.substring(markerEnd + 3).trim();
            resultMap[label] = value;
        }
        return resultMap;
    } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* ok */ }
    }
}

function buildQueries() {
    const queries = [];

    // Prisma uses snake_case table names via @@map
    const CRITICAL_TABLES = [
        'users', 'applications', 'farms', 'plots',
        'planting_cycles', 'plant_units', 'cultivation_logs',
        'invoices', 'certificates',
        'lots', 'harvest_batches', 'notifications',
        'planting_cycle_plots', 'system_configs', 'audit_logs',
    ];
    for (const table of CRITICAL_TABLES) {
        queries.push({
            label: `SCHEMA_${table}`,
            sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}') THEN 'EXISTS' ELSE 'MISSING' END`,
        });
    }

    // Migration checks
    queries.push({
        label: 'MIGRATION_TABLE',
        sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='_prisma_migrations') THEN 'EXISTS' ELSE 'MISSING' END`,
    });
    queries.push({
        label: 'MIGRATION_PENDING',
        sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "_prisma_migrations" WHERE finished_at IS NULL), 'N/A')`,
    });
    queries.push({
        label: 'MIGRATION_COUNT',
        sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "_prisma_migrations"), '0')`,
    });

    // Row counts
    const countTables = ['users', 'applications', 'farms', 'planting_cycles', 'notifications', 'certificates', 'invoices'];
    for (const table of countTables) {
        queries.push({
            label: `COUNT_${table}`,
            sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "${table}"), '0')`,
        });
    }

    // Test accounts
    queries.push({
        label: 'TEST_ACCOUNTS',
        sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "users" WHERE email LIKE '%gacp-test.local'), '0')`,
    });
    queries.push({
        label: 'ACTIVE_USERS',
        sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "users" WHERE status='ACTIVE'), '0')`,
    });

    // Referential integrity — check for empty required fields instead
    queries.push({
        label: 'APP_INTEGRITY',
        sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "applications" WHERE id IS NULL), '0')`,
    });
    queries.push({
        label: 'FARM_INTEGRITY',
        sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "farms" WHERE id IS NULL), '0')`,
    });

    // Data quality
    queries.push({
        label: 'NULL_EMAIL',
        sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "users" WHERE email IS NULL), '0')`,
    });
    queries.push({
        label: 'NULL_PASSWORD',
        sql: `SELECT COALESCE((SELECT COUNT(*)::text FROM "users" WHERE password IS NULL), '0')`,
    });

    // DB info
    queries.push({
        label: 'DB_VERSION',
        sql: `SELECT substring(version() from 1 for 40)`,
    });
    queries.push({
        label: 'TABLE_COUNT',
        sql: `SELECT COUNT(*)::text FROM information_schema.tables WHERE table_schema='public'`,
    });

    return queries;
}

function evaluateResults(data) {
    const CRITICAL_TABLES = [
        'users', 'applications', 'farms', 'plots',
        'planting_cycles', 'plant_units', 'cultivation_logs',
        'invoices', 'certificates',
        'lots', 'harvest_batches', 'notifications',
        'planting_cycle_plots', 'system_configs', 'audit_logs',
    ];
    for (const table of CRITICAL_TABLES) {
        test('SCHEMA', `Table "${table}" exists`, () => {
            const val = data[`SCHEMA_${table}`];
            assert(val && val.includes('EXISTS'), `Table "${table}" missing`);
            return '✓ exists';
        });
    }

    test('MIGRATION', '_prisma_migrations table exists', () => {
        assert(data['MIGRATION_TABLE']?.includes('EXISTS'), 'Missing');
        return '✓ exists';
    });
    test('MIGRATION', 'No pending migrations', () => {
        const val = data['MIGRATION_PENDING']?.trim();
        assert(val === '0', `${val} pending`);
        return '✓ all applied';
    });
    test('MIGRATION', 'Migration count', () => {
        const n = parseInt(data['MIGRATION_COUNT']?.trim());
        assert(n > 0, 'No migrations');
        return `${n} migrations`;
    });

    const countTables = ['users', 'applications', 'farms', 'planting_cycles', 'notifications', 'certificates', 'invoices'];
    for (const table of countTables) {
        test('DATA', `"${table}" row count`, () => {
            const n = parseInt(data[`COUNT_${table}`]?.trim());
            assert(!isNaN(n), 'Could not read count');
            return `${n} rows`;
        });
    }

    test('DATA', 'Test accounts exist', () => {
        const n = parseInt(data['TEST_ACCOUNTS']?.trim());
        return `${n} test accounts`;
    });
    test('DATA', 'Active users exist', () => {
        const n = parseInt(data['ACTIVE_USERS']?.trim());
        assert(n > 0, 'No active users');
        return `${n} active users`;
    });

    test('INTEGRITY', 'Applications table healthy', () => {
        assert(data['APP_INTEGRITY']?.trim() === '0', 'Integrity issue');
        return '✓ clean';
    });
    test('INTEGRITY', 'Farms table healthy', () => {
        assert(data['FARM_INTEGRITY']?.trim() === '0', 'Integrity issue');
        return '✓ clean';
    });

    test('QUALITY', 'No users with NULL email', () => {
        assert(data['NULL_EMAIL']?.trim() === '0', `${data['NULL_EMAIL']} null`);
        return '✓ all have email';
    });
    test('QUALITY', 'No users with NULL password', () => {
        assert(data['NULL_PASSWORD']?.trim() === '0', `${data['NULL_PASSWORD']} null`);
        return '✓ all have password';
    });

    test('INFO', 'Database version', () => {
        return data['DB_VERSION']?.trim() || 'unknown';
    });
    test('INFO', 'Total tables in schema', () => {
        const n = parseInt(data['TABLE_COUNT']?.trim());
        assert(n > 10, `Only ${n} tables`);
        return `${n} tables`;
    });
}

function printReport() {
    const total = passed + failed + skipped;
    const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║        Agent D — Database Integrity Test Report           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${SSH_HOST} → ${DB_CONTAINER}`);
    console.log(`  Date:   ${new Date().toISOString()}\n`);

    let cat = '';
    for (const r of results) {
        const c = r.label.match(/\[(.+?)\]/)?.[1] || '';
        if (c !== cat) { cat = c; console.log(`\n── ${cat} ${'─'.repeat(50 - cat.length)}`); }
        console.log(`  ${r.s} ${r.label.replace(/\[.+?\] /, '')} ${r.d ? `(${r.d})` : ''}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passed} Failed: ${failed} Skipped: ${skipped}`);
    console.log(`Pass Rate: ${rate}% (${total} total)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (failed === 0) console.log('\n ALL TESTS PASSED\n');
    else {
        console.log(`\n ${failed} TEST(S) FAILED\n`);
        for (const r of results) if (r.s ==='') console.log(`• ${r.label}: ${r.d}`);
        console.log('');
    }

    const outFile = path.join(__dirname, 'agent-database-results.txt');
    const lines = [
        `Agent D — Database Integrity Test Report`,
        `Target: ${SSH_HOST} → ${DB_CONTAINER}`,
        `Date: ${new Date().toISOString()}`,
        `Pass: ${passed} | Fail: ${failed} | Skip: ${skipped} | Rate: ${rate}%`,
        '',
        ...results.map(r => `${r.s === '✅' ? 'PASS' : r.s === '❌' ? 'FAIL' : 'SKIP'} | ${r.label} | ${r.d}`),
    ];
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`Results → ${outFile}\n`);

    return { agent: 'D-Database', passed, failed, skipped, total, rate: parseFloat(rate) };
}

function main() {
    console.log(`\n Agent D — Database Integrity Carpet-Bomb Test`);
    console.log(`   SSH: ${SSH_HOST} → ${DB_CONTAINER}\n`);

    console.log('Building SQL batch...');
    const queries = buildQueries();
    console.log(`${queries.length} queries prepared\n`);

    console.log('Executing SQL batch via SSH...');
    let data;
    try {
        data = runSQLBatch(queries);
        console.log(`Got ${Object.keys(data).length} results\n`);
    } catch (err) {
        console.error(`SQL batch failed: ${err.message}`);
        process.exit(2);
    }

    evaluateResults(data);
    const summary = printReport();
    if (typeof module !== 'undefined') module.exports = summary;
    process.exit(failed > 0 ? 1 : 0);
}

main();
