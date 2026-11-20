> ## ⚠️ เอกสารนี้บันทึกโมเดลที่เลิกใช้แล้ว (ปักป้าย 2026-09-05)
>
> ตัวเลขค่าธรรมเนียมและจุดยืนทางภาษีในเอกสารนี้เป็นของสูตรก่อน W14 (VAT คิดเฉพาะส่วนแพลตฟอร์ม)
> ปัจจุบัน: **ผู้ออกเอกสารรายเดียว · VAT 7% บนค่าบริการทั้งก้อน · งวด 1 = 5,885 · งวด 2 = 29,425**
> เก็บไว้อ่านเป็นบันทึกประวัติ · ความจริงปัจจุบัน: `apps/backend/services/fee-service.js`

# ใบเสนอราคาใต้รางบัตร — ยอมรับก่อนจ่าย และปิดใบเมื่อเงินเข้า — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the accepted quotation the fail-closed precondition for creating any payment on the Stripe/checkout rail, bind the charge to the exact figures the applicant accepted, and close the quotation when the money lands — without changing one baht of the price formula.

**Architecture:** One gate module (`services/billing/quotation-gate.js`) is called by both rails; the slip rail's existing gate delegates to it and loses its legacy fail-open. Acceptance freezes an immutable snapshot (built from the DB row's `installments`, not from a live fee calculation) plus its sha256; `createCheckoutForApplication` compares its live breakdown against that snapshot and refuses on any difference. Settlement stamps the per-phase `invoicedAt` **after** the `$transaction` commits, best-effort, and only flips the quotation to `INVOICED` when every instalment the quotation prices has been invoiced — never throwing back into the settle path, because a throw inside that transaction dead-letters a payment Stripe has already taken.

**Tech Stack:** Node 20 / Express / Prisma (PostgreSQL) in `apps/backend`; Next.js 15 App Router + React 19 + Tailwind in `apps/web-app`; Jest (backend `jest.config.cjs`, web-app `jest.config.mjs`); Playwright walks in `apps/web-app/e2e-g4` (`playwright.g4.config.ts`).

**Binding documents**
- Spec: `docs/superpowers/specs/2026-08-28-quotation-acceptance-under-checkout-design.md`
- Research: `reports/research/2026-08-28-f-g4-64/{synthesis,code-trace,register}.md` (§5(ก) = the 11 items; §5(ก).3 = the DEAD_LETTER trap; §5(ก).7 = the tests that break)
- Rules: `CLAUDE.md` L1-L6 + §5 (Tier C DoD); `.claude/skills/thai-ui-copy/SKILL.md`; `apps/backend/prisma/migrations/APPLIED-IS-FROZEN.md`

---

## Global Constraints

Copied verbatim from the spec. **Every task's requirements implicitly include this section.**

1. **Fail-closed gate.** Spec §3.1: `// throws { code, status: 409 } — never returns a "skip"`. "**ไม่มีใบ → `QUOTATION_NOT_ISSUED` (409)** … ไม่มี legacy fail-open (ต่างจากรางสลิปเดิม)". "lookup ล้มเหลว → `QUOTATION_GATE_UNAVAILABLE` (503) ไม่ใช่ปล่อยผ่าน".
2. **No formula change.** Spec §3.2: "**ไม่มีการเปลี่ยนสูตรราคาใด ๆ** (ยอดที่เก็บได้จริงยังมาจาก fee-service เหมือนเดิม; ด่านนี้แค่ปฏิเสธเมื่อไม่ตรงกับที่ตกลง)". Spec §4: "money-equation / ratchet: ไม่มีสูตรเปลี่ยน".
3. **Settlement never throws for quotation reasons.** Spec §3.3: "ห้ามโยนออกจาก `settleFromPaymentIntent`: try/catch → `logger.error` + `audit_logs` action `QUOTATION_CLOSE_FAILED` · เงิน/ใบเสร็จ/สถานะคำขอไม่ย้อนกลับ".
4. **Snapshot built from the DB row.** Spec §3.2: "ภาพนิ่งสร้างจาก **แถวในฐานข้อมูล** (installments ที่แช่ไว้) ไม่ใช่จากการคำนวณสด — และ API/PDF ใบเสนอราคาต้องเรนเดอร์จากแถว ไม่ใช่คำนวณใหม่".
5. **Thai copy rules** (`.claude/skills/thai-ui-copy/SKILL.md`): address the user as **คุณ** (ท่าน only on legal/PDPA surfaces such as `docs/legal/payment-terms-th-v1.1.md`); **no em dash (—) in Thai copy**, separate clauses with a space; space before ๆ; space at every Thai/Latin boundary ("ของ GACP"); dates through `formatThaiDate`, never inline `toLocaleDateString('th-TH')`; never `tracking-*` / `uppercase` / `font-black` on Thai text; error copy names the cause **and** the next action; error codes stay English identifiers mapped to Thai through a per-component map.
6. **Ratchet counters must not rise.** Spec §4: "ตัวนับ hardcode/todo/env-direct ต้องไม่ขึ้น". `CLAUDE.md` L4: "ตัวนับเพิ่มแม้ตัวเดียว = fail". No new `TODO`, no new `process.env.X` read outside a config accessor, no new hardcoded money literal in `apps/backend/services` or `apps/web-app/src`.
7. **Tier C.** Spec front-matter: "Tier: **C** (เส้นเงิน + migration + governance) — merge โดย operator เท่านั้น · L3: agent เขียนโค้ด/สคริปต์ dry-run ได้ การ `--apply` กับทะเบียนจริง = operator". `CLAUDE.md` §5 Tier C DoD = everything in Tier B + **paste the RED before asking for GREEN** + a full evidence pack + **operator merge**.

### Constraints this plan adds because HEAD requires them

8. **Applied migrations are frozen** (`apps/backend/prisma/migrations/APPLIED-IS-FROZEN.md`): never edit an existing `migration.sql`; T1 adds **one new directory** only. `prisma migrate deploy` against the demo/staging database is **the operator's or coordinator's step**, not the implementer's — the implementer writes the file and stops.
9. **Jest inherits `apps/backend/.env`** (`@prisma/client` loads it when `jest.setup.js` imports it). That box has `STRIPE_CHECKOUT_ENABLED=true`. Every backend test in this plan therefore sets its own flags at file top (`process.env.STRIPE_CHECKOUT_ENABLED = 'true'`) and pins any predicate it depends on with an explicit `jest.mock`, never relying on `.env`. Before claiming a legacy suite green, run it **twice**: `npx jest <file>` and `STRIPE_CHECKOUT_ENABLED= npx jest <file>`.
10. **Audit and notification rows go through the canonical writers.** `apps/backend/eslint-rules/no-direct-audit-or-notification-write.js` errors on `prisma.auditLog.create` / `prisma.notification.create` from any file but the canonical writer. Use `auditLogger.log({...})` from `middleware/audit-logger` and `createNotification` / `createBulkNotifications` from `services/notification-service`.

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `apps/backend/prisma/migrations/20260828100000_quotation_acceptance_snapshot_expand/migration.sql` | Expand-only DDL: 5 columns on `quotations`, 4 on `checkout_orders`, 1 index |
| `apps/backend/services/billing/quotation-gate.js` | The ONE gate both rails call. Pure policy over a quotation row; throws, never skips |
| `apps/backend/scripts/close-quotations-settled-before-gate.js` | Repair for the 2 pre-gate rows. Pure planner + guarded `--apply` |
| `scripts/probes/quotation-closure.sh` | Read-only probe: SETTLED orders whose quotation carries no `invoicedAt` for that phase |
| `docs/legal/payment-terms-th-v1.1.md` | v1.1 of the disclosure, with the figures that are actually charged |
| `apps/web-app/e2e-g4/c07-quotation-gate.spec.ts` | Walk: pay is refused before acceptance, allowed after |

**Modified files**

| Path | Change |
|---|---|
| `apps/backend/prisma/schema/billing.prisma` | `Quotation` (block at `:721`) + `CheckoutOrder` (block at `:1257`) gain the new columns |
| `apps/backend/services/tenant-prisma-extension.js:112` | Register `'Quotation'` in `TENANT_SCOPED_MODELS` (only `'Quote'` is there today) |
| `apps/backend/shared/error-codes.js` | 6 new rows + 2 corrections |
| `apps/backend/services/quotation-service.js` | Snapshot builder, hash, `markQuotationAccepted` signature, `recordPhaseInvoiced` |
| `apps/backend/services/payment-slip-service.js:448` | `assertQuotationAcceptedForPhase1Slip` delegates to the shared gate |
| `apps/backend/services/checkout/stripe-checkout-service.js` | Gate call, `PAYABLE_STATES.M1` loses `DRAFT`, drift comparison, order carries the binding, payment-terms consent |
| `apps/backend/services/checkout/checkout-settlement-service.js:313+` | Post-commit `recordPhaseInvoiced`, best-effort |
| `apps/backend/routes/api/finance/payments.js:409` | Pass `paymentTermsAccepted` through to the service |
| `apps/backend/routes/api/applications/quotations.js:163,303` | Render from the row; accept builds and stores the snapshot; controlled self-heal on GET |
| `apps/backend/services/pdf/invoice-template-service.js:1003` | `generateQuotationPdf` renders the stored row when one is passed |
| `apps/backend/routes/api/applications/applications.js:1211` | `await` issuance, fail loud |
| `apps/backend/services/application-service/application-review-revision-methods.js:317` | Same |
| `apps/backend/services/renewal-service.js:375` | Issue the quotation when the renewal application is created |
| `apps/backend/services/notification-service.js` + `services/notification/domain-helpers.js` | `QUOTATION_ISSUE_FAILED` notify type + admin helper |
| `apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx` | Render the real row; accept through the API |
| `apps/web-app/src/app/health/payments/client-view.tsx:388` | Pay button gated on quotation status |
| `apps/web-app/src/app/health/payments/checkout/client-view.tsx` | Quotation number + phase amount + payment-terms consent |
| `apps/web-app/src/lib/services/checkout-service.ts` | `paymentTermsAccepted` on the wire |
| `apps/web-app/src/components/payments/QuotationReviewSection.tsx:88` | INVOICED-without-acceptance label |
| `scripts/probes/probe-registry.txt` | One row for `quotation-closure` (**operator-signed** — L6) |

---

## Task Order and Why

T1 → T2 are scaffolding no behaviour depends on yet. T3 builds the gate but wires only the slip rail, which already had a gate — a tightening, not a new refusal.

**T5 and T7 must land in the same branch and the same operator merge.** T5 makes payment impossible without an issued quotation; until T7 issuance is fire-and-forget (`applications.js:1211` swallows the error), so an applicant whose issuance silently failed could not pay at all. Research `synthesis.md` §5(ก).6 and spec §3.4 both name this. The numeric task order is a review order, not a merge order.

---

### Task 1: Migration expand, Prisma schema, tenant registration

**Files:**
- Create: `apps/backend/prisma/migrations/20260828100000_quotation_acceptance_snapshot_expand/migration.sql`
- Modify: `apps/backend/prisma/schema/billing.prisma` (model `Quotation` block begins `:721`, `@@map("quotations")` at `:780`; model `CheckoutOrder` block begins `:1257`)
- Modify: `apps/backend/services/tenant-prisma-extension.js:112` (the `'Quote',` line inside `TENANT_SCOPED_MODELS`)
- Test: `apps/backend/__tests__/unit/quotation-acceptance-schema.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces — the columns every later task reads and writes:
  - `quotations.acceptedSnapshot Json?`, `quotations.acceptedSnapshotHash String?`, `quotations.acceptedBy String?`, `quotations.phase1InvoicedAt DateTime?`, `quotations.phase2InvoicedAt DateTime?`
  - `checkout_orders.quotationId String?` (indexed), `checkout_orders.quotationSnapshotHash String?`, `checkout_orders.paymentTermsVersion String?`, `checkout_orders.paymentTermsAcceptedAt DateTime?`
  - `'Quotation'` is a member of `TENANT_SCOPED_MODELS`.

**FROZEN-MIGRATIONS RULE (read before writing a line):** `apps/backend/prisma/migrations/APPLIED-IS-FROZEN.md` — "Once a migration directory has been applied to ANY database … its `migration.sql` must never be edited again. Add a new migration instead." This task creates **one new directory** and edits no existing `migration.sql`. **Running `npx prisma migrate deploy` against the shared demo database is the operator's / coordinator's step** (L3 + `CLAUDE.md` §5 Tier C). The implementer writes the file, runs the file-scan test, and stops. Do not run `migrate dev`, do not run `db push`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/__tests__/unit/quotation-acceptance-schema.test.js`:

```js
'use strict';
/**
 * Quotation acceptance snapshot (F-G4-64) — the schema and its expand migration agree.
 * Spec: docs/superpowers/specs/2026-08-28-quotation-acceptance-under-checkout-design.md §3.2.
 *
 * Pure file-system scan (no DB, no prisma client) — same shape as
 * __tests__/unit/certificate-revision-schema.test.js.
 */
const fs = require('fs');
const path = require('path');

const SCHEMA = path.resolve(__dirname, '../../prisma/schema/billing.prisma');
const MIG_DIR = path.resolve(__dirname, '../../prisma/migrations');
const EXTENSION_PATH = path.resolve(__dirname, '../../services/tenant-prisma-extension.js');
const MIGRATION = '20260828100000_quotation_acceptance_snapshot_expand';

/** The text of one `model X { ... }` block, bounded at its own closing brace. */
function modelBlock(schema, name) {
    const start = schema.indexOf(`model ${name} {`);
    if (start < 0) { return ''; }
    const end = schema.indexOf('\n}', start);
    return schema.slice(start, end + 2);
}

/** The migration with its `--` comment lines removed: what the database actually executes. */
function executableSql(sql) {
    return sql.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n');
}

describe('quotation acceptance snapshot — schema and expand migration agree', () => {
    const schema = fs.readFileSync(SCHEMA, 'utf8');

    it('Quotation carries the acceptance snapshot, its hash, the actor and the per-phase invoiced stamps', () => {
        const q = modelBlock(schema, 'Quotation');
        expect(q).toMatch(/acceptedSnapshot\s+Json\?/);
        expect(q).toMatch(/acceptedSnapshotHash\s+String\?/);
        expect(q).toMatch(/acceptedBy\s+String\?/);
        expect(q).toMatch(/phase1InvoicedAt\s+DateTime\?/);
        expect(q).toMatch(/phase2InvoicedAt\s+DateTime\?/);
    });

    it('CheckoutOrder is bound to the quotation and to the exact figures accepted', () => {
        const o = modelBlock(schema, 'CheckoutOrder');
        expect(o).toMatch(/quotationId\s+String\?/);
        expect(o).toMatch(/quotationSnapshotHash\s+String\?/);
        expect(o).toMatch(/paymentTermsVersion\s+String\?/);
        expect(o).toMatch(/paymentTermsAcceptedAt\s+DateTime\?/);
        expect(o).toMatch(/@@index\(\[quotationId\]\)/);
    });

    it('the expand migration exists and adds exactly those columns, dropping nothing', () => {
        const file = path.join(MIG_DIR, MIGRATION, 'migration.sql');
        expect(fs.existsSync(file)).toBe(true);
        const sql = executableSql(fs.readFileSync(file, 'utf8'));
        for (const col of ['acceptedSnapshot', 'acceptedSnapshotHash', 'acceptedBy',
            'phase1InvoicedAt', 'phase2InvoicedAt']) {
            expect(sql).toContain(`ALTER TABLE "quotations" ADD COLUMN "${col}"`);
        }
        for (const col of ['quotationId', 'quotationSnapshotHash',
            'paymentTermsVersion', 'paymentTermsAcceptedAt']) {
            expect(sql).toContain(`ALTER TABLE "checkout_orders" ADD COLUMN "${col}"`);
        }
        expect(sql).toContain('CREATE INDEX');
        // Expand only: nothing is dropped, renamed, retyped or backfilled.
        expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT)/i);
        expect(sql).not.toMatch(/RENAME/i);
        expect(sql).not.toMatch(/\bUPDATE\s+"/i);
        // Every added column is nullable — no NOT NULL without a default on a live table.
        expect(sql).not.toMatch(/ADD COLUMN "[a-zA-Z]+" [A-Z()0-9, ]+ NOT NULL(?! DEFAULT)/);
    });

    it('Quotation is registered tenant-scoped, beside Quote', () => {
        const ext = fs.readFileSync(EXTENSION_PATH, 'utf8');
        expect(ext).toMatch(/^\s*'Quotation',/m);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-acceptance-schema.test.js`
Expected: FAIL — 4 failing assertions; the migration assertion fails on `expect(fs.existsSync(file)).toBe(true)`.

- [ ] **Step 3: Write the migration**

Create `apps/backend/prisma/migrations/20260828100000_quotation_acceptance_snapshot_expand/migration.sql`:

```sql
-- =============================================================================
-- Quotation acceptance snapshot + charge binding (F-G4-64) — expand only.
-- Spec: docs/superpowers/specs/2026-08-28-quotation-acceptance-under-checkout-design.md §3.2
-- =============================================================================
--
-- WHY. Today the quotations table can prove that a row exists and that money
-- arrived, but not that a human agreed to a specific set of figures before it
-- did: acceptedAt is null on every row in the register (reports/research/
-- 2026-08-28-f-g4-64/register.md §B), and neither the API nor the PDF renders
-- the stored figures — both recompute at the current rate. These columns hold
-- the exact document the applicant saw at the second they pressed accept, the
-- sha256 over its canonical form, and the per-instalment invoiced stamps that
-- let INVOICED mean "every instalment on this quotation has been billed"
-- instead of "one of them has".
--
-- checkout_orders gains the other half of the binding: which quotation this
-- charge collects against, which snapshot the amount was checked against, and
-- the payment-terms disclosure version and instant (Q4, owner ruling
-- 2026-07-08) which until now existed on the slip rail only.
--
-- EXPAND ONLY. Nine ADDED nullable columns and one index. Nothing is dropped,
-- renamed, retyped or backfilled: every existing row keeps meaning what it
-- meant (NULL = this happened before the gate existed, which is the truth).
-- ADD COLUMN with no default takes no table rewrite on PostgreSQL 11+.
--
-- The repair of the two pre-gate rows is deliberately NOT here: it is a data
-- decision with an operator-run script (apps/backend/scripts/
-- close-quotations-settled-before-gate.js --apply --expect=2), not DDL.
--
-- This SQL ships in the same change as prisma/schema/billing.prisma because
-- CI's migration-drift-check diffs the migration chain against the schema;
-- either half landing alone turns that required gate red.
-- -----------------------------------------------------------------------------

ALTER TABLE "quotations" ADD COLUMN "acceptedSnapshot" JSONB;
ALTER TABLE "quotations" ADD COLUMN "acceptedSnapshotHash" TEXT;
ALTER TABLE "quotations" ADD COLUMN "acceptedBy" TEXT;
ALTER TABLE "quotations" ADD COLUMN "phase1InvoicedAt" TIMESTAMP(3);
ALTER TABLE "quotations" ADD COLUMN "phase2InvoicedAt" TIMESTAMP(3);

ALTER TABLE "checkout_orders" ADD COLUMN "quotation_id" TEXT;
ALTER TABLE "checkout_orders" ADD COLUMN "quotation_snapshot_hash" TEXT;
ALTER TABLE "checkout_orders" ADD COLUMN "payment_terms_version" TEXT;
ALTER TABLE "checkout_orders" ADD COLUMN "payment_terms_accepted_at" TIMESTAMP(3);

-- Settlement looks the quotation up by this column (recordPhaseInvoiced), and
-- the closure probe scans SETTLED orders by it.
CREATE INDEX "checkout_orders_quotation_id_idx" ON "checkout_orders"("quotation_id");
```

> **Note on the two naming conventions in one file:** `quotations` is a camelCase-column table (`acceptedAt`, `validUntil` — see `20260516010000_add_journal_quotation_receipt_seq_bank_accounts`), while `checkout_orders` is snake_case with `@map` (`dtam_fee_amount`, `stripe_payment_intent_id`). Each half of this migration follows the convention of the table it touches. The schema test above matches on the Prisma field name, which is camelCase on both.

Adjust the schema-test assertions for the checkout half to match the SQL exactly:

```js
        for (const col of ['quotation_id', 'quotation_snapshot_hash',
            'payment_terms_version', 'payment_terms_accepted_at']) {
            expect(sql).toContain(`ALTER TABLE "checkout_orders" ADD COLUMN "${col}"`);
        }
```

- [ ] **Step 4: Add the columns to the Prisma schema**

In `apps/backend/prisma/schema/billing.prisma`, inside `model Quotation`, replace the `// Lifecycle` block (currently `:752-756`) with:

```prisma
  // Lifecycle
  status          String   @default("DRAFT") // DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED | INVOICED
  validUntil      DateTime?
  acceptedAt      DateTime?
  rejectedAt      DateTime?

  // F-G4-64 — the acceptance record. `acceptedSnapshot` is the document the
  // applicant actually saw at the instant of acceptance, built from THIS row's
  // installments (never from a live fee calculation), with every money value a
  // 2-decimal string. `acceptedSnapshotHash` is sha256 over its canonical
  // (key-sorted) JSON; a checkout order copies it so the charge can be proved
  // to have been checked against those exact figures. `acceptedBy` is the
  // acting User id — `updatedBy` already carried it, but that column also moves
  // for reasons that are not acceptance.
  acceptedSnapshot     Json?
  acceptedSnapshotHash String?
  acceptedBy           String?

  // Per-instalment billing stamps. Under W14 ONE quotation prices BOTH phases,
  // so `status = INVOICED` may only be written once EVERY instalment this
  // quotation prices has been billed. A renewal prices PHASE_2 only, so for a
  // renewal phase2InvoicedAt alone closes the quotation.
  phase1InvoicedAt DateTime?
  phase2InvoicedAt DateTime?
```

Inside `model CheckoutOrder`, after the `status String @default("PENDING_PAYMENT")` line, add:

```prisma
  // F-G4-64 — what this charge collects against. `quotationId` is the accepted
  // quotation; `quotationSnapshotHash` is the hash of the snapshot the amount
  // was compared with before the order was minted (a mismatch is refused as
  // CHECKOUT_PRICE_DRIFT and no order is created, so a stored hash always means
  // "these figures matched"). Nullable: every order settled before the gate
  // existed has neither, and inventing one would be inventing a record.
  quotationId           String?   @map("quotation_id")
  quotationSnapshotHash String?   @map("quotation_snapshot_hash")

  // Q4 pre-payment disclosure (owner ruling 2026-07-08). The slip rail records
  // this in UserConsent; the card rail records it per ORDER as well, because
  // the disclosure authorises THIS charge.
  paymentTermsVersion    String?   @map("payment_terms_version")
  paymentTermsAcceptedAt DateTime? @map("payment_terms_accepted_at")
```

and add `@@index([quotationId])` beside the existing `@@index([applicationId])`.

- [ ] **Step 5: Register Quotation as tenant-scoped**

In `apps/backend/services/tenant-prisma-extension.js`, in `TENANT_SCOPED_MODELS`, immediately after the `'Quote',                 // quotes` line (`:112`):

```js
  // F-G4-64 (2026-08-28): the NEW quotation stream (Quotation/quotations) was
  // never registered here although `Quote` was, and Quotation carries a NOT
  // NULL organizationId exactly like Quote. Its one writer
  // (quotation-service.issueQuotationsForApplication) already passes
  // organizationId explicitly on every create, so this is the read-scoping
  // safety net — the same rationale FarmAuditPhoto and CertificateRevision
  // carry above, not a functional dependency of the writer.
  'Quotation',             // quotations
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-acceptance-schema.test.js`
Expected: PASS, 4/4.

- [ ] **Step 7: Prove the sibling suites still pass**

Sibling suites that read this schema or this extension:

```bash
cd apps/backend
npx jest __tests__/unit/certificate-revision-schema.test.js \
         __tests__/unit/quotation-service.test.js \
         __tests__/unit/single-issuer-quotation-row.test.js \
         __tests__/unit/single-issuer-frozen-quotation.test.js \
         __tests__/unit/single-issuer-end-to-end-figures.test.js
STRIPE_CHECKOUT_ENABLED= npx jest __tests__/unit/quotation-service.test.js
npx jest __tests__/integration/rls-shadow-guc.int.test.js
```

Expected: PASS, or exactly the same skip/blocked verdict these give on `main` — compare against the baseline, never assume (memory: `gate-cannot-pass-use-baseline`).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/prisma/migrations/20260828100000_quotation_acceptance_snapshot_expand/migration.sql \
        apps/backend/prisma/schema/billing.prisma \
        apps/backend/services/tenant-prisma-extension.js \
        apps/backend/__tests__/unit/quotation-acceptance-schema.test.js
git commit -m "feat(billing): quotations record what was accepted, orders record what they collect against

Expand-only migration plus schema. No writer yet: the columns exist so the
acceptance gate can be built on them. Quotation joins TENANT_SCOPED_MODELS
beside Quote, where it should have been since it was created.

Refs F-G4-64. prisma migrate deploy on the demo DB is the operator's step."
```

---

### Task 2: Error-code catalogue

**Files:**
- Modify: `apps/backend/shared/error-codes.js` (`QUOTATION_NOT_ACCEPTED` at `:2138-2145`; `PAYMENT_TERMS_NOT_ACCEPTED` at `:2452-2459`)
- Test: `apps/backend/__tests__/unit/quotation-gate-error-codes.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces — the exact code strings and statuses every later task throws and every FE error map keys on:

| code | httpStatus | thrown by |
|---|---|---|
| `QUOTATION_NOT_ISSUED` | 409 | `services/billing/quotation-gate.js` (T3) |
| `QUOTATION_NOT_ACCEPTED` | 409 (**corrected from 400**) | `services/billing/quotation-gate.js` (T3) |
| `QUOTATION_EXPIRED` | 409 | `services/billing/quotation-gate.js` (T3) |
| `QUOTATION_GATE_UNAVAILABLE` | 503 | `services/billing/quotation-gate.js` (T3) |
| `CHECKOUT_PRICE_DRIFT` | 409 | `services/checkout/stripe-checkout-service.js` (T5) |
| `PAYMENT_TERMS_NOT_ACCEPTED` | 409 (**message broadened to both rails**) | slip service + checkout service (T5) |
| `QUOTATION_ISSUE_FAILED` | 500 | `routes/api/applications/applications.js` (T7) |

- [ ] **Step 1: Write the failing test**

Create `apps/backend/__tests__/unit/quotation-gate-error-codes.test.js`:

```js
'use strict';
/**
 * F-G4-64 — the quotation gate's error vocabulary is catalogued, and the two
 * pre-existing rows say the truth.
 *
 * Adversarial review of the research (synthesis.md §5(ก).4) found
 * QUOTATION_NOT_ACCEPTED wrong in three places at once: httpStatus 400 while
 * the route answers 409, messages that mention slip upload only, and a `source`
 * pointing at a line the function moved off long ago.
 */
const { ERROR_CODES } = require('../../shared/error-codes');

const EXPECTED_STATUS = {
    QUOTATION_NOT_ISSUED: 409,
    QUOTATION_NOT_ACCEPTED: 409,
    QUOTATION_EXPIRED: 409,
    QUOTATION_GATE_UNAVAILABLE: 503,
    CHECKOUT_PRICE_DRIFT: 409,
    PAYMENT_TERMS_NOT_ACCEPTED: 409,
    QUOTATION_ISSUE_FAILED: 500,
};

describe('quotation gate error codes', () => {
    it.each(Object.entries(EXPECTED_STATUS))('%s is catalogued with status %i', (code, status) => {
        const row = ERROR_CODES[code];
        expect(row).toBeDefined();
        expect(row.httpStatus).toBe(status);
        expect(row.messageTh.length).toBeGreaterThan(0);
        expect(row.messageEn.length).toBeGreaterThan(0);
        expect(row.source).toMatch(/^[^:]+:\d+$/);
    });

    it('the four gate codes point at the shared gate module, not at one rail', () => {
        for (const code of ['QUOTATION_NOT_ISSUED', 'QUOTATION_NOT_ACCEPTED',
            'QUOTATION_EXPIRED', 'QUOTATION_GATE_UNAVAILABLE']) {
            expect(ERROR_CODES[code].source).toMatch(/^services\/billing\/quotation-gate\.js:\d+$/);
        }
    });

    it('the two rail-specific messages no longer name only the slip', () => {
        // Both rails now enforce both gates, so copy that says "อัปโหลดสลิป"
        // tells a card-rail applicant to do something that does not exist.
        expect(ERROR_CODES.QUOTATION_NOT_ACCEPTED.messageTh).not.toMatch(/สลิป/);
        expect(ERROR_CODES.PAYMENT_TERMS_NOT_ACCEPTED.messageTh).not.toMatch(/สลิป/);
    });

    it('no Thai message uses an em dash (thai-ui-copy rule)', () => {
        for (const code of Object.keys(EXPECTED_STATUS)) {
            expect(ERROR_CODES[code].messageTh).not.toContain('—');
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-gate-error-codes.test.js`
Expected: FAIL — `QUOTATION_NOT_ISSUED is catalogued with status 409` fails on `expect(row).toBeDefined()`; `QUOTATION_NOT_ACCEPTED` fails on `expect(400).toBe(409)`.

- [ ] **Step 3: Write the catalogue rows**

In `apps/backend/shared/error-codes.js`, replace the `QUOTATION_NOT_ACCEPTED` entry (`:2138-2145`) with these four:

```js
  QUOTATION_NOT_ISSUED: {
    code: 'QUOTATION_NOT_ISSUED',
    httpStatus: 409,
    messageEn: 'No quotation has been issued for this application yet',
    messageTh: 'ระบบยังไม่ออกใบเสนอราคาของคำขอนี้ กดรีเฟรชอีกครั้ง หากยังไม่ปรากฏให้ติดต่อเจ้าหน้าที่',
    source: 'services/billing/quotation-gate.js:110',
    remediation: 'Issuance runs on submit and is retried idempotently by GET /api/applications/:id/quotations. If the row is still absent, the audit row (action QUOTATION_ISSUE_FAILED) names the cause.',
  },
  QUOTATION_NOT_ACCEPTED: {
    code: 'QUOTATION_NOT_ACCEPTED',
    httpStatus: 409,
    messageEn: 'Payment cannot be created until the applicant accepts the quotation',
    messageTh: 'กรุณายอมรับใบเสนอราคาก่อนชำระเงิน',
    source: 'services/billing/quotation-gate.js:132',
    remediation: 'The applicant presses ยอมรับใบเสนอราคา on the payments screen (POST /api/applications/:id/quotations/:issuerType/accept). Both the card and the slip rail enforce this.',
  },
  QUOTATION_EXPIRED: {
    code: 'QUOTATION_EXPIRED',
    httpStatus: 409,
    messageEn: 'The quotation has passed its validity date and can no longer be accepted',
    messageTh: 'ใบเสนอราคาของคำขอนี้เกินกำหนดยืนราคาแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อออกใบใหม่',
    source: 'services/billing/quotation-gate.js:128',
    remediation: 'validUntil is 30 days from issue (quotation-service DEFAULT_VALIDITY_DAYS). An already-ACCEPTED quotation never expires; only a still-unaccepted one does.',
  },
  QUOTATION_GATE_UNAVAILABLE: {
    code: 'QUOTATION_GATE_UNAVAILABLE',
    httpStatus: 503,
    messageEn: 'Could not verify the quotation status; the payment was not created',
    messageTh: 'ตรวจสอบสถานะใบเสนอราคาไม่สำเร็จ ระบบยังไม่สร้างรายการชำระเงิน กรุณาลองใหม่อีกครั้ง',
    source: 'services/billing/quotation-gate.js:93',
    remediation: 'A lookup failure never opens the gate. Retry; if it persists, quotation-service or the database is unreachable.',
  },
```

Add, beside the other `CHECKOUT_*` rows:

```js
  CHECKOUT_PRICE_DRIFT: {
    code: 'CHECKOUT_PRICE_DRIFT',
    httpStatus: 409,
    messageEn: 'The amount to charge differs from the accepted quotation; no payment was created',
    messageTh: 'ยอดที่จะเรียกเก็บไม่ตรงกับใบเสนอราคาที่คุณยอมรับไว้ ระบบจึงไม่สร้างรายการชำระเงิน เจ้าหน้าที่ได้รับแจ้งแล้ว',
    source: 'services/checkout/stripe-checkout-service.js:224',
    remediation: 'The live fee decomposition did not match the accepted snapshot to the satang. Nothing is charged. The audit row (action CHECKOUT_PRICE_DRIFT) carries both figures; a human decides whether to re-issue the quotation.',
  },
  QUOTATION_ISSUE_FAILED: {
    code: 'QUOTATION_ISSUE_FAILED',
    httpStatus: 500,
    messageEn: 'The application was submitted but its quotation could not be issued',
    messageTh: 'ระบบรับคำขอของคุณแล้ว แต่ออกใบเสนอราคาไม่สำเร็จ เจ้าหน้าที่ได้รับแจ้งแล้ว กรุณาเปิดหน้าชำระเงินอีกครั้งในภายหลัง',
    source: 'routes/api/applications/applications.js:1211',
    remediation: 'The submitted status is NOT rolled back. GET /api/applications/:id/quotations re-issues idempotently; the audit row and the admin notification carry the cause.',
  },
```

Correct the existing `PAYMENT_TERMS_NOT_ACCEPTED` row (`:2452`) — status stays 409; only the copy and the pointer change:

```js
  PAYMENT_TERMS_NOT_ACCEPTED: {
    code: 'PAYMENT_TERMS_NOT_ACCEPTED',
    httpStatus: 409,
    messageEn: 'Payment terms must be acknowledged before a payment is created',
    messageTh: 'กรุณายอมรับเงื่อนไขการชำระเงินและการคืนเงินก่อนดำเนินการชำระเงิน',
    source: 'services/payment-slip-service.js:517',
    remediation: 'Slip rail: a granted PAYMENT_TERMS consent (POST /api/consent). Card rail: the checkout page sends paymentTermsAccepted { version, acceptedAt }. Terms text: docs/legal/payment-terms-th-v1.1.md.',
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-gate-error-codes.test.js`
Expected: PASS.

- [ ] **Step 5: Prove the sibling suites still pass**

```bash
cd apps/backend
npx jest __tests__/unit/error-codes-catalog.test.js \
         __tests__/unit/payment-terms-gate-slip.test.js
STRIPE_CHECKOUT_ENABLED= npx jest __tests__/unit/payment-terms-gate-slip.test.js
node scripts/extract-error-codes.js --validate
```

Expected: catalogue test PASS (it asserts the 6 required fields, the `path:line` shape of `source`, and the ≥80-entry floor — all hold); `--validate` exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/shared/error-codes.js apps/backend/__tests__/unit/quotation-gate-error-codes.test.js
git commit -m "feat(errors): catalogue the quotation gate's vocabulary, and correct two rows that lied

QUOTATION_NOT_ACCEPTED said 400 while the route answered 409, and both it and
PAYMENT_TERMS_NOT_ACCEPTED told a card-rail applicant to upload a slip.

Refs F-G4-64, synthesis.md 5(ก).4."
```

---

### Task 3: The shared gate, the slip rail rewired to it, and the renewal proof

**Files:**
- Create: `apps/backend/services/billing/quotation-gate.js`
- Modify: `apps/backend/services/payment-slip-service.js:448-505` (`assertQuotationAcceptedForPhase1Slip`)
- Modify: `apps/backend/services/renewal-service.js:375-382` (issuance at renewal creation)
- Test: `apps/backend/__tests__/unit/quotation-gate.test.js`
- Test (rewrite): `apps/backend/__tests__/unit/quotation-gate-phase1-slip.test.js`
- Test: `apps/backend/__tests__/unit/renewal-issues-quotation.test.js`

**Interfaces:**
- Consumes: the error codes from T2; `quotationService.findQuotationsByApplicationId(applicationId, { tx })` (`quotation-service.js:579`); `quotationService.issueQuotationsForApplication(applicationId, { actorId })` (`:456`).
- Produces:

```js
// apps/backend/services/billing/quotation-gate.js
const MILESTONE_TO_PHASE = Object.freeze({
    M1: 'PHASE_1', M2: 'PHASE_2', PHASE_1: 'PHASE_1', PHASE_2: 'PHASE_2',
});
const QUOTATION_ACCEPTED_STATES = Object.freeze(['ACCEPTED', 'INVOICED']);

/**
 * @param {{applicationId: string, milestone: 'M1'|'M2'|'PHASE_1'|'PHASE_2', client?: object}} args
 * @returns {Promise<{quotation: object, phase: 'PHASE_1'|'PHASE_2', snapshot: object|null}>}
 * @throws {Error & {code, status, statusCode}} — never resolves with a "skip"
 */
async function assertQuotationAcceptedForPayment({ applicationId, milestone, client })

module.exports = { assertQuotationAcceptedForPayment, MILESTONE_TO_PHASE, QUOTATION_ACCEPTED_STATES };
```

- Also produces: `createRenewalApplication(...)` resolves with an added `quotation: { issued: boolean, error?: 'QUOTATION_ISSUE_FAILED' }` field.

#### RENEWAL — mandatory, and it must be done before T5 wires the gate to the card rail

- [ ] **Step 1: PROVE whether a renewal application gets a quotation, and paste the output**

```bash
cd apps/backend
grep -rn "quotation\|Quotation" services/renewal-service.js || echo "NO QUOTATION REFERENCE IN renewal-service.js"
grep -rn "issueQuotationsForApplication" routes services jobs | grep -v node_modules
grep -rn "createRenewalApplication" routes services jobs | grep -v node_modules
```

**Verified at HEAD 2026-08-28 while this plan was written:** the first grep returns **zero lines**. The only two callers of `issueQuotationsForApplication` in the whole backend are `routes/api/applications/applications.js:1211` (initial submit) and `services/application-service/application-review-revision-methods.js:317` (draft submit). `createRenewalApplication` (`renewal-service.js:251`) creates the application with `prisma.application.create` at `:375`, directly at `PENDING_AUDIT_FEE` (`RENEWAL_ENTRY_STATE`, `:232`), and passes through neither submit door.

**Conclusion this task acts on: a renewal gets NO quotation today.** `PENDING_AUDIT_FEE` is an `M2`-payable state (`stripe-checkout-service.js:42`), so a fail-closed gate would refuse every renewal payment on both rails. **This task therefore adds issuance at renewal creation.** If the greps ever disagree with this paragraph, stop and report the disagreement rather than proceeding on the plan's word (L1).

- [ ] **Step 2: Write the failing test for renewal issuance**

Create `apps/backend/__tests__/unit/renewal-issues-quotation.test.js`:

```js
'use strict';
/**
 * A renewal application must be quoted at creation.
 *
 * renewal-service creates the application directly at PENDING_AUDIT_FEE
 * (RENEWAL_ENTRY_STATE) without passing through either submit door, so neither
 * issueQuotationsForApplication call site ever fires for it. PENDING_AUDIT_FEE
 * is an M2-payable state, so once the acceptance gate is fail-closed an
 * unquoted renewal cannot be paid at all.
 *
 * quotation-service already prices a renewal correctly (_resolveBillableFees to
 * calculateRenewalFee, ONE PHASE_2 instalment); it was simply never called.
 */
const mockIssue = jest.fn(async () => ({
    company: { id: 'qt-ren-1' }, dtam: null, platform: { id: 'qt-ren-1' },
}));
jest.mock('../../services/quotation-service', () => ({
    issueQuotationsForApplication: (...a) => mockIssue(...a),
}));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: () => l };
});
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn(async () => ({})) },
    AuditCategory: { APPLICATION: 'APPLICATION', PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR' },
    ResourceType: { APPLICATION: 'APPLICATION' },
}));

