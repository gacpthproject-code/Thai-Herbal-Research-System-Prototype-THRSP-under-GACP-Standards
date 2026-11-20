# staging walk 2026-09-30 — defect fixes (branch fix/staging-walk-0930, base main 37799f12)

Source of the defects: `~/work/state/staging-walk-2026-09-30/INDEX.md` (O1, O3, O4, and the Task-3 note P-GET). O2 (system language in the receipt footer) is the operator's decision and was not touched.

| id | commit | tier | RED → GREEN | view-pack |
|---|---|---|---|---|
| P-GET | fb2b572e | C (money: a read door wrote fee columns) | `p-get/red.txt` (updatedAt moved on GET, real postgres:17 on 127.0.0.1:5449 after migrate deploy of 146 migrations) → `p-get/green.txt` (25 preview/applications suites, 307 tests) | none (no UI) |
| O4 | 9f8a86a7 | C (finance paper template) | `o4/red.txt` ("บาท" ends at 568.49pt, past the 567.57pt printable edge) → `o4/green.txt` (11 suites, 130 tests) | `o4/receipt-tax-invoice-{before,after}{,-crop}.png`, `o4/invoice-{before,after}{,-crop}.png`; credit note and quotation unchanged (not clipped): `o4/*-unchanged.png` |
| O1 | e234d238 | B | `o1/red.txt` (1 save with no edit) → `o1/green.txt` (23 wizard suites, 236 tests, tsc 0) | `o1/o1-before-2a-*` (header "มีการเปลี่ยนแปลง (รอบันทึก)" 1.5 s after opening, no edit), `o1/o1-before-walk.json` (1 POST /applications/draft with no edit); `o1/o1-after-2a-*`, `o1/o1-after-2-*` ("พร้อมบันทึก", 0 POST after 8 s), `o1/o1-after-3/4-*` (a real edit → pending → 1 POST → "บันทึกแล้ว") |
| O3 | 902e4652 | C (payments page) | `o3/red.txt` (one "งวดที่ 1" section, ฿11,770) → `o3/green.txt` (61 suites, 510 tests, tsc 0) | `o3/o3-before-all-{light,dark}.png` vs `o3/o3-after-all-{light,dark}.png`, `o3/o3-after-filtered-light.png` (?app= still narrows), `o3/o3-after-all-*-sections.png` (crops) |

How the web view-packs were made: `next build` + `next start -p 3107` from this worktree, headless Chromium (Playwright), a health-role `auth_token` cookie shaped the way `src/middleware.ts` reads it, and every `/api/**` call answered by route fixtures (no backend, no staging/demo DB). The O1 "before" build had main's five O1 files; the O3 "before" build had the O1 fix but not O3.

## Fix round 1 (reviewer NEEDS FIXES, 2026-10-02)

