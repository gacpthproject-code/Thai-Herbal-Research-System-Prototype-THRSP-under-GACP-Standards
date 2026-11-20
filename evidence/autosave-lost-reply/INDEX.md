# autosave lost reply — fix/autosave-lost-reply (based on main e33666b9)
Source: `~/work/state/staging-walk-2026-10-02-savefail/INDEX.md`. On staging, nginx logged 0 non-200 draft saves and the backend logged 0 errors, so the likely trigger for the red pill is a 200 whose body is lost on mobile.

| item | commit | RED → GREEN / evidence |
|---|---|---|
| A retried save is harmless on the server | 9c3ddc03 | `backend-idempotency-green.txt`: postgres:17 on 127.0.0.1:5452, 146 migrations, container removed afterwards. Same payload + same `applicationId` twice gives 1 application with identical data. A first save with no id, retried with no id, gives 1 application with the same id. 0 new audit_logs, notification, quotation or application_document rows. A repeat does write `updatedAt`, `formData.lastDraftSavedAt`, and one more APPLICATION_DRAFT_SAVED event in `workflowHistory`. Mutation check: with the latest-draft lookup disabled, test 2 goes red (2 applications). No server change |
| Lost reply is amber and retried, 4xx is red with a Thai cause | 0c2708a5 | `web-red.txt` (17 failing on main code: an unreadable 200 gave `error`, and a 400 showed "Validation failed: ...") → 23/23 green. Full web suite: `web-full.txt` (430 suites / 3564 tests). tsc 0, eslint 0 on the touched files |

What changed (web only):
- `api-client.ts`: new additive `transportFailure` field (`NETWORK` / `TIMEOUT` / `UNREADABLE_REPLY`, the last for a 2xx whose body cannot be read, excluding 204). `error`, `code`, `status` and `errorCode` are byte-identical for every caller, and no existing caller reads the new field.
- `use-auto-save.ts` and `auto-save-status.ts`:
  - A lost reply, a timeout, a dropped connection, or 502/503/504 is amber and retried with backoff of 2, 4, 8, 16 and 30 s. After that the pill becomes a button.
  - visible, focus or online retries at once and restarts the backoff.
  - A retry uses `saveDraftRef` → `buildDraftPayload` with the current store.
  - 4xx is never retried. 500 and 429 retry only on a tap. 409/404 detach is unchanged.
- `auto-save-indicator.tsx`: amber "กำลังลองบันทึกใหม่" (retrying) and a "ลองบันทึกอีกครั้ง" button (retries spent). Tapping the red pill opens its cause. The text is Thai, written to คุณ, with no em dash, and the server's text is never shown.

View-pack: `next build` + `next start -p 3107` from this tree, Playwright Chromium 390×844 @2x. Every `/api/**` call was answered by a fixture, with no backend and no staging/demo DB. A lost reply is simulated as a 200 `application/json` with a cut body. Request logs and colours are in `lr-walk.json` (re-captured in fix round 1; each POST now shows its `saveSeq`).

| image | shows |
|---|---|
| `lr-1-retrying-390-{light,dark}.png` | 1st save got a cut-body 200. The pill shows amber "กำลังลองบันทึกใหม่" (title: การเชื่อมต่อขาดช่วง ...) |
| `lr-2-recovered-390-{light,dark}.png` | The retry 2.0 s later (2014/2022 ms) succeeded. The pill shows "บันทึกแล้ว". 2 POSTs, same id |
| `lr-3-red-400-cause-390-{light,dark}.png` | A 400 with server text "Validation failed: ...": the red pill is tapped and the cause shows in Thai. 1 POST, still 1 after 8 s |
| `lr-4-exhausted-390-{light,dark}.png` | After 6 POSTs (gaps 2025/4013/8007/16010/30019 ms) the pill becomes a "ลองบันทึกอีกครั้ง" button. One tap → 7th POST → saved |
| `lr-5-reload-after-edit-390-light.png` | Side finding (b): edit, reload 1 s later (0 POSTs before the reload). After the reload, 1 POST carrying the edit (JURISTIC). Not lost on this tree, so no change |