const CERT = {
    id: 'cert-old-1',
    certificateNumber: 'GACP-TH-2568-000001',
    status: 'ACTIVE',
    expiryDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    applicationId: 'app-src-1',
    organizationId: 'org-1',
    isDeleted: false,
};
const SOURCE_APP = {
    id: 'app-src-1',
    healthId: 'HID-1',
    organizationId: 'org-1',
    entityId: null,
    areaType: 'OUTDOOR',
    formData: { cultivationMethods: ['outdoor'] },
    cultivationScopeCount: 1,
    isDeleted: false,
};
const prismaStub = {
    certificate: { findFirst: jest.fn(async () => CERT), findUnique: jest.fn(async () => CERT) },
    application: {
        findFirst: jest.fn(async () => SOURCE_APP),
        findUnique: jest.fn(async () => SOURCE_APP),
        create: jest.fn(async ({ data }) => ({ id: 'app-ren-1', ...data })),
    },
};

const renewalService = require('../../services/renewal-service');

beforeEach(() => jest.clearAllMocks());

test('creating a renewal application issues its quotation', async () => {
    await renewalService.createRenewalApplication({
        originalCertificateId: 'cert-old-1',
        actorId: 'user-1',
        actorRole: 'HEALTH',
        prisma: prismaStub,
    });
    expect(mockIssue).toHaveBeenCalledTimes(1);
    expect(mockIssue).toHaveBeenCalledWith('app-ren-1', expect.objectContaining({ actorId: 'user-1' }));
});

