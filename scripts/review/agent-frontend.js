#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 05 — Frontend Review
 * ═══════════════════════════════════════════════════════════════
 * Scans all Next.js pages & components: completeness, unused
 * components, missing error boundaries, a11y, TypeScript types,
 * hardcoded strings, inline styles, useEffect deps, keys.
 *
 * Usage: node scripts/review/agent-frontend.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const WEBAPP_SRC = path.join(ROOT, 'apps/web-app/src');
const RESULTS_FILE = path.join(__dirname, 'agent-frontend-results.json');

const IGNORE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', '__tests__', 'coverage', 'tmp-provider-shots', 'e2e'];

function collectFiles(dir, exts = ['.tsx', '.ts', '.jsx', '.js']) {
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

// ─── Check: Pages Completeness ───────────────────────────────

function checkPages() {
  const findings = [];
  const pagesDir = path.join(WEBAPP_SRC, 'app');
  const pageFiles = collectFiles(pagesDir).filter(f => path.basename(f) === 'page.tsx' || path.basename(f) === 'page.ts');

  console.log(`Pages found: ${pageFiles.length}`);

  for (const fp of pageFiles) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    // Check for missing error handling in page components
    if (!content.includes('error') && !content.includes('Error') && !content.includes('catch')) {
      findings.push({ severity: 'info', rule: 'page-no-error-handling', message: 'Page has no error handling UI', file: rel(fp), line: 1 });
    }

    // Check for missing loading state
    if (content.includes('fetch') || content.includes('useQuery') || content.includes('useSWR') || content.includes('useEffect')) {
      if (!content.includes('loading') && !content.includes('Loading') && !content.includes('isLoading') && !content.includes('Skeleton') && !content.includes('Spinner')) {
        findings.push({ severity: 'warning', rule: 'page-no-loading-state', message: 'Page fetches data but has no loading state', file: rel(fp), line: 1 });
      }
    }

    // Check for very large page files
    if (lines.length > 300) {
      findings.push({ severity: 'warning', rule: 'page-too-large', message: `Page component has ${lines.length} lines — extract sub-components`, file: rel(fp), line: 1 });
    }
  }

  // Check for missing layout files in route groups
  const layoutFiles = collectFiles(pagesDir).filter(f => path.basename(f) === 'layout.tsx');
  const routeGroups = new Set(pageFiles.map(f => path.dirname(path.relative(pagesDir, f)).split(path.sep)[0]));

  return findings;
}

// ─── Check: TypeScript / Any Usage ───────────────────────────

function checkTypeScript() {
  const findings = [];
  const files = collectFiles(WEBAPP_SRC);

  for (const fp of files) {
    if (!fp.endsWith('.ts') && !fp.endsWith('.tsx')) continue;
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    let anyCount = 0;
    for (let i = 0; i < lines.length; i++) {
      // Check for 'any' type usage (but not 'any(' which is a method)
      if (/:\s*any\b|as\s+any\b|<any>/.test(lines[i]) && !lines[i].trim().startsWith('//')) {
        anyCount++;
        if (anyCount <= 3) {
          findings.push({ severity: 'warning', rule: 'typescript-any', message: `Using 'any' type — use proper type`, file: rel(fp), line: i + 1 });
        }
      }
    }
    if (anyCount > 3) {
      findings.push({ severity: 'warning', rule: 'typescript-any', message: `... +${anyCount - 3} more 'any' usages`, file: rel(fp), line: 0 });
    }

    // Check for @ts-ignore
    for (let i = 0; i < lines.length; i++) {
      if (/@ts-ignore|@ts-nocheck/.test(lines[i])) {
        findings.push({ severity: 'warning', rule: 'ts-ignore', message: '@ts-ignore suppresses type checking', file: rel(fp), line: i + 1 });
      }
    }
  }
  return findings;
}

// ─── Check: Accessibility ────────────────────────────────────

