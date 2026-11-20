# Task 7b view-pack: planting-activity attachments, before (df107376) and after (branch HEAD)

Walked on 2026-10-03 in real Chromium (Playwright 1.63, mobile viewport 390x844). Each stack used its own tree on one scratch Postgres 17 (127.0.0.1:55438, all migrations). Staging and demo were not touched.

| run | tree | backend | web (next dev) |
|---|---|---|---|
| before | detached scratch worktree at df107376 (removed afterwards) | :8198 | :3198 |
| after | wt-r2 at 1f7239dd | :8197 | :3197 |

- Backend environment: NODE_ENV=development and PAYMENT_ADAPTER=mock. The secrets were random throwaway values and SIGNING_KEY_DIR was a fresh temp directory. The dev `.env` was not read.
- Each process's DATABASE_URL was checked through `/proc/<pid>/environ` (masked) and pointed at 55438.
- Processes were stopped by port owner (ss → pid), never by `pkill -f`.

## Seed (scripts/)
- The farmer was registered through the real door, `POST /api/auth/health/register` (individual, national ID 1100000000008).
- `scripts/seed-farm-cycle.js` created the JURISTIC company "บริษัท สวนสมุนไพรทดสอบ จำกัด" with the farmer as an ACTIVE OWNER. It also created a farm held by the company and a planting cycle ("รอบปลูกที่ 1").
- `scripts/seed-active-certificate.js` created a CERTIFIED application and an active certificate, and linked the cycle to it. Without it, `/health/planting` shows the PlantingCertGate lock screen. The first walk attempt hit that screen, which is why this second seed exists.
- The farmer logs in through the UI form at /login. The workspace is the company (`gacp.activeEntityId`), and the theme is set through `theme` / `theme:explicit` in localStorage.

## Steps per run (scripts/walk.js)
1. Open `/health/planting/<cycle>/activities` and screenshot it (01).
2. Pick `irrigation-record.pdf` (3,064 bytes, a real PDF) in "ไฟล์แนบกิจกรรม" and screenshot (02, plus 03 as the full page).
3. Press "ลบ" on the listed file and screenshot (04).

## Network (network/*.json): the claim this pack proves
| run | upload | remove |
|---|---|---|
| before-light / before-dark | `POST /api/applications/draft-documents` 200, data keys include `applicationId`, `draftId` | `DELETE /api/applications/draft-documents/<id>` 200 |
| after-light / after-dark | `POST /api/planting-cycles/b7fef36a…/attachments?activityType=IRRIGATION` 201, data keys `documentId, fileName, fileUrl, mimeType, size` | `DELETE /api/planting-cycles/b7fef36a…/attachments/<id>` 200 |

Side effect in the DB after all four runs, for this farmer:
- `applications`: CERTIFIED 1 (the seed) and **DRAFT 1**. Only the "before" runs created that draft: the old door hangs the file on an application.
- `attachments`: PlantingCycle 2, both soft-deleted (the two "after" runs).

## Screenshots: does the page look the same?
Pixel diff with PIL `ImageChops.difference`, comparing before against after for the same theme and step:

| step | light | dark |
|---|---|---|
| 01-before-upload | identical | differs only in box (60,6)-(212,50): the workspace pill in the header. Cropping both side by side shows no visible difference (anti-aliasing or theme-transition timing) |
| 02-after-upload | identical | identical |
| 04-after-remove | identical | identical |

What the operator should see:
- **02**: the toast "อัปโหลดไฟล์แนบสำเร็จ / irrigation-record.pdf", and the file listed under "ไฟล์แนบที่เลือกแล้ว" with a red "ลบ".
- **04**: the list is back to "ยังไม่มีไฟล์แนบ".

I opened and checked each of these myself: after-light-02, after-dark-02, after-light-04, before-light-02, before-dark-02, and the cropped dark-01 header.

## Not in this pack
- Saving an activity that carries the attachment. At both trees that save answers 403 `ATTACHMENT_OWNERSHIP_DENIED` (see BACKLOG-FOUND 2026-10-03). It is fixed in the round-2 commits, and the save flow is added below once that lands.
- Playwright traces were kept outside the repo, because they hold session cookies (L2).

## Round 2: saving an activity that carries its attachment (operator 2026-10-03 "แก้ได้")
Same scratch DB, seed and farmer. `scripts/seed-plot.js` added plot "แปลง A", so the form's default PLOT scope has a plot. The web tree did not change in round 2 (`git diff be4930b3 HEAD -- apps/web-app` is empty), so one Next dev tree (wt-r2, :3197) was pointed at two backends in turn:
- **round1**: backend from a scratch detached worktree at be4930b3, on :8198. This is the round-1 HEAD, before the save fix. The worktree was removed afterwards.
- **round2**: backend from wt-r2 at 9f4ef4af, on :8197.

`scripts/walk-save.js` steps: choose the file, then press "บันทึกกิจกรรม".

| run | upload | save `POST /api/planting-cycles/<cycle>/activities` | screen (02-after-save) |
|---|---|---|---|
| save-round1-light/dark | 201 | **403 ATTACHMENT_OWNERSHIP_DENIED**, request attachmentIds = [the uploaded id] | red toast "บันทึกไม่สำเร็จ / คุณไม่มีสิทธิ์ดำเนินการนี้ ..." and the file is still pending |
| save-round2-light/dark | 201 | **201**, response `data.attachmentIds` = [the uploaded id] (network/save-round2-light.json) | green toast "บันทึกสำเร็จ / กิจกรรมถูกบันทึกเรียบร้อยแล้ว", counter "1 กิจกรรม", the list clears to "ยังไม่มีไฟล์แนบ", and the timeline shows the new "ให้น้ำ" row(s) (03-timeline) |

DB after the round-2 runs (`cultivation_logs` for the cycle): two IRRIGATION rows, each with `attachmentIds` holding exactly the id its upload returned.

Opened and checked: save-round1-light-02, save-round1-dark-02, save-round2-light-02, save-round2-dark-03.

Not shown in the UI:
- The timeline does not render attachments. That is the page as it is, unchanged; the link is proved by the response and the DB row.
- The 409 for deleting an attachment that a saved activity carries cannot be reached from this page, because the pending list clears on save. The real-PG tests cover it (r2b-green.txt).

Teardown: processes were killed by port owner (3197/8197/3198/8198 all free), container ws-pg-55438 was removed, both scratch worktrees were removed, and demo/staging still answer (307, the prelaunch gate).
