#!/usr/bin/env node
'use strict';

/**
 * Commit hygiene: no model or vendor name, no attribution trailer, no model identity
 * as author or committer.
 *
 * Operator order 2026-11-08 ("ผมเห็นด้วยทั้งหมด"): commit messages say what changed;
 * who reviewed with which model belongs in the evidence pack. History is not rewritten
 * (that would break evidence/gate/<sha>.json), so only commits made after BASE are
 * judged: reachable from HEAD, not from BASE, and committed later than BASE. The date
 * cut keeps a branch that forked before BASE and merges later from failing on its
 * old commits. Moving BASE is an operator decision logged in HARNESS_LOG.md.
 *
 *   node scripts/ci/check-commit-hygiene.js               # range mode (local-gate)
 *   node scripts/ci/check-commit-hygiene.js --file <msg>  # commit-msg hook
 *   --base <sha> overrides BASE (selftest only)
 */

const fs = require('fs');
const { spawnSync } = require('child_process');

const BASE = '08730b4bfcde0b22d0c30057b39006f90739e9bb';
const MODEL_WORDS = /\b(sonnet|opus|haiku|fable|claude|anthropic|openai|gpt|gemini|copilot|codex)\b/i;
// Every co-author trailer is refused: the operator is the only human committer.
const TRAILERS = /^(co-authored-by|claude-session)\s*:/im;
// Refs, paths and file names are not attributions: claude/fix-x, .claude/settings.json,
// docs/governance/claude-md-ablation.md, CLAUDE.md. A bare word still counts.
// A dot counts only before a letter (an extension), so "claude." and "claude-sonnet-4.5" still count.
const PATH_TOKEN = /[\w@~-]*(?:\/[\w@~-]+|\.[A-Za-z][\w@~-]*)+\/?/g;
// A revert quotes the subject it reverts; that old subject is history, not new text.
const REVERT_QUOTE = /^Revert ".*"$/gm;
const MODEL_IDENTITY = /@anthropic\.com|^(claude|anthropic)\b|claude\[bot\]/i;

function git(args) {
    const r = spawnSync('git', args, { encoding: 'utf8' });
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function messageProblems(message) {
    const problems = [];
    const trailer = message.match(TRAILERS);
    if (trailer) problems.push(`attribution trailer "${trailer[1]}:"`);
    const word = message.replace(REVERT_QUOTE, '').replace(PATH_TOKEN, '').match(MODEL_WORDS);
    if (word) problems.push(`names a model or vendor: "${word[1]}"`);
    return problems;
}

function identityProblems(label, ident) {
    return MODEL_IDENTITY.test(ident) ? [`${label} is the model identity: ${ident}`] : [];
}

function checkHook(file) {
    // Only git's verbose diff below the scissors is dropped; comment lines are judged too,
    // because `git commit -m` keeps them under the default whitespace cleanup.
    const raw = fs.readFileSync(file, 'utf8');
    const [head, ...tail] = raw.split(/\n. -+ >8 -+\n/);
    const message = /^(#.*\n)*diff --git /.test(tail.join('\n')) ? head : raw;
    const author = git(['var', 'GIT_AUTHOR_IDENT']);
    if (!author.ok) return [`cannot determine the commit author: ${author.err}`];
    return [...messageProblems(message), ...identityProblems('author', author.out.replace(/>.*$/, '>'))];
}

function checkRange(base) {
    const baseTime = git(['log', '-1', '--format=%ct', `${base}^{commit}`]);
    if (!baseTime.ok) {
        return [`base ${base} not found (shallow clone?): fetch full history; this check fails closed`];
    }
    // Filter dates here, not with rev-list --since, which can stop walking early on skewed clocks.
    const all = git(['rev-list', `${base}..HEAD`]);
    if (!all.ok) return [`git rev-list failed: ${all.err}`];
    const failed = [];
    for (const sha of all.out.split('\n').filter(Boolean)) {
        const meta = git(['log', '-1', '--format=%ct%n%an <%ae>%n%cn <%ce>%n%B', sha]);
        if (!meta.ok) return [`git log ${sha} failed: ${meta.err}`];
        const [time, author, committer, ...body] = meta.out.split('\n');
        if (Number(time) <= Number(baseTime.out)) continue;
        [
            ...messageProblems(body.join('\n')),
            ...identityProblems('author', author),
            ...identityProblems('committer', committer),
        ].forEach((p) => failed.push(`${sha.slice(0, 9)} ${p}`));
    }
    return failed;
}

function argValue(flag) {
    const i = process.argv.indexOf(flag);
    return i > -1 ? process.argv[i + 1] : undefined;
}

function main() {
    const file = argValue('--file');
    const base = argValue('--base') || BASE;
    if (!file) console.log(`[commit-hygiene] judging commits after ${base}`);
    const failed = file ? checkHook(file) : checkRange(base);
    if (failed.length === 0) {
        console.log('[commit-hygiene] PASS');
        return 0;
    }
    failed.forEach((f) => console.error(`[commit-hygiene] FAIL: ${f}`));
    console.error('[commit-hygiene] commit messages say what changed; review details go in the evidence pack.');
    console.error('[commit-hygiene] fix an unpushed commit with `git commit --amend` or `git rebase`; never rewrite pushed history.');
    return 1;
}

process.exit(main());
