# fix-B1 — invoice download/view 500 for every role, and the button that said nothing

Status: PENDING (code fix GREEN in unit tests + live root cause proven; live GREEN download
blocked on deploy — preview still runs main without this fix, and deploy is operator-only, L5)

## Root cause — confirmed against the schema, not taken on trust

`apps/backend/services/invoice-service.js:312` (pre-fix) selected a column that does not exist:

```js
entity: { select: { id: true, displayName: true, entityType: true } },
```

The discriminator on `Entity` is `type`, not `entityType` — `apps/backend/prisma/schema/entity.prisma:33`:

```prisma
type        String // INDIVIDUAL | JURISTIC | COMMUNITY_ENTERPRISE
```

`entityType` is a legacy **User** column (`prisma/schema/auth.prisma:13`), kept only for the
Phase-62 migration window (`entity.prisma:24` says so explicitly). It was never on `Entity`.
Read straight out of the generated client's DMMF, the full `Entity` field list is:

```
id,uuid,createdAt,updatedAt,type,displayName,slug,thaiCitizenId,thaiCitizenIdHash,
thaiCitizenIdHmac,juristicId,juristicIdHash,communityRegNo,communityRegNoHash,payload,
status,isDeleted,deletedAt,deletedBy,createdBy,members,applications,farms,
contextSwitchesFrom,contextSwitchesTo,membershipEvents,organizationId,organization
```

The other **four** call sites in the same file already had it right — lines 195, 529, 592, 626
all use `{ id: true, type: true, displayName: true }`. `getById` was the only one that drifted.
Prisma rejects the entire query on an unknown select key, so every caller of `getById` died:
`GET /api/invoices/:id`, `GET /api/invoices/:id/pdf` (via `generatePdf` → `getById`), and
`issueReceipt` (`invoice-service.js:390`, whose first line calls `this.getById`).

### The select field is the whole difference — proven live, same invoice, same database

Preview, invoice `c80fe4c0-08fc-4685-b765-509b8e6d7015` (farmer `1100100100012`):

| endpoint | service method | entity select | result |
|---|---|---|---|
| `GET /api/invoices?limit=1` | `listAll` (line 195) | `type` | **200** `application/json`, real invoice data |
| `GET /api/invoices/:id` | `getById` (line 312) | `entityType` | **400** `VALIDATION_ERROR` `application/json` |
| `GET /api/invoices/:id/pdf` | `getById` → `generatePdf` | `entityType` | **500** `text/html`, body `Failed to generate PDF`, 0.28s |

Two sibling queries against the same live schema, differing only in that one word: the one
spelling `type` returns data, the one spelling `entityType` fails. That is the bug, isolated.

## The fix

`apps/backend/services/invoice-service.js:312` → `entity: { select: { id: true, type: true, displayName: true } }`
(plus a comment recording why, so the next drift is caught by eye).

Nothing downstream read `entity.entityType` — grepping `entityType` across
`apps/backend/services/pdf/` and `apps/backend/routes/api/finance/` returns nothing, so no mapping
layer was needed. No amount, no fee, no invoice number, no receipt number and no settlement
behaviour is touched (L3 respected): the diff changes one Prisma select key.

## RED first — backend

A jest mock accepts any select shape, so a mock could never reproduce this. The guard instead
validates the select the **production code actually sends** against the generated Prisma schema
(DMMF) — the same source of truth the real client validates against, and no database required.
`apps/backend/__tests__/unit/invoice-service.test.js` (new describe block at the end).

RED, before the fix:

```
● invoice-service getById — selects only fields that exist in the schema › Entity select in getById() contains no unknown field

    - Array []
    + Array [
    +   "entityType",
    + ]
      at Object.toEqual (__tests__/unit/invoice-service.test.js:317:21)

● ... › still selects the entity type discriminator the PDF/receipt path reads

      Object {
        "displayName": true,
    +   "entityType": true,
        "id": true,
    -   "type": true,
      }

Tests:       2 failed, 9 skipped, 11 total
```

