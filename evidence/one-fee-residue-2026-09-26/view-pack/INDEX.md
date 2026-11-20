# View-pack — one-fee residue sweep, 2026-09-26

Method: `evidence/truthful-copy-port-2026-09-26/view-pack/viewpack.js`, run unmodified
against a real `next dev` (Node 24) inside this worktree (`/home/ubuntu/work/wt-residue`,
branch `fix/one-fee-residue`), port 3117, Playwright/Chromium, `/api/**` answered by the
script's own fixtures (no backend needed for these pages).

"Before" is not recaptured here: `839306fd` (this branch's own base) is the same commit
the truthful-copy port's own `before/` pack was already taken against
(`evidence/truthful-copy-port-2026-09-26/view-pack/before/`), so that existing before-pack
is the correct baseline for every page this sweep touches. Only `after/` is captured fresh.

## Pages captured (after/)
- `after-pricing.png` — pricing page: h1/eyebrow/metadata now say ค่าบริการ, not
  ค่าธรรมเนียม (item 8). Rendered text confirms `ค่าบริการการรับรอง GACP`.
- `after-terms.png` — Terms of Service §2/§3 body + refund-policy-document reference
  now say ค่าบริการ (item 8). Rendered text confirms
  `3. ค่าบริการและเงื่อนไขการชำระเงิน` and
  `เงื่อนไขการชำระค่าบริการและการคืนเงิน`.
- `after-payments-list.png` — /health/payments: single full-width PaymentInvoiceCard
  per invoice, no side-by-side STATE/PLATFORM pair, no "โอน 2 ครั้ง" text anywhere
  (item 1, item 2).
- `after-checkout-idle.png` / `after-checkout-created.png` — checkout disclosure bullets
  now say ค่าบริการ, not ค่าธรรมเนียม (item 8).
- `after-faq.png`, `after-faq-payment-items-open.png` — FAQ CAR/schedule copy (item 6).
- `after-footer.png`, `after-onboarding-step1..5.png` — unchanged by this sweep, captured
  because the shared script always captures them; included for completeness only.
- `after-rendered-text.txt` — full extracted body text + console.error log for every
  page above, in the same format as the truthful-copy port's own before/after packs.

## What the rendered text confirms
- Pricing/Terms/Checkout: every "ค่าธรรมเนียม" occurrence that named the company's own
  charge is now "ค่าบริการ" (grep count on `after-rendered-text.txt`: 4 remaining
  occurrences of "ค่าธรรมเนียม", all out of this sweep's scope — see
  `../BACKLOG-FOUND.md` items 1 and 3).
- Payments list: no "state-card-missing"/"platform-card-missing" placeholder, no
  "ค่าธรรมเนียมรัฐ" card title, no two-transfer footnote.
- FAQ: CAR answer says "5 วันทำการ" (was "30 วัน"); schedule answer says
  "ผ่านระบบ (แจ้งเตือนในระบบเท่านั้น)" (was "ผ่านระบบและอีเมล").

## Not captured
- accounting-dashboard-client.tsx (item 3), invoice-template-service.js PDF output
  (item 4), the 410 tombstone bodies (item 5), and en-health.ts (item 7) render behind
  auth/role gates or generate PDFs the shared viewpack script does not drive — those
  items are proven by the RED/GREEN jest evidence in this same directory
  (`red-item3..7*`, `green-item3..7*`), not by screenshot.
