---
name: thai-ui-copy
description: Thai copy + typography rules for GACP user-facing text. Use when writing or reviewing any Thai UI string, label, or message.
---

# Thai UI Copy Rules

Canonical sources: `DESIGN.md` (Named Rules), `docs/i18n-policy.md` (Policy 5),
`docs/audit-reports/2026-07-23-jobs-bar-quality-audit.md` §3 (defects these rules remediate).

## Register

- Address the user as **คุณ** in polite-neutral register everywhere in the UI
  (reference: `docs/i18n-policy.md` Policy 5; real example carrying คุณ:
  `apps/web-app/src/lib/i18n/dictionaries/sections/th-provider.ts` → `noAccessHint`,
  "บัญชีของคุณไม่มีสิทธิ์ใช้เครื่องมือนี้").
- Reserve **ท่าน** for legal/PDPA surfaces only (privacy policy, terms, erasure requests -
  see `apps/web-app/src/app/(marketing)/privacy-policy/page.tsx` "ข้อมูลส่วนบุคคลของท่าน").
- Never mix registers on one page. Never use slangy CTA copy ("ลุยเลย!") - the
  2026-07-23 audit flagged ท่าน/คุณ + "ลุยเลย!" mixing as a defect.

## Punctuation and spacing

- No em dashes (—) in Thai copy. Separate clauses with a space, as Thai does natively:
  "คำขอนี้ถูกล็อกชั่วคราว รีเฟรชหน้าจอแล้วลองอีกครั้ง".
- Space before ๆ (ไม้ยมก), per Royal Institute style: "บ่อย ๆ" not "บ่อยๆ".
  Pick this one convention repo-wide; the audit found two competing ๆ conventions shipped.
- Space between Thai and Latin words: "ของ GACP" not "ของGACP". The audit flagged
  "ของGACP Thaiฯ" run together as a defect.

## Dates

- All user-facing dates are Buddhist era via the shared helper
  `apps/web-app/src/lib/format/thai-date.ts` (`formatThaiDate`, `thaiDayOfMonth`).
- Never call `new Date(x).toLocaleDateString('th-TH')` inline: on null/invalid input it
  renders the epoch "1/1/2513" (this leaked onto staff screens and financial CSVs).
- Do not add another date helper. The audit found three competing helpers plus a
  Gregorian-date leak on the trace page (`trace/[qr-code]/client-view.tsx`).
- Ten inline `toLocaleDateString('th-TH')` calls remain under `src/` (2026-11-03), the trace
  page among them. Do not copy them; move any file you touch to `formatThaiDate` in the same
  change.
- Business dates are Bangkok time (`THAI_TIME_ZONE` in `thai-date.ts`, operator 2026-09-26),
  never the machine's zone.

## Typography (hard rules, lint-enforced)

- NEVER apply `tracking-wide`/`tracking-wider`/`tracking-widest`, `uppercase`, or
  `font-black` to elements rendering Thai text.
  - `DESIGN.md` "No-Tracking-On-Thai Rule": positive letter-spacing detaches
    sara/วรรณยุกต์ from base glyphs.
  - `apps/web-app/src/styles/globals-premium.css` (table headers) documents why
    letter-spacing is intentionally omitted on predominantly-Thai headers.
  - ESLint rule `apps/web-app/eslint-rules/no-thai-letterspacing.js` enforces it:
    Sukhumvit Set tops out at 700/Bold, so `font-black` (900) forces a synthesized
    weight that distorts Thai glyphs. Use `font-bold`.
- Negative tracking (`tracking-tight`) is allowed; tracking on short uppercase
  Latin-only labels is allowed.

## Structure and voice

- Bilingual heroes pair a Thai headline with an English subline, e.g.
  "ยกระดับมาตรฐานสมุนไพรไทย สู่สากล" / "Elevating Thai Herbal Standards to Global
  Quality" (`src/lib/i18n/dictionaries/sections/th-core.ts` + `en-core.ts`).
