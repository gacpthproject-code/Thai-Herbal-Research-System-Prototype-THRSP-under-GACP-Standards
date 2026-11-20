#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent 01 — Code Quality & Readability Review
 * ═══════════════════════════════════════════════════════════════
 * Static analysis: file length, function length, nesting depth,
 * console.log, TODO/FIXME/HACK, magic numbers, naming, and
 * commented-out code blocks.
 *
 * Usage: node scripts/review/agent-code-quality.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const RESULTS_FILE = path.join(__dirname, 'agent-code-quality-results.json');

// ─── Config ──────────────────────────────────────────────────
const MAX_FILE_LINES = 800;
const MAX_FUNCTION_LINES = 100;
const MAX_NESTING_DEPTH = 6;
const MAX_PARAMS = 7;

const SCAN_DIRS = [
  'apps/backend/controllers',
  'apps/backend/services',
  'apps/backend/middleware',
  'apps/backend/utils',
  'apps/backend/routes',
  'apps/backend/config',
  'apps/backend/constants',
  'apps/backend/jobs',
  'apps/backend/shared',
  'apps/backend/validation',
  'apps/web-app/src',
  'packages',
];

const EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'];
const IGNORE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', '__tests__', 'test-reports', 'coverage', 'e2e', 'tmp-provider-shots'];

// ─── Helpers ─────────────────────────────────────────────────

function collectFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

function relPath(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

// ─── Checks ──────────────────────────────────────────────────

function checkFileLength(lines, filePath) {
  const findings = [];
  if (lines.length > MAX_FILE_LINES) {
    findings.push({
      severity: 'warning',
      rule: 'file-too-long',
      message: `File has ${lines.length} lines (max ${MAX_FILE_LINES})`,
      file: relPath(filePath),
      line: 1,
    });
  }
  return findings;
}

function checkFunctionLength(lines, filePath) {
  const findings = [];
  const funcPatterns = [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
    /^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\w*\s*=>/,
    /^\s*(\w+)\s*\(.*\)\s*\{/,
    /^\s*(?:async\s+)?(\w+)\s*=\s*async\s*\(/,
  ];

  let funcStart = -1;
  let funcName = '';
  let braceCount = 0;
  let inFunc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFunc) {
      for (const pattern of funcPatterns) {
        const match = line.match(pattern);
        if (match && !['if', 'for', 'while', 'switch', 'catch', 'else', 'return', 'import', 'require', 'describe', 'it', 'test', 'expect'].includes(match[1])) {
          funcStart = i;
          funcName = match[1];
          braceCount = 0;
          inFunc = true;
          break;
        }
      }
    }
    if (inFunc) {
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      if (braceCount <= 0 && i > funcStart) {
        const funcLength = i - funcStart + 1;
        if (funcLength > MAX_FUNCTION_LINES) {
          findings.push({
            severity: 'warning',
            rule: 'function-too-long',
            message: `Function "${funcName}" has ${funcLength} lines (max ${MAX_FUNCTION_LINES})`,
            file: relPath(filePath),
            line: funcStart + 1,
          });
        }
        inFunc = false;
      }
    }
  }
  return findings;
}

function checkNestingDepth(lines, filePath) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const leadingSpaces = line.match(/^(\s*)/)[1].length;
    const tabEquiv = line.includes('\t')
      ? line.match(/^(\t*)/)[1].length
      : Math.floor(leadingSpaces / 2);
    if (tabEquiv > 8 && line.trim().length > 0 && !line.trim().startsWith('*') && !line.trim().startsWith('//')) {
      findings.push({
        severity: tabEquiv > 12 ? 'critical' : 'info',
        rule: 'deep-nesting',
        message: `Nesting depth ${tabEquiv} exceeds recommended max`,
        file: relPath(filePath),
        line: i + 1,
      });
    }
  }
  // Deduplicate: report max 1 per file
  if (findings.length > 1) {
    return [findings[0], {
      severity: 'info',
      rule: 'deep-nesting',
      message: `... and ${findings.length - 1} more deep nesting issues`,
      file: relPath(filePath),
      line: 0,
    }];
  }
  return findings;
}

function checkDebugStatements(lines, filePath) {
  const findings = [];
  const patterns = [
    { regex: /console\.(log|debug|info|warn|error)\s*\(/, rule: 'console-statement', label: 'console.log' },
    { regex: /\bdebugger\b/, rule: 'debugger-statement', label: 'debugger' },
    { regex: /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i, rule: 'todo-comment', label: 'TODO/FIXME' },
  ];
  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      if (p.regex.test(lines[i])) {
        findings.push({
          severity: p.rule === 'debugger-statement' ? 'critical' : 'info',
          rule: p.rule,
          message: `${p.label} found: ${lines[i].trim().substring(0, 80)}`,
          file: relPath(filePath),
          line: i + 1,
        });
      }
    }
  }
  // Cap per file
  if (findings.length > 5) {
    return [...findings.slice(0, 5), {
      severity: 'info', rule: 'debug-statements',
      message: `... and ${findings.length - 5} more debug/TODO items`,
      file: relPath(filePath), line: 0,
    }];
  }
  return findings;
}

