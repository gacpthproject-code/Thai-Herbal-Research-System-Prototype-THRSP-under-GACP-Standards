#!/usr/bin/env node
// identity-extract.js <jest-json> <app: backend|web-app>
// Prints one JSON object per line (JSON.stringify escapes any embedded newline/control
// char in a title, so "one array entry == one physical line" holds even when a test
// title itself contains a literal newline) for every assertion result across all suites:
//   {"file":"<relative to apps/<app>/>","fullName":"...","status":"passed|failed|pending|todo|skipped"}
// Sorted by file, then fullName, then status so two runs diff cleanly.
const path = require('path');
const jsonPath = process.argv[2];
const app = process.argv[3]; // 'backend' or 'web-app'
const j = require(path.resolve(jsonPath));
const re = new RegExp(`^.*?/apps/${app}/`);
// A handful of tests interpolate an absolute path (via __dirname/path.resolve) into their
// own title text (e.g. "... /home/ubuntu/work/<worktree>/apps/backend/.env.example says
// where the default comes from"). When "before" is run from a temporary worktree at a
// different absolute path than "after", that substring differs even though the test
// itself, its file, and its status are unchanged. Normalize any absolute path that
// contains "/apps/backend/" or "/apps/web-app/" down to the same repo-relative form used
// for `file` above, so a worktree-location artifact can't masquerade as — or hide — a real
// identity difference.
const normalize = (s) =>
  s.replace(/\/[^\s"]*\/apps\/(backend|web-app)\//g, 'apps/$1/');
const entries = [];
for (const suite of j.testResults) {
  const file = suite.name.replace(re, '');
  for (const a of suite.assertionResults) {
    entries.push({ file, fullName: normalize(a.fullName), status: a.status });
  }
}
entries.sort((x, y) =>
  x.file < y.file ? -1 : x.file > y.file ? 1 :
  x.fullName < y.fullName ? -1 : x.fullName > y.fullName ? 1 :
  x.status < y.status ? -1 : x.status > y.status ? 1 : 0
);
process.stdout.write(entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
