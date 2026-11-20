# W2 — Workspace switching (identity/entity) fix — 2026-08-21

Source audit: `reports/design-cleanup-2026-08-21/01-IDENTITY-AND-VOCABULARY.md` §1 A, §2, §5 (U1-U4, B1).
Branch: `fix/design-reproducibility`. No `git add`/commit performed — all changes left in the working tree.

## B1 — active-entity header dropped by the proxy

**Verified locations (line drift from audit noted):**
- `apps/backend/middleware/active-entity-middleware.js:38` — `HEADER_NAME = 'x-active-entity-id'`; 403 body at :175-180 is `{success:false, error:'Forbidden', message:'...', code:'ACTIVE_ENTITY_MISMATCH'}`.
- `apps/web-app/src/lib/api/api-client.ts:259-268` and `:530-537` — both injection sites confirmed, header name `x-active-entity-id`, source `localStorage['gacp.activeEntityId']`.
- `apps/web-app/src/app/api/[...path]/route.ts:19-45` — proxy built headers from an empty map, copying only Content-Type/Authorization/X-User-ID. Confirmed the drop.
- `apps/web-app/src/app/api/auth/_lib/proxy-forward.ts:50-112` (`buildForwardHeaders`) — same gap, shared by `auth/health` and `auth/provider` proxies.

**Change:** forward `x-active-entity-id` verbatim in `route.ts` (~line 47-60) and in `buildForwardHeaders` (~line 87-98).

**RED:** new tests added first, run and confirmed failing against pre-fix source:
`route.test.ts` "forwards x-active-entity-id to the backend unchanged" and `proxy-forward.test.ts` (new file) both 404'd on `headers['x-active-entity-id']` being `undefined` before the fix (confirmed in the first batch run, `bepnp46zf.output`, before implementation landed).
**GREEN:** `route.test.ts`, new `proxy-forward.test.ts`, and a new case in `auth/health/[...path]/route.test.ts` all pass — see Evidence.

**Trap (stale localStorage → `403 ACTIVE_ENTITY_MISMATCH`):** `api-client.ts` had a real bug here: the generic 403 branch computed `rawCode = data.error || data.code`, and since the middleware's body carries `error:'Forbidden'`, the real code (`ACTIVE_ENTITY_MISMATCH`) was never surfaced and the blanket "re-login" copy fired instead (wrong — the session is fine). Fixed: `isActiveEntityMismatchBody()` checks the raw body's `.code` field directly (before the lossy harvest), clears the stale `gacp.activeEntityId` localStorage key, and returns an honest Thai message + `code: 'ACTIVE_ENTITY_MISMATCH'`. New test file `api-client-active-entity-mismatch.test.ts` covers both the recovery path and a negative case (plain 403 Forbidden must NOT clear storage / must NOT special-case).

## U1 — open the door

