# LIVE REGISTER — quotations vs checkout charges (demo DB)

Read-only. Scripts: `C:/Users/charo/AppData/Local/Temp/claude/c--Users-charo-Documents-GitHub-GACP-Certification-Application/b4785f3a-0000-4aa9-93aa-d4f9bb2aeda9/scratchpad/register.js` and `.../scratchpad/register2.js` (dotenv from repo-root `.env`, PrismaClient from `apps/backend/node_modules`, `$queryRawUnsafe` SELECT only).
Raw output: `.../scratchpad/register.out.txt`. Run date 2026-08-28. No connection string, credential or `.env` value was printed.
Applicant names / healthIds were never selected. Application UUIDs are masked to their first 8 hex chars.

Table row counts (register2.js `COUNTS`): applications 4 · quotations 3 · quotes (legacy) 4 · invoices 14 · checkout_orders 6 · payment_slips **0** · payment_transactions 10 · certificates 3.

---

## A. Applications (table `applications`)

| # | id(8) | applicationNumber | status | phase1Status | phase2Status | scopes | createdAt |
|---|---|---|---|---|---|---|---|
| A1 | d74191d7 | APP-2569-MT87HW1N-450568 | CERTIFIED | PAID | PAID | 1 | 2026-08-25 05:10:19 |
| A2 | 29422e73 | APP-2569-MTA5YEJO-A1B2F3 | CERTIFIED | PAID | PAID | 1 | 2026-08-26 14:02:42 |
| A3 | dc59466a | APP-2569-MTAWQSRD-4ADDEC | CERTIFIED | PAID | PAID | 3 | 2026-08-27 02:32:37 |
| A4 | ffeca61c | APP-2569-MTBZ8WCX-254184 | PENDING_DOC_FEE | PROCESSING | PENDING | null | 2026-08-27 20:30:27 |

Certificates (table `certificates`): A1 → GACP-TH-2569-CAE820 (`revoked`) · A2 → GACP-TH-2569-E5960D (`active`) · A3 → GACP-TH-2569-4C3761 (`active`). A4 none.

## B. Quotations (table `quotations`) — 3 rows, all `issuerType='PLATFORM'`, none soft-deleted

| app | quotationNumber | issuerType | status | subtotal | vat | totalAmount | acceptedAt |
|---|---|---|---|---|---|---|---|
| A1 d74191d7 | QT-PRD-2026-000001 | PLATFORM | **PENDING** | 33,000.00 | 2,310.00 | **35,310.00** | **null** |
| A3 dc59466a | QT-PRD-2026-000002 | PLATFORM | **PENDING** | 99,000.00 | 6,930.00 | **105,930.00** | **null** |
| A4 ffeca61c | QT-PRD-2026-000003 | PLATFORM | **PENDING** | 33,000.00 | 2,310.00 | **35,310.00** | **null** |

**A2 (29422e73) has NO row in `quotations` at all.** Status histogram over the whole table: `{PENDING: 3}` — zero ACCEPTED, zero INVOICED, zero REJECTED, zero DTAM-issuer rows.

`installments` JSON keys (identical shape on all three rows): `phase`, `amount`, `vatAmount`, `scopeCount`, `stateAmount`, `platformAmount`.

Per-phase amounts:

- QT-PRD-2026-000001 (A1): `[{PHASE_1: amount 5885, vatAmount 385, scopeCount 1, stateAmount 5000, platformAmount 500}, {PHASE_2: amount 29425, vatAmount 1925, scopeCount 1, stateAmount 25000, platformAmount 2500}]`
- QT-PRD-2026-000002 (A3): `[{PHASE_1: amount 17655, vatAmount 1155, scopeCount 3, stateAmount 15000, platformAmount 1500}, {PHASE_2: amount 88275, vatAmount 5775, scopeCount 3, stateAmount 75000, platformAmount 7500}]`
- QT-PRD-2026-000003 (A4): identical to QT-PRD-2026-000001.

## C. Legacy `quotes` table (4 rows — the retired pre-W14 pair-per-phase stream)

| id(8) | app | quoteNumber | status | totalAmount |
|---|---|---|---|---|
| 3ac00763 | A1 d74191d7 | QT-202608250001 | sent | 5,000.00 |
| 735b5be2 | A1 d74191d7 | QT-202608250002 | sent | 885.00 |
| 54cf2749 | A2 29422e73 | QT-202608260003 | sent | 5,000.00 |
| e755f6f8 | A2 29422e73 | QT-202608260004 | sent | 885.00 |

