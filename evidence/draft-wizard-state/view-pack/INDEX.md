# fix/draft-wizard-state — view-pack (INTERCEPTED renders)

These are **intercepted renders**, not a staging capture. `next dev` of this worktree ran on
127.0.0.1:3229 (NEXT_PUBLIC_PWA_ENABLED=false); no backend ran. `capture-view-pack.js` (headless
Chrome, puppeteer from apps/backend/node_modules) answered `GET /api/applications/app-viewpack`
with a fixed DRAFT fixture (`formData.requestType='NEW'`, `applicantType='JURISTIC'`,
`certScope='PLANTING'`) and `GET /api/applications/config` / `POST /api/applications/draft`;
everything else (`webapp-version`, `notifications/unread-count`, `certificates/my`,
`system-config/public`) went unanswered and is logged per-shot in `capture-check-{before,after}.txt`.

"before" shots were taken with `apps/web-app/.../[id]/edit/client-view.tsx` reverted to main
(`git stash` of that one file, dev server hot-reloaded, then `git stash pop` to restore the fix —
verified by re-running the "after" capture afterwards and getting the same result).

| shot | what it shows | item |
|---|---|---|
| shots/p3-step1-before.png | /health/applications/new/step/1 after pressing เริ่มแก้ไขคำขอ on the DRAFT: plant card (กัญชา) selected, but neither ประเภทคำขอ nor ผู้ยื่นคำขอ is — `ถัดไป` stays disabled. Matches the live staging capture (`~/work/state/staging-walk-2026-09-29/screens/22b-step1-state.png`) | P3 |
| shots/p3-step1-after.png | same fixture, same button press: ขอใหม่ and นิติบุคคล both `aria-pressed="true"` (green outline), `ถัดไป` enabled | P3 |
| shots/p4-draft-before.png | /health/applications/app-viewpack/edit: สถานะปัจจุบัน badge reads "ต้องแก้ไขเอกสาร" (amber) + "หลังส่งแก้ไข: รอตรวจสอบอีกครั้ง" for a status:DRAFT application nobody has reviewed. Matches `~/work/state/staging-walk-2026-09-29/screens/21-draft-resume-landing.png` | P4 |
| shots/p4-draft-after.png | same fixture: single neutral line "สถานะปัจจุบัน: ร่างคำขอ ยังไม่ได้ยื่น" (no em dash — thai-ui-copy), no revision-requested claim | P4 |

Not shown here (out of the "small" pack asked for): REVISION_REQUESTED / CAR_PENDING keeping the
ต้องแก้ไขเอกสาร badge unchanged — covered by the jest suite instead
(`edit-status-banner-by-status.test.tsx`, 2 passing cases), not re-shot since nothing there changed.
