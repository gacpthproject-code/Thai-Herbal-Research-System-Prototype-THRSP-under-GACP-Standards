> ## ⚠️ เอกสารนี้บันทึกโมเดลที่เลิกใช้แล้ว (ปักป้าย 2026-09-05)
>
> ตัวเลขค่าธรรมเนียมและจุดยืนทางภาษีในเอกสารนี้เป็นของสูตรก่อน W14 (VAT คิดเฉพาะส่วนแพลตฟอร์ม)
> ปัจจุบัน: **ผู้ออกเอกสารรายเดียว · VAT 7% บนค่าบริการทั้งก้อน · งวด 1 = 5,885 · งวด 2 = 29,425**
> เก็บไว้อ่านเป็นบันทึกประวัติ · ความจริงปัจจุบัน: `apps/backend/services/fee-service.js`

# F-PLOT-AREAUNIT-DEADEND Fix — Design Spec

> Executes the council ruling 2026-08-19 (5/5 unanimous = Option C: enforce-at-source + repair door; workflow wf_1ccad24b, chairman synthesis) + the operator's two scope decisions (same day, AskUserQuestion): **A covers BOTH doors** (first submit AND the REVISION/CAR resubmit door) · **B = operator-run script**, not an endpoint.
> Finding: `evidence/phase0/FINDINGS.md:127-131`. Specimen: `f866374a-8f6b-4c7a-b850-bd09491db042` (paid 5,535+27,675 THB test mode, audit passed, stuck at AUDIT_CONFIRMED).

## Facts the design stands on (council-verified, file:line)
- The cert generator reads plots from **`app.formData.plots` (JSON)**, not the Plot table: `certificate-service.js:169-190`, strict per-row unit at `:178`; `area-utils.js:67-76` throws on missing unit (rai/sqm ambiguity ×1,600 — correct, keep).
- Live intake = `POST /applications/prepare` + `/submit` (`routes/api/applications/applications.js:753` calls `validateSubmissionPayload`); the previously-suspected `application-submission-methods.js:116-119` is DEAD in prod/staging (mounted only under `ENABLE_PROVIDER_LEGACY_ALIAS`; CI sets it true — cleanup is a separate ticket, NOT this mission).
- The specimen walked BOTH live doors: first submit AND the resubmit door `application-review-revision-methods.js:149-153` (`applyClientFormData` lets the client replace `plots` wholesale; validator at `:183-187` runs only when `isDraftSubmit`).
- The canonical validator today: `validation/canonical-application-validator.js:79` reads `plots[0]` only; step5 schema `:216-225` has no plot_area_unit.
- Fees are flat — `config/payment-fees.js` has zero area/plant references ⇒ unit does NOT affect money (L3 untouched); it affects the plant cap + the area printed on the certificate.
- Real-DB probe 2026-08-19: **18 applications** have ≥1 plot without areaUnit (DRAFT 2 · SUBMITTED 1 · PENDING_DOC_FEE 6 · PHASE_1_SLIP_UNDER_REVIEW 2 · DOC_FEE_PAID 5 · PENDING_AUDIT_FEE 1 · AUDIT_CONFIRMED 1 = specimen); 19 apps additionally have farmData without unit (farm side is follow-up (g), NOT this mission).

