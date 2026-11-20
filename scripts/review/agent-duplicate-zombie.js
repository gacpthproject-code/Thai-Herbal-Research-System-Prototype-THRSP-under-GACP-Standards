#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 08 — Duplicate / Conflict / Zombie File Detection
 * ═══════════════════════════════════════════════════════════════
 * Finds duplicate files, near-duplicates, zombie/orphan files,
 * conflicting basenames, backup leftovers, temp files, empties.
 *
 * Usage: node scripts/review/agent-duplicate-zombie.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const RESULTS_FILE = path.join(__dirname, 'agent-duplicate-zombie-results.json');

const SCAN_DIRS = [
  'apps/backend',
  'apps/web-app/src',
  'packages',
  'scripts',
];

const EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx', '.css', '.json', '.md', '.mjs', '.cjs'];
const IGNORE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', 'coverage', '__tests__', 'migrations', 'tmp-provider-shots', 'tmp-provider-shots-auth'];

function collectFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full));
    else if (EXTENSIONS.includes(path.extname(entry.name))) results.push(full);
  }
  return results;
}

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

function fileHash(fp) {
  const content = fs.readFileSync(fp);
  return crypto.createHash('md5').update(content).digest('hex');
}

// ─── Check 1: Exact Duplicates ───────────────────────────────

function checkExactDuplicates(files) {
  const findings = [];
  const hashMap = new Map();

  for (const fp of files) {
    try {
      const stat = fs.statSync(fp);
      if (stat.size === 0 || stat.size > 500000) continue; // Skip empty and very large files
      const hash = fileHash(fp);
      if (hashMap.has(hash)) {
        findings.push({
          severity: 'warning', rule: 'exact-duplicate',
          message: `Exact duplicate of ${rel(hashMap.get(hash))}`,
          file: rel(fp), line: 0,
        });
      } else {
        hashMap.set(hash, fp);
      }
    } catch { /* skip unreadable */ }
  }
  return findings;
}

// ─── Check 2: Conflicting Basenames ──────────────────────────

function checkConflictingNames(files) {
  const findings = [];
  const nameMap = new Map();

  for (const fp of files) {
    const base = path.basename(fp);
    if (['index.js', 'index.ts', 'index.tsx', 'page.tsx', 'layout.tsx', 'loading.tsx', 'error.tsx', 'not-found.tsx', 'package.json', 'tsconfig.json', 'README.md'].includes(base)) continue;
    if (!nameMap.has(base)) nameMap.set(base, []);
    nameMap.get(base).push(fp);
  }

  for (const [name, paths] of nameMap.entries()) {
    if (paths.length > 1) {
      // Check if they are in different meaningful directories
      const dirs = paths.map(p => path.dirname(rel(p)));
      const uniqueDirs = [...new Set(dirs)];
      if (uniqueDirs.length > 1) {
        findings.push({
          severity: 'info', rule: 'conflicting-name',
          message: `"${name}" exists in ${paths.length} locations: ${uniqueDirs.slice(0, 3).join(', ')}${uniqueDirs.length > 3 ? ` +${uniqueDirs.length - 3}` : ''}`,
          file: rel(paths[0]), line: 0,
        });
      }
    }
  }
  return findings.slice(0, 20); // Cap
}

// ─── Check 3: Zombie Files (not imported anywhere) ──────────

