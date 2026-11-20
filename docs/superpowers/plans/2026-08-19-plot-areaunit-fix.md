# F-PLOT-AREAUNIT Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** plot `areaUnit` enforced at both live intake doors (422 + field pointer), plus an operator-run repair script for the 18 stuck applications — per the council ruling C and the operator's two scope decisions.

**Architecture:** 2 sequential tasks on `feat/plot-areaunit-fix` (off main 4b59175b). Spec (binding): `docs/superpowers/specs/2026-08-19-plot-areaunit-fix-design.md`.

## Global Constraints
- NO generator-side defaults, NO touching `application-submission-methods.js` (dead path), NO status changes or `generateCertificate` calls from the script, NEVER default/copy a unit (operator supplies it from the closed enum).
- Enum source = `Object.keys(LEGACY_UNIT_TO_SQM)` (`shared/area-utils.js:40-53`), compared case-insensitively via `canonicalise()` — `'Sqm'` (UI casing) MUST pass.
- Error contract = existing canonical 422 + `errorsByStep['5']`; Thai, actionable messages.
- Ratchet flat-or-down; RED-first per task; full report ≤40 lines; tier by `tier-check.sh` (expect C → operator merges).

### Task 1: validator — both doors
**Files:** Modify `apps/backend/validation/canonical-application-validator.js` (step5 mapper ~:79 `plots[0]` → all plots; step5 schema ~:216-225 add required per-plot areaUnit enum) · `apps/backend/services/application-service/application-review-revision-methods.js` (~:183 validator gated on `isDraftSubmit` → also run on REVISION_REQUESTED/CAR_PENDING resubmits) — LOCATE lines fresh.
**Interfaces:** 422 body shape unchanged (`errorsByStep['5']` gains the new message); `validateSubmissionPayload` signature unchanged; resubmit success path byte-identical when payload is valid.
- [ ] RED 1: in `applications-submit-canonical-validation.test.js` clone the canonical fixture (~:156) minus `areaUnit` → expect 422 + errorsByStep['5'] — fails today (passes validation). RED 2: resubmit-door test — REVISION_REQUESTED resubmit with unit-less plots currently succeeds → pin that it must 422. Case pin: `'Sqm'`, `'sqm'`, `'Rai'` all pass; `'ไร่ครึ่ง'`/absent fail.
- [ ] Implement; suites green (canonical-validation + review-revision + neighbors); ratchet; commit.

### Task 2: repair script + heal rehearsal
**Files:** Create `scripts/maintenance/heal-plot-area-unit.js` + test `apps/backend/__tests__/unit/heal-plot-area-unit.test.js` (unit-test the pure decision/assert logic by extracting it requireable; DB writes exercised against a mock/prisma stub in the same pattern as migrate-area-to-sqm's tests if they exist — locate; else test the pure parts + dry-run output contract).
**Interfaces:** CLI per spec Part B verbatim (dry-run default, --apply, --app/--plot/--unit/--reason/--source all validated, closed enum, server-owned-key assertions, audit_logs + workflowHistory rows, fixed Thai audit text).
- [ ] RED-first on the guards: missing --reason refuses; unit outside enum refuses; plot already HAS a unit refuses; server-owned key would change → abort. Then dry-run prints the exact diff it would make and writes nothing.
- [ ] Implement; suites + ratchet; commit. Report ends with the operator runbook block: the exact command for specimen f866374a + the list of the other 17 app ids from the probe (statuses in the spec).

## Self-Review
Spec→tasks: Part A = T1 (both doors, enum, case-insensitive, no new layer); Part B = T2 (scope table encoded as guards). Out-of-scope items (e)/(f)/(g) untouched by both tasks. No task touches money, status machines, or the generator. Sequential (T2's runbook cites T1's landed behavior).
