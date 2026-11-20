# G4 prep — lane P1: the real state sequence, registration → certificate

Status: DONE (read-only lane; no code changed, no live rows created)
Date: 2026-08-25 · Branch: chore/retire-per-plant-trace

SSOT for the machine: `apps/backend/services/workflow-transition-service.js`
(20 states `:18-39`, legal edges `:47-96`, role grants `:99-197`).
Everything below is read from that file plus the routes/services that actually walk each edge.

---

## 1. The ordered walk — one row per hop

| # | from → to | who may walk it | what must be true first | route / service that performs it |
|---|---|---|---|---|
| 0 | (register) | applicant | — | health registration; the wizard then creates the row at `DRAFT` |
| 1 | `DRAFT` → `SUBMITTED` | `health` (`workflow-transition-service.js:101`) | app row names an `entityId` and the caller holds `SUBMIT_APPLICATION` for it (`application-submit-guard.js:1-31,36`); every required document present for the rules in force NOW (`applications.js:848-853`, mode `MODE_FIRST_SUBMIT`) | `POST /api/applications/submit` → hop 1 inside one tx, `applications.js:906-931` |
| 2 | `SUBMITTED` → `PENDING_DOC_FEE` | `system` only (`workflow-transition-service.js:172`) | same tx as hop 1 — the two hops are one business act | same route, hop 2, `applications.js:943-966` (`actorRole: 'system'`) |
| 3 | `PENDING_DOC_FEE` → `DOC_FEE_PAID` | `system` only (`:177`) — **no human role holds this edge** | a cryptographically verified `payment_intent.succeeded` whose `amount_received` equals the order total in satang; order milestone `M1` | Stripe webhook `routes/api/webhooks/stripe.js:100` → `checkout-settlement-service.js:116` `settleFromPaymentIntent`, milestone map `:45-48` (`M1 → DOC_FEE_PAID`). The order is minted by `POST /api/payments/checkout` with `{milestone:'M1'}` (`routes/api/finance/payments.js:409-452`), payable only from `DRAFT/SUBMITTED/PENDING_DOC_FEE` (`stripe-checkout-service.js:39-42`) |
| 4 | `DOC_FEE_PAID` → `ASSIGNED_FOR_REVIEW` | `scheduler` (`:137`) | state is exactly `DOC_FEE_PAID` (`scheduler-assign-reviewer-handler.js:88-93`); reviewer is ACTIVE + PROVIDER + role ∈ {document_reviewer, auditor, admin} (`:98-108`); same tenant (`:78-83`) | `POST /api/provider/scheduler/reviewer-assignments` (alias `/assign-reviewer`) — `provider/scheduler.js:30,32` → `scheduler-assign-reviewer-handler.js:110-146` |
| 5a | `ASSIGNED_FOR_REVIEW` → `REVISION_REQUESTED` | `document_reviewer` (`:133`) or `auditor` (`:142`) | mandatory comment (`workflow-transition-service.js:200-204`, enforced `:359-361`; the route also refuses an empty `revisionMessage`, `workflow-transitions-handler.js:95-101`) | `POST /api/provider/applications/:id/workflow-transitions` (`provider/applications.js:322-325`) |
| 5b | `REVISION_REQUESTED` → `ASSIGNED_FOR_REVIEW` | `health` (`:102`) | inside the 5-working-day revision window, else the row EXPIRES here (`applications.js:783-795`) | same submit route, resubmit branch (`applications.js:761-763`) |
| 6 | `ASSIGNED_FOR_REVIEW` → `DOC_APPROVED` | `document_reviewer` (`:133`) or `auditor` (`:141`) | reviewer ownership / visibility (`workflow-transitions-handler.js:105-130`) | same `/workflow-transitions` route |
| 7 | `DOC_APPROVED` → `PENDING_AUDIT_FEE` | `system` only (`:173`) | automatic — fired as a side effect of hop 6 | `workflow-side-effects.js:131-162`; the same block mints the Phase-2 invoices (`:165-181`, `ensurePhaseInvoices(app,'PHASE_2')`) |
| 8 | `PENDING_AUDIT_FEE` → `AUDIT_FEE_PAID` | `system` only (`:178`) | verified `payment_intent.succeeded`, milestone `M2`; M2 is payable only from `DOC_APPROVED`/`PENDING_AUDIT_FEE` (`stripe-checkout-service.js:41`) | same webhook → `checkout-settlement-service.js:47` (`M2 → AUDIT_FEE_PAID`) |
| 9 | `AUDIT_FEE_PAID` → `AUDIT_CONFIRMED` | `scheduler` (`:138`) | (a) state is `AUDIT_FEE_PAID`; (b) **Phase-2 settlement confirmed on the invoices** (`shared/phase2-schedule-gate.js:42-52,66-78`); (c) auditor ACTIVE + holds `auditor` + same tenant; (d) date is in the future AND a Thai working day (`audit-scheduling-service.js:409-419`); (e) no auditor slot collision / per-day cap | **Door A (correct):** `POST /api/audit/scheduling/assign` (`routes/api/audit/scheduling.js:89-107`) → `audit-scheduling-service.assignAuditor` (`:355-608`). **Door B (incomplete — §4.1):** `POST /api/provider/scheduler/audits/schedules` (`provider/scheduler.js:41`) → `scheduler-audit-schedules-post-handler.js:107-227` |
| 10 | onsite work (no application-state change) | the assigned `auditor` | audit row `IN_PROGRESS` and auditor matches (`audit-onsite-service.js:456-458,536-539,650-657`) | `POST /api/audit/onsite/:auditId/start` (`onsite.js:462`), `/checklist` (`:499`), `/photo` (`:557`) |
| 11a | `AUDIT_CONFIRMED` → `AUDIT_PASSED` | `auditor` (`:143`) | **the evidence gate — see Q3.** The whole certificate mint also runs inside this same write | `POST /api/audit/onsite/:auditId/decision` (`onsite.js:691`) → `audit-onsite-service.submitDecision` (`:776`, gate `:838-845`); or `POST /api/audits/:id/result` (`audits.js:448`); or `/workflow-transitions` |
| 11b | `AUDIT_CONFIRMED` → `CAR_PENDING` | `auditor` (`:144`) | mandatory corrective-action summary (`audit-onsite-service.js:816-820`; route twin `audits.js:459-467`); starts the 5-working-day CAR clock | same doors |
| 11c | `CAR_PENDING` → `CAR_REVIEWING` → `AUDIT_PASSED` | `health` then `auditor` (`:103`, `:146`) | CAR resubmitted inside the window | submit route, then the decision route |
| 12 | `AUDIT_PASSED` → `APPROVED` | `auditor` (`:147`) | no second approver — the ISO/IEC 17065 two-person gate was removed 2026-06-05 (`workflow-transition-service.js:148-155`) | `/workflow-transitions`; the side effect re-runs cert issuance idempotently (`workflow-transitions-handler.js:555-560`, `workflow-side-effects.js:311-325`) |
| 13 | `APPROVED` → `CERTIFIED` | `auditor` (`:157`) | nothing further — it is a plain status write | `/workflow-transitions` with `toState: 'CERTIFIED'`. **No service writes `CERTIFIED` on its own** — a grep for `toStatus: 'CERTIFIED'` across `apps/backend/routes` + `apps/backend/services` returned zero non-test hits |

