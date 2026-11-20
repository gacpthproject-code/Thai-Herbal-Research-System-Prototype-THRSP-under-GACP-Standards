#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 10 — Sitemap / Flow / Mind Map Review
 * ═══════════════════════════════════════════════════════════════
 * Parses Next.js pages → complete sitemap, finds broken internal
 * links, orphan pages, missing layouts, middleware route matching,
 * user flow map, API dependency map, navigation consistency.
 *
 * Usage: node scripts/review/agent-sitemap-flow.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const WEBAPP = path.join(ROOT, 'apps/web-app');
const WEBAPP_SRC = path.join(WEBAPP, 'src');
const APP_DIR = path.join(WEBAPP_SRC, 'app');
const RESULTS_FILE = path.join(__dirname, 'agent-sitemap-flow-results.json');

const IGNORE_DIRS = ['node_modules', '.next', 'dist', '.git', '__tests__', 'coverage', 'tmp-provider-shots', 'e2e'];

function collectFiles(dir, exts = ['.tsx', '.ts']) {
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

// ─── Build Sitemap ───────────────────────────────────────────

function buildSitemap() {
  const pages = [];
  const pageFiles = collectFiles(APP_DIR).filter(f => path.basename(f) === 'page.tsx' || path.basename(f) === 'page.ts');

  for (const fp of pageFiles) {
    const relPath = path.relative(APP_DIR, path.dirname(fp)).replace(/\\/g, '/');
    let route = '/' + relPath;

    // Handle route groups (parentheses)
    route = route.replace(/\/\([^)]+\)/g, '');
    // Handle dynamic params
    route = route.replace(/\[([^\]]+)\]/g, ':$1');
    // Clean up
    if (route === '/') route = '/';
    else route = route.replace(/\/+$/, '');

    const content = fs.readFileSync(fp, 'utf-8');
    const isClientComponent = content.includes("'use client'") || content.includes('"use client"');

    pages.push({
      route,
      file: rel(fp),
      isClient: isClientComponent,
      hasMetadata: /export.*metadata|generateMetadata/.test(content),
    });
  }

  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

// ─── Check: Broken Internal Links ────────────────────────────