## Part A — enforce at source (both doors)
1. `validation/canonical-application-validator.js`: step5 mapper maps **every** plot's unit (not `plots[0]`); step5 schema requires each plot's `areaUnit` ∈ closed enum from `Object.keys(LEGACY_UNIT_TO_SQM)` (`shared/area-utils.js:40-53`), compared **case-insensitively** via the same `canonicalise()` trim/lowercase (`:56-58`) — the UI sends `'Sqm'` capitalized (`farm-info-step.tsx:252,387`); a case-sensitive enum would block every real user.
2. Failure shape: same 422 + `errorsByStep['5']` contract as existing canonical failures (anchor: `__tests__/unit/applications-submit-canonical-validation.test.js` — fixture `:156` already has `areaUnit:'Rai'`; deleting it is the RED).
3. **Resubmit door**: `application-review-revision-methods.js` — run the same canonical validation on REVISION_REQUESTED/CAR_PENDING resubmissions (today gated behind `isDraftSubmit` at `:183`), so a resubmit whose plots lack units 422s with the field pointer instead of sailing to the cert dead-end. Same error contract. (Operator decision: both doors.)
4. NO new validation layer; NO touching the dead `application-submission-methods.js`; NO generator-side defaults (council rejected D unanimously — silent defaults recreate the ×1,600 bug class).
5. DRAFT grace (probe: 2 drafts affected): **CORRECTED (whole-branch review, 2026-08-19)** — re-editing in the UI does NOT heal a draft. The wizard's `Sqm` default (`farm-info-step.tsx:252,387`) fires only for a brand-new plot (`:246-247` returns an EXISTING plot list verbatim, `:387` is inside `addPlot`); the edit client (`client-view.tsx:187`) hydrates the saved plots verbatim; and the form has NO areaUnit control at all — there is nothing for the applicant to "fix" through the wizard. Both DRAFTs, like every other affected app, heal via `scripts/maintenance/heal-plot-area-unit.js` (Task 2). The 422's field pointer still tells the applicant/staff WHICH plot is wrong; self-service repair through the FE is a tracked follow-up (`BACKLOG-FOUND.md`), not shipped by this fix. Document the correct remedy in the validator error message (Thai, actionable).

## Part B — repair script (operator-run, per council scope table)
`scripts/maintenance/heal-plot-area-unit.js` (pattern sibling: `migrate-area-to-sqm.js`):
- **Dry-run by default; `--apply` to write.** Args: one `--app <applicationId>` at a time (NO wildcard), `--plot <index|name>`, `--unit <value>` (validated against the closed `LEGACY_UNIT_TO_SQM` enum), `--reason "<text>"` + `--source "<เอกสารอ้างอิง>"` both REQUIRED.
- Touches **only** `formData.plots[i].areaUnit` and only when currently absent/empty. Asserts untouched: `areaSize`, `name`, GPS, documents, status, `auditResult`, every server-owned key (`shared/form-data-ownership.js:36-83` list — the script writes DB directly so it must assert this itself).
- **NEVER** defaults to `AREA_UNIT`; **NEVER** copies from `Plot.areaUnit` (no authoritative row exists for failed-issuance apps — `certificate-service.js:704-731` mints Plot rows only at issuance; and `:87-88`'s value is itself a silent default).
- Audit: writes `audit_logs` + `workflowHistory` per row — applicationId, plot index/name, before→after, actor, reason, source, and the fixed text "แก้ metadata หน่วยพื้นที่ — ไม่ใช่การตรวจซ้ำพื้นที่จริงหรือหลักฐานภาคสนาม".
- **NEVER** calls `generateCertificate`; **NEVER** changes status. The healed app re-enters issuance through the normal auditor edge `AUDIT_CONFIRMED → AUDIT_PASSED` (`canonical-rbac.js:300`), where evidence-gated issuance still applies un-bypassed.
- Operator runs it (L5/L6); the person supplying the unit must not be the auditor/reviewer who signed that file (recorded in `--source`).

## Out of scope (tracked)
(e) Specimen's actual return-to-issuance = DB-gated proof, PENDING until the operator heals+walks it · (f) dead wizard path + `ci.yml:734` flag cleanup · (g) farm-side silent default (`certificate-service.js:398,:561`; 19 apps) — follow-up mission, three council seats flagged it · endpoint form of B (only if new stuck cases keep appearing after A lands — Finance rider: rate-limit + dual-approval + separate RBAC role).

## DoD
RED-first per task (validator: delete fixture unit → 422 pin; resubmit door: RED proving today's skip; script: dry-run/apply/audit pins on a test DB row). Suites green, no new failures vs baseline. Ratchet flat-or-down. Tier = `tier-check.sh` decides (validator on the intake gate + a data-repair tool for paid applications → expect C: operator merges). Full report ≤40 lines per work item.
