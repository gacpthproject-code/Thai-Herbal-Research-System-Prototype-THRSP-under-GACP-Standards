#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 04 — System Design & Architecture Review
 * ═══════════════════════════════════════════════════════════════
 * Inspects circular deps, layer violations, god files,
 * coupling, config management, project structure, and nginx config.
 *
 * Usage: node scripts/review/agent-system-design.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BACKEND = path.join(ROOT, 'apps/backend');
const WEBAPP = path.join(ROOT, 'apps/web-app');
const RESULTS_FILE = path.join(__dirname, 'agent-system-design-results.json');

const IGNORE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', '__tests__', 'e2e', 'coverage', 'tmp-provider-shots'];

function collectFiles(dir, exts = ['.js', '.ts', '.tsx']) {
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

// ─── Check 1: Layer Violations ───────────────────────────────

function checkLayerViolations() {
  const findings = [];
  const controllerFiles = collectFiles(path.join(BACKEND, 'controllers'));
  const routeFiles = collectFiles(path.join(BACKEND, 'routes'));

  // Controllers should not directly use prisma (should go through services)
  for (const fp of controllerFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    if (/require.*prisma|import.*prisma|prisma\.\w+\.(find|create|update|delete|upsert|count|aggregate)/.test(content)) {
      findings.push({
        severity: 'warning', rule: 'layer-violation',
        message: 'Controller directly accesses Prisma — should go through service layer',
        file: rel(fp), line: 1,
      });
    }
  }

  // Routes should not contain business logic
  for (const fp of routeFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');
    let routeHandlerLines = 0;
    for (const line of lines) {
      if (/async\s*\(req,\s*res/.test(line)) routeHandlerLines++;
    }
    if (routeHandlerLines > 3) {
      findings.push({
        severity: 'warning', rule: 'logic-in-routes',
        message: `Route file has ${routeHandlerLines} inline handlers — logic should be in controllers`,
        file: rel(fp), line: 1,
      });
    }
  }

  return findings;
}

// ─── Check 2: God Files ──────────────────────────────────────

function checkGodFiles() {
  const findings = [];
  const allFiles = [
    ...collectFiles(path.join(BACKEND, 'controllers')),
    ...collectFiles(path.join(BACKEND, 'services')),
    ...collectFiles(path.join(WEBAPP, 'src')),
  ];

  for (const fp of allFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');
    const imports = lines.filter(l => /require\(|import\s/.test(l)).length;
    const exports = (content.match(/exports?\.\w+|export\s+(default|const|function|class)/g) || []).length;

    if (imports > 20) {
      findings.push({
        severity: 'warning', rule: 'god-file-imports',
        message: `File has ${imports} imports — consider splitting`,
        file: rel(fp), line: 1,
      });
    }
    if (lines.length > 500 && imports > 10) {
      findings.push({
        severity: 'warning', rule: 'god-file',
        message: `God file: ${lines.length} lines, ${imports} imports — too much responsibility`,
        file: rel(fp), line: 1,
      });
    }
  }
  return findings;
}

// ─── Check 3: Circular Dependencies ──────────────────────────

function checkCircularDeps() {
  const findings = [];
  const files = collectFiles(BACKEND);
  const depMap = new Map();

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const deps = [];
    const requireMatches = content.matchAll(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
    for (const m of requireMatches) {
      if (m[1].startsWith('.')) {
        const resolved = path.resolve(path.dirname(fp), m[1]);
        deps.push(resolved);
      }
    }
    depMap.set(fp, deps);
  }

  // Simple cycle detection (A→B→A)
  for (const [fileA, depsA] of depMap.entries()) {
    for (const depB of depsA) {
      // Find if depB (or depB.js) points back to fileA
      const candidates = [depB, depB + '.js', depB + '/index.js'];
      for (const c of candidates) {
        if (depMap.has(c)) {
          const depsB = depMap.get(c);
          for (const depC of depsB) {
            const candidatesC = [depC, depC + '.js', depC + '/index.js'];
            if (candidatesC.some(x => x === fileA)) {
              findings.push({
                severity: 'warning', rule: 'circular-dependency',
                message: `Circular: ${rel(fileA)} ↔ ${rel(c)}`,
                file: rel(fileA), line: 1,
              });
            }
          }
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  return findings.filter(f => {
    const key = f.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Check 4: Config Management ──────────────────────────────

function checkConfigManagement() {
  const findings = [];

  // Check for hardcoded URLs/IPs in source files
  const files = [...collectFiles(BACKEND), ...collectFiles(path.join(WEBAPP, 'src'))];
  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      // Hardcoded IPs
      if (/['"`]\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}['"`]/.test(line) && !/127\.0\.0\.1|0\.0\.0\.0|localhost/.test(line)) {
        findings.push({
          severity: 'warning', rule: 'hardcoded-ip',
          message: `Hardcoded IP address — use environment variable`,
          file: rel(fp), line: i + 1,
        });
      }

      // Hardcoded secrets patterns
      if (/(?:password|secret|api_key|apiKey|token)\s*[:=]\s*['"`][^'"` ]{8,}['"`]/i.test(line) &&
          !line.includes('process.env') && !line.includes('example') && !line.includes('placeholder')) {
        findings.push({
          severity: 'warning', rule: 'hardcoded-secret',
          message: 'Possible hardcoded secret — use environment variable',
          file: rel(fp), line: i + 1,
        });
      }
    }
  }
  return findings.slice(0, 20); // Cap
}

// ─── Check 5: Nginx Config ──────────────────────────────────

function checkNginxConfig() {
  const findings = [];
  const nginxDir = path.join(ROOT, 'nginx');
  const dockerDir = path.join(ROOT, 'docker');

  const nginxFiles = [
    ...collectFiles(nginxDir, ['.conf', '.template']),
    ...(fs.existsSync(dockerDir) ? collectFiles(dockerDir, ['.conf', '.template']) : []),
  ];

  // Also check root for docker-compose files
  const composeFiles = ['docker-compose.yml', 'docker-compose.production.yml', 'docker-compose.local-prod.yml', 'docker-compose.qa.yml']
    .map(f => path.join(ROOT, f))
    .filter(f => fs.existsSync(f));

  for (const fp of nginxFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    // Check SSL config
    if (content.includes('listen 443') && !content.includes('ssl_protocols')) {
      findings.push({ severity: 'warning', rule: 'nginx-missing-ssl-protocols', message: 'Nginx listens on 443 but ssl_protocols not explicitly set', file: rel(fp), line: 1 });
    }

    // Check security headers
    const secHeaders = ['X-Frame-Options', 'X-Content-Type-Options', 'X-XSS-Protection', 'Strict-Transport-Security'];
    for (const header of secHeaders) {
      if (!content.includes(header)) {
        findings.push({ severity: 'info', rule: 'nginx-missing-header', message: `Missing ${header} header`, file: rel(fp), line: 1 });
      }
    }

    // Check rate limiting
    if (!content.includes('limit_req') && !content.includes('limit_conn')) {
      findings.push({ severity: 'warning', rule: 'nginx-no-rate-limit', message: 'No rate limiting configured in nginx', file: rel(fp), line: 1 });
    }

    // Check gzip
    if (!content.includes('gzip')) {
      findings.push({ severity: 'info', rule: 'nginx-no-gzip', message: 'Gzip compression not configured', file: rel(fp), line: 1 });
    }

    for (let i = 0; i < lines.length; i++) {
      // Check for server_tokens
      if (lines[i].includes('server_tokens on')) {
        findings.push({ severity: 'warning', rule: 'nginx-server-tokens', message: 'server_tokens should be off in production', file: rel(fp), line: i + 1 });
      }
    }
  }

  // Check docker-compose for exposed ports
  for (const fp of composeFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/ports:/.test(lines[i])) {
        // Check next lines for direct port exposure
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (/['"]?(\d+):(\d+)['"]?/.test(lines[j])) {
            const match = lines[j].match(/['"]?(\d+):(\d+)['"]?/);
            if (match && ['5432', '6379', '27017', '3306'].includes(match[2])) {
              findings.push({
                severity: 'warning', rule: 'exposed-db-port',
                message: `Database port ${match[2]} exposed in docker-compose`,
                file: rel(fp), line: j + 1,
              });
            }
          }
        }
      }
    }
  }

  return findings;
}

// ─── Check 6: Project Structure ──────────────────────────────

function checkProjectStructure() {
  const findings = [];

  // Check for expected directories
  const expectedBackend = ['controllers', 'services', 'middleware', 'routes', 'config', 'utils', 'prisma'];
  for (const dir of expectedBackend) {
    if (!fs.existsSync(path.join(BACKEND, dir))) {
      findings.push({ severity: 'info', rule: 'missing-directory', message: `Backend missing expected directory: ${dir}`, file: `apps/backend/${dir}`, line: 0 });
    }
  }

  // Check for shared code between frontend and backend
  const sharedDir = path.join(ROOT, 'packages');
  if (!fs.existsSync(sharedDir) || fs.readdirSync(sharedDir).length === 0) {
    findings.push({ severity: 'info', rule: 'no-shared-packages', message: 'No shared packages — consider extracting common types/validation', file: 'packages/', line: 0 });
  }

  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 04 — System Design & Architecture Review');
  console.log('═'.repeat(55));

  const allFindings = [
    ...checkLayerViolations(),
    ...checkGodFiles(),
    ...checkCircularDeps(),
    ...checkConfigManagement(),
    ...checkNginxConfig(),
    ...checkProjectStructure(),
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
  console.log(`\n Architecture Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = { agent: '04-system-design', timestamp: new Date().toISOString(), summary: { critical, warnings, info, total: allFindings.length }, score, byRule, findings: allFindings };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
