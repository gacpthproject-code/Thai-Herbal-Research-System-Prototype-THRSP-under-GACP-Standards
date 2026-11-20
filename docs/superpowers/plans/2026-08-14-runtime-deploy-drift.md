# Runtime Deploy Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every running service publish the commit it was built from, and add a probe that fails the gate when what is running differs from the ref it should match.

**Architecture:** Docker build args carry `GIT_SHA` and `BUILT_AT` into each image as environment variables. A small pure module in each app turns those into `{ revision, builtAt }`, which two HTTP endpoints publish. `scripts/probes/deploy-drift.sh` fetches those endpoints, compares each `revision` against the git ref that target is supposed to match, and fails loudly on drift, on an unreadable answer, and on any failure to reach the endpoint at all.

**Tech Stack:** Node 20 / Express (backend), Next.js App Router + ts-jest (web-app), bash + curl + node (probe), Docker multi-stage builds, GitHub Actions (`build-images.yml`).

**Spec:** `docs/superpowers/specs/2026-08-14-runtime-deploy-drift-design.md`

## Global Constraints

- **Probe exit contract** (`scripts/probes/_lib.sh:3`): `0=PASS 1=FAIL 2=BLOCKED 3=PENDING`. Use the helpers `pass` / `fail` / `blocked` / `pending`. *"A probe that cannot run must say WHY on stdout — never pass vacuously."*
- **An absent build value must surface as `null`, never `"unknown"` / `"dev"` / `""`.** The probe must be able to tell "this build does not know what it is" apart from "this build is a commit I can compare".
- **Never modify the `version` field of `/api/health`.** `apps/backend/__tests__/integration/production-smoke.test.js:192` asserts `version === '3.0.0'`. It stays a hardcoded string and that is recorded as out of scope in the spec §2.
- **Unreachable endpoint = FAIL, never PASS.** Same contract as `scripts/probes/no-secret.sh` when gitleaks is absent.
- **Missing tool (`curl`, `node`) = BLOCKED (exit 2), not FAIL.** "The tool could not run" is not a verdict about the deployment — `full-gate.sh:1009` already draws this line for gitleaks.
- **`ARG`/`ENV` for build values go as late in each Dockerfile as possible.** Their value changes every commit; placing them early invalidates the layer cache for everything below, and a slow build is a build people route around.
- **Docker is NOT installed on the Windows dev machine.** Tasks 1–4 are testable there with `node`; Task 5 runs on the Linux staging box (`ubuntu@43.134.175.51`).
- **GitHub Actions minutes are exhausted.** Images may have to be built on the box with `docker build`. Task 5 proves that path works *before* the probe is allowed to block anything.
- **Registry row ships as `manual-until:2026-08-28`, not `ci`.** `scripts/ci/probe-gate.js` enforces the expiry, so the interim cannot become permanent.
- **Run `bash scripts/probes/tier-check.sh` AFTER committing each task, before writing its report.** It reads the committed diff against `origin/main`, not the index: run on staged-but-uncommitted files it answers `(no changed files) TIER=A`, which is not a tier, it is silence. Measured 2026-08-14 on a single Dockerfile change — `TIER=A` staged, `TIER=C` once committed. CLAUDE.md L5: *"tier ตัดสินโดย `scripts/probes/tier-check.sh` เท่านั้น ห้ามประเมินเอง"* — and this plan broke that rule in its own header. Measured 2026-08-14 after Task 1 was committed: **`TIER=C`, not B.** `.github/workflows/build-images.yml` and `apps/backend/Dockerfile` classify as `infra`, and one Tier C file makes the whole change Tier C. So **Tasks 1 and 2 are operator-merge** and need the full §5 evidence pack with RED pasted before GREEN is claimed. Do not assume Tasks 3–5 are lower — measure them too.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/backend/shared/build-info.js` | **create** — pure: env → `{ revision, builtAt }`, null-normalising |
| `apps/backend/__tests__/unit/build-info.test.js` | **create** — unit tests for the above |
| `apps/backend/routes/api/index.js:379-394` | **modify** — `/api/health` publishes the two new fields |
| `apps/backend/Dockerfile` | **modify** — accept and bake `GIT_SHA` / `BUILT_AT` in the runner stage |
| `apps/web-app/src/lib/build-info.ts` | **create** — same pure function, TypeScript |
| `apps/web-app/src/lib/__tests__/build-info.test.ts` | **create** — unit tests |
| `apps/web-app/src/app/api/version/route.ts` | **create** — thin handler wrapping `buildInfo()` |
| `apps/web-app/Dockerfile` | **modify** — accept and bake the same two args in the runner stage |
| `.github/workflows/build-images.yml` | **modify** — pass `build-args` to both jobs |
| `scripts/probes/deploy-targets.txt` | **create** — the target list, data not code |
| `scripts/probes/deploy-drift.sh` | **create** — the probe |
| `scripts/probes/tests/deploy-drift.selftest.sh` | **create** — hermetic selftest with a fake `curl`. **In a subdirectory on purpose:** `scripts/ci/probe-gate.js:138` treats every `scripts/probes/*.sh` except `_lib.sh` as a probe and demands a registry row for it, so a selftest sitting beside its target would be registered as a checker it is not. `readdirSync` is not recursive, so `tests/` is invisible to that scan. |
| `scripts/probes/probe-registry.txt` | **modify** — one row (operator signs) |
| `scripts/ci/full-gate-checks.txt` | **modify** — one `check` row |
| `scripts/ci/full-gate.sh` | **modify** — `do_deploy_drift` |
| `scripts/ci/local-gate.sh` | **modify** — one `step` line |
| `docs/operations/runbooks/build-images-on-the-box.md` | **create** — the no-Actions build path, written from a run that actually happened |

The two `build-info` modules are deliberately duplicated rather than shared: they live in different languages and different build systems, and `packages/` is not wired into the web-app's ts-jest transform. Twelve lines each, each with its own test, is cheaper and safer than a cross-workspace dependency for this.

---

### Task 1: Backend publishes the commit it was built from

**Files:**
- Create: `apps/backend/shared/build-info.js`
- Create: `apps/backend/__tests__/unit/build-info.test.js`
- Modify: `apps/backend/routes/api/index.js:379-394`
- Modify: `apps/backend/Dockerfile` (runner stage, after line 109 `ENV PORT=8000`)
- Modify: `.github/workflows/build-images.yml` (backend job, the `build-push-action` step at line ~87)

**Interfaces:**
- Produces: `require('../shared/build-info')` → `{ buildInfo }` where `buildInfo(): { revision: string|null, builtAt: string|null }`. Task 3's probe consumes the JSON shape `{ "revision": "<sha>"|null, "builtAt": "<iso>"|null }` from `GET /api/health`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/__tests__/unit/build-info.test.js`:

```js
/**
 * The deploy-drift probe compares this value against a git ref. Everything here
 * protects one distinction: "this build does not know what it is" (null) must not
 * look like "this build is some commit" (a string). A placeholder like "unknown"
 * compares unequal to every real SHA, so it reads as drift and sends somebody
 * chasing a deploy that already happened.
 */
