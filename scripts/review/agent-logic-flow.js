#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 02 — Logic & Flow Review
 * ═══════════════════════════════════════════════════════════════
 * Detects unhandled promises, empty catch blocks, complex
 * conditions, dead code paths, missing null checks, and
 * inconsistent return types.
 *
 * Usage: node scripts/review/agent-logic-flow.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RESULTS_FILE = path.join(__dirname, 'agent-logic-flow-results.json');

const SCAN_DIRS = [
  'apps/backend/controllers',
  'apps/backend/services',
  'apps/backend/middleware',
  'apps/backend/utils',
  'apps/backend/routes',
  'apps/backend/jobs',
  'apps/backend/shared',
  'apps/web-app/src/app',
  'apps/web-app/src/components',
  'apps/web-app/src/features',
  'apps/web-app/src/hooks',
  'apps/web-app/src/lib',
  'apps/web-app/src/contexts',
  'apps/web-app/src/utils',
];

const EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx'];
const IGNORE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', '__tests__', 'e2e', 'coverage'];

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

// ─── Checks ──────────────────────────────────────────────────

function checkEmptyCatch(lines, fp) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(lines[i]) ||
        (/catch\s*\(/.test(lines[i]) && i + 1 < lines.length && lines[i + 1].trim() === '}')) {
      findings.push({ severity: 'warning', rule: 'empty-catch', message: 'Empty catch block — errors silently swallowed', file: rel(fp), line: i + 1 });
    }
  }
  return findings;
}

function checkUnhandledAsync(lines, fp) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // async function without try/catch nearby
    if (/async\s+(?:function\s+\w+|\w+\s*=\s*async)/.test(line)) {
      // Look ahead 50 lines for try/catch
      const block = lines.slice(i, Math.min(i + 50, lines.length)).join('\n');
      if (!block.includes('try') && !block.includes('catch') && !block.includes('.catch(')) {
        findings.push({ severity: 'info', rule: 'unhandled-async', message: 'Async function without local try/catch (OK if global error handler exists)', file: rel(fp), line: i + 1 });
      }
    }
  }
  return findings;
}

function checkSwallowedErrors(lines, fp) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    if (/catch\s*\(\s*(err|error|e|ex)\s*\)/.test(lines[i])) {
      const catchBody = lines.slice(i + 1, Math.min(i + 10, lines.length)).join('\n');
      if (!catchBody.includes('throw') && !catchBody.includes('console.') && !catchBody.includes('logger') &&
          !catchBody.includes('res.status') && !catchBody.includes('next(') && !catchBody.includes('reject')) {
        findings.push({ severity: 'info', rule: 'swallowed-error', message: 'Caught error is not logged, re-thrown, or forwarded', file: rel(fp), line: i + 1 });
      }
    }
  }
  return findings;
}

function checkComplexConditions(lines, fp) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const logicalOps = (line.match(/&&|\|\|/g) || []).length;
    if (logicalOps >= 4) {
      findings.push({ severity: 'warning', rule: 'complex-condition', message: `Condition with ${logicalOps} logical operators — hard to read, extract to helper`, file: rel(fp), line: i + 1 });
    }
  }
  return findings;
}

function checkNestedTernary(lines, fp) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const ternaries = (lines[i].match(/\?/g) || []).length;
    if (ternaries >= 3) {
      findings.push({ severity: 'warning', rule: 'nested-ternary', message: 'Deeply nested ternary — use if/else or early returns', file: rel(fp), line: i + 1 });
    }
  }
  return findings;
}

function checkMissingNullCheck(lines, fp) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Access after find/findFirst that could be null
    if (/(?:\.find|\.findFirst|\.findUnique)\s*\(/.test(line)) {
      const nextLines = lines.slice(i + 1, Math.min(i + 5, lines.length)).join('\n');
      if (nextLines.match(/\.\w+/) && !nextLines.includes('if') && !nextLines.includes('?.')  && !nextLines.includes('!= null') && !nextLines.includes('!== null') && !nextLines.includes('!== undefined')) {
        findings.push({ severity: 'warning', rule: 'missing-null-check', message: 'Accessing result of find* without null check', file: rel(fp), line: i + 1 });
      }
    }
  }
  return findings;
}

