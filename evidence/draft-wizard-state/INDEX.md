# fix/draft-wizard-state — evidence (2026-09-29, Node 24.21.0)

Source: staging live walk `~/work/state/staging-walk-2026-09-29/INDEX.md`, defects P3/P4,
recorded in `BACKLOG-FOUND.md` ("2026-09-29 — staging live walk after deploying main 8f0f99a2").

| item | RED | GREEN |
|---|---|---|
| P3 backend (buildApplicationDetailPayload never echoed requestType/applicantType/certScope) | red-output-p3-backend.txt (2 failed) | test-output-backend.txt (2 passed) |
| P3 frontend (handleStartEdit never hydrated them into the store) | red-output-p3.txt (1 failed) | test-output-web.txt |
| P3 pin (store → step 1 selection binding — no code change needed there) | — (pin) | test-output-web.txt (step1-shows-hydrated-answers) |
| P4 (ต้องแก้ไขเอกสาร shown for every editable status incl. never-submitted DRAFT) | red-output-p4.txt (1 failed, 2 pinned-passing) | test-output-web.txt |
| P4 follow-up (same page, same class: "ขั้นตอนการแก้ไข" instructions told a never-submitted DRAFT to read an officer's note and resubmit) | red-output-p4-followup-instructions.txt (1 failed, 3 pinned-passing) | test-output-web.txt |

## Root cause

Two independent bugs, both in `apps/web-app/src/app/health/applications/[id]/edit/client-view.tsx`
plus one backend gap they depend on:

- **P3**: `GET /api/applications/:id` → `buildApplicationDetailPayload`
  (`apps/backend/routes/api/helpers/application-payload-builders.js`) whitelists the `formData` it
  echoes to the edit page, and that whitelist never named `requestType` / `applicantType` /
  `certScope` — step 1's own answers never left the server. Fixed by adding the three keys (a READ;
  `requestType`/`certScope` stay server-owned per `shared/form-data-ownership.js`, `applicantType`
  stays applicant-writable per `WIZARD_OWNED_FORM_DATA_KEYS` — this changes who may *read* them
  back, not who may *write* them). Even with that fixed, `handleStartEdit()` in client-view.tsx
  never read the three fields into `updateState(...)` — fixed alongside it, each key applied only
  when it validates against the same closed vocabulary `plantId`/`serviceType` already use
  (normalize-or-omit, never a guessed default).
- **P4**: the "สถานะปัจจุบัน" card on the same page hardcoded the `ต้องแก้ไขเอกสาร` badge
  regardless of `application.status`. Now shown only for `REVISION_REQUESTED` / `CAR_PENDING` (the
  statuses that mean an officer reviewed the filing and asked for changes); a `DRAFT` gets a neutral
  "ร่างคำขอ ยังไม่ได้ยื่น" line (thai-ui-copy: no em dash).
- **P4 follow-up** (found while fixing P4, logged in BACKLOG-FOUND.md, then closed on this same
  branch per coordinator instruction): the "ขั้นตอนการแก้ไข" instructions card right below the
  badge had the same defect — "อ่านหมายเหตุจากเจ้าหน้าที่ด้านบน" / "…กดส่งใหม่" for every editable
  status. Gated the same way: shown only for `REVISION_REQUESTED` / `CAR_PENDING`; `DRAFT` gets one
  neutral line, `getNextAction('DRAFT')` from `@/lib/status-mapping` — the same canonical DRAFT copy
  the app already uses elsewhere, not a new hardcoded string.

## Gates

probes-output.txt (retired-words, ratchet 26/53/101/0 = main's `evidence/ratchet-current.txt`
— re-run after the follow-up, unchanged, no-skip, no-secret: all PASS) · gate-output.txt
(`tsc --noEmit` exit 0 twice, `next build` exit 0 with NEXT_PUBLIC_PWA_ENABLED=false, apps/web-app
jest health/applications area 60/60 suites 558/558 tests after the follow-up, apps/backend full
unit suite 825/825 suites 11064/11064 tests). `eslint --max-warnings=0` on
every changed/added file: clean (not saved to a file — reproduce with the file list in the diff).
`scripts/ci/local-gate.sh` was not run in this session (targeted gates above cover the touched
surfaces; see gate-cannot-pass-use-baseline memory for why the full script is not a pass/fail
signal by itself).

View-pack: `view-pack/INDEX.md` (intercepted renders, before/after for both P3 and P4).