- Error states name the cause and the next action, never a bare apology:
  - Good: "คำขอนี้ถูกล็อกชั่วคราว รีเฟรชหน้าจอแล้วลองอีกครั้ง"
  - Bad: "ขออภัย เกิดข้อผิดพลาด"
  - Never claim a definitive bad state on a fetch failure: the public verify page
    showed "ใบรับรองไม่ถูกต้อง" on network errors; use an indeterminate state
    ("ไม่สามารถตรวจสอบได้ในขณะนี้") with a retry action instead.
- Error codes stay English machine identifiers; the Thai message maps from them via
  `apps/web-app/src/lib/i18n/error-code-map.ts` (`docs/i18n-policy.md` Policy 5).

## Facts come from one place

- Copy that states a service fact (certificate validity, renewal reminders and window,
  payee, payment channel, CAR deadline, refunds) takes it from
  `apps/web-app/src/constants/service-facts.ts`. Each entry there mirrors a backend value,
  pinned by `apps/backend/__tests__/unit/frontend-service-facts-mirror.test.js`. A claim
  with no backend record behind it is removed from the page, not reworded.
- Contact mailboxes (support@, privacy@, finance@) come only from
  `apps/web-app/src/constants/contact-emails.ts`;
  `src/__tests__/truthful-copy/contact-emails-one-source.test.ts` fails if another file under
  `src/` spells them. Email stays as contact data; only 2FA, password reset and password
  change moved to หมอพร้อม (operator 2026-09-26).
- A page that shows one certificate states that certificate's own issue-to-expiry span
  (`app/health/certificates/validity-years.ts`), never the generic constant.
- The only payment channel is PromptPay; cards are not accepted (operator 2026-10-06). Payment
  copy names no payment provider: the terms say "ผู้ให้บริการรับชำระเงิน" and nothing more
  (operator 2026-09-27).
- Never write that data stays in Thailand only, and never cite a data-residency rule (memory
  `retired-residency-rule-stays-retired`).
- Never claim more than the system does (order 154). The source's should-wording is
  "ข้อแนะนำ", and no level is called "ข้อบังคับ" (see `gacp-standards-requirements`).
  Automated checks never say "ผ่าน": the pre-check uses "ไม่มีข้อสังเกต / ข้อสังเกต /
  ตรวจเอง", and a slot the system did not check says plainly that it was not checked.
  บพข. is the funder only; never write that data goes to บพข.

## Words for users

- The applicant (`health`) is บุคคลทั่วไป or ผู้ยื่นคำขอ. Never translate it as เกษตรกร
  (a juristic person can hold the certificate) or as สุขภาพ.
- The `provider` role is เจ้าหน้าที่ (or เจ้าพนักงาน). Never call that role ผู้ให้บริการ.
  This rule covers the role word only: the payment phrase "ผู้ให้บริการรับชำระเงิน" above
  stays allowed.
- Role names follow `shared/canonical-rbac.js` and the Thai words the operator approved
  (ผู้ตรวจเอกสาร, ผู้จัดคิว, ผู้ตรวจพื้นที่, ผู้อนุมัติ, ...). The DTAM side and the company
  side have separate role words. English identifiers never change (memories
  `role-words-health-and-provider`, `role-vocabulary-three-sides`).

## Checklist before shipping Thai copy

1. Register consistent (คุณ; ท่าน only if legal/PDPA).
2. No em dash; space before ๆ; space at Thai/Latin boundaries; no emoji (memory
   `no-emoji-in-design-deliverables`).
3. Dates via `formatThaiDate`; no inline `toLocaleDateString('th-TH')`.
4. No tracking-*/uppercase/font-black on Thai elements (run `pnpm lint` in `apps/web-app`).
5. Errors state cause + next action.
6. Every stated fact reads from `service-facts.ts` / `contact-emails.ts`; no payment provider named.
7. No claim beyond what the system does (order 154): no "ผ่าน" for automated checks, unchecked
   slots say so, บพข. only as funder.