function checkMagicNumbers(lines, filePath) {
  const findings = [];
  const magicRegex = /(?<![.\w])(\d{2,})\b/g;
  const ALLOWED = new Set(['10', '16', '64', '100', '128', '200', '201', '204', '301', '302', '400', '401', '403', '404', '409', '422', '429', '500', '503', '1000', '1024', '2048', '3000', '3001', '4000', '5000', '8080', '8443', '443', '80']);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('import') || line.startsWith('const ') || line.includes('port') || line.includes('PORT')) continue;
    let match;
    while ((match = magicRegex.exec(line)) !== null) {
      if (!ALLOWED.has(match[1]) && parseInt(match[1]) > 1) {
        findings.push({
          severity: 'info',
          rule: 'magic-number',
          message: `Magic number ${match[1]} — consider extracting to a named constant`,
          file: relPath(filePath),
          line: i + 1,
        });
      }
    }
  }
  if (findings.length > 3) {
    return [...findings.slice(0, 3), {
      severity: 'info', rule: 'magic-number',
      message: `... and ${findings.length - 3} more magic numbers`,
      file: relPath(filePath), line: 0,
    }];
  }
  return findings;
}

function checkCommentedCode(lines, filePath) {
  const findings = [];
  let blockStart = -1;
  let blockCount = 0;
  const codePatterns = /^\s*\/\/\s*(const |let |var |function |if |for |while |return |import |export |class |switch |try |catch |await |\.then\(|}\s*else)/;

  for (let i = 0; i < lines.length; i++) {
    if (codePatterns.test(lines[i])) {
      if (blockStart === -1) blockStart = i;
      blockCount++;
    } else {
      if (blockCount >= 3) {
        findings.push({
          severity: 'warning',
          rule: 'commented-out-code',
          message: `${blockCount} lines of commented-out code`,
          file: relPath(filePath),
          line: blockStart + 1,
        });
      }
      blockStart = -1;
      blockCount = 0;
    }
  }
  if (blockCount >= 3) {
    findings.push({
      severity: 'warning',
      rule: 'commented-out-code',
      message: `${blockCount} lines of commented-out code at end of file`,
      file: relPath(filePath),
      line: blockStart + 1,
    });
  }
  return findings;
}

function checkManyParams(lines, filePath) {
  const findings = [];
  const paramRegex = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?)\s*\(([^)]{30,})\)/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(paramRegex);
    if (match) {
      const params = match[1].split(',').filter(p => p.trim().length > 0);
      if (params.length > MAX_PARAMS) {
        findings.push({
          severity: 'warning',
          rule: 'too-many-params',
          message: `Function has ${params.length} parameters (max ${MAX_PARAMS}) — consider using an options object`,
          file: relPath(filePath),
          line: i + 1,
        });
      }
    }
  }
  return findings;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
  console.log('\n Agent 01 — Code Quality & Readability Review');
  console.log('═'.repeat(55));

  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...collectFiles(path.join(ROOT, dir)));
  }

  console.log(`  Scanning ${allFiles.length} files...\n`);

  const allFindings = [];
  let filesWithIssues = 0;

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const findings = [
      ...checkFileLength(lines, filePath),
      ...checkFunctionLength(lines, filePath),
      ...checkNestingDepth(lines, filePath),
      ...checkDebugStatements(lines, filePath),
      ...checkMagicNumbers(lines, filePath),
      ...checkCommentedCode(lines, filePath),
      ...checkManyParams(lines, filePath),
    ];

    if (findings.length > 0) filesWithIssues++;
    allFindings.push(...findings);
  }

  // ─── Summary ─────────────────────────────────────────────
  const critical = allFindings.filter(f => f.severity === 'critical').length;
  const warnings = allFindings.filter(f => f.severity === 'warning').length;
  const info = allFindings.filter(f => f.severity === 'info').length;

  const byRule = {};
  for (const f of allFindings) {
    byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  }

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

  // Top critical/warning findings
  const topIssues = allFindings.filter(f => f.severity === 'critical' || f.severity === 'warning').slice(0, 15);
  if (topIssues.length > 0) {
    console.log('\n── Top Issues ──────────────────────────────────────');
    for (const f of topIssues) {
      const icon = f.severity === 'critical' ? '🔴' : '🟡';
      console.log(`  ${icon} ${f.file}:${f.line} — ${f.message}`);
    }
  }

  // Score
  const score = Math.max(0, 100 - (critical * 10) - Math.floor(warnings * 0.001) - Math.floor(info * 0.001));
  console.log(`\n Code Quality Score: ${score}/100`);
  console.log(score >= 80 ?'GOOD': score >= 60 ?'NEEDS IMPROVEMENT':'POOR');

  // Save
  const output = {
    agent: '01-code-quality',
    timestamp: new Date().toISOString(),
    filesScanned: allFiles.length,
    filesWithIssues,
    summary: { critical, warnings, info, total: allFindings.length },
    score,
    byRule,
    findings: allFindings,
  };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n  Results → ${RESULTS_FILE}\n`);

  return output;
}

const result = main();
if (typeof module !== 'undefined') module.exports = result;
