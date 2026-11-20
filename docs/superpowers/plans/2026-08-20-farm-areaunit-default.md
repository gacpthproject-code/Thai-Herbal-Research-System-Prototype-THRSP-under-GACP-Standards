# Farm areaUnit Silent-Default Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the farm surface stops silently defaulting area units (council precedent), with the 19 legacy rows healable first and the generator strict last.

**Architecture:** 3 sequential tasks on `feat/farm-areaunit-default` (off main 479f8d2e). Spec (binding): `docs/superpowers/specs/2026-08-20-farm-areaunit-default-design.md`.

## Global Constraints
- Council precedent binds: NEVER a silent default on an area unit; closed enum `Object.keys(LEGACY_UNIT_TO_SQM)` via case-insensitive `canonicalise()`; heal guards identical to the plot script (proven live 18/18).
- Deploy order: heal data BEFORE the strict flip goes live — runbook + report must say so explicitly.
- Error contract: canonical 422 + `errorsByStep` unchanged in shape; Thai messages honest (no instructions the UI can't fulfill — plot-mission lesson).
- Ratchet flat-or-down (36/56/122/2). Tier by tier-check. Operator merges (certificate-service expected C).

### Task 1: heal script `--target farm` + runbook
**Files:** Modify `scripts/maintenance/heal-plot-area-unit.js` (add farm target: heals `formData.farmData.totalAreaUnit` only-when-absent; audit action `FARM_AREA_UNIT_HEALED`; all existing guards verbatim — locate the plot-specific assumptions and parametrize cleanly) · Modify `apps/backend/__tests__/unit/heal-plot-area-unit.test.js` (farm-target pins mirroring every plot guard pin + plot suite stays green) · Modify `docs/operations/heal-plot-areaunit-runbook.md` (farm section: 19 ids by status incl. the CERTIFIED note + deploy-order warning).
**Interfaces:** CLI unchanged for plots (`--target plot` default); `--target farm` ignores `--plot` (farmData is singular — refuse if `--plot` passed with farm target).
- [ ] RED-first: farm-target guard pins fail pre-implementation; plot pins untouched green. Also probe the Farm TABLE live (read-only): count rows with NULL/empty `areaUnit` — report the number; if >0 they join T1's heal scope (spec T3 condition).
- [ ] Implement; suites green; ratchet; commit.

### Task 2: validator requires farm unit (both doors)
**Files:** Modify `apps/backend/validation/canonical-application-validator.js` (farm step mapper + schema: `total_area_unit` required, closed enum, case-insensitive — locate the farm step fresh; ~:146 maps total_area_size today) · Modify `apps/backend/__tests__/unit/applications-submit-canonical-validation.test.js` + validator unit suite (RED: canonical fixture minus farm unit → 422 with the farm step's errorsByStep key; case matrix; existing fixtures keep passing since wizard payloads carry 'Sqm').
**Interfaces:** 422 shape unchanged; both doors covered automatically (revision door already runs full canonical validation since the plot mission).
- [ ] RED-first → implement → suites (validator + submit + revision + neighbors) green; ratchet; commit.

### Task 3: strict flip at the generator
**Files:** Modify `apps/backend/services/certificate-service.js` (`:561` drop `|| productionData.areaUnit || AREA_UNIT` → strict read that throws the same CERT_AUTO_GEN_FAILED class as plots; `:398` per T1's Farm-table probe: if 0 unit-less rows, keep the defensive fallback WITH a comment citing the probe, else strict too) · Test: RED pin — unit-less farmData at mint now throws (was: silently minted Sqm); certificate suites + issuance neighbors green.
**Interfaces:** no signature changes; failure surfaces through the existing CERT_AUTO_GEN_FAILED handling (tx rollback, honest error).
- [ ] RED-first → implement → suites green; ratchet; tier-check on the branch; commit. Report ends with the deploy-order line + heal commands.

## Self-Review
Spec→tasks: work item 1→T1, 2→T2, 3→T3; deploy-order constraint carried in T1 (runbook) and T3 (report); the `:398` conditional resolved by T1's probe; out-of-scope respected (no FE, no plot changes, no re-issue). Sequential — T3 depends on T1's probe result and T2's door coverage.