Side findings: (a) two tabs, last writer wins, and (c) a plant change while offline. Also: the body read has no timeout. All three are in BACKLOG-FOUND.md (2026-10-02 autosave-lost-reply).
Probes: ratchet PASS 26/53/101/0, plus retired-words, no-skip and no-secret PASS. error-codes-source-pointers 5/5. tier-check output: TIER=B. Not run here: `LOCAL_GATE_FULL=1 scripts/ci/local-gate.sh`.

## Fix round 1 (reviewer NEEDS FIXES)
| finding | fix | RED → GREEN |
|---|---|---|
| C1 overlapping saves could leave the store SYNCED while the server kept older answers | Client: every save path goes through one `requestSave`, which waits for an in-flight save and then sends the CURRENT store. Each save carries `saveSession` + an increasing `saveSeq` beside `applicationId` (never in formData), and an answer older than the last one applied is ignored. Server: `POST /applications/draft` stores the last applied clock in `formData.draftSaveClock`. That is the JSON the door already stamps, so **no migration** was needed. It compares and writes under `SELECT ... FOR UPDATE`, and an older or equal seq from the same session gets 409 `DRAFT_OUT_OF_ORDER` with nothing written. The client treats that as superseded: no retry, no red, no detach | web `r1-web-red.txt` (12 failing) → `r1-web-green.txt` (14/14, incl. the reviewer's P3). Backend `r1-backend-red.txt` (4 failing on the old server) → `r1-backend-green.txt` (6/6 on postgres:17). Mutation: without `FOR UPDATE` the race test fails |
| I1 page events retried 500/429 | `comeBack` returns unless the retry mode is AUTO | `r1-web-green.txt` (500 focus, 429 visibility, 500 online: 0 POSTs) |
| I2 a stalled body hung forever | api-client keeps the abort timer until the body is read, and races each body read against the abort. A stall ends as TIMEOUT and is retried | `r1-web-green.txt` (stall → retrying → saved; the submit gate resolves) |
| I3 a retry could send A's answers under B's session | Before every save (all paths, including the gate): no stored user, or `ownerUserId` ≠ stored user → nothing is sent and nothing is changed (no detach). The stored user is shared across tabs, so a logout in another tab (cookie-only/ThaiD included) is caught by the same check | `r1-web-green.txt` (owner A, user B: 0 POSTs; no user: 0 POSTs, gate NOT_SAVED) |
| M1, M2, M4 | A new edit resets the retry count. Page-event retries are at least 2 s apart. The visible text is the accessible name and the cause is `aria-describedby`. Copy says "กด" | `r1-web-green.txt`, `auto-save-indicator.test.tsx` |
| M3 | BACKLOG-FOUND (workflowHistory grows per save) | no code change |

Web full suite after round 1: 431 suites / 3581 tests, all pass. tsc 0. Backend draft and wizard suites: 24 suites / 279 tests. error-codes-source-pointers 5/5 (DRAFT_OUT_OF_ORDER registered). Probes: ratchet 26/53/101/0, retired-words, no-skip, no-secret PASS. tier-check TIER=B.
Full local gate: `r1-local-gate.txt`. The 11 failing backend suites have the same 32 failing tests with main's backend sources and with this branch's, on the same scratch DB.
View-pack re-captured on the round-1 build (`lr-1`…`lr-5`, same scenes). The pills look the same; the exhausted title now says "กด".

## Fix round 2 (after APPROVED: three parkable items + P8)
| item | fix | RED → GREEN |
|---|---|---|
| 1 Self-deadlock under RLS_SHADOW_GUC=true | `saveApplicantDraftInOrder` runs everything on the transaction's own connection: it locks and reads with `tx.$queryRaw ... FOR UPDATE`, checks the clock, and writes with a raw `UPDATE ... RETURNING`. No model call, so the tenant extension cannot move the write to another connection | `r2-backend-red.txt`: on round-1 sources the flag-on save died with P2028 after 30 s. `r2-backend-green.txt`: 200 in under 4 s, 3 runs |
| 2 Merge base read outside the lock | The route's merge is now `computeDraftWrite(row)`. With a save clock it runs on the row re-read under the lock, so an upload committed in between is merged | red: `draftDocuments` lost → green: kept (3 runs) |
| 3 Two tabs could file stale answers | Submit sends `{ saveSession, lastAppliedSeq }` for the last save this page applied. The server answers 409 `DRAFT_NOT_LATEST` (registered in error-codes) when the stored clock differs, and writes nothing. The client then saves its current answers once (`saveCurrentDraftNow`) and submits once more, never a third time; refused again → "คำขอนี้ถูกบันทึกจากหน้าต่างอื่นด้วย ปิดหน้าต่างอื่นของคำขอนี้ แล้วกดยื่นคำขออีกครั้ง" | backend 409 test (red → green); web `submit-and-hand-over.test.ts` 4 new (red `r2-web-red.txt` → green) |
| P8 copy | Nothing is sent while signed out or while another account is signed in. The pill then says so: "เซสชันหมดอายุ" / "บันทึกในบัญชีนี้ไม่ได้", each with its own Thai cause | 2 tests, red on round-1 → green |

Web full suite: 431 suites / 3587 tests, all pass. tsc 0. Backend: real-PG file 9/9 in each of 3 runs. Draft, submit and wizard suites: 471 of 480 pass. The 9 failures (m1-/m2a-submit-enforcement) also fail with main's sources. Probes: ratchet 26/53/101/0, retired-words, no-skip, no-secret and green-mask PASS. tier-check TIER=B.
Limitation: removing `FOR UPDATE` does not make the race test fail any more (the UPDATE serialises the writes). See `r2-backend-green.txt`. Backlog: the upload door still does an unlocked read-modify-write.

## Fix round 3 (re-review: I1 Important, M1 Minor)
| item | fix | RED → GREEN |
|---|---|---|
| I1: nothing tested finding 3's client clock path for real | New `submit-clock-real-path.test.tsx`: only `fetch` is stubbed; the real api-client, store, hook, gate and submit run (8 tests). It covers: the applied save's clock via the wizard and via the gate with no wizard; a failed save is not remembered; submit sends the clock in its body; `saveCurrentDraftNow` POSTs the current answers and is SAVED only after a 200 (NOT_SAVED on 500); the two-tab 409 flow re-saves once and the second submit names the new seq | `r3-web-red.txt`, three mutations made by editing the file, then restored by editing it back (diff against a copy: identical). Deleting the hook-path `rememberAppliedClock` fails 7/8; deleting the gate-path one fails 2/8; `saveCurrentDraftNow` returning SAVED without a POST fails 4/8. `r3-web-green.txt` 8/8 |
| M1: the renewal certificate read ran inside the locked transaction on the global client | `resolveLawDimensions` now runs before the transaction opens (it depends on the claim and the caller; `stored` only decides whether the plant is already answered). `computeDraftWrite` uses the result | `draft-renewal-save-on-one-connection-real-postgres.test.js` with `PRISMA_POOL_SIZE=1`, 3 s timeout. `r3-backend-red.txt`: on 2b155bc0 the renewal came back PREVIOUS_CERTIFICATE_UNVERIFIABLE after 3.1 s. `r3-backend-green.txt`: 200, RENEWAL granted, in 223 ms |

Re-run on a fresh SIGNING_KEY_DIR and scratch postgres:17 (container removed): one-connection test 1/1, real-PG file 9/9, error-codes-source-pointers 5/5. Backend draft/applications/wizard/law unit suites: 276/276. Web full suite: 432 suites / 3595 tests, all pass. tsc 0. Probes: ratchet 26/53/101/0, retired-words, no-skip and green-mask PASS.
