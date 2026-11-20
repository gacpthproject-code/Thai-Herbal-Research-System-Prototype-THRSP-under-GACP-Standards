# Docs/Manuals Audit — Flag Only, Nothing Deleted or Moved

Date: 2026-08-16 · Method: read-only survey of every git-tracked `*.md` in the repo (`git ls-files "*.md"` = 677), cross-checked against `git log` dates per file and against actual link targets on disk. Scope excludes `.claude/skills/`, `.agent/skills/`, `.superpowers/` (83 files — agent tooling config, not human docs) and `.claude/worktrees/` (2,604 files — gitignored, local leftover git worktrees, not part of the shipped repo). In scope: `docs/` (391), root-level (20), `apps/**` (47), `reports/` (27, noted but out of newcomer path), `evidence/` (96, noted but out of newcomer path).

No files were deleted, moved, or edited. Every verdict below is a recommendation for the operator.

---

## 0. Headline findings (read this part first)

1. **Every navigation/index file in the repo has broken links or is missing entries.** This is the single biggest reason a newcomer gets lost — the "start here" signposts don't work:
   - Root `README.md` links `docs/HANDOFF.md` and `docs/ARCHITECTURE.md` — **neither exists**.
   - `docs/readme.md` (the declared "GACP Documentation Index") links its own "Single Source of Truth" as `./gacp-master-brief-canonical.md` — the real file is at `docs/requirements/gacp-master-brief-canonical.md`, four months moved since the link was written.
   - `docs/adr/README.md` links `ADR-001-four-pillar-PROVIDER-structure.md` — the real file is `ADR-001-four-pillar-staff-structure.md`. The index is also missing ADR-016, ADR-017, and ADR-014-phase-e2-rls-decision.md entirely (they exist on disk, just unlisted).
   - `docs/architecture/vocabulary-source-of-truth-map.md` (itself a doc whose job is "point to the canonical file") cites `docs/terminology-policy.md`, `docs/api-path-identity-policy.md`, `docs/engineering-route-naming.md` — all three actually live one directory deeper (`docs/architecture/`, `docs/api/`, `docs/api/`).
2. **GOALS.md's warning — "เอกสารสัญญาอ้าง production ที่ไม่มี" (contract docs claim a production that doesn't exist) — is a confirmed, findable, still-open issue.** `docs/contract/evidence/README.md` (2026-07-10) states `**ระบบจริง:** https://gacpth.com (production)` and marks 7 of 8 contract deliverables `✅ LIVE`. GOALS.md, written four weeks later (2026-08-07), lists this exact claim under "ที่ยังไม่จริง" (not yet true) and schedules the fix as G3 (90-day horizon, not done). As of this audit the contract evidence pack still reads as delivered/live. This is a real government-contract document (C05F680149) — not a candidate to touch without the operator, only to flag with precision.
3. **Two competing "canonical" homes exist for at least three subject areas, and the older one was never archived when the newer one took over:**
   - Deploy/operate: `docs/deployment/` (mostly Mar–May, superseded) vs `docs/operations/` + `docs/operations/runbooks/` (actively updated through 2026-08-15 — this is the real current one).
   - Backlog: `docs/backlog/` (13 files, nothing after 2026-05-05) vs root `BACKLOG-FOUND.md` / `QUEUE.md` / `GAP-MAP.md` (updated through 2026-08-15 — these are the real current ones).
   - Audit snapshots: `docs/audit/`, `docs/audit-reports/`, and root `AUDIT-REPORT.md` / `SYSTEM-AUDIT-REPORT.md` / `SYSTEM-REALITY-CHECK.md` (all one-time, dated 2026-04-28 to 2026-05-30) vs the living `AUDIT_LEDGER.md` (updated through 2026-08-06, which `HARNESS.md` §6 names as the canonical `/audit-system` output).
   This is the exact "additive growth, no subtraction" pattern `SYSTEM-REALITY-CHECK.md` already diagnosed in the *code* — it turns out to describe the docs tree just as well.
