#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CHECK = process.env.COMMIT_HYGIENE_UNDER_TEST || path.join(__dirname, 'check-commit-hygiene.js');
// The machine's global git config (signing, hooksPath) must not leak into the temp repo.
const ISOLATED = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function run(args, { cwd, env } = {}) {
    const res = spawnSync('node', [CHECK, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...ISOLATED, ...env } });
    return { code: res.status, output: `${res.stdout}${res.stderr}` };
}

function checkMessage(message, ident = { GIT_AUTHOR_NAME: 'jonmaxmore', GIT_AUTHOR_EMAIL: 'jonmaxmore@gmail.com' }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-hygiene-msg-'));
    const file = path.join(dir, 'COMMIT_EDITMSG');
    fs.writeFileSync(file, message);
    const result = run(['--file', file], { env: ident });
    fs.rmSync(dir, { recursive: true, force: true });
    return result;
}

const bad = [
    'merge: fix/x เข้า main (ตรวจอิสระ sonnet อนุมัติ)',
    'fix: แก้ตาม Opus review',
    'docs: haiku ตรวจแล้ว',
    'chore: fable เขียน',
    'docs: claude-sonnet-4 ตรวจแล้ว',
    'fix: เพิ่ม gpt-4 จาก openai',
    'fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    'fix: x\n\nClaude-Session: https://claude.ai/code/session_abc',
    'fix: x\n\nGenerated with Claude Code',
    'fix: x\n\nCo-authored-by: Someone <a@b.c>',
    'fix: x\n#Co-Authored-By: Claude <noreply@anthropic.com>',
    'fix: Opus.',
    'fix: claude-sonnet-4.5 ok',
    'fix: gpt-4.1',
    'fix: x\n# ------------------------ >8 ------------------------\ntext\ndiff --git a/x b/x\nCo-Authored-By: Claude <noreply@anthropic.com>',
    'fix: reviewed by claude.',
    'fix: x\n# ------------------------ >8 ------------------------\nCo-Authored-By: Claude <noreply@anthropic.com>',
];
for (const message of bad) {
    const r = checkMessage(message);
    assert.strictEqual(r.code, 1, `should reject: ${JSON.stringify(message)}\n${r.output}`);
}

const good = [
    'merge: fix/consent-version เข้า main (operator 2026-11-05 "merge fix/consent-version" · Tier C)',
    'chore(settings): แก้ .claude/settings.json และ CLAUDE.md ตามคำสั่ง operator',
    'docs: อ้าง docs/governance/claude-md-ablation-2026-10-05.md',
    "Merge branch 'claude/debug-zero-warnings'",
    'Merge pull request #12 from jonmaxmore/claude/fix-pdf',
    'Revert "merge: x (ตรวจอิสระ sonnet อนุมัติ)"\n\nThis reverts commit 08730b4bfcde0b22d0c30057b39006f90739e9bb.',
    'fix: x\n# ------------------------ >8 ------------------------\n# Do not modify or remove the line above.\n# Everything below it will be ignored.\ndiff --git a/x b/x\n+ model: sonnet\n',
    'docs: เปิด https://claude.ai/code',
];
for (const message of good) {
    const r = checkMessage(message);
    assert.strictEqual(r.code, 0, `should accept: ${JSON.stringify(message)}\n${r.output}`);
}

const idBad = checkMessage('fix: clean subject', { GIT_AUTHOR_NAME: 'Claude', GIT_AUTHOR_EMAIL: 'noreply@anthropic.com' });
assert.strictEqual(idBad.code, 1, `hook rejects the model identity as author\n${idBad.output}`);

// Range mode: only commits after the base are judged, by reachability and by date.
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-hygiene-repo-'));
const git = (args, env = {}) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, ...ISOLATED, ...env } });
    assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
};
const human = { GIT_AUTHOR_NAME: 'jonmaxmore', GIT_AUTHOR_EMAIL: 'jonmaxmore@gmail.com', GIT_COMMITTER_NAME: 'jonmaxmore', GIT_COMMITTER_EMAIL: 'jonmaxmore@gmail.com' };
const model = { GIT_AUTHOR_NAME: 'Claude', GIT_AUTHOR_EMAIL: 'noreply@anthropic.com', GIT_COMMITTER_NAME: 'Claude', GIT_COMMITTER_EMAIL: 'noreply@anthropic.com' };
const at = (iso) => ({ GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const check = (base) => run(['--base', base], { cwd: repo });

git(['init', '-q', '-b', 'main']);
git(['commit', '-q', '--allow-empty', '-m', 'root'], { ...human, ...at('2026-11-01T00:00:00Z') });
git(['checkout', '-q', '-b', 'claude/old-cloud-branch']);
git(['commit', '-q', '--allow-empty', '-m', 'old: ตรวจอิสระ sonnet อนุมัติ'], { ...model, ...at('2026-11-02T00:00:00Z') });
git(['checkout', '-q', 'main']);
git(['commit', '-q', '--allow-empty', '-m', 'base: ตรวจอิสระ sonnet อนุมัติ'], { ...model, ...at('2026-11-08T00:00:00Z') });
const base = git(['rev-parse', 'HEAD']);
git(['commit', '-q', '--allow-empty', '-m', 'fix: clean'], { ...human, ...at('2026-11-09T00:00:00Z') });
let r = check(base);
assert.strictEqual(r.code, 0, `history up to the base is ignored\n${r.output}`);
assert.match(r.output, new RegExp(base), 'the base it judged from is printed');

git(['merge', '-q', '--no-ff', '--no-edit', 'claude/old-cloud-branch'], { ...human, ...at('2026-11-10T00:00:00Z') });
r = check(base);
assert.strictEqual(r.code, 0, `merging a branch forked before the base does not judge its old commits\n${r.output}`);

const head = git(['rev-parse', 'HEAD']);
const failsThenReset = (env, message, why) => {
    git(['commit', '-q', '--allow-empty', '-m', message], env);
    const res = check(base);
    assert.strictEqual(res.code, 1, `${why}\n${res.output}`);
    git(['reset', '-q', '--hard', head]);
    return res;
};
failsThenReset(model, 'fix: clean subject', 'new commit authored as the model fails');
failsThenReset({ ...human, GIT_COMMITTER_NAME: 'Claude', GIT_COMMITTER_EMAIL: 'noreply@anthropic.com' }, 'fix: clean subject', 'new commit committed as the model fails');
const named = failsThenReset(human, 'merge: x (ตรวจอิสระ sonnet อนุมัติ)', 'new commit naming a model fails');
assert.match(named.output, /sonnet/i, 'failure names the offending word');

r = check('0000000000000000000000000000000000000000');
assert.strictEqual(r.code, 1, `unknown base fails closed\n${r.output}`);
fs.rmSync(repo, { recursive: true, force: true });

console.log('[commit-hygiene-selftest] PASS');
