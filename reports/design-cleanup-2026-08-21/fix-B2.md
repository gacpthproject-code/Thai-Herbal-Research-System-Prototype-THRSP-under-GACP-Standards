# fix-B2 — accounting Void/Refund PATCHes a route that does not exist — 2026-08-23

Status: DONE(probe:jest apps/web-app invoice-detail-modal-refund.test.tsx)

## Root cause (two defects, one button)

1. **Route does not exist.** `invoice-detail-modal.tsx` called
   `apiClient.patch('/invoices/:id', {status:'CANCELLED'})`. `routes/api/index.js:154`
   mounts `finance/invoices.js`, which registers GET only (`:51 :75 :96 :122 :146`)
   plus `invoice-payment-handlers.js` (POST `/:id/hold` `:135`, `/:id/release` `:162`,
   receipts). No PATCH exists anywhere under `/api/invoices`.
   The real cancel/refund path is `routes/api/finance/refunds.js:49`
   `POST /api/finance/refunds/:invoiceId/initiate`, mounted at
   `routes/api/index.js:222`. It is also the legally correct one: it wraps
   ใบลดหนี้ (ป.รัษฎากร ม.86/10) creation + issue + journal posting in one transaction.
2. **Result never checked (systemic P1).** `api-client.ts` never throws — every failure
   returns `{success:false,…}` from `request()` (error branches at `:356 :377 :402 :448
   :457 :473 :483 :511 :519`). The handler's `catch` was dead code, so `onClose()` +
   `onRefresh()` ran on a 404 exactly as on success.

Live proof against https://preview.gacpth.com (unauthenticated, no records touched):

```
PATCH /api/invoices/probe-nonexistent                 -> HTTP 404  text/html   "Cannot PATCH /api/invoices/probe-nonexistent"
POST  /api/finance/refunds/probe-nonexistent/initiate -> HTTP 401  application/json  {"success":false,"error":"Unauthorized","code":"NO_TOKEN"}
```

The 404 is a missing route, not an auth rejection — the refunds route answers with a JSON 401.

## Did

- `apps/web-app/src/app/provider/accounting/invoice-detail-modal.tsx:106` — refund now
  `POST /finance/refunds/${invoice.id}/initiate` with `{reason, reasonCode:'CANCELLATION'}`
  (`refund-service.js:272-277` requires both; `credit-note-service.js:84-89` owns the code list).
  **No amount is sent** — the credit-note figure stays entirely in `refund-service.js` (LAW L3).
- Same file `:68` hold and `:86` release — same file, same P1 shape, now check `res.success`
  before `onClose()/onRefresh()`. A 403 used to close the modal as though the invoice were held.
- All three: failure → `toast.error(res.error)` and the modal stays open; success → `toast.success`.
- No backend file changed — the route already existed.

Ratchet: n/a (no `src/` change on the backend; web-app change adds no hardcode/skip/todo).

## RED (before the fix)

```
FAIL src/app/provider/accounting/__tests__/invoice-detail-modal-refund.test.tsx
  × POSTs the real refund route (finance/refunds/:id/initiate), never PATCH /invoices/:id
      expect(jest.fn()).not.toHaveBeenCalled()   Received number of calls: 1
      1: "/invoices/inv-b2-fixture", {"notes": "[Refund/Void at 2026-08-23T15:33:02.937Z]", "status": "CANCELLED"}
  × sends the reason + reasonCode that refund-service requires   TypeError: Cannot read properties of undefined (reading '1')
  × does not send an amount — the credit-note figure belongs to the backend (LAW L3)   (same TypeError)
  × keeps the modal open and surfaces the error when the refund is rejected
      expect(onClose).not.toHaveBeenCalled()     Received number of calls: 1
  √ closes and refreshes only when the backend actually succeeded
  × hold: a 403 must not close the modal as though the invoice were held
      expect(onClose).not.toHaveBeenCalled()     Received number of calls: 1
Tests: 5 failed, 1 passed, 6 total
```

## GREEN (after)

```
PASS src/app/provider/accounting/__tests__/invoice-detail-modal-refund.test.tsx
  6 passed, 6 total   Time: 2.16 s
```

No regression in the two suites that read this file's source:
`x4-fix-d-a11y-polish.test.ts` + `thai-copy-defects-a3.test.ts` — 65 passed.
`npx eslint` on both changed files: 0 errors, 0 warnings.

## P1 — other call sites with the same shape (NOT fixed here)

Scanned all of `apps/web-app/src` for `apiClient.post|patch|put|delete` mutations whose
`ApiResponse` is discarded or whose `.success` is never read (scan script:
scratchpad/p1-scan.js, p1-scan2.js). After this fix:

**Result thrown away entirely (2):**
- `src/app/health/applications/new/_steps/steps/documents-step.tsx:150` — `await apiClient.delete('/applications/draft-documents/:id')`; local state drops the doc regardless, so a failed server delete leaves an orphan draft document while the wizard says it is gone. **Real bug.**
- `src/lib/services/active-entity-provider.tsx:217` — `POST /entities/me/switch`. Deliberate fire-and-forget audit ping, documented in-line ("Failures don't roll back the switch"). Not a bug.

**Checked but the failure branch is silent — `if (res.success){…}` with no else (3):**
- `src/app/admin/settings/page.tsx:148` — `PUT /system-config/:key`. A rejected save shows nothing; the edited value stays on screen looking saved.
- `src/app/health/site-analysis/client-view.tsx:115` — `DELETE /site-analyses/:id`.
- `src/app/health/training/client-view.tsx:116` — `DELETE /training-records/:id`.
  (These two do not fake success — they just skip the refresh — but the user gets no error.)

Checked and cleared (they do surface the failure): `admin/organizations/_components/create-org-dialog.tsx:56`,
`admin/settings/page.tsx:238`, `health/workspaces/page.tsx:102,118`.

## Blocked / concerns

- **Behaviour change worth an operator eye:** the button was a no-op; it now really initiates a
  refund (credit note + journal entry via `refund-service.initiateRefund`). No number, rate or
  posting rule was touched — only the URL the click reaches — but a control that did nothing now
  mutates finance records, which reads as Tier C.
- I did **not** press refund live on preview. Doing so would mutate a real invoice + ledger, which
  LAW L3 forbids an agent. The live proof above is limited to unauthenticated route existence.
- `reasonCode` is hardcoded to `CANCELLATION` because the button offers no reason picker. If finance
  needs `CORRECTION` / `RETURN` distinguished on the ใบลดหนี้, that needs a UI field — out of scope here.
- The refund button still renders only when `normalizeInvoiceStatus(invoice).includes('PAID')`.
  Gating was not in scope and is unchanged.

## Next

1. Operator review of the behaviour change above before merge.
2. Close P1 as its own item — the 5 call sites listed, plus an eslint rule or an api-client wrapper
   that makes an ignored `ApiResponse` a lint error.
3. `documents-step.tsx:150` deserves its own bug entry (orphaned draft documents).

Evidence: this file · test `apps/web-app/src/app/provider/accounting/__tests__/invoice-detail-modal-refund.test.tsx`