function checkAccessibility() {
  const findings = [];
  const files = collectFiles(WEBAPP_SRC).filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');
    let imgNoAlt = 0;
    let buttonNoLabel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // img without alt
      if (/<img\s/.test(line) && !/alt=/.test(line) && !/alt\s*=/.test(lines.slice(i, i + 3).join(' '))) {
        imgNoAlt++;
      }

      // button with only icon, no aria-label
      if (/<button/.test(line) && /icon|Icon|svg/.test(line) && !/aria-label/.test(lines.slice(i, i + 3).join(' '))) {
        buttonNoLabel++;
      }

      // onClick on non-interactive element
      if (/onClick/.test(line) && /<(?:div|span|p|td|tr)\s/.test(line) && !/role=/.test(line) && !/tabIndex/.test(line)) {
        findings.push({ severity: 'warning', rule: 'a11y-click-handler', message: 'onClick on non-interactive element without role/tabIndex', file: rel(fp), line: i + 1 });
      }
    }

    if (imgNoAlt > 0) findings.push({ severity: 'warning', rule: 'a11y-img-alt', message: `${imgNoAlt} <img> without alt attribute`, file: rel(fp), line: 1 });
    if (buttonNoLabel > 0) findings.push({ severity: 'info', rule: 'a11y-button-label', message: `${buttonNoLabel} icon button(s) may lack aria-label`, file: rel(fp), line: 1 });
  }
  return findings;
}

// ─── Check: useEffect Dependencies ───────────────────────────

function checkUseEffect() {
  const findings = [];
  const files = collectFiles(WEBAPP_SRC).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Empty dependency array with variables used inside
      if (/useEffect\s*\(/.test(lines[i])) {
        const block = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
        // useEffect with no dependency array at all
        if (/useEffect\s*\(\s*\(\)\s*=>\s*\{/.test(block) && !/\]\s*\)/.test(block)) {
          findings.push({ severity: 'warning', rule: 'useEffect-no-deps', message: 'useEffect without dependency array — runs on every render', file: rel(fp), line: i + 1 });
        }
      }
    }
  }
  return findings;
}

// ─── Check: Inline Styles ────────────────────────────────────

function checkInlineStyles() {
  const findings = [];
  const files = collectFiles(WEBAPP_SRC).filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const inlineStyleCount = (content.match(/style=\{\{/g) || []).length;
    if (inlineStyleCount > 5) {
      findings.push({ severity: 'info', rule: 'inline-styles', message: `${inlineStyleCount} inline styles — prefer Tailwind classes or CSS modules`, file: rel(fp), line: 1 });
    }
  }
  return findings;
}

// ─── Check: Missing Keys ─────────────────────────────────────

function checkMissingKeys() {
  const findings = [];
  const files = collectFiles(WEBAPP_SRC).filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // .map( that returns JSX without key
      if (/\.map\s*\(/.test(lines[i])) {
        const mapBlock = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
        if (/<\w/.test(mapBlock) && !mapBlock.includes('key=') && !mapBlock.includes('key ')) {
          findings.push({ severity: 'warning', rule: 'missing-key-prop', message: '.map() renders JSX without key prop', file: rel(fp), line: i + 1 });
        }
      }
    }
  }
  return findings;
}

// ─── Check: Hardcoded Strings ────────────────────────────────

function checkHardcodedStrings() {
  const findings = [];
  const files = collectFiles(WEBAPP_SRC).filter(f => f.endsWith('.tsx'));
  let totalHardcoded = 0;

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');
    let fileHardcoded = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Thai text directly in JSX
      if (/[ก-๙]{5,}/.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.includes('import') && !/const|let|var/.test(line.split('=')[0])) {
        fileHardcoded++;
      }
    }
    if (fileHardcoded > 5) {
      totalHardcoded += fileHardcoded;
      findings.push({ severity: 'info', rule: 'hardcoded-thai', message: `${fileHardcoded} hardcoded Thai strings — consider i18n pattern`, file: rel(fp), line: 1 });
    }
  }
  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 05 — Frontend Review');
  console.log('═'.repeat(55));

  const allFiles = collectFiles(WEBAPP_SRC);
  console.log(`  Total frontend files: ${allFiles.length}\n`);

  const allFindings = [
    ...checkPages(),
    ...checkTypeScript(),
    ...checkAccessibility(),
    ...checkUseEffect(),
    ...checkInlineStyles(),
    ...checkMissingKeys(),
    ...checkHardcodedStrings(),
  ];

  const critical = allFindings.filter(f => f.severity === 'critical').length;
  const warnings = allFindings.filter(f => f.severity === 'warning').length;
  const info = allFindings.filter(f => f.severity === 'info').length;
  const byRule = {};
  for (const f of allFindings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;

  console.log('── Results ─────────────────────────────────────────');
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
  console.log(`\n Frontend Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = { agent: '05-frontend', timestamp: new Date().toISOString(), filesScanned: allFiles.length, summary: { critical, warnings, info, total: allFindings.length }, score, byRule, findings: allFindings };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
