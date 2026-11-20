# fix/invoice-pdf-truth — evidence pack (2026-09-27)

Reproduces and fixes the four defects from the real staging invoice
INV-CO-CAFF6646-M1 (company payer), rendered through the real
`invoice-template-service.js` with synthetic company-payer data
(APP-EVID-CO, บริษัท ทดสอบพร้อมเพย์สเตจจิ้ง จำกัด, tax ID 0105558123456).

## Files

- `red-output.txt` — jest run of `invoice-pdf-truth.test.js` +
  `finance-contact-email-mirror.test.js` against the pre-fix tree (base
  files restored via `git stash`). 17/21 fail. The few that read as "pass"
  do so because the pre-fix `renderTemplateToPdf` does not understand the
  `htmlOnly` opt this fix adds, so it returns a real PDF `Buffer` where the
  assertion expected a string — `toContain` on a `Buffer` cannot match a
  Thai substring, so those specific lines are a test-tooling artifact, not
  a claim that the defect was absent (the artifact PDFs below settle that).
- `test-output.txt` — same two files against the fixed tree: 21/21 pass.
- `before-invoice.pdf` / `before-invoice-text.txt` / `before-invoice-page1.png`
  — real render, pre-fix code (`git stash` of the 8 changed files).
- `after-invoice.pdf` / `after-invoice-text.txt` / `after-invoice-page1.png`
  — real render, fixed code.
- `before-receipt.pdf` / `before-receipt-text.txt` — pre-fix receipt.
- `after-receipt.pdf` / `after-receipt-text.txt` — fixed receipt.
- PNGs are Chromium's own PDF viewer, screenshotted via Puppeteer
  (`page.goto('file://...pdf')` + `page.screenshot`) — no external
  converter (`pdftoppm`/poppler) is installed on this machine.

## Diff, before → after (invoice)

```
< โทร: 0-2591-7007 | อีเมล: contact@gacpth.com
> อีเมล: finance@gacpth.com
< ใบแจ้งหนี้ INVOICE
> ใบวางบิล / ใบแจ้งหนี้ INVOICE
< ชื่อ-นามสกุล / Name              (juristic payer)
> ชื่อบริษัท / Company Name
< เลขประจำตัวประชาชน / ID No.
> เลขประจำตัวผู้เสียภาษี / Tax ID
< ค่าธรรมเนียม GACP
> ค่าบริการ GACP
```

Same four changes reproduce on the receipt (`before-receipt-text.txt` /
`after-receipt-text.txt`), and the label (Company Name / Tax ID) is
unchanged for an individual payer per `invoice-pdf-truth.test.js`
("keeps the individual payer labels exactly as before").

## Commands used

```
source ~/.nvm/nvm.sh && nvm use 24
cd apps/backend
# RED: git stash push -- <8 changed files>; jest ...; git stash pop
# Evidence renders: node render-evidence.js before|after <this dir>
```