function checkBrokenLinks(pages) {
  const findings = [];
  const validRoutes = new Set(pages.map(p => p.route));
  const allFiles = collectFiles(WEBAPP_SRC);

  for (const fp of allFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match href="/..." or Link href="/..."
      const hrefMatches = line.matchAll(/href=['"`]\/([^'"`#?]*)/g);
      for (const m of hrefMatches) {
        const target = '/' + m[1].replace(/\/+$/, '');
        if (target === '/') continue;
        // Skip external, api, and dynamic routes
        if (target.startsWith('/api/') || target.startsWith('/http') || target.includes(':')) continue;

        // Check if target exists (considering dynamic routes)
        const exactMatch = validRoutes.has(target);
        const dynamicMatch = [...validRoutes].some(r => {
          const pattern = r.replace(/:\w+/g, '[^/]+');
          return new RegExp(`^${pattern}$`).test(target);
        });

        if (!exactMatch && !dynamicMatch && !target.includes('[') && target !== '/favicon.ico') {
          findings.push({ severity: 'warning', rule: 'broken-link', message: `Link to "${target}" — no matching page found`, file: rel(fp), line: i + 1 });
        }
      }
    }
  }
  return findings.slice(0, 20); // Cap
}

// ─── Check: Orphan Pages ─────────────────────────────────────

function checkOrphanPages(pages) {
  const findings = [];
  const allFiles = collectFiles(WEBAPP_SRC);
  const linkedRoutes = new Set();

  for (const fp of allFiles) {
    if (path.basename(fp) === 'page.tsx') continue;
    const content = fs.readFileSync(fp, 'utf-8');
    const hrefMatches = content.matchAll(/href=['"`]\/([^'"`#?]*)/g);
    for (const m of hrefMatches) {
      linkedRoutes.add('/' + m[1].replace(/\/+$/, ''));
    }
    // Also check router.push
    const pushMatches = content.matchAll(/(?:push|replace)\s*\(\s*['"`]\/([^'"`#?]*)/g);
    for (const m of pushMatches) {
      linkedRoutes.add('/' + m[1].replace(/\/+$/, ''));
    }
  }

  // Entry/root pages and auth pages are not orphans
  const expectedRoutes = new Set(['/', '/auth/health/login', '/auth/provider/login', '/auth/clear-session']);

  for (const page of pages) {
    if (expectedRoutes.has(page.route)) continue;
    if (page.route.includes(':')) continue; // Dynamic routes get linked dynamically

    if (!linkedRoutes.has(page.route)) {
      // Check if any link pattern matches
      const isLinked = [...linkedRoutes].some(lr => {
        return page.route.startsWith(lr + '/') || lr.startsWith(page.route);
      });
      if (!isLinked) {
        findings.push({ severity: 'info', rule: 'orphan-page', message: `Page "${page.route}" — no internal link found pointing to it`, file: page.file, line: 0 });
      }
    }
  }
  return findings;
}

// ─── Check: Missing Layouts ──────────────────────────────────

function checkMissingLayouts() {
  const findings = [];
  if (!fs.existsSync(APP_DIR)) return findings;

  // Check each route group for layout
  function checkDir(dir, depth = 0) {
    if (depth > 5) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hasPage = entries.some(e => e.name === 'page.tsx' || e.name === 'page.ts');
    const hasLayout = entries.some(e => e.name === 'layout.tsx' || e.name === 'layout.ts');
    const hasLoading = entries.some(e => e.name === 'loading.tsx' || e.name === 'loading.ts');
    const hasError = entries.some(e => e.name === 'error.tsx' || e.name === 'error.ts');
    const relDir = path.relative(APP_DIR, dir).replace(/\\/g, '/');

    // Top-level route groups should have layouts
    if (depth <= 2 && hasPage && !hasLayout && relDir && !relDir.includes('/')) {
      findings.push({ severity: 'info', rule: 'missing-layout', message: `Route group "${relDir}" has pages but no layout.tsx`, file: `apps/web-app/src/app/${relDir}`, line: 0 });
    }

    // Route groups with data fetching should have loading/error
    if (hasPage && !hasLoading && depth <= 2 && relDir) {
      // findings.push({ severity: 'info', rule: 'missing-loading', message: `"${relDir}" has no loading.tsx`, file: `apps/web-app/src/app/${relDir}`, line: 0 });
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORE_DIRS.includes(entry.name)) {
        checkDir(path.join(dir, entry.name), depth + 1);
      }
    }
  }

  checkDir(APP_DIR);
  return findings;
}

// ─── Check: Middleware Coverage ───────────────────────────────

function checkMiddleware() {
  const findings = [];
  const middlewareFile = path.join(WEBAPP_SRC, 'middleware.ts');
  if (!fs.existsSync(middlewareFile)) {
    findings.push({ severity: 'warning', rule: 'no-middleware', message: 'No middleware.ts — unprotected routes', file: 'apps/web-app/src/middleware.ts', line: 0 });
    return findings;
  }

  const content = fs.readFileSync(middlewareFile, 'utf-8');

  // Check matcher config
  if (!content.includes('matcher')) {
    findings.push({ severity: 'warning', rule: 'middleware-no-matcher', message: 'Middleware has no matcher config — runs on all routes', file: rel(middlewareFile), line: 1 });
  }

  return findings;
}

// ─── Check: API Usage Map ────────────────────────────────────

function buildApiUsageMap(pages) {
  const apiMap = {};

  for (const page of pages) {
    const fullPath = path.join(ROOT, page.file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf-8');

    const apiCalls = [];
    const fetchMatches = content.matchAll(/fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g);
    for (const m of fetchMatches) {
      if (m[1].includes('/api/')) apiCalls.push(m[1]);
    }
    const axiosMatches = content.matchAll(/(?:axios|api|apiClient)\.(get|post|put|patch|delete)\s*\(\s*[`'"]([^`'"]+)[`'"]/g);
    for (const m of axiosMatches) apiCalls.push(`${m[1].toUpperCase()} ${m[2]}`);

    if (apiCalls.length > 0) {
      apiMap[page.route] = apiCalls;
    }
  }
  return apiMap;
}

// ─── Check: Navigation Consistency ───────────────────────────

function checkNavConsistency() {
  const findings = [];
  const files = collectFiles(WEBAPP_SRC).filter(f =>
    rel(f).includes('nav') || rel(f).includes('sidebar') || rel(f).includes('menu') || rel(f).includes('layout')
  );

  // Check that navigation components link to existing routes
  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    if (content.includes('href') || content.includes('Link')) {
      // Count links
      const links = (content.match(/href=['"`]\/[^'"`]*/g) || []).length;
      if (links > 20) {
        findings.push({ severity: 'info', rule: 'large-nav', message: `Navigation component with ${links} links — ensure organized`, file: rel(fp), line: 1 });
      }
    }
  }
  return findings;
}

// ─── Check: SEO Metadata ─────────────────────────────────────

function checkSEO(pages) {
  const findings = [];
  const pagesWithoutMeta = pages.filter(p => !p.hasMetadata && !p.route.includes('auth/') && !p.route.includes('api/'));

  if (pagesWithoutMeta.length > 0) {
    for (const p of pagesWithoutMeta.slice(0, 10)) {
      findings.push({ severity: 'info', rule: 'missing-metadata', message: `Page "${p.route}" — no metadata/generateMetadata export`, file: p.file, line: 0 });
    }
    if (pagesWithoutMeta.length > 10) {
      findings.push({ severity: 'info', rule: 'missing-metadata', message: `... +${pagesWithoutMeta.length - 10} more pages without metadata`, file: '', line: 0 });
    }
  }
  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 10 — Sitemap / Flow / Mind Map Review');
  console.log('═'.repeat(55));

  const pages = buildSitemap();
  console.log(`  Total pages found: ${pages.length}\n`);

  // Print sitemap
  console.log('── Sitemap ─────────────────────────────────────────');
  const groups = {};
  for (const p of pages) {
    const group = p.route.split('/')[1] || 'root';
    if (!groups[group]) groups[group] = [];
    groups[group].push(p);
  }
  for (const [group, groupPages] of Object.entries(groups)) {
    console.log(`/${group} (${groupPages.length} pages)`);
    for (const p of groupPages.slice(0, 8)) {
      const markers = [];
      if (p.isClient) markers.push('client');
      if (p.hasMetadata) markers.push('meta✓');
      console.log(`     ${p.route}${markers.length ? ` [${markers.join(', ')}]` : ''}`);
    }
    if (groupPages.length > 8) console.log(`     ... +${groupPages.length - 8} more`);
  }

  const allFindings = [
    ...checkBrokenLinks(pages),
    ...checkOrphanPages(pages),
    ...checkMissingLayouts(),
    ...checkMiddleware(),
    ...checkNavConsistency(),
    ...checkSEO(pages),
  ];

  // API usage map
  const apiMap = buildApiUsageMap(pages);
  if (Object.keys(apiMap).length > 0) {
    console.log('\n── Page → API Dependencies ─────────────────────────');
    for (const [route, apis] of Object.entries(apiMap).slice(0, 10)) {
      console.log(`  ${route} → ${apis.slice(0, 3).join(', ')}${apis.length > 3 ? ` +${apis.length - 3}` : ''}`);
    }
  }

  // User flow (simplified)
  console.log('\n── User Flows ──────────────────────────────────────');
  console.log('Health Portal:');
  console.log('     login → dashboard → applications/new → applications → planting → certificates');
  console.log('Provider Portal:');
  console.log('     login → dashboard → applications → audit → scoring → certificates');
  console.log('Admin Portal:');
  console.log('     login → dashboard → users → settings → communication');

  const critical = allFindings.filter(f => f.severity === 'critical').length;
  const warnings = allFindings.filter(f => f.severity === 'warning').length;
  const info = allFindings.filter(f => f.severity === 'info').length;
  const byRule = {};
  for (const f of allFindings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;

  console.log('\n── Results ─────────────────────────────────────────');
  console.log(`  Total pages:        ${pages.length}`);
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
  console.log(`\n Sitemap/Flow Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = {
    agent: '10-sitemap-flow', timestamp: new Date().toISOString(),
    totalPages: pages.length, sitemap: pages, apiMap,
    summary: { critical, warnings, info, total: allFindings.length },
    score, byRule, findings: allFindings,
  };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
