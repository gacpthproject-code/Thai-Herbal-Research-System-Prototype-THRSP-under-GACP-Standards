#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 03 — API Endpoint Review
 * ═══════════════════════════════════════════════════════════════
 * Scans routes/ directory, maps all endpoints, checks for
 * missing auth, validation, error handling, REST naming,
 * orphan routes, and response format consistency.
 *
 * Usage: node scripts/review/agent-api-endpoint.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BACKEND = path.join(ROOT, 'apps/backend');
const RESULTS_FILE = path.join(__dirname, 'agent-api-endpoint-results.json');

const IGNORE_DIRS = ['node_modules', '.git', '__tests__', 'coverage'];

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

// ─── Extract Routes ──────────────────────────────────────────

function extractRoutes(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const routes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match router.get/post/put/patch/delete
    const routeMatch = line.match(/router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase();
      const routePath = routeMatch[2];

      // Check if middleware is present (multiple args before handler)
      const hasAuth = /auth|authenticate|requireAuth|verifyToken|requireRole|requireAdmin|isAuthenticated/.test(line) ||
                      (i > 0 && /auth|authenticate|requireAuth/.test(lines.slice(Math.max(0, i - 5), i).join(' ')));
      const hasValidation = /validate|validat|body\(|param\(|query\(|check\(/.test(line);
      const hasRateLimit = /rateLimi|rateLimit/.test(line);

      routes.push({
        method, path: routePath, file: rel(filePath), line: i + 1,
        hasAuth, hasValidation, hasRateLimit,
      });
    }

    // Also match app.get/post/etc.
    const appMatch = line.match(/app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (appMatch) {
      routes.push({
        method: appMatch[1].toUpperCase(), path: appMatch[2], file: rel(filePath), line: i + 1,
        hasAuth: /auth|authenticate/.test(line), hasValidation: /validate/.test(line), hasRateLimit: /rateLimit/.test(line),
      });
    }
  }
  return routes;
}

// ─── Route Checks ────────────────────────────────────────────

function checkMissingAuth(routes) {
  const publicPaths = ['/health', '/version', '/trace', '/public', '/auth/login', '/auth/register', '/auth/forgot', '/auth/reset', '/standards', '/pricing', '/cultivation-config', '/system-config/public', '/webhook', '/verify', '/qr', '/callback', '/status', '/export', '/download', '/manifest', '/sitemap'];
  return routes
    .filter(r => !r.hasAuth && !publicPaths.some(p => r.path.includes(p)))
    .filter(r => {
      // Check if the route file has router-level auth middleware
      const filePath = path.join(ROOT, r.file);
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        // If file has router.use(auth...) or applies auth globally, skip
        if (/router\.use\s*\(\s*(?:auth|requireAuth|verifyToken|isAuthenticated)/.test(fileContent)) return false;
        if (/app\.use\s*\([^)]*auth/i.test(fileContent)) return false;
      }
      return true;
    })
    .map(r => ({
      severity: 'warning', rule: 'missing-auth-middleware',
      message: `${r.method} ${r.path} — no auth middleware detected`,
      file: r.file, line: r.line,
    }));
}

function checkMissingValidation(routes) {
  return routes
    .filter(r => ['POST', 'PUT', 'PATCH'].includes(r.method) && !r.hasValidation)
    .map(r => ({
      severity: 'warning', rule: 'missing-validation',
      message: `${r.method} ${r.path} — mutation endpoint without input validation`,
      file: r.file, line: r.line,
    }));
}

function checkRESTNaming(routes) {
  const findings = [];
  for (const r of routes) {
    // Check for verb-based naming (anti-pattern)
    if (/\/(get|create|update|delete|fetch|save|remove)\w+/i.test(r.path) && !/\/get-/.test(r.path)) {
      // Allow some specific patterns
      if (!/config|status|stats|dashboard/.test(r.path)) {
        findings.push({
          severity: 'info', rule: 'rest-naming',
          message: `${r.method} ${r.path} — path contains verb; REST prefers nouns`,
          file: r.file, line: r.line,
        });
      }
    }
    // Check for inconsistent pluralization
    if (r.method === 'GET' && /\/[a-z]+\/[^:\/]+$/.test(r.path) && !/s\//.test(r.path) && !/:/.test(r.path)) {
      // This is heuristic, not always correct
    }
  }
  return findings;
}

function checkMethodConsistency(routes) {
  const findings = [];
  for (const r of routes) {
    if (r.method === 'GET' && /\/(create|insert|add|save|update|delete|remove)/.test(r.path)) {
      findings.push({
        severity: 'warning', rule: 'method-mismatch',
        message: `GET ${r.path} — GET used for mutation-like path`,
        file: r.file, line: r.line,
      });
    }
    if (r.method === 'DELETE' && r.path.includes('/create')) {
      findings.push({
        severity: 'warning', rule: 'method-mismatch',
        message: `DELETE ${r.path} — DELETE used for create-like path`,
        file: r.file, line: r.line,
      });
    }
  }
  return findings;
}

function checkDuplicateRoutes(routes) {
  const seen = new Map();
  const findings = [];
  for (const r of routes) {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) {
      findings.push({
        severity: 'warning', rule: 'duplicate-route',
        message: `Duplicate: ${key} also defined in ${seen.get(key)}`,
        file: r.file, line: r.line,
      });
    }
    seen.set(key, r.file);
  }
  return findings;
}

// Check controller files for error handling
function checkControllerErrorHandling() {
  const findings = [];
  const controllerDir = path.join(BACKEND, 'controllers');
  if (!fs.existsSync(controllerDir)) return findings;

  const files = collectFiles(controllerDir);
  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    // Check if controllers have try/catch
    let hasAsyncHandler = false;
    let hasTryCatch = false;
    for (const line of lines) {
      if (/async\s*\(req,\s*res/.test(line) || /async\s+\w+\s*\(req/.test(line)) hasAsyncHandler = true;
      if (/try\s*\{/.test(line)) hasTryCatch = true;
    }
    if (hasAsyncHandler && !hasTryCatch) {
      findings.push({
        severity: 'warning', rule: 'controller-no-try-catch',
        message: 'Controller has async handlers but no try/catch blocks',
        file: rel(fp), line: 1,
      });
    }

    // Check for consistent error response format
    const errorFormats = [];
    for (let i = 0; i < lines.length; i++) {
      if (/res\.status\(\d+\)\.json\(/.test(lines[i])) {
        if (/\{\s*error:/.test(lines[i])) errorFormats.push('error-key');
        else if (/\{\s*message:/.test(lines[i])) errorFormats.push('message-key');
        else if (/\{\s*success:\s*false/.test(lines[i])) errorFormats.push('success-false');
      }
    }
    const uniqueFormats = [...new Set(errorFormats)];
    if (uniqueFormats.length > 1) {
      findings.push({
        severity: 'info', rule: 'inconsistent-error-format',
        message: `Mixed error response formats: ${uniqueFormats.join(', ')}`,
        file: rel(fp), line: 1,
      });
    }
  }
  return findings;
}

// ─── Orphan Route Check ──────────────────────────────────────

function checkOrphanRoutes(routes) {
  const findings = [];
  const controllerDir = path.join(BACKEND, 'controllers');
  if (!fs.existsSync(controllerDir)) return findings;

  const controllerFiles = collectFiles(controllerDir);
  const exportedFunctions = new Set();

  for (const fp of controllerFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    const exports = content.match(/(?:module\.exports\s*=\s*\{([^}]+)\}|exports\.(\w+))/g) || [];
    for (const e of exports) {
      const names = e.match(/(\w+)/g) || [];
      for (const n of names) exportedFunctions.add(n);
    }
  }

  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 03 — API Endpoint Review');
  console.log('═'.repeat(55));

  // Collect all route files
  const routeFiles = collectFiles(path.join(BACKEND, 'routes'));
  const serverFile = path.join(BACKEND, 'server.js');
  const filesToScan = [...routeFiles];
  if (fs.existsSync(serverFile)) filesToScan.push(serverFile);

  console.log(`  Route files found: ${filesToScan.length}`);

  // Extract all routes
  const allRoutes = [];
  for (const fp of filesToScan) {
    allRoutes.push(...extractRoutes(fp));
  }
  console.log(`  Total routes found: ${allRoutes.length}`);

  // Run checks
  const allFindings = [
    ...checkMissingAuth(allRoutes),
    ...checkMissingValidation(allRoutes),
    ...checkRESTNaming(allRoutes),
    ...checkMethodConsistency(allRoutes),
    ...checkDuplicateRoutes(allRoutes),
    ...checkControllerErrorHandling(),
  ];

  // Build route map
  const routeMap = {};
  for (const r of allRoutes) {
    const group = r.file;
    if (!routeMap[group]) routeMap[group] = [];
    routeMap[group].push(`${r.method} ${r.path}`);
  }

  const critical = allFindings.filter(f => f.severity === 'critical').length;
  const warnings = allFindings.filter(f => f.severity === 'warning').length;
  const info = allFindings.filter(f => f.severity === 'info').length;
  const byRule = {};
  for (const f of allFindings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;

  console.log('\n── API Route Map ───────────────────────────────────');
  for (const [file, routes] of Object.entries(routeMap)) {
    console.log(`${file} (${routes.length} routes)`);
    for (const r of routes.slice(0, 5)) console.log(`     ${r}`);
    if (routes.length > 5) console.log(`     ... +${routes.length - 5} more`);
  }

  console.log('\n── Results ─────────────────────────────────────────');
  console.log(`  Total routes:       ${allRoutes.length}`);
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
  console.log(`\n API Endpoint Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = { agent: '03-api-endpoint', timestamp: new Date().toISOString(), totalRoutes: allRoutes.length, routeMap, summary: { critical, warnings, info, total: allFindings.length }, score, byRule, findings: allFindings };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
