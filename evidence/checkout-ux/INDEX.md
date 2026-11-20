# fix/checkout-ux — view-pack (INTERCEPTED renders)

These are **intercepted renders**, not a staging capture. `next dev` of this worktree ran on
`127.0.0.1:3218` (`NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true NEXT_PUBLIC_PWA_ENABLED=false`); no backend
ran. `capture-view-pack.js` (headless Chrome, puppeteer from `apps/backend/node_modules`, same idiom
as `evidence/web-quotation-truth/capture-view-pack.js`) intercepted every `/api/` request and
answered it in-script — the accept click in item 2 is a REAL click that fires a REAL intercepted
POST, then REAL intercepted follow-up GETs, exactly the sequence client-view.tsx runs in production.

| file | what |
|---|---|
| `after-1-checkout-application-number.png` | `/health/payments/checkout?app=<uuid>&milestone=M1`, idle state. "เลขคำขอ" reads `APP-2569-MUJIXOBX-0C1EC3` (the fixture's `applicationNumber`), not the `2a60c16c-8428-4d48-8bc2-a27bf8e0f445` UUID in the URL. |
| `before-2-quotation-pending.png` | `/health/payments?app=<uuid>`, before any click. Quotation card badge: "รอการยอมรับ" (compare with the original defect evidence, `~/work/state/staging-walk-2026-09-27/screens/32-after-accept.png`, same layout). |
| `after-2-quotation-accepted-no-reload.png` | Same page, immediately after a live click on "ยอมรับใบเสนอราคา" — intercepted `POST .../quotations/PLATFORM/accept` answered 200, then the page's own follow-up GETs. No `page.reload()`/navigation between the two shots. Badge now reads "ยอมรับแล้ว" ("✓ ยอมรับแล้ว" on the button). |
| `capture-check.txt` | machine-readable assertions the script itself made (`containsNumber`/`containsUUID`, pre/post-click badge text, unanswered `/api/` paths). |
| `capture-view-pack.js` | the capture script. |

Unanswered `/api/` paths on every shot (all page-chrome, not the fix's data path — harmless fixture
gaps, `{success:true,data:null}` fallback did not error): `GET /api/webapp-version`,
`GET /api/certificates/my`, `GET /api/system-config/public`.

Both defects reproduced against the real BACKLOG-FOUND.md evidence before the fix (manually verified
against `git stash` of the two source edits during authoring, not re-captured here — the RED jest
tests in `evidence/checkout-ux/red-output*.txt` are the recorded RED artifacts for that).

## Review follow-up (post-approval)

`QuotationCard` held `status` in its own `useState(quotation.status)` with no identity `key`.
`/health/payments` passes `quotations` down as a prop keyed off `quotationApplicationId`; switching
that id without an identity key re-renders the SAME card instance with a DIFFERENT application's
quotation, and the pill can show the previous application's status. Fixed with
`key={quotation.id}` on each `<QuotationCard>` (QuotationReviewSection.tsx) — a different document
always forces a fresh instance; the SAME document across renders (e.g. just-accepted, prop still
catching up) keeps the same key, which is what the item-2 fix above depends on.
RED: `red-output-identity-key.txt`. GREEN: `test-output-identity-key.txt` (30 suites / 232 tests).