These are `Invoice.quoteId` targets (`apps/backend/prisma/schema/billing.prisma:3-30`), a different model from `Quotation` (`billing.prisma:721`). They price PHASE_1 only.

## D. Invoices (table `invoices`) — 14 rows

| app | invoiceNumber | serviceType | status | totalAmount | receiptNumber |
|---|---|---|---|---|---|
| A1 | INV-202608250001 | PHASE_1_STATE_FEE | CANCELLED | 5,000.00 | — |
| A1 | INV-202608250002 | PHASE_1_PLATFORM_FEE | CANCELLED | 885.00 | — |
| A1 | INV-CO-3CEAC7B4-M1 | CERTIFICATION_CHECKOUT_M1 | paid | **5,885.00** | TAX-PRD-2026-000001 |
| A1 | INV-P2-ST-2569-0A9954-MT8NGF53-930E4C | PHASE_2_STATE_FEE | CANCELLED | 25,000.00 | — |
| A1 | INV-P2-PF-2569-0A9954-MT8NGF53-6F8CD3 | PHASE_2_PLATFORM_FEE | CANCELLED | 4,425.00 | — |
| A1 | INV-CO-E03B909A-M2 | CERTIFICATION_CHECKOUT_M2 | paid | **29,425.00** | TAX-PRD-2026-000002 |
| A2 | INV-202608260007 | PHASE_1_STATE_FEE | CANCELLED | 5,000.00 | — |
| A2 | INV-202608260008 | PHASE_1_PLATFORM_FEE | CANCELLED | 885.00 | — |
| A2 | INV-CO-D810DEBF-M1 | CERTIFICATION_CHECKOUT_M1 | paid | **5,885.00** | TAX-PRD-2026-000003 |
| A2 | INV-P2-ST-2569-7EEC3C-MTAA3AGM-66DBE7 | PHASE_2_STATE_FEE | CANCELLED | 25,000.00 | — |
| A2 | INV-P2-PF-2569-7EEC3C-MTAA3AGM-6D6EFC | PHASE_2_PLATFORM_FEE | CANCELLED | 4,425.00 | — |
| A2 | INV-CO-F785F58B-M2 | CERTIFICATION_CHECKOUT_M2 | paid | **29,425.00** | TAX-PRD-2026-000004 |
| A3 | INV-CO-59E32623-M1 | CERTIFICATION_CHECKOUT_M1 | paid | **17,655.00** | TAX-PRD-2026-000005 |
| A3 | INV-CO-BC4782B2-M2 | CERTIFICATION_CHECKOUT_M2 | paid | **88,275.00** | TAX-PRD-2026-000006 |

All six `paid` invoices carry `receiptStatus='ISSUED'` and `paymentMethod='STRIPE'`. All eight CANCELLED rows have `receiptNumber = null`. A4 has **no invoice rows**. A3 has **no legacy split invoices** (created after the checkout retirement).

## E. Checkout orders (table `checkout_orders`) — 6 rows, all `SETTLED`

| app | milestone | status | dtam_fee_amount | platform_fee_net | platform_fee_vat | platform_fee_gross | total_payable_amount | settledAt | dtam_remittance_status |
|---|---|---|---|---|---|---|---|---|---|
| A1 | M1 | SETTLED | 5,000.00 | 500.00 | 385.00 | 885.00 | **5,885.00** | 2026-08-25 12:18:48 | PENDING |
| A1 | M2 | SETTLED | 25,000.00 | 2,500.00 | 1,925.00 | 4,425.00 | **29,425.00** | 2026-08-25 12:39:26 | PENDING |
| A2 | M1 | SETTLED | 5,000.00 | 500.00 | 385.00 | 885.00 | **5,885.00** | 2026-08-26 14:40:02 | PENDING |
| A2 | M2 | SETTLED | 25,000.00 | 2,500.00 | 1,925.00 | 4,425.00 | **29,425.00** | 2026-08-26 16:00:56 | PENDING |
| A3 | M1 | SETTLED | 15,000.00 | 1,500.00 | 1,155.00 | 2,655.00 | **17,655.00** | 2026-08-27 04:27:41 | PENDING |
| A3 | M2 | SETTLED | 75,000.00 | 7,500.00 | 5,775.00 | 13,275.00 | **88,275.00** | 2026-08-27 04:37:17 | PENDING |