Escape edges not on the happy path: `PENDING_*_FEE → EXPIRED` and
`REVISION_REQUESTED`/`CAR_PENDING → EXPIRED` are cron-only, `system`
(`:180-186`); `EXPIRED → REVISION_REQUESTED/CAR_PENDING` is waiver-reopen,
`system` only (`:194-195`). The `PHASE_*_SLIP_UNDER_REVIEW` pair (`:59-60,69-70`)
is the slip rail G4.6 retires — it is not used in this walk.

---

## 2. The three answers

### Q1 — Does the phase-1 payment really sit BEFORE document review?

**Yes. The code agrees with the operator, and the ordering is structural, not conventional.**

`ALLOWED_TRANSITIONS.DOC_FEE_PAID = new Set(['ASSIGNED_FOR_REVIEW'])`
(`workflow-transition-service.js:61`), and `ASSIGNED_FOR_REVIEW` has exactly two
incoming edges in the whole map — from `DOC_FEE_PAID` (`:61`) and from the
revision loop (`:64`). A reviewer holds only two edges and both start at
`ASSIGNED_FOR_REVIEW` (`:132-135`), so there is no pre-payment state from which
a reviewer can act at all. `DOC_FEE_PAID` in turn is reachable only from
`PENDING_DOC_FEE` / `PHASE_1_SLIP_UNDER_REVIEW` (`:59-60`), and its settle edge
belongs to `system` alone (`:177`), driven by the verified Stripe webhook.

