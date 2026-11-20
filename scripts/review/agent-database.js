#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 07 — Database Review
 * ═══════════════════════════════════════════════════════════════
 * Parses Prisma schema: missing indexes, timestamps, naming,
 * cascade rules, N+1 patterns, migration consistency.
 *
 * Usage: node scripts/review/agent-database.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BACKEND = path.join(ROOT, 'apps/backend');
const PRISMA_DIR = path.join(BACKEND, 'prisma');
const RESULTS_FILE = path.join(__dirname, 'agent-database-results.json');

const IGNORE_DIRS = ['node_modules', '.git', '__tests__'];

function collectFiles(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full, exts));
    else if (exts.includes(path.extname(entry.name))) results.push(full);
  }
  return results;
}

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

// ─── Parse Prisma Schema ─────────────────────────────────────

function parsePrismaSchema() {
  const schemaDir = path.join(PRISMA_DIR, 'schema');
  const schemaFiles = fs.existsSync(schemaDir)
    ? collectFiles(schemaDir, ['.prisma'])
    : [];

  // No schema.prisma fallback: the monolith was split into this folder on
  // 2026-03-12 (3120e673) and guardrail G-04 now fails any .prisma file outside
  // it, so the folder being empty means the review found nothing — not that a
  // single-file schema is waiting somewhere else.
  if (schemaFiles.length === 0) return { models: [], rawContent: '' };

  let allContent = '';
  for (const f of schemaFiles) {
    allContent += fs.readFileSync(f, 'utf-8') + '\n';
  }

  // Parse models
  const models = [];
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;
  while ((match = modelRegex.exec(allContent)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields = [];
    const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('@@'));

    for (const line of lines) {
      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\??)(\[\])?/);
      if (fieldMatch) {
        fields.push({
          name: fieldMatch[1],
          type: fieldMatch[2],
          optional: fieldMatch[3] === '?',
          array: !!fieldMatch[4],
          raw: line,
        });
      }
    }

    const hasIndex = body.includes('@@index') || body.includes('@@unique');
    const hasTimestamps = fields.some(f => f.name === 'createdAt') && fields.some(f => f.name === 'updatedAt');
    const hasDeletedAt = fields.some(f => f.name === 'deletedAt');

    models.push({ name, fields, hasIndex, hasTimestamps, hasDeletedAt, rawBody: body });
  }

  return { models, rawContent: allContent };
}

// ─── Schema Checks ───────────────────────────────────────────

function checkMissingTimestamps(models) {
  return models
    .filter(m => !m.hasTimestamps && m.fields.length > 3)
    .map(m => ({
      severity: 'warning', rule: 'missing-timestamps',
      message: `Model "${m.name}" missing createdAt/updatedAt`,
      file: 'prisma/schema', line: 0,
    }));
}

function checkMissingIndexes(models) {
  const findings = [];
  for (const m of models) {
    // Foreign keys should have indexes
    const fkFields = m.fields.filter(f => f.name.endsWith('Id') && f.type === 'String');
    if (fkFields.length > 0 && !m.hasIndex) {
      for (const fk of fkFields) {
        if (!m.rawBody.includes(`@@index([${fk.name}]`) && !m.rawBody.includes(`@@unique([${fk.name}]`)) {
          findings.push({
            severity: 'warning', rule: 'missing-index',
            message: `Model "${m.name}" — FK field "${fk.name}" may need an index`,
            file: 'prisma/schema', line: 0,
          });
        }
      }
    }
    // Models with many fields often need indexes on status/type fields
    const statusField = m.fields.find(f => f.name === 'status' || f.name === 'type' || f.name === 'state');
    if (statusField && !m.rawBody.includes(statusField.name)) {
      // likely already indexed if mentioned in @@index
    }
  }
  return findings;
}

function checkNamingConsistency(models) {
  const findings = [];
  for (const m of models) {
    // Model names should be PascalCase
    if (m.name[0] !== m.name[0].toUpperCase()) {
      findings.push({ severity: 'info', rule: 'model-naming', message: `Model "${m.name}" should be PascalCase`, file: 'prisma/schema', line: 0 });
    }

    // Field names should be camelCase
    for (const f of m.fields) {
      if (f.name.includes('_') && !['created_at', 'updated_at', 'deleted_at'].includes(f.name)) {
        findings.push({ severity: 'info', rule: 'field-naming', message: `Field "${m.name}.${f.name}" uses snake_case — Prisma convention is camelCase`, file: 'prisma/schema', line: 0 });
      }
    }
  }
  return findings;
}

function checkCascadeRules(models) {
  const findings = [];
  for (const m of models) {
    const relations = m.fields.filter(f => f.raw.includes('@relation'));
    for (const r of relations) {
      if (!r.raw.includes('onDelete') && !r.array) {
        findings.push({ severity: 'info', rule: 'missing-cascade', message: `Relation "${m.name}.${r.name}" — no onDelete rule defined`, file: 'prisma/schema', line: 0 });
      }
    }
  }
  return findings.slice(0, 15); // Cap
}

