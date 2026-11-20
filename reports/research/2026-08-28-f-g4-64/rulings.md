# F-G4-64 — Documented rulings and design intent: quotation under the checkout rail

Read-only research. Repo root `c:/Users/charo/Documents/GitHub/GACP-Certification-Application`, branch
`fix/review-step-shared-dedupe-lens`. Every claim below carries a `file:line` I opened in this session.
No git mutation, no `--apply`, no DB write, no `.env` read, no `apps/backend/keys` access.

Scope note on vocabulary: the repo uses **"operator"** for rulings from 2026-08 onward and **"owner"** for
rulings dated 2026-05-16 / 2026-07-08. I preserve whichever word the source uses; I did not verify that they
are the same person.

---

## 1. The documented rulings, in date order

### R1 — 2026-05-16 · owner (B16-C) · two-money-flow / collection-agent
`apps/backend/config/invoice-issuers.js:5`
> `## Two-money-flow model (confirmed by owner 2026-05-16, batch B16-C)`

`apps/backend/services/journal-entry-service.js:546`
> `// B16-C — STATE-fee short-circuit. Owner-confirmed: the platform never …`

`apps/backend/__tests__/unit/journal-entry-service.test.js:12-18`
> `2026-05-16 (B16-C, two-money-flow correction): owner clarified that the platform NEVER holds the`
> `state-fee cash — applicants transfer the state fee directly to กรมบัญชีกลาง (Treasury).`
> `recordPaymentEntry now short-circuits STATE invoices with { skipped: true,`
> `reason: 'STATE_FEE_NOT_IN_PLATFORM_BOOKS' }.`

Design doc: `docs/architecture/dtam-collection-agent-2026-05-16.md:5` `status: confirmed-by-owner-pending-finance-signoff`;
`:25-34` names the platform a **collection agent** for DTAM and says the applicant makes *one* transfer per phase.
Note this internally conflicts with the "two transfers / two slips" surface the same era shipped
(retired later — see R5 and `reports/design-cleanup-2026-08-21/W14-single-issuer-fee-model.md:69`).

Enforcement of the wall: `apps/backend/__tests__/unit/two-money-flow-contract.test.js:2-11`
> `LOCKS the service-layer invariants between DTAM (state-fee, Treasury) and PLATFORM (Predictive AI) books`
> `so a future regression cannot silently breach the two-money-flow wall. … DTAM accountants must NEVER see`
> `Platform-side data and vice versa`

### R2 — 2026-05-16 · owner · "two into one must be two documents" (single-issuer PER DOCUMENT)
`docs/pdf/single-issuer-document-samples-2026-05-16.md:3-9`, owner directive quoted verbatim in Thai:
> `"จากตัวใบกำกับภาษีอย่างคือ สองใบรวมกัน แต่ต้องเป็นสองใบ หรือเอกสารอื่นๆ ก็ต้องเป็นสองใบ"`
> Translation given in the doc: *"Tax invoices that combine two into one must instead be two separate
> documents. Other documents must also be two."*

**Naming trap:** this doc's phrase "single-issuer" means *one issuer per document* (hence **two** documents).
W14 (R5) uses "single-issuer" to mean *one issuer for the whole platform* (hence **one** document). Two
different rulings share one label; `docs/pdf/single-issuer-document-samples-2026-05-16.md:19-25` cites
ม.86 / ม.86/4 / ม.77/1(10) as the basis of the two-document form.

### R3 — 2026-05-16 · B18-A · the quotation workflow spec (the only end-to-end quotation lifecycle doc)
`docs/architecture/quotation-issuance-2026-05-16.md:9-12`
> `On application SUBMITTED, the platform now auto-issues **two quotations per application** — one DTAM`
> `(state fee, VAT-exempt), one PLATFORM (platform fee + 7% VAT).`

The flow diagram, `:16-75`, is the canonical documented lifecycle:
```
POST /api/applications/submit → writeApplicationStatus(DRAFT → SUBMITTED → PENDING_DOC_FEE)
                              → issueQuotationsForApplication(...) [fire-and-forget]
GET  /api/applications/:id/quotations                          → { dtam, platform }
POST /api/applications/:id/quotations/:issuerType/accept       → status PENDING → ACCEPTED
applicant pays Phase 1 (two transfers — DTAM + PLATFORM slips)
phase-billing-service spawns Invoice rows from quotation.installments
       → quotationService.markQuotationInvoiced(...)           → ACCEPTED → INVOICED
```
`:141-144`
> `When the applicant clears each phase gate (phase-billing-service / payment-service-phase-flow), one Invoice`
> `row is spawned per installment carrying the same money triple. The parent Quotation flips`
> `ACCEPTED → INVOICED on the first spawn (idempotent).`

Open questions the doc itself never closed — `:180-199` — include #3 **"Quotation cancellation — schema has
REJECTED / EXPIRED states but no service method for them yet. Defer until Ops asks for it (expected use:
cancel after a long PENDING_DOC_FEE with no payment)."**