| item | commit | RED → GREEN / evidence |
|---|---|---|
| I-1 (O1 regression: an unsent edit taken as saved) | 98c34117 | `o1/i1-red.txt` (edit → leave before debounce → return: 0 POST; IndexedDB rehydrate of an unsent edit: 0 POST; answer given during the server-draft fetch overwritten by the draft) → `o1/i1-green.txt` (each exactly 1 POST; fresh open of a saved draft still 0; 23 wizard suites, 242 tests) |
| M3 + M4 (P-GET comment; preview priced with the quotation's rule) | c812d347 | `p-get/m4-red.txt` (stored scope 3, nothing declared: preview 1 vs quotation 3) → `p-get/m-green.txt` (real postgres:17: preview == quotation for an undeclared and a declared row, and still no write) |
| M5 (dead `ensurePhase1FinancialDocuments` deleted) | eeb4759b | no callers in apps/ or scripts/ before deleting; `p-get/m-green.txt` (75 backend suites, 837 tests) |
| M6 (O3 RED: filter cases are guards) | 9e18d4d9 | `o3/red.txt` marks `?app=` / `?applicationId=` as GUARD |
| M7 (card header tokenised for dark mode) | 9e18d4d9 | `o3/o3-after-m7-all-{light,dark}{,-sections}.png`, `o3/m7-green.txt` (61 suites, 510 tests; computed header background light rgb(235,239,237) / dark rgb(33,44,38)) |

### For the operator (not implemented)
- Should submit stamp `phase1Amount` / `phase2Amount` / `cultivationScopeCount`? The live web doors `POST /api/applications/draft` and `/submit` (routes/api/applications/applications.js) do not. Only the legacy `/api/wizard/*` doors, `createPhase1Payment` and renewal-service do (file:line in `apps/backend/routes/api/preview/preview.js` header). No price depends on them today: the quotation and the preview both use `billableScopes` (shared/application-scope.js), and checkout prices from formData or the accepted quotation. No new money write was added.
- Seen, not fixed: an applicant who answers while the server-draft fetch is in flight can trigger an autosave (3 s debounce) of the near-empty store before the draft lands. This was already true on main. I-1 keeps the answer and re-sends the merged filing once the draft lands, but an early save could still reach the server first.

## Fix round 2 (2026-10-02)

| item | commit | RED → GREEN |
|---|---|---|
| I-1 (autosave during the resume fetch could blank the server draft; already on main) | 2979113f | `o1/r2-red.txt` (edit while GET /applications/draft is pending: a POST of the near-empty store left after 3 s) → `o1/r2-green.txt`: 0 POST while pending, then exactly 1 POST carrying the merged draft. No draft (200 null / 404) releases the held edit, which saves once. Also no save before IndexedDB answers |
| M2 (a save marked SYNCED even when the store had moved on) | 2979113f | edit during an in-flight save, leave, the save resolves, remount: before the fix 1 POST total (the second edit lost) → after it 2 (the second edit sent on remount) |

How the hold works: the store carries `resumePending`. It is bookkeeping only: not persisted (excluded by `partialize`), hash-exempt and never sent. The step page raises it before GET /applications/draft. It is lowered by the draft load (`hydrateDraft`) or by a definitive "no draft" (200 null / 404). It stays up on a 503 or a dropped request, because that does not mean "no draft" and saving then is exactly the defect. The page shows the retry card, a retry re-runs the fetch, and a reload starts clean because the flag is not persisted. Held answers are marked PENDING, so they are sent once the hold lifts.

Why there is no server change: the web autosave never sends `applicationId`. `answersForDraft` drops it (NOT_SENT_KEYS), so every legitimate autosave is a no-id POST that `findOrCreateApplicationForHealth` lands on the latest open draft. A server rule of "no id ⇒ an empty value may not overwrite a stored one" would therefore also refuse a real clear: an emptied plot list, a removed variety, a blanked note. Refusing a no-id POST that would land on an existing draft would refuse every autosave. The guard therefore stays in the client, where the cause is. If the server should be defended as well, the clean prerequisite is for the client to send the `applicationId` it holds, which turns the no-id path into a first-save-only path. That is a separate change, listed here for the operator.

## Fix round 3 (2026-10-02)

| item | commit | RED → GREEN |
|---|---|---|
| Stuck hold: a 503 left `resumePending` up; an edit-page load and a populated-store step page never lowered it, so every later save was dropped and submit filed the stale draft | 6d736390 | `o1/r3-red.txt` → `o1/r3-green.txt`. Two fixes lower the hold: `hydrateDraft` now does (store test), and so does the populated-store exit. Leaving the step page lowers a hold that page raised. A module-level attempt number makes a late answer from an old fetch be ignored: no load, no hold change (step-page tests). A stale hold cleared by a load, then one edit: exactly 1 POST (hook test) |
| Submit gate (defence in depth) | 6d736390 | `submitAndHandOver` first calls `ensureLatestDraftSaved(applicationId)`. If the store is about this application and not SYNCED, it saves through the mounted wizard (waiting for a save already in flight), or does one direct save when no wizard is on screen (the preview page). It refuses while the resume hold is up, or when the save fails: nothing is filed and the applicant sees "ยังบันทึกการแก้ไขล่าสุดไม่สำเร็จ กรุณาลองอีกครั้ง" (`DRAFT_NOT_SAVED_TH`). Both helpers share one payload builder (`buildDraftPayload`) |
| Minor 1: a held edit could move the baseline and then be dropped | 6d736390 | the hold check now runs before the "nothing changed" return; cancelling a scheduled save resets the baseline. Test: edit, hold raised within the debounce, 0 POST, hold lowered, 1 POST |
| Minor 2 | 6d736390 | `o1/r2-red.txt` re-captured: the shipped round-2 tests against e2b1eaf4 code, under the shipped rule (503 keeps the hold) |

## Fix round 4 (2026-10-02)

| item | commit | RED → GREEN |
|---|---|---|
| I-1: saves never named their application, so an edit to a REVISION_REQUESTED / CAR_PENDING filing went to the applicant's latest DRAFT (or minted one), and submit filed the edited application stale. Already true of the autosave on main | 27a6073a | `o1/r4-red.txt` → `o1/r4-green.txt`. `buildDraftPayload` sends the store's `applicationId` at the top level, for the autosave and the submit gate alike. It is still hash-exempt and still not in formData. A brand-new filing sends no id until its first save returns one |
| Server check (no server change) | 27a6073a | `draft-explicit-id-routes-to-its-application-real-postgres.test.js` on postgres:17 (127.0.0.1:5449, 146 migrations, container removed). An explicit id in REVISION_REQUESTED or CAR_PENDING updates that application and leaves the other DRAFT byte-identical. Without the id, the same edit lands on the latest DRAFT: the old misroute, pinned. An explicit id in a non-editable status gets 409 with nothing written (the Bug 2.3 guard, `applications.js` findOrCreateApplicationForHealth, editable = DRAFT / REVISION_REQUESTED / CAR_PENDING per `constants/applicant-editable-statuses.js`). No server status rule was widened |
| I-2: under StrictMode (dev) the draft never loaded | 27a6073a | the unmount cleanup that cancels an attempt now also resets `hydrationAttempted`, so the re-mount asks again. Test: render under `<React.StrictMode>`; the draft loads exactly once and the hold settles |

Defence in depth, revisited: round 2 kept the guard client-only because no autosave carried an id, so a server rule for id-less POSTs would have blocked real clears. Every save now carries its id once one exists, which makes the id-less path the first-save-only path. A server rule such as "an id-less POST may not land on an existing draft" is therefore now possible without touching legitimate clears. It is not implemented here; it is for the operator to decide.

Probes (re-run after fix round 4, tip 27a6073a): retired-words PASS · no-skip PASS · no-secret PASS (layer1 0 hits, gitleaks clean) · ratchet PASS hardcode=26 todo=53 env-direct=101 dup-source=0 · error-codes-source-pointers 5/5 · tier-check TIER=C · also themed-surface-tokens, settle-webhook-only, fee-single-source PASS.

Not run here: `LOCAL_GATE_FULL=1 scripts/ci/local-gate.sh`. The coordinator runs the full gate. Merge is the operator's (Tier C).

## Fix round 5 (2026-10-02)

| item | commit | RED → GREEN |
|---|---|---|
| Important (round-4 regression): after filing X, "ยื่นคำขอใหม่" opened on X; every save named X and got 409, and the gate refused forever | de667fd1 | `o1/r5-red.txt` → `o1/r5-green.txt`. Root cause includes `resetWizard` itself: it was `set(initialState)`, a shallow merge, and `initialState` has no `applicationId` key, so even success-step's reset kept X's id. Now it drops `applicationId` / `milestone1` / `createdAt` / `updatedAt`. (a) `submitAndHandOver` calls `forgetFiledApplication(X)` once `/applications/submit` succeeds (first filing or resubmit, so FILED, REFUSED_BUT_FILED and RESUBMITTED all qualify). It empties the store and removes the IndexedDB entry, but only when the store is about X. While the wizard is still on screen (step 6) the reset waits for the wizard to unmount: emptying it in place would trip the step page's bounce guard (`router.replace` to step 1) while the push to payments is in flight. Test `wizard-after-filing.test.tsx` uses the real store, the real hook and the real submit: file → leave → new → edit gives exactly 1 POST with no id and a new draft (RED: the POST carried `app-X`) |
| (b) Defence in depth: 409 APPLICATION_NOT_EDITABLE / 404 APPLICATION_NOT_FOUND on a save | de667fd1 | The autosave and the gate drop the id (`detachApplication`), keep the answers, mark them PENDING and show one amber line in the wizard (`layout.tsx`). The wording was corrected in round 5b, see below. The next save is id-less with no version token. Corrected in 5b: the server lands an id-less save on the latest open DRAFT when one exists, so it is not always a new draft. The gate now returns `SAVED` / `NOT_SAVED` / `DETACHED`. On `DETACHED` submit refuses with `DRAFT_DETACHED_TH` (wording in 5b) and posts nothing. A save in flight that detached is final: the gate does not follow it with a save that would mint a draft and report "saved" for X |
| Minor 1: an explicit id that does not resolve for this user wrote to another draft (200) | de667fd1 | `o1/r5-server-red.txt` (3× 200) → `o1/r5-green.txt`. `findOrCreateApplicationForHealth` throws 404 `APPLICATION_NOT_FOUND`, an existing catalogue code, so no registry change was needed. The door applies to every caller (`/draft`, `/prepare`, draft-documents POST/GET/DELETE). On postgres:17: another user's id, a soft-deleted id and an id that never existed each get 404, and neither user's rows change. The id-less path is unchanged |
| Minor 2 (privacy): logout kept `gacp_application_flow_state_v4` | de667fd1 | `AuthService.logout()`, and `saveSession` when the account cannot be shown to be the same one (same condition that already clears the active entity), call `forgetWizard()` (`lib/wizard-session.ts`). That resets the store when it is loaded and removes the IndexedDB entry. auth-service does not import the wizard store. Same-account sign-in keeps the wizard (test) |

Probes (tip de667fd1): retired-words PASS · no-skip PASS · no-secret PASS (layer1 0 hits, gitleaks clean) · ratchet PASS hardcode=26 todo=53 env-direct=101 dup-source=0 · error-codes-source-pointers + catalog 18/18 · themed-surface-tokens, settle-webhook-only, fee-single-source PASS · tier-check TIER=C (this round adds `lib/services/auth-service.ts` and `lib/wizard-session.ts`, both auth-identity).

Known limits, not fixed here:
- ~~A session that expires empties the wizard even for the same person.~~ Fixed in round 5b (owner stamp).
- A browser that already holds a filed X in IndexedDB from before this fix still opens on X. The first edit is refused, detached and saved as a new draft. Going straight to step 6 without an edit shows X's status and routes to X's payments page (as on main).
- ~~No view-pack this round.~~ Added in round 5b. The new amber line is the same markup as the existing lawNotice banner. Not run: `LOCAL_GATE_FULL=1 scripts/ci/local-gate.sh` (the coordinator runs it). Merge is the operator's (Tier C).

## Fix round 5b (2026-10-02): reviewer P2 + P1, and the view-pack

| item | RED → GREEN / evidence |
|---|---|
| P2 (regression versus main): an idle timeout wiped the wizard. `auth-service-activity.ts` calls `logout()`, which called `forgetWizard()`. `clearSession` also removed the stored user, so the next sign-in wiped again, even for the same person | `o1/r5b-red.txt` → `o1/r5b-green.txt`. The store now stamps `ownerUserId` (the signed-in user) the first time it holds answers. The stamp is persisted, hash-exempt and never sent. A sign-in calls `claimWizardFor(userId)` (`lib/wizard-session.ts`), which empties the wizard only when the stamp, in memory or in IndexedDB, names someone else. Only an explicit `logout()` empties it; the idle timeout passes `{ keepWizard: true }`. Unstamped answers can only predate this change; they are dropped on rehydrate and on sign-in rather than handed to whoever is signed in. Tests use the real `setupActivityTracking`, real AuthService, real store and real autosave hook: idle timeout, then the same user signs in, and the PENDING edit is sent exactly once with its id. A different user is wiped; an explicit logout is wiped |
| P1, wording only: an id-less save lands on the user's latest open DRAFT when one exists, so "ร่างใหม่" could be false | The notices now read "คำขอนี้ยื่นไปแล้ว ระบบจะบันทึกคำตอบของคุณเป็นร่างคำขอ", "ไม่พบคำขอเดิมในบัญชีของคุณ ระบบจะบันทึกคำตอบของคุณเป็นร่างคำขอ", and on the submit gate "คำขอนี้แก้ไขต่อไม่ได้แล้ว ระบบจะบันทึกคำตอบของคุณเป็นร่างคำขอ". Routing unchanged; the overwrite risk is in BACKLOG-FOUND.md (2026-10-02, reviewer P1) |
| Found by the view-pack: the detach never fired against the REAL error envelope. The rendered wizard showed "บันทึกไม่สำเร็จ" and retried under X | The `/draft` catch answers `{code:'APPLICATION_NOT_EDITABLE', error:'Failed to save application'}`. api-client harvests `code = data.error \|\| data.code`, so the machine code was lost; the round-5 unit tests had handed the hook the code directly. Fix: `ApiResponse.errorCode` carries the envelope's own `code` verbatim. It is additive, so `code` and `error` keep their meaning for every other caller. The detach reads `errorCode` first. RED/GREEN in `wizard-detach-real-envelope.test.tsx` runs the real api-client with only `fetch` stubbed (409 and 404, autosave and gate) |
| Contrast, found by the view-pack: the step 6 refusal in dark mode was dark red on a dark card (~1.7:1); in light mode it was ~4.4:1 | `step6-review.tsx` alert and missing-documents heading: `text-red-700` on light, `dark:bg-red-950/40 dark:text-red-200` on dark. The token-level `text-destructive` dark problem is in BACKLOG-FOUND.md |

View-pack (`next build` + `next start -p 3107` from this tree with `NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true`, Playwright Chromium at 390×844 @2x, health `auth_token` cookie, every `/api/**` call answered by route fixtures; no backend, no staging/demo DB). Request log and rendered colours are in `o1/r5-walk.json`.

| image | shows |
|---|---|
| `o1/r5-detach-step1-390-light.png` | Step 1 after a resumed draft X was edited (นิติบุคคล): the save naming X got the real 409 envelope, the id was dropped, the amber notice reads "คำขอนี้ยื่นไปแล้ว ระบบจะบันทึกคำตอบของคุณเป็นร่างคำขอ" above the step card, and the id-less save succeeded (pill "บันทึกแล้ว"). Contrast 8.75:1 |
| `o1/r5-detach-step1-390-dark.png` | The same in dark mode. Contrast 15.93:1 |
| `o1/r5-detach-step1-390-{light,dark}-full.png` | The same screens, full page |
| `o1/r5-gate-step6-390-light.png` | Step 6 after the edit's save failed (500): pressing ยื่นคำขอ, the gate's own save failed too, and the refusal reads "ยังบันทึกการแก้ไขล่าสุดไม่สำเร็จ กรุณาลองอีกครั้ง"; `/applications/submit` never called. Contrast 5.6:1 |
| `o1/r5-gate-step6-390-dark.png` | The same in dark mode after the contrast fix. Contrast 12.06:1 |

Copy check (thai-ui-copy): คุณ register, no em dash, each line names the cause and what happens next or what to do, no emoji. Seen in the dark screenshots but not from this round: the wizard header title is near-invisible in dark mode, and step 6's missing-documents heading carries an em dash. Both are in BACKLOG-FOUND.md.

Tests (round 5b tip): web 124 suites / 1362 tests; the other 69 suites / 395 tests touching auth-service, wizard-session or api-client; tsc 0. Backend unchanged since de667fd1 (30 suites / 363 on postgres:17). Probes: ratchet 26/53/101/0 PASS · retired-words, no-skip, no-secret, themed-surface-tokens, settle-webhook-only, fee-single-source PASS.


Full-gate follow-up on 3e4416ee: `apps/backend/__tests__/unit/wizard-answers-are-writable.test.js` ("ไม่มีฟิลด์ไหนหายไปเงียบ ๆ") failed on `hydrationEpoch`, `resumePending` and `ownerUserId`. These are client bookkeeping fields from rounds 1-5b that are neither writable on the server nor declared. They are now declared in that test's `NOT_AN_ANSWER` (its only definition), each with a reason. The test itself is unchanged. Confirmed never sent: all three are in `NOT_SENT_KEYS` (via `HASH_EXEMPT_KEYS`), and a new web test pins that `buildDraftPayload` carries none of them at the top level or in `formData`. Backend guard plus 18 wizard/draft unit suites: 19 suites / 247 tests. Web: 124 suites / 1363 tests. tsc 0.
