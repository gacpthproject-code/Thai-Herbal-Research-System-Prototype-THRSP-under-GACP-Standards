# View-pack: document pre-check screens (Task 8), 2026-09-28

**How these were made: an intercepted run, not a real stack.** Real Chromium (Playwright) ran against `next dev` on :3131, started from the `feat/document-precheck` worktree after commit af43932a (code) and 89eb5b75 (tests).
- Backend URLs were pointed at a dead port (127.0.0.1:9). No backend and no database took part in this run.
- Every `/api/**` request was answered inside the browser by `page.route`. The fixture JSON is shaped like Task 7's responses: `GET /applications/:id/requirements` with `slot.precheck`, `POST .../prechecks/:id/acknowledge`, and `GET /provider/applications/:id/document-check` with confidence and a masked snippet.
- The reason texts are the backend rules' own strings.
- These pictures prove what the screens do with that response shape. They do NOT prove that the real backend produces it; Task 7's tests cover that.

Run: `cd apps/web-app && NODE_PATH=$(pwd)/node_modules node ../../evidence/document-precheck-2026-09-27/view-pack/viewpack.js <outdir>` (needs `next dev -p 3131`).

## Applicant: slot card on wizard step 2 (`/health/applications/new/step/2`)
| state | light | dark |
|---|---|---|
| checking ("กำลังตรวจเอกสาร…") | shots/01-checking.png | shots/01-checking-dark.png |
| checked-ok (PASS/MATCH + MANUAL only; MANUAL not shown) | shots/02-checked-ok.png | shots/02-checked-ok-dark.png |
| checked-flags (NOT_FOUND + EXPIRED; two buttons) | shots/03-checked-flags.png | shots/03-checked-flags-dark.png |
| check-failed | shots/04-check-failed.png | shots/04-check-failed-dark.png |
| acknowledged, after a real press on "ยืนยันว่าเอกสารถูกต้อง" | shots/05-acknowledged.png | - |
| checking slot after its pre-check finished (the poll picked it up) | shots/01b-checking-finished.png | - |

## Officer: document-check row (`/provider/reviewer/app-vp-1/document-check`)
- The row: shots/06-officer-row.png and shots/06-officer-row-dark.png. It shows the flags with reasonTH, confidence and snippet, the "ผู้ยื่นยืนยันแล้ว" badge, and the "ตรวจลายมือชื่อ/ตรา" line. The verdict buttons are unchanged.
- Full page: shots/07-officer-page.png.

## Measured in the browser (from `shots/viewpack-log.txt`)
```
poll: 2 requirements reads in 11 s while checking · reads after the check finished and 12 s passed: 0
poll gaps (ms): 2, 5052, 5000, 5000
press: POST /api/applications/draft | POST /api/applications/app-vp-1/prechecks/pc-3/acknowledge
confirm button disabled after press: true
emoji on applicant page: false
07-officer-page.png · emoji on officer page: false
```
- The 2 ms gap is the initial read firing twice under React dev StrictMode.
- `POST /applications/draft` is the wizard's autosave. The intercept answered it too.
- The run logged 0 `console.error` lines.
- In dark mode the card surface is `bg-leaf-soft` / `bg-card` (html.dark=true is logged per context), and the flags block has no surface of its own.

## Fix round 1 (re-captured 2026-09-28, same method, same fixtures)
- These shots were re-taken: 03-checked-flags (light and dark), 05-acknowledged, 06-officer-row (light and dark), 07-officer-page and viewpack-log.txt. The rest are unchanged from round 0.
- 03 dark: "อัปโหลดไฟล์ใหม่" now carries `border-border bg-card`, so it reads as a button on the dark card.
- 06/07: the confidence appears once, beside the heading ("ความมั่นใจในการอ่าน 88%"). Per-flag lines are the reasonTH plus the snippet.
- The emoji check in viewpack.js now uses the same widened union as the jest guards, which adds U+2600-27BF, U+2300-23FF, U+1F000-1FAFF and U+FE0F. Result: false on both pages.

## Task 10 (re-captured 2026-09-28, same intercepted method, same fixtures except one string)
- Operator ruling 2026-09-28 on the officer row: a PASS/MATCH flag is tagged "ไม่มีข้อสังเกต" (no longer "ผ่าน"); every other result keeps "ข้อสังเกต"; the MANUAL line reads "ตรวจเอง · ตรวจลายมือชื่อ/ตรา"; each pre-check block opens with one line "ผลตรวจอัตโนมัติเป็นข้อสังเกตเบื้องต้น การตัดสินเป็นของเจ้าหน้าที่". The applicant card copy is unchanged.
- Fixture change: `R.notFound` in viewpack.js is now the backend's new NOT_FOUND reason ("ไม่พบข้อมูลที่จะเทียบในเอกสารนี้ เจ้าหน้าที่จะตรวจสอบเพิ่มเติม", Task 10 copy sweep in `rules/cross-match.js`).
- The whole script was re-run against `next dev` :3131 from the worktree after commit d64b0e80 plus the officer-label change, so every shot and `viewpack-log.txt` were re-taken. What differs from fix round 1: 06-officer-row (light and dark) and 07-officer-page carry the new labels; 03-checked-flags (light and dark) and 05-acknowledged carry the new NOT_FOUND reason string. The rest are the same state as before.
- Log (`shots/viewpack-log.txt`): emoji on applicant page false · emoji on officer page false · 0 `console.error` lines · poll 2 reads in 11 s, 0 after the check finished.
- Task 10 fix round 1 (review M1, re-captured the same way): the line "ผลตรวจอัตโนมัติเป็นข้อสังเกตเบื้องต้น การตัดสินเป็นของเจ้าหน้าที่" now sits directly below the heading row, once per block (06 light/dark, 07). Log: emoji false on both pages, 0 `console.error`.
