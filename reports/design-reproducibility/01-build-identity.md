# Build identity + toolchain pin — 01-build-identity — 2026-08-21

Branch: `fix/design-reproducibility`. Status: `DONE` (evidence below, this session).

## 1. Toolchain pin — what CI/Docker actually use, and where it disagreed

Found via grep across every workflow and every Dockerfile:

| Source | Node |
|---|---|
| `.github/workflows/ci.yml` (`NODE_VERSION`, 14 jobs) | `20.x` |
| `carpet-bomb-test.yml`, `frontend-lint-ratchet.yml`, `generate-api-clients.yml`, `infrastructure-contract-guard.yml`, `topology-guard.yml` | `20` |
| `e2e-staging-nightly.yml`, `staging-walkthrough.yml` | `20.x` |
| `production.yml` | `20` |
| `apps/web-app/Dockerfile` (both stages), `apps/backend/Dockerfile` (both stages) | `node:20-alpine` |
| **`backend-qc-golden.yml`** | **`18`** ← the one disagreement found |
| Local machine (this session) | `v24.19.0` |

Production images (the thing actually served) are built `FROM node:20-alpine`, and every workflow except one already agrees — so pinned to **Node 20**. Fixed `backend-qc-golden.yml`'s `'18'` → `'20'` (`.github/workflows/backend-qc-golden.yml`) rather than just noting it: one-line `setup-node` change, no logic touched, closes the only real mismatch.