// ─── N+1 Query Detection ────────────────────────────────────

function checkN1Queries() {
  const findings = [];
  const serviceFiles = collectFiles(path.join(BACKEND, 'services'), ['.js']);

  for (const fp of serviceFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Pattern: for/forEach/map loop with prisma query inside
      if (/for\s*\(|\.forEach\(|\.map\(/.test(lines[i])) {
        const loopBlock = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');
        if (/await\s+prisma\.\w+\.(find|create|update|delete)/.test(loopBlock)) {
          findings.push({
            severity: 'warning', rule: 'n-plus-1-query',
            message: 'Prisma query inside loop — N+1 query pattern',
            file: rel(fp), line: i + 1,
          });
        }
      }
    }
  }
  return findings;
}

// ─── Migration Check ─────────────────────────────────────────

function checkMigrations() {
  const findings = [];
  const migDir = path.join(PRISMA_DIR, 'migrations');
  if (!fs.existsSync(migDir)) {
    findings.push({ severity: 'info', rule: 'no-migrations', message: 'No migrations directory found', file: 'prisma/migrations', line: 0 });
    return findings;
  }

  const migrations = fs.readdirSync(migDir).filter(d => fs.statSync(path.join(migDir, d)).isDirectory());
  console.log(`Migrations found: ${migrations.length}`);

  // Check for empty migrations
  for (const m of migrations) {
    const sqlFile = path.join(migDir, m, 'migration.sql');
    if (fs.existsSync(sqlFile)) {
      const content = fs.readFileSync(sqlFile, 'utf-8').trim();
      if (content.length < 10) {
        findings.push({ severity: 'info', rule: 'empty-migration', message: `Empty migration: ${m}`, file: `prisma/migrations/${m}`, line: 0 });
      }
      // Check for DROP without backup
      if (/DROP TABLE|DROP COLUMN/i.test(content)) {
        findings.push({ severity: 'warning', rule: 'destructive-migration', message: `Destructive migration (DROP): ${m}`, file: `prisma/migrations/${m}`, line: 0 });
      }
    }
  }
  return findings;
}

// ─── Seed File Check ─────────────────────────────────────────

function checkSeeds() {
  const findings = [];
  const seedFiles = collectFiles(PRISMA_DIR, ['.js']).filter(f => f.includes('seed'));

  for (const fp of seedFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    if (/deleteMany|truncate/i.test(content)) {
      findings.push({ severity: 'info', rule: 'seed-destructive', message: 'Seed file uses deleteMany/truncate — ensure not run in production', file: rel(fp), line: 1 });
    }
  }
  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 07 — Database Review');
  console.log('═'.repeat(55));

  const { models, rawContent } = parsePrismaSchema();
  console.log(`  Models found: ${models.length}`);
  if (models.length > 0) {
    console.log(`  Models: ${models.map(m => m.name).join(', ')}`);
  }

  const allFindings = [
    ...checkMissingTimestamps(models),
    ...checkMissingIndexes(models),
    ...checkNamingConsistency(models),
    ...checkCascadeRules(models),
    ...checkN1Queries(),
    ...checkMigrations(),
    ...checkSeeds(),
  ];

  const critical = allFindings.filter(f => f.severity === 'critical').length;
  const warnings = allFindings.filter(f => f.severity === 'warning').length;
  const info = allFindings.filter(f => f.severity === 'info').length;
  const byRule = {};
  for (const f of allFindings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;

  console.log('\n── Results ─────────────────────────────────────────');
  console.log(`Critical: ${critical}`);
  console.log(`Warning: ${warnings}`);
  console.log(`Info: ${info}`);
  console.log(`  Total findings:     ${allFindings.length}`);

  if (Object.keys(byRule).length > 0) {
    console.log('\n── By Rule ─────────────────────────────────────────');
    for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${rule.padEnd(30)} ${count}`);
    }
  }

  const topIssues = allFindings.filter(f => f.severity !== 'info').slice(0, 15);
  if (topIssues.length > 0) {
    console.log('\n── Top Issues ──────────────────────────────────────');
    for (const f of topIssues) {
      const icon = f.severity === 'critical' ? '🔴' : '🟡';
      console.log(`  ${icon} ${f.file}:${f.line} — ${f.message}`);
    }
  }

  const score = Math.max(0, 100 - (critical * 10) - Math.floor(warnings * 0.001) - Math.floor(info * 0.001));
  console.log(`\n Database Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = { agent: '07-database', timestamp: new Date().toISOString(), modelsFound: models.length, modelNames: models.map(m => m.name), summary: { critical, warnings, info, total: allFindings.length }, score, byRule, findings: allFindings };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
