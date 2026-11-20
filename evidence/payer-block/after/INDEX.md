# Payer-block view-pack — after the fix (fix/payer-block-by-type, 2026-09-27)

Each image is page 1 of a REAL PDF, rendered by the production renderers
(invoice-template-service generate*Pdf) from rows read through the live
selects (invoiceService.getForDocument, credit/debit-note find*ForDocument,
the quotation route's select with PAYER_APPLICATION_SELECT) on a scratch
Postgres 17 (127.0.0.1:5434, migrate deploy, removed after). Fixtures are the
matrix test's own (synthetic, checksum-valid ids; seeded national ID
1000000000009 appears on none of them). PNG via pdf-parse getScreenshot
(pdftoppm is not installed here), 760 px wide, 64-colour palette.

Rendered in the SAME jest run as MATRIX.md (run tag `mujykixd59e9`, the tag on
every document number in the images) by the committed generator
`evidence/payer-block/render-view-pack.js`, called from the matrix test's
afterAll. Reproduce:
`PAYER_BLOCK_VIEW_PACK=1 npx jest --config jest.config.cjs __tests__/integration/payer-block-matrix.test.js`
(apps/backend, scratch Postgres, NODE_OPTIONS unset — the PDF is read by a plain node child, `apps/backend/test-support/pdf-child.js`).

Assertion evidence for the same 18 cells: MATRIX.md (written by
apps/backend/__tests__/integration/payer-block-matrix.test.js, 18/18 PASS).
Pre-fix record: ../audit-red/MATRIX.md (frozen) and ../red-output.txt.

| doc | INDIVIDUAL | JURISTIC | COMMUNITY_ENTERPRISE |
|---|---|---|---|
| quotation | [png](view-pack/quotation-INDIVIDUAL.png) | [png](view-pack/quotation-JURISTIC.png) | [png](view-pack/quotation-COMMUNITY_ENTERPRISE.png) |
| invoice | [png](view-pack/invoice-INDIVIDUAL.png) | [png](view-pack/invoice-JURISTIC.png) | [png](view-pack/invoice-COMMUNITY_ENTERPRISE.png) |
| receipt | [png](view-pack/receipt-INDIVIDUAL.png) | [png](view-pack/receipt-JURISTIC.png) | [png](view-pack/receipt-COMMUNITY_ENTERPRISE.png) |
| tax-invoice | [png](view-pack/tax-invoice-INDIVIDUAL.png) | [png](view-pack/tax-invoice-JURISTIC.png) | [png](view-pack/tax-invoice-COMMUNITY_ENTERPRISE.png) |
| credit-note | [png](view-pack/credit-note-INDIVIDUAL.png) | [png](view-pack/credit-note-JURISTIC.png) | [png](view-pack/credit-note-COMMUNITY_ENTERPRISE.png) |
| debit-note | [png](view-pack/debit-note-INDIVIDUAL.png) | [png](view-pack/debit-note-JURISTIC.png) | [png](view-pack/debit-note-COMMUNITY_ENTERPRISE.png) |

What to look for, per type (the approved rule; one source: apps/backend/utils/applicant-resolver.js):
- INDIVIDUAL: name label ชื่อ-นามสกุล; id row prints "-" (no national ID in any form).
- JURISTIC: ชื่อบริษัท; เลขประจำตัวผู้เสียภาษี = Entity.juristicId (ASCII on quotation/invoice/receipt, Thai 1-4-5-2-1 on tax invoice and notes).
- COMMUNITY_ENTERPRISE: ชื่อวิสาหกิจชุมชน; เลขทะเบียนวิสาหกิจชุมชน = Entity.communityRegNo; tax invoice buyer tax id "-".
- Quotation remark line: "เนื่องจาก <name> ยื่นเอกสาร…" (no hardcoded บริษัท); phone = formData.applicantData.phone.

## Web rows (slot-10 quotation, invoice-step.tsx + quotation-document.tsx)

| doc | type | verdict | actual (after) | proof |
|---|---|---|---|---|
| web quotation | INDIVIDUAL | PASS | prints server `payer` (name, idLabel, "-"); wizard idCard never read | apps/web-app/.../__tests__/invoice-step-shows-the-server-payer.test.tsx (4/4) |
| web quotation | JURISTIC | PASS | prints server `payer.idPrinted` + server `signatory` | same test |
| web quotation | COMMUNITY_ENTERPRISE | PASS | prints เลขทะเบียนวิสาหกิจชุมชน + communityRegNo from server | same test |
