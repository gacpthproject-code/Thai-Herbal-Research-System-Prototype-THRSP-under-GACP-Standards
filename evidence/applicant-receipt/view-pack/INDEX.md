# applicant-receipt view-pack — 2026-09-29 (branch fix/applicant-receipt-and-billing-scope)

Two halves. The receipt half is a real render; the payments-page half is an INTERCEPTED render (no backend).

| file | what it shows | how it was made |
|---|---|---|
| receipt-tax-invoice-rendered-p1.png · receipt.pdf · receipt-pdf-text.txt | P1 + design §3.3 (re-captured 2026-09-30 after review round 1): the ONE paper ใบเสร็จรับเงิน / ใบกำกับภาษีเต็มรูป, 1 page, TAX-PRD-2026-000002 as stored, seller name/address/tax ID/branch, company buyer tax ID 0-1055-61234-56-0, subtotal / VAT 7% / total, method ชำระผ่านระบบ (row stores STRIPE, as settlement writes), อ้างอิงการชำระ = invoice number, ผู้รับเงิน / Cashier signer line with the seller company only (no approver; review round 2) | `render-receipt-from-db.js`: rows seeded in scratch PG 17 (127.0.0.1:5442, migrate deploy, removed after) → `invoiceService.generateReceiptPdf` → receipt-tax-invoice.html → real Puppeteer; PNG via `render-pdf-to-png.mjs` |
| receipt-tax-invoice-community-enterprise-rendered-p1.png · receipt-community-enterprise.pdf · receipt-community-enterprise-pdf-text.txt | review round 1 (2026-09-30): community-enterprise buyer — Tax ID "-", registration-number row from the payer-block rule; อ้างอิงการชำระ = invoice number; ผู้รับเงิน / Cashier signer line | same script with `COMMUNITY_ENTERPRISE` |
| invoice-rendered-p1.png · invoice.pdf · invoice-pdf-text.txt | P2: the same row's invoice, now 1 page | same script, `invoiceService.generatePdf` |
| before-fix-invoice-p1.png · before-fix-invoice-p2-footer-only.png · before-fix-receipt-p2-footer-only.png · before-fix-tax-invoice-p2.png | P2 before: page 2 holds only the footer (tax invoice: signatures + footer) | same fixture rendered on the pre-fix templates |
| after-fix-tax-invoice-fixture-p1.png | P2 after, the retired tax-invoice.html (superseded 2026-09-30 by receipt-tax-invoice.html; kept as the before/after record) | template fixture render |
| 01-company-workspace-applicationId-link.png | P5 + link param: `?applicationId=` link; chip prints APP-2569-MUJZRHP3-69A796, no UUID on the page | `viewpack-payments.js`, `next start` of this branch's build, /api/** answered by page.route |
| 02-detail-modal-paid-invoice.png | P1: paid invoice offers ดาวน์โหลดใบเสร็จรับเงิน/ใบกำกับภาษี (primary) + ดาวน์โหลดใบแจ้งหนี้ | intercepted |
| downloaded-TAX-PRD-2026-000002.pdf | P1: the press hits `/api/invoices/my/<id>/receipt/pdf` and saves under the receipt number | intercepted; answered with receipt.pdf above (byte-identical, see log) |
| 03-company-workspace-no-param.png · 04-after-switch-to-personal-workspace.png | P6: switching workspace in the header reloads /invoices/my + /applications/my under the new header; the company invoice leaves the screen; no quotation call for the company application | intercepted; request log in viewpack-payments-log.txt |

Limits: the payments page never talked to a real backend here. The backend's workspace scoping and receipt door are proven on real Postgres by `apps/backend/__tests__/integration/applicant-billing-workspace-real-postgres.test.js` (../test-output.txt). Not walked on staging.