GREEN, after the fix (all 9 pre-existing tests still pass):

```
  invoice-service
    √ marks invoice as PAID_PENDING_RECEIPT when paid
    √ issues receipt and sets RECEIPT_ISSUED status
    √ does NOT overwrite when a concurrent issuance already set a receipt number (race-loser)
    √ returns mapped webhook exceptions for accounting queue
    [X4-FIX-A RC-2] R5-B per-issuer atomic counter
      √ issues a DTAM receipt for *_STATE_FEE invoices (RCP-DTAM prefix)
      √ issues a PLATFORM receipt for *_PLATFORM_FEE invoices (TAX-PRD prefix)
      √ DTAM and PLATFORM receipts allocate from INDEPENDENT counter streams (no collision)
      √ same-issuer sequential allocations increment monotonically (DTAM)
      √ does NOT call tx.invoice.count anymore (legacy shared counter removed)
  invoice-service getById — selects only fields that exist in the schema
    √ Entity select in getById() contains no unknown field
    √ still selects the entity type discriminator the PDF/receipt path reads

Tests:       11 passed, 11 total
```

## Second half — the button that swallowed the failure

Call site: **`apps/web-app/src/app/health/payments/client-view.tsx`** (the invoice-detail modal's
footer, pre-fix line 701). That is the single component holding the download button.

```jsx
onClick={() => void PaymentService.downloadInvoicePdf(detailInvoice.id, detailInvoice.documentNumber)}
```

`downloadInvoicePdf` (`apps/web-app/src/lib/services/payment-service.ts:638-665`) catches its own
error and returns `false`. That boolean was the only trace the failure ever left, and `void` threw
it away. So while the backend 500'd, the farmer pressed the button and nothing happened at all —
no file, no message, no spinner. Indistinguishable from a dead button. They pressed it again.

Fixed inside the component (payment-service.ts is not mine to edit, and did not need to be — the
`false` it already returns is a sufficient signal):

- `handleDownloadInvoice()` awaits the result and sets `downloadError` when it is `false`.
- A `role="alert"` banner renders in the modal, reusing the page's existing error styling
  (`rounded-2xl border border-rose-200 bg-rose-50 … text-rose-700`, same as the load-error banner).
- The button shows `กำลังเตรียมไฟล์` and disables while in flight, so a press is never silent.
- The error clears on retry and on `detailInvoice.id` change, so one invoice's failure never
  greets you on the next one.

Copy, per `.claude/skills/thai-ui-copy/SKILL.md` (cause + next action, never a bare apology):

> ดาวน์โหลดใบแจ้งหนี้ไม่สำเร็จ ระบบสร้างไฟล์ PDF ไม่ได้ในขณะนี้ กรุณาลองอีกครั้ง หากยังไม่สำเร็จ ติดต่อเจ้าหน้าที่การเงินพร้อมแจ้งเลขที่เอกสาร {documentNumber}

No em dash, spaces at the Thai/Latin boundary, no `tracking-*`/`uppercase`/`font-black`, and the
state stays indeterminate — from the browser we cannot tell a server fault from a dropped
connection, so it never claims the invoice itself is bad.

### RED first — web-app

`apps/web-app/src/app/health/payments/__tests__/invoice-download-failure-visible.test.tsx` (new).

RED, before the fix — the download fails and the UI shows nothing:

```
  × shows a Thai error naming the cause and the next action when the download fails (394 ms)
  √ stays silent (no alert) when the download succeeds (52 ms)
  × clears a previous failure when a retry succeeds (26 ms)

    expect(received).toBeTruthy()
    Received: null
      149 |     const alert = c.querySelector('[role="alert"]');
    > 150 |     expect(alert).toBeTruthy();
      at Object.<anonymous> (invoice-download-failure-visible.test.tsx:150:19)

Tests:       2 failed, 1 passed, 3 total
```

