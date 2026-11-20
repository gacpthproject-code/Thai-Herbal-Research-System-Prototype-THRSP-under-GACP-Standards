# Onsite Evidence-Capture — End-to-End Integration Fix (Design)

**Date:** 2026-08-17
**Status:** Design — pending operator review → writing-plans
**Tier:** C (audit / evidence / cert-issuance / identity — operator merges). Reviewer #2 applies to the cert-affecting parts.
**Origin:** Follow-up to the cert-integrity fix (A+A2+B, main 2026-08-16). Two adversarial grills (data-model lens + FE/flow lens, 2026-08-17) both returned **BROKEN**: the onsite inspect capture feature — the only UI that writes BOTH the photos and the checklist the cert gate reads — was built but never integrated end-to-end, and no code path creates the `AuditChecklist` row everything keys off. Net today: **no GACP certificate can be issued through the product** (the gate is un-satisfiable).

---

## 1. Problem (verified in code)

The cert gate `services/onsite-evidence-gate.js` requires, for an application: a most-recent `AuditChecklist` (`:60-63`), `FarmAuditPhoto` count ≥ min keyed `{ auditId: audit.id }` (`:81`), and `FarmAuditChecklistItem` count ≥ template length keyed `{ auditId: audit.id }` (`:90`). "audit" everywhere = `AuditChecklist` — `FarmAuditPhoto.auditId` and `FarmAuditChecklistItem.auditId` are FK relations to `AuditChecklist.id` (`prisma/schema/audit-onsite-evidence.prisma:31,77`). The only writers are `audit-onsite-service.js` `uploadPhoto` (`:662`) and `submitChecklistItem` (`:544`), reached via `/api/audit/onsite/:auditId/{photo,checklist}`.

The capture flow is broken at every boundary between it and the backend:

| # | Break | Evidence | Gate-blocking? |
|---|---|---|---|
| B1 | **No product path creates the `AuditChecklist` row** — the only creator (`controllers/audit-checklist-controller.js:181`, `POST /provider/applications/:id/checklist`, `requireApplicationOwner`) has ZERO FE callers; scheduling/assign never creates it. Resolver returns null for every real app. | grill×2; `provider-api.ts:38` unused | **Yes** |
| B2 | **Wrong key** — the inspect route `[id]` is the applicationId (list `audits/client-view.tsx:427,503`; detail `[id]/page.tsx:57`) but `inspect/page.tsx:31` passes it as `auditId` to all onsite calls. | confirmed | **Yes** |
| B3 | **Checklist writes always 400** — FE `submitChecklistItem` POSTs `{itemId,answer,notes,photoIds}`; BE expects `{items:[...]}` (`onsite.js:337`) → `[]` → `400 CHECKLIST_ITEMS_REQUIRED`; the only caller (30s autosave) swallows it. Field names also differ: `itemId`→`itemCode`, `answer`→`response`. | `audit-service.ts:247`, `onsite.js:337`, `client-view.tsx:150` | **Yes** |
| B4 | **Vocabulary mismatch** — checklist buttons emit `YES/NO/NA` (`ChecklistItem.tsx:60`, FE type `audit-service.ts:109`); BE requires `PASS/FAIL/NA` (`audit-onsite-service.js:526`) and throws otherwise. | confirmed | **Yes** |
| B5 | **savedAnswers resume broken** — BE emits `{itemId,response,notes,photoIds}` (`onsite.js:195`); FE reads `saved.answer`/`saved.photoUrls` (`client-view.tsx:112`) → blank on resume. | confirmed | Integrity |
| B6 | **/start GPS shape → NaN** — FE sends `{gps:{latitude,…}}` (`audit-service.ts:233`); BE destructures flat `gpsLat/gpsLng` (`onsite.js:301`) → `undefined` → `Number(undefined)=NaN`; guard `typeof gpsLat!=='number'` (`audit-onsite-service.js:446`) does NOT catch (`typeof NaN==='number'`) → NaN into `GpsVerificationLog`. Affects live + farm-coord fallback. | confirmed | Integrity |
| B7 | **/photo GPS shape + response + itemId** — same NaN into non-null `FarmAuditPhoto.gpsLatitude/Longitude` (Float; GACP-PRD §6.2); BE returns `{photoId,fileHash,attachmentId}` (`onsite.js:415`), FE expects `{photoId,url}` → broken-image icon every capture (`ChecklistItem.tsx:187`); `itemId` dropped → no `checklistItemId` linkage. Count still increments (gate not blocked). | confirmed | Integrity |
| B8 | **gps-verify dead from client** — the physical-presence fraud check `verifyGpsAgainstFarm` (`audit-onsite-service.js:263`) / `GET /:auditId/gps-verify` is never called by the FE. | confirmed | Integrity |
| B9 | **Field-tools panel trap** — the ONSITE "เครื่องมือภาคสนาม" tab (`[id]/page.tsx:432,506`) sits beside the PASS button, has NO checklist UI, and its photo path (`audit-field-tools-panel.tsx:61` `uploadAuditPhoto({auditId:applicationId})`) FK-violates (500). Can never certify. | confirmed | Trap |
| B10 | **No wire-contract test** — every inspect test `jest.mock`s `audit-service` wholesale; no `audit-service.test.ts`; the backend route test hand-fabricates a non-existent `photoIds` scalar (`audit-onsite-routes.test.js:75`). This is HOW B3/B5/B6/B7 shipped invisibly. | confirmed | Root cause |