Built order:
register → `DRAFT` → `SUBMITTED` → `PENDING_DOC_FEE` → **จ่ายงวด 1** →
`DOC_FEE_PAID` → `ASSIGNED_FOR_REVIEW` → ตรวจเอกสาร → `DOC_APPROVED` →
`PENDING_AUDIT_FEE` → **จ่ายงวด 2** → `AUDIT_FEE_PAID` → `AUDIT_CONFIRMED` →
ตรวจฟาร์ม → `AUDIT_PASSED` → `APPROVED` → `CERTIFIED`.

That is the operator's "สมัคร→ยื่น→จ่าย→ตรวจเอกสาร→จ่าย→ตรวจฟาร์ม→ออกใบ" exactly,
with two mechanical states inserted around each hop (a "pending fee" state and a
"dispatch" state). **No plan correction is needed for Q1.** One nuance the walk
must carry: "ออกใบ" does not happen at `CERTIFIED` — see Q3.

### Q2 — What gates the phase-2 payment, and what gates the audit after it?

**งวด 2 is gated by document approval, twice over:**
1. State gate — a Phase-2 checkout can be created only from `DOC_APPROVED` or
   `PENDING_AUDIT_FEE` (`stripe-checkout-service.js:41`); any other state is
   refused before a PaymentIntent ever exists.
2. Invoice gate — the Phase-2 invoices the payment settles against are minted
   only by the `DOC_APPROVED → PENDING_AUDIT_FEE` auto-chain
   (`workflow-side-effects.js:165-181`). Before doc approval there is literally
   nothing payable.

The settle itself is `system`-only via the verified webhook (`:178`), with an
amount cross-check against the order total before any side effect runs
(`checkout-settlement-service.js:23-27`).

**The audit is gated by two independent conditions, both checked at scheduling:**
1. `resolveStateFromApplication(app) === 'AUDIT_FEE_PAID'`
   (`audit-scheduling-service.js:459-465`; twin at
   `scheduler-audit-schedules-post-handler.js:107-113`).
2. `isPhase2PaymentConfirmed(app)` — the Phase-2 **invoice settlement** must read
   paid (`shared/phase2-schedule-gate.js:42-52`), enforced at
   `scheduler-audit-schedules-post-handler.js:115-121` and, on the
   `/api/audits/:id/schedule` surface, at `audits.js:393-396`. The comment there
   states the reason: setting `auditorId` alone already opens checklist creation
   and the on-site GPS check-in, so an unpaid application must never receive one.

Scheduling hygiene that will bite a scripted walk: the date must be in the
**future** and a **Thai working day** (`audit-scheduling-service.js:409-419`),
and the auditor must be free in a ±12h window
(`audit-scheduling-service.js:513-517` / `scheduler-audit-schedules-post-handler.js:149-183`).

### Q3 — What must exist at issuance?

Every mint path funnels through `certificate-service.generateCertificate`
(`certificate-service.js:208`). In order, it requires:

1. **No existing non-revoked certificate** — an existing one is returned
   unchanged (`:225-235`). A second press cannot double-mint.
2. **A passing audit RECORD, not merely a status**: either
   `Application.auditResult === 'PASS'` (column path) or
   `formData.auditResult === 'PASS'` **and** `formData.auditedAt` (JSON path) —
   `:265-280`, error `CERT_REQUIRES_AUDIT_PASS`. `submitDecision` satisfies the
   column path through `additionalData.auditResult`
   (`audit-onsite-service.js:925-928`); `POST /api/audits/:id/result` satisfies
   the JSON path (`audits.js:503-509`).