### R4 — 2026-07-08 · owner (Q4) · disclosure before payment · **price locked at submission**
`docs/legal/payment-terms-th-v1.md:4-6`
> `(Q4 — owner อนุมัติ 2026-07-08: การเปิดเผยก่อนจ่ายเป็นเงื่อนไขความมีผลบังคับของนโยบายไม่คืนเงิน)`
> `**สถานะ: OWNER อนุมัติแล้ว 2026-07-08 — ใช้งานจริง (LIVE ใน modal ชำระเงินบน prod).**`

`docs/legal/payment-terms-th-v1.md:20-21` — the two lines that bind the quotation:
> `- ค่าธรรมเนียมถูก **ล็อกราคา ณ วันยื่นคำขอ** — การปรับราคาภายหลังไม่กระทบคำขอที่ยื่นแล้ว`
> `- ท่านจะได้รับใบเสนอราคาก่อนชำระทุกงวด และใบเสร็จ/ใบกำกับภาษีหลังชำระ`

("Fees are price-locked as at the filing date — a later price change does not affect an already-filed
application. You will receive a quotation before paying **every** installment, and a receipt/tax invoice
after paying.")

Service-layer enforcement of the Q4 gate: `apps/backend/services/payment-slip-service.js:509-517` and its
single call site `:630` (`assertPaymentTermsAcceptedForSlip`), reached only from the **slip** rail.
Consent is non-withdrawable: `apps/backend/middleware/consent-manager.js:81-90`.

### R5 — 2026-08-22 · operator · **W14 single issuer, VAT on the whole ค่าบริการ**
`HARNESS_LOG.md:344-351`. Heading `:344`
> `## 2026-08-22 — operator: รื้อวิธีคิดเงินใหม่ทั้งหมด บริษัทเป็นผู้ออกเอกสารรายเดียว`

`HARNESS_LOG.md:345`, operator verbatim:
> `คำสั่ง operator: "เราไม่มีการคิดเงินซับซ้อนแล้ว บริษัทจะเป็นคนออกใบเสนอราคา ใบวางบิล และใบเสร็จ เท่านั้น`
> `หมายความว่าเกษตรกรจ่ายเงินเข้าบริษัท ส่วนที่เหลือบริษัทจะเป็นคนเคลียร์บิลกับกรมเอง จะเท่ากับ ราคาเต็ม +`
> `ค่าแพลตฟอร์ม = ค่าบริการ แล้วเอาค่าบริการมา + VAT 7% และเคลียร์วิธีการคำนวนเก่าออกให้หมด"`
> `+ "ค่าใบอนุญาตปลูก 50,000 ... เราไม่มี 50000 บาทนะ"`

`HARNESS_LOG.md:347` — the formula; `:349` — the issuer:
> `**ผู้ออกเอกสาร:** เหลือรายเดียว = บริษัท (ใบเสนอราคา/ใบวางบิล/ใบเสร็จ) · เกษตรกรจ่ายเข้าบริษัท ·`
> `บริษัทเคลียร์กับกรมเอง ⇒ โมเดล 2 ผู้ออกใบ (DTAM/PLATFORM) … เลิกใช้`

`HARNESS_LOG.md:351` — figures confirmed, second operator message "ยืนยัน":
> `ยอดชำระใหม่ต่อรูปแบบการปลูก 1/2/3 = **35,310 / 70,620 / 105,930** … คำขอใหม่แบ่ง 2 งวดตามสัดส่วน`
> `5,000:25,000 ของราคาเต็ม · ต่ออายุเก็บครั้งเดียวเต็มจำนวน · อนุมัติให้ agent แก้เส้นเงินได้ตามมตินี้`
> `(ข้อยกเว้น L3 ต่อเนื่องจาก eabfc020)`

Code headers that cite this ruling by commit hash:
- `apps/backend/modules/billing/internal/fee-service.js:4-5` — `Business rule (W14 — operator ruling 2026-08-22, HARNESS_LOG.md c28355ea, figures confirmed d1c33ea0)`; the formula itself at `:122-125`, `:143-146`.
- `apps/backend/services/quotation-service.js:8-18` — `W14 (operator ruling 2026-08-22, HARNESS_LOG.md c28355ea): one Application → ONE Quotation row … The farmer pays the company, and the company settles with DTAM outside this system.`
- `apps/backend/services/payment-slip-service.js:468-478` — same citation, on the gate fix.
- `apps/backend/__tests__/unit/two-money-flow-contract.test.js:1051`, `split-payment-calculator.test.js:20`, `money-equation-property.test.js:15`, `pricing-two-money-flow.test.js:35`, `stripe-checkout-engine.test.js:194,479`, `retired-vat-formula-never-documented.test.js:6`, `renewal-fee-ssot.test.js:169`, `quotation-service.test.js:158,260` — all `W14 (operator ruling 2026-08-22, HARNESS_LOG.md c28355ea)`.

Implementation write-up (still marked PENDING at the top of the file):
`reports/design-cleanup-2026-08-21/W14-single-issuer-fee-model.md:6`
> `Authority: operator ruling 2026-08-22 — HARNESS_LOG.md c28355ea (model) + d1c33ea0 (figures confirmed).`
> `Continuing L3 exception.`

W14 §4 `:100-103` explicitly **retires** the two-money-flow invariants:
> `**RETIRED by the ruling (2)** 1. Two tax IDs / two issuers. … 2. Per-issuer separation …`
> `Also retired, following from those: "VAT คิดจากค่าบริการเท่านั้น (ไม่รวมค่าธรรมเนียมรัฐ)"; the`
> `two-transfer / two-slip model; the collection-agent notation.`

### R6 — 2026-08-22 · operator · renewal is ONE charge, per scope, L3 exception for the quotation path
`HARNESS_LOG.md:316-321` (final version of the renewal ruling, superseding all earlier same-day text) and
`HARNESS_LOG.md:323-327`:
> `## 2026-08-22 — operator อนุมัติ diff เส้นเงินของการต่ออายุ (ข้อยกเว้น L3 เฉพาะครั้ง)`
> `คำสั่ง operator: "Q1 จัดการทั้งหมดให้เรียบร้อบ"`
> `อนุญาตให้ agent แก้เส้นทางออกใบเสนอราคา/ใบแจ้งหนี้ของ **การต่ออายุ** … ขอบเขตที่อนุญาต: quotation-service`
> `(สาขา renewalOf), phase-billing-service …, **การผูก checkout กับ quotation ใบนั้น**`
> `ขอบเขตที่ยัง**ห้าม**: ตรรกะ settlement/webhook, การคำนวณของคำขอใหม่ …`

This is the **only** ruling in the repo that authorises touching "the binding of checkout to that quotation",
and it is scoped to renewals only. Settlement logic is explicitly still off-limits.
Cited in code at `apps/backend/services/checkout/stripe-checkout-service.js:48-56` and
`apps/backend/services/renewal-service.js:10`.

### R7 — the checkout rail's own approved design (no quotation in it at all)
`apps/backend/shared/checkout-status.js:5-19`
> `Checkout-order lifecycle SSOT — Wave 1 of the single lump-sum checkout engine`
> `(docs/payment-refactor/step2-data-model-design.md v2, approved).`
> `The canonical 7-step workflow has exactly two payment gates … Each gate is a CheckoutOrder whose ONLY`
> `path to SETTLED is the cryptographically verified Stripe payment_intent.succeeded webhook — no human`
> `role holds that transition.`

Transition table `:41-46`: `PENDING_PAYMENT → SETTLED | EXPIRED | CANCELLED`, `EXPIRED → PENDING_PAYMENT`,
`SETTLED → ()`, `CANCELLED → ()`. There is **no** quotation state in this SSOT.

`docs/payment-refactor/step2-data-model-design.md:10-24` locks the 7-step shape; `:28` states the first
design principle:
> `1. **One checkout = one order = one invoice = one (eventual) charge.** The four-invoices-per-application`
> `shape dies; the itemized breakdown moves into line items and denormalized totals on the order.`

**Word "quotation" appears zero times in `docs/payment-refactor/step2-data-model-design.md`** (grep for
`quotation|Quotation|accept` returned nothing). Its §6 "What this deliberately does NOT decide" (`:298-304`)
lists D2/D3/D4/Wave-3 vocabulary — the quotation is not among them either. The checkout rail was designed
as if the quotation did not exist.

Settlement contract: `apps/backend/services/checkout/checkout-settlement-service.js:3-35` enumerates the five
things the settle transaction covers (order → SETTLED, invoice → paid + receipt columns, journal entry,
the one `PLATFORM_TAX_INVOICE`, and the workflow unlock). **The quotation is not step 6, and the word
"quotation" appears nowhere in that file** (grep of `services/checkout/` returns only two comment hits,
both in `stripe-checkout-service.js:54-55`).

### R8 — 2026-08-27/28 · the F-G4 QA ledger rows (findings, not rulings)
`reports/g4-journey/QA-LEDGER.md:34` — **F-G4-64, status `TALK` (awaiting operator)**, verbatim:
> `| F-G4-64 | TALK | **ต้นตอ F-G4-55: ราง checkout ไม่บังคับ "ยอมรับใบเสนอราคาก่อนจ่าย" และ settlement ไม่ปิดใบเสนอราคา**`
> `— ราง slip บังคับ (payment-slip-service QUOTATION_NOT_ACCEPTED) แต่ stripe-checkout-service ไม่มี gate และ`
> `checkout-settlement-service ไม่แตะ quotations ⇒ คำขอ B (CERTIFIED, จ่ายครบ) มี QT-PRD-2026-000002 (105,930)`
> `ค้าง PENDING พร้อมปุ่ม "ยอมรับใบเสนอราคา" บนหน้าชำระเงิน · ตัวเลือก: (ก) gate สร้าง checkout session ต้อง`
> `ACCEPTED + settlement flip → INVOICED **[แนะนำ: ตรง workflow ที่ QuotationReviewSection ประกาศและตรงราง slip]**`
> `(ข) "จ่าย = ยอมรับ": settlement ตั้ง ACCEPTED→INVOICED เอง · ทั้งสองทาง = money path (Tier C) + a03 ต้องกดยอมรับก่อน`
> `+ ซ่อมแถวเดิมของ B ด้วย script --apply (operator รัน) | scratchpad next-facts.js 2026-08-27;`
> `evidence/g4-rebuild-2026-08-25/c02-b/C02-01 |`

Evidence file named there exists: `evidence/g4-rebuild-2026-08-25/c02-b/C02-01-payments-after-repair.png`
(listed by `ls`; I did not open the image).

`reports/g4-journey/QA-LEDGER.md:25` — F-G4-55, the symptom, now FIXED on the FE only, with the root cause
explicitly deferred: `**ต้นตอ (ราง checkout ไม่ปิดใบเสนอราคา) เปิดเป็น F-G4-64 รอ operator เคาะ**`.

Related open ledger rows on the same money surface: `:14` F-G4-41 (`docs/payment-refactor/step2-data-model-design.md`
§5.5 still documents the retired VAT formula — DOC DEBT), `:24` F-G4-54 (VAT line-item wording),
`:38` F-G4-43 (legacy receipt-PDF path reachable under the same TAX-PRD number), `:41-43` F-G4-35/36/37 (merged).

`HARNESS_LOG.md:664` — the open-items line of the latest session:
> `- **ค้าง operator**: (1) คำว่า merge … (2) F-G4-64 ต้นตอ quotation ค้าง PENDING ใต้ราง checkout — แนะนำทาง (ก)`
> `gate + settlement flip (3) F-G4-56 …`

---

## 2. What the code actually does today (the check against the documents)

| Step | Slip rail | Checkout rail |
|---|---|---|
| Issue quotation | `applications.js:1211` / `application-review-revision-methods.js:317`, fire-and-forget, initial submit only | same (rail-agnostic) |
| Row created | `quotation-service.js:550-564` — ONE row, `status: PENDING`, `validUntil = +30d` (`:114`) | same |
| Accept | `POST …/quotations/:issuerType/accept` → `quotations.js:303` `markQuotationAccepted` | same endpoint, but nothing requires it |
| **Gate before pay** | **YES** — `payment-slip-service.js:448-506` `assertQuotationAcceptedForPhase1Slip` (doc comment `:436-447`), throws `QUOTATION_NOT_ACCEPTED` | **NO** — `routes/api/finance/payments.js:409-434` `POST /api/payments/checkout` checks only the Stripe flag, health auth, and a UUID |
| Payment-terms (Q4) consent gate | **YES** — `payment-slip-service.js:630` | **NO** — grep of `services/checkout/` for `consent\|PAYMENT_TERMS` returns nothing |
| Price of record honoured at charge time | `payment-service-phase-flow.js:29-71` overlays `getFrozenPhaseFees`, logs `[QUOTE_PRICE_DRIFT] … honoring the frozen quote` | **NO** — no file under `apps/backend/services/checkout/` calls `getFrozenPhaseFees` (verified by repo-wide grep: callers are `application-service.js:14`, `payment-service.js:152`, `payment-service-phase-flow.js:26` only) |
| Quotation → INVOICED after payment | **never happens** | **never happens** |

Two facts worth stating plainly because they are stronger than F-G4-64 says:

1. **`markQuotationInvoiced` has no production call site anywhere in the repo.** A grep across
   `apps/backend/{services,routes,modules,jobs,controllers}` returns only its own definition
   (`quotation-service.js:699-726`), its export (`:737`), and tests
   (`__tests__/unit/quotation-service.test.js:354,377`, `__tests__/integration/quotation-accept-to-phase1-gate-flow.test.js:176`).
   The `ACCEPTED → INVOICED` step of the documented lifecycle (R3, `docs/architecture/quotation-issuance-2026-05-16.md:73-74,141-144`)
   was never wired on **either** rail. The comment at `quotation-service.js:690-692` still promises a call
   site that does not exist: `call site is the invoice-generation path (Tier 19) once it spawns the four
   downstream Invoice rows from the quotation's installments` — and the "four downstream Invoice rows" shape
   is itself retired (`step2-data-model-design.md:28`).

2. **`REJECTED` and `EXPIRED` have no writer either.** `quotation-service.js:88-96` declares them; the doc
   flagged the gap in 2026-05-16 (`docs/architecture/quotation-issuance-2026-05-16.md:191-193`) and it is
   still open. `validUntil` is written at `quotation-service.js:531-533` and read by nobody on the payment
   path — corroborated by `reports/sku/SKU-SPEC.md:532` (F10: *"`validUntil` 30 วันของใบเสนอราคา
   (`quotation-service.js:115`) **วันนี้ไม่มีใครบังคับ** — renderer และ route ไม่เคยอ่าน"*) and
   `reports/sku/design-event.md:473-475`.

---

## 3. What the DOCUMENTED intended workflow for the quotation under the checkout rail is

Stitching only what is written down, the intended sequence is:

1. **Submit issues the price of record.** On the initial `DRAFT → SUBMITTED` transition the platform
   auto-issues the quotation, fire-and-forget and idempotent
   (`docs/architecture/quotation-issuance-2026-05-16.md:22-24,156-162`; code `applications.js:1201-1212`).
   Under W14 that is exactly **one** row, issuer = the company, carrying the whole ค่าบริการ + VAT and
   **both** installments (PHASE_1 and PHASE_2) at once
   (`quotation-service.js:8-13,550-564`; `_buildInstallments` `:326-339`).
2. **The quotation is a price of record, not a display.** `quotation-service.js:26`
   (`a quotation is a price of record`), `:316` (`self-contained, frozen price-of-record`), `:399-402`
   (`the single price-of-record that downstream billing … copies instead of recomputing from mutable formData`).
   The binding customer-facing statement is `docs/legal/payment-terms-th-v1.md:20`: the fee is
   **locked as at the filing date**.
3. **The applicant accepts, and only the applicant.** `routes/api/applications/quotations.js:273-276`
   (*"Provider roles cannot accept on the applicant's behalf — that would defeat the 'applicant authorises
   the bill' semantic"*). One quotation now, so one accept
   (`QuotationReviewSection.tsx:76-84`; the DTAM card is legacy-only, `:67-69`).
4. **Acceptance is what unlocks payment.** `routes/api/applications/quotations.js:316-320`
   (*"Accepting the quotation is what unlocks Phase-1 payment … the hard gate still requires ACCEPTED
   before a slip is allowed"*); FE `QuotationReviewSection.tsx:40-42` (*"accepting a quotation is what
   unlocks the Phase-1 invoice"*) and its user-facing instruction `:356`
   (`กรุณาตรวจสอบรายละเอียดค่าบริการ แล้วยอมรับใบเสนอราคาก่อนชำระเงินงวดที่ 1`).
   Public marketing copy says the same: `apps/web-app/src/app/(marketing)/pricing/page.tsx:48`
   `when: 'ชำระหลังยื่นคำขอและยอมรับใบเสนอราคา'`. The wizard i18n says it too:
   `th-wizard.ts:274` `"กรุณาตรวจสอบและยอมรับใบเสนอราคาเพื่อดำเนินการต่อ"`.
5. **Payment settles by verified webhook only, and one checkout = one order = one invoice = one charge**
   (`shared/checkout-status.js:5-19`; `step2-data-model-design.md:24,28`).
   Under W14 the money charged must be the W14 figures 35,310 / 70,620 / 105,930 per 1/2/3 scopes
   (`HARNESS_LOG.md:351`; `fee-service.js:17-19`).
6. **After payment the quotation is closed out to `INVOICED`,** which is the post-acceptance terminal —
   `docs/architecture/quotation-issuance-2026-05-16.md:73-74,141-144`, and the slip rail's own definition
   `payment-slip-service.js:431-434`:
   > `// Quotation states that count as "the farmer accepted" — ACCEPTED is the direct result of pressing`
   > `// ยอมรับใบเสนอราคา; INVOICED is the post-acceptance terminal (a phase invoice was already generated from it).`
7. **The quotation carries a 30-day validity** (`quotation-service.js:116`,
   `DEFAULT_VALIDITY_DAYS = 30`), after which — per the *proposal*, not a ruling — the farmer should be
   blocked and re-quoted (`reports/sku/design-event.md:473-475`,
   `reports/sku/design-event.md:483`: *"ใบเสนอราคาหมดอายุแล้วเกษตรกรเพิ่งมาจ่าย | บล็อกไว้ ให้ออกใบใหม่ที่ราคาปัจจุบัน"*).

**Where that intent is documented as a rule vs. as prose.** Only steps 1, 2 and 5 are backed by an operator/
owner ruling (R4, R5, R7). Steps 3, 4, 6 are backed by an **architecture doc + code comments + UI copy**
(R3), which is design intent, not a signed ruling — and R3 predates the checkout rail by three months and
describes the retired two-quotation, two-transfer world. Step 7 is a **proposal only**.

---

## 4. Where the documents are silent

1. **The checkout rail's approved design never mentions the quotation.**
   `docs/payment-refactor/step2-data-model-design.md` (the doc `shared/checkout-status.js:5` calls
   *approved*) contains no occurrence of "quotation" or "accept". Its §6 list of deliberate non-decisions
   (`:298-304`) omits it. So there is no document that either kept or dropped the acceptance gate when the
   rail changed — the gate simply did not travel.
2. **No ruling says whether payment implies acceptance.** F-G4-64's option (ข) *"จ่าย = ยอมรับ"*
   (`QA-LEDGER.md:34`) has no supporting document anywhere; it is the ledger author's proposal.
3. **Who closes the quotation, and when, under a rail with no phase-invoice spawn.** R3 bound
   `ACCEPTED → INVOICED` to "phase-billing-service spawns Invoice rows"
   (`docs/architecture/quotation-issuance-2026-05-16.md:71-74`). Under the checkout rail that spawn is
   deliberately dead — `application-phase-invoice-methods.js:415` returns `skipped: 'CHECKOUT_RAIL'`, and
   `quotations.js:327-329` records that (*"F-G4-35: under the checkout rail ensurePhaseInvoices is a no-op…"*).
   No document names a replacement trigger.
4. **Quotation expiry / rejection.** Declared in 2026-05-16 as deferred
   (`docs/architecture/quotation-issuance-2026-05-16.md:191-193`) and never picked up.
5. **`GOALS.md` and `AUDIT_LEDGER.md` say nothing.** A grep for `quotation|Quotation|ใบเสนอราคา` across both
   files returns zero hits. `BACKLOG-FOUND.md` has exactly one hit (`:113`), and it is about the *submit*
   door failing to issue a quotation at all (*"ออกใบเสนอราคาเป็น fire-and-forget: พลาด = logger.warn แล้วตอบสำเร็จ
   (`applications.js:982-991`) ⇒ เกษตรกรถูกบอกให้จ่ายแต่ใบไม่เคยเกิด"*) — not about the accept gate.
6. **`.claude/agents/payment-policy.md` gives no policy content**, only a mandate: `:9-13` says the agent
   translates payment regulation into a state machine and compares it against
   `shared/checkout-status.js`, `shared/dtam-remittance-status.js`, `workflow-transition-service.js` — the
   Quotation model is **not** in that comparison list. `:14-18` forbids the agent from inventing states.
   Neither file in `reports/payment-policy/` closes the quotation question:
   `2026-08-15-money-flow-design-notes.md:3-4` marks itself `**สถานะ: ยังไม่ใช่คำวินิจฉัย**`, and
   `2026-08-18-invoice-family-M2-collision.md:5` is `BLOCKED(operator: L3 money-path / Tier C)`.
7. **`docs/i18n-policy.md` is silent** — grep for `quotation|ใบเสนอราคา|money|เงิน` returns nothing.
   It is relevant to F-G4-61/62 (date helpers), not to F-G4-64.

---

## 5. Where the documents contradict each other (both sides quoted)

### C1 — "You must accept before paying" vs. a rail that never asks
Side A — `routes/api/applications/quotations.js:316-320`:
> `// Accepting the quotation is what unlocks Phase-1 payment … and the hard gate still requires ACCEPTED`
> `// before a slip is allowed.`
and `apps/web-app/src/app/(marketing)/pricing/page.tsx:48` `'ชำระหลังยื่นคำขอและยอมรับใบเสนอราคา'`
and the error catalogue `apps/backend/shared/error-codes.js:2138-2144`
(`messageTh: 'อัปโหลดสลิปงวด 1 ไม่ได้จนกว่าจะยอมรับใบเสนอราคาของฝั่งนั้น'`).

Side B — `apps/backend/routes/api/finance/payments.js:399-434`: the whole checkout door. The only
preconditions are `isStripeCheckoutEnabled()`, `authenticateHealth` + `resolveHealthId`, and a valid UUID.
And `apps/web-app/src/app/health/payments/client-view.tsx:388-406`: the entry renders on
`isCheckoutUiEnabled() && !loading && activeApplicationId && pendingAmount > 0` and says
`คุณสามารถสร้างรายการชำระเงินและชำระผ่านระบบออนไลน์ได้ทันที` — "you can pay right now".

Note the same asymmetry hits the **Q4 payment-terms consent** (R4), not just the quotation:
`payment-slip-service.js:630` enforces it; the checkout door does not.

### C2 — The FE assumes a state the DB does not hold
`apps/web-app/src/components/payments/QuotationReviewSection.tsx:343-347`:
> `// The instruction asks for an action, so it may only appear while that action is still open. On a`
> `// CERTIFIED application both quotations are long ACCEPTED/INVOICED and telling the farmer to accept one`
> `// before paying งวดที่ 1 describes a step that no longer exists.`
Against `reports/g4-journey/QA-LEDGER.md:34`: application B is CERTIFIED and fully paid, and its
`QT-PRD-2026-000002` (105,930) is **still `PENDING` with a live "ยอมรับใบเสนอราคา" button**.
The F-G4-55 fix (`QA-LEDGER.md:25`) hid the *instruction*, not the button, and the ledger says so.

### C3 — "Price of record / locked at filing" vs. the rail that recomputes
Side A — `docs/legal/payment-terms-th-v1.md:20` (`ล็อกราคา ณ วันยื่นคำขอ`), plus
`quotation-service.js:26,316,399-402`, plus the drift-honouring overlay
`payment-service-phase-flow.js:57-71` (`[QUOTE_PRICE_DRIFT] … honoring the frozen quote`).

Side B — `reports/sku/design-event.md:433-435`:
> `**ส่วนที่ recompute สด — สามหน้าจอ:** 1. **การเก็บเงินจริง** — stripe-checkout-service.js:64-83 เรียก`
> `calculateApplicationFees และ **ไม่เคย** เรียก getFrozenPhaseFees เลย`
and `reports/sku/SKU-SPEC.md:499-503`, which tabulates the three recompute points and states:
> `| **การเก็บเงินจริง** | stripe-checkout-service.js:63-69 | เก็บตามราคาใหม่ ขณะที่แถวในฐานข้อมูลเป็นราคาเก่า |`
> `… **ราง checkout ไม่เคยเรียก** (grep ใน services/checkout/ ไม่พบ)`
I re-verified that grep in this session: no `getFrozenPhaseFees` in `apps/backend/services/checkout/`.

So a quotation that is *documented as binding* is, on the paying rail, decorative.

### C4 — The live legal terms still describe the retired model and the retired numbers
`docs/legal/payment-terms-th-v1.md:6` declares itself **LIVE on prod**, and `:15-18` still prints:
> `| งวดที่ 1 — ตรวจเอกสาร | 5,000 บาท | 500 บาท | 35 บาท | **5,535 บาท** |`
> `| งวดที่ 2 — ตรวจประเมิน | 25,000 บาท | 2,500 บาท | 175 บาท | **27,675 บาท** |`
with the column header `ค่าธรรมเนียมรัฐ (กรมการแพทย์แผนไทยฯ — ยกเว้น VAT)` and `:68-72` (§6)
`แพลตฟอร์มเป็นผู้รับชำระแทนและนำส่งเท่านั้น` — the collection-agent model.
Against W14 (`HARNESS_LOG.md:349,351`): one issuer, no VAT-exempt state leg, 5,885 / 29,425 per scope.
`git log -1 -- docs/legal/payment-terms-th-v1.md` → `61b81014 2026-07-08` — the file has not been touched
since the owner approved it, i.e. it predates W14 by six weeks and no ruling has retired it.
The **ToS page** was updated (`terms-of-service/page.tsx:67-71`, and
`reports/design-cleanup-2026-08-21/W14-single-issuer-fee-model.md:67`), so the two customer-facing legal
surfaces now disagree with each other. The ToS also drops the "accept the quotation first" wording that
`pricing/page.tsx:48` keeps.

### C5 — Two rulings, one word: "single issuer"
`docs/pdf/single-issuer-document-samples-2026-05-16.md:3-9` (owner, 2026-05-16) means *two documents, one
issuer each*, citing ม.86/ม.86/4. `HARNESS_LOG.md:349` (operator, 2026-08-22) means *one document, one
issuer, full stop*. `reports/design-cleanup-2026-08-21/W14-single-issuer-fee-model.md:100-103` records the
first as retired, but the 2026-05-16 doc itself carries no superseded marker.

### C6 — The approved data-model doc still documents the retired VAT formula
Already logged as `reports/g4-journey/QA-LEDGER.md:14` (F-G4-41, OPEN):
> `docs/payment-refactor/step2-data-model-design.md §5.5 ยังเขียนสูตร VAT ที่เลิกใช้ (VAT บนค่าแพลตฟอร์มอย่างเดียว)`
> `ขณะที่ SSOT fee-service.js:128-146 … เป็นสูตร W14`
This matters to F-G4-64 because §5.5 is the section `stripe-checkout-service.js:88` cites as its rounding
authority.

### C7 — Documented lifecycle terminal that nothing writes
`docs/architecture/quotation-issuance-2026-05-16.md:141-144` says the parent quotation flips to `INVOICED`
on first invoice spawn. `payment-slip-service.js:431-434` treats `INVOICED` as a real, reachable state.
`quotation-service.js:690-692` names a call site "the invoice-generation path (Tier 19)". No such caller
exists (§2 above). So even option (ก) of F-G4-64 is writing a transition the system has never performed.

---

## 6. Thai-law citations found in the repo — and what I could and could not verify

Sections the repo cites, with where it cites them:
- **ป.รัษฎากร ม.86** — one tax invoice = one VAT-registered seller: `docs/pdf/single-issuer-document-samples-2026-05-16.md:19-20`; `QuotationReviewSection.tsx:12`.
- **ป.รัษฎากร ม.86/4** — full-form tax invoice / single seller: `docs/architecture/quotation-issuance-2026-05-16.md:174`; `quotation-service.js:54`; `reports/sku/SKU-SPEC.md:184` (R3, on the unit-price × qty = amount rule).
- **ป.รัษฎากร ม.77/1 (10)** — state revenue VAT-exempt: `quotation-service.js:55`; `docs/architecture/quotation-issuance-2026-05-16.md:175`. **Retired in substance by W14** — `reports/design-cleanup-2026-08-21/W14-single-issuer-fee-model.md:67` records that the ToS "stated the state fee was VAT-exempt under ม.77/1(10). Both false; rewritten".
- **ป.รัษฎากร ม.86/9 (ใบเพิ่มหนี้) / ม.86/10 (ใบลดหนี้)** — the only lawful way to correct an issued document: `reports/sku/SKU-SPEC.md:530` (F8), which also records `credit_notes` and `debit_notes` are both empty.
- **ป.รัษฎากร ม.105 (ใบรับ)** — `docs/architecture/dtam-collection-agent-2026-05-16.md:17`.
- **กฎกระทรวงการคลังเรื่องเงินรายได้แผ่นดิน** — `quotation-service.js:57`; `docs/architecture/dtam-collection-agent-2026-05-16.md:18`.
- **พ.ร.บ.การอำนวยความสะดวกในการพิจารณาอนุญาตของทางราชการ พ.ศ.2558** — the collection-agent basis: `docs/architecture/quotation-issuance-2026-05-16.md:178`; `docs/architecture/dtam-collection-agent-2026-05-16.md:14,29`.
- **พ.ร.บ.ข้อสัญญาที่ไม่เป็นธรรม พ.ศ.2540** — cited as the exposure that makes disclosure-before-payment load-bearing: `apps/backend/services/payment-slip-service.js:513`.
- **TFRS for NPAEs ch.18 / TAS 18.8 (agent vs principal)** — `quotation-service.js:56`; `apps/backend/__tests__/unit/journal-entry-service.test.js:9-10`.
- **PDPA ม.16** (consent before processing) and **ม.24(3)** (contractual necessity, why PAYMENT_TERMS is non-withdrawable) — `application-review-revision-methods.js:20-24`; `routes/api/identity/consent.js:18`.

**UNVERIFIED — I did not open any authoritative source.** I had no web access in this session and did not
fetch the Revenue Code, the ministerial regulation, or any of the Acts. Every section number above is
reported as *cited by this repo at that line*, not as *verified against the statute*. Anyone acting on the
ม.86/4 or ม.77/1(10) reasoning should read the primary text.

The repo itself already warns against inventing legal backing where none was found —
`reports/sku/SKU-SPEC.md:191` (R10):
> `**ฐานทางกฎหมาย: หาไม่เจอ** — ไม่พบกฎการปัดเศษตามกฎหมายไทยใน ม.86/4, ป.86/2542 หรือประกาศอธิบดีฯ ฉบับที่ 39`
> `… **R1-R9 จึงเป็นกฎของระบบนี้เอง ห้ามพิมพ์หรืออ้างว่าเป็นข้อกำหนดตามกฎหมาย**`

**UNVERIFIED — database state.** I did not query any database. The claim that
`QT-PRD-2026-000002` is `PENDING` on a CERTIFIED, fully-paid application B comes from
`reports/g4-journey/QA-LEDGER.md:34` and its named evidence
(`evidence/g4-rebuild-2026-08-25/c02-b/C02-01-payments-after-repair.png`, file exists; image not opened).
`HARNESS_LOG.md:626` says of the same walk `ยังไม่มี PHASE_* หลัง quotation accept`, which reads as if an
accept happened; the a03 spec (`apps/web-app/e2e-g4/a03-pay-phase1.spec.ts`) contains no
`ยอมรับ`/accept press — a repo-wide grep of `apps/web-app/e2e-g4/` for `ยอมรับ|accept` returns only
unrelated prose and `wizard-steps.ts:390` (the wizard's own terms checkbox). F-G4-64 itself states
`a03 ต้องกดยอมรับก่อน` as work still to do, which is consistent with the button never having been pressed.

---

## 7. Bottom line for the F-G4-64 decision

- The **only rulings** that bind here are: W14 (R5, one issuer, W14 figures), the Wave-1/2 checkout design
  (R7, webhook-only settlement, one order = one invoice = one charge), Q4 (R4, disclosure before payment
  **and price locked at filing**), and the narrow renewal L3 exception (R6, the one place "binding checkout
  to that quotation" was ever authorised, and only for renewals).
- The "accept before pay" requirement is **real but under-ruled**: it exists as architecture doc + route
  comment + error catalogue + public pricing copy + a hard gate on the *slip* rail, and as nothing at all on
  the *checkout* rail. No document ever decided to drop it; it was never carried across.
- Option (ก) in F-G4-64 is the one that matches every written artefact (R3, R4 §"ใบเสนอราคาก่อนชำระทุกงวด",
  the route comment, the slip gate, the FE copy). Option (ข) has no documentary support.
- Whichever option is chosen, three documented gaps sit underneath it and should be named in the same
  decision: `markQuotationInvoiced` has never had a caller (§2.1); `EXPIRED`/`REJECTED`/`validUntil` have no
  writer or reader (§2.2); and the *live* legal terms
  (`docs/legal/payment-terms-th-v1.md`) still promise a price-lock the checkout rail does not honour and
  print figures W14 retired (C3, C4).