A4 has **no checkout_orders row**. Every settled order is bound to its invoice via `invoiceId` (all six non-null). All six sit at `dtamRemittanceStatus='PENDING'` — no batch has been cut.

## F. Payment transactions (10 rows; `amount` in SATANG per `billing.prisma:309+` comment "Amount in SATANG")

Four `BANK_TRANSFER` rows stuck at `PENDING` — one per application, minted minutes after the quotation:
A1 588500 (2026-08-25 12:07:30) · A2 588500 (2026-08-26 14:13:57) · A3 1765500 (2026-08-27 04:23:07) · A4 588500 (2026-08-27 20:43:55).
Six `STRIPE` rows at `SUCCESS`, matching the six settled orders exactly (588500 and 2942500 twice each, 1765500, 8827500).

## G. `payment_slips`: **0 rows in the entire database.**

---

# ANSWERS

## Q1 — Does the quotation total equal the sum of the checkout charges for the same application?

| app | quotation total | sum of checkout `total_payable_amount` | delta | verdict |
|---|---|---|---|---|
| A1 d74191d7 | 35,310.00 | 5,885.00 + 29,425.00 = **35,310.00** | **0.00** | EQUAL |
| A3 dc59466a | 105,930.00 | 17,655.00 + 88,275.00 = **105,930.00** | **0.00** | EQUAL |
| A2 29422e73 | **no quotation exists** | 5,885.00 + 29,425.00 = 35,310.00 | n/a | **NOT COMPARABLE — 35,310.00 charged, receipted and CERTIFIED with no quotation of record** |
| A4 ffeca61c | 35,310.00 | no orders = 0.00 | 35,310.00 | in-flight (PENDING_DOC_FEE / phase1 PROCESSING) — expected |

The match is exact down to the component, not just the total. For A1: quotation installment `PHASE_1.stateAmount 5000 / platformAmount 500 / vatAmount 385 / amount 5885` equals order M1 `dtam 5000 / net 500 / vat 385 / total 5885`; `PHASE_2 25000/2500/1925/29425` equals order M2. For A3 (3 scopes): `PHASE_1 15000/1500/1155/17655` equals M1; `PHASE_2 75000/7500/5775/88275` equals M2. Money arithmetic on the settled rail is clean: 2 for 2 wherever a quotation exists.

Note on the VAT base: `platform_fee_vat` 385 is 7% of (5,000 state + 500 platform) = 5,500 — VAT charged on the whole ค่าบริการ including the state fee, not on the 500 platform fee alone. This is deliberate, not drift: `apps/backend/services/checkout/stripe-checkout-service.js:89-99` pins it to operator ruling W14 (2026-08-22), recorded in `reports/design-cleanup-2026-08-21/W14-single-issuer-fee-model.md:6` as HARNESS_LOG.md `c28355ea` (model) + `d1c33ea0` (figures confirmed). **UNVERIFIED (law):** I did not open an authoritative source (ประมวลรัษฎากร / Revenue Department) in this session, so I make no claim about whether VAT-on-the-state-fee is correct under Thai tax law — only that the code does it on a recorded operator ruling, and that the DB CHECK constraints it satisfies (`platform_fee_gross = net + vat`, `total = dtam + gross`, `billing.prisma:1271-1279`) do not constrain the VAT base at all.

## Q2 — Which quotations are still PENDING though the phase they price is paid?

**Two of three — and in fact all three quotations in the database are PENDING with `acceptedAt = null`; the table has never held an ACCEPTED or INVOICED row.**

| quotation | app | status | acceptedAt | phases priced | actually paid? |
|---|---|---|---|---|---|
| **QT-PRD-2026-000001** | A1 d74191d7 | PENDING | null | PHASE_1 + PHASE_2 | **BOTH PAID** — M1 settled 2026-08-25 12:18:48, M2 settled 12:39:26; app CERTIFIED; cert CAE820 issued (later revoked) |
| **QT-PRD-2026-000002** | A3 dc59466a | PENDING | null | PHASE_1 + PHASE_2 | **BOTH PAID** — M1 settled 2026-08-27 04:27:41, M2 settled 04:37:17; app CERTIFIED; cert 4C3761 active |
| QT-PRD-2026-000003 | A4 ffeca61c | PENDING | null | PHASE_1 + PHASE_2 | nothing paid — correctly PENDING |