3. **A post-audit state** — `AUDIT_PASSED`, `APPROVED` or `CERTIFIED` (`:286-293`).
4. **THE ONSITE EVIDENCE GATE** — `assertOnsiteEvidenceSufficient`
   (`certificate-service.js:316-320` → `services/onsite-evidence-gate.js:51-112`),
   fail-closed, evaluated against ONE `AuditChecklist.id`: the row pinned on
   `formData.onsiteAuditId`, else the one resolved by
   `onsite-audit-resolver.js:23-43`. It demands:
   - **an AuditChecklist row exists** for the application and is live
     (`isDeleted:false`) — else `NO_ONSITE_AUDIT` (`gate:76-82`);
   - the `FarmAuditPhoto` / `FarmAuditChecklistItem` models are provisioned —
     else `EVIDENCE_CAPTURE_UNAVAILABLE` (`gate:84-91`). They are, via migration
     `apps/backend/prisma/migrations/20260816161908_onsite_evidence_models`;
   - **≥ 5 photos** keyed to that `auditId` — `DEFAULT_MIN_PHOTOS = 5`
     (`audit-onsite-service.js:152`), else `INSUFFICIENT_PHOTOS` (`gate:93-99`);
   - **≥ 24 checklist items** keyed to that `auditId` — one per entry of
     `CHECKLIST_TEMPLATE_2026` (`audit-onsite-service.js:167-204`), else
     `INCOMPLETE_CHECKLIST` (`gate:101-108`).

   Run in this session to pin the two numbers rather than count by eye:
   `node -e "const s=require('./apps/backend/services/audit-onsite-service.js'); console.log('MIN_PHOTOS',s.DEFAULT_MIN_PHOTOS); console.log('ITEMS',s.CHECKLIST_TEMPLATE_2026.length); console.log('VERSION',s.TEMPLATE_VERSION);"`
   → `MIN_PHOTOS 5` · `ITEMS 24` · `VERSION 2026-05`.
5. **A farm, with plots** — resolved or created at `:325-326`
   (`resolveFarmForCertificate` + `ensurePlotsForFarm`).
6. **A usable PKI signing key** — `signCertificateDataOrThrow` (`:463`,
   implementation `:1089-1120`). The old hash-only fallback is retired: no
   signature ⇒ `CERT_SIGNING_UNAVAILABLE` (HTTP 503) ⇒ nothing is written, and
   because the caller mints inside a transaction the status flip rolls back too.

**Where the mint actually fires:** on the `AUDIT_PASSED` write, inside the same
transaction, from the writer's cert hook
(`application-status-writer.js:967-1012`); a cert-gen failure rolls the status
write back (`:1013-1167`). `APPROVED` re-runs the same call idempotently
(`workflow-side-effects.js:311-325`).

**Consequence for the walk:** the certificate exists from hop 11a. Hops 12 and 13
are ceremony over an already-issued certificate. This is *current behaviour, not
the approved spec*: operator ruling D2 (`GAP-MAP.md:117`) says a certificate must
take effect only at `CERTIFIED`, and the workflow skill records the divergence
explicitly (`.claude/skills/gacp-workflow-rules/SKILL.md:100-101`). Walk it as
built; do not pin it as correct.

---

## 3. What the audit step must produce, concretely

To satisfy the gate in Q3 item 4, per application:

1. Schedule through **Door A** — `POST /api/audit/scheduling/assign`; in the UI,
   `/provider/scheduler/queue` → `AssignAuditorModal`
   (`apps/web-app/src/lib/services/audit-service.ts:192`) — with `inspectionMode`
   left at its `ONSITE` default (`audit-scheduling-service.js:421`). Only that
   path creates the `AuditChecklist` row (`:570-594`), and only when the mode is
   `ONSITE`.
2. Auditor presses **start** — `POST /api/audit/onsite/:auditId/start` with GPS.
   That writes the `AUDIT_INSPECTION_START` `GpsVerificationLog` row the field app
   reads as "already started" (`onsite.js:76-103`,
   `audit-onsite-service.js:470-487`). Skip it and the UI stays on the start
   screen while every photo upload arrives without coordinates.
3. **24 checklist items**, one per `itemCode` in `CHECKLIST_TEMPLATE_2026`, each
   answered `PASS|FAIL|NA`; unknown codes are refused
   (`audit-onsite-service.js:538-543`).
4. **≥ 5 photos**, each carrying finite `gps.latitude`/`gps.longitude`
   (`audit-onsite-service.js:634-636`; the route packs them at `onsite.js:559-587`).
5. Then the `PASS` decision. Only the assigned auditor may do any of 2–5
   (`_ensureAuditorMatches` — `:456-458,536-539,650-657`).

---

## 4. Risks this map exposes before the walk starts

**4.1 Two scheduling doors; only one arms the audit.**
`POST /api/provider/scheduler/audits/schedules`
(`scheduler-audit-schedules-post-handler.js`) transitions to `AUDIT_CONFIRMED`
(`:194-227`) but contains **no `auditChecklist` write at all** — a grep for
`auditChecklist` in that file returns nothing. The web `/provider/calendar` page
calls exactly that endpoint
(`apps/web-app/src/app/provider/calendar/client-view.tsx:148` via
`apps/web-app/src/lib/services/provider-api.ts:13`). An application scheduled
from the calendar page reaches `AUDIT_CONFIRMED` with no `AuditChecklist` row, so
the auditor cannot start, upload or record anything, and the mint later dies on
`NO_ONSITE_AUDIT`. **Mitigation for the walk: schedule from
`/provider/scheduler/queue` only.** Flagged, not fixed — this lane changes no code.