function checkReturnInconsistency(lines, fp) {
  const findings = [];
  let inFunction = false;
  let funcStart = -1;
  let funcName = '';
  let returnTypes = [];
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const funcMatch = line.match(/(?:async\s+)?function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
    if (funcMatch && !inFunction) {
      inFunction = true;
      funcStart = i;
      funcName = funcMatch[1] || funcMatch[2];
      returnTypes = [];
      braceCount = 0;
    }
    if (inFunction) {
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      if (/return\s+res\./.test(line)) returnTypes.push('response');
      else if (/return\s+(null|undefined)\s*;/.test(line)) returnTypes.push('null');
      else if (/return\s+\{/.test(line)) returnTypes.push('object');
      else if (/return\s+true|return\s+false/.test(line)) returnTypes.push('boolean');
      else if (/return\s*;/.test(line)) returnTypes.push('void');

      if (braceCount <= 0 && i > funcStart) {
        const uniqueTypes = [...new Set(returnTypes)];
        if (uniqueTypes.length >= 3) {
          findings.push({ severity: 'info', rule: 'inconsistent-return', message: `Function "${funcName}" has ${uniqueTypes.length} different return types: ${uniqueTypes.join(', ')}`, file: rel(fp), line: funcStart + 1 });
        }
        inFunction = false;
      }
    }
  }
  return findings;
}

function checkDeadCode(lines, fp) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    // Code after return/throw
    if (/^\s*(return|throw)\s/.test(lines[i]) && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine.length > 0 && nextLine !== '}' && !nextLine.startsWith('//') && !nextLine.startsWith('*') && nextLine !== 'break;' && nextLine !== 'case') {
        findings.push({ severity: 'warning', rule: 'dead-code', message: `Unreachable code after ${lines[i].trim().split(' ')[0]}`, file: rel(fp), line: i + 2 });
      }
    }
  }
  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 02 — Logic & Flow Review');
  console.log('═'.repeat(55));

  const allFiles = [];
  for (const dir of SCAN_DIRS) allFiles.push(...collectFiles(path.join(ROOT, dir)));
  console.log(`  Scanning ${allFiles.length} files...\n`);

  const allFindings = [];
  let filesWithIssues = 0;

  for (const fp of allFiles) {
    const lines = fs.readFileSync(fp, 'utf-8').split('\n');
    const findings = [
      ...checkEmptyCatch(lines, fp),
      ...checkUnhandledAsync(lines, fp),
      ...checkSwallowedErrors(lines, fp),
      ...checkComplexConditions(lines, fp),
      ...checkNestedTernary(lines, fp),
      ...checkMissingNullCheck(lines, fp),
      ...checkReturnInconsistency(lines, fp),
      ...checkDeadCode(lines, fp),
    ];
    if (findings.length > 0) filesWithIssues++;
    allFindings.push(...findings);
  }

  const critical = allFindings.filter(f => f.severity === 'critical').length;
  const warnings = allFindings.filter(f => f.severity === 'warning').length;
  const info = allFindings.filter(f => f.severity === 'info').length;

  const byRule = {};
  for (const f of allFindings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;

  console.log('── Results ─────────────────────────────────────────');
  console.log(`  Files scanned:      ${allFiles.length}`);
  console.log(`  Files with issues:  ${filesWithIssues}`);
  console.log(`Critical: ${critical}`);
  console.log(`Warning: ${warnings}`);
  console.log(`Info: ${info}`);
  console.log(`  Total findings:     ${allFindings.length}`);
  console.log('');
  console.log('── By Rule ─────────────────────────────────────────');
  for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule.padEnd(25)} ${count}`);
  }

  const topIssues = allFindings.filter(f => f.severity === 'critical' || f.severity === 'warning').slice(0, 15);
  if (topIssues.length > 0) {
    console.log('\n── Top Issues ──────────────────────────────────────');
    for (const f of topIssues) {
      const icon = f.severity === 'critical' ? '🔴' : '🟡';
      console.log(`  ${icon} ${f.file}:${f.line} — ${f.message}`);
    }
  }

  const score = Math.max(0, 100 - (critical * 10) - Math.floor(warnings * 0.001) - Math.floor(info * 0.001));
  console.log(`\n Logic & Flow Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  const output = { agent: '02-logic-flow', timestamp: new Date().toISOString(), filesScanned: allFiles.length, filesWithIssues, summary: { critical, warnings, info, total: allFindings.length }, score, byRule, findings: allFindings };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);
  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
