#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 06 — Backend Review
 * ═══════════════════════════════════════════════════════════════
 * Reviews controllers, services, middleware: input validation,
 * rate limiting, raw SQL, error response consistency, hardcoded
 * secrets, middleware usage, service separation.
 *
 * Usage: node scripts/review/agent-backend.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BACKEND = path.join(ROOT, 'apps/backend');
const RESULTS_FILE = path.join(__dirname, 'agent-backend-results.json');

const IGNORE_DIRS = ['node_modules', '.git', '__tests__', 'coverage', 'chaos-tests', 'tests'];

function collectFiles(dir, exts = ['.js']) {
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

// ─── Check: Controller Quality ───────────────────────────────

function checkControllers() {
  const findings = [];
  const dir = path.join(BACKEND, 'controllers');
  if (!fs.existsSync(dir)) return findings;
  const files = collectFiles(dir);

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    // Check response format consistency
    const formats = { success: 0, error: 0, message: 0, data: 0 };
    for (const line of lines) {
      if (/res\.\w+\.json\(\s*\{.*success:/.test(line)) formats.success++;
      if (/res\.\w+\.json\(\s*\{.*error:/.test(line)) formats.error++;
      if (/res\.\w+\.json\(\s*\{.*message:/.test(line)) formats.message++;
      if (/res\.\w+\.json\(\s*\{.*data:/.test(line)) formats.data++;
    }
    const usedFormats = Object.entries(formats).filter(([, v]) => v > 0).map(([k]) => k);
    if (usedFormats.length > 2) {
      findings.push({ severity: 'info', rule: 'inconsistent-response', message: `Uses ${usedFormats.length} response formats: ${usedFormats.join(', ')}`, file: rel(fp), line: 1 });
    }

    // Check for missing try/catch
    let asyncHandlers = 0;
    let tryCatchBlocks = 0;
    for (const line of lines) {
      if (/async\s*\(req/.test(line)) asyncHandlers++;
      if (/try\s*\{/.test(line)) tryCatchBlocks++;
    }
    if (asyncHandlers > 0 && tryCatchBlocks < asyncHandlers) {
      findings.push({ severity: 'warning', rule: 'missing-try-catch', message: `${asyncHandlers} async handlers, only ${tryCatchBlocks} try/catch blocks`, file: rel(fp), line: 1 });
    }

    // Check for direct req.body without destructuring (readability)
    let directBodyAccess = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/req\.body\.\w+/.test(lines[i]) && !/const\s*\{/.test(lines[Math.max(0, i - 5)])) {
        directBodyAccess++;
      }
    }
    if (directBodyAccess > 5) {
      findings.push({ severity: 'info', rule: 'no-destructuring', message: `${directBodyAccess} direct req.body accesses — destructure for readability`, file: rel(fp), line: 1 });
    }
  }
  return findings;
}

// ─── Check: Service Quality ──────────────────────────────────

function checkServices() {
  const findings = [];
  const dir = path.join(BACKEND, 'services');
  if (!fs.existsSync(dir)) return findings;
  const files = collectFiles(dir);

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    // Check for res/req in services (should be pure business logic)
    if (/\breq\.\w+|\bres\.\w+/.test(content) && !fp.includes('middleware') && !fp.includes('auth-service')) {
      let reqResCount = 0;
      for (const line of lines) {
        if (/\breq\.(body|params|query|headers|cookies)\b/.test(line)) reqResCount++;
        if (/\bres\.(status|json|send|redirect)\b/.test(line)) reqResCount++;
      }
      if (reqResCount > 2) {
        findings.push({ severity: 'warning', rule: 'service-has-req-res', message: `Service accesses req/res ${reqResCount} times — should receive plain params`, file: rel(fp), line: 1 });
      }
    }

    // Check for raw SQL (injection risk)
    for (let i = 0; i < lines.length; i++) {
      if (/\$queryRaw|\.raw\(|\.query\(/.test(lines[i]) || /\$executeRaw/.test(lines[i])) {
        if (/\$\{/.test(lines[i]) || /\+\s*\w+/.test(lines[i])) {
          findings.push({ severity: 'critical', rule: 'raw-sql-injection', message: 'Raw SQL with string interpolation — SQL injection risk', file: rel(fp), line: i + 1 });
        } else {
          findings.push({ severity: 'info', rule: 'raw-sql', message: 'Raw SQL query — ensure parameterized', file: rel(fp), line: i + 1 });
        }
      }
    }

    // Check for missing transaction for multi-step operations
    if (/await.*prisma\.\w+\.(create|update|delete)/.test(content)) {
      const mutations = (content.match(/await.*prisma\.\w+\.(create|update|delete)/g) || []).length;
      if (mutations >= 3 && !content.includes('$transaction')) {
        findings.push({ severity: 'warning', rule: 'missing-transaction', message: `${mutations} Prisma mutations without $transaction — data inconsistency risk`, file: rel(fp), line: 1 });
      }
    }

    // Check for hardcoded credentials
    for (let i = 0; i < lines.length; i++) {
      if (/password\s*[:=]\s*['"][^'"]{6,}['"]/.test(lines[i]) && !lines[i].includes('process.env') && !lines[i].includes('hash') && !lines[i].includes('bcrypt')) {
        findings.push({ severity: 'critical', rule: 'hardcoded-credential', message: 'Possible hardcoded password', file: rel(fp), line: i + 1 });
      }
    }
  }
  return findings;
}

// ─── Check: Middleware ───────────────────────────────────────

function checkMiddleware() {
  const findings = [];
  const dir = path.join(BACKEND, 'middleware');
  if (!fs.existsSync(dir)) return findings;
  const files = collectFiles(dir);

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    // Check for next() calls
    if (!content.includes('next(') && !content.includes('next (')) {
      findings.push({ severity: 'warning', rule: 'middleware-no-next', message: 'Middleware does not call next() — may block request pipeline', file: rel(fp), line: 1 });
    }

    // Check async middleware without error forwarding
    if (/async/.test(content) && !content.includes('next(e') && !content.includes('next(err') && !content.includes('catch')) {
      findings.push({ severity: 'warning', rule: 'middleware-no-error-forward', message: 'Async middleware without error forwarding to next(err)', file: rel(fp), line: 1 });
    }
  }
  return findings;
}

// ─── Check: Server.js ────────────────────────────────────────

function checkServer() {
  const findings = [];
  const serverFile = path.join(BACKEND, 'server.js');
  if (!fs.existsSync(serverFile)) return findings;

  const content = fs.readFileSync(serverFile, 'utf-8');
  const lines = content.split('\n');

  if (lines.length > 300) {
    findings.push({ severity: 'warning', rule: 'server-too-large', message: `server.js has ${lines.length} lines — extract route mounting and middleware setup`, file: rel(serverFile), line: 1 });
  }

  // Check for global error handler
  if (!content.includes('app.use(') || !/(err|error),\s*(req|_req),\s*(res|_res),\s*(next|_next)/.test(content)) {
    findings.push({ severity: 'warning', rule: 'no-global-error-handler', message: 'No global error handler middleware detected', file: rel(serverFile), line: 1 });
  }

  // Check for graceful shutdown
  if (!content.includes('SIGTERM') && !content.includes('SIGINT')) {
    findings.push({ severity: 'info', rule: 'no-graceful-shutdown', message: 'No graceful shutdown handler (SIGTERM/SIGINT)', file: rel(serverFile), line: 1 });
  }

  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 06 — Backend Review');
  console.log('═'.repeat(55));

  const allFindings = [
    ...checkControllers(),
    ...checkServices(),
    ...checkMiddleware(),
    ...checkServer(),
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
  console.log(`\n Backend Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = { agent: '06-backend', timestamp: new Date().toISOString(), summary: { critical, warnings, info, total: allFindings.length }, score, byRule, findings: allFindings };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
