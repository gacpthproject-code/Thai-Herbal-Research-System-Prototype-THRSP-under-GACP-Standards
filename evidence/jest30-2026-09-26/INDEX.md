# jest ^29 → ^30 (root + apps/backend) — before/after proof

Worktree: `/home/ubuntu/work/wt-jest30` branch `chore/jest-30`, base df88d357 (main e42ac52b + Task 6 deps-health jest-major check).
Node 24 (`nvm use 24`) throughout. `SIGNING_KEY_DIR=$(mktemp -d)` fresh per run; real key
`apps/backend/keys/private.pem` untouched (mtime identical before/after, see below).

## Before/after numbers — IDENTICAL

### apps/backend (full suite)
| metric | before | after |
|---|---|---|
| listTests (file count) | 885 | 885 |
| suites total | 885 | 885 |
| suites failed | 0 | 0 |
| suites skipped | 32 | 32 |
| tests total | 11227 | 11227 |
| passed | 11006 | 11006 |
| failed | 0 | 0 |
| skipped | 221 | 221 |
| todo | 0 | 0 |
| failedFiles | [] | [] |

### apps/web-app (full suite)
| metric | before | after |
|---|---|---|
| suites total | 394 | 394 |
| suites failed | 0 | 0 |
| tests total | 3208 | 3208 |
| passed | 3208 | 3208 |
| failed | 0 | 0 |
| skipped | 0 | 0 |

### private.pem mtime
```
before: 2026-09-05 22:50:35.069951192 +0700
after:  2026-09-05 22:50:35.069951192 +0700
```
`diff key-before.txt key-after.txt` → no output (identical).

Full diff check (Step 7): `diff listtests-before.txt listtests-after.txt && diff backend-before.summary.json backend-after.summary.json && diff webapp-before.summary.json webapp-after.summary.json && diff key-before.txt key-after.txt` → `ALL IDENTICAL`.

## RED/GREEN of `test:smoke:api` (behavior proof, jest 30's `--testPathPatterns`)

RED on jest 29 (package.json:51 already used the jest-30 flag name):
```
Unrecognized option "testPathPatterns". Did you mean "testPathPattern"?
```

GREEN on jest 30 (flag recognized; DB unreachable in this sandbox so the suite itself
reports 41 skipped — that outcome is not the pass criterion, only that jest no longer
rejects the flag):
```
Test Suites: 1 skipped, 0 of 1 total
Tests:       41 skipped, 41 total
```

## lock-majors (Step 4) — no new major outside the jest family

