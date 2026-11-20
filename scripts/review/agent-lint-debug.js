#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 09 — Lint & Debug Review
 * ═══════════════════════════════════════════════════════════════
 * Detects debug statements, unused imports, .env secrets,
 * syntax issues, and gives a lint quality summary without
 * requiring eslint to be installed (static regex analysis).
 *
 * Usage: node scripts/review/agent-lint-debug.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RESULTS_FILE = path.join(__dirname, 'agent-lint-debug-results.json');

const SCAN_DIRS = [
  'apps/backend/controllers',
  'apps/backend/services',
  'apps/backend/middleware',
  'apps/backend/utils',
  'apps/backend/routes',
  'apps/backend/config',
  'apps/backend/jobs',
  'apps/backend/shared',
  'apps/backend/validation',
  'apps/web-app/src',
  'packages',
];

const EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx'];
const IGNORE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', '__tests__', 'coverage', 'e2e', 'tmp-provider-shots'];

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

// ─── Check: Debug Statements ─────────────────────────────────

function checkDebugStatements(files) {
  const findings = [];
  for (const fp of files) {
    const lines = fs.readFileSync(fp, 'utf-8').split('\n');
    let debugCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      if (/\bdebugger\b/.test(line)) {
        findings.push({ severity: 'critical', rule: 'debugger', message: '`debugger` statement — remove before deploy', file: rel(fp), line: i + 1 });
      }
      if (/\balert\s*\(/.test(line) && !fp.includes('test')) {
        findings.push({ severity: 'warning', rule: 'alert', message: '`alert()` used — remove for production', file: rel(fp), line: i + 1 });
      }
      if (/console\.(log|debug|info)\s*\(/.test(line) && !fp.includes('script') && !fp.includes('test')) {
        debugCount++;
      }
    }

    if (debugCount > 0) {
      findings.push({ severity: 'info', rule: 'console-log', message: `${debugCount} console.log/debug/info statements`, file: rel(fp), line: 0 });
    }
  }
  return findings;
}

// ─── Check: Unused Imports ───────────────────────────────────

function checkUnusedImports(files) {
  const findings = [];
  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    // ES imports
    const importMatches = content.matchAll(/import\s+\{([^}]+)\}\s+from/g);
    for (const m of importMatches) {
      const names = m[1].split(',').map(n => n.trim().split(' as ').pop().trim()).filter(Boolean);
      for (const name of names) {
        // Count usages excluding import line
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        const matches = content.match(regex) || [];
        if (matches.length <= 1) {
          findings.push({ severity: 'info', rule: 'unused-import', message: `Imported "${name}" appears unused`, file: rel(fp), line: 0 });
        }
      }
    }
  }
  return findings.slice(0, 50); // Cap
}

// ─── Check: .env Secrets ─────────────────────────────────────

function checkEnvSecrets() {
  const findings = [];
  const envFiles = [
    '.env', '.env.local', '.env.production', '.env.development',
    'apps/backend/.env', 'apps/backend/.env.local', 'apps/backend/.env.production',
    'apps/web-app/.env', 'apps/web-app/.env.local',
  ];

  for (const envFile of envFiles) {
    const fp = path.join(ROOT, envFile);
    if (!fs.existsSync(fp)) continue;

    // .env files should be in .gitignore
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#') || !line.includes('=')) continue;

      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');

      if (value.length > 5 && /password|secret|key|token/i.test(key) && !value.includes('${') && value !== 'changeme' && value !== 'your-') {
        findings.push({ severity: 'critical', rule: 'env-secret', message: `${key} has a real value in ${envFile} — ensure in .gitignore`, file: envFile, line: i + 1 });
      }
    }
  }

  // Check .gitignore includes .env files
  const gitignore = path.join(ROOT, '.gitignore');
  if (fs.existsSync(gitignore)) {
    const gitignoreContent = fs.readFileSync(gitignore, 'utf-8');
    if (!gitignoreContent.includes('.env')) {
      findings.push({ severity: 'critical', rule: 'env-not-gitignored', message: '.env files not in .gitignore', file: '.gitignore', line: 0 });
    }
  }
  return findings;
}

// ─── Check: Syntax Patterns ─────────────────────────────────

function checkSyntaxPatterns(files) {
  const findings = [];
  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // == instead of === (loose equality)
      if (/[^=!<>]==[^=]/.test(line) && !line.includes('===') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        findings.push({ severity: 'info', rule: 'loose-equality', message: 'Using == instead of === (loose equality)', file: rel(fp), line: i + 1 });
      }

      // var usage
      if (/^\s*var\s+/.test(line)) {
        findings.push({ severity: 'info', rule: 'var-usage', message: '`var` used — prefer `const` or `let`', file: rel(fp), line: i + 1 });
      }
    }
  }

  // Cap findings
  const byRule = {};
  const capped = [];
  for (const f of findings) {
    byRule[f.rule] = (byRule[f.rule] || 0) + 1;
    if (byRule[f.rule] <= 5) capped.push(f);
  }
  for (const [rule, count] of Object.entries(byRule)) {
    if (count > 5) {
      capped.push({ severity: 'info', rule, message: `... +${count - 5} more ${rule} issues`, file: '', line: 0 });
    }
  }
  return capped;
}

// ─── Check: Long Lines ───────────────────────────────────────

function checkLongLines(files) {
  const findings = [];
  let totalLong = 0;
  for (const fp of files) {
    const lines = fs.readFileSync(fp, 'utf-8').split('\n');
    let fileLong = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 200 && !lines[i].includes('base64') && !lines[i].includes('data:image')) {
        fileLong++;
      }
    }
    if (fileLong > 3) {
      findings.push({ severity: 'info', rule: 'long-lines', message: `${fileLong} lines exceed 200 chars`, file: rel(fp), line: 0 });
      totalLong += fileLong;
    }
  }
  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 09 — Lint & Debug Review');
  console.log('═'.repeat(55));

  const allFiles = [];
  for (const dir of SCAN_DIRS) allFiles.push(...collectFiles(path.join(ROOT, dir)));
  console.log(`  Files to scan: ${allFiles.length}\n`);

  const allFindings = [
    ...checkDebugStatements(allFiles),
    ...checkUnusedImports(allFiles),
    ...checkEnvSecrets(),
    ...checkSyntaxPatterns(allFiles),
    ...checkLongLines(allFiles),
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
      const icon = f.severity === 'critical' ? '🔴' : '🟡';
      console.log(`  ${icon} ${f.file}:${f.line} — ${f.message}`);
    }
  }

  const score = Math.max(0, 100 - (critical * 10) - Math.floor(warnings * 0.001) - Math.floor(info * 0.001));
  console.log(`\n Lint Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = { agent: '09-lint-debug', timestamp: new Date().toISOString(), filesScanned: allFiles.length, summary: { critical, warnings, info, total: allFindings.length }, score, byRule, findings: allFindings };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