**Verified:** `nav-config.ts:146-154` (workspaces tile, tier `secondary`, unchanged).
**Change:** `labelTH: 'ทีมงาน'` → `'ผู้ยื่นคำขอ / ทีมงาน'`; `descTH` now names workspaces/applicant types explicitly. Key, href, tier untouched (no promotion — operator's call per N7/O2).
**RED:** new pin in `nav-config.test.ts` failed (`Expected: "ผู้ยื่นคำขอ / ทีมงาน" Received: "ทีมงาน"`), confirmed in isolation (`bashudulz.output`).
**GREEN:** passes post-fix.
**Pins checked, NOT touched:** `nav-config.test.ts:107` and `health-navigation-workspaces.test.ts:23-25` both pin `healthNavigation` (from `src/lib/constants.ts`), a *different* array whose `label` comes from a hardcoded `LEGACY_LABELS` map, independent of `FARMER_NAV.labelTH` (traced `constants.ts:75-140`). Confirmed via full run: both pins still pass unchanged — no test needed updating, and `constants.ts`/`health/layout.tsx` (the legacy sidebar) were correctly left alone (outside file ownership).

## U2 — wizard hint pointed at a dead control

**Verified:** `th-wizard.ts` `generalStep.workspace.switchHint` (was "ต้องการเปลี่ยน workspace? เลือกจากเมนูบนหัวเว็บ"), rendered by `general-step.tsx`'s `ActiveWorkspaceCard` (~364); disabled control confirmed at `entity-switcher.tsx` (`disabled={!isMulti}`).
**Change:** rewrote the hint (TH + EN) to describe the real path, and added a direct `<Link href="/health/workspaces">` next to it in `ActiveWorkspaceCard` (hardcoded TH/EN text via `language`, not a new dictionary key — stayed inside the "hint keys only" ownership line).
**RED/GREEN:** `general-step-workspace-honesty.test.tsx` "U2" case — confirmed the `a[href="/health/workspaces"]` assertion failed pre-fix (`bbfk6s7rm.output`), passes post-fix.

## U3 — unlabeled chip

**Verified:** `entity-switcher.tsx:162-173` (pill shows icon+name+role, only `title=` explained it) vs `dashboard-layout.tsx:167-168` (separate user name).
**Change:** added `aria-label="ยื่นในนาม <name>"` (+ "กดเพื่อสลับ workspace" when multi-workspace) and a visible `ยื่นในนาม` label span (sm+ breakpoints, matching the existing role-badge mobile-hide pattern). Did **not** touch `entity-service.js` (certificate holder name path, confirmed untouched). `dashboard-layout.tsx` needed no change — the chip is entirely self-contained in `entity-switcher.tsx`.
**RED/GREEN:** new `entity-switcher-workspace-identity.test.tsx` — confirmed failing (`ยื่นในนาม` absent) pre-fix, passing post-fix.

## U4 — dishonest failure states

**Verified:** `entity-switcher.tsx:106-113` vs `general-step.tsx:240-247` (else branch let the 3-way type selector stay clickable while `applications.js:1054` would silently overwrite the choice).
**Change:** both surfaces now agree — `entities.length===0`/`!activeEntity` after load resolves is treated as a load failure (per the Phase-68 "every user has a personal entity" invariant, never a legitimate empty state), showing "โหลดพื้นที่ทำงานไม่สำเร็จ" + a retry button that calls `refresh()`. In `general-step.tsx` the dead-end 3-way selector fallback (`TypeSelector` + `handleTypeChange`) was deleted entirely (unreachable/unsafe under the invariant) and replaced with loading/error states; `isNextDisabled` now blocks progress until a workspace resolves, plus a `handleNext` guard for defense in depth.
**RED/GREEN:** both new test files' "U4" cases confirmed RED pre-fix (old copy present / fallback selector present / Next enabled), GREEN post-fix.

## Verification run (final, all green)

```
Test Suites: 13 passed, 13 total
Tests:       87 passed, 87 total
```
Covers: `nav-config.test.ts`, `entity-switcher-workspace-identity.test.tsx` (new), `x6-b.test.tsx` (regression — entity-switcher source-grep pins untouched), `api-client-active-entity-mismatch.test.ts` (new), `api-client.test.ts`, `api-client-unavailable-copy.test.ts`, `entity-permission-denial.test.ts` (regressions), `proxy-forward.test.ts` (new), generic `route.test.ts`, `auth/health/[...path]/route.test.ts`, `auth/provider/[...path]/route.test.ts` (regression — untouched, still passes), `general-step-workspace-honesty.test.tsx` (new), `health-navigation-workspaces.test.ts` (regression, confirms U1 didn't need to touch the legacy label).

`npx tsc --noEmit -p tsconfig.json`: 62 lines of errors, all in `e2e-phase0/*.spec.ts` (pre-existing baseline) — zero new lines, zero errors in any touched file.
`eslint --max-warnings=0` on all 15 touched/created files: clean (0 errors, 0 warnings) after removing two now-unnecessary `eslint-disable-next-line no-var` comments the global setup didn't need.

## Live check

Stack not running (`localhost:3000` and `localhost:8000` both connection-refused at verification time) — the live farmer-login / header-arrival check from the task brief was **not performed**. This is PENDING, not claimed done (L1).

## Files changed

Modified:
- `apps/backend` — none (out of scope, untouched)
- `apps/web-app/src/lib/navigation/nav-config.ts`
- `apps/web-app/src/lib/navigation/__tests__/nav-config.test.ts`
- `apps/web-app/src/components/layout/entity-switcher.tsx`
- `apps/web-app/src/lib/api/api-client.ts`
- `apps/web-app/src/app/api/[...path]/route.ts`
- `apps/web-app/src/app/api/[...path]/route.test.ts`
- `apps/web-app/src/app/api/auth/_lib/proxy-forward.ts`
- `apps/web-app/src/app/api/auth/health/[...path]/route.test.ts`
- `apps/web-app/src/app/health/applications/new/_steps/steps/general-step.tsx`
- `apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts`
- `apps/web-app/src/lib/i18n/dictionaries/sections/en-wizard.ts`

Created:
- `apps/web-app/src/app/api/auth/_lib/proxy-forward.test.ts`
- `apps/web-app/src/components/layout/__tests__/entity-switcher-workspace-identity.test.tsx`
- `apps/web-app/src/lib/api/__tests__/api-client-active-entity-mismatch.test.ts`
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/general-step-workspace-honesty.test.tsx`