const { buildInfo } = require('../../shared/build-info');

describe('buildInfo', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it('reports the commit from GIT_SHA', () => {
        process.env.GIT_SHA = '93aeb9591f0e4c2b8a7d6e5f4c3b2a1908070605';
        expect(buildInfo().revision).toBe('93aeb9591f0e4c2b8a7d6e5f4c3b2a1908070605');
    });

    it('reports the build time from BUILT_AT', () => {
        process.env.BUILT_AT = '2026-08-14T07:46:09Z';
        expect(buildInfo().builtAt).toBe('2026-08-14T07:46:09Z');
    });

    it('reports null when GIT_SHA was never set', () => {
        delete process.env.GIT_SHA;
        expect(buildInfo().revision).toBeNull();
    });

    it('reports null when GIT_SHA is empty — an ARG with no value expands to ""', () => {
        process.env.GIT_SHA = '';
        expect(buildInfo().revision).toBeNull();
    });

    it('reports null when GIT_SHA is only whitespace', () => {
        process.env.GIT_SHA = '   ';
        expect(buildInfo().revision).toBeNull();
    });

    it('trims a trailing newline — shell substitution in a build arg leaves one', () => {
        process.env.GIT_SHA = '93aeb959\n';
        expect(buildInfo().revision).toBe('93aeb959');
    });

    it('never invents a placeholder for an absent value', () => {
        delete process.env.GIT_SHA;
        delete process.env.BUILT_AT;
        expect(buildInfo()).toEqual({ revision: null, builtAt: null });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/build-info.test.js`
Expected: FAIL — `Cannot find module '../../shared/build-info'`

- [ ] **Step 3: Write the minimal implementation**

Create `apps/backend/shared/build-info.js`:

```js
'use strict';

/**
 * What commit is this process running?
 *
 * apps/backend/Dockerfile bakes GIT_SHA and BUILT_AT into the image at build
 * time. Nothing else sets them, so outside a built image both are absent and
 * both must read as null — see the test for why a placeholder string is worse
 * than nothing here.
 */
function readEnv(name) {
    const raw = process.env[name];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed === '' ? null : trimmed;
}

function buildInfo() {
    return {
        revision: readEnv('GIT_SHA'),
        builtAt: readEnv('BUILT_AT'),
    };
}

module.exports = { buildInfo };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/build-info.test.js`
Expected: PASS — 7 tests

- [ ] **Step 5: Publish the fields from `/api/health`**

In `apps/backend/routes/api/index.js`, add the require next to the two at lines 376-377:

```js
const { buildInfo } = require('../../shared/build-info');
```

Then replace the response body inside the handler at line 384:

```js
      const build = buildInfo();

      res.status(overallSuccess ? 200 : 503).json({
        success: overallSuccess,
        // Hardcoded on purpose and out of scope here: production-smoke.test.js:192
        // asserts this exact string. `revision` below is the field that actually
        // says what is deployed.
        version: '3.0.0',
        revision: build.revision,
        builtAt: build.builtAt,
        database: 'postgresql',
        dbStatus: dbHealth,
        message: overallSuccess ? 'GACP API v3.0 is running' : 'System Unhealthy',
      });
```

- [ ] **Step 6: Prove the existing contract did not move**

Run: `cd apps/backend && npx jest __tests__/integration/production-smoke.test.js`
Expected: PASS. If `version` assertions fail, the edit touched a field it must not — revert to `'3.0.0'`.

> The wiring itself (does the real route emit `revision`?) is **not** proven by jest — `production-smoke.test.js:116` builds its own mimic app, not this router, and booting the real router needs Postgres. It is proven by `curl` in Task 5, and that is the only place it is claimed.

- [ ] **Step 7: Carry the values into the image**

In `apps/backend/Dockerfile`, immediately after line 109 (`ENV PORT=8000`) and before `EXPOSE 8000`:

```dockerfile
# Build identity. LAST on purpose: these change on every commit, so anything
# below them rebuilds every time. Everything expensive is already above.
# Unset expands to "", which shared/build-info.js normalises to null.
ARG GIT_SHA=""
ARG BUILT_AT=""
ENV GIT_SHA=${GIT_SHA}
ENV BUILT_AT=${BUILT_AT}
```

- [ ] **Step 8: Pass them from CI**

In `.github/workflows/build-images.yml`, in the backend `docker/build-push-action` step (the one whose `labels:` is at line 88), add:

```yaml
          build-args: |
            GIT_SHA=${{ github.sha }}
            BUILT_AT=${{ github.event.repository.updated_at }}
```

- [ ] **Step 9: Commit**

```bash
git add apps/backend/shared/build-info.js apps/backend/__tests__/unit/build-info.test.js apps/backend/routes/api/index.js apps/backend/Dockerfile .github/workflows/build-images.yml
git commit -m "feat(health): report the commit the backend was built from"
```

---

### Task 2: Frontend publishes the commit it was built from

**Files:**
- Create: `apps/web-app/src/lib/build-info.ts`
- Create: `apps/web-app/src/lib/__tests__/build-info.test.ts`
- Create: `apps/web-app/src/app/api/version/route.ts`
- Modify: `apps/web-app/Dockerfile` (runner stage, after line 74 `COPY ... .next/static`)
- Modify: `.github/workflows/build-images.yml` (web-app job, the step whose `labels:` is at line 148)

**Interfaces:**
- Consumes: nothing from Task 1 — same shape, separate implementation (see File Structure for why).
- Produces: `GET /api/version` → `{ "revision": string|null, "builtAt": string|null }`, the second target Task 3's probe reads.

- [ ] **Step 1: Write the failing test**

Create `apps/web-app/src/lib/__tests__/build-info.test.ts`:

```ts
/**
 * Mirror of apps/backend/__tests__/unit/build-info.test.js. The deploy-drift probe
 * must be able to tell "this build does not know what it is" (null) from "this
 * build is some commit" (a string); a placeholder would collapse the two.
 */
import { buildInfo } from '../build-info';

describe('buildInfo', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it('reports the commit from GIT_SHA', () => {
        process.env.GIT_SHA = '93aeb9591f0e4c2b8a7d6e5f4c3b2a1908070605';
        expect(buildInfo().revision).toBe('93aeb9591f0e4c2b8a7d6e5f4c3b2a1908070605');
    });

    it('reports the build time from BUILT_AT', () => {
        process.env.BUILT_AT = '2026-08-14T07:46:09Z';
        expect(buildInfo().builtAt).toBe('2026-08-14T07:46:09Z');
    });

    it('reports null when GIT_SHA was never set', () => {
        delete process.env.GIT_SHA;
        expect(buildInfo().revision).toBeNull();
    });

    it('reports null when GIT_SHA is empty — an ARG with no value expands to ""', () => {
        process.env.GIT_SHA = '';
        expect(buildInfo().revision).toBeNull();
    });

    it('never invents a placeholder for an absent value', () => {
        delete process.env.GIT_SHA;
        delete process.env.BUILT_AT;
        expect(buildInfo()).toEqual({ revision: null, builtAt: null });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-app && npx jest src/lib/__tests__/build-info.test.ts`
Expected: FAIL — cannot resolve `../build-info`

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web-app/src/lib/build-info.ts`:

```ts
/**
 * What commit is this server running?
 *
 * apps/web-app/Dockerfile bakes GIT_SHA and BUILT_AT into the runner stage.
 * Deliberately NOT a NEXT_PUBLIC_* variable: those are inlined into the client
 * bundle at build time, and this value has no business in the browser.
 */
export interface BuildInfo {
    revision: string | null;
    builtAt: string | null;
}

function readEnv(name: string): string | null {
    const raw = process.env[name];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed === '' ? null : trimmed;
}

export function buildInfo(): BuildInfo {
    return {
        revision: readEnv('GIT_SHA'),
        builtAt: readEnv('BUILT_AT'),
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-app && npx jest src/lib/__tests__/build-info.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Add the route**

Create `apps/web-app/src/app/api/version/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { buildInfo } from '@/lib/build-info';

/**
 * force-dynamic is load-bearing, not boilerplate. Without it Next evaluates this
 * handler during `next build` and freezes the result into the standalone output —
 * so the image would forever report the BUILDER stage's environment, which is the
 * empty value this endpoint exists to distinguish from a real commit. The bug
 * would be invisible: the endpoint answers 200 with a well-formed body that is
 * simply always wrong.
 */
export const dynamic = 'force-dynamic';

export function GET() {
    return NextResponse.json(buildInfo());
}
```

If `@/lib/...` does not resolve, use a relative import — check `apps/web-app/tsconfig.json` `compilerOptions.paths` and match whatever the neighbouring routes under `src/app/api/session/` already do.

- [ ] **Step 6: Carry the values into the image**

In `apps/web-app/Dockerfile`, in the **runner** stage after line 74 (the `.next/static` COPY) and before `EXPOSE 3000`:

```dockerfile
# Build identity — runner stage only. Putting these in the BUILDER stage would
# bake them into the compiled output instead of the process environment, and the
# route reads them at request time. Placed last: their value changes every commit.
ARG GIT_SHA=""
ARG BUILT_AT=""
ENV GIT_SHA=${GIT_SHA}
ENV BUILT_AT=${BUILT_AT}
```

- [ ] **Step 7: Pass them from CI**

In `.github/workflows/build-images.yml`, in the web-app `docker/build-push-action` step (the one whose `labels:` is at line 148), extend the existing `build-args:` block — it already carries `NEXT_PUBLIC_*` values, so append rather than replace:

```yaml
            GIT_SHA=${{ github.sha }}
            BUILT_AT=${{ github.event.repository.updated_at }}
```

- [ ] **Step 8: Run the web-app suite to prove nothing regressed**

Run: `cd apps/web-app && npx jest --ci`
Expected: no new failures compared to the same command on `main`. Record both counts — `main` is not green, so the bar is "no worse", not "green".

- [ ] **Step 9: Commit**

```bash
git add apps/web-app/src/lib/build-info.ts apps/web-app/src/lib/__tests__/build-info.test.ts apps/web-app/src/app/api/version/route.ts apps/web-app/Dockerfile .github/workflows/build-images.yml
git commit -m "feat(web): report the commit the frontend was built from"
```

---

### Task 3: The `deploy-drift` probe

**Files:**
- Create: `scripts/probes/deploy-targets.txt`
- Create: `scripts/probes/deploy-drift.sh`
- Create: `scripts/probes/tests/deploy-drift.selftest.sh` — the `tests/` subdirectory is required, not cosmetic; see File Structure

**Interfaces:**
- Consumes: `GET <url>` returning `{"revision": string|null, ...}` from Tasks 1 and 2.
- Produces: `scripts/probes/deploy-drift.sh`, exit `0` PASS / `1` FAIL / `2` BLOCKED. Task 4 wires this into three gates. Honours `DEPLOY_TARGETS_FILE` to override the target list (used by the selftest).

- [ ] **Step 1: Write the target list**

Create `scripts/probes/deploy-targets.txt`:

```
# deploy-targets.txt — what is deployed where, and which ref it must match.
#
# DATA, not code: hosts and refs change without the probe's logic changing, and a
# URL compiled into a shell script is the hardcode this project treats as a defect.
#
# FORMAT (3 fields, '|' separated):  <name> | <url> | <git ref it must match>
# Lines starting with # and blank lines are ignored. A file with no rows is a
# FAIL, not a pass — a drift probe that checked nothing has learned nothing.
#
# Provenance 2026-08-14: `docker ps` on 43.134.175.51 showed gacp-frontend-staging
# built 2026-07-23 while origin/deploy/production's head 78f26732 is dated
# 2026-08-03, matching gacp-frontend's build date. So on the first run the
# production rows are expected to PASS and the staging rows to FAIL.

staging-backend  | https://staging.gacpth.com/api/health  | origin/main
staging-frontend | https://staging.gacpth.com/api/version | origin/main
prod-backend     | https://gacpth.com/api/health          | origin/deploy/production
prod-frontend    | https://gacpth.com/api/version         | origin/deploy/production
```

- [ ] **Step 2: Write the failing selftest**

Create `scripts/probes/tests/deploy-drift.selftest.sh`:

```bash
#!/usr/bin/env bash
# Selftest for scripts/probes/deploy-drift.sh — hermetic, no real network.
#
# WHY IT LIVES IN tests/ RATHER THAN BESIDE ITS TARGET: probe-gate.js:138 treats
# every scripts/probes/*.sh except _lib.sh as a probe and fails the gate for any
# without a registry row. A selftest is not a checker of the system, so giving it
# a row would be a lie in the one file that is supposed to be the register of
# what checks what. readdirSync does not recurse, so a subdirectory is out of scope.
#
# A fake `curl` first on PATH serves canned bodies. The rule learned from
# gacp-backup.selftest.sh on 2026-08-14: a stub that is kinder than production
# makes the test lie. So the fake curl fails the way curl fails (a non-zero exit
# with no body, as with exit 28 on timeout) rather than returning an empty success.
#
# Run:  bash scripts/probes/tests/deploy-drift.selftest.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="$ROOT/scripts/probes/deploy-drift.sh"

pass=0; fail=0
ok()  { printf '  PASS  %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL  %s\n' "$1"; printf '        %s\n' "$2"; fail=$((fail + 1)); }

HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"

# $1=dir  $2=body for every URL  $3=curl exit code
make_fake_curl() {
    local bin="$1" body="$2" code="${3:-0}"
    mkdir -p "$bin"
    { printf '#!/usr/bin/env bash\n'
      printf 'exit_code=%s\n' "$code"
      printf '[ "$exit_code" != "0" ] && exit "$exit_code"\n'
      printf 'cat <<%s\n%s\n%s\n' 'CURLBODY' "$body" 'CURLBODY'
    } > "$bin/curl"
    chmod +x "$bin/curl"
}

run_probe() { # $1=bin dir  $2=targets file
    PATH="$1:$PATH" DEPLOY_TARGETS_FILE="$2" bash "$TARGET" 2>&1
}

# ── A. revision matches the ref ──────────────────────────────────────────────
T="$(mktemp -d)"
printf 'only | https://example.invalid/api/health | HEAD\n' > "$T/targets.txt"
make_fake_curl "$T/bin" "{\"revision\":\"$HEAD_SHA\",\"builtAt\":\"2026-08-14T00:00:00Z\"}"
out="$(run_probe "$T/bin" "$T/targets.txt")"; rc=$?
[ "$rc" = "0" ] && ok "revision ตรงกับ ref ⇒ PASS" || bad "revision ตรงกับ ref ⇒ PASS" "exit $rc — $out"

# ── B. revision is a different commit ────────────────────────────────────────
T="$(mktemp -d)"
printf 'only | https://example.invalid/api/health | HEAD\n' > "$T/targets.txt"
make_fake_curl "$T/bin" '{"revision":"0000000000000000000000000000000000000000"}'
out="$(run_probe "$T/bin" "$T/targets.txt")"; rc=$?
if [ "$rc" = "1" ] && printf '%s' "$out" | grep -q '0000000'; then
    ok "revision ต่างจาก ref ⇒ FAIL และบอก sha ที่เจอ"
else
    bad "revision ต่างจาก ref ⇒ FAIL และบอก sha ที่เจอ" "exit $rc — $out"
fi

# ── C. revision is null ──────────────────────────────────────────────────────
T="$(mktemp -d)"
printf 'only | https://example.invalid/api/health | HEAD\n' > "$T/targets.txt"
make_fake_curl "$T/bin" '{"revision":null}'
out="$(run_probe "$T/bin" "$T/targets.txt")"; rc=$?
[ "$rc" = "1" ] && ok "revision เป็น null ⇒ FAIL" || bad "revision เป็น null ⇒ FAIL" "exit $rc — $out"

# ── D. endpoint unreachable — the case that must never pass ──────────────────
T="$(mktemp -d)"
printf 'only | https://example.invalid/api/health | HEAD\n' > "$T/targets.txt"
make_fake_curl "$T/bin" '' 28
out="$(run_probe "$T/bin" "$T/targets.txt")"; rc=$?
if [ "$rc" = "1" ] && printf '%s' "$out" | grep -qi 'reach\|network'; then
    ok "ยิงไม่ถึง ⇒ FAIL และบอกว่าเป็นเรื่องเครือข่าย"
else
    bad "ยิงไม่ถึง ⇒ FAIL และบอกว่าเป็นเรื่องเครือข่าย" "exit $rc — $out"
fi

# ── E. empty target list must not pass ───────────────────────────────────────
T="$(mktemp -d)"
printf '# ทุกบรรทัดเป็นคอมเมนต์\n\n' > "$T/targets.txt"
make_fake_curl "$T/bin" '{"revision":"whatever"}'
out="$(run_probe "$T/bin" "$T/targets.txt")"; rc=$?
[ "$rc" = "1" ] && ok "ไม่มีเป้าหมายให้ตรวจ ⇒ FAIL ไม่ใช่ PASS" || bad "ไม่มีเป้าหมายให้ตรวจ ⇒ FAIL ไม่ใช่ PASS" "exit $rc — $out"

# ── F. missing target file must not pass ─────────────────────────────────────
T="$(mktemp -d)"
make_fake_curl "$T/bin" '{"revision":"whatever"}'
out="$(run_probe "$T/bin" "$T/no-such-file.txt")"; rc=$?
[ "$rc" = "1" ] && ok "ไฟล์เป้าหมายหาย ⇒ FAIL" || bad "ไฟล์เป้าหมายหาย ⇒ FAIL" "exit $rc — $out"

# ── G. curl absent is BLOCKED, not FAIL ──────────────────────────────────────
# An empty PATH dir plus a PATH that contains ONLY it: `command -v curl` finds
# nothing. Separating "the tool is missing" from "the deployment is wrong" is the
# same line full-gate.sh:1009 draws for gitleaks.
T="$(mktemp -d)"; mkdir -p "$T/bin"
printf 'only | https://example.invalid/api/health | HEAD\n' > "$T/targets.txt"
out="$(PATH="$T/bin" DEPLOY_TARGETS_FILE="$T/targets.txt" bash "$TARGET" 2>&1)"; rc=$?
[ "$rc" = "2" ] && ok "ไม่มี curl ⇒ BLOCKED (exit 2)" || bad "ไม่มี curl ⇒ BLOCKED (exit 2)" "exit $rc — $out"

# ── H. one bad target among good ones still fails the run ────────────────────
T="$(mktemp -d)"
{ printf 'good | https://example.invalid/a | HEAD\n'
  printf 'bad  | https://example.invalid/b | refs/heads/no-such-branch-xyz\n'; } > "$T/targets.txt"
make_fake_curl "$T/bin" "{\"revision\":\"$HEAD_SHA\"}"
out="$(run_probe "$T/bin" "$T/targets.txt")"; rc=$?
[ "$rc" = "1" ] && ok "ref ที่ resolve ไม่ได้ ⇒ FAIL" || bad "ref ที่ resolve ไม่ได้ ⇒ FAIL" "exit $rc — $out"

echo ""
echo "=== ผล: PASS=$pass FAIL=$fail ==="
[ "$fail" = "0" ]
```

- [ ] **Step 3: Run the selftest to verify it fails**

Run: `bash scripts/probes/tests/deploy-drift.selftest.sh`
Expected: every case FAILs — `scripts/probes/deploy-drift.sh` does not exist yet, so `bash` reports "No such file or directory" and the exit codes are 127, not 0/1/2.

- [ ] **Step 4: Write the probe**

Create `scripts/probes/deploy-drift.sh`:

```bash
#!/usr/bin/env bash
# deploy-drift — is what is RUNNING the commit it is supposed to be?
#
# WHY THIS EXISTS: on 2026-08-14 gacp-frontend-staging was running an image built
# 2026-07-23 — two days before the data-sovereignty audit that removed 29 outbound
# flows. Source had been clean for three weeks. Every gate in this repository reads
# files in the repo, so not one of them could see it, and the runbook that recorded
# the same fact on 2026-08-05 changed nothing in nine days.
#
# CONTRACT (scripts/probes/_lib.sh): 0 PASS · 1 FAIL · 2 BLOCKED · 3 PENDING.
# Unreachable is FAIL, not PASS: a check that quietly passes when it did not run
# is the failure this repository keeps re-learning. A MISSING TOOL is BLOCKED,
# because "curl is not installed" says nothing about the deployment.
set -u
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

TARGETS="${DEPLOY_TARGETS_FILE:-$ROOT/scripts/probes/deploy-targets.txt}"

command -v curl >/dev/null 2>&1 \
    || blocked "curl is not installed on this machine, so no endpoint was contacted and nothing was learned about what is deployed"
command -v node >/dev/null 2>&1 \
    || blocked "node is not installed on this machine — it parses the JSON reply; nothing was learned about what is deployed"

[ -r "$TARGETS" ] \
    || fail "cannot read $TARGETS — a drift probe with no target list would report PASS having contacted nothing"

rows="$(grep -vE '^[[:space:]]*(#|$)' "$TARGETS" 2>/dev/null || true)"
[ -n "$rows" ] \
    || fail "$TARGETS contains no target rows — refusing to pass having contacted nothing"

# Compare against the REMOTE refs, not whatever this checkout last saw. A stale
# origin/main turns a real drift into a false PASS, which is the one direction
# this probe must never be wrong in.
git -C "$ROOT" fetch --quiet origin 2>/dev/null \
    || fail "git fetch origin failed, so the refs to compare against are stale — this is a network fault, not a verdict about the deployment"

# Read `revision` out of a JSON body. node, not grep: a lexical match would find
# the string inside any other field and report a value nobody published.
extract_revision() {
    node -e '
        let s = "";
        process.stdin.on("data", (d) => { s += d; });
        process.stdin.on("end", () => {
            let v;
            try { v = JSON.parse(s).revision; } catch { process.exit(9); }
            if (v === null) { process.stdout.write("NULL"); return; }
            if (typeof v !== "string") { process.exit(8); }
            process.stdout.write(v);
        });
    ' 2>/dev/null
}

problems=""
checked=0

while IFS='|' read -r name url ref; do
    name="$(printf '%s' "$name" | tr -d '[:space:]')"
    url="$(printf '%s'  "$url"  | tr -d '[:space:]')"
    ref="$(printf '%s'  "$ref"  | tr -d '[:space:]')"
    [ -n "$name" ] && [ -n "$url" ] && [ -n "$ref" ] || {
        problems="$problems
  malformed row (need 'name | url | ref'): ${name:-?} | ${url:-?} | ${ref:-?}"
        continue
    }

    expected="$(git -C "$ROOT" rev-parse --verify --quiet "$ref^{commit}" 2>/dev/null || true)"
    [ -n "$expected" ] || {
        problems="$problems
  $name: ref '$ref' does not resolve to a commit — the row names something that no longer exists"
        continue
    }

    body="$(curl -fsS --max-time 15 "$url" 2>/dev/null)" || {
        problems="$problems
  $name: could not reach $url (network or HTTP error) — NOT a verdict about the deployment, but not a pass either"
        continue
    }

    actual="$(printf '%s' "$body" | extract_revision)" || {
        problems="$problems
  $name: reply from $url is not JSON with a string-or-null 'revision' field"
        continue
    }

    checked=$((checked + 1))

    if [ "$actual" = "NULL" ]; then
        problems="$problems
  $name: reports revision=null — this image does not know which commit it was built from, so it cannot be checked. Rebuild it with --build-arg GIT_SHA=..."
        continue
    fi

    # A short SHA is a legal answer, so compare by prefix — but refuse anything
    # under 7 characters, where a prefix match stops meaning much.
    if [ "${#actual}" -lt 7 ]; then
        problems="$problems
  $name: revision '$actual' is too short to identify a commit"
        continue
    fi

    case "$expected" in
        "$actual"*) ;;
        *)
            behind="$(git -C "$ROOT" rev-list --count "$actual..$ref" 2>/dev/null || echo '?')"
            problems="$problems
  $name is NOT running $ref
      running:  $actual
      expected: $expected  ($ref)
      $behind commit(s) behind"
            ;;
    esac
done <<<"$rows"

[ -z "$problems" ] || fail "deployment does not match the repository:$problems"
pass "$checked target(s) run the commit they should ($TARGETS)"
```

- [ ] **Step 5: Run the selftest to verify it passes**

Run: `bash scripts/probes/tests/deploy-drift.selftest.sh`
Expected: `=== ผล: PASS=8 FAIL=0 ===` and exit 0.

If case D passes for the wrong reason — check the message actually names the network, not just that the exit code is 1. A probe that fails for an unrelated reason is the defect the first `gacp-backup.selftest.sh` shipped with.

- [ ] **Step 6: Commit**

```bash
git add scripts/probes/deploy-targets.txt scripts/probes/deploy-drift.sh scripts/probes/tests/deploy-drift.selftest.sh
git commit -m "feat(probe): fail the gate when what is running is not the commit it should be"
```

---

### Task 4: Wire the probe into the three gates

**Files:**
- Modify: `scripts/probes/probe-registry.txt` (append one row)
- Modify: `scripts/ci/full-gate-checks.txt` (append one `check` row)
- Modify: `scripts/ci/full-gate.sh` (add `do_deploy_drift` beside `do_probe_prisma_deps`, ~line 1013)
- Modify: `scripts/ci/local-gate.sh` (add one `step` line after line 22)

**Interfaces:**
- Consumes: `scripts/probes/deploy-drift.sh` from Task 3, exit 0/1/2.
- Produces: nothing later tasks depend on. `full-gate.sh` maps check id `deploy-drift` to the function `do_deploy_drift` (`full-gate.sh:1101`, `fn="do_${id//-/_}"`), so the names must correspond exactly.

- [ ] **Step 1: Register the probe — without this, `probe-gate.js` fails**

`scripts/ci/probe-gate.js:137-144` reads `scripts/probes/`, keeps every entry ending in `.sh` except `_lib.sh`, and fails for any of them without exactly one registry row. That is why Task 3 put the selftest in `scripts/probes/tests/` — `readdirSync` does not recurse, so only `deploy-drift.sh` needs a row here. Verified 2026-08-14; if that filter has since changed, re-read it before assuming.

Append to `scripts/probes/probe-registry.txt`:

```
deploy-drift           | manual-until:2026-08-28 | -                 | -        | เทียบ commit ที่แต่ละบริการรันอยู่จริงกับ ref ใน scripts/probes/deploy-targets.txt · manual-until เพราะการทำให้ staging ไม่ค้างต้อง build image ซึ่ง Actions นาทีหมด ⇒ ต้องพิสูจน์ docker build บนเครื่องก่อน (แผนงาน Task 5) แล้วจึงเปลี่ยนเป็น ci · spec: docs/superpowers/specs/2026-08-14-runtime-deploy-drift-design.md
```

> **The row cannot be committed with `-` in the signed-by column.** `probe-gate.js:111-112` fails any row whose `run` is not `ci` unless that column reads exactly `operator`, so a placeholder would take the gate red rather than parking the probe. Write the row with `operator` **only after** the operator has said yes to it in writing, and record where they said it. The word in the file is the record of their decision, not a substitute for it (CLAUDE.md L6). If they have not decided yet, do not add the file to the commit at all — a probe with no row also fails the gate (`probe-gate.js:144`), so this task is atomic with their answer.

- [ ] **Step 2: Run probe-gate to verify the registry accepts the row**

Run: `node scripts/ci/probe-gate.js`
Expected: PASS. A malformed row or a `manual-until` without a date is a FAIL by design (`probe-registry.txt:8-9`).

- [ ] **Step 3: Add the full-gate check row**

Append to `scripts/ci/full-gate-checks.txt`, after the `check | probe-prisma-deps` row:

```
check | deploy-drift          | advisory | compares the commit each deployed service reports against the ref it should match. advisory until docker build on the box is proven (probe-registry.txt manual-until:2026-08-28); promote to required in the same change that flips the registry row.
```

`advisory` is correct here for the same reason the file's own header gives: a `required` check whose remediation path is not yet proven "would go red for a reason nobody decided".

- [ ] **Step 4: Add the dispatch function**

In `scripts/ci/full-gate.sh`, immediately after `do_probe_prisma_deps()` (which ends around line 1025):

```bash
do_deploy_drift() {
    (cd "$WORK" && PROBE_OUT_DIR="$ARTIFACT_DIR" bash scripts/probes/deploy-drift.sh)
    local c=$?
    [ "$c" = "0" ] && return 0
    # 2 and 3 are "could not run", which full-gate records as not-run rather than
    # as a verdict — same mapping do_probe_prisma_deps uses.
    [ "$c" = "2" ] || [ "$c" = "3" ] && { REASON="deploy-drift could not run (no curl/node, or git fetch failed) — see log"; return 2; }
    REASON="a deployed service is not running the commit it should — see log"; return 1
}
```

Note: no `DATABASE_URL` — this probe never touches a database.

- [ ] **Step 5: Add it to local-gate**

In `scripts/ci/local-gate.sh`, after line 22 (`step probe-gate ...`):

```bash
step deploy-drift   bash scripts/probes/deploy-drift.sh
```

- [ ] **Step 6: Run local-gate and compare against main's baseline**

`main` is not green. Establish the baseline first, then compare:

```bash
git stash && bash scripts/ci/local-gate.sh > /tmp/gate-main.txt 2>&1; echo "main exit=$?"; git stash pop
bash scripts/ci/local-gate.sh > /tmp/gate-branch.txt 2>&1; echo "branch exit=$?"
diff <(grep -E '^\[local-gate\]' /tmp/gate-main.txt) <(grep -E '^\[local-gate\]' /tmp/gate-branch.txt)
```

Expected: the only difference is the new `deploy-drift` line. On a machine with no network reachability to the endpoints it will read `FAIL` — that is the designed behaviour, and it is why the registry row is `manual-until` and the full-gate row is `advisory`. Record the actual line; do not describe it from memory.

- [ ] **Step 7: Commit**

```bash
git add scripts/probes/probe-registry.txt scripts/ci/full-gate-checks.txt scripts/ci/full-gate.sh scripts/ci/local-gate.sh
git commit -m "feat(gate): wire deploy-drift into probe-gate, full-gate and local-gate"
```

---

### Task 5: Prove it on the box — build, deploy, observe

This task runs on `ubuntu@43.134.175.51`. It is the only place the endpoint wiring and the local build path are claimed, because it is the only place either can be observed. Nothing in Tasks 1–4 may be reported as working end to end before this task's output exists.

**Files:**
- Create: `docs/operations/runbooks/build-images-on-the-box.md` — written *from* the run below, not before it
- Create: `evidence/deploy-drift/INDEX.md` plus the raw outputs

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: the evidence pack the branch's DoD requires (CLAUDE.md §5 tier B).

- [ ] **Step 1: Capture the RED — the current staging deployment**

Endpoints do not exist yet on the deployed images, so this records the starting state:

```bash
cd /tmp && curl -fsS https://staging.gacpth.com/api/health | head -c 400; echo; curl -fsS -o /dev/null -w 'version endpoint: HTTP %{http_code}\n' https://staging.gacpth.com/api/version
```

Expected: `/api/health` answers with `version: "3.0.0"` and **no** `revision` field; `/api/version` returns 404. Save the output.

- [ ] **Step 2: Build both images on the box, without GitHub Actions**

```bash
cd /tmp && rm -rf /tmp/gacp-build && git clone -q -b feat/runtime-deploy-drift git@github.com:jonmaxmore/GACP-Certification-Application.git /tmp/gacp-build && cd /tmp/gacp-build && SHA=$(git rev-parse HEAD) && TS=$(date -u +%Y-%m-%dT%H:%M:%SZ) && docker build -f apps/backend/Dockerfile --build-arg GIT_SHA=$SHA --build-arg BUILT_AT=$TS -t gacp-backend:local-$SHA . && echo "BACKEND BUILD OK"
```

```bash
cd /tmp/gacp-build && SHA=$(git rev-parse HEAD) && TS=$(date -u +%Y-%m-%dT%H:%M:%SZ) && docker build -f apps/web-app/Dockerfile --build-arg GIT_SHA=$SHA --build-arg BUILT_AT=$TS --build-arg NEXT_PUBLIC_API_URL=https://staging.gacpth.com/api -t gacp-frontend:local-$SHA . && echo "FRONTEND BUILD OK"
```

If either build fails, **stop and report the error** — the whole escape hatch in the spec §4 depends on this path working, and a plan that assumes it does without checking is the thing this task exists to prevent.

- [ ] **Step 3: Confirm the value reached the image without deploying anything**

```bash
SHA=$(git -C /tmp/gacp-build rev-parse HEAD); docker run --rm --entrypoint sh gacp-backend:local-$SHA -c 'echo "GIT_SHA=$GIT_SHA"; echo "BUILT_AT=$BUILT_AT"'
```

Expected: both printed, `GIT_SHA` equal to `$SHA`. This isolates "the build arg travelled" from "the endpoint reports it" — if the endpoint is later wrong, this says which half broke.

- [ ] **Step 4: Deploy staging following the existing runbook**

Follow `docs/operations/runbooks/deploy-staging-manual.md` §1 onward, substituting the locally built tags for the ghcr ones. Deploying is the operator's act (CLAUDE.md L5) — an agent proposes the commands and does not run them.

- [ ] **Step 5: Observe the endpoints**

```bash
cd /tmp && for u in https://staging.gacpth.com/api/health https://staging.gacpth.com/api/version https://gacpth.com/api/health https://gacpth.com/api/version; do printf '%-45s ' "$u"; curl -fsS --max-time 15 "$u" 2>&1 | head -c 200; echo; done
```

Expected: both staging endpoints report `revision` equal to the SHA built in Step 2. Both production endpoints still 404 / lack the field — production has not been rebuilt, and that is correct.

- [ ] **Step 6: Run the probe against reality**

```bash
cd /tmp/gacp-build && bash scripts/probes/deploy-drift.sh; echo "exit=$?"
```

Expected on this first real run: **FAIL**, naming the production rows (their images predate the endpoint, so `revision` is absent → the row reports the reply is not JSON with a `revision` field). Staging rows should pass if Step 5 showed matching SHAs.

This is the acceptance criterion from spec §4: the probe's first contact with reality must distinguish the two sides. If it reports everything green, the probe is wrong — not the fleet.

- [ ] **Step 7: Write the runbook from what actually happened**

Create `docs/operations/runbooks/build-images-on-the-box.md` containing the exact commands from Steps 2–4 **with their real output**, the wall-clock time each build took, and any error hit and how it was resolved. A runbook written from a run that happened is evidence; one written from a plan is a guess.

- [ ] **Step 8: Assemble the evidence pack**

Create `evidence/deploy-drift/INDEX.md` linking: the Step 1 RED output, the Step 2 build logs, the Step 3 env dump, the Step 5 endpoint replies, and the Step 6 probe run with its exit code. State plainly what is still unproven — production is not rebuilt, and no browser-level egress observation was performed (spec §6).

- [ ] **Step 9: Commit**

```bash
git add docs/operations/runbooks/build-images-on-the-box.md evidence/deploy-drift/
git commit -m "evidence(deploy-drift): built on the box, deployed staging, probe run against reality"
```

---

## After the plan

Two things stay with the operator and cannot be done by an agent:

1. **Sign the `probe-registry.txt` row.** The `run` and `waived` columns are operator-owned (CLAUDE.md L6).
2. **Flip `manual-until:2026-08-28` → `ci` and `advisory` → `required`,** in one change, once Task 5 has shown a local build and deploy working. Until then the probe reports without blocking, by design.