test('a quotation failure does not undo the renewal application already created', async () => {
    mockIssue.mockRejectedValueOnce(new Error('numbering down'));
    const result = await renewalService.createRenewalApplication({
        originalCertificateId: 'cert-old-1',
        actorId: 'user-1',
        actorRole: 'HEALTH',
        prisma: prismaStub,
    });
    expect(result.application?.id ?? result.id).toBe('app-ren-1');
    expect(result.quotation).toEqual({ issued: false, error: 'QUOTATION_ISSUE_FAILED' });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/renewal-issues-quotation.test.js`
Expected: FAIL — `expect(mockIssue).toHaveBeenCalledTimes(1)` receives 0.

- [ ] **Step 4: Issue the quotation at renewal creation**

In `apps/backend/services/renewal-service.js`, immediately after the `logger.info('[renewal-service] Renewal application created', { ... })` block that follows `prisma.application.create` (`:377-382`), insert:

```js
    // F-G4-64 — a renewal never passes through either submit door, so neither
    // issueQuotationsForApplication call site (applications.js:1211,
    // application-review-revision-methods.js:317) fires for it. It enters at
    // PENDING_AUDIT_FEE, which is an M2-payable state, so with the acceptance
    // gate fail-closed an unquoted renewal could not be paid at all.
    // quotation-service already prices a renewal correctly (one PHASE_2
    // instalment at the renewal rate) — it was simply never called.
    //
    // Awaited and reported, not fire-and-forget (R3): the application row is
    // already committed and is NOT rolled back, but the caller is told, the
    // same way the submit door is told.
    let quotationOutcome = { issued: true };
    try {
        const quotationService = require('./quotation-service');
        await quotationService.issueQuotationsForApplication(newApp.id, { actorId });
    } catch (qtErr) {
        quotationOutcome = { issued: false, error: 'QUOTATION_ISSUE_FAILED' };
        logger.error('[renewal-service] quotation issue failed for renewal', {
            renewalApplicationId: newApp.id,
            errCode: qtErr?.code || null,
            errMessage: qtErr?.message || String(qtErr),
        });
    }
```

and add `quotation: quotationOutcome` to the object `createRenewalApplication` returns.

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/renewal-issues-quotation.test.js`
Expected: PASS, 2/2.

#### The gate itself

- [ ] **Step 6: Write the failing test for the gate (RED proof #2 of spec §4 — "no quotation, and the payment is created anyway")**

Create `apps/backend/__tests__/unit/quotation-gate.test.js`:

```js
'use strict';
/**
 * The ONE quotation gate, both rails (F-G4-64 R1).
 *
 * Fail-CLOSED in every direction: no quotation is a refusal, not a pass; a
 * lookup failure is a 503, not a pass. The slip rail's legacy fail-open
 * ("no quotation ... allowing PHASE_1 slip") is exactly how application A2
 * collected 35,310 THB and reached CERTIFIED with no document of record at all
 * (reports/research/2026-08-28-f-g4-64/register.md B).
 */
const mockFindQuotations = jest.fn();
jest.mock('../../services/quotation-service', () => ({
    findQuotationsByApplicationId: (...a) => mockFindQuotations(...a),
}));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: () => l };
});

const { assertQuotationAcceptedForPayment, MILESTONE_TO_PHASE } =
    require('../../services/billing/quotation-gate');

const APP = 'app-1';
const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);

function accepted(overrides = {}) {
    return {
        id: 'qt-1',
        issuerType: 'PLATFORM',
        status: 'ACCEPTED',
        validUntil: FUTURE,
        acceptedSnapshot: { installments: [{ phase: 'PHASE_1', phaseTotal: '5885.00' }] },
        acceptedSnapshotHash: 'h1',
        ...overrides,
    };
}

beforeEach(() => jest.clearAllMocks());

test('an ACCEPTED quotation passes and hands back the row, the phase and the snapshot', async () => {
    mockFindQuotations.mockResolvedValue({ dtam: null, platform: accepted() });
    const out = await assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M1' });
    expect(out.quotation.id).toBe('qt-1');
    expect(out.phase).toBe('PHASE_1');
    expect(out.snapshot).toEqual(accepted().acceptedSnapshot);
});

test('INVOICED passes too (post-acceptance terminal)', async () => {
    mockFindQuotations.mockResolvedValue({ dtam: null, platform: accepted({ status: 'INVOICED' }) });
    await expect(assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M2' }))
        .resolves.toMatchObject({ phase: 'PHASE_2' });
});

test('NO quotation is QUOTATION_NOT_ISSUED 409, never a pass', async () => {
    mockFindQuotations.mockResolvedValue({ dtam: null, platform: null });
    await expect(assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M1' }))
        .rejects.toMatchObject({ code: 'QUOTATION_NOT_ISSUED', status: 409 });
});

test('PENDING is QUOTATION_NOT_ACCEPTED 409', async () => {
    mockFindQuotations.mockResolvedValue({ dtam: null, platform: accepted({ status: 'PENDING' }) });
    await expect(assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M1' }))
        .rejects.toMatchObject({ code: 'QUOTATION_NOT_ACCEPTED', status: 409 });
});

test('a still-unaccepted quotation past validUntil is QUOTATION_EXPIRED 409', async () => {
    mockFindQuotations.mockResolvedValue({
        dtam: null, platform: accepted({ status: 'PENDING', validUntil: PAST }),
    });
    await expect(assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M1' }))
        .rejects.toMatchObject({ code: 'QUOTATION_EXPIRED', status: 409 });
});

test('an ACCEPTED quotation does NOT expire', async () => {
    mockFindQuotations.mockResolvedValue({ dtam: null, platform: accepted({ validUntil: PAST }) });
    await expect(assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M1' }))
        .resolves.toMatchObject({ phase: 'PHASE_1' });
});

test('a lookup failure is QUOTATION_GATE_UNAVAILABLE 503, never a pass', async () => {
    mockFindQuotations.mockRejectedValue(new Error('db down'));
    await expect(assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M1' }))
        .rejects.toMatchObject({ code: 'QUOTATION_GATE_UNAVAILABLE', status: 503 });
});

test('a pre-W14 application with BOTH issuer rows requires BOTH to be accepted', async () => {
    mockFindQuotations.mockResolvedValue({
        dtam: accepted({ id: 'qt-dtam', issuerType: 'DTAM', status: 'PENDING' }),
        platform: accepted({ id: 'qt-plat' }),
    });
    await expect(assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M1' }))
        .rejects.toMatchObject({ code: 'QUOTATION_NOT_ACCEPTED' });
});

test('both rails speak their own milestone vocabulary onto the same two phases', () => {
    expect(MILESTONE_TO_PHASE).toEqual({
        M1: 'PHASE_1', M2: 'PHASE_2', PHASE_1: 'PHASE_1', PHASE_2: 'PHASE_2',
    });
});

test('an unknown milestone is refused rather than silently allowed', async () => {
    mockFindQuotations.mockResolvedValue({ dtam: null, platform: accepted() });
    await expect(assertQuotationAcceptedForPayment({ applicationId: APP, milestone: 'M9' }))
        .rejects.toMatchObject({ code: 'QUOTATION_GATE_UNAVAILABLE' });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-gate.test.js`
Expected: FAIL with `Cannot find module '../../services/billing/quotation-gate'`.

- [ ] **Step 8: Write the gate**

Create `apps/backend/services/billing/quotation-gate.js`:

```js
'use strict';
/**
 * The ONE quotation gate — services/billing/quotation-gate.js (F-G4-64, R1).
 *
 * Operator ruling 2026-08-28: a quotation is the PRICE OF RECORD of an
 * application, and the applicant pressing ยอมรับ on it (a human act, recorded
 * with the actor, the instant, and a snapshot of the figures they saw) is the
 * precondition for creating a payment for ANY instalment on EVERY rail.
 *
 * Why one module rather than two gates: until today the slip rail had a gate
 * (payment-slip-service.assertQuotationAcceptedForPhase1Slip) and the card rail
 * had none, and no decision record anywhere says the two were meant to differ
 * (synthesis.md 1.3). The rail that collected 176,550 THB and issued three
 * certificates is the one WITHOUT the gate.
 *
 * FAIL-CLOSED IN EVERY DIRECTION. This function has no branch that returns a
 * "skip". In particular the slip rail's legacy fail-open — "no quotation for
 * this side, allowing the slip" — is DELETED, not ported: that branch is the
 * shape of application A2, which paid 35,310 THB and holds an active
 * certificate with no pricing document in the register at all.
 */

const { createLogger } = require('../../shared/logger');

const logger = createLogger('quotation-gate');

/**
 * The two rails speak different vocabularies for the same two instalments: the
 * card rail says M1/M2 (checkout_orders.milestone), the slip rail says
 * PHASE_1/PHASE_2 (invoice.serviceType, paymentTransaction.phase).
 */
const MILESTONE_TO_PHASE = Object.freeze({
    M1: 'PHASE_1',
    M2: 'PHASE_2',
    PHASE_1: 'PHASE_1',
    PHASE_2: 'PHASE_2',
});

/**
 * Quotation states that count as "the applicant accepted". ACCEPTED is the
 * direct result of pressing ยอมรับใบเสนอราคา; INVOICED is the post-acceptance
 * terminal (every instalment on this quotation has been billed).
 */
const QUOTATION_ACCEPTED_STATES = Object.freeze(['ACCEPTED', 'INVOICED']);

/** Error shape both rails' routes already understand: `status` AND `statusCode`. */
function gateError(code, status, messageTh) {
    return Object.assign(new Error(messageTh), { code, status, statusCode: status });
}

const MSG = Object.freeze({
    UNAVAILABLE: 'ตรวจสอบสถานะใบเสนอราคาไม่สำเร็จ ระบบยังไม่สร้างรายการชำระเงิน กรุณาลองใหม่อีกครั้ง',
    NOT_ISSUED: 'ระบบยังไม่ออกใบเสนอราคาของคำขอนี้ กดรีเฟรชอีกครั้ง หากยังไม่ปรากฏให้ติดต่อเจ้าหน้าที่',
    EXPIRED: 'ใบเสนอราคาของคำขอนี้เกินกำหนดยืนราคาแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อออกใบใหม่',
    NOT_ACCEPTED: 'กรุณายอมรับใบเสนอราคาก่อนชำระเงิน',
});

/**
 * Refuse to create a payment unless this application's quotation(s) are accepted.
 *
 * @param {object} args
 * @param {string} args.applicationId
 * @param {'M1'|'M2'|'PHASE_1'|'PHASE_2'} args.milestone
 * @param {object} [args.client] — Prisma transaction handle, passed straight to
 *   quotation-service as `tx`. The gate itself never opens a transaction.
 * @returns {Promise<{quotation: object, phase: 'PHASE_1'|'PHASE_2', snapshot: object|null}>}
 *   the row that gates this payment, the instalment phase, and the frozen
 *   snapshot the applicant accepted. `snapshot` is null on a row accepted before
 *   snapshots existed or closed by the repair script; the caller decides what a
 *   null means for it (stripe-checkout-service refuses to drift-check against one).
 * @throws {Error & {code, status, statusCode}} — always. There is no skip.
 */
async function assertQuotationAcceptedForPayment({ applicationId, milestone, client } = {}) {
    const phase = MILESTONE_TO_PHASE[String(milestone || '').toUpperCase()];
    if (!applicationId || !phase) {
        // A missing id or an unknown milestone is a programming error, not an
        // applicant error, and it must never become an accidental bypass.
        throw gateError('QUOTATION_GATE_UNAVAILABLE', 503, MSG.UNAVAILABLE);
    }

    let rows;
    try {
        // Lazy require: quotation-service pulls in document-numbering at load,
        // and requiring it at module top breaks slip suites that do not stub
        // that chain — the same reason payment-slip-service defers it.
        const quotationService = require('../quotation-service');
        rows = await quotationService.findQuotationsByApplicationId(applicationId, { tx: client });
    } catch (err) {
        logger.error('[quotation-gate] lookup failed, refusing rather than opening', {
            applicationId, milestone, errMessage: err?.message || String(err),
        });
        throw Object.assign(gateError('QUOTATION_GATE_UNAVAILABLE', 503, MSG.UNAVAILABLE), { cause: err });
    }

    // W14 (operator ruling 2026-08-22): a newly quoted application has exactly
    // ONE row, issuerType 'PLATFORM' — the company issues the whole price. A
    // pre-W14 application legitimately has a DTAM row as well, and BOTH of those
    // priced part of the bill, so BOTH must be accepted.
    const gating = [rows?.dtam, rows?.platform].filter(Boolean);

    if (gating.length === 0) {
        logger.error('[quotation-gate] no quotation of record, payment refused', {
            applicationId, milestone,
        });
        throw gateError('QUOTATION_NOT_ISSUED', 409, MSG.NOT_ISSUED);
    }

    const now = Date.now();
    for (const q of gating) {
        const status = String(q.status || '').toUpperCase();
        if (QUOTATION_ACCEPTED_STATES.includes(status)) { continue; }
        // A validity window binds an offer that has NOT been accepted; an
        // accepted quotation is an agreement, and agreements do not lapse
        // because the offer window closed. The 30-day window is ours
        // (quotation-service DEFAULT_VALIDITY_DAYS) — the ป.พ.พ. wording in the
        // research is UNVERIFIED and is deliberately not cited in user copy.
        if (q.validUntil && new Date(q.validUntil).getTime() < now) {
            throw gateError('QUOTATION_EXPIRED', 409, MSG.EXPIRED);
        }
        throw gateError('QUOTATION_NOT_ACCEPTED', 409, MSG.NOT_ACCEPTED);
    }

    // The company row carries the whole price and therefore the snapshot the
    // charge is checked against; a pre-W14 DTAM row is a gate, not the price of
    // record for the bundled charge.
    const primary = rows.platform || rows.dtam;
    return { quotation: primary, phase, snapshot: primary.acceptedSnapshot || null };
}

module.exports = {
    assertQuotationAcceptedForPayment,
    MILESTONE_TO_PHASE,
    QUOTATION_ACCEPTED_STATES,
};
```

- [ ] **Step 9: Run the gate test to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-gate.test.js`
Expected: PASS, 10/10.

- [ ] **Step 10: Rewire the slip rail, and rewrite its test in the same step**

Replace the body of `assertQuotationAcceptedForPhase1Slip` in `apps/backend/services/payment-slip-service.js` (`:448-505`) with a delegation. Keep the exported name: `recordApplicationSlipUpload` calls it at `:623`.

```js
/**
 * Hard gate: a PHASE_1 application slip may only be uploaded once the
 * application's quotation has been accepted. Delegates to the ONE gate both
 * rails share (services/billing/quotation-gate.js).
 *
 * F-G4-64 (2026-08-28) — THE LEGACY FAIL-OPEN IS GONE. This function used to
 * return quietly when no quotation row existed ("no quotation ... allowing
 * PHASE_1 slip"). That branch is the shape of application A2: 35,310 THB
 * collected, two tax receipts issued, an active certificate, and no pricing
 * document anywhere in the register. No quotation is now a refusal.
 *
 * `serviceType` is no longer consulted: under W14 there is ONE quotation for
 * the whole price, so there is nothing to route by. The parameter stays in the
 * signature because the call site passes it, and changing that call site is a
 * different change.
 *
 * @param {object} args
 * @param {string} args.applicationId
 * @param {'PHASE_1'|'PHASE_2'} args.phase
 * @param {string} [args.serviceType] — accepted and ignored (W14)
 */
async function assertQuotationAcceptedForPhase1Slip({ applicationId, phase }) {
  if (phase !== 'PHASE_1') { return; }
  const { assertQuotationAcceptedForPayment } = require('./billing/quotation-gate');
  await assertQuotationAcceptedForPayment({ applicationId, milestone: 'PHASE_1' });
}
```

Then rewrite `apps/backend/__tests__/unit/quotation-gate-phase1-slip.test.js` in full. **Three of its eight existing cases assert the behaviour this task deletes** (`fails open`, `unclassifiable serviceType is skipped`, and the side-isolation case that assumes a per-side row) — they are replaced, not removed, so the file becomes the proof that the fail-open is gone:

```js
'use strict';

/**
 * The slip rail's PHASE_1 gate, after it was rewired onto the shared gate
 * (F-G4-64). Three cases in this file used to assert a fail-open; they now
 * assert the refusal, which is the whole point of the change.
 */

const mockAssert = jest.fn();
jest.mock('../../services/billing/quotation-gate', () => ({
  assertQuotationAcceptedForPayment: (...a) => mockAssert(...a),
}));

jest.mock('../../services/prisma-database', () => ({
  prisma: {
    application: { findUnique: jest.fn() },
    invoice: { findUnique: jest.fn() },
    paymentSlip: { findUnique: jest.fn(), updateMany: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const slipService = require('../../services/payment-slip-service');

const APP_ID = 'app-123';

describe('assertQuotationAcceptedForPhase1Slip — delegates to the ONE gate', () => {
  beforeEach(() => { jest.clearAllMocks(); mockAssert.mockResolvedValue({ phase: 'PHASE_1' }); });

  it('PHASE_2 is a no-op (acceptance is a one-time, pre-Phase-1 step)', async () => {
    await expect(slipService.assertQuotationAcceptedForPhase1Slip({
      applicationId: APP_ID, phase: 'PHASE_2', serviceType: 'PHASE_2_STATE_FEE',
    })).resolves.toBeUndefined();
    expect(mockAssert).not.toHaveBeenCalled();
  });

  it('PHASE_1 asks the shared gate, in the slip rail vocabulary', async () => {
    await expect(slipService.assertQuotationAcceptedForPhase1Slip({
      applicationId: APP_ID, phase: 'PHASE_1', serviceType: 'PHASE_1_STATE_FEE',
    })).resolves.toBeUndefined();
    expect(mockAssert).toHaveBeenCalledWith({ applicationId: APP_ID, milestone: 'PHASE_1' });
  });

  it('the gate refusal reaches the caller unchanged (QUOTATION_NOT_ACCEPTED, 409)', async () => {
    mockAssert.mockRejectedValue(Object.assign(new Error('กรุณายอมรับใบเสนอราคาก่อนชำระเงิน'),
      { code: 'QUOTATION_NOT_ACCEPTED', status: 409, statusCode: 409 }));
    await expect(slipService.assertQuotationAcceptedForPhase1Slip({
      applicationId: APP_ID, phase: 'PHASE_1', serviceType: 'PHASE_1_STATE_FEE',
    })).rejects.toMatchObject({ code: 'QUOTATION_NOT_ACCEPTED', status: 409 });
  });

  it('NO quotation now REFUSES: the legacy fail-open is gone (this is application A2)', async () => {
    mockAssert.mockRejectedValue(Object.assign(new Error('ระบบยังไม่ออกใบเสนอราคาของคำขอนี้'),
      { code: 'QUOTATION_NOT_ISSUED', status: 409, statusCode: 409 }));
    await expect(slipService.assertQuotationAcceptedForPhase1Slip({
      applicationId: APP_ID, phase: 'PHASE_1', serviceType: 'PHASE_1_STATE_FEE',
    })).rejects.toMatchObject({ code: 'QUOTATION_NOT_ISSUED' });
  });

  it('an unclassifiable serviceType no longer skips the gate (W14: one quotation, nothing to route by)', async () => {
    await expect(slipService.assertQuotationAcceptedForPhase1Slip({
      applicationId: APP_ID, phase: 'PHASE_1', serviceType: '',
    })).resolves.toBeUndefined();
    expect(mockAssert).toHaveBeenCalledWith({ applicationId: APP_ID, milestone: 'PHASE_1' });
  });

  it('a lookup failure surfaces as 503, never as a pass', async () => {
    mockAssert.mockRejectedValue(Object.assign(new Error('ตรวจสอบสถานะใบเสนอราคาไม่สำเร็จ'),
      { code: 'QUOTATION_GATE_UNAVAILABLE', status: 503, statusCode: 503 }));
    await expect(slipService.assertQuotationAcceptedForPhase1Slip({
      applicationId: APP_ID, phase: 'PHASE_1', serviceType: 'PHASE_1_STATE_FEE',
    })).rejects.toMatchObject({ code: 'QUOTATION_GATE_UNAVAILABLE', status: 503 });
  });
});
```

- [ ] **Step 11: Run the suite and its siblings**

Sibling suites that must stay green for this task:

```bash
cd apps/backend
npx jest __tests__/unit/quotation-gate.test.js \
         __tests__/unit/quotation-gate-phase1-slip.test.js \
         __tests__/unit/payment-terms-gate-slip.test.js \
         __tests__/unit/renewal-issues-quotation.test.js \
         __tests__/unit/quotation-service.test.js
npx jest __tests__/integration/quotation-accept-to-phase1-gate-flow.test.js
# the rail flag is live on this path, so run the other branch too
STRIPE_CHECKOUT_ENABLED= npx jest __tests__/unit/quotation-gate-phase1-slip.test.js \
         __tests__/integration/quotation-accept-to-phase1-gate-flow.test.js
npx jest --listTests | grep -i renewal   # then run each hit
```

Expected: PASS. `quotation-accept-to-phase1-gate-flow.test.js` is DB-backed and calls `markQuotationInvoiced` at `:176`; if it reports the same skip verdict it gives on `main`, that is the baseline, not a pass — say which one you got.

- [ ] **Step 12: Commit**

```bash
git add apps/backend/services/billing/quotation-gate.js \
        apps/backend/services/payment-slip-service.js \
        apps/backend/services/renewal-service.js \
        apps/backend/__tests__/unit/quotation-gate.test.js \
        apps/backend/__tests__/unit/quotation-gate-phase1-slip.test.js \
        apps/backend/__tests__/unit/renewal-issues-quotation.test.js
git commit -m "feat(billing): one quotation gate for both rails, and it no longer fails open

No quotation is now a refusal, not a pass. The deleted branch is the shape of
application A2: 35,310 THB collected against no pricing document at all.

A renewal never passed through either submit door and so was never quoted;
renewal-service now issues at creation, or says it could not.

Refs F-G4-64 R1."
```

---

### Task 4: Acceptance freezes a snapshot and its hash; the API and the PDF render the row

**Files:**
- Modify: `apps/backend/services/quotation-service.js` (`markQuotationAccepted` at `:648`; new `buildAcceptanceSnapshot`, `canonicalSnapshotHash`; `module.exports` at `:728`)
- Modify: `apps/backend/routes/api/applications/quotations.js` (GET at `:118`, the live recompute at `:162-163`; accept at `:278`, `markQuotationAccepted` call at `:303`)
- Modify: `apps/backend/services/pdf/invoice-template-service.js:1003` (`generateQuotationPdf`)
- Test: `apps/backend/__tests__/unit/quotation-acceptance-snapshot.test.js`
- Test: `apps/backend/__tests__/unit/quotation-api-renders-the-row.test.js`

**Interfaces:**
- Consumes: the columns from T1.
- Produces:

```js
// apps/backend/services/quotation-service.js — new exports
/**
 * The document the applicant sees, built ONLY from the stored row. Pure.
 * Every money field is a 2-decimal string so the snapshot survives JSON
 * round-trips with no float drift.
 * @param {object} row  a Quotation row (installments, subtotal, vat, totalAmount, ...)
 * @param {{renderedAt?: Date, issuerType?: string}} [opts]
 * @returns {{
 *   quotationNumber: string, issuerType: string, scopeCount: number, currency: 'THB',
 *   installments: Array<{phase: string, stateAmount: string, platformAmount: string,
 *                        vatAmount: string, phaseTotal: string}>,
 *   subtotal: string, vat: string, totalAmount: string, validUntil: string|null,
 *   feeTable: {phase1RatePerScope: string, phase2RatePerScope: string,
 *              platformRate: string, vatRate: string},
 *   renderedAt: string
 * }}
 */
function buildAcceptanceSnapshot(row, opts)

/** sha256 hex over the canonical (recursively key-sorted) JSON of a snapshot. Pure. */
function canonicalSnapshotHash(snapshot)

/**
 * @param {string} quotationId
 * @param {{acceptedBy: string, acceptedAt?: Date, snapshot: object, tx?: object}} opts
 * @returns {Promise<object>} the updated row, carrying acceptedSnapshot + acceptedSnapshotHash
 * @throws {Error & {code:'QUOTATION_NOT_FOUND'|'INVALID_QUOTATION_STATUS'|'SNAPSHOT_REQUIRED'}}
 */
async function markQuotationAccepted(quotationId, opts)
```

`buildAcceptanceSnapshot` and `canonicalSnapshotHash` are additionally exported through the existing `_internals` object so they can be asserted with no database, the way `resolveBillableFees` and `buildInstallments` already are (`quotation-service.js:744-746`).

- [ ] **Step 1: Write the failing test (snapshot + hash)**

Create `apps/backend/__tests__/unit/quotation-acceptance-snapshot.test.js`:

```js
'use strict';
/**
 * Acceptance freezes what the applicant saw (F-G4-64 R2, spec 3.2).
 *
 * The snapshot is built from the STORED ROW, never from a live fee
 * calculation: channel C in synthesis.md 3.3 is precisely that the rate table
 * has no effective date, so a recompute renders a different document from the
 * one the row holds. A snapshot that recomputes proves nothing at all.
 */
const crypto = require('crypto');

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: () => l };
});
const mockQuotationUpdate = jest.fn();
const mockQuotationFindFirst = jest.fn();
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        quotation: {
            findFirst: (...a) => mockQuotationFindFirst(...a),
            update: (...a) => mockQuotationUpdate(...a),
        },
    },
}));

const quotationService = require('../../services/quotation-service');
const { buildAcceptanceSnapshot, canonicalSnapshotHash } = quotationService._internals;

/** QT-PRD-2026-000001 exactly as the register holds it (register.md B). */
const ROW = {
    id: 'qt-1',
    quotationNumber: 'QT-PRD-2026-000001',
    issuerType: 'PLATFORM',
    status: 'PENDING',
    subtotal: '33000.00',
    vat: '2310.00',
    totalAmount: '35310.00',
    validUntil: new Date('2026-09-24T00:00:00.000Z'),
    installments: [
        { phase: 'PHASE_1', amount: 5885, stateAmount: 5000, platformAmount: 500, vatAmount: 385, scopeCount: 1 },
        { phase: 'PHASE_2', amount: 29425, stateAmount: 25000, platformAmount: 2500, vatAmount: 1925, scopeCount: 1 },
    ],
};

const AT = new Date('2026-08-28T03:00:00.000Z');

describe('buildAcceptanceSnapshot — the row, and only the row', () => {
    it('carries every instalment with a 2-decimal string per money field', () => {
        const s = buildAcceptanceSnapshot(ROW, { renderedAt: AT });
        expect(s.quotationNumber).toBe('QT-PRD-2026-000001');
        expect(s.issuerType).toBe('PLATFORM');
        expect(s.currency).toBe('THB');
        expect(s.scopeCount).toBe(1);
        expect(s.installments).toEqual([
            { phase: 'PHASE_1', stateAmount: '5000.00', platformAmount: '500.00', vatAmount: '385.00', phaseTotal: '5885.00' },
            { phase: 'PHASE_2', stateAmount: '25000.00', platformAmount: '2500.00', vatAmount: '1925.00', phaseTotal: '29425.00' },
        ]);
        expect(s.subtotal).toBe('33000.00');
        expect(s.vat).toBe('2310.00');
        expect(s.totalAmount).toBe('35310.00');
        expect(s.validUntil).toBe('2026-09-24T00:00:00.000Z');
        expect(s.renderedAt).toBe('2026-08-28T03:00:00.000Z');
    });

    it('reads no rate table: a row whose figures predate a rate change snapshots the OLD figures', () => {
        const old = { ...ROW, installments: [{ phase: 'PHASE_1', amount: 5535, stateAmount: 5000, platformAmount: 500, vatAmount: 35, scopeCount: 1 },
            { phase: 'PHASE_2', amount: 27675, stateAmount: 25000, platformAmount: 2500, vatAmount: 175, scopeCount: 1 }] };
        const s = buildAcceptanceSnapshot(old, { renderedAt: AT });
        // The retired pre-W14 VAT base. If anything here recomputed, these would
        // come back 385 / 1,925 instead.
        expect(s.installments[0].vatAmount).toBe('35.00');
        expect(s.installments[1].vatAmount).toBe('175.00');
    });

    it('a renewal row (PHASE_2 only) snapshots one instalment, not two', () => {
        const renewal = { ...ROW, installments: [ROW.installments[1]] };
        expect(buildAcceptanceSnapshot(renewal, { renderedAt: AT }).installments).toHaveLength(1);
    });
});

describe('canonicalSnapshotHash', () => {
    it('is sha256 over key-sorted JSON, so key order cannot change the hash', () => {
        const a = { b: '2.00', a: '1.00', nested: { y: 2, x: 1 } };
        const b = { a: '1.00', nested: { x: 1, y: 2 }, b: '2.00' };
        expect(canonicalSnapshotHash(a)).toBe(canonicalSnapshotHash(b));
        expect(canonicalSnapshotHash(a)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('changes when one satang changes', () => {
        const s = buildAcceptanceSnapshot(ROW, { renderedAt: AT });
        const drifted = JSON.parse(JSON.stringify(s));
        drifted.installments[0].phaseTotal = '5885.01';
        expect(canonicalSnapshotHash(drifted)).not.toBe(canonicalSnapshotHash(s));
    });

    it('matches an independently computed sha256 of the canonical form', () => {
        const s = { b: '2.00', a: '1.00' };
        const expected = crypto.createHash('sha256')
            .update(JSON.stringify({ a: '1.00', b: '2.00' })).digest('hex');
        expect(canonicalSnapshotHash(s)).toBe(expected);
    });
});

describe('markQuotationAccepted — records the actor, the instant, the snapshot and its hash', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuotationFindFirst.mockResolvedValue({ ...ROW });
        mockQuotationUpdate.mockImplementation(async ({ data }) => ({ ...ROW, ...data }));
    });

    it('writes acceptedSnapshot, acceptedSnapshotHash, acceptedBy and acceptedAt', async () => {
        const snapshot = buildAcceptanceSnapshot(ROW, { renderedAt: AT });
        await quotationService.markQuotationAccepted('qt-1', {
            acceptedBy: 'user-1', acceptedAt: AT, snapshot,
        });
        const { data } = mockQuotationUpdate.mock.calls[0][0];
        expect(data.status).toBe('ACCEPTED');
        expect(data.acceptedAt).toBe(AT);
        expect(data.acceptedBy).toBe('user-1');
        // updatedBy keeps its old meaning too — existing readers are unchanged.
        expect(data.updatedBy).toBe('user-1');
        expect(data.acceptedSnapshot).toEqual(snapshot);
        expect(data.acceptedSnapshotHash).toBe(canonicalSnapshotHash(snapshot));
    });

    it('refuses to record an acceptance with no snapshot: an acceptance of nothing is not evidence', async () => {
        await expect(quotationService.markQuotationAccepted('qt-1', { acceptedBy: 'user-1' }))
            .rejects.toMatchObject({ code: 'SNAPSHOT_REQUIRED' });
        expect(mockQuotationUpdate).not.toHaveBeenCalled();
    });

    it('an already-ACCEPTED row is still an idempotent no-op and its snapshot is NOT overwritten', async () => {
        const frozen = buildAcceptanceSnapshot(ROW, { renderedAt: AT });
        mockQuotationFindFirst.mockResolvedValue({
            ...ROW, status: 'ACCEPTED', acceptedSnapshot: frozen, acceptedSnapshotHash: canonicalSnapshotHash(frozen),
        });
        const out = await quotationService.markQuotationAccepted('qt-1', {
            acceptedBy: 'user-2', snapshot: buildAcceptanceSnapshot(ROW, { renderedAt: new Date() }),
        });
        expect(mockQuotationUpdate).not.toHaveBeenCalled();
        expect(out.acceptedSnapshotHash).toBe(canonicalSnapshotHash(frozen));
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-acceptance-snapshot.test.js`
Expected: FAIL — `TypeError: buildAcceptanceSnapshot is not a function` on the first describe, and `expect(data.acceptedSnapshot).toEqual(snapshot)` receives `undefined` in the last.

- [ ] **Step 3: Implement the snapshot builder, the hash and the new acceptance write**

In `apps/backend/services/quotation-service.js`, add near the top with the other requires:

```js
const crypto = require('crypto');
```

and add these two pure helpers above `markQuotationAccepted` (`:648`):

```js
/** THB as a fixed 2-decimal string. Decimal columns arrive as strings; installments as numbers. */
function _thb(value) {
    return Number(value ?? 0).toFixed(2);
}

/**
 * The document the applicant sees at the instant of acceptance, built from THIS
 * ROW and nothing else (spec 3.2, R2).
 *
 * It must NOT call the fee service. Channel C in synthesis.md 3.3 is that the
 * rate table has no effective date (config/business-rules.js:112-154), so a
 * recompute renders a document that is not the one the row holds — which is
 * exactly what the API (routes/.../quotations.js:163) and the PDF
 * (invoice-template-service.js:1021) do today. `feeTable` therefore records the
 * per-scope rates DERIVED FROM THIS ROW, not read from the config module.
 *
 * @param {object} row  a Quotation row
 * @param {{renderedAt?: Date}} [opts]
 * @returns {object} plain JSON, every money field a 2-decimal string
 */
function buildAcceptanceSnapshot(row, opts = {}) {
    const renderedAt = opts.renderedAt instanceof Date ? opts.renderedAt : new Date();
    const raw = Array.isArray(row?.installments) ? row.installments : [];
    const scopeCount = Number(raw[0]?.scopeCount) > 0 ? Number(raw[0].scopeCount) : 1;
    const installments = raw.map((it) => {
        const state = Number(it.stateAmount ?? 0);
        const platform = Number(it.platformAmount ?? 0);
        const vat = Number(it.vatAmount ?? 0);
        return {
            phase: it.phase,
            stateAmount: _thb(state),
            platformAmount: _thb(platform),
            vatAmount: _thb(vat),
            // The row's own arithmetic, not the fee service's: if a legacy row
            // disagrees with itself, the snapshot shows that rather than hiding it.
            phaseTotal: _thb(state + platform + vat),
        };
    });
    const byPhase = Object.fromEntries(raw.map((it) => [it.phase, it]));
    return {
        quotationNumber: row?.quotationNumber ?? null,
        issuerType: row?.issuerType ?? null,
        scopeCount,
        currency: 'THB',
        installments,
        subtotal: _thb(row?.subtotal),
        vat: _thb(row?.vat),
        totalAmount: _thb(row?.totalAmount),
        validUntil: row?.validUntil ? new Date(row.validUntil).toISOString() : null,
        feeTable: {
            phase1RatePerScope: _thb(Number(byPhase.PHASE_1?.stateAmount ?? 0) / scopeCount),
            phase2RatePerScope: _thb(Number(byPhase.PHASE_2?.stateAmount ?? 0) / scopeCount),
            platformRate: _thb(
                Number(byPhase.PHASE_2?.stateAmount ?? 0) > 0
                    ? Number(byPhase.PHASE_2.platformAmount) / Number(byPhase.PHASE_2.stateAmount)
                    : 0,
            ),
            vatRate: _thb(
                (Number(byPhase.PHASE_2?.stateAmount ?? 0) + Number(byPhase.PHASE_2?.platformAmount ?? 0)) > 0
                    ? Number(byPhase.PHASE_2.vatAmount)
                        / (Number(byPhase.PHASE_2.stateAmount) + Number(byPhase.PHASE_2.platformAmount))
                    : 0,
            ),
        },
        renderedAt: renderedAt.toISOString(),
    };
}

/** Recursively key-sorted JSON, so serialisation order cannot change the hash. */
function _canonicalise(value) {
    if (Array.isArray(value)) { return value.map(_canonicalise); }
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((acc, k) => {
            acc[k] = _canonicalise(value[k]);
            return acc;
        }, {});
    }
    return value;
}

/** sha256 hex over the canonical JSON of a snapshot. Pure. */
function canonicalSnapshotHash(snapshot) {
    return crypto.createHash('sha256').update(JSON.stringify(_canonicalise(snapshot))).digest('hex');
}
```

Then change `markQuotationAccepted` (`:648`) so it takes and stores the snapshot. Only the `opts` destructuring, the new guard, and the `data` object change; the status guard at `:663-678` is untouched:

```js
    const { acceptedBy = null, acceptedAt = new Date(), snapshot = null, tx = null } = opts;
```

immediately after that line:

```js
    // An acceptance with no snapshot records that someone pressed a button and
    // nothing about what they were shown, which is the gap ISO/IEC 17065 4.1.2.1
    // asks about (synthesis.md 5(ก).9). Refuse rather than write a half-record.
    if (!snapshot || typeof snapshot !== 'object') {
        const err = new Error('[quotation-service] markQuotationAccepted: snapshot required');
        err.code = 'SNAPSHOT_REQUIRED';
        throw err;
    }
```

and the write at `:679-686` becomes:

```js
    return db.quotation.update({
        where: { id: quotationId },
        data: {
            status: QUOTATION_STATUS.ACCEPTED,
            acceptedAt,
            acceptedBy,
            acceptedSnapshot: snapshot,
            acceptedSnapshotHash: canonicalSnapshotHash(snapshot),
            // Kept: every existing reader of updatedBy keeps working. acceptedBy
            // is the narrower fact (this column moves only on acceptance).
            updatedBy: acceptedBy,
        },
    });
```

Export both helpers on `module.exports._internals` (beside `resolveBillableFees` and `buildInstallments`) **and** at the top level so the route can call them:

```js
    buildAcceptanceSnapshot,
    canonicalSnapshotHash,
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-acceptance-snapshot.test.js`
Expected: PASS, 9/9.

- [ ] **Step 5: Write the failing test for the API and the PDF rendering the row**

Create `apps/backend/__tests__/unit/quotation-api-renders-the-row.test.js`:

```js
'use strict';
/**
 * The quotation the applicant is shown is the row, not a recomputation
 * (spec 3.2, closing channel C of synthesis.md 3.3).
 *
 * GET /api/applications/:id/quotations recomputes at the CURRENT rate
 * (routes/api/applications/quotations.js:163) and generateQuotationPdf does the
 * same (invoice-template-service.js:1021). If the rate table moves, the row,
 * the screen and the PDF are three different numbers, while
 * docs/legal/payment-terms-th-v1.md promises the price is locked at submission.
 */
const { buildQuotationLineItemsFromRow } = require('../../services/quotation-line-items');

const ROW = {
    id: 'qt-1',
    quotationNumber: 'QT-PRD-2026-000001',
    issuerType: 'PLATFORM',
    status: 'ACCEPTED',
    subtotal: '33000.00',
    vat: '2310.00',
    totalAmount: '35310.00',
    installments: [
        { phase: 'PHASE_1', amount: 5885, stateAmount: 5000, platformAmount: 500, vatAmount: 385, scopeCount: 1 },
        { phase: 'PHASE_2', amount: 29425, stateAmount: 25000, platformAmount: 2500, vatAmount: 1925, scopeCount: 1 },
    ],
    acceptedSnapshot: null,
};

test('line items come from the stored installments, at the row scopeCount', () => {
    const items = buildQuotationLineItemsFromRow(ROW, ['outdoor']);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
        method: 'outdoor', phase1Amount: 5885, phase2Amount: 29425,
    });
});

test('a row written under the retired VAT base renders THAT row, not the current formula', () => {
    const legacy = {
        ...ROW,
        installments: [
            { phase: 'PHASE_1', amount: 5535, stateAmount: 5000, platformAmount: 500, vatAmount: 35, scopeCount: 1 },
            { phase: 'PHASE_2', amount: 27675, stateAmount: 25000, platformAmount: 2500, vatAmount: 175, scopeCount: 1 },
        ],
    };
    const items = buildQuotationLineItemsFromRow(legacy, ['outdoor']);
    // Under the live formula these would be 5,885 / 29,425.
    expect(items[0].phase1Amount).toBe(5535);
    expect(items[0].phase2Amount).toBe(27675);
});

test('a 3-scope row splits the stored totals across the three methods, summing back exactly', () => {
    const three = {
        ...ROW,
        installments: [
            { phase: 'PHASE_1', amount: 17655, stateAmount: 15000, platformAmount: 1500, vatAmount: 1155, scopeCount: 3 },
            { phase: 'PHASE_2', amount: 88275, stateAmount: 75000, platformAmount: 7500, vatAmount: 5775, scopeCount: 3 },
        ],
    };
    const items = buildQuotationLineItemsFromRow(three, ['indoor', 'greenhouse', 'outdoor']);
    expect(items).toHaveLength(3);
    expect(items.reduce((s, i) => s + i.phase1Amount, 0)).toBe(17655);
    expect(items.reduce((s, i) => s + i.phase2Amount, 0)).toBe(88275);
});

test('an accepted row renders its FROZEN snapshot, even if the installments were later touched', () => {
    const accepted = {
        ...ROW,
        acceptedSnapshot: {
            installments: [
                { phase: 'PHASE_1', stateAmount: '5000.00', platformAmount: '500.00', vatAmount: '385.00', phaseTotal: '5885.00' },
                { phase: 'PHASE_2', stateAmount: '25000.00', platformAmount: '2500.00', vatAmount: '1925.00', phaseTotal: '29425.00' },
            ],
            scopeCount: 1,
        },
        installments: [
            { phase: 'PHASE_1', amount: 9999, stateAmount: 9000, platformAmount: 900, vatAmount: 99, scopeCount: 1 },
            { phase: 'PHASE_2', amount: 9999, stateAmount: 9000, platformAmount: 900, vatAmount: 99, scopeCount: 1 },
        ],
    };
    const items = buildQuotationLineItemsFromRow(accepted, ['outdoor']);
    expect(items[0].phase1Amount).toBe(5885);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-api-renders-the-row.test.js`
Expected: FAIL — `buildQuotationLineItemsFromRow is not a function`.

- [ ] **Step 7: Add the row-based renderer and use it in the route and the PDF**

Add to `apps/backend/services/quotation-line-items.js` (beside the existing `buildQuotationLineItems`, whose signature at `:56` stays for legacy callers):

```js
/**
 * Per-cultivation-method line items derived from the STORED quotation, in this
 * order of preference: the frozen acceptedSnapshot, else the row's own
 * installments. Never the fee service (spec 3.2 — the document shown must be
 * the document held).
 *
 * @param {object} row  a Quotation row (installments, optionally acceptedSnapshot)
 * @param {string[]} methods  unique cultivation methods, for labelling
 * @returns {Array<{method, label, phase1Amount, phase2Amount, netAmount, taxAmount}>}
 */
function buildQuotationLineItemsFromRow(row, methods) {
    const source = (row?.acceptedSnapshot?.installments?.length
        ? row.acceptedSnapshot.installments.map((it) => ({
            phase: it.phase,
            stateAmount: Number(it.stateAmount),
            platformAmount: Number(it.platformAmount),
            vatAmount: Number(it.vatAmount),
            scopeCount: Number(row.acceptedSnapshot.scopeCount) || 1,
        }))
        : (row?.installments || []));
    const byPhase = Object.fromEntries(source.map((it) => [it.phase, it]));
    const scope = Math.max(1, Number(source[0]?.scopeCount) || (Array.isArray(methods) ? methods.length : 1) || 1);
    const list = (Array.isArray(methods) && methods.length)
        ? methods
        : Array.from({ length: scope }, (_u, i) => `SCOPE_${i + 1}`);
    const phaseTotal = (p) => (p
        ? Number(p.stateAmount || 0) + Number(p.platformAmount || 0) + Number(p.vatAmount || 0)
        : 0);
    // Whole baht per scope, with the remainder on the FIRST row, so the rows sum
    // back to the stored total to the satang instead of drifting by rounding.
    const share = (total, index) => {
        const per = Math.floor(total / scope);
        return index === 0 ? total - per * (scope - 1) : per;
    };
    return list.map((method, index) => ({
        method,
        label: labelForMethod(method),
        phase1Amount: share(phaseTotal(byPhase.PHASE_1), index),
        phase2Amount: share(phaseTotal(byPhase.PHASE_2), index),
        netAmount: share(
            Number(byPhase.PHASE_1?.stateAmount || 0) + Number(byPhase.PHASE_1?.platformAmount || 0)
            + Number(byPhase.PHASE_2?.stateAmount || 0) + Number(byPhase.PHASE_2?.platformAmount || 0), index),
        taxAmount: share(
            Number(byPhase.PHASE_1?.vatAmount || 0) + Number(byPhase.PHASE_2?.vatAmount || 0), index),
    }));
}
```

(`labelForMethod` is the existing helper in that same file — declared at `quotation-line-items.js:33`, exported at `:96`, backed by `CULTIVATION_LABELS` at `:27`. Reuse it. Do not add a second label mapping: L4 forbids a duplicate source.)

In `apps/backend/routes/api/applications/quotations.js`, replace the recompute at `:158-168`:

```js
        // F-G4-64 — render the ROW, not the current rate table. The previous
        // code called calculateApplicationFees here, so an application quoted
        // before a rate change was SHOWN the new price while the row held the
        // old one, against docs/legal/payment-terms-th-v1.1.md ("ล็อกราคา ณ
        // วันยื่นคำขอ"). `methods` is still read from the application because it
        // is a label, not a price.
        const app = await applicationService.getApplicationSlice(applicationId, {
            select: { formData: true, cultivationScopeCount: true, totalAreaTypes: true },
        });
        const methods = collectUniqueCultivationMethods(app?.formData || {});
        const withLineItems = (row) => (row
            ? { ...row, lineItems: buildQuotationLineItemsFromRow(row, methods) }
            : null);
```

and update the two `withLineItems(...)` call sites at `:172-173` to drop their second argument. Remove the now-unused `calculateApplicationFees` / `storedCultivationScopeCount` imports **only if nothing else in the file uses them** — check with `grep -n "calculateApplicationFees\|storedCultivationScopeCount" apps/backend/routes/api/applications/quotations.js` before deleting, or the file will not load.

In `apps/backend/services/pdf/invoice-template-service.js`, give `generateQuotationPdf` (`:1003`) an optional stored row and prefer it:

```js
async function generateQuotationPdf({ application, issuerSide, phase, quotationRow }, opts = {}) {
```

and, after the `INVALID_ISSUER_SIDE` guard (`:1009-1016`), branch before the recompute at `:1018-1021`:

```js
    // F-G4-64 — when the caller hands us the stored row, the PDF is a rendering
    // of that row. Recomputing here is channel C of synthesis.md 3.3: the
    // document the applicant holds stops matching the row that priced it.
    const frozen = quotationRow?.acceptedSnapshot?.installments?.length
        ? quotationRow.acceptedSnapshot
        : null;
```

then take `scopeCount`, the per-phase figures and `quotationNumber` from `frozen` when it is present, and fall back to the existing `calculateApplicationFees` path only when it is not (a legacy row with no snapshot). The route's PDF handler passes `quotationRow` from `findQuotationsByApplicationId`.

- [ ] **Step 8: Store the snapshot on accept**

In `apps/backend/routes/api/applications/quotations.js`, replace the `markQuotationAccepted` call at `:303-305`:

```js
            // Build the snapshot from the row the applicant is accepting, at
            // this instant, and let the service hash it. Nothing here consults
            // the fee service: the applicant is agreeing to THIS document.
            const snapshot = quotationService.buildAcceptanceSnapshot(row, { renderedAt: new Date() });
            const accepted = await quotationService.markQuotationAccepted(row.id, {
                acceptedBy: req.user?.id || null,
                snapshot,
            });
```

and add a `SNAPSHOT_REQUIRED` branch beside the existing `INVALID_QUOTATION_STATUS` branch at `:342-348`:

```js
            if (err?.code === 'SNAPSHOT_REQUIRED') {
                return res.status(500).json({
                    success: false,
                    error: err.code,
                    message: 'ไม่สามารถบันทึกการยอมรับใบเสนอราคาได้ กรุณาลองใหม่อีกครั้ง',
                });
            }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-api-renders-the-row.test.js __tests__/unit/quotation-acceptance-snapshot.test.js`
Expected: PASS.

- [ ] **Step 10: Prove the sibling suites still pass**

```bash
cd apps/backend
npx jest __tests__/unit/quotation-service.test.js \
         __tests__/unit/quotation-line-items.test.js \
         __tests__/unit/quotation-pdf-per-type.test.js \
         __tests__/unit/single-issuer-quotation-row.test.js \
         __tests__/unit/single-issuer-frozen-quotation.test.js \
         __tests__/unit/single-issuer-end-to-end-figures.test.js \
         __tests__/unit/quotation-gate.test.js
npx jest __tests__/integration/quotation-accept-to-phase1-gate-flow.test.js
STRIPE_CHECKOUT_ENABLED= npx jest __tests__/unit/quotation-service.test.js
npx jest --listTests | grep -iE "quotation|invoice-template|pdf" # run each hit
```

Expected: PASS. **`quotation-service.test.js:354,377` calls `markQuotationAccepted` / `markQuotationInvoiced` directly** and will fail on `SNAPSHOT_REQUIRED` until its accept calls pass a snapshot — fix it in this task (it is on the T12 list) by passing `snapshot: quotationService._internals.buildAcceptanceSnapshot(row)`.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/services/quotation-service.js \
        apps/backend/services/quotation-line-items.js \
        apps/backend/routes/api/applications/quotations.js \
        apps/backend/services/pdf/invoice-template-service.js \
        apps/backend/__tests__/unit/quotation-acceptance-snapshot.test.js \
        apps/backend/__tests__/unit/quotation-api-renders-the-row.test.js \
        apps/backend/__tests__/unit/quotation-service.test.js
git commit -m "feat(billing): acceptance freezes the document, and the document shown is the row

markQuotationAccepted now refuses an acceptance with no snapshot, stores what
the applicant saw and the sha256 over it. The list API and the PDF render the
stored row instead of recomputing at today's rate, which is what let the row,
the screen and the charge be three different numbers.

Refs F-G4-64 R2, spec 3.2."
```

---

### Task 5: `createCheckoutForApplication` — gate, no DRAFT, drift refusal, binding, payment-terms consent

**Files:**
- Modify: `apps/backend/services/checkout/stripe-checkout-service.js` (`PAYABLE_STATES` at `:40-43`; `createCheckoutForApplication` at `:161`; the ownership/status checks at `:166-181`; `adapter.assertReady()` at `:184-187`; the re-entry lookup at `:191-193`; the order create at `:221-229`)
- Modify: `apps/backend/routes/api/finance/payments.js:409-455` (pass `paymentTermsAccepted` through)
- Test: `apps/backend/__tests__/unit/checkout-requires-accepted-quotation.test.js`
- Test (modify): `apps/backend/__tests__/unit/stripe-checkout-engine.test.js`, `checkout-vat-line-names-its-base.test.js`, `checkout-renewal-price.test.js` (see T12)

**Interfaces:**
- Consumes: `assertQuotationAcceptedForPayment({ applicationId, milestone, client })` from T3; `canonicalSnapshotHash(snapshot)` from T4; error codes from T2.
- Produces:

```js
// apps/backend/services/checkout/stripe-checkout-service.js
const PAYABLE_STATES = Object.freeze({
    M1: Object.freeze(['SUBMITTED', 'PENDING_DOC_FEE']),   // DRAFT removed
    M2: Object.freeze(['DOC_APPROVED', 'PENDING_AUDIT_FEE']),
});

/**
 * @param {object} args
 * @param {string} args.applicationId
 * @param {'M1'|'M2'} args.milestone
 * @param {{id?: string, healthId?: string}} args.actor
 * @param {{version: string, acceptedAt: string}} [args.paymentTermsAccepted]
 * @returns {Promise<{checkoutOrderId, paymentIntentId, clientSecret, milestone, breakdown,
 *                    quotationNumber: string|null}>}
 */
async function createCheckoutForApplication({ applicationId, milestone, actor, paymentTermsAccepted })
```

The response gains `quotationNumber` so the checkout page can name the document (T8). `breakdown` is unchanged.

**Ordering, exactly as spec §3.1 states it:** ownership → payable status → **quotation gate** → payment-terms consent → snapshot drift check → `adapter.assertReady()` → any DB write. The gate runs **before the re-entry lookup as well**, so an order minted during the drain window cannot be re-entered without acceptance either. That is a deliberate reading of "ก่อน `adapter.assertReady()` และก่อนแตะ DB" — a re-entry that skipped the gate would be a bypass door.

- [ ] **Step 1: Write the failing test — this is RED proofs #1, #2 and #4 of spec §4**

Create `apps/backend/__tests__/unit/checkout-requires-accepted-quotation.test.js`:

```js
'use strict';
/**
 * RED-first, Tier C (F-G4-64, spec 4 proofs 1, 2 and 4).
 *
 * Before this change these three tests PASS while describing a defect, which
 * is the point of pasting them first:
 *   1. a checkout session is created while the quotation is still PENDING;
 *   2. a checkout session is created when there is NO quotation at all
 *      (this is application A2: 35,310 THB, two receipts, an active
 *      certificate, no pricing document — register.md B);
 *   4. a checkout session is created when the amount does not match the
 *      figures the applicant accepted.
 * After the change all three must REFUSE.
 *
 * Mock scaffold follows stripe-checkout-engine.test.js. STRIPE_CHECKOUT_ENABLED
 * is pinned at file top rather than inherited from apps/backend/.env.
 */

// Placeholder credential, split so secret-literal scanners never match it.
process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24);
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(24);
process.env.STRIPE_CHECKOUT_ENABLED = 'true';

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const mockIntentCreate = jest.fn();
jest.mock('stripe', () => jest.fn(() => ({
    paymentIntents: { create: (...a) => mockIntentCreate(...a) },
    webhooks: { constructEvent: jest.fn() },
})));

const mockFindQuotations = jest.fn();
jest.mock('../../services/quotation-service', () => {
    const actual = jest.requireActual('../../services/quotation-service');
    return {
        ...actual,
        findQuotationsByApplicationId: (...a) => mockFindQuotations(...a),
    };
});

const mockAuditLog = jest.fn(async () => ({}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: (...a) => mockAuditLog(...a) },
    AuditCategory: { PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR', CRITICAL: 'CRITICAL' },
    ResourceType: { APPLICATION: 'APPLICATION', PAYMENT: 'PAYMENT' },
}));

const mockDb = {
    application: { findFirst: jest.fn() },
    checkoutOrder: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    invoice: { create: jest.fn(), update: jest.fn() },
    invoiceLineItem: { createMany: jest.fn(async () => ({ count: 3 })) },
    paymentTransaction: { create: jest.fn(), update: jest.fn() },
    // T1 added the model; the mock must carry it or a missing-model TypeError
    // gets caught by the gate and read as "policy refused" (synthesis 5(ก).7).
    quotation: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (cb) => cb(mockDb)),
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));

const { createCheckoutForApplication } =
    require('../../services/checkout/stripe-checkout-service');
const { buildAcceptanceSnapshot } = require('../../services/quotation-service');

const APPLICATION = {
    id: 'app-1',
    applicationNumber: 'APP-2026-000001',
    status: 'PENDING_DOC_FEE',
    healthId: 'HID-1',
    organizationId: 'org-1',
    totalAreaTypes: 1,
    cultivationScopeCount: 1,
    formData: { cultivationMethods: ['outdoor'] },
};

/** The register's QT-PRD-2026-000001, priced for one scope. */
const ROW = {
    id: 'qt-1',
    quotationNumber: 'QT-PRD-2026-000001',
    issuerType: 'PLATFORM',
    status: 'PENDING',
    subtotal: '33000.00',
    vat: '2310.00',
    totalAmount: '35310.00',
    validUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    installments: [
        { phase: 'PHASE_1', amount: 5885, stateAmount: 5000, platformAmount: 500, vatAmount: 385, scopeCount: 1 },
        { phase: 'PHASE_2', amount: 29425, stateAmount: 25000, platformAmount: 2500, vatAmount: 1925, scopeCount: 1 },
    ],
};

function acceptedRow(overrides = {}) {
    const row = { ...ROW, status: 'ACCEPTED', ...overrides };
    return { ...row, acceptedSnapshot: overrides.acceptedSnapshot ?? buildAcceptanceSnapshot(row) };
}

const TERMS = { version: 'payment-terms-th-v1.1', acceptedAt: '2026-08-28T03:00:00.000Z' };

function armMint() {
    mockDb.checkoutOrder.findFirst.mockResolvedValue(null);
    mockDb.checkoutOrder.create.mockImplementation(async ({ data }) => ({ id: 'co-1', ...data }));
    mockDb.invoice.create.mockImplementation(async ({ data }) => ({ id: 'inv-1', ...data }));
    mockDb.paymentTransaction.create.mockImplementation(async ({ data }) => ({ id: 'pt-1', ...data }));
    mockDb.checkoutOrder.update.mockImplementation(async ({ data }) => ({ id: 'co-1', ...data }));
    mockIntentCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'pi_1_secret', status: 'requires_payment_method' });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (cb) => cb(mockDb));
    mockDb.invoiceLineItem.createMany.mockResolvedValue({ count: 3 });
    mockDb.application.findFirst.mockResolvedValue(APPLICATION);
    armMint();
});

const call = (over = {}) => createCheckoutForApplication({
    applicationId: 'app-1',
    milestone: 'M1',
    actor: { id: 'user-1', healthId: 'HID-1' },
    paymentTermsAccepted: TERMS,
    ...over,
});

describe('RED proof 1 — a PENDING quotation must not be payable', () => {
    it('refuses with QUOTATION_NOT_ACCEPTED and mints nothing', async () => {
        mockFindQuotations.mockResolvedValue({ dtam: null, platform: { ...ROW } });
        await expect(call()).rejects.toMatchObject({ code: 'QUOTATION_NOT_ACCEPTED', status: 409 });
        expect(mockDb.checkoutOrder.create).not.toHaveBeenCalled();
        expect(mockIntentCreate).not.toHaveBeenCalled();
    });
});

describe('RED proof 2 — no quotation at all must not be payable (application A2)', () => {
    it('refuses with QUOTATION_NOT_ISSUED and mints nothing', async () => {
        mockFindQuotations.mockResolvedValue({ dtam: null, platform: null });
        await expect(call()).rejects.toMatchObject({ code: 'QUOTATION_NOT_ISSUED', status: 409 });
        expect(mockDb.checkoutOrder.create).not.toHaveBeenCalled();
        expect(mockIntentCreate).not.toHaveBeenCalled();
    });
});

describe('RED proof 4 — a charge that differs from the accepted snapshot must not be created', () => {
    it('refuses with CHECKOUT_PRICE_DRIFT, writes an audit row, and mints nothing', async () => {
        // The applicant accepted a 3-scope price; the live decomposition for
        // this application is 1 scope. This is exactly channel A of
        // synthesis.md 3.3 (checkout does not pass options.scopeCount): today
        // it charges the smaller amount silently.
        const threeScope = {
            ...ROW,
            status: 'ACCEPTED',
            installments: [
                { phase: 'PHASE_1', amount: 17655, stateAmount: 15000, platformAmount: 1500, vatAmount: 1155, scopeCount: 3 },
                { phase: 'PHASE_2', amount: 88275, stateAmount: 75000, platformAmount: 7500, vatAmount: 5775, scopeCount: 3 },
            ],
        };
        mockFindQuotations.mockResolvedValue({
            dtam: null,
            platform: { ...threeScope, acceptedSnapshot: buildAcceptanceSnapshot(threeScope) },
        });
        await expect(call()).rejects.toMatchObject({ code: 'CHECKOUT_PRICE_DRIFT', status: 409 });
        expect(mockDb.checkoutOrder.create).not.toHaveBeenCalled();
        expect(mockIntentCreate).not.toHaveBeenCalled();
        expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'CHECKOUT_PRICE_DRIFT',
        }));
    });
});

describe('the accepted path', () => {
    it('mints the order, bound to the quotation and to the hash of what was accepted', async () => {
        const row = acceptedRow();
        mockFindQuotations.mockResolvedValue({ dtam: null, platform: row });
        const result = await call();
        const created = mockDb.checkoutOrder.create.mock.calls[0][0].data;
        expect(created.quotationId).toBe('qt-1');
        expect(created.quotationSnapshotHash).toBe(
            require('../../services/quotation-service').canonicalSnapshotHash(row.acceptedSnapshot));
        expect(created.paymentTermsVersion).toBe('payment-terms-th-v1.1');
        expect(created.paymentTermsAcceptedAt).toBeInstanceOf(Date);
        // The money is untouched: same fee-service decomposition as before.
        expect(created.totalPayableAmount).toBe(5885);
        expect(result.quotationNumber).toBe('QT-PRD-2026-000001');
    });

    it('refuses without the payment-terms acknowledgment (Q4, now on this rail too)', async () => {
        mockFindQuotations.mockResolvedValue({ dtam: null, platform: acceptedRow() });
        await expect(call({ paymentTermsAccepted: undefined }))
            .rejects.toMatchObject({ code: 'PAYMENT_TERMS_NOT_ACCEPTED', status: 409 });
        expect(mockDb.checkoutOrder.create).not.toHaveBeenCalled();
    });

    it('an INVOICED quotation with no snapshot (a repaired pre-gate row) passes the gate but is not drift-checked', async () => {
        mockFindQuotations.mockResolvedValue({
            dtam: null, platform: { ...ROW, status: 'INVOICED', acceptedSnapshot: null },
        });
        const result = await call();
        expect(result.checkoutOrderId).toBe('co-1');
        const created = mockDb.checkoutOrder.create.mock.calls[0][0].data;
        expect(created.quotationId).toBe('qt-1');
        expect(created.quotationSnapshotHash).toBeNull();
    });
});

describe('DRAFT is no longer an M1-payable state', () => {
    it('refuses CHECKOUT_MILESTONE_NOT_PAYABLE before it even looks for a quotation', async () => {
        mockDb.application.findFirst.mockResolvedValue({ ...APPLICATION, status: 'DRAFT' });
        mockFindQuotations.mockResolvedValue({ dtam: null, platform: acceptedRow() });
        await expect(call()).rejects.toMatchObject({ code: 'CHECKOUT_MILESTONE_NOT_PAYABLE', status: 409 });
        expect(mockFindQuotations).not.toHaveBeenCalled();
    });
});

describe('re-entry is gated too', () => {
    it('an existing PENDING_PAYMENT order cannot be re-entered while the quotation is PENDING', async () => {
        mockDb.checkoutOrder.findFirst.mockResolvedValue({
            id: 'co-old', applicationId: 'app-1', milestone: 'M1', status: 'PENDING_PAYMENT',
            dtamFeeAmount: '5000.00', platformFeeNet: '500.00', platformFeeVat: '385.00',
            platformFeeGross: '885.00', totalPayableAmount: '5885.00', stripePaymentIntentId: 'pi_old',
        });
        mockFindQuotations.mockResolvedValue({ dtam: null, platform: { ...ROW } });
        await expect(call()).rejects.toMatchObject({ code: 'QUOTATION_NOT_ACCEPTED' });
        expect(mockIntentCreate).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run it and PASTE the RED (Tier C requires this before any GREEN is claimed)**

Run: `cd apps/backend && npx jest __tests__/unit/checkout-requires-accepted-quotation.test.js`
Expected at HEAD: the three RED-proof describes **FAIL** — `expect(received).rejects.toMatchObject(...)` reports "Received promise resolved instead of rejected", because today a checkout is minted for a PENDING quotation, for no quotation, and for a drifted amount. The accepted-path, DRAFT and re-entry describes also fail (`created.quotationId` is `undefined`; `DRAFT` is still payable). Paste this output into the work item before writing any implementation.

- [ ] **Step 3: Implement the gate, the drift check and the binding**

In `apps/backend/services/checkout/stripe-checkout-service.js`, first `PAYABLE_STATES` (`:40-43`):

```js
/**
 * Application states from which each milestone may be paid. M1 covers the
 * submission window; M2 opens only when the documents have passed.
 *
 * F-G4-64 — DRAFT is GONE from M1. A quotation is issued on the way OUT of
 * DRAFT (applications.js:1001,1210), so a DRAFT application has no price of
 * record to accept and, with the gate below fail-closed, every DRAFT checkout
 * would refuse anyway. Removing it turns an unexplained 409 into the accurate
 * one (CHECKOUT_MILESTONE_NOT_PAYABLE). The slip-era states stay listed so an
 * in-flight application that switches rails mid-window can still pay.
 */
const PAYABLE_STATES = Object.freeze({
    M1: Object.freeze(['SUBMITTED', 'PENDING_DOC_FEE']),
    M2: Object.freeze(['DOC_APPROVED', 'PENDING_AUDIT_FEE']),
});
```

Change the signature at `:161` and insert the gate block immediately after the `PAYABLE_STATES` check at `:178-181`, **before** `getPaymentAdapter()` at `:184`:

```js
async function createCheckoutForApplication({ applicationId, milestone, actor, paymentTermsAccepted }) {
```

```js
    // ── F-G4-64: the acceptance gate ────────────────────────────────────────
    // Ownership and payable status are already settled above. Everything below
    // runs BEFORE the adapter is touched and BEFORE any row is minted, so a
    // refusal leaves the database exactly as it was.
    //
    // The gate runs before the re-entry lookup as well: an order minted during
    // the drain window, when the gate did not exist, must not become a door
    // that re-enters without it.
    const { assertQuotationAcceptedForPayment } = require('../billing/quotation-gate');
    const { quotation, snapshot } = await assertQuotationAcceptedForPayment({
        applicationId: application.id,
        milestone,
    });

    // Q4 pre-payment disclosure (owner ruling 2026-07-08), which until now
    // bound the slip rail only — and payment_slips has zero rows, so no
    // applicant has ever actually seen this text (register.md G).
    const termsVersion = typeof paymentTermsAccepted?.version === 'string'
        ? paymentTermsAccepted.version.trim() : '';
    const termsAcceptedAt = paymentTermsAccepted?.acceptedAt
        ? new Date(paymentTermsAccepted.acceptedAt) : null;
    if (!termsVersion || !termsAcceptedAt || Number.isNaN(termsAcceptedAt.getTime())) {
        throw httpError(409, 'PAYMENT_TERMS_NOT_ACCEPTED',
            'กรุณายอมรับเงื่อนไขการชำระเงินและการคืนเงินก่อนดำเนินการชำระเงิน');
    }
```

Then, where `breakdown` is computed for a NEW order (`:206`), add the comparison. Keep the existing `breakdownForMilestone` call exactly as it is — **the formula does not change; this only refuses when the result disagrees with what was accepted**:

```js
    } else {
        breakdown = breakdownForMilestone(application, milestone);

        // R2 — charge to the satang what the applicant accepted, or charge
        // nothing. `snapshot` is null only for a row accepted before snapshots
        // existed or closed by the repair script; there is nothing to compare
        // against there, and inventing a comparison would be inventing a record.
        const accepted = Array.isArray(snapshot?.installments)
            ? snapshot.installments.find((i) => i.phase === MILESTONE_TO_PHASE[milestone])
            : null;
        if (accepted) {
            const same = (live, frozen) => Number(live).toFixed(2) === String(frozen);
            const matches = same(breakdown.dtamFeeAmount, accepted.stateAmount)
                && same(breakdown.platformFeeNet, accepted.platformAmount)
                && same(breakdown.platformFeeVat, accepted.vatAmount)
                && same(breakdown.totalPayableAmount, accepted.phaseTotal);
            if (!matches) {
                logger.error('[checkout] PRICE DRIFT — refusing to charge a figure the applicant did not accept', {
                    applicationId: application.id,
                    milestone,
                    quotationId: quotation.id,
                    quotationNumber: quotation.quotationNumber,
                    accepted,
                    live: breakdown,
                });
                await auditLogger.log({
                    category: AuditCategory.PAYMENT,
                    action: 'CHECKOUT_PRICE_DRIFT',
                    severity: AuditSeverity.CRITICAL,
                    actorId: actor?.id || null,
                    resourceType: ResourceType.APPLICATION,
                    resourceId: application.id,
                    organizationId: application.organizationId,
                    metadata: {
                        milestone,
                        quotationId: quotation.id,
                        quotationNumber: quotation.quotationNumber,
                        acceptedPhaseTotal: accepted.phaseTotal,
                        livePhaseTotal: Number(breakdown.totalPayableAmount).toFixed(2),
                    },
                });
                throw httpError(409, 'CHECKOUT_PRICE_DRIFT',
                    'ยอดที่จะเรียกเก็บไม่ตรงกับใบเสนอราคาที่คุณยอมรับไว้ ระบบจึงไม่สร้างรายการชำระเงิน เจ้าหน้าที่ได้รับแจ้งแล้ว');
            }
        }
```

Add to the `checkoutOrder.create` data (`:222-229`):

```js
                        quotationId: quotation.id,
                        quotationSnapshotHash: quotation.acceptedSnapshotHash || null,
                        paymentTermsVersion: termsVersion,
                        paymentTermsAcceptedAt: termsAcceptedAt,
```

Add the imports at the top of the file, beside the existing requires:

```js
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../middleware/audit-logger');
const { MILESTONE_TO_PHASE } = require('../billing/quotation-gate');
```

and add `quotationNumber: quotation.quotationNumber || null` to the returned object (`:359-365`).

- [ ] **Step 4: Pass the acknowledgment through the route**

In `apps/backend/routes/api/finance/payments.js`, in the `/checkout` handler (`:424-433`):

```js
    const { applicationId, milestone, paymentTermsAccepted } = req.body || {};
    if (!applicationId || !isValidUUID(applicationId)) {
      return res.status(400).json({ success: false, error: 'APPLICATION_ID_REQUIRED' });
    }

    const result = await createCheckoutForApplication({
      applicationId,
      milestone: String(milestone || 'M1').toUpperCase(),
      actor: { id: req.user?.id, healthId },
      // Q4 disclosure, verbatim from the client. The SERVICE validates it — a
      // route-level check would be bypassable by any other caller of the
      // service, which is the same reason the quotation gate lives there.
      paymentTermsAccepted,
    });
```

The existing `catch` already maps `error.statusCode || error.status || 500` onto the response and echoes `error.code`, so all six new codes surface correctly with no further change (verified at `:447-454`).

- [ ] **Step 5: Run the RED test to verify it now passes**

Run: `cd apps/backend && npx jest __tests__/unit/checkout-requires-accepted-quotation.test.js`
Expected: PASS, 8/8.

- [ ] **Step 6: Update the three checkout suites that break (T12 items 1-3), then run everything**

`stripe-checkout-engine.test.js`, `checkout-vat-line-names-its-base.test.js` and `checkout-renewal-price.test.js` all mint checkouts and none of them knows about a quotation (`grep -ci quotation` = 0, 0 and 3-comment-lines respectively). **Their `mockDb` has no `quotation` model, and a missing-model TypeError inside the gate is caught and re-thrown as a policy refusal — a stale mock fails in the shape of "the gate worked", which is very easy to misread** (synthesis.md §5(ก).7). Apply the exact change from T12 to each of the three, then:

```bash
cd apps/backend
npx jest __tests__/unit/checkout-requires-accepted-quotation.test.js \
         __tests__/unit/stripe-checkout-engine.test.js \
         __tests__/unit/checkout-vat-line-names-its-base.test.js \
         __tests__/unit/checkout-renewal-price.test.js \
         __tests__/unit/quotation-gate.test.js \
         __tests__/unit/money-equation-property.test.js
STRIPE_CHECKOUT_ENABLED= npx jest __tests__/unit/checkout-renewal-price.test.js
npx jest --listTests | grep -iE "checkout|payment" # run each hit
bash scripts/probes/money-equation.sh || true   # BLOCKED without DATABASE_URL is the expected local verdict
```

Expected: PASS. `money-equation.sh` prints `BLOCKED: needs DATABASE_URL + psql` locally — that is its honest verdict, not a pass; record it as BLOCKED.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/services/checkout/stripe-checkout-service.js \
        apps/backend/routes/api/finance/payments.js \
        apps/backend/__tests__/unit/checkout-requires-accepted-quotation.test.js \
        apps/backend/__tests__/unit/stripe-checkout-engine.test.js \
        apps/backend/__tests__/unit/checkout-vat-line-names-its-base.test.js \
        apps/backend/__tests__/unit/checkout-renewal-price.test.js
git commit -m "feat(checkout): no payment without an accepted quotation, and none at a price nobody accepted

The card rail now runs the same gate the slip rail runs, before the adapter and
before any row is minted, on re-entry as well as on mint. The charge is compared
to the accepted snapshot to the satang and refused as CHECKOUT_PRICE_DRIFT if it
differs, with an audit row. DRAFT leaves PAYABLE_STATES.M1: a DRAFT application
has no quotation to accept. No formula changed.

Refs F-G4-64 R1 R2 R4, spec 3.1 3.2."
```

---

### Task 6: Settlement closes the quotation after the commit, and a test forbids the tempting wrong fix

**Files:**
- Modify: `apps/backend/services/quotation-service.js` (new `recordPhaseInvoiced`; `markQuotationInvoiced` at `:699` stays, unused by this path)
- Modify: `apps/backend/services/checkout/checkout-settlement-service.js` (after the `$transaction` closes at `:313`, before the `logger.info('[checkout-settle] settled', ...)` at `:328`)
- Create: `scripts/probes/quotation-closure.sh`
- Modify: `scripts/probes/probe-registry.txt` (**operator-signed row** — L6)
- Test: `apps/backend/__tests__/unit/settlement-closes-quotation.test.js`
- Test: `apps/backend/__tests__/unit/settlement-quotation-must-not-throw-in-tx.test.js`
- Test (modify): `settle-event.test.js`, `settlement-binds-receipt-number-to-invoice.test.js`, `settlement-reconcile.test.js` (see T12)

**Interfaces:**
- Consumes: the columns from T1; `order.quotationId` written by T5.
- Produces:

```js
// apps/backend/services/quotation-service.js
/**
 * Stamp the per-instalment invoiced time, and close the quotation only when
 * EVERY instalment it prices has been billed.
 *
 * @param {object} args
 * @param {string} [args.quotationId]    preferred — checkout_orders.quotationId
 * @param {string} [args.applicationId]  fallback for an order minted before the binding existed
 * @param {'M1'|'M2'|'PHASE_1'|'PHASE_2'} args.milestone
 * @param {string} [args.invoiceNumber]  recorded in notes when the row was never accepted
 * @param {Date}   args.at               the ONE settlement instant
 * @param {object} [args.tx]
 * @returns {Promise<{quotationId: string, phase: 'PHASE_1'|'PHASE_2',
 *                    closed: boolean, status: string} | null>}
 *          null when no quotation could be found (logged by the caller, never thrown)
 * @throws only on a genuine database failure — the CALLER catches everything
 */
async function recordPhaseInvoiced({ quotationId, applicationId, milestone, invoiceNumber, at, tx })
```

- [ ] **Step 1: Write the failing test — RED proof #5 of spec §4 ("settlement does not touch the quotation")**

Create `apps/backend/__tests__/unit/settlement-closes-quotation.test.js`:

```js
'use strict';
/**
 * RED proof 5 (F-G4-64, spec 4): settlement does not touch the quotation.
 *
 * Today the word "quotation" does not appear in checkout-settlement-service at
 * all, so QT-PRD-2026-000001 and -000002 sit at PENDING with acceptedAt null
 * while both their instalments are paid, both applications are CERTIFIED and
 * one certificate is still active (register.md Q2).
 *
 * The close is MILESTONE-QUALIFIED. Under W14 one quotation prices both
 * phases, so stamping INVOICED at M1 would declare the whole document billed
 * while งวดที่ 2 has not been. INVOICED is not inert: payment-slip-service
 * reads it as "the farmer accepted" (QUOTATION_ACCEPTED_STATES).
 */
process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24);
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(24);
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: () => l };
});

const mockRecordPhaseInvoiced = jest.fn(async () => ({
    quotationId: 'qt-1', phase: 'PHASE_1', closed: false, status: 'ACCEPTED',
}));
jest.mock('../../services/quotation-service', () => ({
    recordPhaseInvoiced: (...a) => mockRecordPhaseInvoiced(...a),
}));
const mockAuditLog = jest.fn(async () => ({}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: (...a) => mockAuditLog(...a) },
    AuditCategory: { PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR', CRITICAL: 'CRITICAL' },
    ResourceType: { APPLICATION: 'APPLICATION', PAYMENT: 'PAYMENT' },
}));

const tx = {
    $queryRaw: jest.fn(async () => [{ id: 'ord_1', status: 'PENDING_PAYMENT' }]),
    checkoutOrder: { update: jest.fn() }, invoice: { update: jest.fn() },
    paymentTransaction: { update: jest.fn() }, checkoutDocument: { create: jest.fn() },
};
const mockDb = {
    checkoutOrder: { findFirst: jest.fn() },
    stripeWebhookEvent: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (cb, opts) => { mockDb.__txOpts = opts; return cb(tx); }),
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));
jest.mock('../../services/journal-entry-service', () => ({ recordPaymentEntry: jest.fn() }));
jest.mock('../../services/application-status-writer', () => ({ writeApplicationStatus: jest.fn() }));
jest.mock('../../services/receipt-numbering-service', () => ({
    allocateReceiptNumber: jest.fn(async () => ({ number: 'TAX-PRD-2026-000009' })),
    ISSUER: { PLATFORM: 'PLATFORM', DTAM: 'DTAM' },
}));

const svc = require('../../services/checkout/checkout-settlement-service');

const order = (over = {}) => ({
    id: 'ord_1', status: 'PENDING_PAYMENT', milestone: 'M1',
    totalPayableAmount: 5885, dtamFeeAmount: 5000, platformFeeNet: 500,
    platformFeeVat: 385, platformFeeGross: 885,
    invoiceId: 'inv_1', applicationId: 'app_1', organizationId: 'org_1',
    quotationId: 'qt-1',
    invoice: { id: 'inv_1', invoiceNumber: 'INV-CO-1' },
    application: { id: 'app_1', status: 'PENDING_DOC_FEE' },
    ...over,
});
const PI = { id: 'pi_1', amount_received: 588500, metadata: { checkoutOrderId: 'ord_1' } };

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (cb, opts) => { mockDb.__txOpts = opts; return cb(tx); });
    mockDb.checkoutOrder.findFirst.mockResolvedValue(order());
});

test('a settled M1 stamps the PHASE_1 instalment on the bound quotation', async () => {
    const r = await svc.settleFromPaymentIntent({ paymentIntent: PI, eventId: 'evt_1' });
    expect(r).toEqual({ settled: true });
    expect(mockRecordPhaseInvoiced).toHaveBeenCalledWith(expect.objectContaining({
        quotationId: 'qt-1',
        milestone: 'M1',
        invoiceNumber: 'TAX-PRD-2026-000009',
        at: expect.any(Date),
    }));
});

test('the close runs AFTER the transaction commits, never inside it', async () => {
    await svc.settleFromPaymentIntent({ paymentIntent: PI, eventId: 'evt_1' });
    // The tx callback receives `tx`; recordPhaseInvoiced must not have been
    // handed it, or a throw would roll the money writes back.
    const call = mockRecordPhaseInvoiced.mock.calls[0][0];
    expect(call.tx).toBeUndefined();
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
});

test('an order with no quotationId (minted before the binding) falls back to the applicationId', async () => {
    mockDb.checkoutOrder.findFirst.mockResolvedValue(order({ quotationId: null }));
    await svc.settleFromPaymentIntent({ paymentIntent: PI, eventId: 'evt_1' });
    expect(mockRecordPhaseInvoiced).toHaveBeenCalledWith(expect.objectContaining({
        quotationId: null, applicationId: 'app_1', milestone: 'M1',
    }));
});

test('a close failure never fails the settlement: the money, the receipt and the status stand', async () => {
    mockRecordPhaseInvoiced.mockRejectedValueOnce(new Error('quotation table on fire'));
    const r = await svc.settleFromPaymentIntent({ paymentIntent: PI, eventId: 'evt_1' });
    expect(r).toEqual({ settled: true });
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'QUOTATION_CLOSE_FAILED',
    }));
});

test('a quotation that was never accepted is stamped but NOT flipped, and it is logged loudly', async () => {
    mockRecordPhaseInvoiced.mockResolvedValueOnce({
        quotationId: 'qt-1', phase: 'PHASE_1', closed: false, status: 'PENDING',
    });
    const r = await svc.settleFromPaymentIntent({ paymentIntent: PI, eventId: 'evt_1' });
    expect(r).toEqual({ settled: true });
    const { createLogger } = require('../../shared/logger');
    expect(createLogger().error).toHaveBeenCalledWith(
        expect.stringContaining('quotation not accepted at settlement'),
        expect.anything(),
    );
});
```

- [ ] **Step 2: Write the failing test that forbids the wrong fix — RED proof #3 of spec §4**

Create `apps/backend/__tests__/unit/settlement-quotation-must-not-throw-in-tx.test.js`:

```js
'use strict';
/**
 * RED proof 3 (F-G4-64, spec 4; synthesis.md 5(ก).3 and the review note at 445).
 *
 * THIS TEST EXISTS TO FORBID A FIX, NOT TO DESCRIBE ONE.
 *
 * The obvious way to close the quotation is to call markQuotationInvoiced
 * inside the settle $transaction. markQuotationInvoiced throws
 * QUOTATION_NOT_FOUND when there is no row (quotation-service.js:707-713 — the
 * exact shape of application A2) and INVALID_QUOTATION_STATUS from any status
 * that is not ACCEPTED (:715-721). A throw inside that transaction rolls back
 * ALL of it: no invoice `paid`, no receiptNumber, no CheckoutDocument, no
 * journal entry, no application status change — and then settleEvent retries
 * until the event is DEAD_LETTER. Stripe has taken the money and the system has
 * recorded nothing.
 *
 * Every PENDING_PAYMENT order alive on the day the gate ships is in exactly
 * this position, because its quotation is still PENDING.
 *
 * The test drives that scenario through the REAL settle path with a throwing
 * in-transaction hook and asserts the damage, so the failure mode is written
 * down and a future "tidy-up" that moves the close inside the tx turns red.
 */
process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24);
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(24);
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: () => l };
});
jest.mock('../../services/quotation-service', () => ({
    recordPhaseInvoiced: jest.fn(async () => ({ quotationId: 'qt-1', phase: 'PHASE_1', closed: false, status: 'ACCEPTED' })),
}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn(async () => ({})) },
    AuditCategory: { PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR', CRITICAL: 'CRITICAL' },
    ResourceType: { APPLICATION: 'APPLICATION', PAYMENT: 'PAYMENT' },
}));

const writes = [];
const tx = {
    $queryRaw: jest.fn(async () => [{ id: 'ord_1', status: 'PENDING_PAYMENT' }]),
    checkoutOrder: { update: jest.fn(async (a) => { writes.push(['order', a]); return {}; }) },
    invoice: { update: jest.fn(async (a) => { writes.push(['invoice', a]); return {}; }) },
    paymentTransaction: { update: jest.fn(async (a) => { writes.push(['charge', a]); return {}; }) },
    checkoutDocument: { create: jest.fn(async (a) => { writes.push(['document', a]); return {}; }) },
};
const mockDb = {
    checkoutOrder: { findFirst: jest.fn() },
    stripeWebhookEvent: { findUnique: jest.fn(), update: jest.fn(async () => ({})) },
    // A REAL rollback: when the callback throws, nothing it wrote is kept.
    $transaction: jest.fn(async (cb, opts) => {
        mockDb.__txOpts = opts;
        const mark = writes.length;
        try {
            return await cb(tx);
        } catch (err) {
            writes.length = mark;   // rolled back
            throw err;
        }
    }),
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));
jest.mock('../../services/journal-entry-service', () => ({ recordPaymentEntry: jest.fn() }));
jest.mock('../../services/application-status-writer', () => ({
    writeApplicationStatus: jest.fn(async () => { writes.push(['status', {}]); }),
}));
jest.mock('../../services/receipt-numbering-service', () => ({
    allocateReceiptNumber: jest.fn(async () => ({ number: 'TAX-PRD-2026-000009' })),
    ISSUER: { PLATFORM: 'PLATFORM', DTAM: 'DTAM' },
}));

const svc = require('../../services/checkout/checkout-settlement-service');
const { SETTLEMENT } = require('../../config/business-rules');

const ORDER = {
    id: 'ord_1', status: 'PENDING_PAYMENT', milestone: 'M1',
    totalPayableAmount: 5885, dtamFeeAmount: 5000, platformFeeNet: 500,
    platformFeeVat: 385, platformFeeGross: 885,
    invoiceId: 'inv_1', applicationId: 'app_1', organizationId: 'org_1', quotationId: 'qt-1',
    invoice: { id: 'inv_1', invoiceNumber: 'INV-CO-1' },
    application: { id: 'app_1', status: 'PENDING_DOC_FEE' },
};
const EVENT = {
    id: 'evt_1', status: 'RECEIVED', attempts: SETTLEMENT.MAX_ATTEMPTS - 1,
    payload: { data: { object: { id: 'pi_1', amount_received: 588500, metadata: { checkoutOrderId: 'ord_1' } } } },
};

beforeEach(() => {
    jest.clearAllMocks();
    writes.length = 0;
    mockDb.checkoutOrder.findFirst.mockResolvedValue({ ...ORDER });
    mockDb.stripeWebhookEvent.findUnique.mockResolvedValue({ ...EVENT });
});

test('a throw INSIDE the settle transaction loses every money write and dead-letters the event', async () => {
    // Simulate the wrong fix: a quotation call placed inside the tx that throws
    // the way markQuotationInvoiced throws on a still-PENDING row.
    tx.checkoutDocument.create.mockImplementationOnce(async () => {
        const err = new Error('[quotation-service] Cannot mark INVOICED from status "PENDING"');
        err.code = 'INVALID_QUOTATION_STATUS';
        throw err;
    });

    const r = await svc.settleEvent('evt_1');

    // The damage, named: nothing survived, and the event is terminal.
    expect(writes).toHaveLength(0);
    expect(r.status).toBe('DEAD_LETTER');
    expect(mockDb.stripeWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'DEAD_LETTER' }),
    }));
});

test('by contrast, the shipped close runs after the commit: the same failure keeps every money write', async () => {
    const { recordPhaseInvoiced } = require('../../services/quotation-service');
    recordPhaseInvoiced.mockRejectedValueOnce(Object.assign(
        new Error('[quotation-service] Cannot mark INVOICED from status "PENDING"'),
        { code: 'INVALID_QUOTATION_STATUS' },
    ));

    const r = await svc.settleEvent('evt_1');

    expect(r.status).toBe('PROCESSED');
    expect(writes.map((w) => w[0])).toEqual(
        expect.arrayContaining(['order', 'invoice', 'charge', 'document', 'status']));
});

test('grep guard: checkout-settlement-service must not call the quotation service inside its transaction', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../services/checkout/checkout-settlement-service.js'), 'utf8');
    const txStart = src.indexOf('await prisma.$transaction(');
    const txEnd = src.indexOf('if (txOutcome?.raced)');
    expect(txStart).toBeGreaterThan(-1);
    expect(txEnd).toBeGreaterThan(txStart);
    const inside = src.slice(txStart, txEnd);
    expect(inside).not.toMatch(/recordPhaseInvoiced|markQuotationInvoiced|quotationService/);
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd apps/backend && npx jest __tests__/unit/settlement-closes-quotation.test.js __tests__/unit/settlement-quotation-must-not-throw-in-tx.test.js`
Expected: FAIL. In the first file `expect(mockRecordPhaseInvoiced).toHaveBeenCalledWith(...)` receives 0 calls — settlement does not touch the quotation. In the second, the first test **passes already** (it documents today's rollback behaviour, which is real) while `by contrast, the shipped close ...` fails, because there is no post-commit close to compare against. Paste both outputs.

- [ ] **Step 4: Implement `recordPhaseInvoiced`**

Add to `apps/backend/services/quotation-service.js`, after `markQuotationInvoiced` (`:699-724`), and export it:

```js
/** Which stamp column each instalment writes. */
const PHASE_INVOICED_COLUMN = Object.freeze({
    PHASE_1: 'phase1InvoicedAt',
    PHASE_2: 'phase2InvoicedAt',
});
const MILESTONE_PHASE = Object.freeze({
    M1: 'PHASE_1', M2: 'PHASE_2', PHASE_1: 'PHASE_1', PHASE_2: 'PHASE_2',
});

/**
 * Stamp the per-instalment invoiced time and close the quotation only when
 * EVERY instalment it prices has been billed (F-G4-64, spec 3.3).
 *
 * Under W14 one quotation prices BOTH phases, so flipping INVOICED at M1 would
 * declare the whole document billed while งวดที่ 2 has not been — and INVOICED
 * is not an inert label: the slip gate reads it as "the farmer accepted"
 * (QUOTATION_ACCEPTED_STATES). A renewal prices PHASE_2 only, so for a renewal
 * that one stamp closes the document.
 *
 * A row that is not in {ACCEPTED, INVOICED} — a pre-gate row — is STAMPED but
 * NOT flipped: the invoicing is a fact, the acceptance is not, and writing
 * ACCEPTED here would record an event that never happened (R5).
 *
 * This function is called from OUTSIDE the settle transaction. It must never
 * be moved inside it (see settlement-quotation-must-not-throw-in-tx.test.js).
 */
async function recordPhaseInvoiced({
    quotationId = null, applicationId = null, milestone, invoiceNumber = null, at = new Date(), tx = null,
} = {}) {
    const phase = MILESTONE_PHASE[String(milestone || '').toUpperCase()];
    const column = PHASE_INVOICED_COLUMN[phase];
    if (!column) {
        const err = new Error(`[quotation-service] recordPhaseInvoiced: unknown milestone "${milestone}"`);
        err.code = 'UNKNOWN_MILESTONE';
        throw err;
    }
    const db = _resolvePrisma(tx);

    let row = null;
    if (quotationId) {
        row = await db.quotation.findFirst({ where: { id: quotationId, isDeleted: false } });
    }
    if (!row && applicationId) {
        // An order minted before checkout_orders.quotationId existed still knows
        // its application. Prefer the company row, exactly as the gate does.
        const { dtam, platform } = await findQuotationsByApplicationId(applicationId, { tx });
        row = platform || dtam;
    }
    if (!row) { return null; }   // the caller logs; this never throws for "absent"

    const alreadyStamped = Boolean(row[column]);
    const stamps = {
        phase1InvoicedAt: row.phase1InvoicedAt,
        phase2InvoicedAt: row.phase2InvoicedAt,
        [column]: alreadyStamped ? row[column] : at,
    };

    // Which instalments does THIS row price? A renewal has only PHASE_2.
    const priced = new Set((Array.isArray(row.installments) ? row.installments : [])
        .map((i) => i.phase).filter((p) => PHASE_INVOICED_COLUMN[p]));
    if (priced.size === 0) { priced.add('PHASE_1').add('PHASE_2'); } // legacy row with no instalments
    const allBilled = [...priced].every((p) => Boolean(stamps[PHASE_INVOICED_COLUMN[p]]));

    const wasAccepted = [QUOTATION_STATUS.ACCEPTED, QUOTATION_STATUS.INVOICED].includes(row.status);
    const data = { [column]: stamps[column] };
    if (allBilled && wasAccepted && row.status !== QUOTATION_STATUS.INVOICED) {
        data.status = QUOTATION_STATUS.INVOICED;
    }
    if (!wasAccepted && invoiceNumber) {
        // Say in the row itself that this was billed without a recorded
        // acceptance, rather than leaving a silent stamp.
        const note = `INVOICED_WITHOUT_ACCEPTANCE ${phase} ${invoiceNumber}`;
        data.notes = row.notes ? `${row.notes}\n${note}` : note;
    }

    const updated = await db.quotation.update({ where: { id: row.id }, data });
    return {
        quotationId: row.id,
        phase,
        closed: updated.status === QUOTATION_STATUS.INVOICED,
        status: updated.status,
    };
}
```

- [ ] **Step 5: Call it after the commit in settlement**

In `apps/backend/services/checkout/checkout-settlement-service.js`, insert between the `txOutcome?.raced` early return (ending `:326`) and `logger.info('[checkout-settle] settled', ...)` (`:328`):

```js
    // ── F-G4-64: close the quotation. AFTER the commit. Best-effort. ────────
    // NOT inside the transaction above, and this is not a style preference:
    // a throw in there rolls back the invoice `paid`, the receipt number, the
    // CheckoutDocument, the journal entry and the workflow status, and then
    // settleEvent retries to DEAD_LETTER — with Stripe already holding the
    // money. Pinned by settlement-quotation-must-not-throw-in-tx.test.js, which
    // also greps this file to keep the call outside the transaction.
    try {
        const quotationService = require('../quotation-service');
        const closed = await quotationService.recordPhaseInvoiced({
            quotationId: order.quotationId || null,
            applicationId: order.applicationId || null,
            milestone,
            invoiceNumber: companyNo.number,
            at: settledAt,
        });
        if (!closed) {
            logger.error('[checkout-settle] no quotation to close for a settled order', {
                eventId, checkoutOrderId: order.id, applicationId: order.applicationId, milestone,
            });
        } else if (!['ACCEPTED', 'INVOICED'].includes(closed.status)) {
            logger.error('[checkout-settle] quotation not accepted at settlement', {
                eventId,
                checkoutOrderId: order.id,
                quotationId: closed.quotationId,
                status: closed.status,
                milestone,
            });
        }
    } catch (qtErr) {
        logger.error('[checkout-settle] quotation close failed — money and documents stand', {
            eventId, checkoutOrderId: order.id, milestone,
            errCode: qtErr?.code || null, errMessage: qtErr?.message || String(qtErr),
        });
        try {
            await auditLogger.log({
                category: AuditCategory.PAYMENT,
                action: 'QUOTATION_CLOSE_FAILED',
                severity: AuditSeverity.ERROR,
                actorId: 'stripe-webhook',
                actorRole: 'SYSTEM',
                resourceType: ResourceType.PAYMENT,
                resourceId: order.id,
                organizationId: order.organizationId,
                metadata: { milestone, applicationId: order.applicationId, errCode: qtErr?.code || null },
            });
        } catch (auditErr) {
            logger.error('[checkout-settle] could not record QUOTATION_CLOSE_FAILED', {
                eventId, errMessage: auditErr?.message || String(auditErr),
            });
        }
    }
```

Add the audit-logger import at the top of the file, beside the existing requires:

```js
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../middleware/audit-logger');
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `cd apps/backend && npx jest __tests__/unit/settlement-closes-quotation.test.js __tests__/unit/settlement-quotation-must-not-throw-in-tx.test.js`
Expected: PASS, 8/8.

- [ ] **Step 7: Write the closure probe**

Create `scripts/probes/quotation-closure.sh` (executable, `chmod +x`):

```bash
#!/usr/bin/env bash
# quotation-closure — every SETTLED checkout order has its instalment stamped on
# the quotation it collected against. F-G4-64 spec 3.3.
#
# Read-only. Never writes. BLOCKED (exit 2) rather than a vacuous pass when it
# cannot reach a database, per the _lib.sh contract.
source "$(dirname "$0")/_lib.sh"
{ [ -z "${DATABASE_URL:-}" ] || ! command -v psql >/dev/null 2>&1; } \
    && blocked "needs DATABASE_URL + psql against the real DB — no vacuous pass"

# Orders settled AFTER the gate shipped are the ones this rule binds. Rows
# settled before it have no quotationId and are the repair script's business
# (close-quotations-settled-before-gate.js), not this probe's.
N=$(psql "$DATABASE_URL" -tAc \
    "SELECT count(*) FROM checkout_orders o
       JOIN quotations q ON q.id = o.quotation_id
      WHERE o.status = 'SETTLED'
        AND ( (o.milestone = 'M1' AND q.\"phase1InvoicedAt\" IS NULL)
           OR (o.milestone = 'M2' AND q.\"phase2InvoicedAt\" IS NULL) )" \
    2>"$EVIDENCE_DIR/quotation-closure.err")
[ -z "$N" ] && blocked "query failed — $EVIDENCE_DIR/quotation-closure.err"
[ "$N" = "0" ] && pass "0 settled orders leave their quotation instalment unstamped"
fail "$N SETTLED checkout_orders whose quotation has no invoicedAt for that milestone"
```

Add ONE row to `scripts/probes/probe-registry.txt`, in the manual block beside `money-equation`:

```
quotation-closure      | manual | -                 | operator | F-G4-64 — ต้องอ่านแถวเงินจริงจาก DB (เหมือน money-equation) ห้ามใน CI (L3)
```

> **L6 — this row is a grant of cover and must be signed by the operator.** `scripts/ci/probe-gate.js:137-148` discovers `scripts/probes/*.sh` and fails when a file has no registry line, so the probe file and its row must land together; and `manual` rows require `signed-by = operator`. The implementer writes both, the **operator** merges (Tier C already requires that). Do not sign the row yourself.

- [ ] **Step 8: Run the probe and the gate**

```bash
cd "$(git rev-parse --show-toplevel)"
bash scripts/probes/quotation-closure.sh ; echo "exit=$?"
node scripts/ci/probe-gate.js
```

Expected: the probe prints `BLOCKED: needs DATABASE_URL + psql …` and exits 2 on a laptop with no `DATABASE_URL` — that is its honest verdict; record BLOCKED, do not call it a pass. `probe-gate.js` must exit 0 (the new file has a registry line).

- [ ] **Step 9: Update the three settlement suites (T12 items 4-6) and run everything**

```bash
cd apps/backend
npx jest __tests__/unit/settlement-closes-quotation.test.js \
         __tests__/unit/settlement-quotation-must-not-throw-in-tx.test.js \
         __tests__/unit/settle-event.test.js \
         __tests__/unit/settlement-binds-receipt-number-to-invoice.test.js \
         __tests__/unit/settlement-reconcile.test.js \
         __tests__/unit/stripe-checkout-engine.test.js
STRIPE_CHECKOUT_ENABLED= npx jest __tests__/unit/settle-event.test.js
npx jest --listTests | grep -iE "settle|webhook" # run each hit
bash scripts/probes/settle-webhook-only.sh ; bash scripts/probes/webhook-idempotent.sh
```

Expected: PASS. Both probes run `npx jest stripe-checkout-engine.test.js` and need a built Prisma client; record their verdict as printed.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/services/quotation-service.js \
        apps/backend/services/checkout/checkout-settlement-service.js \
        apps/backend/__tests__/unit/settlement-closes-quotation.test.js \
        apps/backend/__tests__/unit/settlement-quotation-must-not-throw-in-tx.test.js \
        apps/backend/__tests__/unit/settle-event.test.js \
        apps/backend/__tests__/unit/settlement-binds-receipt-number-to-invoice.test.js \
        apps/backend/__tests__/unit/settlement-reconcile.test.js \
        scripts/probes/quotation-closure.sh scripts/probes/probe-registry.txt
git commit -m "feat(settlement): the quotation closes when the money lands, after the commit

recordPhaseInvoiced stamps the instalment and flips INVOICED only when every
instalment the quotation prices has been billed. It runs after the transaction
commits and can never fail the settlement.

The second test in this change exists to forbid the obvious wrong fix: it drives
a throw inside the settle transaction and asserts the damage (no invoice paid,
no receipt, no journal entry, event DEAD_LETTER while Stripe holds the money),
and greps the file to keep the call outside the transaction.

Refs F-G4-64 spec 3.3, synthesis.md 5(ก).3."
```

---

### Task 7: Issuance is awaited, loud, audited, notified — and GET quotations self-heals under control

> **Merge together with T5.** T5 makes an un-issued quotation unpayable; this task makes issuance stop failing silently. Landing T5 without T7 would leave an applicant whose issuance failed unable to pay at all (`synthesis.md` §5(ก).6, spec §3.4). Same branch, same operator merge.

**Files:**
- Modify: `apps/backend/routes/api/applications/applications.js:1195-1219` (the fire-and-forget issuance)
- Modify: `apps/backend/services/application-service/application-review-revision-methods.js:310-325` (same shape)
- Modify: `apps/backend/routes/api/applications/quotations.js:118-178` (GET — the self-heal)
- Modify: `apps/backend/services/notification-service.js` (`NotifyType`, `:7-95`)
- Modify: `apps/backend/services/notification/domain-helpers.js` (new `notifyAdminQuotationIssueFailed`, exports at `:316-327`)
- Test: `apps/backend/__tests__/unit/quotation-issuance-fails-loud.test.js`
- Test: `apps/backend/__tests__/unit/quotation-get-self-heals.test.js`

**Interfaces:**
- Consumes: `QUOTATION_ISSUE_FAILED` from T2; `issueQuotationsForApplication` (`quotation-service.js:456`).
- Produces:

```js
// apps/backend/services/notification/domain-helpers.js
/**
 * Tell the admin queue that an application was submitted with no quotation.
 * Best-effort, like every other helper in this file: a notification sink that
 * is down must not cost an applicant their submission.
 * @param {{applicationId: string, applicationNumber: string|null, reason: string}} args
 * @returns {Promise<void>}
 */
async function notifyAdminQuotationIssueFailed({ applicationId, applicationNumber, reason })
```

- The submit response body gains `quotation: { issued: boolean, error?: 'QUOTATION_ISSUE_FAILED' }`.
- `GET /api/applications/:id/quotations` may now create a row (idempotently) when the application is past DRAFT and has none.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/__tests__/unit/quotation-issuance-fails-loud.test.js`:

```js
'use strict';
/**
 * R3 — issuing the quotation at submit must be awaited and must fail loudly.
 *
 * Today both call sites are fire-and-forget with a `.catch` that writes a
 * logger.warn and nothing else (applications.js:1211-1219,
 * application-review-revision-methods.js:317-325). BACKLOG-FOUND.md:113 already
 * carries this debt. With the acceptance gate fail-closed, a swallowed issuance
 * failure stops being a tidiness problem and becomes an applicant who cannot pay
 * at all — and nobody is told.
 *
 * The submitted status is NOT rolled back: it is already committed by the
 * status writer, which is on the no-touch list.
 */
const mockIssue = jest.fn();
jest.mock('../../services/quotation-service', () => ({
    issueQuotationsForApplication: (...a) => mockIssue(...a),
}));
const mockNotifyAdmin = jest.fn(async () => {});
jest.mock('../../services/notification/domain-helpers', () => {
    const actual = jest.requireActual('../../services/notification/domain-helpers');
    return { ...actual, notifyAdminQuotationIssueFailed: (...a) => mockNotifyAdmin(...a) };
});
const mockAuditLog = jest.fn(async () => ({}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: (...a) => mockAuditLog(...a) },
    AuditCategory: { APPLICATION: 'APPLICATION', PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR', CRITICAL: 'CRITICAL' },
    ResourceType: { APPLICATION: 'APPLICATION' },
}));

const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');

const APP = { id: 'app-1', applicationNumber: 'APP-2026-000001', organizationId: 'org-1' };

beforeEach(() => jest.clearAllMocks());

test('a successful issue reports issued:true and writes no failure record', async () => {
    mockIssue.mockResolvedValue({ company: { id: 'qt-1' }, dtam: null, platform: { id: 'qt-1' } });
    const out = await issueQuotationOnSubmit({ application: APP, actorId: 'user-1' });
    expect(out).toEqual({ issued: true });
    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(mockNotifyAdmin).not.toHaveBeenCalled();
});

test('it AWAITS the issue: the result is not reported before the call resolves', async () => {
    let resolved = false;
    mockIssue.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        resolved = true;
        return { company: { id: 'qt-1' } };
    });
    await issueQuotationOnSubmit({ application: APP, actorId: 'user-1' });
    expect(resolved).toBe(true);
});

test('a failure is reported, audited and pushed to the admin queue, and never rethrown', async () => {
    mockIssue.mockRejectedValue(Object.assign(new Error('receipt sequence locked'), { code: 'SEQ_LOCK' }));
    const out = await issueQuotationOnSubmit({ application: APP, actorId: 'user-1' });
    expect(out).toEqual({ issued: false, error: 'QUOTATION_ISSUE_FAILED' });
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'QUOTATION_ISSUE_FAILED',
        resourceId: 'app-1',
    }));
    expect(mockNotifyAdmin).toHaveBeenCalledWith(expect.objectContaining({
        applicationId: 'app-1', applicationNumber: 'APP-2026-000001',
    }));
});

test('a failing audit sink does not turn a submitted application into a 500', async () => {
    mockIssue.mockRejectedValue(new Error('boom'));
    mockAuditLog.mockRejectedValueOnce(new Error('audit sink down'));
    await expect(issueQuotationOnSubmit({ application: APP, actorId: 'user-1' }))
        .resolves.toEqual({ issued: false, error: 'QUOTATION_ISSUE_FAILED' });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-issuance-fails-loud.test.js`
Expected: FAIL with `Cannot find module '../../services/quotation-issuance-on-submit'`.

- [ ] **Step 3: Write the one shared issuance helper**

There are two call sites with identical semantics; duplicating the await-audit-notify block in both is a second source and L4 forbids it. Create `apps/backend/services/quotation-issuance-on-submit.js`:

```js
'use strict';
/**
 * Issue an application's quotation at submit — awaited, audited, and reported
 * to the caller (F-G4-64 R3, spec 3.4).
 *
 * ONE helper for the TWO submit doors (routes/api/applications/applications.js
 * and services/application-service/application-review-revision-methods.js),
 * which until now each carried their own fire-and-forget `.catch` that wrote a
 * logger.warn and told nobody. Debt already recorded at BACKLOG-FOUND.md:113.
 *
 * What it does NOT do: roll the application back. The status is already
 * committed by application-status-writer, which is on the no-touch list, and an
 * applicant who filed successfully has filed successfully. What changes is that
 * the failure is now visible in three places at once — the response, the audit
 * trail, and the admin queue.
 */
const { createLogger } = require('../shared/logger');
const {
    auditLogger, AuditCategory, AuditSeverity, ResourceType,
} = require('../middleware/audit-logger');

const logger = createLogger('quotation-issuance');

/**
 * @param {{application: {id: string, applicationNumber?: string, organizationId?: string},
 *          actorId: string|null}} args
 * @returns {Promise<{issued: true} | {issued: false, error: 'QUOTATION_ISSUE_FAILED'}>}
 *          never rejects
 */
async function issueQuotationOnSubmit({ application, actorId = null } = {}) {
    try {
        const quotationService = require('./quotation-service');
        await quotationService.issueQuotationsForApplication(application.id, { actorId });
        return { issued: true };
    } catch (err) {
        logger.error('[quotation-issuance] issue failed at submit', {
            applicationId: application?.id,
            applicationNumber: application?.applicationNumber || null,
            errCode: err?.code || null,
            errMessage: err?.message || String(err),
        });
        // Both sinks are best-effort and independently guarded: a down audit
        // table must not turn a successful submission into a 500.
        try {
            await auditLogger.log({
                category: AuditCategory.APPLICATION,
                action: 'QUOTATION_ISSUE_FAILED',
                severity: AuditSeverity.ERROR,
                actorId,
                resourceType: ResourceType.APPLICATION,
                resourceId: application?.id,
                organizationId: application?.organizationId || null,
                metadata: {
                    applicationNumber: application?.applicationNumber || null,
                    errCode: err?.code || null,
                },
            });
        } catch (auditErr) {
            logger.error('[quotation-issuance] could not record QUOTATION_ISSUE_FAILED', {
                applicationId: application?.id, errMessage: auditErr?.message || String(auditErr),
            });
        }
        try {
            const { notifyAdminQuotationIssueFailed } = require('./notification/domain-helpers');
            await notifyAdminQuotationIssueFailed({
                applicationId: application?.id,
                applicationNumber: application?.applicationNumber || null,
                reason: err?.code || err?.message || 'unknown',
            });
        } catch (notifyErr) {
            logger.error('[quotation-issuance] could not notify the admin queue', {
                applicationId: application?.id, errMessage: notifyErr?.message || String(notifyErr),
            });
        }
        return { issued: false, error: 'QUOTATION_ISSUE_FAILED' };
    }
}

module.exports = { issueQuotationOnSubmit };
```

Add the notify type to `apps/backend/services/notification-service.js`, in `NotifyType`, beside the other payment keys:

```js
    // F-G4-64 — an application reached SUBMITTED with no price of record.
    QUOTATION_ISSUE_FAILED: 'QUOTATION_ISSUE_FAILED',
```

and the helper in `apps/backend/services/notification/domain-helpers.js`, modelled on `notifySlaBreach` (`:296`), exported beside it:

```js
/**
 * Tell the admin queue that an application was submitted with no quotation.
 * F-G4-64 R3: with the acceptance gate fail-closed, this applicant cannot pay
 * until somebody acts, so this is an operational alert, not a log line.
 */
async function notifyAdminQuotationIssueFailed({ applicationId, applicationNumber, reason }) {
    try {
        const admins = await prisma.user.findMany({
            where: { role: { in: [...SLA_ESCALATION_ROLES] }, isDeleted: false },
        });
        if (admins.length > 0) {
            await createBulkNotifications({
                userIds: admins.map((a) => a.id),
                type: NotifyType.QUOTATION_ISSUE_FAILED,
                title: 'ออกใบเสนอราคาไม่สำเร็จ',
                message: `คำขอ ${applicationNumber || applicationId} ยังไม่มีใบเสนอราคา ผู้ขอจะชำระเงินไม่ได้จนกว่าจะออกใบให้`,
                data: { applicationId, applicationNumber, reason },
                priority: 'URGENT',
            });
        }
    } catch (error) {
        logger.error('[NotificationService] quotation issue-failed alert error:', error);
    }
}
```

- [ ] **Step 4: Use it at both submit doors**

In `apps/backend/routes/api/applications/applications.js`, replace `:1210-1219`:

```js
        // Tier 18 / B18-A — issue the application's quotation on initial submit.
        // F-G4-64 R3: AWAITED and reported. It used to be fire-and-forget with a
        // logger.warn, which was survivable while payment did not depend on the
        // quotation. It now does (services/billing/quotation-gate.js), so a
        // swallowed failure is an applicant who cannot pay and nobody told.
        // The already-committed status is NOT rolled back.
        let quotationOutcome = { issued: true };
        if (isInitialSubmit) {
            const { issueQuotationOnSubmit } = require('../../../services/quotation-issuance-on-submit');
            quotationOutcome = await issueQuotationOnSubmit({
                application: updated,
                actorId: healthIdentity.userId,
            });
        }
```

and add `quotation: quotationOutcome` to the submit response body.

In `apps/backend/services/application-service/application-review-revision-methods.js`, replace `:316-325` with the same call (`actorId: actorUserId`, `application: updated`) and carry `quotation` out in that method's return value.

- [ ] **Step 5: Write the failing test for the controlled self-heal**

Create `apps/backend/__tests__/unit/quotation-get-self-heals.test.js`:

```js
'use strict';
/**
 * GET /api/applications/:id/quotations re-issues, once, under control
 * (spec 3.4).
 *
 * The self-heal is deliberately narrow: past DRAFT, no row, applicant or
 * provider asking. issueQuotationsForApplication is already idempotent on
 * (applicationId, issuerType), so a race produces one row, not two.
 *
 * ACCEPTED LIMITATION, written into the row itself: a late issue prices at the
 * rate table AS IT IS NOW, because that table has no effective date
 * (config/business-rules.js:112-154). That is ledger F-G4-69 and is NOT fixed
 * here. The `notes` field says so, so nobody later reads the row as though it
 * had been priced on the submission date.
 */
const mockIssue = jest.fn();
const mockFind = jest.fn();
jest.mock('../../services/quotation-service', () => ({
    findQuotationsByApplicationId: (...a) => mockFind(...a),
    issueQuotationsForApplication: (...a) => mockIssue(...a),
}));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: () => l };
});
const mockAuditLog = jest.fn(async () => ({}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: (...a) => mockAuditLog(...a) },
    AuditCategory: { APPLICATION: 'APPLICATION' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR' },
    ResourceType: { APPLICATION: 'APPLICATION' },
}));

const { ensureQuotationForIssuedApplication } =
    require('../../services/quotation-issuance-on-submit');

beforeEach(() => jest.clearAllMocks());

test('a DRAFT application is never quoted by the self-heal', async () => {
    mockFind.mockResolvedValue({ dtam: null, platform: null });
    const out = await ensureQuotationForIssuedApplication({
        application: { id: 'app-1', status: 'DRAFT', applicationNumber: 'APP-1' },
    });
    expect(out).toEqual({ dtam: null, platform: null });
    expect(mockIssue).not.toHaveBeenCalled();
});

test('an application past DRAFT with no quotation is issued one, marked ISSUED_LATE', async () => {
    mockFind.mockResolvedValueOnce({ dtam: null, platform: null })
        .mockResolvedValueOnce({ dtam: null, platform: { id: 'qt-1', notes: 'ISSUED_LATE: MISSING_AT_READ' } });
    mockIssue.mockResolvedValue({ company: { id: 'qt-1' }, dtam: null, platform: { id: 'qt-1' } });
    const out = await ensureQuotationForIssuedApplication({
        application: { id: 'app-1', status: 'PENDING_DOC_FEE', applicationNumber: 'APP-1' },
    });
    expect(mockIssue).toHaveBeenCalledWith('app-1', expect.objectContaining({
        notes: expect.stringContaining('ISSUED_LATE'),
    }));
    expect(out.platform.id).toBe('qt-1');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'QUOTATION_ISSUED_LATE',
    }));
});

test('an application that already has a quotation is left completely alone', async () => {
    mockFind.mockResolvedValue({ dtam: null, platform: { id: 'qt-1', status: 'ACCEPTED' } });
    await ensureQuotationForIssuedApplication({
        application: { id: 'app-1', status: 'PENDING_DOC_FEE', applicationNumber: 'APP-1' },
    });
    expect(mockIssue).not.toHaveBeenCalled();
});

test('a self-heal failure returns the empty result rather than failing the read', async () => {
    mockFind.mockResolvedValue({ dtam: null, platform: null });
    mockIssue.mockRejectedValue(new Error('numbering down'));
    const out = await ensureQuotationForIssuedApplication({
        application: { id: 'app-1', status: 'PENDING_DOC_FEE', applicationNumber: 'APP-1' },
    });
    expect(out).toEqual({ dtam: null, platform: null });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-get-self-heals.test.js`
Expected: FAIL — `ensureQuotationForIssuedApplication is not a function`.

- [ ] **Step 7: Implement the self-heal and call it from the GET route**

Add to `apps/backend/services/quotation-issuance-on-submit.js` and export it:

```js
/** Statuses in which an application legitimately has no quotation yet. */
const PRE_ISSUE_STATUSES = Object.freeze(['DRAFT']);

/**
 * Read this application's quotations, and issue one if it is past DRAFT and has
 * none (spec 3.4, the controlled self-heal).
 *
 * ACCEPTED LIMITATION: the late issue prices at the rate table as it stands
 * NOW. The table has no effective date (config/business-rules.js:112-154), so
 * an application quoted late is not priced as of its submission date, which is
 * what docs/legal/payment-terms-th-v1.1.md promises. That is ledger F-G4-69 and
 * is deliberately not fixed here; `notes` records it on the row so the
 * difference is visible rather than assumed away.
 *
 * @param {{application: {id: string, status: string, applicationNumber?: string,
 *          organizationId?: string}, actorId?: string|null, reason?: string}} args
 * @returns {Promise<{dtam: object|null, platform: object|null}>} never rejects
 */
async function ensureQuotationForIssuedApplication({ application, actorId = null, reason = 'MISSING_AT_READ' } = {}) {
    const quotationService = require('./quotation-service');
    const found = await quotationService.findQuotationsByApplicationId(application.id);
    if (found.dtam || found.platform) { return found; }
    if (PRE_ISSUE_STATUSES.includes(String(application.status || '').toUpperCase())) { return found; }

    try {
        await quotationService.issueQuotationsForApplication(application.id, {
            actorId,
            notes: `ISSUED_LATE: ${reason}`,
        });
        try {
            await auditLogger.log({
                category: AuditCategory.APPLICATION,
                action: 'QUOTATION_ISSUED_LATE',
                severity: AuditSeverity.WARNING,
                actorId,
                resourceType: ResourceType.APPLICATION,
                resourceId: application.id,
                organizationId: application.organizationId || null,
                metadata: {
                    applicationNumber: application.applicationNumber || null,
                    applicationStatus: application.status,
                    reason,
                    // Named so a reader of the trail knows what this row cost.
                    limitation: 'priced at the current rate table (F-G4-69: no effective date)',
                },
            });
        } catch (auditErr) {
            logger.error('[quotation-issuance] could not record QUOTATION_ISSUED_LATE', {
                applicationId: application.id, errMessage: auditErr?.message || String(auditErr),
            });
        }
        return quotationService.findQuotationsByApplicationId(application.id);
    } catch (err) {
        logger.error('[quotation-issuance] late issue failed', {
            applicationId: application.id,
            errCode: err?.code || null,
            errMessage: err?.message || String(err),
        });
        return found;
    }
}
```

`issueQuotationsForApplication` must accept and store `opts.notes` — add `notes = null` to its destructuring (`quotation-service.js:460`) and `notes` to the `db.quotation.create` data (`:551-563`). It is a nullable column that already exists on the model.

In `apps/backend/routes/api/applications/quotations.js`, replace the plain lookup in the GET handler (`:145-146`) with:

```js
        // The application slice is needed for the labels anyway; read it first
        // so the self-heal can see the status.
        const app = await applicationService.getApplicationSlice(applicationId, {
            select: { id: true, status: true, applicationNumber: true, organizationId: true, formData: true },
        });
        const { ensureQuotationForIssuedApplication } =
            require('../../../services/quotation-issuance-on-submit');
        const { dtam, platform } = await ensureQuotationForIssuedApplication({
            application: { id: applicationId, ...(app || {}) },
            actorId: req.user?.id || null,
        });
```

(`getApplicationSlice` is already imported and already called later in the handler — merge the two calls into this one rather than reading the row twice.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest __tests__/unit/quotation-issuance-fails-loud.test.js __tests__/unit/quotation-get-self-heals.test.js`
Expected: PASS, 8/8.

- [ ] **Step 9: Prove the sibling suites still pass**

```bash
cd apps/backend
npx jest __tests__/unit/quotation-service.test.js \
         __tests__/unit/quotation-api-renders-the-row.test.js \
         __tests__/unit/renewal-issues-quotation.test.js \
         __tests__/unit/notification-fanout-service.test.js \
         __tests__/unit/notification-expiry-blockers.test.js
npx jest __tests__/application-submission.test.js 2>/dev/null || npx jest --listTests | grep -iE "submit|application-review|revision"  # run each hit
STRIPE_CHECKOUT_ENABLED= npx jest __tests__/unit/quotation-service.test.js
cd apps/backend && npx eslint services/quotation-issuance-on-submit.js services/notification/domain-helpers.js
```

Expected: PASS, and eslint clean — in particular `no-direct-audit-or-notification-write` must not fire (both new writes go through `auditLogger.log` and `createBulkNotifications`).

- [ ] **Step 10: Commit**

```bash
git add apps/backend/services/quotation-issuance-on-submit.js \
        apps/backend/routes/api/applications/applications.js \
        apps/backend/services/application-service/application-review-revision-methods.js \
        apps/backend/routes/api/applications/quotations.js \
        apps/backend/services/quotation-service.js \
        apps/backend/services/notification-service.js \
        apps/backend/services/notification/domain-helpers.js \
        apps/backend/__tests__/unit/quotation-issuance-fails-loud.test.js \
        apps/backend/__tests__/unit/quotation-get-self-heals.test.js
git commit -m "feat(applications): issuing the quotation is awaited, and its failure is loud

Both submit doors shared a fire-and-forget catch that wrote a warn and told
nobody. With payment now gated on the quotation, a swallowed failure is an
applicant who cannot pay. It is now reported to the caller, audited, and pushed
to the admin queue, and the GET door re-issues once under control.

The late issue prices at today's rate table (F-G4-69, not fixed here) and the
row says so in its notes.

Refs F-G4-64 R3, spec 3.4, BACKLOG-FOUND.md:113."
```

---

### Task 8: The four screens — wizard slot 10, the pay button, the checkout page, the INVOICED-without-acceptance label

**Files:**
- Modify: `apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx` (whole file, 323 lines; delete `generateDocumentNumber` `:34-46`, `generateQuotationItems` use `:121,:129`, the `dtamQuote` write `:154-163`)
- Modify: `apps/web-app/src/app/health/payments/client-view.tsx:388-406` (the pay button block)
- Modify: `apps/web-app/src/app/health/payments/checkout/client-view.tsx` (error map `:57-68`, `startCheckout` `:131-155`, the idle section `:267-300`)
- Modify: `apps/web-app/src/lib/services/checkout-service.ts` (`CreateCheckoutArgs`, `createCheckout`, `CheckoutSessionData`)
- Modify: `apps/web-app/src/components/payments/QuotationReviewSection.tsx:85-106` (the status badge + `isAcceptable`)
- Modify: `apps/web-app/src/lib/services/payment-service.ts:284-300` (`QuotationRecord`)
- Test: `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/invoice-step-accepts-the-real-quotation.test.tsx`
- Test: `apps/web-app/src/app/health/payments/__tests__/payments-checkout-entry-needs-accepted-quotation.test.tsx`
- Test: `apps/web-app/src/app/health/payments/checkout/__tests__/checkout-shows-quotation-and-terms.test.tsx`
- Test: `apps/web-app/src/components/payments/__tests__/quotation-invoiced-without-acceptance.test.tsx`

**Interfaces:**
- Consumes: `PaymentService.getQuotations(applicationId)` → `QuotationsBySide` and `PaymentService.acceptQuotation(applicationId, issuerType)` (`payment-service.ts:697,716`); `createCheckout({ applicationId, milestone, paymentTermsAccepted })` (extended below); the backend codes from T2.
- Produces (FE types other tasks and the walks rely on):

```ts
// apps/web-app/src/lib/services/checkout-service.ts
export interface PaymentTermsAcceptance { version: string; acceptedAt: string }
export interface CreateCheckoutArgs {
    applicationId: string;
    milestone: string;
    paymentTermsAccepted?: PaymentTermsAcceptance;
    mockScenario?: CheckoutMockScenario | string;
}
export interface CheckoutSessionData {
    checkoutOrderId: string; paymentIntentId: string; clientSecret: string;
    milestone: string; breakdown: CheckoutBreakdown;
    quotationNumber?: string | null;   // added by T5
}
/** The disclosure version this build shows. Mirrors docs/legal/payment-terms-th-v1.1.md. */
export const PAYMENT_TERMS_VERSION = 'payment-terms-th-v1.1';
```

```ts
// apps/web-app/src/lib/services/payment-service.ts — QuotationRecord gains
    acceptedAt?: string | null;      // already present
    acceptedBy?: string | null;
    phase1InvoicedAt?: string | null;
    phase2InvoicedAt?: string | null;
```

**Thai copy used below is written to the rules in Global Constraint 5** — register คุณ, no em dash, space at Thai/Latin boundaries, cause plus next action.

#### 8a — wizard slot 10 renders the real quotation and accepts through the API

- [ ] **Step 1: Write the failing test — RED proof #6 of spec §4**

Create `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/invoice-step-accepts-the-real-quotation.test.tsx`:

```tsx
/**
 * RED proof 6 (F-G4-64, spec 4; synthesis.md 2.4).
 *
 * Slot 10 asks the applicant to tick "ข้าพเจ้ารับทราบและยอมรับใบเสนอราคา…"
 * over a document the BROWSER invented: the number comes from
 * generateDocumentNumber (G-01-DDMMYY-XXXX, not the QT-PRD- the register
 * holds), the amounts come from use-pricing with quantity pinned to 1 and no
 * platform or VAT line, and the tick is written to browser state only
 * (`dtamQuote`, which has no server-side reader anywhere).
 *
 * For one cultivation scope that screen shows 30,000 while the real price is
 * 35,310; for three it still shows 30,000 while the real price is 105,930.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StepInvoice } from '../invoice-step';

const mockGetQuotations = jest.fn();
const mockAcceptQuotation = jest.fn();
jest.mock('@/lib/services/payment-service', () => ({
    PaymentService: {
        getQuotations: (...a: unknown[]) => mockGetQuotations(...a),
        acceptQuotation: (...a: unknown[]) => mockAcceptQuotation(...a),
    },
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../hooks/use-application-flow-store', () => ({
    useApplicationFlowStore: () => ({
        state: { applicationId: 'app-1', applicantData: { applicantType: 'INDIVIDUAL', firstName: 'ก', lastName: 'ข' } },
        updateState: jest.fn(),
    }),
}));

const QUOTATION = {
    id: 'qt-1',
    applicationId: 'app-1',
    issuerType: 'PLATFORM' as const,
    quotationNumber: 'QT-PRD-2026-000001',
    subtotal: '33000.00',
    vat: '2310.00',
    totalAmount: '35310.00',
    status: 'PENDING' as const,
    createdAt: '2026-08-25T00:00:00.000Z',
    installments: [
        { phase: 'PHASE_1', amount: 5885 },
        { phase: 'PHASE_2', amount: 29425 },
    ],
    lineItems: [{ method: 'outdoor', label: 'กลางแจ้ง', phase1Amount: 5885, phase2Amount: 29425, netAmount: 33000, taxAmount: 2310 }],
};

beforeEach(() => {
    jest.clearAllMocks();
    mockGetQuotations.mockResolvedValue({ dtam: null, platform: QUOTATION });
    mockAcceptQuotation.mockResolvedValue({ ...QUOTATION, status: 'ACCEPTED' });
});

test('it shows the REAL quotation number, not one the browser made up', async () => {
    render(<StepInvoice />);
    expect(await screen.findByText(/QT-PRD-2026-000001/)).toBeInTheDocument();
    expect(screen.queryByText(/G-01-/)).not.toBeInTheDocument();
});

test('it shows the REAL total, 35,310, not the 30,000 the fee constants produce', async () => {
    render(<StepInvoice />);
    expect(await screen.findByText(/35,310/)).toBeInTheDocument();
    expect(screen.queryByText(/^30,000$/)).not.toBeInTheDocument();
});

test('ticking accept POSTs to the backend, and does not merely set browser state', async () => {
    render(<StepInvoice />);
    const box = await screen.findByRole('checkbox');
    await userEvent.click(box);
    await waitFor(() => expect(mockAcceptQuotation).toHaveBeenCalledWith('app-1', 'PLATFORM'));
});

test('the applicant cannot continue until the backend says ACCEPTED', async () => {
    mockAcceptQuotation.mockResolvedValue(null); // the POST failed
    render(<StepInvoice />);
    await userEvent.click(await screen.findByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('button', { name: /ไปหน้าชำระเงิน/ })).toBeDisabled());
});

test('no quotation yet shows a waiting state with a refresh action, not a made-up document', async () => {
    mockGetQuotations.mockResolvedValue({ dtam: null, platform: null });
    render(<StepInvoice />);
    expect(await screen.findByText(/ระบบกำลังออกใบเสนอราคา/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /รีเฟรช/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and paste the RED**

Run: `cd apps/web-app && npx jest src/app/health/applications/new/_steps/steps/__tests__/invoice-step-accepts-the-real-quotation.test.tsx`
Expected: FAIL — `Unable to find an element with the text: /QT-PRD-2026-000001/` (the screen renders `G-01-…`), and `expect(mockAcceptQuotation).toHaveBeenCalled` receives 0 calls.

- [ ] **Step 3: Rewrite slot 10 against the real row**

In `apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx`:

- Delete `generateDocumentNumber` (`:34-46`) and both `useState` initialisers that call it (`:81-86`).
- Delete the `usePricing` / `generateQuotationItems` import (`:9`) and the two `generateQuotationItems` calls (`:121`, `:127`), together with `quotationTotal` / `invoiceTotal` derived from them.
- Delete the `updateState({ milestone1: { dtamQuote: … } })` write (`:154-163`). `dtamQuote` has no server-side reader; leaving it writes a claim nothing holds.
- Load the row and drive the checkbox from the API:

```tsx
  const [quotation, setQuotation] = useState<QuotationRecord | null>(null);
  const [loadingQuotation, setLoadingQuotation] = useState(true);
  const [accepting, setAccepting] = useState(false);

  const loadQuotation = useCallback(async () => {
    if (!applicationId) { setLoadingQuotation(false); return; }
    setLoadingQuotation(true);
    const { platform, dtam } = await PaymentService.getQuotations(applicationId);
    setQuotation(platform ?? dtam);
    setLoadingQuotation(false);
  }, [applicationId]);

  useEffect(() => { void loadQuotation(); }, [loadQuotation]);

  // The tick IS the acceptance: it posts, and the screen believes the row that
  // comes back, not the checkbox. A tick that only set local state is how this
  // screen came to tell four applicants they had accepted a document the
  // register never held (F-G4-64).
  const handleAccept = async () => {
    if (!applicationId || !quotation || accepting) { return; }
    setAccepting(true);
    setLocalError(null);
    const updated = await PaymentService.acceptQuotation(applicationId, quotation.issuerType);
    if (updated) {
      setQuotation(updated);
    } else {
      setLocalError('บันทึกการยอมรับใบเสนอราคาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
    setAccepting(false);
  };

  const isAccepted = quotation?.status === 'ACCEPTED' || quotation?.status === 'INVOICED';
  const canProceed = isAccepted && Boolean(applicationId);
```

- Render three states. No quotation:

```tsx
        <section className="rounded-2xl border border-border bg-card p-6 text-sm">
          <p className="font-semibold text-foreground">ระบบกำลังออกใบเสนอราคาของคำขอนี้</p>
          <p className="mt-1 text-muted-foreground">
            ใบเสนอราคาจะปรากฏภายในไม่กี่วินาที กดปุ่มรีเฟรชเพื่อตรวจสอบอีกครั้ง
            หากยังไม่ปรากฏหลังจากรอสักครู่ กรุณาติดต่อเจ้าหน้าที่
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-3"
            onClick={() => void loadQuotation()}>
            รีเฟรช
          </Button>
        </section>
```

  Otherwise render `QuotationDocument` with `quotationNumber={quotation.quotationNumber}`, the `lineItems` the API returns, and `totalAmount={Number(quotation.totalAmount)}`. Keep `numberToThaiText(Number(quotation.totalAmount))`.
- The checkbox becomes `checked={isAccepted}`, `disabled={isAccepted || accepting}`, `onChange={() => void handleAccept()}`, with the label text unchanged.
- Keep the existing `handleOpenPayment` POST to `/payments/phase1/${applicationId}` as-is: changing which rail slot 10 sends the applicant to is a separate decision, and the backend gate now covers both.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web-app && npx jest src/app/health/applications/new/_steps/steps/__tests__/invoice-step-accepts-the-real-quotation.test.tsx`
Expected: PASS, 5/5.

#### 8b — the pay button is gated on the quotation

- [ ] **Step 5: Write the failing test**

Create `apps/web-app/src/app/health/payments/__tests__/payments-checkout-entry-needs-accepted-quotation.test.tsx`, modelled on the existing `payments-checkout-entry-needs-debt.test.tsx` in that folder (reuse its render harness and its flag/fetch stubs verbatim so the two files cannot drift):

```tsx
/**
 * The "ชำระเงินออนไลน์" entry needs an ACCEPTED quotation as well as a debt.
 *
 * F-G4-64: the backend now refuses with QUOTATION_NOT_ACCEPTED (409). A button
 * that leads straight to a refusal is a screen that sends the applicant down a
 * corridor with a locked door at the end; the card that can unlock it
 * (QuotationReviewSection) is on this same page.
 */
test('with debt but a PENDING quotation, the pay entry is replaced by a pointer to the quotation card', async () => {
    renderPaymentsPage({ pendingAmount: 5885, quotation: { status: 'PENDING' } });
    expect(await screen.findByText(/ยอมรับใบเสนอราคาก่อนจึงจะชำระเงินออนไลน์ได้/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ชำระเงินออนไลน์' })).not.toBeInTheDocument();
});

test('with debt and an ACCEPTED quotation, the pay entry renders', async () => {
    renderPaymentsPage({ pendingAmount: 5885, quotation: { status: 'ACCEPTED' } });
    expect(await screen.findByRole('link', { name: 'ชำระเงินออนไลน์' })).toBeInTheDocument();
});

test('with debt and an INVOICED quotation, the pay entry renders (post-acceptance terminal)', async () => {
    renderPaymentsPage({ pendingAmount: 29425, quotation: { status: 'INVOICED' } });
    expect(await screen.findByRole('link', { name: 'ชำระเงินออนไลน์' })).toBeInTheDocument();
});

test('with no debt, nothing renders here whatever the quotation says (F-G4-49 stands)', async () => {
    renderPaymentsPage({ pendingAmount: 0, quotation: { status: 'ACCEPTED' } });
    expect(screen.queryByRole('link', { name: 'ชำระเงินออนไลน์' })).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/web-app && npx jest src/app/health/payments/__tests__/payments-checkout-entry-needs-accepted-quotation.test.tsx`
Expected: FAIL — the first test finds the link rendering despite the PENDING quotation.

- [ ] **Step 7: Gate the button**

In `apps/web-app/src/app/health/payments/client-view.tsx`, hold the quotation status the page already fetches for `QuotationReviewSection` (lift it into this component, or read it here with `PaymentService.getQuotations` — do not fetch it twice), then change the condition at `:388`:

```tsx
      {isCheckoutUiEnabled() && !loading && activeApplicationId && pendingAmount > 0 ? (
        quotationAccepted ? (
          <div className="rounded-[1.375rem] bg-card p-4 shadow-leaf-card sm:p-5">
            {/* unchanged block */}
          </div>
        ) : (
          /*
            F-G4-64 — the backend refuses with QUOTATION_NOT_ACCEPTED (409), so
            a button here would lead straight to a locked door. Name the cause
            and the next action, and point at the card that unlocks it, which is
            on this same page just below.
          */
          <div role="status" className="rounded-[1.375rem] bg-mint-soft px-4 py-3 text-sm text-foreground">
            กรุณาตรวจสอบและยอมรับใบเสนอราคาก่อนจึงจะชำระเงินออนไลน์ได้ ดูการ์ดใบเสนอราคาด้านล่าง
          </div>
        )
      ) : null}
```

where `quotationAccepted` is `['ACCEPTED', 'INVOICED'].includes(quotation?.status ?? '')`.

- [ ] **Step 8: Run it to verify it passes**

Run: `cd apps/web-app && npx jest src/app/health/payments/__tests__/`
Expected: PASS, including the four pre-existing checkout-entry tests (`payments-checkout-entry-flag`, `-needs-debt`, `-flag-off-notice`, `payments-checkout-rows-are-phases`). `-needs-debt` must be updated to supply an ACCEPTED quotation in its fixture, or it will now fail for the new reason — this is T12 item 10.

#### 8c — the checkout page names the document and collects the acknowledgment

- [ ] **Step 9: Write the failing test**

Create `apps/web-app/src/app/health/payments/checkout/__tests__/checkout-shows-quotation-and-terms.test.tsx`, reusing the render harness in the sibling `checkout-states.test.tsx`:

```tsx
/**
 * The page where the applicant actually pays must show WHAT they are paying
 * against, and take the Q4 acknowledgment.
 *
 * grep -rin 'quotation|ใบเสนอราคา|ACCEPTED' over this folder returned 0 lines
 * before this change (synthesis.md 1.2 row 15), and PAYMENT_TERMS consent lived
 * only in slip-upload-modal.tsx while payment_slips has 0 rows — so no applicant
 * has ever seen that disclosure (register.md G).
 */
test('the start button is disabled until the payment terms are acknowledged', async () => {
    renderCheckout({ app: 'app-1', milestone: 'M1' });
    expect(screen.getByRole('button', { name: /เริ่มขั้นตอนชำระเงิน/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /เงื่อนไขการชำระเงินและการคืนเงิน/ }));
    expect(screen.getByRole('button', { name: /เริ่มขั้นตอนชำระเงิน/ })).toBeEnabled();
});

test('the acknowledgment version and instant go to the backend with the request', async () => {
    const created = renderCheckout({ app: 'app-1', milestone: 'M1' });
    await userEvent.click(screen.getByRole('checkbox', { name: /เงื่อนไขการชำระเงินและการคืนเงิน/ }));
    await userEvent.click(screen.getByRole('button', { name: /เริ่มขั้นตอนชำระเงิน/ }));
    await waitFor(() => expect(created.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
        applicationId: 'app-1',
        milestone: 'M1',
        paymentTermsAccepted: {
            version: 'payment-terms-th-v1.1',
            acceptedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
    })));
});

test('the created state names the quotation the charge collects against', async () => {
    const created = renderCheckout({ app: 'app-1', milestone: 'M1' });
    created.createCheckout.mockResolvedValue({
        success: true,
        data: {
            checkoutOrderId: 'co-1', paymentIntentId: 'pi_1', clientSecret: 's', milestone: 'M1',
            quotationNumber: 'QT-PRD-2026-000001',
            breakdown: { dtamFeeAmount: 5000, platformFeeNet: 500, platformFeeVat: 385, platformFeeGross: 885, totalPayableAmount: 5885 },
        },
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /เงื่อนไขการชำระเงินและการคืนเงิน/ }));
    await userEvent.click(screen.getByRole('button', { name: /เริ่มขั้นตอนชำระเงิน/ }));
    expect(await screen.findByText('QT-PRD-2026-000001')).toBeInTheDocument();
});

test.each([
    ['QUOTATION_NOT_ACCEPTED', /กรุณายอมรับใบเสนอราคาก่อนชำระเงิน/],
    ['QUOTATION_NOT_ISSUED', /ระบบยังไม่ออกใบเสนอราคาของคำขอนี้/],
    ['QUOTATION_EXPIRED', /เกินกำหนดยืนราคา/],
    ['QUOTATION_GATE_UNAVAILABLE', /ตรวจสอบสถานะใบเสนอราคาไม่สำเร็จ/],
    ['CHECKOUT_PRICE_DRIFT', /ไม่ตรงกับใบเสนอราคาที่คุณยอมรับไว้/],
    ['PAYMENT_TERMS_NOT_ACCEPTED', /ยอมรับเงื่อนไขการชำระเงิน/],
])('the %s refusal reaches the screen in Thai, never as a raw code', async (code, copy) => {
    const created = renderCheckout({ app: 'app-1', milestone: 'M1' });
    created.createCheckout.mockResolvedValue({ success: false, code, status: 409, error: code });
    await userEvent.click(screen.getByRole('checkbox', { name: /เงื่อนไขการชำระเงินและการคืนเงิน/ }));
    await userEvent.click(screen.getByRole('button', { name: /เริ่มขั้นตอนชำระเงิน/ }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByText(code)).not.toBeInTheDocument();
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `cd apps/web-app && npx jest src/app/health/payments/checkout/__tests__/checkout-shows-quotation-and-terms.test.tsx`
Expected: FAIL — no checkbox with that name exists.

- [ ] **Step 11: Implement the checkout page changes**

In `apps/web-app/src/lib/services/checkout-service.ts`, add the version constant and the field, and put it on the wire:

```ts
/**
 * The disclosure version this build shows. Mirrors the heading of
 * docs/legal/payment-terms-th-v1.1.md. A literal, not an env read: the string
 * identifies the TEXT this bundle renders, so it must change only when the text
 * in that file changes and the bundle is rebuilt.
 */
export const PAYMENT_TERMS_VERSION = 'payment-terms-th-v1.1';
```

```ts
    if (getCheckoutApiMode() !== 'mock') {
        return api.post<CheckoutSessionData>('/payments/checkout', {
            applicationId,
            milestone,
            ...(paymentTermsAccepted ? { paymentTermsAccepted } : {}),
        });
    }
```

In `apps/web-app/src/app/health/payments/checkout/client-view.tsx`, extend `CHECKOUT_ERROR_MAP` (`:57-68`) with the six codes and the exact Thai strings from T2's catalogue (Policy 5: the map is the only place the Thai lives on this screen), add the consent state and gate the button:

```tsx
  const [termsAccepted, setTermsAccepted] = useState(false);
```

```tsx
      const result = await createCheckout({
        applicationId,
        milestone: milestoneParam,
        paymentTermsAccepted: { version: PAYMENT_TERMS_VERSION, acceptedAt: new Date().toISOString() },
        ...(mockScenarioParam === undefined ? {} : { mockScenario: mockScenarioParam }),
      });
```

In the idle section (`:267-300`), above the buttons:

```tsx
          {/*
            Q4 (owner ruling 2026-07-08) reaches the card rail. The disclosure
            is SHOWN here, not linked: there is no /legal/payment-terms route in
            apps/web-app (only (marketing)/privacy-policy and terms-of-service),
            and the slip rail's own block inlines the same summary
            (slip-upload-modal.tsx:603-650, data-testid slip-upload-terms-
            section). The full text is docs/legal/payment-terms-th-v1.1.md, and
            the version string that travels with the acknowledgment names it.
            ท่าน is used inside this block on purpose: thai-ui-copy reserves it
            for legal surfaces, and the slip block uses it for the same text.
          */}
          <section className="mt-4 rounded-2xl border border-border bg-mint-soft p-4" data-testid="checkout-terms-section">
            <h3 className="text-sm font-semibold text-foreground">เงื่อนไขการชำระเงินและการคืนเงิน</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                ค่าธรรมเนียมของขั้นตอนที่<strong>เริ่มดำเนินการตรวจแล้ว ไม่สามารถขอคืนได้</strong>{' '}
                แม้ผลจะไม่ผ่านหรือคำขอถูกยกเลิกเพราะพ้นกำหนดแก้ไข
              </li>
              <li>
                เมื่อถูกสั่งแก้ไข ท่านมีเวลา <strong>5 วันทำการ</strong> (ไม่นับเสาร์-อาทิตย์และวันหยุดราชการไทย)
                พ้นกำหนดคำขอจะถูกยกเลิกอัตโนมัติ
              </li>
              <li>
                การยกเลิกที่เกิดจากความผิดพลาดของระบบเอง แพลตฟอร์มคืนสถานะให้อัตโนมัติ
                เงินที่เก็บซ้ำหรือเก็บผิดพลาดมีสิทธิ์ได้รับคืน
              </li>
              <li>
                ค่าธรรมเนียมถูกล็อกราคา ณ วันยื่นคำขอ ตามใบเสนอราคาที่ท่านยอมรับไว้
              </li>
            </ul>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.currentTarget.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                aria-label="เงื่อนไขการชำระเงินและการคืนเงิน"
                data-testid="checkout-terms-checkbox"
              />
              <span className="text-foreground">
                ข้าพเจ้าได้อ่านและ<strong>ยอมรับเงื่อนไขการชำระเงินและการคืนเงิน</strong>ข้างต้น
              </span>
            </label>
          </section>
```

and `disabled={creating || !termsAccepted}` on the start button. In the `created` section (`:181-243`), add the quotation row above `งวดที่ต้องชำระ`:

```tsx
            {session.quotationNumber ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">ใบเสนอราคาที่ยอมรับไว้</span>
                <span className="font-mono text-foreground">{session.quotationNumber}</span>
              </div>
            ) : null}
```

**The VERBATIM MONEY rule at the top of this file still holds:** every amount still comes straight from `session.breakdown`, and nothing added here performs arithmetic or imports the fee constants. The two grep pins in that file's header comment must keep passing.

- [ ] **Step 12: Run it to verify it passes**

Run: `cd apps/web-app && npx jest src/app/health/payments/checkout/__tests__/`
Expected: PASS, including the pre-existing `checkout-states.test.tsx` and `checkout-page-flag-guard.test.tsx` — `checkout-states` needs its start-button presses to tick the consent box first (T12 item 11).

#### 8d — INVOICED without acceptance is labelled honestly

- [ ] **Step 13: Write the failing test**

Create `apps/web-app/src/components/payments/__tests__/quotation-invoiced-without-acceptance.test.tsx`:

```tsx
/**
 * A quotation closed by the repair script (spec 3.7) is INVOICED with
 * acceptedAt still null, because no acceptance ever happened and inventing one
 * would be inventing a record. The screen must say what that row is, and must
 * not offer a button for a step that is over.
 */
import { render, screen } from '@testing-library/react';
import QuotationReviewSection from '../QuotationReviewSection';

const mockGetQuotations = jest.fn();
jest.mock('@/lib/services/payment-service', () => ({
    PaymentService: { getQuotations: (...a: unknown[]) => mockGetQuotations(...a) },
}));

const base = {
    id: 'qt-1', applicationId: 'app-1', issuerType: 'PLATFORM' as const,
    quotationNumber: 'QT-PRD-2026-000001', subtotal: '33000.00', vat: '2310.00',
    totalAmount: '35310.00', createdAt: '2026-08-25T00:00:00.000Z', lineItems: [],
};

test('INVOICED with no acceptedAt is labelled as billed before the acceptance step existed', async () => {
    mockGetQuotations.mockResolvedValue({
        dtam: null, platform: { ...base, status: 'INVOICED', acceptedAt: null },
    });
    render(<QuotationReviewSection applicationId="app-1" />);
    expect(await screen.findByText('ออกใบแจ้งหนี้แล้ว (ชำระก่อนมีขั้นตอนยอมรับ)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ยอมรับใบเสนอราคา/ })).not.toBeInTheDocument();
});

test('INVOICED WITH an acceptedAt keeps the ordinary label', async () => {
    mockGetQuotations.mockResolvedValue({
        dtam: null, platform: { ...base, status: 'INVOICED', acceptedAt: '2026-08-28T03:00:00.000Z' },
    });
    render(<QuotationReviewSection applicationId="app-1" />);
    expect(await screen.findByText('ออกใบแจ้งหนี้แล้ว')).toBeInTheDocument();
});
```

- [ ] **Step 14: Run it to verify it fails, then implement**

Run: `cd apps/web-app && npx jest src/components/payments/__tests__/quotation-invoiced-without-acceptance.test.tsx`
Expected: FAIL — the badge reads whatever the current `INVOICED` case returns, not the new string.

In `apps/web-app/src/components/payments/QuotationReviewSection.tsx`, give the badge helper (the `switch` around `:85-100`) the row rather than just the status, and add:

```tsx
        case 'INVOICED':
            // spec 3.7 — a row closed by the repair script is INVOICED with
            // acceptedAt null on purpose: the money is a fact, the acceptance is
            // not. Say which of the two this row is.
            return quotation.acceptedAt
                ? { label: 'ออกใบแจ้งหนี้แล้ว', tone: 'bg-sky-100 text-sky-800' }
                : { label: 'ออกใบแจ้งหนี้แล้ว (ชำระก่อนมีขั้นตอนยอมรับ)', tone: 'bg-slate-200 text-slate-700' };
```

`isAcceptable` (`:104-106`) already excludes `INVOICED`, so no accept button renders for either variant — no change needed there.

- [ ] **Step 15: Run the whole web-app payment surface and lint**

```bash
cd apps/web-app
npx jest src/app/health/payments src/components/payments src/app/health/applications/new
npx eslint src/app/health/payments src/components/payments/QuotationReviewSection.tsx \
           src/app/health/applications/new/_steps/steps/invoice-step.tsx --max-warnings=0
```

Expected: PASS and zero warnings. `no-thai-letterspacing` must not fire on any new Thai element (Global Constraint 5).

- [ ] **Step 16: Commit**

```bash
git add apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx \
        apps/web-app/src/app/health/payments/client-view.tsx \
        apps/web-app/src/app/health/payments/checkout/client-view.tsx \
        apps/web-app/src/lib/services/checkout-service.ts \
        apps/web-app/src/lib/services/payment-service.ts \
        apps/web-app/src/components/payments/QuotationReviewSection.tsx \
        apps/web-app/src/app/health/applications/new/_steps/steps/__tests__ \
        apps/web-app/src/app/health/payments/__tests__ \
        apps/web-app/src/app/health/payments/checkout/__tests__ \
        apps/web-app/src/components/payments/__tests__
git commit -m "feat(web): the screen asks about the document the register actually holds

Slot 10 rendered a quotation the browser invented (G-01- numbers, 30,000 for a
35,310 bill) and kept the tick in browser state. It now renders the QT-PRD- row
and the tick posts the acceptance. The payments page stops offering a pay button
that leads to a 409. The checkout page names the quotation it collects against
and takes the Q4 acknowledgment, which no applicant had ever been shown. A row
closed by repair says it was billed before the acceptance step existed.

Refs F-G4-64 spec 3.5, synthesis.md 2.4."
```

---

### Task 9: `docs/legal/payment-terms-th-v1.1.md` — the published figures match what is charged

**Files:**
- Create: `docs/legal/payment-terms-th-v1.1.md`
- Modify: `docs/legal/payment-terms-th-v1.md` (superseded banner only — the v1 text stays readable, because applicants consented to it)
- Test: `apps/backend/__tests__/unit/payment-terms-doc-matches-the-fee-service.test.js`

**Interfaces:**
- Consumes: nothing at runtime.
- Produces: the version string `payment-terms-th-v1.1`, which is the literal in `PAYMENT_TERMS_VERSION` (T8) and the value stored in `checkout_orders.paymentTermsVersion` (T5).

**Why this blocks rather than tidies** (synthesis.md §6, item 5, raised on objection 6): the published table says งวด 1 = 5,535 and งวด 2 = 27,675 while the system charges 5,885 and 29,425. **The declared price is LOWER than the amount collected**, on a document marked LIVE (`payment-terms-th-v1.md:6`) that is the enforceability basis of the no-refund policy. This is the first change that will actually show that text to an applicant — `payment_slips` has 0 rows, so nobody has ever seen it.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/__tests__/unit/payment-terms-doc-matches-the-fee-service.test.js`:

```js
'use strict';
/**
 * The published fee table must equal what the fee service charges.
 *
 * docs/legal/payment-terms-th-v1.md declares 5,535 / 27,675 (the retired VAT
 * base: 7% of the platform fee alone). W14 (operator ruling 2026-08-22) put VAT
 * on the WHOLE ค่าบริการ, so the real figures are 5,885 / 29,425. A LIVE
 * consent document that understates the price is a legal exposure, not a typo.
 */
const fs = require('fs');
const path = require('path');
const { calculateApplicationFees, calculateRenewalFee } = require('../../modules/billing');

const V11 = path.resolve(__dirname, '../../../../docs/legal/payment-terms-th-v1.1.md');

describe('payment-terms v1.1 prints the figures the fee service produces', () => {
    const doc = fs.readFileSync(V11, 'utf8');
    const fees = calculateApplicationFees({ cultivationMethods: ['outdoor'] }, { scopeCount: 1 });
    const renewal = calculateRenewalFee({ cultivationMethods: ['outdoor'] }, { scopeCount: 1 });

    it('the per-scope phase totals are the ones the fee service returns', () => {
        expect(fees.phase1.phaseTotal).toBe(5885);
        expect(fees.phase2.phaseTotal).toBe(29425);
        expect(doc).toContain('5,885');
        expect(doc).toContain('29,425');
        expect(doc).toContain('35,310');
    });

    it('the retired figures are gone', () => {
        expect(doc).not.toContain('5,535');
        expect(doc).not.toContain('27,675');
    });

    it('the renewal charge is printed and is the renewal rate, not the phase-2 rate', () => {
        expect(renewal.phaseTotal).toBe(35310);
        expect(doc).toMatch(/ต่ออายุ[\s\S]{0,200}35,310/);
    });

    it('it names the VAT base W14 actually uses', () => {
        expect(doc).toMatch(/VAT 7%[\s\S]{0,120}ค่าธรรมเนียมกรม[\s\S]{0,40}ค่าแพลตฟอร์ม/);
    });

    it('it carries the version string the code sends with the acknowledgment', () => {
        expect(doc).toContain('payment-terms-th-v1.1');
    });

    it('v1 is marked superseded rather than deleted (applicants consented to that text)', () => {
        const v1 = fs.readFileSync(path.resolve(__dirname, '../../../../docs/legal/payment-terms-th-v1.md'), 'utf8');
        expect(v1).toMatch(/SUPERSEDED/);
        expect(v1).toContain('payment-terms-th-v1.1');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/payment-terms-doc-matches-the-fee-service.test.js`
Expected: FAIL — `ENOENT: no such file or directory … payment-terms-th-v1.1.md`.

- [ ] **Step 3: Write v1.1**

Create `docs/legal/payment-terms-th-v1.1.md`. Copy `payment-terms-th-v1.md` verbatim, then change exactly these things — nothing else, so a reader can diff the two documents and see only what moved:

- Heading: `# เงื่อนไขการชำระค่าธรรมเนียมและการคืนเงิน (ฉบับที่ 1.1 — 28 สิงหาคม 2569)`
- The version line: `> เวอร์ชันนี้คือ ` + "`payment-terms-th-v1.1`" + ` แก้ข้อความเมื่อไหร่ ต้องยกเลขเวอร์ชันใหม่และให้ผู้ใช้กดยอมรับใหม่.`
- A revision note directly under the status line:

```markdown
> **แก้ไขจากฉบับที่ 1 (28 สิงหาคม 2569):** ตารางค่าธรรมเนียมในฉบับก่อนพิมพ์ VAT บนค่าบริการแพลตฟอร์มอย่างเดียว
> (35 / 175 บาท รวมงวดละ 5,535 / 27,675) ซึ่ง **ต่ำกว่ายอดที่ระบบเรียกเก็บจริง** ตามมติ W14 (28 สิงหาคม 2569 ทบทวน มติ 22 สิงหาคม 2569)
> ที่ให้คิด VAT 7% บนค่าบริการทั้งก้อน คือค่าธรรมเนียมกรมฯ บวกค่าบริการแพลตฟอร์ม ฉบับนี้พิมพ์ยอดที่เรียกเก็บจริง
> และเพิ่มค่าธรรมเนียมต่ออายุซึ่งฉบับก่อนไม่ได้ระบุไว้
```

- The §1 table (`v1:15-18`) becomes:

```markdown
| งวด | ค่าธรรมเนียมรัฐ (กรมการแพทย์แผนไทยฯ) | ค่าบริการแพลตฟอร์ม | VAT 7% (ของค่าบริการรวม) | รวม |
|---|---|---|---|---|
| งวดที่ 1 — ตรวจเอกสาร | 5,000 บาท | 500 บาท | 385 บาท | **5,885 บาท** |
| งวดที่ 2 — ตรวจประเมิน | 25,000 บาท | 2,500 บาท | 1,925 บาท | **29,425 บาท** |
| **รวมทั้งคำขอ** | 30,000 บาท | 3,000 บาท | 2,310 บาท | **35,310 บาท** |
| การต่ออายุใบรับรอง (ครั้งเดียว) | 30,000 บาท | 3,000 บาท | 2,310 บาท | **35,310 บาท** |

- ตัวเลขข้างต้นเป็นค่าธรรมเนียมต่อ **1 ระบบการปลูก** คำขอที่มีหลายระบบการปลูกคิดตามจำนวนระบบ
- **VAT 7% คิดบนค่าบริการทั้งก้อน** คือค่าธรรมเนียมกรมฯ บวกค่าบริการแพลตฟอร์ม ตามมติ W14
- ค่าธรรมเนียมถูก **ล็อกราคา ณ วันยื่นคำขอ** การปรับราคาภายหลังไม่กระทบคำขอที่ยื่นแล้ว
- ท่านจะได้รับใบเสนอราคาก่อนชำระทุกงวด และต้อง **กดยอมรับใบเสนอราคา** ก่อนระบบจึงจะสร้างรายการชำระเงินให้
  (มติ 28 สิงหาคม 2569) ใบเสร็จและใบกำกับภาษีออกให้หลังชำระ
```

- §6 keeps its 5,000 / 25,000 state-fee figures unchanged — those are the state's own rates and they did not move.

> **Deliberately NOT changed in this task:** the "ยกเว้นภาษีมูลค่าเพิ่ม ม.77/1(10)" wording that appears on issued tax invoices (`stripe-checkout-service.js:260` and at least eight other places). Spec §3.6 parks it on ledger F-G4-67 pending the tax adviser, because six tax invoices carrying that text have already been issued. Do not touch it here.

- [ ] **Step 4: Mark v1 superseded**

At the top of `docs/legal/payment-terms-th-v1.md`, directly under the existing status line (`:5`), add — and change nothing else in that file, because applicants consented to that exact text:

```markdown
> **สถานะปัจจุบัน: SUPERSEDED 28 สิงหาคม 2569 — ใช้ `payment-terms-th-v1.1` แทน**
> เอกสารฉบับนี้เก็บไว้เพื่อการตรวจสอบย้อนหลัง ห้ามแก้ข้อความ: มีผู้ใช้ที่กดยอมรับข้อความชุดนี้ไว้
> ตารางค่าธรรมเนียมในฉบับนี้ (5,535 / 27,675) ต่ำกว่ายอดที่เรียกเก็บจริง ดูเหตุผลในฉบับ 1.1
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/payment-terms-doc-matches-the-fee-service.test.js`
Expected: PASS, 6/6.

- [ ] **Step 6: Commit**

```bash
git add docs/legal/payment-terms-th-v1.1.md docs/legal/payment-terms-th-v1.md \
        apps/backend/__tests__/unit/payment-terms-doc-matches-the-fee-service.test.js
git commit -m "docs(legal): the published fee table now says what is actually charged

v1 declared 5,535 / 27,675 while the system collects 5,885 / 29,425 — a LIVE
consent document understating the price. v1.1 prints the real figures, names the
W14 VAT base, adds the renewal charge, and states that acceptance of the
quotation is required before a payment is created. v1 stays readable and
unedited, marked superseded, because people consented to that text.

A test pins the printed figures to the fee service, so they cannot drift again.

Refs F-G4-64 R4, spec 3.6."
```

---

### Task 10: `close-quotations-settled-before-gate.js` — the repair for the two pre-gate rows

**Files:**
- Create: `apps/backend/scripts/close-quotations-settled-before-gate.js`
- Test: `apps/backend/__tests__/unit/close-quotations-script.test.js`

**Interfaces:**
- Consumes: the columns from T1.
- Produces:

```js
/**
 * PURE decision over plain rows — no database, no client construction.
 * @param {{quotations: Array<{id, quotationNumber, status, acceptedAt, notes,
 *          phase1InvoicedAt, phase2InvoicedAt, installments,
 *          application: {id, checkoutOrders: Array<{milestone, status, settledAt}>}}>}} p
 * @returns {{closures: Array<{quotationId, quotationNumber, data}>,
 *            skipped: Array<{quotationNumber, reason}>}}
 */
function planQuotationClosures({ quotations })
module.exports = { planQuotationClosures };
```

**L3 — the agent writes this script and runs the DRY RUN only.** `--apply` against the real register is the operator's, exactly like `bind-checkout-receipts-to-invoices.js --apply --expect=4` before it. Say so in the report; do not run it.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/__tests__/unit/close-quotations-script.test.js`:

```js
'use strict';
/**
 * The repair closes the quotations of applications that paid in full through
 * checkout BEFORE the acceptance gate existed — WITHOUT inventing an
 * acceptance that never happened (F-G4-64 R5).
 *
 * Expected on the register of 2026-08-28 (register.md B, E, Q2):
 *   QT-PRD-2026-000001 (A1) — M1 + M2 SETTLED  -> close
 *   QT-PRD-2026-000002 (A3) — M1 + M2 SETTLED  -> close
 *   QT-PRD-2026-000003 (A4) — nothing paid     -> leave PENDING, correctly
 *   A2 (29422e73)           — no quotation row -> nothing to close, and nothing
 *                             is created: ledger F-G4-68 records that 35,310 THB
 *                             was collected with no pricing document.
 *
 * Requiring this module must never construct a PrismaClient (pattern:
 * __tests__/unit/bind-checkout-receipts-script.test.js).
 */
const path = require('path');

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn() }));

const { PrismaClient } = require('@prisma/client');
const { planQuotationClosures } = require(path.join(
    __dirname, '..', '..', 'scripts', 'close-quotations-settled-before-gate'));

const M1_AT = new Date('2026-08-25T12:18:48.000Z');
const M2_AT = new Date('2026-08-25T12:39:26.000Z');

const twoPhase = [
    { phase: 'PHASE_1', amount: 5885, stateAmount: 5000, platformAmount: 500, vatAmount: 385, scopeCount: 1 },
    { phase: 'PHASE_2', amount: 29425, stateAmount: 25000, platformAmount: 2500, vatAmount: 1925, scopeCount: 1 },
];

function quotation(over = {}) {
    return {
        id: 'qt-1',
        quotationNumber: 'QT-PRD-2026-000001',
        status: 'PENDING',
        acceptedAt: null,
        notes: null,
        phase1InvoicedAt: null,
        phase2InvoicedAt: null,
        installments: twoPhase,
        application: {
            id: 'app-1',
            checkoutOrders: [
                { milestone: 'M1', status: 'SETTLED', settledAt: M1_AT },
                { milestone: 'M2', status: 'SETTLED', settledAt: M2_AT },
            ],
        },
        ...over,
    };
}

test('requiring the script constructs no PrismaClient', () => {
    expect(PrismaClient).not.toHaveBeenCalled();
});

test('a fully settled quotation is closed with each phase stamped from its own order', () => {
    const { closures, skipped } = planQuotationClosures({ quotations: [quotation()] });
    expect(skipped).toHaveLength(0);
    expect(closures).toHaveLength(1);
    expect(closures[0].data).toMatchObject({
        status: 'INVOICED',
        phase1InvoicedAt: M1_AT,
        phase2InvoicedAt: M2_AT,
    });
});

test('it never writes an acceptance that did not happen', () => {
    const { closures } = planQuotationClosures({ quotations: [quotation()] });
    expect(closures[0].data).not.toHaveProperty('acceptedAt');
    expect(closures[0].data).not.toHaveProperty('acceptedBy');
    expect(closures[0].data).not.toHaveProperty('acceptedSnapshot');
    expect(closures[0].data).not.toHaveProperty('acceptedSnapshotHash');
});

test('the note says exactly what happened, and keeps any note already there', () => {
    const { closures } = planQuotationClosures({ quotations: [quotation({ notes: 'เดิม' })] });
    expect(closures[0].data.notes).toContain('เดิม');
    expect(closures[0].data.notes).toMatch(
        /CLOSED_BY_REPAIR 2026-08-28 F-G4-64: settled via checkout before the acceptance gate; no acceptance recorded/);
});

test('an unpaid quotation is left alone (A4 is correctly PENDING)', () => {
    const { closures, skipped } = planQuotationClosures({
        quotations: [quotation({
            id: 'qt-3', quotationNumber: 'QT-PRD-2026-000003',
            application: { id: 'app-4', checkoutOrders: [] },
        })],
    });
    expect(closures).toHaveLength(0);
    expect(skipped).toEqual([{ quotationNumber: 'QT-PRD-2026-000003', reason: 'NOT_FULLY_SETTLED' }]);
});

test('a partially settled quotation is left alone: half-paid is not closed', () => {
    const { closures, skipped } = planQuotationClosures({
        quotations: [quotation({
            application: { id: 'app-1', checkoutOrders: [{ milestone: 'M1', status: 'SETTLED', settledAt: M1_AT }] },
        })],
    });
    expect(closures).toHaveLength(0);
    expect(skipped[0].reason).toBe('NOT_FULLY_SETTLED');
});

test('an order that is not SETTLED does not count as paid', () => {
    const { closures } = planQuotationClosures({
        quotations: [quotation({
            application: { id: 'app-1', checkoutOrders: [
                { milestone: 'M1', status: 'SETTLED', settledAt: M1_AT },
                { milestone: 'M2', status: 'PENDING_PAYMENT', settledAt: null },
            ] },
        })],
    });
    expect(closures).toHaveLength(0);
});

test('a renewal quotation (PHASE_2 only) closes on its single settled M2', () => {
    const { closures } = planQuotationClosures({
        quotations: [quotation({
            installments: [twoPhase[1]],
            application: { id: 'app-r', checkoutOrders: [{ milestone: 'M2', status: 'SETTLED', settledAt: M2_AT }] },
        })],
    });
    expect(closures).toHaveLength(1);
    expect(closures[0].data.phase2InvoicedAt).toBe(M2_AT);
    expect(closures[0].data).not.toHaveProperty('phase1InvoicedAt');
});

test('an already-closed quotation is skipped, not re-stamped', () => {
    const { closures, skipped } = planQuotationClosures({
        quotations: [quotation({ status: 'INVOICED', phase1InvoicedAt: M1_AT, phase2InvoicedAt: M2_AT })],
    });
    expect(closures).toHaveLength(0);
    expect(skipped[0].reason).toBe('ALREADY_CLOSED');
});

test('an ACCEPTED quotation is skipped: the live settlement path owns it now', () => {
    const { closures, skipped } = planQuotationClosures({
        quotations: [quotation({ status: 'ACCEPTED', acceptedAt: new Date() })],
    });
    expect(closures).toHaveLength(0);
    expect(skipped[0].reason).toBe('ACCEPTED_NOT_A_REPAIR_CASE');
});

test('the whole register of 2026-08-28 plans exactly 2 closures', () => {
    const { closures } = planQuotationClosures({
        quotations: [
            quotation(),
            quotation({ id: 'qt-2', quotationNumber: 'QT-PRD-2026-000002', application: {
                id: 'app-3', checkoutOrders: [
                    { milestone: 'M1', status: 'SETTLED', settledAt: M1_AT },
                    { milestone: 'M2', status: 'SETTLED', settledAt: M2_AT },
                ] } }),
            quotation({ id: 'qt-3', quotationNumber: 'QT-PRD-2026-000003', application: { id: 'app-4', checkoutOrders: [] } }),
        ],
    });
    expect(closures.map((c) => c.quotationNumber)).toEqual(['QT-PRD-2026-000001', 'QT-PRD-2026-000002']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/close-quotations-script.test.js`
Expected: FAIL with `Cannot find module '.../scripts/close-quotations-settled-before-gate'`.

- [ ] **Step 3: Write the script**

Create `apps/backend/scripts/close-quotations-settled-before-gate.js`, following `bind-checkout-receipts-to-invoices.js` exactly for its argument parsing, its `redactDbUrl`, its evidence-JSON option and its guard sequence:

```js
#!/usr/bin/env node
'use strict';
/**
 * Close the quotations of applications that paid in full through the checkout
 * rail BEFORE the acceptance gate existed — and refuse everything else.
 *
 * WHY THIS EXISTS (ledger F-G4-64, R5)
 *   The register of 2026-08-28 holds three quotations, all PENDING, all with
 *   acceptedAt null. Two of them (QT-PRD-2026-000001 for A1 and -000002 for A3)
 *   priced applications whose BOTH instalments are SETTLED, whose applications
 *   are CERTIFIED, and one of whose certificates is still active. The row says
 *   "awaiting the customer's answer" about a bill that was paid in full and
 *   receipted twice.
 *
 * WHAT IT REFUSES TO DO
 *   It does not write acceptedAt, acceptedBy, acceptedSnapshot or
 *   acceptedSnapshotHash. Nobody accepted these quotations; the money is a
 *   fact and the acceptance is not, and a repair that manufactures the second
 *   to tidy up the first is a forged record. The row is stamped INVOICED with a
 *   note saying precisely that, and the screen labels it
 *   "ออกใบแจ้งหนี้แล้ว (ชำระก่อนมีขั้นตอนยอมรับ)".
 *
 *   It also creates nothing for application A2 (29422e73), which collected
 *   35,310 THB, holds an active certificate E5960D, and has no quotation row at
 *   all. Ledger F-G4-68 records that absence. Back-dating a document for it
 *   would be inventing the pricing record an auditor would then rely on.
 *
 * SAFETY CONTRACT (mirrors scripts/bind-checkout-receipts-to-invoices.js)
 *   - dry run is the default; nothing is written without --apply;
 *   - --apply additionally requires --expect=<n> and aborts unless exactly n
 *     closures are planned, so a register that drifted since the dry run stops
 *     the run;
 *   - every write is guarded inside the transaction by the row still being
 *     un-closed; one row that moved rolls the whole transaction back;
 *   - output carries no personal data, and the connection string is never
 *     printed (L2).
 *
 * Usage:
 *   node scripts/close-quotations-settled-before-gate.js                     # dry run (default)
 *   node scripts/close-quotations-settled-before-gate.js --apply --expect=2  # close, guarded
 *   ... [--evidence <dir>]                                                   # write decisions JSON
 *
 * L3: the --apply run belongs to the operator. An agent runs the dry run only.
 */
```

The pure planner:

```js
const REPAIR_NOTE = 'CLOSED_BY_REPAIR 2026-08-28 F-G4-64: '
    + 'settled via checkout before the acceptance gate; no acceptance recorded';

const PHASE_COLUMN = Object.freeze({ PHASE_1: 'phase1InvoicedAt', PHASE_2: 'phase2InvoicedAt' });
const MILESTONE_PHASE = Object.freeze({ M1: 'PHASE_1', M2: 'PHASE_2' });

/**
 * The whole decision, in one place, over plain rows. PURE: reads its arguments,
 * mutates nothing, touches no database.
 */
function planQuotationClosures({ quotations }) {
    const closures = [];
    const skipped = [];
    for (const q of quotations) {
        if (q.status === 'INVOICED') {
            skipped.push({ quotationNumber: q.quotationNumber, reason: 'ALREADY_CLOSED' });
            continue;
        }
        if (q.status === 'ACCEPTED' || q.acceptedAt) {
            // Not a repair case: this row went through the real gate, and the
            // live settlement path is what closes it.
            skipped.push({ quotationNumber: q.quotationNumber, reason: 'ACCEPTED_NOT_A_REPAIR_CASE' });
            continue;
        }
        const priced = (Array.isArray(q.installments) ? q.installments : [])
            .map((i) => i.phase).filter((p) => PHASE_COLUMN[p]);
        if (priced.length === 0) {
            skipped.push({ quotationNumber: q.quotationNumber, reason: 'NO_INSTALMENTS_TO_MATCH' });
            continue;
        }
        const settled = new Map((q.application?.checkoutOrders || [])
            .filter((o) => o.status === 'SETTLED' && o.settledAt && MILESTONE_PHASE[o.milestone])
            .map((o) => [MILESTONE_PHASE[o.milestone], o.settledAt]));
        if (!priced.every((p) => settled.has(p))) {
            skipped.push({ quotationNumber: q.quotationNumber, reason: 'NOT_FULLY_SETTLED' });
            continue;
        }
        const data = { status: 'INVOICED', notes: q.notes ? `${q.notes}\n${REPAIR_NOTE}` : REPAIR_NOTE };
        for (const p of priced) { data[PHASE_COLUMN[p]] = settled.get(p); }
        closures.push({ quotationId: q.id, quotationNumber: q.quotationNumber, data });
    }
    return { closures, skipped };
}
```

`main()` selects with

```js
    const quotations = await prisma.quotation.findMany({
        where: { isDeleted: false, status: { notIn: ['INVOICED'] } },
        include: {
            application: { select: { id: true, checkoutOrders: {
                select: { milestone: true, status: true, settledAt: true },
            } } },
        },
        orderBy: { quotationNumber: 'asc' },
    });
```

prints the plan (numbers, phases, instants — no personal data), and on `--apply` writes each closure inside one `prisma.$transaction`, each `update` guarded by `where: { id, status: { not: 'INVOICED' } }` so a row that moved since the dry run rolls the whole batch back.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/close-quotations-script.test.js`
Expected: PASS, 11/11.

- [ ] **Step 5: Run the DRY RUN and paste its output**

```bash
cd apps/backend && node scripts/close-quotations-settled-before-gate.js
```
Expected against the demo register: 2 closures planned (`QT-PRD-2026-000001`, `QT-PRD-2026-000002`), 1 skipped `NOT_FULLY_SETTLED` (`QT-PRD-2026-000003`), and the line `node scripts/close-quotations-settled-before-gate.js --apply --expect=2`. **Stop there.** With no `DATABASE_URL` the script cannot connect; report that as BLOCKED, not as a pass.

- [ ] **Step 6: Hand the apply to the operator**

Put this line in the work-item report, verbatim, and do not run it:

```
OPERATOR (L3 — agent must not run): cd apps/backend && node scripts/close-quotations-settled-before-gate.js --apply --expect=2
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/scripts/close-quotations-settled-before-gate.js \
        apps/backend/__tests__/unit/close-quotations-script.test.js
git commit -m "feat(scripts): close the two quotations that were paid in full before the gate existed

Stamps each phase from its own settled order and marks the row INVOICED with a
note saying it was billed before the acceptance step existed. It writes no
acceptedAt: nobody accepted these, and manufacturing the acceptance to tidy the
row would be forging the record an auditor relies on. It creates nothing for
A2, which has no quotation at all (F-G4-68).

Dry run is the default; --apply --expect=2 is the operator's (L3).

Refs F-G4-64 R5, spec 3.7."
```

---

### Task 11: The walks — a03 and a05 updated, C07 added

**Files:**
- Modify: `apps/web-app/e2e-g4/a03-pay-phase1.spec.ts` (the paying block, `:66-120`)
- Modify: `apps/web-app/e2e-g4/a05-pay-phase2.spec.ts` (the paying block, `:60-…`)
- Create: `apps/web-app/e2e-g4/c07-quotation-gate.spec.ts`

**Interfaces:**
- Consumes: `FARMERS, pw, seg, shot, readVars, g4psql, g4Login, pickFarmer` from `apps/web-app/e2e-g4/g4-helpers.ts`; `lqaCapture` from `./lqa`; `stripeConfirmPromptPay, stripeTestAuthorize` from `../e2e-phase0/helpers`.
- Produces: no exported symbol. Run with `npx playwright test --config=playwright.g4.config.ts`.

**Run prerequisites (from `playwright.g4.config.ts:22-30`, unchanged):** backend on `:8000`, frontend on `:3000`, and `stripe listen --forward-to localhost:8000/api/webhooks/stripe` with a signing secret equal to `STRIPE_WEBHOOK_SECRET` — the webhook is the only path that settles a gate. `workers: 1`, fixed order, state handed between specs through VARS.

- [ ] **Step 1: Add the acceptance press to a03**

In `apps/web-app/e2e-g4/a03-pay-phase1.spec.ts`, inside `if (!alreadyPaid) { … }` immediately after the payments screen loads and before the checkout link is clicked (`:75`):

```ts
    // F-G4-64 — งวดที่ 1 cannot be created until the applicant accepts the
    // quotation. This is a real press on the real card, not a DB nudge: the
    // whole point of the gate is the human act it records.
    const quotationCard = page.getByTestId('quotation-review-section');
    await quotationCard.waitFor({ state: 'visible', timeout: 60_000 });
    const acceptBtn = quotationCard.getByRole('button', { name: /ยอมรับใบเสนอราคา/ });
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click();
    } else {
      // Already accepted by an earlier run. Say so out loud — a step that
      // silently becomes a no-op is how a walk starts reporting green for work
      // it never did (the same rule this spec already applies to alreadyPaid).
      // eslint-disable-next-line no-console
      console.log('[A03] quotation already accepted by an earlier run — verifying, not re-accepting');
    }

    // The register is what is scored, not the screen.
    let quotation: { status: string; acceptedAt: string | null; accepted_by: string | null } | null = null;
    for (let i = 0; i < 10 && quotation?.status !== 'ACCEPTED' && quotation?.status !== 'INVOICED'; i++) {
      const rows = JSON.parse(g4psql(
        `SELECT status, "acceptedAt", "acceptedBy" AS accepted_by FROM quotations
          WHERE "applicationId"='${APP}' AND "isDeleted"=false ORDER BY "createdAt" DESC LIMIT 1;`));
      quotation = rows[0] ?? null;
      if (!quotation || !['ACCEPTED', 'INVOICED'].includes(quotation.status)) await page.waitForTimeout(1500);
    }
    writeFileSync(join(OUT, 'A03-quotation.txt'), JSON.stringify(quotation, null, 2));
    expect(['ACCEPTED', 'INVOICED'], 'the quotation records the acceptance').toContain(quotation?.status);
    expect(quotation?.acceptedAt, 'acceptedAt is stamped').toBeTruthy();
    expect(quotation?.accepted_by, 'the acting user is recorded').toBeTruthy();
    await shot(page, OUT, 'A03-01b-quotation-accepted.png');
```

and, after landing on the checkout page and before pressing `เริ่มขั้นตอนชำระเงิน` (`:88`):

```ts
    // Q4 — the payment-terms acknowledgment, now on this rail too. Before this
    // change no applicant had ever been shown this text (payment_slips has 0
    // rows), so this press is the first time it is actually disclosed.
    const termsBox = page.getByTestId('checkout-terms-checkbox');
    await termsBox.waitFor({ state: 'visible', timeout: 60_000 });
    await termsBox.check();
```

Finally, after the settle wait (`:120`), add the closure assertion:

```ts
    // The quotation's งวดที่ 1 instalment is stamped by settlement, and the
    // document is NOT closed yet, because งวดที่ 2 has not been billed.
    const closed = JSON.parse(g4psql(
      `SELECT status, "phase1InvoicedAt" AS p1, "phase2InvoicedAt" AS p2 FROM quotations
        WHERE "applicationId"='${APP}' AND "isDeleted"=false ORDER BY "createdAt" DESC LIMIT 1;`))[0];
    writeFileSync(join(OUT, 'A03-quotation-after-settle.txt'), JSON.stringify(closed, null, 2));
    expect(closed.p1, 'งวดที่ 1 stamped at settlement').toBeTruthy();
    expect(closed.p2, 'งวดที่ 2 not stamped yet').toBeFalsy();
    expect(closed.status, 'the quotation stays ACCEPTED until every instalment is billed').toBe('ACCEPTED');
```

- [ ] **Step 2: Add the terms tick and the closure assertion to a05**

In `apps/web-app/e2e-g4/a05-pay-phase2.spec.ts`:

- **No second acceptance.** Add a comment where a03 accepts, so the absence is deliberate rather than forgotten:

```ts
    // F-G4-64 — งวดที่ 2 needs NO second acceptance: one quotation prices both
    // instalments (W14), and the gate passes on ACCEPTED. a03 pressed it.
```

- Add the identical `checkout-terms-checkbox` tick before `เริ่มขั้นตอนชำระเงิน` — the acknowledgment is per charge, so งวดที่ 2 asks again.
- After the settle wait, assert the document closes:

```ts
    const closed = JSON.parse(g4psql(
      `SELECT status, "phase1InvoicedAt" AS p1, "phase2InvoicedAt" AS p2, "acceptedAt" AS accepted
         FROM quotations WHERE "applicationId"='${APP}' AND "isDeleted"=false ORDER BY "createdAt" DESC LIMIT 1;`))[0];
    writeFileSync(join(OUT, 'A05-quotation-closed.txt'), JSON.stringify(closed, null, 2));
    expect(closed.p1, 'งวดที่ 1 stamped').toBeTruthy();
    expect(closed.p2, 'งวดที่ 2 stamped').toBeTruthy();
    expect(closed.status, 'every instalment billed, so the quotation closes').toBe('INVOICED');
    expect(closed.accepted, 'and it closed on a real acceptance, not a repair').toBeTruthy();
```

- [ ] **Step 3: Write C07**

Create `apps/web-app/e2e-g4/c07-quotation-gate.spec.ts`:

```ts
/**
 * G4 · C07 — the gate refuses, in Thai, and then lets the applicant through.
 *
 * Spec 4: application A4 (ffeca61c, PENDING_DOC_FEE, quotation QT-PRD-2026-000003
 * still PENDING, nothing paid — register.md A, B, Q2) presses "ชำระเงินออนไลน์"
 * BEFORE accepting. The product must refuse and say why in Thai. It then accepts
 * and the same press is allowed as far as creating the order.
 *
 * NOTHING IS PAID HERE. The spec says so, and it matters: this walk stops at the
 * created order and never authorises the PaymentIntent, so it can be re-run
 * without collecting money or moving A4 through the workflow.
 *
 * A4 IS SEEDED DATA, not something this walk creates. It reads the id from
 * C07_APP in VARS, falling back to the ffeca61c row when VARS has no entry, and
 * FAILS with a named reason when neither is present — a walk that cannot find
 * its subject must say so, not skip.
 */
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { FARMERS, pw, seg, shot, readVars, g4psql, g4Login, pickFarmer } from './g4-helpers';
import { lqaCapture } from './lqa';

const P = FARMERS[pickFarmer()];
const OUT = seg('c07');

test('C07 the pay door is shut until the quotation is accepted, then it opens', async ({ page }) => {
  test.setTimeout(300_000);
  const vars = readVars();
  const FARMER_ID = vars[`${P.varPrefix}_ID`];
  expect(FARMER_ID, `${P.varPrefix}_ID in VARS (written by a01)`).toBeTruthy();

  // The subject: an application of THIS farmer that is payable and whose
  // quotation is still PENDING. Read from the register, never assumed.
  const candidates = JSON.parse(g4psql(
    `SELECT a.id, a.status, q."quotationNumber" AS qno, q.status AS qstatus
       FROM applications a JOIN quotations q ON q."applicationId" = a.id
      WHERE a."healthId" = (SELECT "healthId" FROM applications WHERE id='${vars[`${P.varPrefix}_APP`]}')
        AND a.status IN ('SUBMITTED','PENDING_DOC_FEE')
        AND q.status = 'PENDING' AND q."isDeleted"=false
      ORDER BY a."createdAt" DESC LIMIT 1;`));
  writeFileSync(join(OUT, 'C07-subject.txt'), JSON.stringify(candidates, null, 2));
  expect(
    candidates.length,
    'no payable application with a PENDING quotation exists for this farmer — seed one before running C07',
  ).toBeGreaterThan(0);
  const APP = candidates[0].id;

  await g4Login(page, { kind: 'health', id: FARMER_ID, pw: pw(P) });

  // ── the door, shut ────────────────────────────────────────────────────────
  await page.goto(`/health/payments?app=${APP}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText(/ยอมรับใบเสนอราคาก่อนจึงจะชำระเงินออนไลน์ได้/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'ชำระเงินออนไลน์' })).toHaveCount(0);
  await shot(page, OUT, 'C07-01-pay-button-withheld.png');
  await lqaCapture(page, OUT, 'C07-withheld', [P.firstName, P.lastName, P.farmName]);

  // The backend refuses too, not only the screen: go straight to the checkout
  // URL, which is what a bookmark or a hand-typed link would do.
  await page.goto(`/health/payments/checkout?app=${APP}&milestone=M1`);
  await page.getByTestId('checkout-terms-checkbox').check();
  await page.getByRole('button', { name: /เริ่มขั้นตอนชำระเงิน/ }).click();
  await expect(page.getByText(/กรุณายอมรับใบเสนอราคาก่อนชำระเงิน/)).toBeVisible({ timeout: 60_000 });
  await shot(page, OUT, 'C07-02-backend-refuses-in-thai.png');

  // And it minted nothing.
  const noOrder = JSON.parse(g4psql(
    `SELECT count(*)::int AS n FROM checkout_orders WHERE "applicationId"='${APP}';`))[0];
  expect(noOrder.n, 'a refused checkout leaves no order behind').toBe(0);

  // ── the door, opened by the applicant's own press ──────────────────────────
  await page.goto(`/health/payments?app=${APP}`);
  const card = page.getByTestId('quotation-review-section');
  await card.waitFor({ state: 'visible', timeout: 60_000 });
  await card.getByRole('button', { name: /ยอมรับใบเสนอราคา/ }).click();

  let q: { status: string; acceptedAt: string | null; hash: string | null } | null = null;
  for (let i = 0; i < 10 && q?.status !== 'ACCEPTED'; i++) {
    const rows = JSON.parse(g4psql(
      `SELECT status, "acceptedAt", "acceptedSnapshotHash" AS hash FROM quotations
        WHERE "applicationId"='${APP}' AND "isDeleted"=false ORDER BY "createdAt" DESC LIMIT 1;`));
    q = rows[0] ?? null;
    if (q?.status !== 'ACCEPTED') await page.waitForTimeout(1500);
  }
  writeFileSync(join(OUT, 'C07-quotation.txt'), JSON.stringify(q, null, 2));
  expect(q?.status, 'the press was recorded').toBe('ACCEPTED');
  expect(q?.hash, 'and it recorded WHAT was accepted, not only that it was').toBeTruthy();
  await shot(page, OUT, 'C07-03-accepted.png');

  // The same door now opens, as far as creating the order. No payment is made.
  await page.goto(`/health/payments/checkout?app=${APP}&milestone=M1`);
  await page.getByTestId('checkout-terms-checkbox').check();
  await page.getByRole('button', { name: /เริ่มขั้นตอนชำระเงิน/ }).click();
  await expect(page.getByText(/สร้างรายการสำเร็จ รอชำระเงิน/)).toBeVisible({ timeout: 120_000 });
  // The page names the document the charge collects against.
  await expect(page.getByText(/^QT-PRD-/)).toBeVisible();
  await shot(page, OUT, 'C07-04-order-created-unpaid.png');

  const order = JSON.parse(g4psql(
    `SELECT status, milestone, quotation_id, quotation_snapshot_hash, payment_terms_version
       FROM checkout_orders WHERE "applicationId"='${APP}' ORDER BY "createdAt" DESC LIMIT 1;`))[0];
  writeFileSync(join(OUT, 'C07-order.txt'), JSON.stringify(order, null, 2));
  expect(order.status, 'created, and deliberately NOT paid in this walk').toBe('PENDING_PAYMENT');
  expect(order.quotation_id, 'the order names the quotation it collects against').toBeTruthy();
  expect(order.quotation_snapshot_hash, 'and the exact figures that were accepted').toBe(q!.hash);
  expect(order.payment_terms_version, 'the disclosure version is recorded').toBe('payment-terms-th-v1.1');
});
```

- [ ] **Step 4: Run the three walks against a live stack**

```bash
cd apps/web-app
npx playwright test --config=playwright.g4.config.ts e2e-g4/c07-quotation-gate.spec.ts
npx playwright test --config=playwright.g4.config.ts e2e-g4/a03-pay-phase1.spec.ts
npx playwright test --config=playwright.g4.config.ts e2e-g4/a05-pay-phase2.spec.ts
```

Expected: PASS, with video and trace under `evidence/g4-rebuild-2026-08-25/` (`video: 'on'`, `trace: 'on'` for every test — G4.0 rule 4). **If the stack is not up, this is PENDING, not a pass** (`CLAUDE.md` §5: work that must be proved on a real Postgres and cannot be run in the session is PENDING; do not claim it).

- [ ] **Step 5: Build the view-pack**

Tier B/C UI work requires a view-pack whose weight is at least the test log (`CLAUDE.md` §5, HARNESS.md §4.4). Collect the C07 screenshots (`C07-01` refusal, `C07-02` Thai message, `C07-03` acceptance, `C07-04` order created), the a03 acceptance shot, and the four JSON register dumps into `evidence/g4-rebuild-2026-08-25/c07/INDEX.md`, and point the work-item report's `Evidence:` line at that INDEX.

- [ ] **Step 6: Commit**

```bash
git add apps/web-app/e2e-g4/a03-pay-phase1.spec.ts \
        apps/web-app/e2e-g4/a05-pay-phase2.spec.ts \
        apps/web-app/e2e-g4/c07-quotation-gate.spec.ts
git commit -m "test(g4): the walk presses accept, ticks the terms, and C07 proves the door is shut

a03 accepts the quotation on the real card and ticks the Q4 acknowledgment, then
scores the register: acceptedAt, acceptedBy, งวดที่ 1 stamped and the document
still open. a05 ticks the terms again, accepts nothing again, and watches the
document close. C07 presses pay before accepting on a still-PENDING quotation,
gets the Thai refusal from both the screen and the backend, proves no order was
minted, then accepts and gets as far as a created, unpaid order bound to the
hash of what was accepted.

Refs F-G4-64 spec 4."
```

---

### Task 12: Every test the spec §4 names, with the exact change

Spec §4 lists the suites that break: `stripe-checkout-engine.test.js`, `checkout-vat-line-names-its-base.test.js`, `checkout-renewal-price.test.js`, `settle-event.test.js`, `settlement-binds-receipt-number-to-invoice.test.js`, `settlement-reconcile.test.js`, `quotation-gate-phase1-slip.test.js`, e2e `a03`, `a05`. Verification at HEAD adds four more that the spec did not name. Each is listed with the exact edit; the ones folded into an earlier task say so.

**The trap that makes this list load-bearing** (synthesis.md §5(ก).7): the gate catches a lookup failure and re-throws it as `QUOTATION_GATE_UNAVAILABLE`. A `mockDb` with no `quotation` model raises a `TypeError` inside that lookup, so **a stale mock fails in the shape of a policy refusal**, which reads as "the gate is working". Every checkout mock below must gain the model, not just a stub return.

| # | File | Exact change | Done in |
|---|---|---|---|
| 1 | `apps/backend/__tests__/unit/stripe-checkout-engine.test.js` | Add `quotation: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() }` to `mockDb` (`:51-67`). Add `jest.mock('../../services/quotation-service', …)` returning an ACCEPTED PLATFORM row with an `acceptedSnapshot` matching the 5,885 breakdown. Every `createCheckoutForApplication(...)` call (`:178`, and the re-entry/M2/renewal cases below it) gains `paymentTermsAccepted: { version: 'payment-terms-th-v1.1', acceptedAt: new Date().toISOString() }`. In the settle describes, add `quotationId: 'qt-1'` to `pendingOrder()` (`:107-124`) and `jest.mock` `recordPhaseInvoiced`. | T5 step 6 + T6 step 9 |
| 2 | `apps/backend/__tests__/unit/checkout-vat-line-names-its-base.test.js` | Same three additions (`mockDb.quotation` at `:33-39`, the quotation-service mock, `paymentTermsAccepted` on the single call at `:69-73`). The assertions about the VAT caption and the 385 amount are unchanged — this suite must keep proving the caption after the gate, not instead of it. | T5 step 6 |
| 3 | `apps/backend/__tests__/unit/checkout-renewal-price.test.js` | Same, plus the renewal quotation mock must carry a **PHASE_2-only** `installments`/`acceptedSnapshot` at the renewal price (35,310 per scope), or the drift check will refuse the very case this suite exists to pin. Its three existing `quotation` mentions are comments at `:18-21` — replace them with the real mock. | T5 step 6 |
| 4 | `apps/backend/__tests__/unit/settle-event.test.js` | Add `jest.mock('../../services/quotation-service', () => ({ recordPhaseInvoiced: jest.fn(async () => null) }))` and the audit-logger mock. Add `quotationId: null, applicationId: 'app_1', organizationId: 'org_1'` to `pending` (`:7-8`). The four existing assertions are unchanged: the point is that the close cannot alter any of them. | T6 step 9 |
| 5 | `apps/backend/__tests__/unit/settlement-binds-receipt-number-to-invoice.test.js` | Same two mocks; add `quotationId: 'qt-1'` to `pending` (`:25-27`). Assert additionally that `recordPhaseInvoiced` was called with `invoiceNumber: 'N1'` — the receipt number and the quotation stamp must name the same document. | T6 step 9 |
| 6 | `apps/backend/__tests__/unit/settlement-reconcile.test.js` | It mocks the whole settlement service (`:53-56`), so nothing about the close reaches it. Add `recordPhaseInvoiced: jest.fn()` to the quotation-service mock **only if** the job file starts requiring it; verify with `grep -n "quotation" apps/backend/jobs/settlement-reconcile-job.js` first and make no change if that returns nothing. | T6 step 9 |
| 7 | `apps/backend/__tests__/unit/quotation-gate-phase1-slip.test.js` | Rewritten in full. Three cases (`fails open`, `unclassifiable serviceType is skipped`, `PLATFORM side isolation`) asserted behaviour this change deletes and are replaced by refusal cases. | T3 step 10 |
| 8 | `apps/backend/__tests__/unit/quotation-service.test.js` | `markQuotationAccepted` calls at `:354` and around `:377` now need `snapshot: quotationService._internals.buildAcceptanceSnapshot(row)`, or they throw `SNAPSHOT_REQUIRED`. `markQuotationInvoiced` assertions are untouched — that function stays and stays tested; settlement simply no longer uses it. | T4 step 10 |
| 9 | `apps/backend/__tests__/integration/quotation-accept-to-phase1-gate-flow.test.js` | Its `markQuotationInvoiced` use at `:176` still works. Its accept step needs the snapshot argument. It is DB-backed: if it reports the same skip verdict as on `main`, that is the baseline, not a pass — say which you got. | T3 step 11 |
| 10 | `apps/web-app/src/app/health/payments/__tests__/payments-checkout-entry-needs-debt.test.tsx` | Its fixtures must supply an ACCEPTED quotation, or its "with debt, the button renders" case now fails for the new reason and hides the old assertion. Add the quotation to the harness the two files share. | T8 step 8 |
| 11 | `apps/web-app/src/app/health/payments/checkout/__tests__/checkout-states.test.tsx` | Every press of `เริ่มขั้นตอนชำระเงิน` must first `check()` `checkout-terms-checkbox`, since the button is now disabled until it is ticked. The VERBATIM MONEY assertions and the `HAPPY_NON_SUMMING` fixture case are unchanged. | T8 step 12 |
| 12 | `apps/web-app/src/app/health/payments/checkout/__tests__/checkout-page-flag-guard.test.tsx` | No change expected (it asserts the flag guard before the form renders). Run it to confirm; if the guard renders the terms block, adjust the query, not the guard. | T8 step 12 |

**Discovered at HEAD, not named by the spec** — these also touch the changed surface and must be run and fixed if red:

| File | Why it is at risk |
|---|---|
| `apps/backend/__tests__/unit/single-issuer-end-to-end-figures.test.js` | Feeds `{ scopeCount }` by hand (`:147`) — the argument the real checkout path does not pass. It is the closest thing to a drift test and must keep passing unchanged. |
| `apps/backend/__tests__/unit/single-issuer-frozen-quotation.test.js` | Asserts a pre-W14 pair is not re-priced. `issueQuotationsForApplication` gains an optional `notes`; the assertion on the created data must still hold. |
| `apps/backend/__tests__/unit/quotation-pdf-per-type.test.js` | `generateQuotationPdf` gains an optional `quotationRow`; with none passed the legacy path must be byte-identical. |
| `apps/backend/__tests__/unit/money-equation-property.test.js` | Nothing in this change touches the formula. If it moves, the change is wrong — treat a failure here as a stop, not a fix-the-test. |

- [ ] **Step 1: Run the full backend suite twice and compare against the baseline**

```bash
cd apps/backend
NODE_OPTIONS=--max-old-space-size=3072 npx jest --ci 2>&1 | tail -40
STRIPE_CHECKOUT_ENABLED= NODE_OPTIONS=--max-old-space-size=3072 npx jest --ci 2>&1 | tail -40
```

The full suite is red on `main` for unrelated reasons (memory: `gate-cannot-pass-use-baseline`), so the bar is **no NEW failures**: capture `main`'s failing list first from a clean tree, and diff. The 3 GB heap is required or the run OOMs; `pdf-ssrf` always times out locally and is part of the baseline.

- [ ] **Step 2: Run the full web-app payment surface**

```bash
cd apps/web-app
npx jest src/app/health/payments src/components/payments src/app/health/applications
npx eslint . --max-warnings=0
```

- [ ] **Step 3: Run the local gate and the probe gate**

```bash
cd "$(git rev-parse --show-toplevel)"
bash scripts/ci/local-gate.sh
```

Expected: `banned-terms`, `mojibake`, `green-mask`, `probe-gate` all PASS. `probe-gate` additionally runs the `ci` probe set, which includes `ratchet` — **Global Constraint 6: the hardcode / dup-source / todo / env-direct / skip counters must not rise.** If `ratchet` reports an increase, find which file did it and remove the cause; raising the baseline is operator-only (L6) and is not a fix.

- [ ] **Step 4: Commit the test-only changes not already committed with their task**

```bash
git add apps/backend/__tests__ apps/web-app/src
git commit -m "test: bring every suite the quotation gate touches onto the new contract

The checkout mocks gain the quotation model deliberately: the gate converts a
missing-model TypeError into QUOTATION_GATE_UNAVAILABLE, so a stale mock fails
in the shape of a working policy and reads as a pass.

Refs F-G4-64 spec 4."
```

---

## Self-Review

Run against the spec with fresh eyes, per the writing-plans skill.

**1. Spec coverage — every requirement mapped to a task**

| Spec | Task |
|---|---|
| R1 acceptance is the precondition on every rail, fail-closed | T3 (gate + slip rail), T5 (card rail) |
| R2 charge equals the accepted snapshot to the satang | T4 (snapshot + hash), T5 (comparison + `CHECKOUT_PRICE_DRIFT` + audit row) |
| R3 issuance awaited and loud | T7; renewal issuance T3 |
| R4 Q4 consent on the card rail; the document prints real figures | T5 (backend), T8c (screen), T9 (document) |
| R5 repair the three existing rows honestly; create nothing for A2 | T10 |
| §3.1 gate module, four codes, `PAYABLE_STATES.M1` drops DRAFT, renewal proof | T2, T3, T5 |
| §3.2 migration, snapshot, hash, `markQuotationAccepted`, API/PDF read the row, drift, order binding | T1, T4, T5 |
| §3.3 post-commit close, milestone-qualified INVOICED, never throws, probe | T6 |
| §3.4 await + fail loud + audit + admin notification + controlled self-heal | T7 |
| §3.5 slot 10, pay button, checkout page, keep the public copy | T8 (the `pricing/page.tsx:48` and `th-wizard.ts:274` strings are deliberately untouched — they now describe the truth) |
| §3.6 v1.1 figures + version string + the six error codes; ม.77/1(10) NOT touched | T9, T2 (and T9 states the exclusion explicitly) |
| §3.7 repair script, dry-run default, `--apply --expect=2`, FE label | T10, T8d |
| §4 six RED proofs | 1, 2, 4 → T5 step 1; 3 → T6 step 2; 5 → T6 step 1; 6 → T8a step 1 |
| §4 walks and broken suites | T11, T12 |
| §5 what this does not fix (F-G4-67 / 68 / 69 / 70) | Recorded where the code touches them: F-G4-69 in T7's self-heal comment and audit metadata, F-G4-70 surfaces as `CHECKOUT_PRICE_DRIFT` in T5, F-G4-68 in T10's header, F-G4-67 excluded explicitly in T9 |

No gap found.

**2. Placeholder scan**

Searched for TBD / TODO / "implement later" / "add error handling" / "similar to Task N" / "write tests for the above". None present: every code step carries the actual code, every test step the actual test body, every command the actual invocation. The four `--apply` and `migrate deploy` steps are deliberately *not* code the implementer runs — they are labelled operator steps with the exact command written out, which is the L3 requirement, not a placeholder.

**3. Type consistency across tasks**

- `assertQuotationAcceptedForPayment({ applicationId, milestone, client })` → `{ quotation, phase, snapshot }` — defined T3, consumed T5 (both fields used), name identical in both.
- `MILESTONE_TO_PHASE` — defined T3, imported by T5's drift check. `recordPhaseInvoiced` deliberately keeps its own private `MILESTONE_PHASE` map inside `quotation-service` rather than importing from `services/billing/`, because `quotation-gate` requires `quotation-service` and the reverse import would close a cycle. Two three-line frozen maps is the lesser evil; noted here so a reviewer does not read it as a duplicated source.
- `buildAcceptanceSnapshot(row, opts)` / `canonicalSnapshotHash(snapshot)` — defined T4, exported both at top level (used by the route in T4 and by T5's tests) and on `_internals` (used by T4's own tests and T12 item 8). Both names identical everywhere.
- `markQuotationAccepted(id, { acceptedBy, acceptedAt, snapshot, tx })` — T4; the T12 item 8 fix uses exactly this shape.
- `recordPhaseInvoiced({ quotationId, applicationId, milestone, invoiceNumber, at, tx })` → `{ quotationId, phase, closed, status } | null` — defined T6, called by T6's settlement hook with the same key names, mocked with the same shape in T12 items 4-6.
- `issueQuotationOnSubmit({ application, actorId })` → `{ issued, error? }` and `ensureQuotationForIssuedApplication({ application, actorId, reason })` → `{ dtam, platform }` — defined T7, used at both submit doors and the GET route.
- `labelForMethod` (not `methodLabel`) — corrected to the real export at `quotation-line-items.js:33,:96`.
- `PAYMENT_TERMS_VERSION = 'payment-terms-th-v1.1'` — one literal, in `checkout-service.ts` (T8), matching the document heading (T9), the value stored in `checkout_orders.paymentTermsVersion` (T5), and the C07 assertion (T11).
- Column names: `quotationId` / `quotationSnapshotHash` / `paymentTermsVersion` / `paymentTermsAcceptedAt` are Prisma field names mapped to `quotation_id` / `quotation_snapshot_hash` / `payment_terms_version` / `payment_terms_accepted_at`; the migration SQL and the raw-SQL walk queries (T11, and the probe in T6) use the snake_case forms, everything in JS uses the camelCase forms. `quotations` keeps camelCase columns (`phase1InvoicedAt`, quoted in SQL) because that table already does.

---

## Contradictions and judgment calls found against HEAD

Listed rather than silently resolved. Where this plan had to choose, it says which way and why; the operator can overrule any of them.

1. **The probe cannot be a `.js` file.** Spec §3.3 asks for `scripts/probes/quotation-closure.js`. `scripts/ci/probe-gate.js:137-138` enumerates `scripts/probes/*.sh` only, and every one of the 20 probes on disk is a shell script sourcing `_lib.sh` for its `pass`/`fail`/`blocked` exit contract. A `.js` file in that directory would be invisible to the registry rule — a checker nobody decided about, which is the exact bug that rule exists to prevent. **This plan writes `quotation-closure.sh`.**
2. **Two payment-terms version namespaces.** Spec §3.6 says the consent cites `payment-terms-th-v1.1`. The existing Q4 gate compares against `ConsentVersions.PAYMENT_TERMS`, which is `'1.0.0'` unless `CONSENT_VERSION_PAYMENT_TERMS` is set (`middleware/consent-manager.js:50-64`), and stores the grant in `UserConsent`. The spec's card rail stores a different string in a different place (`checkout_orders.paymentTermsVersion`). **This plan implements the spec** — the order-level column records the disclosure that authorised THIS charge, which the slip rail's per-user consent does not — but the two ledgers and the two version namespaces now coexist and can disagree. An operator ruling on whether the card rail should also write a `UserConsent` row, and whether `CONSENT_VERSION_PAYMENT_TERMS` should be set to `payment-terms-th-v1.1`, would close it.
3. **Task order versus safety order.** The task numbering puts the fail-closed card gate (T5) before the issuance fix (T7), while the research (`synthesis.md` §5(ก).6) and the spec's own §3.4 say the gate is unsafe without it. **This plan keeps the numbering for reviewability and states that T5 and T7 must land in the same branch and the same operator merge.** If they are to be merged separately, T7 must go first.
4. **A renewal is not quoted at all — now verified, no longer UNVERIFIED.** Spec §3.1 flags this as unverified. At HEAD `grep -rn "quotation" apps/backend/services/renewal-service.js` returns zero lines, and the only two `issueQuotationsForApplication` callers are the two submit doors, neither of which a renewal passes through. **Without T3 step 4, this change blocks every renewal payment on both rails.**
5. **Re-entry gating is a judgment call the spec does not make.** Spec §3.1 says the gate runs "before `adapter.assertReady()` and before touching the DB", which in the current code is also before the re-entry lookup. **This plan gates re-entry too**, so an order minted during the drain window cannot be used as a bypass. The cost is real: an applicant holding an unpaid pre-gate order must accept the quotation before returning to it. If the operator prefers the drain window to stay open, move the gate below the `checkoutOrder.findFirst` and say so in the ruling.
6. **`Quotation` was never registered as tenant-scoped.** Not mentioned anywhere in the spec. `TENANT_SCOPED_MODELS` (`tenant-prisma-extension.js:68-172`) lists `Quote` but not `Quotation`, though `Quotation.organizationId` is NOT NULL. **T1 registers it.** Note the behavioural consequence: under `TENANT_READ_ORG_SCOPE` the model's reads become org-filtered. The one writer already passes `organizationId` explicitly, so no write path changes — but this is a live-behaviour change on a money table and belongs in the Tier C review, not in a footnote.
7. **`PAYMENT_TERMS_NOT_ACCEPTED` already exists** at `error-codes.js:2452` with `httpStatus: 409` and a `source` of `payment-slip-service.js:503` (the function is at `:517`). Spec §3.6 lists it among the codes to add. **T2 corrects the existing row rather than adding a duplicate** — a duplicate key would fail `error-codes-catalog.test.js`.
8. **The spec's Thai for `QUOTATION_NOT_ISSUED` tells the applicant to press refresh on a screen that had no refresh button.** The string is kept verbatim (§3.1), and T8a adds the button it refers to. Without that, the copy names an action the product does not offer, which the thai-ui-copy rules forbid.
9. **C07's subject is seeded data.** Spec §4 pins C07 to application `ffeca61c` (A4). A fresh database has no such row, and the walk config runs against whatever the stack is pointed at. **The C07 spec here queries for a payable application of the walk's own farmer with a PENDING quotation and fails with a named reason when none exists**, rather than hard-coding an id that will not survive a reseed. If the operator wants the literal A4 row, pass it through `VARS` as `C07_APP`.
10. **`markQuotationInvoiced` survives but has no production caller.** Spec §3.3 replaces its role with `recordPhaseInvoiced`. It stays exported and tested (`quotation-service.test.js:354,377`, `quotation-accept-to-phase1-gate-flow.test.js:176`). Deleting it is a separate, safe cleanup; leaving a second way to write `INVOICED` on the money path is a small standing risk, and the grep guard in T6's second test is what keeps it out of the settle transaction.

## Coordinator rulings on the contradictions (2026-08-28, binding for execution)

1. Probe is `scripts/probes/quotation-closure.sh` (with `--selftest`), registered per L6 — accepted.
2. **One consent namespace.** Reuse the existing Q4 mechanism: `ConsentVersions.PAYMENT_TERMS` + `UserConsent` + the slip gate's assertion, called from `createCheckoutForApplication`. The checkout page collects consent through the same consent API the slip modal uses. `checkout_orders` records the consent version it was created under (`paymentTermsVersion`, the value of `ConsentVersions.PAYMENT_TERMS` at that moment) and `paymentTermsAcceptedAt` copied from the UserConsent row — no second version string. Publishing `payment-terms-th-v1.1.md` bumps `ConsentVersions.PAYMENT_TERMS` (the env-driven value) so every applicant re-consents once; T9 states the exact value and where it is set.
3. **Execution order is T1, T2, T3, T4, T7, T5, T6, T8, T9, T10, T11, T12** (issuance fails loud before the fail-closed gate exists). Same branch, one operator merge.
4. Renewal issuance at renewal creation — accepted as specified in T3.
5. **Re-entry is gated too.** A PENDING_PAYMENT order for an application whose quotation is not accepted cannot be re-entered until it is; T5 counts and logs such orders (the drain window) before the gate goes live, and C07 covers the case.
6. Register `Quotation` in `TENANT_SCOPED_MODELS` — accepted; T1 names it as a live-behaviour change in its report.
7. Correct the existing `PAYMENT_TERMS_NOT_ACCEPTED` entry in place; do not duplicate.
8. The refresh button T8a adds is required, not optional.
9. C07 queries for its subject and fails by name — accepted.
10. `markQuotationInvoiced` stays exported with its tests; `recordPhaseInvoiced` is the only production writer of INVOICED — accepted.
11. **(T4 review F5, 2026-08-28) The quotation PDF and the quotations API render the STORED ROW's figures** (a W14 PLATFORM row prints 5,885 per phase-1 scope, never 885). Global Constraint 2 ("no formula change") governs what is CHARGED (modules/billing, fee-service — byte-identical); rendering the stored row is Task 4's stated goal. Pre-W14 rows keep their per-side figures because that is what those rows store.
12. **(T4 re-review N1, 2026-08-28) The number of lines on the document comes from the row's own `scopeCount`, never from the application's current cultivation methods.** When the application's method count differs from the row's scopeCount (a revision changed the scope after issuance — quotations are issued once), the API answers `scopeMismatch: true` with the row-derived lines labelled generically ("รูปแบบการปลูกที่ n") and the PDF renders the row; the charge-side consequence is caught separately by the R2 drift gate (T5) and the open F-G4-70. Fixtures must include the mismatch case in both directions.
