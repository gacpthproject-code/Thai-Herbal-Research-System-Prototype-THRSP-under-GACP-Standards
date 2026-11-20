# fix/web-quotation-truth — view-pack (INTERCEPTED renders)

These are **intercepted renders**, not a staging capture. `next dev` of this worktree ran on
127.0.0.1:3217; no backend ran. `capture-view-pack.js` (headless Chrome, puppeteer from
apps/backend/node_modules) answered every `/api/` call from `fixtures/`:

- `fixtures/quotations-response.json` — GET /applications/:id/quotations in the NEW shape
  (`issuer` + `copy` added). Its `issuer` / `copy` / `signatory` were produced by the real
  backend builders for a ginger application (`fixtures/server-blocks-ginger.json`).
- `/applications/draft`, `/api/applications/config`, `/applications/:id` — minimal fixtures in the script.
- `/api/system-config/public` was not answered by a fixture (got `{success:true,data:null}`).

| file | what |
|---|---|
| quotation-step-light.png / -dark.png | the real step `/health/applications/new/step/10` (unsigned health JWT for the middleware role decode; `sessionStorage gacp_edit_mode` so the step renders without walking steps 1-6 — the "MODE: EDIT" badge comes from that) |
| capture-check.txt | text check per shot: retired words / emoji / company name, tax id, finance@, the payment-sentence key phrase / ขิง |

Before (staging, main 863400fc): state/staging-walk-2026-09-27/screens/85-web-quotation-step-863400fc.png.
Fix round 1 (2026-09-28): recaptured after M-1 (header prints the server `contact` line) and M-3 (payment sentence);
InvoiceDocument and its harness/screenshots deleted (I-2) — the invoice the customer receives is the PDF.
Real-browser staging capture: after deploy (not done here).
Known, not fixed here: dark mode text around the document is low-contrast (BACKLOG-FOUND.md 2026-09-28).