Actions taken:
- `.nvmrc`, `.node-version` — both `20` (root).
- `package.json:132-135` and `apps/backend/package.json:71-73` — `engines.node` tightened from the floor `">=18.0.0"` to the pin `"20.x"` (matches CI's own literal `NODE_VERSION: '20.x'` string). `apps/web-app/package.json` has no `engines` field and none was added — pnpm evaluates the workspace root's `engines` for the whole install already (proven below), and this repo's own L4 law disfavors a second, redundant source of truth.
- `.npmrc` (new, root) — `engine-strict=true`. This repo's package manager is pnpm (`packageManager: pnpm@8.15.0`), which only *warns* on an engines mismatch by default; `engine-strict` turns that into a hard install failure.

**Proof engine-strict actually fails loudly on a mismatch** (isolated scratch dir, this machine's real Node v24.19.0, not the repo — no risk to the repo's own `node_modules`):
```
$ node -v
v24.19.0
$ pnpm install   # package.json: engines.node "20.x"; .npmrc: engine-strict=true
 ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)
Expected version: 20.x
Got: v24.19.0
```
Confirmed this does NOT block work in this session: `apps/web-app/node_modules` was already installed before this change, and `npx jest` / `npx tsc` invoke the already-installed binaries directly — they don't re-trigger pnpm's engines check. Only a *fresh* `pnpm install` on a wrong-Node machine now fails loudly, which is the point.

## 2. Self-identifying build

### The bug
`Footer.tsx:49-50` defaulted `buildDate`/`version` from `NEXT_PUBLIC_BUILD_DATE`/`NEXT_PUBLIC_APP_VERSION`. Grep confirmed **zero** writers of either var anywhere in the repo (no Dockerfile ARG, no compose arg, no workflow env) — so every real render fell through to the dict's `buildDateFallback`: the word `"ปัจจุบัน"`/`"current"`. A placeholder dressed as a fact; no way to tell a stale server from a fresh one by looking at the page.

### The fix — wired the EXISTING mechanism through, didn't invent a new one
`build-info.ts`/`GET /api/webapp-version` already existed and already worked correctly (verified — see §3). `Footer.tsx` now fetches that route client-side on mount (it's already `'use client'`) instead of reading frozen-at-build `NEXT_PUBLIC_*` vars. `buildDate`/`version` props still override (used by `GovLayout` callers and existing tests) and skip the fetch once both are given. Dict fallback text changed to an honest `"ไม่ทราบรุ่นบิลด์"` / `"unknown build"` — shown only while unfetched, on fetch failure, or when the build genuinely was never stamped; never implies "current".

**What a person now sees in the footer:**
- Stamped build, once the fetch resolves: `ปรับปรุงล่าสุด: 2026-08-14T07:46:09Z` + a second row `เวอร์ชัน: 93aeb95` (short SHA, 7 chars — full SHA never rendered).
- Unstamped build / fetch not yet resolved / fetch failed: `ปรับปรุงล่าสุด: ไม่ทราบรุ่นบิลด์`, no version row. Never `"ปัจจุบัน"`.
- Explicit `buildDate`/`version` prop (existing override path): shown verbatim, fetch is skipped, never overwritten.

### Every build path checked and wired
| Path | State found | Action |
|---|---|---|
| `apps/web-app/Dockerfile` runner stage | already had `ARG GIT_SHA=""`/`ARG BUILT_AT=""` → `ENV` (pre-existing, correct) | none needed |
| `.github/workflows/build-images.yml` (main image publisher) | already passed `build-args: GIT_SHA=${{ github.sha }}` / `BUILT_AT=${{ github.event.repository.updated_at }}` for both backend+frontend | none needed |
| `.github/workflows/deploy-staging.yml` | its own `docker/build-push-action` step had **no build-args at all** — staging images from this path were always unstamped | added the same `GIT_SHA`/`BUILT_AT` build-args, applied to both matrix legs (both Dockerfiles already declare the ARGs) |
| `.github/workflows/production.yml` | its `build-and-push-images` job also had **no build-args** — the actual production image build path was always unstamped | added same build-args |
| `docker-compose.yml` (`frontend` service, `build:`) | only `NEXT_PUBLIC_API_URL` arg | added `GIT_SHA: ${GIT_SHA:-}` / `BUILT_AT: ${BUILT_AT:-}` |
| `docker-compose.local-prod.yml` (`frontend` service, `build:`) | same gap | same fix (list-style args to match its existing syntax) |
| `docker-compose.production.yml`, `.staging.yml`, `.bluegreen.yml`, `.qa.yml`, `.test.local.yml` | all reference `image:` (pre-built from GHCR), no `build:` block for frontend | nothing to wire — they consume what `build-images.yml`/`production.yml`/`deploy-staging.yml` publish |

All 7 touched YAML/compose files re-parsed with `js-yaml` after editing — no syntax errors (docker CLI unavailable in this sandbox, so `docker compose config` could not be run; YAML-parse plus close reading of each `build-args`/`args` block is the verification actually available here — flagged as a gap below).

### `GET /api/webapp-version` (build-info.ts) — verified, not just read
Already correct: `force-dynamic` prevents the invisible failure the route's own comment warns about (freezing the BUILDER stage's empty env forever); `buildInfo()` already answers `{revision: null, builtAt: null}` rather than a placeholder string, which is exactly what makes `deploy-drift.sh` able to say "this image cannot answer" instead of misreporting drift. No test file existed for the route before this session — added `apps/web-app/src/app/api/webapp-version/route.test.ts` (4 tests, all pass) proving: `dynamic === 'force-dynamic'`, a stamped env round-trips exactly, an unstamped env answers `{revision: null, builtAt: null}` with HTTP 200 (not a 500), and it never answers the literal string `"unknown"`.

## 3. `scripts/ops/which-build.sh` — one-command answer

`scripts/ops/which-build.sh <base-url>` — curl's `<base-url>/api/webapp-version`, parses with `node` (same approach as `scripts/probes/deploy-drift.sh`, for the same reason: grep would false-match a SHA-shaped string inside an error page), fetches `origin/main` by explicit refspec, and reports commit + build time + commits behind `origin/main` — or says plainly why it can't. All Thai, คุณ-register-consistent (no address-as-"ท่าน"), no em dash, every failure line states cause + next action. Not covered by the repo's automated `check-thai-copy-style.js` (that checker only scans `apps/web-app/src`, `apps/mobile-app/lib`, `apps/backend` — `.sh` isn't in its `SCAN_EXTENSIONS`) so it was hand-reviewed against `thai-ui-copy` skill rules instead.

**Tested against 6 live scenarios** (a real Node HTTP server on localhost, not mocked at the curl layer):
```
$ bash scripts/ops/which-build.sh http://127.0.0.1:8971   # revision: null
เซิร์ฟเวอร์นี้ไม่ทราบรุ่นบิลด์ของตัวเอง (GIT_SHA ว่างตอน build อิมเมจ)
ให้ build ใหม่พร้อม --build-arg GIT_SHA=$(git rev-parse HEAD) --build-arg BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ) แล้ว deploy ใหม่
exit=1

$ bash scripts/ops/which-build.sh http://127.0.0.1:8972   # revision = local HEAD
รุ่นบิลด์ (commit): 4d7a22fc084ad36ab99d29a380fc4a605fbc2db8
เวลา build: 2026-08-14T07:46:09Z
ตรงกับ origin/main แล้ว เป็นบิลด์ล่าสุด
exit=0

$ bash scripts/ops/which-build.sh http://127.0.0.1:8973   # revision = origin/main~3
รุ่นบิลด์ (commit): 3c77c7271a47418cca71c42483b8e7c2ecd96f5a
เวลา build: 2026-08-14T07:46:09Z
ตามหลัง origin/main อยู่ 3 commit
exit=0

$ bash scripts/ops/which-build.sh http://127.0.0.1:8974   # malformed (HTML) body
คำตอบจาก http://127.0.0.1:8974/api/webapp-version ไม่ใช่ JSON ที่มีฟิลด์ revision/builtAt ตามที่คาด
อาจเจอหน้า error หรือ proxy คั่นกลางแทนตัวแอปจริง ตรวจสอบ URL แล้วลองใหม่
exit=1

$ bash scripts/ops/which-build.sh http://127.0.0.1:19     # nothing listening
เชื่อมต่อ http://127.0.0.1:19/api/webapp-version ไม่ได้
ตรวจสอบว่า URL ถูกต้องและเซิร์ฟเวอร์เปิดอยู่ แล้วลองใหม่
exit=1

$ bash scripts/ops/which-build.sh   # no arg
ต้องระบุ URL ของเซิร์ฟเวอร์ที่จะตรวจสอบ
วิธีใช้: scripts/ops/which-build.sh <base-url>
exit=2

$ bash scripts/ops/which-build.sh http://127.0.0.1:8975   # revision = fake sha, unknown locally
รุ่นบิลด์ (commit): aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
เวลา build: 2026-08-14T07:46:09Z
ไม่รู้จัก commit นี้ในซอร์สโค้ดโลคัลเครื่องนี้ (ประวัติอาจไม่ครบ)
รัน git fetch origin ก่อนแล้วลองใหม่ ถ้ายังไม่รู้จักอีก แปลว่า commit นี้ยังไม่เข้า origin
exit=0
```