## 2. Verified grounding (non-obvious)

- **Org model:** for a given application, scheduler/auditor operate in the **same org as the application** — `assignAuditor` enforces `schedulerOrgId === app.organizationId` (`audit-scheduling-service.js:444-445`) and finds the auditor within that org (`:471-472`). So `AuditChecklist.organizationId` = the application's org = the auditor's org; the tenant write-extension injects it on create. Authorization is by **auditorId-match** (`_ensureAuditorMatches`, `audit-onsite-service.js:380`), not org.
- **Mint is automatic + in-transaction:** a PASS `/decision` calls the gate itself (`audit-onsite-service.js:798`), transitions to `AUDIT_PASSED` via `writeApplicationStatus(tx)` (`:846`), which **auto-mints** in the same tx (`application-status-writer.js:967`) → gate runs a SECOND time (`certificate-service.js:300`). The design must treat decision→mint as one atomic path.
- **Gate is org-agnostic today** — neither caller passes an org (`certificate-service.js:300`, `audit-onsite-service.js:799`); the gate's resolver must stay behavior-identical when no org is supplied.

## 3. Design principle

**Root cause = a never-integrated feature: two sides that never agreed on the audit id, the request/response shapes, or the vocabulary — and tests that mocked the seam so nothing caught it.** The fix, in one sentence: *single-source the applicationId→auditId resolution, make every wire contract match exactly, pin the decided audit through the mint, and test at the real wire.*

## 4. Components (each an independently-testable plan task)

**Correctness core (gate-blocking):**

1. **Create the `AuditChecklist` at auditor-assignment (ONSITE).** In `assignAuditor` (or the onsite-assign path), find-or-create an `AuditChecklist` for the application with `auditorId = the assigned auditor`, `status='IN_PROGRESS'`, org via the tenant context (= app org). Idempotent (one active row per application). Fixes B1 + the wrong-`auditorId` half of B9's cause. *(Confirm the exact hook point in the plan: assign vs first inspection-start.)*
2. **Shared resolver `resolveCurrentOnsiteAuditId(prisma, applicationId, { organizationId } = {})`** — most-recent `AuditChecklist WHERE applicationId [AND organizationId] AND isDeleted=false`, preferring an `IN_PROGRESS` row. **org filter applied only when supplied** (gate passes none → behavior-identical to today). Refactor the gate (`onsite-evidence-gate.js:60-63`) to call it. Fixes B1's resolution + the I1 org trap + M1 soft-delete.
3. **Pin the decided auditId through decision → mint.** `submitDecision` already holds the `auditId` (`audit-onsite-service.js:774`); pass THAT to the gate (not applicationId) and persist it (e.g. `formData.onsiteAuditId`) so `generateCertificate` verifies the SAME row rather than re-resolving. Prevents temporal divergence (B-C2: a newer AuditChecklist between capture and mint). Resolver stays SSOT for the initial pick; the decision freezes it.
4. **`/context` by applicationId (explicit contract) + re-key savedAnswers.** New/renamed `GET /audit/onsite/application/:applicationId/context` (do NOT overload `:auditId`) that resolves via the resolver, returns the real `audit.id`, and reads `savedAnswers WHERE auditId = resolved audit.id`. Fixes B2 (read side) + B5's key.