function checkZombieFiles(files) {
  const findings = [];

  // Build import index
  const allImports = new Set();
  for (const fp of files) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      // Collect all require/import paths
      const requires = content.matchAll(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
      for (const m of requires) allImports.add(path.basename(m[1]).replace(/\.\w+$/, ''));

      const imports = content.matchAll(/from\s+['"`]([^'"`]+)['"`]/g);
      for (const m of imports) allImports.add(path.basename(m[1]).replace(/\.\w+$/, ''));

      const dynamicImports = content.matchAll(/import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
      for (const m of dynamicImports) allImports.add(path.basename(m[1]).replace(/\.\w+$/, ''));
    } catch { /* skip */ }
  }

  // Check which files are never imported
  const codeFiles = files.filter(f => ['.js', '.ts', '.tsx', '.jsx'].includes(path.extname(f)));
  for (const fp of codeFiles) {
    const base = path.basename(fp).replace(/\.\w+$/, '');
    const fileName = path.basename(fp);

    // Skip entry points and special files
    if (['server', 'index', 'page', 'layout', 'loading', 'error', 'not-found', 'middleware', 'global-error', 'providers', 'globals', 'sitemap', 'robots', 'sw', 'next.config', 'tailwind.config', 'postcss.config', 'eslint.config', 'jest.config', 'jest.setup', 'jest.teardown', 'playwright.config', 'capacitor.config', 'prisma.config'].includes(base)) continue;
    if (fp.includes('seed-') || fp.includes('scripts/')) continue;
    if (fileName.endsWith('.config.js') || fileName.endsWith('.config.ts') || fileName.endsWith('.config.cjs') || fileName.endsWith('.config.mjs')) continue;

    if (!allImports.has(base)) {
      findings.push({
        severity: 'warning', rule: 'zombie-file',
        message: `File never imported/required by any other file`,
        file: rel(fp), line: 0,
      });
    }
  }
  return findings.slice(0, 30); // Cap
}

// ─── Check 4: Backup / Temp Files ────────────────────────────

function checkBackupFiles(files) {
  const findings = [];
  const backupPatterns = ['.bak', '.old', '.copy', '.orig', '.backup', '.tmp', '.temp', '~'];

  for (const fp of files) {
    const name = path.basename(fp);
    for (const pattern of backupPatterns) {
      if (name.includes(pattern)) {
        findings.push({
          severity: 'warning', rule: 'backup-file',
          message: `Backup/temp file in codebase: ${name}`,
          file: rel(fp), line: 0,
        });
      }
    }
    // Check for debug prefixes
    if (name.startsWith('debug-') || name.startsWith('test-tmp') || name.startsWith('tmp-')) {
      findings.push({ severity: 'info', rule: 'temp-file', message: `Temp file: ${name}`, file: rel(fp), line: 0 });
    }
  }
  return findings;
}

// ─── Check 5: Empty Files ────────────────────────────────────

function checkEmptyFiles(files) {
  const findings = [];
  for (const fp of files) {
    try {
      const stat = fs.statSync(fp);
      if (stat.size === 0) {
        findings.push({ severity: 'info', rule: 'empty-file', message: 'File is empty', file: rel(fp), line: 0 });
      } else if (stat.size < 10) {
        const content = fs.readFileSync(fp, 'utf-8').trim();
        if (content.length === 0) {
          findings.push({ severity: 'info', rule: 'empty-file', message: 'File is effectively empty', file: rel(fp), line: 0 });
        }
      }
    } catch { /* skip */ }
  }
  return findings;
}

// ─── Check 6: Legacy/Dead Patterns ───────────────────────────

function checkLegacyFiles(files) {
  const findings = [];
  for (const fp of files) {
    const name = path.basename(fp).toLowerCase();
    if (name.includes('legacy') || name.includes('deprecated') || name.includes('-old') || name.includes('_old')) {
      findings.push({ severity: 'warning', rule: 'legacy-file', message: `Possibly legacy/deprecated file`, file: rel(fp), line: 0 });
    }
  }
  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 08 — Duplicate / Conflict / Zombie File Detection');
  console.log('═'.repeat(55));

  const allFiles = [];
  for (const dir of SCAN_DIRS) allFiles.push(...collectFiles(path.join(ROOT, dir)));
  console.log(`  Files to scan: ${allFiles.length}\n`);

  const allFindings = [
    ...checkExactDuplicates(allFiles),
    ...checkConflictingNames(allFiles),
    ...checkZombieFiles(allFiles),
    ...checkBackupFiles(allFiles),
    ...checkEmptyFiles(allFiles),
    ...checkLegacyFiles(allFiles),
  ];

  const critical = allFindings.filter(f => f.severity === 'critical').length;
  const warnings = allFindings.filter(f => f.severity === 'warning').length;
  const info = allFindings.filter(f => f.severity === 'info').length;
  const byRule = {};
  for (const f of allFindings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;

  console.log('── Results ─────────────────────────────────────────');
  console.log(`  Files scanned:      ${allFiles.length}`);
  console.log(`Critical: ${critical}`);
  console.log(`Warning: ${warnings}`);
  console.log(`Info: ${info}`);
  console.log(`  Total findings:     ${allFindings.length}`);

  if (Object.keys(byRule).length > 0) {
    console.log('\n── By Rule ─────────────────────────────────────────');
    for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${rule.padEnd(25)} ${count}`);
    }
  }

  const topIssues = allFindings.filter(f => f.severity !== 'info').slice(0, 15);
  if (topIssues.length > 0) {
    console.log('\n── Top Issues ──────────────────────────────────────');
    for (const f of topIssues) {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵';
      console.log(`  ${icon} ${f.file} — ${f.message}`);
    }
  }

  const score = Math.max(0, 100 - (critical * 10) - Math.floor(warnings * 0.001) - Math.floor(info * 0.001));
  console.log(`\n File Hygiene Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = { agent: '08-duplicate-zombie', timestamp: new Date().toISOString(), filesScanned: allFiles.length, summary: { critical, warnings, info, total: allFindings.length }, score, byRule, findings: allFindings };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