## 4. RED → GREEN evidence (TDD)

**RED** (before touching `Footer.tsx`/dict files — 3 new tests fail against the old placeholder behavior):
```
build identity (design-reproducibility/01-build-identity)
  × never shows the old "current"/"ปัจจุบัน" placeholder...
    Expected substring: not "ปัจจุบัน"
    Received string: "...ปรับปรุงล่าสุดปัจจุบันเว็บไซต์กรม..."
  × fetches the real build stamp from /api/webapp-version...
    Expected: "/api/webapp-version"   Number of calls: 0
  × falls back to the honest unknown label... when the fetch itself fails
    Expected substring: not "ปัจจุบัน"  (same placeholder leak)
Tests: 3 failed, 8 passed, 11 total
```

**GREEN** (after `Footer.tsx` + `th-footer.ts`/`en-footer.ts` changes):
```
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total   (Footer.test.tsx)
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total     (route.test.ts, new)
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total     (GovLayout.test.tsx + build-info.test.ts = 6... see below)
```
Full combined run, this session:
```
$ npx jest Footer.test.tsx GovLayout.test.tsx build-info.test.ts route.test.ts --no-coverage
Test Suites: 4 passed, 4 total
Tests:       29 passed, 29 total
```
Also re-ran (unmodified logic, changed dict values only) to guard against structural regressions:
```
$ npx jest dictionary-parity.test.ts i18n-policy-doc.test.ts --no-coverage
Test Suites: 2 passed, 2 total
Tests:       11 passed, 11 total
```

**tsc** — `npx tsc --noEmit -p tsconfig.json` from `apps/web-app`, before vs after:
- Before my edits: 80 lines total (62 `e2e-phase0/*.spec.ts` baseline + 18 lines in `src/app/trace/[qr-code]/client-view.tsx`, which belongs to the other agent working in this repo concurrently — not touched by me).
- After my edits: **62 lines**, all `e2e-phase0/*.spec.ts` (the other agent's `client-view.tsx` lines cleared independently in the meantime). **Zero new lines from any file I touched.**

**eslint** on every touched `.ts`/`.tsx` file (`Footer.tsx`, `Footer.test.tsx`, `th-footer.ts`, `en-footer.ts`, `route.test.ts`): 0 errors, 0 warnings (one `Unused eslint-disable directive` warning was found and removed before the final clean run).

## 5. Reproducibility gaps seen but NOT owned/fixed here

- No local Docker daemon in this sandbox, so `docker compose config`/`docker build` could not be run against the edited compose files — validated via YAML parse + manual review only. Recommend an operator do a real `docker compose build frontend` with `GIT_SHA`/`BUILT_AT` exported before relying on it.
- `production.yml`/`build-images.yml`'s `BUILT_AT` value is `github.event.repository.updated_at` — the *repository's* last-metadata-update timestamp (stars, description, etc.), not the build's actual wall-clock time. Pre-existing convention (copied for consistency, not introduced here); a more accurate value would be the workflow run's own start time.
- `apps/web-app/e2e/visual/*` (out of my file ownership per this task) is the natural place a pixel-level "does this render identically on another machine" regression would live — not investigated.
- Fonts/rendering (the "renders broken, sometimes just wrong" half of the operator's complaint) is a font-pinning/CSS-determinism question outside this task's scope (toolchain + build-identity only) — not investigated here.
