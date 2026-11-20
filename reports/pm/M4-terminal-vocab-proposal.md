# M4 prerequisite — unified `closedReason` vocab proposal (operator approves before migration)

**Owner:** PM/Senior · **Date:** 2026-08-05 · **Status:** PROPOSAL — awaiting operator approval before the schema migration is written (operator's M4 condition: survey vocab → propose enum → approve → migrate).
**Method:** read-only survey of all terminal-close writers + state machine + audit schema.

---

## 1. What exists today (the scattered vocab the operator flagged)

Three different axes, none unified, one internally inconsistent:

| axis | current values | where |
|---|---|---|
| Application **terminal status** | `REJECTED`, `EXPIRED`, `CANCEL_EXPIRED`, `CERTIFIED` (+ `CANCELLED` as a checkout/sub state) | `application-status-writer.js:131-135` (TERMINAL_STATUSES) |
| **RevisionDeadline.status** | checker writes `EXPIRED`; guard + `/auto-cancel` write `FAILED`; `audit.prisma` comment lists `…, EXTENDED, FAILED` — **omits EXPIRED** | `revision-deadline-checker.js:159` vs `cron.js:296` / `revision-deadline-guard.js:124` vs `audit.prisma:125` |
| **close REASON** (why terminal) | ad-hoc JSON `formData._autoExpired.reason` with **TWO variants**: `REVISION_DEADLINE_EXCEEDED` and `REVISION_DEADLINE_EXPIRED` | `revision-deadline-checker.js:196-204` |

There is **no `closedReason` field** anywhere. So "why did this application close" is un-queryable, inconsistent, and audit doesn't know the checker's `EXPIRED`. This is exactly the "vocab that doesn't align to one standard" the operator wants to prevent M4 from adding to.

## 2. Proposed unified `closedReason` (the single place)

A **new nullable, indexed `closedReason` column on `Application`**, set **only** when an application reaches a closed/terminal state, carrying the canonical REASON. This is the **reopen-eligibility key** mechanism 2 will query.

**Column form (recommend):** `String?` + `@@index([closedReason])` + a documented value set (matches the repo's status-as-String convention, e.g. `audit.prisma:125`), optionally a DB `CHECK` constraint like `correction_rounds` used. (Alternative: a Prisma `enum` for DB-level strictness — stricter but every new value needs an enum migration. Recommend String+documented-set for extensibility; operator decides.)

**Value set (v1):**

| value | meaning | who sets it | reopen-eligible? |
|---|---|---|---|
| `CORRECTION_DEADLINE_EXPIRED` | R2 cron closed the case: revision/correction deadline (5 business days) passed | **M4 (this task) — `revision-deadline-checker.js` only** | ✅ **YES** (mechanism 2 keys on this) |
| `REJECTED_DOC_REVIEW` | rejected during document review | (backlog — reviewer reject path) | no |
| `REJECTED_AUDIT` | rejected after field audit | (backlog — auditor reject path) | no |
| `CANCELLED_BY_APPLICANT` | applicant cancelled | (backlog) | no |
| `CANCELLED_BY_ADMIN` | admin/officer cancelled | (backlog) | no |
| `PAYMENT_ABANDONED` | 30-day unpaid auto-close | (reserved — **M5**) | no |
| `LEGACY_AUTO_CANCEL` | the pre-M4 `/auto-cancel` + guard `FAILED` closes | (reserved — backlog; distinguishes them so they are **NOT** reopen-eligible) | no |

**Scope discipline (operator's rule):** **M4 wires only `CORRECTION_DEADLINE_EXPIRED`.** The other values are *reserved slots* so the vocab lives in one place; the 4 legacy writers + `/auto-cancel` stay out of M4 (BACKLOG) and simply leave `closedReason` null (or a later task sets `LEGACY_AUTO_CANCEL`). This is what makes the **marker-specificity** negative case real: only the genuine deadline-expired cron path gets `CORRECTION_DEADLINE_EXPIRED`; every other terminal close does **not** → mechanism 2 won't reopen the wrong cases.

**Fixes folded in (no new clashing vocab):** M4 replaces the ad-hoc `_autoExpired.reason` (two variants) with the single canonical `closedReason=CORRECTION_DEADLINE_EXPIRED`. The `RevisionDeadline.status` EXPIRED-vs-FAILED split + the `audit.prisma` comment gap are noted here; aligning them (making the comment list EXPIRED, or standardizing the deadline-row terminal value) is a small adjacent cleanup M4 can include or defer — operator's call.

## 3. Sequencing (RED-first, real Postgres)

1. **(this doc) approve the enum** ← operator here.
2. **Migration** (EXPAND, additive): add `Application.closedReason String?` + index. Tier C schema → draft PR. Safe on a populated DB (nullable, no backfill).
3. **RED test** (real Postgres integration, self-seeding per the 2 existing suites): assert the 4 confirmed negative/positive cases — over-close guard, marker specificity, audit +1/+0, idempotency (run cron **twice**, delta round 2 = 0). Wire into `ci.yml` testPathPattern + bump the real-Postgres suite-count guard **4→5**. Push → **CI RED** (cron doesn't populate `closedReason`/audit yet) → paste the failing output.
4. **GREEN**: wire `closedReason=CORRECTION_DEADLINE_EXPIRED` + the `onAudit` hash-chain hook into `revision-deadline-checker.js` → CI green.
5. M4 done = draft PR (Tier C) → operator merges. Then M5.

## 4. Decision needed from operator

1. **Approve the `closedReason` value set** (§2) — add/rename/remove any value.
2. **Column form**: String+documented-set+index (recommended) or Prisma enum.
3. **Adjacent cleanup**: fix the `RevisionDeadline.status` EXPIRED/FAILED split + audit.prisma comment now (in M4) or defer to backlog?
