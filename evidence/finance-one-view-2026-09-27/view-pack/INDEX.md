# View-pack — finance one view (fix/finance-one-view, PR-2) — 2026-09-27

Real Chromium against `next dev` on :3121, run from the PR-2 working tree (before the PR-2 commit).
Captured by `viewpack.js` in this folder with the same technique as `evidence/truthful-copy-port-2026-09-26/view-pack/viewpack.js`:
- **Role for the middleware:** an unsigned `provider_token` cookie.
- **Role for `useAuth()`:** `localStorage.user`.
- **API calls:** every `/api/**` call is answered by `page.route` with ONE fixture set.

Both roles get byte-identical API data, so any on-screen difference comes from the page, not from the data.

Run: `cd apps/web-app && NODE_PATH=$(pwd)/node_modules node ../../evidence/finance-one-view-2026-09-27/view-pack/viewpack.js <outdir>`

## Side by side (left = finance_officer_dtam, right = finance_officer_platform)
| page / tab | image | write buttons: dtam · platform (from `shots/viewpack-log.txt`) |
|---|---|---|
| /provider/accounting | side-by-side/01-dashboard.png | none · none (header actions are reads) |
| /provider/accounting/ar-aging | side-by-side/02-ar-aging.png | none · none |
| /provider/accounting/reports | side-by-side/03-reports.png | none · none |
| /provider/accounting/wht | side-by-side/04-wht.png | none · "บันทึก ทบ.50 ทวิ ใหม่" |
| /provider/accounting/purchase-invoices | side-by-side/05-purchase-invoices.png | none · "บันทึกใบกำกับใหม่", row "อนุมัติ", "ปฏิเสธ" |
| /provider/accounting/manual-journal-entries | side-by-side/06-manual-journal-entries.png | none · "สร้างร่างใหม่" |
| /provider/accounting/period-close | side-by-side/07-period-close.png | none · "ปิดงวดใหม่" |
| /provider/receipts | side-by-side/08-receipts.png | none · "ออกใบเสร็จ" ×2 |
| invoice detail (dashboard → eye) | side-by-side/09-invoice-detail.png | none · "ระงับ / Hold (Finance)", "ยกเลิก / คืนเงิน (Void/Refund)" |

Full-size single screenshots are in `shots/<page>__<role>.png`.

## Read content — machine comparison (`shots/viewpack-log.txt`, `shots/viewpack-results.json`)
Method: take the `<main>` text of each page, remove the write-button labels and the one read-only notice line, then compare the two roles.
```
COMPARE 01-dashboard: read content identical=true · landed /provider/accounting | /provider/accounting
COMPARE 02-ar-aging: read content identical=true · landed /provider/accounting/ar-aging | /provider/accounting/ar-aging
COMPARE 03-reports: read content identical=true · landed /provider/accounting/reports | /provider/accounting/reports
COMPARE 04-wht: read content identical=true · landed /provider/accounting/wht | /provider/accounting/wht
COMPARE 05-purchase-invoices: read content identical=true · landed /provider/accounting/purchase-invoices | /provider/accounting/purchase-invoices
COMPARE 06-manual-journal-entries: read content identical=true · landed /provider/accounting/manual-journal-entries | /provider/accounting/manual-journal-entries
COMPARE 07-period-close: read content identical=true · landed /provider/accounting/period-close | /provider/accounting/period-close
COMPARE 08-receipts: read content identical=true · landed /provider/receipts | /provider/receipts
```
The run logged 0 `console.error` lines.

## What this does NOT show
- **API data is mocked.** Backend read parity is proven separately by the backend tests (`finance-read-parity.test.js`). The two finance users sharing one organization on staging/demo is not checked here.
- **`next dev`, not the production build.** `next build` runs in the gate (see the report).
- **Report sub-tabs:** only the default "งบทดลอง" tab is captured, and all five sub-tabs are the same component for both roles.