**4.2 `ONLINE_MEET` silently disarms the evidence chain.**
`audit-scheduling-service.js:570` guards the row creation with
`if (mode === 'ONSITE')`. An online inspection can therefore never produce a
certificate under the current gate. Keep both farmers on `ONSITE`.

**4.3 PKI signing key is now a hard runtime dependency.**
`signCertificateDataOrThrow` fails closed (`certificate-service.js:1089-1120`) and
`ensureLocalKeys` throws rather than regenerating whenever `isSigningKeyRequired()`
— production, or `REQUIRE_SIGNING_KEY=true`
(`services/crypto/signature-service.js:520-556`). The comment at
`certificate-service.js:448-456` records that the three certificates issued live on
2026-08-16 / 08-18 / 08-20 all carry `signature IS NULL` from the retired fallback.
Whether preview.gacpth.com has a usable key mounted is a runtime fact this
read-only lane does not establish; it will surface as a 503
`CERT_SIGNING_UNAVAILABLE` at hop 11a. Recommend proving issuance on ONE
application before committing both farmers to the full sequence.

**4.4 `issuedDate` is `new Date()` at mint** (`certificate-service.js:361`), with
validity `+3 years` from it (`:362-365`). G4.5 step 4 wants
`issuedDate = 2026-01-01`; that is a post-mint business-date correction, and it
must move `expiryDate` with it or the validity window will not match the issue date.

**4.5 `SUBMITTED` is a real parking state for bundle members.** The front-door
submit deliberately refuses to auto-advance a row already sitting at bare
`SUBMITTED` (`applications.js:714-741`), and there is no back edge from
`PENDING_DOC_FEE` (`workflow-transition-service.js:59`). Both farmers must submit
individually via `POST /api/applications/submit` from `DRAFT` — never through the
bundle door.

---

## 5. Evidence index

- `apps/backend/services/workflow-transition-service.js` — states `:18-39`, edges `:47-96`, role grants `:99-197`, comment/editable sets `:200-211`, gate functions `:266-345`
- `apps/backend/services/application-status-writer.js:967-1167` — cert hook on `AUDIT_PASSED`/`APPROVED` and its rollback
- `apps/backend/services/certificate-service.js:208-465` — issuance preconditions; `:1089-1120` signing
- `apps/backend/services/onsite-evidence-gate.js:51-112` — the four refusal codes
- `apps/backend/services/onsite-audit-resolver.js:23-43` — which AuditChecklist row the gate checks
- `apps/backend/services/audit-onsite-service.js:152` (5 photos), `:167-204` (24 items), `:435-495` (start), `:518-560` (checklist item), `:610-700` (photo), `:776-940` (decision, gate at `:838-845`)
- `apps/backend/services/audit-scheduling-service.js:355-608` — assign; `auditChecklist.create` `:570-594`; mode default `:421`
- `apps/backend/routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:107-227` — the second AUDIT_CONFIRMED door
- `apps/backend/shared/phase2-schedule-gate.js:42-78` — the audit money gate
- `apps/backend/services/checkout/stripe-checkout-service.js:39-42` — payable states; `apps/backend/services/checkout/checkout-settlement-service.js:45-48` — milestone → state
- `apps/backend/routes/api/finance/payments.js:409-452` — checkout creation; `apps/backend/routes/api/webhooks/stripe.js:100` — settle trigger
- `apps/backend/routes/api/applications/applications.js:690-1000` — submit guard, document-requirement gate, two-hop transaction
- `apps/backend/routes/api/provider/handlers/workflow-side-effects.js:131-181` — DOC_APPROVED auto-chain + Phase-2 invoices; `:311-345` cert side effect
- `apps/backend/routes/api/provider/handlers/scheduler-assign-reviewer-handler.js:88-146` — DOC_FEE_PAID → ASSIGNED_FOR_REVIEW
- `apps/backend/prisma/migrations/20260816161908_onsite_evidence_models` — the evidence tables exist
- session command output: `MIN_PHOTOS 5` / `ITEMS 24` / `VERSION 2026-05`