4. **A single-day, 61-file documentation burst (2026-05-16, commit messages "Ralph Loop Iter 23–29 FINAL", "batch 16–22") self-describes as reaching "production deploy" / "FINAL".** Three months later GOALS.md says production doesn't really exist and 0 of 12 governance rules are machine-enforced. This batch is very likely one of the sources of the false "production ready" narrative GOALS.md is trying to correct — treat it as a historical sprint record, not a claim about today.
5. **`apps/backend/services/PAYMENT_SERVICES_README.md`** (backend's own "which payment file is canonical" guide) states the canonical settlement path is **slip-upload with manual finance verification**, explicitly "NOT through a gateway webhook." The currently-active direction per `CLAUDE.md` L3/HARNESS.md probes and the `gacp-payment-invariants` skill is **Stripe webhook-only settlement** (`settle-webhook-only`, `stripe-sdk-isolated`, `stripe-keys-ready` probes). `GAP-MAP.md` (2026-08-04) confirms the Stripe rail is backend-complete but the slip flow is still the live path — so the README isn't wrong about *today*, but it reads as a permanent architecture statement and doesn't mention the Stripe migration in flight at all. A backend newcomer reading only this README will misunderstand where the system is headed.
6. **`README.md` (root) claims `Status: ✅ Production Ready (v3.0)`.** This is the very first line a newcomer reads. It is contradicted by the project's own current-state document (`GOALS.md`, "ที่ยังไม่จริง: ... เอกสารสัญญาอ้าง production ที่ไม่มี" / "ไม่อ้าง production/TRL 7+ ในเอกสารใดจนกว่า production จริงจะมีอยู่"), by `CHANGELOG.md`'s own admission of ~430 unrecorded PRs and abandoned version tags, and by root `ARCHITECTURE.md`'s stale "Tests 297/297 (100%)" scoreboard sitting next to a live `AUDIT_LEDGER.md` that tracks 71 open phantom-guardrail findings.
7. **Two boilerplate READMEs were never customized**: `apps/web-app/README.md` and `apps/mobile-app/README.md` are still the unedited `create-next-app` / `flutter create` defaults (dated 2026-03-05, never touched since). `apps/backend/` has no README at all. These are the first files a newcomer opens when they `cd` into an app directory.

---

## 1. Root-level docs (20 files)

| Path | Verdict | Why |
|---|---|---|
| `README.md` | **Keep, rewrite urgently** | Entry point; "Production Ready" claim contradicts GOALS.md; links to 2 non-existent files (`docs/HANDOFF.md`, `docs/ARCHITECTURE.md`); test credentials differ from `DEVELOPMENT-GUIDE.md`'s. |
| `CLAUDE.md` | Keep | Live governance rules, actively maintained (v3, 2026-08-07), enforced by probes. Not newcomer-domain reading but load-bearing. |
| `HARNESS.md` | Keep | Live harness architecture + probe registry description, companion to CLAUDE.md, current. |
| `HARNESS_LOG.md` | Keep (as-is, append-only) | Incident log, explicitly append-only per its own protocol; valuable history, not a newcomer read. |
| `GOALS.md` | Keep, feature prominently | Most honest current-state document in the repo (dated 2026-08-07); should be linked from README as "what's actually true today." |
| `AUDIT_LEDGER.md` | Keep | Living findings ledger per HARNESS.md §6, updated through 2026-08-06 — this is the canonical audit output the other audit docs (§4 below) are superseded by. |
| `PRODUCT.md` | Keep | Clear, current product/audience/design-principles doc — good newcomer material. |
| `DESIGN.md` | Keep | Current, detailed design-token system; matches the `gacp-design-tokens` skill. Good newcomer material for anyone touching UI. |
| `ARCHITECTURE.md` | **Keep, needs a fact-check pass** | Useful shape (directory tree, request flow, DB schema map) but the closing "Current Scores: Code review 100/100, Tests 297/297 (100%)" line is a stale scoreboard contradicted by GOALS.md/AUDIT_LEDGER.md; also referenced by README as `docs/ARCHITECTURE.md`, a path that doesn't exist. |
| `DEVELOPMENT-GUIDE.md` | **Keep, reconcile with README** | Best "how to run" doc in the repo (correctly documents the Docker-only DB stance, the jest noop-Prisma path, deploy-is-operator-only). Test accounts here don't match README's test accounts — pick one source. |
| `API-REFERENCE.md` | Keep, mark as illustrative | Reasonable endpoint map but far short of the ~170 real routes `SYSTEM-AUDIT-REPORT.md` counted; risk of newcomers treating it as exhaustive. Consider a one-line disclaimer pointing at `docs/api/active-api-surface.md`. |
| `CHANGELOG.md` | Keep | Genuinely useful, and the 3.8.0 entry is a rare example of the repo being honest about its own history (430 unrecorded PRs, abandoned tags). Behind by ~3.5 weeks but that's normal changelog lag. |
| `QUEUE.md` | Keep (not newcomer path) | Live orchestrator task-state file, updated through 2026-08-07, extremely dense/jargon-heavy — correct as an operational doc, wrong as onboarding material. |
| `GAP-MAP.md` | Keep (not newcomer path) | Live gap-tracking (2026-08-06), same profile as QUEUE.md. |
| `BACKLOG-FOUND.md` | Keep (not newcomer path) | Live append-only out-of-scope-findings log, updated through 2026-08-15 (166KB) — the *real* current backlog; supersedes `docs/backlog/`. |
| `AUDIT-REPORT.md` | **Archive** | One-time security/architecture audit snapshot, dated 2026-05-29, ~3 months stale, superseded by `AUDIT_LEDGER.md`. Findings (SEC-001 SSRF, etc.) should be confirmed as ported into the ledger before archiving. |
| `SYSTEM-AUDIT-REPORT.md` | **Archive** | One-time cross-domain audit, dated 2026-05-29, same supersession as above. |
| `SYSTEM-REALITY-CHECK.md` | **Archive** | One-time multi-agent audit, dated 2026-05-30, same supersession. Genuinely well-written ("additive growth, no subtraction" theme) — worth keeping as historical diagnosis, just not at root level competing with the live ledger. |
| `PROMPT-PAYMENT-REWORK.md` | **Archive** | Mission prompt for Wave 2–4 payment rework, last touched 2026-08-02. `HARNESS.md` §8 states finished mission prompts should move to `archive/`; this one never did, and the repo has moved on (current branch/specs are M1.5/M2a/settlement-resilience, 2026-08-13 to 08-16). |
| `PROMPT-W2-AUTONOMOUS-FLOW.md` | **Archive** | Same reasoning as above — W2 orchestration mode, last touched 2026-08-02, superseded by current work. |

---

## 2. `docs/readme.md` and navigation layer

| Path | Verdict | Why |
|---|---|---|
| `docs/readme.md` | **Keep, fix now** | The only thing calling itself a documentation index. 21 lines, links only 4 things, one link is dead (see §0.1). Doesn't index 390+ other files. This is the single highest-leverage fix available — a newcomer's first click into `docs/` currently 404s on the "single source of truth." |
| `docs/adr/README.md` | **Keep, fix now** | Index of 16 listed ADRs but repo has 20 ADR files; 1 filename mismatch, 3 missing entries (see §0.1). |
| `docs/architecture/vocabulary-source-of-truth-map.md` | Keep, fix paths | Genuinely valuable content (a real "who owns this term" collision matrix) undercut by three stale relative links. |
| `docs/architecture/current-truth-map.md` | **Archive or rename** | Dated 2026-04-04, labeled "Phase 1 Discovery" — an investigation snapshot, not a maintained map despite the name. Its own verdicts ("Backend 5-stage is stale/wrong") are 4+ months old and unverified against current code. The name promises currency it doesn't have; misleading to a newcomer who finds it via search. |

---

## 3. `docs/architecture/` (57 files)

Two very different things share one directory:

**A. Living/canonical reference (keep, these are good):**
`01-system-architecture-en.md`, `01-system-architecture-th.md`, `system-map.md`, `workflow-state-machine.md`, `canonical-target-model.md`, `canonical-inventory.md`, `canonical-permission-matrix.md`, `ROLE_NAMESPACE_MAPPING.md`, `runtime-topology.md` (2026-07-27, most recent), `office-team-structure.md` (2026-08-04, most recent), `terminology-policy.md`, `auth-role-boundary-matrix.md`, `deprecation-register.md`, `duplicate-surface-inventory.md`, `application-step-model.md`, `entity-runtime-matrix.md`, `flow-runtime-matrix.md`, `dependency-integration-matrix.md`, `mental-model-request-auth-db-flow.md`, `network-diagram.md`, `rbac-and-task-ownership.md`, `runtime-drift-register.md`, `consumer-surface-matrix.md`, `surface-mount-precedence-map.md`, `iot-scope-decision.md`, `software-safety-plan.md`, `membership-system-architecture.md`, `identity-model-external-idp-alignment.md`, `idcard-deprecation-plan.md`, `infrastructure-migration-blueprint.md`, `agentic-team-operating-model.md`, `vnext-ai-workflow.md`. — Recommend consolidating into a smaller "start here" subset (see §8) rather than expecting a newcomer to read all 30+.

**B. One-day review/RFC artifacts — Archive as a batch (10 files, all dated 2026-04-28):**
`2026-04-28-billing-flow-review.md`, `2026-04-28-code-organization-review.md`, `2026-04-28-design-system-review.md`, `2026-04-28-document-template-review.md`, `2026-04-28-phase-a5-a6-timeline-memo.md`, `2026-04-28-rfc-phase-a5-government-ux.md`, `2026-04-28-rfc-phase-a6-workflow-discipline.md`, `2026-04-28-server-hygiene-audit-results.md`, `2026-04-28-server-hygiene-review.md`, `2026-04-28-system-cohesion-master-plan.md`, `2026-04-28-workflow-discipline-review.md` — one review sprint, point-in-time, mixed into the same folder as the living docs above with no visual distinction. Same treatment for the 2026-05-04 batch (`2026-05-04-canonical-auth-session-rbac-contract.md`, `2026-05-04-canonical-workflow-status-dictionary.md`, `2026-05-04-css-architecture-audit.md`) and the two 2026-04-29 RFCs (`2026-04-29-rfc-billing-phase-b-invoice-consolidation.md`, `2026-04-29-rfc-payment-slip-flow.md` — note the latter is actively cited as live rationale by `PAYMENT_SERVICES_README.md`, so if archived, keep a pointer).

**C. Recent point-in-time (2026-05-16, part of the larger batch in §6):** `dtam-collection-agent-2026-05-16.md`, `journal-entry-schema-2026-05-16.md`, `quotation-issuance-2026-05-16.md` — **Archive**, same reasoning as §6.

---

## 4. Audit-snapshot graveyard — `docs/audit/` (56), `docs/audit-reports/` (5)

| Cluster | Verdict | Why |
|---|---|---|
| `docs/audit/audit-reports/*` — 34 files, **all dated 2026-04-28** (the "carpet-bomb" audit day: `master-audit-consolidation-report.md`, `master-audit-fix-batch-plan.md`, `master-audit-implementation-action-plan.md`, `master-audit-pr-plan.md`, `phase-1-system-map-index.md` … `phase-4-database-audit-index.md`, 9× `backend-audit-*.md`, 5× `frontend-audit-*.md`, `naming-audit-report.md`, `role-access-audit-notes.md`, `security-review.md`, `platform-audit-followup-2026-03-30.md`, `carpet-bomb-audit-baseline-2026-03-30.md`) | **Archive as one batch** | One audit sprint, 3.5+ months stale, pre-dates `AUDIT_LEDGER.md`'s existence as the canonical output. `docs/readme.md` still links `carpet-bomb-audit-baseline-2026-03-30.md` as "latest" — it is not latest, it's the oldest thing in the folder. |
| `docs/audit/*-2026-05-16.md` — 6 files (`scheduling-workflow`, `renewal-workflow`, `payment-flow`, `payment-audit-evidence`, `onsite-audit-flow`, `accounting-correctness`) | **Archive** | Part of the May 16 batch, §6. |
| `docs/audit/audit-reports/2026-05-05-t0*.md` — 6 files + `2026-05-01/02/04-*.md` — 6 files | **Archive** | Follow-up wave to the April 28 audit, same supersession logic. |
| `docs/audit/SYSTEM-COMPLETENESS-2026-08-05.md`, `SYSTEM-COMPLETENESS-2026-08-06.md`, `GOLDEN-PATH-WALKTHROUGH-2026-08-05.md` | **Keep** | Only genuinely current audit artifacts in this directory (August, not superseded). These, not the April/May ones, are what a newcomer should be pointed at for "what's the current known-gap list." |
| `docs/audit/PR_BODY_helper-cherrypick.md` | **Cut** | A leftover PR-description draft, not a doc; dated 2026-04-28. |
| `docs/audit-reports/*` (root of this dir, 5 files: `2026-07-23-jobs-bar-quality-audit.md`, `2026-07-25-data-sovereignty-audit.md`, `application-system-deep-audit-2026-04-11.md`, `predeploy-readiness-2026-04-11.md`, `process-workflow-audit-2026-04-11.md`) | **Mixed** | The two July files are recent and are the ones `CHANGELOG.md` 3.8.0 cites as its remediation source — **keep**. The three April 11 files — **archive**, superseded by the same April 28 wave above. |

**Note:** `docs/audit/` and `docs/audit-reports/` are two different directories for the same kind of content — worth merging the *survivors* (the 2026-08 files) into one location as part of any restructure.

---

## 5. `docs/contract/` (29 files) — real, current, and *not* a newcomer-onboarding path

This is the acceptance/deliverable documentation for government contract C05F680149 (Suan Sunandha Rajabhat University / DTAM). It is actively maintained (`docs/contract/manual/01-identity-health-id.md` as recently as 2026-08-08) and legally load-bearing — **not a cut/archive candidate**. But it serves a different audience (contract reviewers/DTAM) than an engineer onboarding to the codebase, so it does not belong on a newcomer's "start here" path either.

| Path | Verdict | Why |
|---|---|---|
| `docs/contract/evidence/README.md` + `item-1..8-*.md` | **Keep, flag for the honesty pass GOALS.md G3 already schedules** | States `ระบบจริง: https://gacpth.com (production)` and marks deliverables `✅ LIVE` — this is the exact claim GOALS.md's own current-state table calls false. Not a new problem, but confirmed still present and unresolved as of today. |
| `docs/contract/manual/00-overview.md` … `06-eight-prototypes.md` + `README.md` | Keep | The formal 6-chapter system manual required by the contract; current (2026-07-10 to 08-08). |
| `docs/contract/farmer-manual/GACP-Farmer-Manual.md` | Keep, reconcile with §7 | A third "manual" alongside `docs/manual/USER-MANUAL.md` and `docs/contract/manual/`; worth confirming these don't drift out of sync with each other over time. |
| `docs/contract/kpi-commitment-table.md`, `acceptance-mapping-c05f680149.md`, `data-dictionary-c05f680149.md`, `remaining-workplan.md` | Keep | Contract-tracking documents, current, honest in tone (`remaining-workplan.md` openly tracks what's left). |
| `docs/contract/pilot-*.md` (3 files, 2026-07-11) | Keep | Pilot data-collection planning, current. |
| `docs/contract/evidence/full-system-audit-2026-07-11.md` | Keep | Recent (2026-07-24), part of the active evidence trail. |
| `docs/contract/evidence/{role-walkthrough,queue-drive,accounting-farm-deep}-2026-07-10/README.md` | Keep (not newcomer path) | Evidence-pack indexes, same profile as `evidence/` top-level (§9). |

---

## 6. The 2026-05-16 "Ralph Loop" batch — 61 files across 12 directories

Single-day, multi-agent, parallel feature-development marathon (`git log` commit messages: "Ralph Loop Iter 23" through "Iter 29 FINAL", "batch 16" through "batch 22"). Every file below was generated the same day as a design/spec companion to a feature PR. Content is a real historical record of *why* things are the way they are, but every file is now 3 months stale, several duplicate the 2026-04-28 audit wave in subject matter, and the batch collectively self-describes reaching "production deploy" — a claim GOALS.md later retracted.

**Recommend: archive the batch as a unit**, preserved together (it tells one coherent story — "the day accounting/finance went from nothing to nominally done") rather than picked apart file by file:

`docs/accounting/*.md` (8), `docs/dba/*.md` (4), `docs/tax/*.md` (3), `docs/pdf/*.md` (3), `docs/ux/*.md` (6), `docs/training/*.md` (5), `docs/qa/*-2026-05-16.md` (5), `docs/tech-debt/*.md` (3), `docs/design/*-2026-05-16.md` (4), `docs/customer-success/onboarding-help-center-2026-05-16.md`, `docs/marketing/site-launch-checklist-2026-05-16.md`, `docs/financial-documents/RECEIPT-DESIGN-SPEC.md` (2026-05-15, same cluster), `docs/handoff-package-2026-05-16.md`, `docs/cutover-checklist-2026-05-16.md`, `docs/operations/*-2026-05-16.md` (7, see §7 — some of these have since been superseded by August runbooks specifically), `docs/security/*-2026-05-16.md` (4 of the 6 files in that dir).

Exception — **keep, not part of the stale batch**: `docs/security/incident-response-runbook.md` (2026-05-17) and `docs/security/security-summary.md` if still accurate — worth a quick currency check since security docs carry more risk if wrong; not verified line-by-line in this pass.

---

## 7. `docs/operations/` (42) vs `docs/deployment/` (23) — old home and new home

`docs/operations/` (especially `docs/operations/runbooks/`) is the **actively maintained** operations home — 12 files touched between 2026-08-13 and 2026-08-15, the day of this audit's baseline. This is the best "how to run this in production" material in the repo:

**Keep, current:** `deploy-runbook.md`, `branch-protection-setup.md`, `security-ci-policy.md`, `staging-box-topology.md`, `domain-access.md`, `secret-audit-2026-08-04.md`, `env-layering.md`, `staging-activation.md`, `level-4-activation.md`, `level-5-bluegreen-activation.md`, and `runbooks/{m1-staging-evidence, setup-self-hosted-runner, secret-rotation-full, restrict-site-to-one-ip, ghcr-pat-rotation, deploy-staging-manual, build-images-on-the-box, backup-and-restore, rotate-database-credential, staging-through-docker-nginx, full-gate-on-staging, tls-first-issuance, tls-cert-renewal}.md`.

**Archive (superseded by the above, mostly the 2026-05-16/17/18 wave):** `cutover-checklist-2026-05-17.md`, `loop-x-2026-05-18-sign-off.md`, `sentry-installation-guide-2026-05-17.md`, `sentry-alert-rules-2026-05-17.md`, `ralph-loop-2026-05-17-sign-off.md`, `loop-w-2026-05-17-sign-off.md`, `loop-v-2026-05-17-sign-off.md`, `docker-localhost-smoke-runbook-2026-05-17.md`, `rollback-runbook-2026-05-16.md`, `on-call-rotation-2026-05-16.md`, `metrics-inventory-2026-05-16.md`, `incident-response-2026-05-16.md`, `deploy-checklist-2026-05-16.md`, `admin-tooling-2026-05-16.md`, `handoff-2026-04.md`, `qa-local-pc-runbook.md` (2026-05-02), `runbooks/secret-rotation.md` (2026-04-28 — **directly superseded** by `runbooks/secret-rotation-full.md`, 2026-08-14; two runbooks for the same task, keep only the newer), `runbooks/docker-log-caps.md`.

**Keep as templates (undated content, reusable):** `post-mortem-template.md`.

`docs/deployment/` (23 files, newest is 2026-07-27, most are March–May): this whole directory reads as **the predecessor of `docs/operations/`**. Recommend: diff `docs/deployment/production-runbook.md` / `production-deployment.md` / `production-deployment-plan.md` / `production-deployment-checklist.md` against `docs/operations/deploy-runbook.md` for any surviving unique content, then **archive the directory**. Specific files: `provider-evaluation-*.md` (3, provider-selection decision record — historical, archive), `preview-deploy-*.md` (7 files, preview-environment process that appears superseded by the current staging/runbooks setup), `platform-urls.md` (**check for currency first** — a URL-reference doc is exactly the kind of thing that quietly goes stale and misleads), `migration-instructions.md` (check against current Prisma migration practice before archiving), `dtam-hosting-plan.md` (2026-05-15, semi-recent, worth a currency check rather than blind archive), `production-diagnostic-runbook.md` (2026-07-27, newest file here — worth confirming whether it's actually current or should move under `docs/operations/`).

---

## 8. `docs/backlog/` (13 files, nothing after 2026-05-05)

**Archive the whole directory.** The project clearly consolidated backlog-tracking to root `BACKLOG-FOUND.md` + `QUEUE.md` + `GAP-MAP.md` (all actively updated through August), leaving this directory as an orphaned earlier system nobody points to anymore. Contents: `frontend-lint-debt-remediation-2026-03-02.md`, `backend-dependency-remediation-priority.md`, `webapp-dependency-remediation-priority.md`, `audit-integrity-hardening-{phase-next,review-checklist}.md`, `max-lines-feasibility-analysis-2026-03-02.md`, `wizard-autosave-use-auto-save-reconcile-review-checklist.md`, `health-wizard-offline-sync-workstream-a-review-first-mapping.md`, `health-wizard-core-step-validation-manual-test-checklist.md`, `e-saraban-dispatch-matrix-track-2026-03-02.md`, `core-product-improvements-phase-kickoff.md`, `application-frontend-ux-ui-review-manual-benchmark-2026-02-22.md`, `application-wizard-template-redesign-spec-v1.md`. Before archiving, a quick grep for any item still unresolved (i.e. never made it into `BACKLOG-FOUND.md`) would be worth doing so nothing genuinely open gets lost.

---

## 9. `docs/testing/` (12 files, nothing after 2026-04-03) and `docs/qa/` (5, part of §6)

All 12 files are either a single point-in-time QA execution log (`health-wizard-manual-qa-execution-record-2026-02-22-steps-1-5.md` + 5 "addendum" files, all documenting one Feb 22 manual test session) or generic plans that were never updated (`regression-test-plan.md`, `smoke-test-execution-guide.md`, `track-trace-public-qr-test-plan.md`, `uat-checklist-planting-runtime.md`, `uat-signoff-pack.md`, `handoff-full-test-runbook.md`). **Archive the QA-execution-log cluster** (6 files, pure historical record of one session). The 6 plan/checklist files are worth a currency check before archiving since "how do we test this" is genuinely newcomer-relevant if still accurate — but none has been touched in 4+ months while the actual current testing practice lives in `CLAUDE.md`/`HARNESS.md` (probe-based DoD) and `scripts/`, which have superseded this directory in practice.

---

## 10. `docs/requirements/` (16 files)

| Path | Verdict | Why |
|---|---|---|
| `gacp-master-brief-canonical.md` | **Keep, refresh urgently** | Declared single source of truth by `docs/readme.md`, but dated 2026-03-31 — stale relative to the August architecture/workflow docs. Given its declared authority, this is one of the highest-value files to bring current. |
| `dtam-implementation-final.md`, `dtam-implementation-progress.md`, `dtam-implementation-status.md` | **Consolidate — three files doing one job** | All three dated 2026-03-11, overlapping "implementation status" framing under different names. A newcomer can't tell which is authoritative. Recommend collapsing to one. |
| `official-gacp-requirements-dtam.md`, `dtam-requirements-analysis.md`, `gacp-document-requirements-research.md` | Keep | Core domain-requirements research, foundational, 2026-03-11 — check against `gacp-standards-requirements` skill for currency but likely still valid (regulatory requirements change slowly). |
| `onsite-audit-loop.md` | Keep | Most recent file in this directory (2026-08-04) — current. |
| `planting-runtime-blueprint.md`, `planting-operation-guide.md` | Keep | Domain reference, 2026-03-31. |
| `ui-structure-principles.md`, `tailwind-design-research-implementation.md`, `lovable-design-migration-mapping.md` | **Archive candidates** | Design-research/migration-mapping docs, 2026-03-11, superseded by the current `DESIGN.md` + `gacp-design-tokens` skill. |
| `plant-document-comparison-matrix.md`, `phase2-qr-tracktrace-scope-plan.md`, `dbd-video-research-to-ui.md` | Keep (niche, low-risk) | Narrow-scope reference material, no evidence of superseding content found. |

---

## 11. `docs/manual/` (3 files) — the best newcomer/end-user doc in the repo, plus a redundant draft

| Path | Verdict | Why |
|---|---|---|
| `USER-MANUAL.md` | **Keep, feature prominently** | Current (2026-08-07, "ฉบับที่ 2"), screenshot-illustrated, 12 chapters covering every role, explicitly notes screenshots are from a test build with sample data. This is the single best piece of documentation found in the entire audit — link it from README. |
| `USER-MANUAL-SKELETON.md` | **Archive** | Explicitly self-described as a draft scaffold ("ห้ามเผยแพร่คู่มือฉบับนี้เป็นฉบับสมบูรณ์ก่อนเสียบภาพจริงครบ" — do not publish as complete until real screenshots are inserted), dated one day before the final `USER-MANUAL.md`. Its content purpose appears absorbed into the final manual; keeping both invites a newcomer to read the wrong one. |
| `VIDEO-STORYBOARD.md` | Keep | Different purpose (training-video planning), same date as the skeleton, not superseded by USER-MANUAL.md. |

---

## 12. `docs/adr/` (20 ADRs + README)

**Keep all 20** — this is a well-formed, valuable ADR set (multi-tenancy, offline-first, auth hardening, mobile shelving, deploy-pipeline gating, etc.), exactly the kind of decision record a newcomer benefits from. Only issue is the index (§2) being out of sync — fix the index, don't touch the ADRs. One note: `ADR-014` has three files (`ADR-014-multi-tenancy-foundation.md`, `ADR-014-phase-3-handoff.md`, `ADR-014-phase-e2-rls-decision.md`) — not a problem (phased ADR is a legitimate pattern) but the numbering makes it easy to miss that phase-e2 exists, which the missing README entry compounds.

---

## 13. `docs/standards/` (10), `docs/api/` (6), `docs/security/` (6), `docs/design/` (6), `docs/ux/` (6, all in §6), `docs/releases/` (8)

| Path | Verdict | Why |
|---|---|---|
| `docs/standards/vulnerability-exception-process.md` | Keep | Most recent (2026-07-25), active. |
| `docs/standards/repository-naming-and-structure.md` | Keep | Linked from root README, actively cited, 2026-04-22. |
| `docs/standards/{security-runtime-conventions,production-operability-standard,production-infrastructure-standard,legal-brand-content-conventions,agent-skill-authoring-standard}.md` | Keep | 2026-03-31, enforced conventions (agent-skill-authoring-standard is cited by `docs/readme.md` and matches current `.claude/skills/` structure — still in use). |
| `docs/standards/{architecture-nginx-rule,tailwind-mantine-consistency-playbook,interoperability-trust-layer}.md` | Keep, low-risk | Narrow/technical, no superseding content found; tailwind-mantine playbook worth a currency check against `DESIGN.md`'s explicit "mantine-* tokens are frozen" rule (likely still consistent, not verified line-by-line). |
| `docs/api/active-api-surface.md`, `docs/api/api-documentation.md` | Keep | The more complete API references vs. root `API-REFERENCE.md`'s abbreviated version — consider making one of these the canonical link from README instead. |
| `docs/api/error-codes.md` | Keep | Recent (2026-05-17). |
| `docs/api/{api-path-identity-policy,engineering-route-naming}.md` | Keep | Cited as canonical by the vocabulary map (§2) — fix the citing links, keep the files. |
| `docs/api/partner-trace-api-spec.md` | Keep | Public-facing API contract, 2026-03-11, low churn expected (public contracts change slowly) — not flagged stale without more evidence. |
| `docs/security/{incident-response-runbook,security-summary}.md` | Keep (verify currency) | See §6 exception note. |
| `docs/security/{secrets-catalog,pentest-prep,pdpa-erasure,pdpa-audit-checklist}-2026-05-16.md` | **Archive** | Part of the May 16 batch; secrets catalogs and pentest-prep docs go stale fast — flag as higher-risk-if-wrong than the average archive candidate, recommend the operator confirm nothing security-critical here is being relied on before archiving. |
| `docs/design/{ui-01-reference,auth-01-recon-prep}.md` | Keep | Current (2026-08-05). |
| `docs/design/*-2026-05-16.md` (4 files) | **Archive** | Part of the May 16 batch. |
| `docs/releases/go-live-gate-2026-06-02.md` | **Archive, but note it's good** | Well-written, explicitly self-aware ("This container ≠ production", corrects its own earlier "80%" framing), scoped to "Controlled launch (1 farm)" — but superseded by GOALS.md's newer G3 plan (50 farms / 3 provinces, 90-day horizon from 2026-08-07). Worth keeping as a model of *how to write an honest gate doc*, just not as the active one. |
| `docs/releases/{final-launch-readiness-review,post-implementation-verification-report,post-release-hypercare-plan,release-notes-audit-fix-v1,release-readiness-closeout-2026-02-22,release-evidence-pack-index}.md` | **Archive** | All March–April, one-time release-cycle artifacts. |
| `docs/releases/release-runbook.md` | Keep, verify currency | Generic runbook, 2026-03-31 — check against `docs/operations/deploy-runbook.md` (2026-08-14) for overlap/conflict; likely the operations one has superseded it. |

---

## 14. Everything else in `docs/` — single-topic files, quick verdicts

| Path | Verdict | Why |
|---|---|---|
| `docs/i18n-policy.md` | Keep | 2026-05-18, narrow policy doc, no superseding content found. |
| `docs/runbooks/role-canonicalization.md` | Keep | Recent (2026-08-01). |
| `docs/ci/preventive-controls.md` | Keep | Very recent (2026-08-14). |
| `docs/uat-prep/UAT-READINESS.md` | Archive (verify first) | 2026-06-05, likely superseded by August audit/gap docs — confirm nothing open before archiving. |
| `docs/context-prompts/application-system-remediation-context-2026-04-11.md` | **Cut candidate** | A one-off prompt-context file for a specific past remediation task; not documentation, a working artifact. |
| `docs/integration/partner-interoperability-api.md` | Keep | Recent (2026-07-08). |
| `docs/legal/payment-terms-th-v1.md` | Keep | Recent (2026-07-08), legally significant — don't touch without legal review regardless of date. |
| `docs/auth/{OAUTH-ENDPOINT-CONFORMANCE-2026-08-06,CREDENTIAL-REQUEST-DRAFT}.md` | Keep | Current (2026-08-06), active AUTH-01 workstream per QUEUE.md. |
| `docs/payment-refactor/{step2-data-model-design,legacy-payment-audit}.md` | Keep | Current (2026-08-02), active payment-rework thread. |
| `docs/tech-debt/{n-plus-one-audit,prisma-bypass-routes,known-test-issues}.md` | **Archive** | Part of May 16 batch (§6); tech-debt lists this stale risk giving a false sense of "known issues are tracked here" — the live equivalent is `AUDIT_LEDGER.md`. |
| `docs/dba/*.md` (4 files) | **Archive** | Part of May 16 batch. |
| `docs/accounting/*.md` (8 files) | **Archive** | Part of May 16 batch. |
| `docs/tax/*.md` (3 files) | **Archive** | Part of May 16 batch. |
| `docs/pdf/*.md` (3 files) | **Archive** | Part of May 16 batch. |
| `docs/customer-success/onboarding-help-center-2026-05-16.md` | **Archive** | Part of May 16 batch. |
| `docs/marketing/site-launch-checklist-2026-05-16.md` | **Archive** | Part of May 16 batch. |
| `docs/financial-documents/RECEIPT-DESIGN-SPEC.md` | **Archive** | 2026-05-15, same cluster. |
| `docs/handoff-package-2026-05-16.md`, `docs/cutover-checklist-2026-05-16.md` | **Archive** | Part of May 16 batch; superseded by current operations runbooks. |
| `docs/superpowers/plans/*.md` (11), `docs/superpowers/specs/*.md` (12) | **Keep, all of it** | This is the live plan/spec pipeline (`writing-plans`/`executing-plans` skill workflow) — dated through 2026-08-16 (today), directly tied to the current branch (`feat/m2a-requirement-engine`). The two oldest pairs (2026-04-21/22, repo-naming and health-wizard-contract-lockdown) are the only ones old enough to be "done and could eventually archive" — low priority, not urgent. |

---

## 15. `apps/**` docs (47 files)

| Path | Verdict | Why |
|---|---|---|
| `apps/web-app/README.md` | **Cut/replace** | Unedited `create-next-app` boilerplate since 2026-03-05. First file a newcomer opens under `apps/web-app/`. |
| `apps/mobile-app/README.md` | **Cut/replace** | Unedited `flutter create` boilerplate since 2026-03-05. Given `ADR-015` shelves the mobile app, replacing this with a one-paragraph pointer to ADR-015 would fully resolve it. |
| `apps/backend/` — no README | **Create (gap, not a flag-for-removal)** | The largest app in the monorepo has no entry-point doc at all; a newcomer lands directly in `modules/`, `services/`, `controllers/` with no orientation. |
| `apps/backend/services/PAYMENT_SERVICES_README.md` | **Keep, needs an update** | Genuinely excellent "which file is canonical" guide for a confusing area (7 payment service files) — but silent on the in-flight Stripe migration; see §0 finding 5. |
| `apps/backend/modules/README.md` + `modules/{application,audit,billing,certificate,document,identity,public}/README.md` (7 files) | Keep, note the gap | Documents an intended module-boundary architecture; `SYSTEM-REALITY-CHECK.md` found the `index.js` public-API surface for these modules is empty (`{}`) in 86% of cases. The READMEs describe the target, not (yet) the reality — worth one sentence in each noting current status, not a removal candidate. |
| `apps/backend/eslint-rules/NO-DIRECT-STATUS-WRITE-BASELINE.md` | Keep, but flagged in BACKLOG-FOUND.md already | `BACKLOG-FOUND.md:15` already notes this doc has a stale docstring elsewhere (unrelated file) — no action needed here beyond what's already tracked. |
| `apps/backend/data/source/PROVENANCE.md`, `apps/backend/keys/README.md`, `apps/backend/prisma/sql/README.md`, `apps/backend/prisma/migrations/CHANGELOG.md`, `apps/backend/prisma/migrations/_UNREGISTERED_SQL_WARNING.md`, `apps/backend/scripts/{herb-content,rls}/README.md`, `apps/backend/scripts/rls/extension-reference.md`, `apps/backend/assets/fonts/sarabun/README.md`, `apps/backend/data/tessdata/README.md`, `apps/backend/services/email/readme.md` | Keep | Narrow, correctly-scoped local READMEs next to the code they describe — the right pattern, no issues found. |
| `apps/backend/BACKLOG-FOUND.md` | **Investigate — possible duplicate** | A *second* file with the same name as the root `BACKLOG-FOUND.md`, inside `apps/backend/`. Not read in this pass; flag for the operator to check whether this is a stray duplicate/copy-paste artifact or a legitimate backend-scoped log. |
| `apps/web-app/src/features/{audit-system,traceability,permit-form}/readme.md`, `apps/web-app/docs/shared-utilities.md` | Keep | Local component-area docs, reasonable pattern. |
| `apps/mobile-app/lib/generated/api/**/*.md` (13 files), `apps/mobile-app/lib/generated/api/auth_health/README.md` | **Out of scope, not really "docs"** | Auto-generated OpenAPI client reference for a shelved app (ADR-015). Machine-generated, not hand-authored; a newcomer wouldn't naturally read these. No action needed — they cost nothing to leave and aren't part of the "confusion" problem this audit targets. |
| `apps/mobile-app/qa_strategy_plan.md` | **Archive** | 2026-03-05, pre-dates the ADR-015 shelving decision (2026-04-29); superseded by that ADR. |

---

## 16. Out of scope for the newcomer path (but not a problem — correctly separated already)

- **`reports/` (27 files)** — orchestrator/pm/payment-policy/qc-evidence/role-workflow-auditor/rules-audit/senior-swe work-product, per work item, exactly as `HARNESS.md`'s permission matrix intends ("reports/, evidence/: write (ของตัวเอง)"). Not documentation; process trail. No cleanup needed — this is working as designed.
- **`evidence/` (96 files)** — per-work-item evidence packs (screenshots/traces/`INDEX.md`) per `HARNESS.md` §5. Same as above — working as designed, not in scope for a "docs for newcomers" cleanup.
- **`.claude/skills/`, `.agent/skills/`, `.claude/agents/`, `.claude/commands/`, `.superpowers/`** (83 + more files) — agent-tooling configuration, consumed by Claude Code, not written for a human newcomer to read start-to-finish. Excluded from this inventory by design; a separate audit of skill-doc quality would be a different exercise.
- **`.claude/worktrees/`** (2,604 markdown files across 4 subdirectories) — confirmed via `git check-ignore` to be gitignored (`.gitignore:272`), i.e. local-only stale git-worktree checkouts, not part of the committed repository at all. Not a docs problem; flagging only so the operator knows this exists locally and can `rm -rf` it themselves outside of any repo operation (this audit does not touch it).

---

## 17. Recommended LEAN target structure

The operator's stated goal is a newcomer who can find "start here / architecture / how to run / how the domain works" without wading through process history. Recommend:

```
README.md                          — rewrite: fix dead links, drop "Production Ready" claim,
                                      point to GOALS.md for actual current state
PRODUCT.md                         — keep as-is (good)
DESIGN.md                          — keep as-is (good)
DEVELOPMENT-GUIDE.md               — keep, reconcile test-account details with README
docs/manual/USER-MANUAL.md         — keep, link from README (best doc in the repo)
docs/readme.md                     — rewrite as a real index: fix the one dead link,
                                      add entries for architecture/adr/standards/api,
                                      remove the "carpet-bomb-audit-baseline...latest" claim
docs/architecture/                 — keep the ~20 living/canonical files (§3.A);
                                      move the dated review/RFC files (§3.B/C) to archive
docs/adr/                          — keep all 20, fix README.md index (§0.1, §12)
docs/api/                          — keep, consolidate with root API-REFERENCE.md or
                                      make API-REFERENCE.md point to docs/api/active-api-surface.md
docs/operations/ + runbooks/       — keep as the one deploy/operate home;
                                      fold in anything unique from docs/deployment/, then retire it
docs/standards/                    — keep (all current or low-risk)
docs/contract/                     — keep entirely, separate "contract compliance" bucket,
                                      not part of engineer onboarding; flag the LIVE/production
                                      wording for the GOALS.md G3 honesty pass
docs/superpowers/{plans,specs}/    — keep, this is the live work-item pipeline
GOALS.md, CLAUDE.md, HARNESS.md,
HARNESS_LOG.md, AUDIT_LEDGER.md,
QUEUE.md, GAP-MAP.md,
BACKLOG-FOUND.md                   — keep at root, "process/governance" bucket,
                                      distinct from "learn the domain" bucket
archive/ (new, root-level)         — receive: AUDIT-REPORT.md, SYSTEM-AUDIT-REPORT.md,
                                      SYSTEM-REALITY-CHECK.md, PROMPT-PAYMENT-REWORK.md,
                                      PROMPT-W2-AUTONOMOUS-FLOW.md, docs/backlog/*,
                                      docs/testing/*(QA-log cluster), docs/deployment/*
                                      (after diff-check), the entire May-16 batch (§6),
                                      the April-28 audit wave (§4), docs/architecture's
                                      dated review batch (§3.B), docs/releases (except
                                      release-runbook.md pending its own check)
```

**Suggested newcomer reading order** (what actually answers "start here / architecture / how to run / how the domain works"):
1. `README.md` (once fixed)
2. `PRODUCT.md` — who this is for and why
3. `DEVELOPMENT-GUIDE.md` — how to run it
4. `docs/architecture/01-system-architecture-en.md` (or `-th.md`) + `docs/architecture/system-map.md` — how it's built
5. `docs/architecture/workflow-state-machine.md` — how the domain works (the certification lifecycle)
6. `docs/manual/USER-MANUAL.md` — what it looks like to actually use, screenshot by screenshot
7. `GOALS.md` — what's actually true today vs. aspirational
8. `CLAUDE.md` + `HARNESS.md` — how work gets done in this repo (process, not domain)

That's 8 documents instead of 391+20. Everything else is reference material a newcomer grows into, not a required read.

---

## Summary counts

| Bucket | Files | Verdict |
|---|---|---|
| Root-level docs | 20 | 15 keep, 5 archive |
| `docs/architecture/` | 57 | ~30 keep, ~27 archive (dated review batch) |
| `docs/audit/` + `docs/audit-reports/` | 61 | ~6 keep (August files + 2 July), ~55 archive |
| May-16 single-day batch (spans 12 dirs) | 61 | archive as unit (historical record, preserve together) |
| `docs/operations/` | 42 | ~25 keep (current runbooks), ~17 archive |
| `docs/deployment/` | 23 | 0-2 keep pending diff-check, rest archive |
| `docs/backlog/` | 13 | archive as unit |
| `docs/testing/` | 12 | 6 archive (QA-log cluster), 6 verify-then-decide |
| `docs/contract/` | 29 | keep all (separate bucket), 1 cluster flagged for honesty-pass |
| `docs/superpowers/` | 23 | keep all (live pipeline) |
| `docs/manual/` | 3 | 2 keep, 1 archive (superseded skeleton) |
| `docs/adr/` | 21 | keep all, fix index |
| Everything else in `docs/` | ~30 | mostly keep or small individual archives, see §13-14 |
| `apps/**` | 47 | 2 boilerplate READMEs to replace, 1 backend README gap, ~2 archive, rest keep |
| `reports/`, `evidence/`, skills/agents dirs | ~200 | out of scope, working as designed |