So 35,310.00 (A1) plus 105,930.00 (A3) — **141,240.00 THB** — was collected, receipted (TAX-PRD-2026-000001 … 000006) and certified against quotations that still read "PENDING, never accepted".

### Why (mechanism, verified in code)

1. The quotation-acceptance gate exists **only on the slip rail**: `apps/backend/services/payment-slip-service.js:448` `assertQuotationAcceptedForPhase1Slip`, whose only call site is `payment-slip-service.js:623` inside the slip-upload path. It throws `QUOTATION_NOT_ACCEPTED` at `payment-slip-service.js:497-505` unless status is in `['ACCEPTED','INVOICED']` (`payment-slip-service.js:434`).
2. The **Stripe checkout rail never looks at a quotation**. `grep -n "quotation\|Quotation" apps/backend/services/checkout/stripe-checkout-service.js` returns only two comment lines (54, 55); the same grep on `apps/backend/services/checkout/checkout-settlement-service.js` returns nothing at all. No gate before charging, no status flip on settle.
3. `markQuotationAccepted` has exactly **one** production caller — the applicant-facing accept route `apps/backend/routes/api/applications/quotations.js:303`. Nobody pressed it for A1 or A3.
4. `markQuotationInvoiced` (`apps/backend/services/quotation-service.js:699`) has **zero production callers** — only its own definition and the export at `quotation-service.js:737`. Its own docstring says the call site "is the invoice-generation path (Tier 19)" (`quotation-service.js:687-691`); that path never wired up, so no quotation in this system can reach INVOICED at all.
5. Rows are born PENDING: `quotation-service.js:559` writes `status: QUOTATION_STATUS.PENDING`. `PENDING` is not in the vocabulary the schema comment documents (`billing.prisma:753`: `DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED | INVOICED`); it exists only in the service enum at `quotation-service.js:88-96`. The DB agrees with the service, not with the schema comment.

### The separate A2 gap

A2 (29422e73, CERTIFIED, cert E5960D active, 35,310.00 collected) has **no `quotations` row at all**. Its only price-of-record is the two retired `quotes` rows QT-202608260003/4 covering PHASE_1 only (5,000 + 885 = 5,885) — nothing anywhere prices its 29,425.00 PHASE_2 charge. On the slip rail this would have hit the documented "legacy fail-open" branch (`payment-slip-service.js:487-494`, log text "no quotation ... allowing PHASE_1 slip"); on the checkout rail there is no branch to hit, because there is no lookup.

## Q3 — Any application on the slip rail with an ACCEPTED/INVOICED quotation (the intended flow, as a control)?

**No. There is no control in this database.**

- `payment_slips` has **0 rows** — not one application is on the slip rail. Every baht here moved through Stripe checkout (6 SUCCESS STRIPE transactions, 6 SETTLED orders, `paymentMethod='STRIPE'` on all six paid invoices).
- The `quotations` status histogram is `{PENDING: 3}` — no row in the table has ever been ACCEPTED or INVOICED, so no application anywhere, slip rail or not, satisfies the control condition.
- The closest trace of the slip rail is the four `PENDING` `BANK_TRANSFER` payment_transactions (section F) — one per application, each created 1 to 13 minutes after its quotation, then abandoned. The intent was recorded; no slip ever followed.

Consequence: **the ACCEPTED/INVOICED gate has never been exercised end-to-end in this dataset.** The `['ACCEPTED','INVOICED']` check at `payment-slip-service.js:497` is live code guarding a rail nobody used, while the rail that actually collected 141,240.00 THB and minted 3 certificates has no such check.

---

## Cross-checks and limits

- Every figure above is a row read from the demo DB on 2026-08-28 via the two scripts named at the top; nothing is carried over from memory or from prior reports.
- The delta = 0.00 result in Q1 is arithmetic on `Decimal(15,2)` values cast to text by Postgres, not float math.
- **UNVERIFIED:** whether A2's missing quotation was deleted or never created. `quotations` holds no soft-deleted rows (`isDeleted=false` on all 3 existing rows, and no 4th row exists for A2), but this DB keeps no row-level history I could read to distinguish the two cases.
- **UNVERIFIED (law):** no authoritative Thai legal source was opened in this session. No claim is made here about ประมวลรัษฎากร / VAT-base correctness or about ค่าธรรมเนียม treatment; the VAT base is reported only as what the code does under a recorded operator ruling.