**FE inspect wire (gate-blocking + integrity):**

5. **FE inspect uses `ctx.audit.id` for all writes** (start/checklist/photo/decision) — the route `[id]`=applicationId flows only into the context fetch. Fixes B2 (write side).
6. **Checklist write contract** — FE sends `{ items: [{ itemCode, response, notes?, photoIds? }] }`; map the UI answer `YES/NO/NA → PASS/FAIL/NA` at the FE boundary (single canonicalization point). Fixes B3 + B4.
7. **savedAnswers read contract** — FE reads `response`/`photoIds` (not `answer`/`photoUrls`) and maps back to UI vocab. Fixes B5 (read side).
8. **/start GPS contract + guard** — align FE/BE on ONE shape (recommend BE accepts the FE's `{gps:{latitude,longitude,accuracy,capturedAt}}`); replace `typeof x!=='number'` with `Number.isFinite(x)` so `NaN` fails loud, not silent. Fixes B6.
9. **/photo GPS contract + response + itemId** — same GPS shape + `Number.isFinite` guard; BE returns (or FE reads) a viewable reference so captured photos render; pass `itemId` so `checklistItemId` links. Fixes B7.
10. **Wire the fraud check** — FE calls `gps-verify` (or fold physical-presence verification into `/start`'s response) so B8's dead check runs. Fixes B8.

**UX + tests:**

11. **Replace/supersede the field-tools tab for ONSITE** with the inspect entry (single, discoverable capture path); do not leave the broken tab beside PASS. Keep the GPS-check-in tool only if it feeds the real audit. Fixes B9. *(Flag-only was judged too weak by the grill.)*
12. **Real wire-contract tests (RED-first)** — supertest against the real Express onsite router asserting exact request/response bodies for context/start/checklist/photo/decision; a FE-level fetch-shape test; and an **e2e closure**: drive a real PASS through `/decision` and assert a `Certificate` row appears (not just the two gate helpers — the auto-mint must fire). Fixes B10 and proves the whole fix.

## 5. Testing strategy

RED-first everywhere. The binding lesson from B10: **do not mock the FE↔BE seam.** Backend: supertest on the router with a real (test) Prisma or a fake that enforces field names. FE: assert the exact body shape sent. Closure: the e2e that a fully-evidenced ONSITE audit + PASS mints a `Certificate`, and that an under-evidenced one still refuses. Keep the existing gate unit tests green (the resolver refactor must not change gate results).

## 6. Rollout / risk

- Sequence: components 1-4 (backend correctness core) before 5-10 (FE wire), 11-12 last. Each independently testable.
- Tier C, operator merges; the cert-affecting parts (1-3, 12) are reviewer#2-gated (GOALS G3).
- No live-payment/secret surface. Evidence integrity (GPS, photo) is a government-cert requirement — B6/B7/B8 are in-scope, not deferred (a gate that passes on `NaN` GPS + broken photos = fake evidence).

## 7. Resolved decisions (operator-approved 2026-08-17)

1. **Audit-row creation point — at `assignAuditor`** (ONSITE), find-or-create, `auditorId = assigned auditor`, org via the tenant context (= app org). Exists before the visit. *(Idempotent: one active AuditChecklist per application.)*
2. **Org model — auditor org = application org**; authorization is by **auditorId-match**, not org-scope. Confirmed against `assignAuditor` (§2); no cross-org auditor case. The `/context` org-scope is relaxed in favor of auditorId-match (org is a defense-in-depth filter only where the caller has one).
3. **Vocabulary — map `YES/NO/NA → PASS/FAIL/NA` at the FE boundary** (single canonicalization point). The separate decision-vocab fragmentation (PASS/FAIL/NEEDS_REVIEW vs PASS/MINOR/MAJOR/REJECT) stays OUT of scope for this fix.
4. **Field-tools tab — replaced entirely for ONSITE** by the inspect entry (single capture path). The GPS-check-in tool is kept only if re-wired to the real audit; otherwise superseded.