Note the middle test passed in RED — that is the point: success and failure were **identical** on
screen. Only the two failure assertions could tell them apart, and both were red.

GREEN, after the fix:

```
PASS src/app/health/payments/__tests__/invoice-download-failure-visible.test.tsx
  √ shows a Thai error naming the cause and the next action when the download fails (156 ms)
  √ stays silent (no alert) when the download succeeds (43 ms)
  √ clears a previous failure when a retry succeeds (48 ms)
Tests:       3 passed, 3 total
```

No regression in the five sibling suites on this page — `jest src/app/health/payments/__tests__/`
→ `Test Suites: 6 passed, 6 total / Tests: 19 passed, 19 total`.
ESLint clean on all four touched files (`--max-warnings=0`, exit 0), which is what enforces the
Thai typography rule.

## The receipt door — measured, not assumed

Same `getById`, so `issueReceipt` never got past its first line. Counted live on preview with the
account provider token (read-only `GET /api/invoices?limit=500`):

```
total invoices returned: 60
receiptAttempts===0     : 60
receiptNumber set       : 0
paid-ish invoices       : 12
```

60 of 60 invoices have never had a single receipt attempt, and 12 of them are already paid — those
are the ones owed a receipt right now. Matches the bug report's "60 invoices, zero receipt
attempts" exactly. This fix unblocks that door; it does not itself issue anything.

## Live verification — what I got, and what is still owed

`GET https://preview.gacpth.com/api/invoices/c80fe4c0-.../pdf` with a real farmer token
(`1100100100012`, health login → `data.tokens.accessToken`):

```
status=500  content_type=text/html; charset=utf-8  bytes=22  time=0.276s
body: Failed to generate PDF
```

**That is the pre-fix reading.** Preview runs main, and this fix is not merged, so a live 200 is
not obtainable from here: deploying is operator-only under L5 and I did not attempt it. I am not
claiming a green live download I did not see. What I can show live is the discriminator in the
table above — on the same invoice and the same database, the `type` spelling returns 200 and the
`entityType` spelling does not. The live 200 on the PDF route should be re-run after deploy; the
expected reading is `status=200 content_type=application/pdf`.

## Not fixed — outside my files

- `apps/backend/routes/api/finance/invoices.js:163` answers the PDF route's 500 with
  `res.status(500).send('Failed to generate PDF')` — plain text under `text/html`, which is why
  the browser had nothing structured to show even once the fetch failed. The bug report asks for
  JSON here. That file is not in my ownership list, so I left it. It is a one-line change and
  worth doing: it would let the client distinguish failure modes instead of guessing.
- `apps/web-app/src/lib/services/payment-service.ts:648-665` still catches, `console.error`s and
  returns a bare `false`, discarding the status code and any server message. The component now
  makes the failure visible regardless, but the *reason* still cannot reach the user. Threading
  the status through would need that file, which is also not mine.
- An attempted extra proof did not work and is recorded so nobody repeats it: constructing the
  bad select on a real `PrismaClient` with an unreachable URL throws
  `PrismaClientInitializationError` (connection) **before** any validation error, so it does not
  discriminate. The DMMF check is the reliable no-database guard.

## Files changed

- `apps/backend/services/invoice-service.js` — one select key, `entityType` → `type`, + comment.
  (The task named `apps/backend/modules/billing/internal/invoice-service.js`; no such path exists.
  `find apps/backend -name "invoice-service*"` returns only `services/invoice-service.js` and its
  test. The bug report's own path, `apps/backend/services/invoice-service.js:312`, is the right one.)
- `apps/backend/__tests__/unit/invoice-service.test.js` — DMMF select guard (2 tests).
- `apps/web-app/src/app/health/payments/client-view.tsx` — visible download failure + in-flight state.
- `apps/web-app/src/app/health/payments/__tests__/invoice-download-failure-visible.test.tsx` — new (3 tests).

No git command was run. No amount, fee, or invoice/receipt number was touched. Nothing was created
on preview; all live calls were reads.