"เพิ่งมี" (newly appeared): empty — web-app already carried jest 30 in the lockfile
before this change, so no (name,major) pair is new.
"ที่หายไป" (disappeared): the full jest-29 dependency tree (jest, jest-cli, jest-config,
babel-jest, @jest/*, expect, pretty-format, jest-diff, istanbul-lib-*, @sinonjs/fake-timers,
ci-info, exit, kleur, prompts, pure-rand, resolve.exports, write-file-atomic,
@types/graceful-fs, cjs-module-lexer, babel-plugin-istanbul) — all jest-family, transitive
or direct. No unrelated package's major changed. Full list: `lock-majors.txt` in this dir.

ts-jest peer range still covers 30: `jest: ^29.0.0 || ^30.0.0` (pnpm-lock.yaml, ts-jest block).

## deps-health probe (Task 6) — RED → GREEN

Before (this worktree, before the upgrade): `jest-major: 8 แหล่ง` — FAIL "มีหลายเมเจอร์ (29 30)".
Note: the brief's Step 6 text says "4 แหล่ง"; the real source count on this tree is 8
before and 6 after (dispatch note — report actual, not the brief's stale number).

After:
```
jest-major: 6 แหล่ง
  30 package.json jest@^30.2.0
  30 apps/web-app/package.json jest@^30.2.0
  30 apps/backend/package.json jest@^30.2.0
  30 apps/backend/package.json babel-jest@^30.2.0
  30 pnpm-lock.yaml babel-jest@30
  30 pnpm-lock.yaml jest@30
PASS: Node 24 ตรงกันทุกแหล่ง · ยังไม่หมดอายุ · jest เมเจอร์เดียว · audit ไม่มี critical
exit=0
```

## workflow flag rename (Step 5)

`.github/workflows/ci.yml:510,574` and `.github/workflows/production.yml:145`:
`--testPathPattern '` → `--testPathPatterns '`. `git grep` for the old singular-arg form
(outside docs/evidence/reports/*.md) returns no match.

## probes that shell out to jest CLI (Step 9)

- `scripts/probes/settle-webhook-only.sh` → `PASS: only services/checkout/checkout-settlement-service.js writes SETTLED; settle test green`
- `scripts/probes/webhook-idempotent.sh` → `PASS: replay dedup test green`
- `grep -E '^Tests:' backend-after.log` → `Tests:       221 skipped, 11006 passed, 11227 total` (same shape as jest 29 — `suite-green.sh` regex still parses it)
- `numPassedTests`/`numPendingTests` from `backend-after.json` read as numbers (11006 / 221), not `undefined` — `full-gate.sh:969-981` contract holds.

## tier-check

`scripts/probes/tier-check.sh` on this diff (vs origin/main) → `TIER=C` (workflow files
under `.github/workflows/*` are `infra`; `package.json`/`apps/backend/package.json`/
`pnpm-lock.yaml` are `build-config`) — operator merge required, no auto-merge attempted.

## image build (Step 10)

Built from commit `de36bf5f` (this task's commit), local tag only:
`gacp-backend:proof-jest30-de36bf5ff734`. `docker build` exited 0.

`scripts/ops/image-smoke.sh gacp-backend:proof-jest30-de36bf5ff734 <dir> 24`:
```
image-smoke: gacp-backend:proof-jest30-de36bf5ff734
  ✓ node-version
      v24.21.0
  ✓ sharp
  ✓ chromium-pdf
  ✓ migrate-deploy
      All migrations have been successfully applied.
  ✓ health
      {"success":true,"version":"3.0.0","revision":"de36bf5ff734bfbd8520c626de9b2cff77419a5f",...,"dbStatus":{"status":"connected","type":"postgresql"},...}
image-smoke: PASS
exit=0
```
Proof image (`gacp-backend:proof-jest30-de36bf5ff734`) and its archive dir removed after
the check; nothing pushed, no running containers touched.

## Fix round 1 — identity-level proof, not just aggregate counts

Reviewer finding (Important): "ALL IDENTICAL" above only compared aggregate counts
(`suites`/`tests`/`skipped`/`failedFiles`, the last trivially `[]` since `failed: 0` both
times). A same-count swap of which file or which test ran would not have been caught.

**Methodology.** "Before" needed a *real* jest 29.7.0 run, not a re-read of the earlier
before-artifacts (which already existed from the original pass). Created a temporary
detached worktree at commit `df88d357` (this branch's base, before the jest bump):
```
git worktree add --detach /home/ubuntu/work/wt-jest30-before29 df88d357
cd /home/ubuntu/work/wt-jest30-before29 && pnpm install --frozen-lockfile
```
Confirmed real jest versions per run (`jest-versions.txt`):
```
backend-before (jest 29 checkout, apps/backend): 29.7.0
webapp-before   (apps/web-app, already jest 30 before this task): 30.1.3
backend-after   (apps/backend, this task's upgrade): 30.1.3
webapp-after    (apps/web-app): 30.1.3
```
Note: `jest --version` on jest 30 prints `30.1.3` on both before (web-app) and after (both
apps) — this is a known upstream inconsistency in jest's own release process (`@jest/core`'s
webpack-bundled `./package.json` snapshot inside `build/index.js` says `30.1.3` while the
real, installed `package.json` next to it — and everything pnpm/npm resolve against — says
`30.2.0`; `node -e "console.log(require('./node_modules/jest/package.json').version)"` →
`30.2.0` in both worktrees). Not a before/after discrepancy: identical on both sides once
jest 30 is in play, and irrelevant to the identity check below (which reads `--json` test
results, not the `--version` banner).

Removed the temporary worktree after capturing raw output:
`git worktree remove /home/ubuntu/work/wt-jest30-before29 --force`.

**Identity extraction** (`identity-extract.js`, in this dir): for each app, reads jest's
`--json` output and emits one JSON-line per assertion result —
`{"file":"apps/<app>/<relative path>","fullName":"...","status":"..."}` — sorted, covering
every `passed`/`failed`/`pending`/`todo`/`skipped` test, not only failures. JSON.stringify
is used (not raw `::`-joined text) because five backend test titles legitimately contain
literal newline characters (interpolated file paths in `test.each`) that would otherwise
split one array entry into multiple physical lines and desync any line-count check — this
is exactly why the plain `wc -l`-based `--listTests` count in the original pass could not
have been extended to titles without this fix.

**Worktree-path normalization.** Two test files (`payment-terms-doc-matches-the-fee-service`,
`public-trace-hands-out-no-internal-ids`) interpolate `path.resolve(__dirname, ...)` into
their own test title text. Since "before" ran from a different absolute worktree path
(`/home/ubuntu/work/wt-jest30-before29`) than "after" (`/home/ubuntu/work/wt-jest30`), the
raw title text for those 4 tests differed by that absolute-path substring only — same file,
same test, same `passed` status, zero identity difference otherwise. `identity-extract.js`
normalizes any `.../apps/(backend|web-app)/...` absolute path found *inside* a title back to
its repo-relative form before comparing, so a worktree-location artifact of this fix's own
methodology cannot masquerade as, or hide, a real regression.

**Results — before vs after, per app:**

| | backend `--listTests` (885 lines) | web-app `--listTests` (394 lines) | backend identity (11227 lines) | web-app identity (3208 lines) |
|---|---|---|---|---|
| `diff before after` | empty, exit 0 | empty, exit 0 | empty, exit 0 (after normalization; 4 lines differed by worktree-path substring only before normalizing — see above) | empty, exit 0 |
| sha256 before == after | yes (`sha256sums.txt`) | yes | yes | yes |
| per-status counts before == after | — | — | `{"passed":11006,"pending":221}` both | `{"passed":3208}` both |

Full evidence in `fix-round-1/`: `sha256sums.txt` (8 hashes, before+after × 4 list types),
`*.diff` (all four are 0 bytes), `per-status-counts.json`, `jest-versions.txt`,
`identity-extract.js`, plus the full lists themselves where small enough to commit
(`backend-listtests.txt` 56 KB, `webapp-listtests.txt` 31 KB, `webapp-identity.jsonl`
773 KB — before and after are byte-identical so only one copy is committed per type,
verified by the matching sha256 pair above). `backend-identity.jsonl` (2.5 MB raw, over the
~2 MB commit threshold) is committed gzipped as `backend-identity.jsonl.gz` (325 KB).

Raw `--json` dumps and the temporary before-29 checkout's outputs stayed in
`/tmp/claude-1000/.../scratchpad/` (not committed) — only the derived lists, diffs, hashes,
counts and versions above are.

Key mtime re-checked across this fix round: unchanged (`2026-09-05 22:50:35.069951192 +0700`)
before the temporary jest-29 run, before the identity extraction, and after — confirmed
during Step 1 (original run, above), during the temporary-worktree jest-29 run, and again
just now.
