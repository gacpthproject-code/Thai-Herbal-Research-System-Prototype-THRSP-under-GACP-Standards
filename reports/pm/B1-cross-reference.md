# B1 — Cross-reference: R2 D-items + AUTH-01 E-items vs. all decisions

**Owner:** PM · **Date:** 2026-08-05 · **Method:** read-only research workflow (4 agents, spot-verified vs code+git @ main 266cb35b) · **Counts:** E=8, D=24 labels, decisions=45

> Mandate B1: cross-reference D-1..13 + E-1..8 vs all decisions → report only what genuinely remains. Autopilot-started (in-queue, read-only, not BLOCKED).

---

# B1 — Cross-reference report: R2 D-items + AUTH-01 E-items vs. decision corpus

**Verification base:** origin/main HEAD `266cb35b`+ (git log re-checked live today; includes `3f8b7f8c` = merged PR #775 auto-deploy fix). Code claims spot-re-verified in this worktree: `auth.prisma:17` still `password String` (NOT NULL); `SUBMISSION_THRESHOLD = 3` still live at `apps/backend/modules/billing/internal/payment-constants.js:88`; grep for `reopenedFrom|CORRECTION_DEADLINE_EXPIRED|PAYMENT_ABANDONED|REOPEN_ENABLED` in `apps/backend` = **0 hits**.

---

## 1. Cross-ref table — AUTH-01 E-1..E-8

| id | asks (short) | verdict | cite |
|---|---|---|---|
| E-1 | password nullable vs sentinel (BLOCKER-1) | **STILL-OPEN (code task)** — policy decided (nullable, DECISIONS-CROSSREF.md:105-108) but zero implementation: `auth.prisma:17` still NOT NULL; 4 bcrypt call sites untouched; plan.md:13 explicitly deferred it; AUTH-01-A took a different path and states it doesn't touch password (contract-cid-demotion.md:1-6, 121-137) | A0-blockers.md:11; QUEUE.md:24 overstates |
| E-2 | "Health ID" = existing model or new? | **RESOLVED** — existing User model + healthId column; interpretive only, code consistent (identity_links CHECK accepts existing User rows) | DECISIONS-CROSSREF.md:110-111; contract-cid-demotion.md:16-18 |
| E-3 | relax identity-conflict guard for ThaID dual-role (BLOCKER-3) | **RESOLVED** — deliberately left untouched; ThaID stays coming_soon; dual-role question deferred until ThaID flips enabled. Code confirms guard intact | DECISIONS-CROSSREF.md:113-115; prisma-auth-service.js:336-337 |
| E-4 | localStorage ban scope | **STILL-OPEN (code task, possibly orphaned)** — operator answered strictest (cookie-only, all providers, DECISIONS-CROSSREF.md:148-150) and scoped as P3 (plan.md:23-26), but P3 never dispatched, `auth-service-session.ts` still localStorage-primary, and P3 is absent by name from QUEUE.md's SSOT queue (lines 269-308) | auth-service-session.ts:14-149 |
| E-5 | valid re-auth for OAuth session in PDPA §33 deletion | **BLOCKED (operator — document wait)** — waiting on the citizen-facing Health ID manual; explicitly NOT a legal-letter wait | manual-citations.md:9; DECISIONS-CROSSREF.md:129-134; pdpa-service.js:262-268,297-302 |
| E-6 | password-reset flow as IdP bypass | **STILL-OPEN (code task)** — policy decided (gate on provider state, refuse reset for external-subject accounts, DECISIONS-CROSSREF.md:117-119) but zero code: password-management.js:27-179 unchanged since pre-AUTH-01 (last touch 619bd56e) | A0-blockers.md:67-70 |
| E-7 | route-path SSOT: doc vs code | **RESOLVED** — code is SSOT (`/auth/health/login`, `/auth/provider/login` pinned); drifted doc → docs backlog | DECISIONS-CROSSREF.md:121-123; auth-routes.ts:1-2 |
| E-8 | auto-provision check scope | **RESOLVED + SHIPPED** — scoped to OAuth path only; implemented and merged (PR #730, 52cd0bc8) with test pin (auth-idp-routes.test.js:479-484); admin API explicitly out of scope | DECISIONS-CROSSREF.md:125-127; auth-idp.js:344-349 |

## 2. Cross-ref table — R2 D-1..D-13 (blocked-decisions.md numbering)

| id | asks (short) | verdict | cite |
|---|---|---|---|
| D-1 | reopen pays again or reuses payment? | **RESOLVED** — path (ก): free reopen, no new billing chain, old case terminal forever. (Carry-scope mechanics later superseded → see D-1-CONSERVATION) | decisions-final.md:8-13 |
| D-1-CONSERVATION | reinterpret money pin as per-milestone conservation | **BLOCKED (operator)** — orchestrator proposed it but wrote verbatim "ต้องให้ operator ยืนยัน... ถ้า operator ไม่ยืนยันข้อนี้ ห้าม implement กลไก 2"; no confirmation found anywhere through HEAD | legal-flags-cleared-2026-08-03.md:44-60 |
| D-2 | R2 vs waiver-reopen coexistence (L4) | **RESOLVED** — coexist, waiver code untouched, not deprecated | legal-flags-cleared-2026-08-03.md:20-30,62-64; decisions-final.md:25 |
| D-3 | createdBy = providerId or User.id? | **RESOLVED** — User.id UUID, per existing doctrine | DECISIONS-CROSSREF.md:37-39 |
| D-4 | CANCELLED maps to what status? | **SUPERSEDED** — narrowed to `closedReason=CORRECTION_DEADLINE_EXPIRED` (item-5 cron only); legacy writers → BACKLOG. Decided, not coded (M4) | final-requirements.md:31; decisions-final.md:17 |
| D-5 | REJECTED/CERTIFIED also reopen-eligible? | **SUPERSEDED** — same narrowing structurally excludes both; conclusion unchanged | final-requirements.md:31; DECISIONS-CROSSREF.md:45-47 |
| D-6 | "Admin only" gate — technical + legal (L2) | **SUPERSEDED** — FINAL item 6 removed the approval leg entirely, nothing left to gate. ⚠ see CONTRADICTION #4 below re: the L2 legal-question residue | final-requirements.md:18-24; legal-basis.md:11-12 |
| D-7 | reopen fields visible to applicant? (L1) | **RESOLVED** — visibility follows existing case-access rules; L1 moot (no approval leg) | decisions-final.md:29; gap-report.md:137,151 |
| D-8 | reopenedFrom: FK, scalar, or JSON? | **RESOLVED** — nullable self-relation FK + back-relation. Not coded (mechanism 2, unstarted) | DECISIONS-CROSSREF.md:59-61 |
| D-9 | carry-over vs NOT NULL columns (L3) | **RESOLVED** — carry-over = officer's per-reopen choice with recorded reason, no hardcoded list; supersedes the earlier "split identity/content" shortcut | legal-flags-cleared-2026-08-03.md:20-21,36-42,66 |
| D-10 | void idiom for approval record | **SUPERSEDED** — no approval record exists anymore (FINAL item 6); plain append-only applies | final-requirements.md:30 |
| D-11 | attachment reqs + PDPA-vs-immutable conflict | **RESOLVED** — legalHold/retainUntil EXPAND, auto-hold, detachAllByUploader skips held rows; retention = indefinite-until-human-release. Not coded (M5) | decisions-final.md:21; legal-flags-cleared-2026-08-03.md:72-76,88 |
| D-12 | application-number format for reopened case | **RESOLVED** — reuse `ensureApplicationNumber()`, no new prefix | DECISIONS-CROSSREF.md:68-70 |
| D-13 | REOPEN_ENABLED scope / FE flag / cross-org | **RESOLVED** — flag gates route only (fail-closed 503), FE reads from API, cross-org disallowed. Not coded | DECISIONS-CROSSREF.md:72-74 |
| ~~D-14~~ | — | **DOES NOT EXIST** — grepped repo-wide, 0 hits; task brief's "D-1..13" is the correct span | reader note 1 |

## 3. Cross-ref table — decisions-final.md's own D-1..D-9 (⚠ ID-collision set)

| id | asks (short) | verdict | cite |
|---|---|---|---|
| D-1(df) | detailed money mechanics + fixed carry list | **SUPERSEDED** (carry-scope half) — fixed list → officer per-case choice; free-reopen core stands; test-pin reinterpretation open → D-1-CONSERVATION | legal-flags-cleared-2026-08-03.md:36-42 |
| D-2(df) | repeal 3-correction cap | **RESOLVED, not coded (M6)** — `SUBMISSION_THRESHOLD=3` still live (payment-constants.js:88, re-verified); APPLICATION_EXPIRED text unchanged (notification-service.js:200-207) | decisions-final.md:15; QUEUE.md:229 |
| D-3(df) | cron-closure marker definition | **RESOLVED, not coded (M4)** — `CORRECTION_DEADLINE_EXPIRED`, grep = 0 hits | decisions-final.md:17,64 |
| D-4(df) | role gate: role-wide or assigned-only | **RESOLVED, not coded (mech-2/S6)** — assigned-only, by stage, with rejection test pin | decisions-final.md:19 |
| D-5(df) | legal-hold semantics | **RESOLVED, not coded (M5)** — same ruling as D-11 above | decisions-final.md:21 |
| D-6(df) | append-only scope | **RESOLVED, not coded (M7)** — covers applications.js:892-943 + review-revision merge | decisions-final.md:23 |
| D-7(df) | waiver code + ad-copy | **RESOLVED, not coded (M6)** — code untouched (correct); neutral rewording of notification text NOT yet done | decisions-final.md:25; notification-service.js:200-207 |
| D-8(df) | 5-business-day clock atomicity | **RESOLVED + SHIPPED** — M2, commit 0fd5077a, PR #732 | decisions-final.md:27; orchestration-log.md:20-23 |
| D-9(df) | permanent letter entity | **RESOLVED + SHIPPED** — M1, Notification.kind=OFFICIAL_LETTER, commit b3d1a945, PR #731 | decisions-final.md:29; orchestration-log.md:19-20 |
| PAYMENT-CLOSURE | 30-day auto-close of unpaid | **RESOLVED, not coded (M5)** — marker `PAYMENT_ABANDONED`, not reopen-eligible; 30-day value → config/business-rules.js, no legal letter needed | decisions-final.md:31; legal-flags-cleared-2026-08-03.md:68-70 |

---

## 4. CONTRADICTIONS + thin-evidence flags

1. **QUEUE.md:22 vs legal-flags-cleared-2026-08-03.md** — QUEUE.md still reads "Waiver-coexist... ค้าง รอหนังสือหารือนิติกรกรมฯ ห้าม assume" but the later same-day ACTIVE doc resolves the waiver half ("อยู่ร่วมกันได้ ไม่แตะ", :22,62-64,93). **QUEUE.md:22 needs editing** to split the resolved waiver half from the still-murky role-definition half. Do not re-park the waiver item.
2. **QUEUE.md:24 "APPLIED 6 ข้อ (E-1..E-3, E-6..E-8)"** overstates: accurate only as "policy questions answered." E-1 and E-6 are literally unimplemented on main.
3. **QUEUE.md AUTH-01 row "PR #730 รอ merge"** — stale; git log shows #730 merged (52cd0bc8).
4. **D-6/L2 residue** — legal-flags-cleared's title covers only L1/L3/L4; DECISIONS-CROSSREF.md:53 (09:10, pre-supersession) still lists "ครึ่ง policy ของ D-6" as legal-pending and was never revisited. The trigger (Admin-gated approval) is gone, but no document explicitly declares the underlying legal question closed. Recommend explicit operator confirmation rather than closed-by-silence.
5. **PR #746 status — inputs disagreed; resolved by git**: the AUTH-01 reader's note said #746 was "REJECTED at 3rd audit round, NOT merged," but `git log origin/main` shows merge commit `0e093d0a` "Merge pull request #746" **is on main**. The audit-round3 verdict evidently refers to something later/other than the merge state, or the note is wrong. **Mark: needs a look** — reconcile audit-round3-verdict.md against `0e093d0a` before trusting either narrative.
6. **A11-URGENT auto-deploy flag** (QUEUE.md commit 24001540) — appears already addressed: merge commit `3f8b7f8c` "Merge pull request #775 fix/ci-no-autodeploy-on-push" is on origin/main (verified live). QUEUE.md's flag can likely be closed, but confirm the merged diff actually removes both `deploy-staging` and `promote-deploy-branch` push-triggers — **unverified beyond the commit title, needs a look**.

---

## 5. สิ่งที่เหลือจริง (genuinely remaining)

### Operator decisions (nothing else can move these)

| # | item | what's blocking | who acts | blocks |
|---|---|---|---|---|
| 1 | **D-1-CONSERVATION** — confirm per-milestone money-conservation pin reinterpretation | Orchestrator proposal awaiting explicit yes/no; verbatim "ห้าม implement กลไก 2" without it (legal-flags-cleared:44-60) | **Operator** | **The single gate on R2 mechanism 2** (reopen schema/endpoint/list view). Does NOT block M4-M7 (:103-104). Since QUEUE lock order is กลไก 1 → กลไก 2 → AUTH-01 P3-P5, this transitively holds up the AUTH-01 tail too |
| 2 | **M3b evidence-integrity finding F3** — 3-cycle circuit breaker STOPPED | Accept the evidence gap or reopen a 4th cycle (audit-report-round3.md F3; BACKLOG-FOUND.md:21, f5961121) | **Operator** | Process/evidence closure only; no code path |
| 3 | **D-6/L2 residual** — declare the role-authority legal question formally closed | Contradiction #4 above | **Operator** (one-line ruling) | Nothing technically; hygiene to prevent re-blocking |

### External/document waits (not legal letters)

| # | item | what's blocking | who acts | blocks |
|---|---|---|---|---|
| 4 | **E-5** — PDPA §33 re-auth for OAuth users | Citizen-facing Health ID manual not yet supplied (manual-citations.md:9) | **Operator supplies document** | PDPA deletion for external-IdP users; not a Golden Path hop |
| 5 | **B1-CRED** — production client_id/secret for healthid/providerid/thaid | Government registrations awaiting Director-General approval (mandate.md:58; manual-citations.md:159) | **Operator + government** | Flipping any real provider from coming_soon → enabled |
| 6 | **D-MANUAL-HASHCID** — is hash_cid = sha256(CID)? | สธ. confirmation outstanding (manual-citations.md:85,93) | **Operator asks สธ.** | Real Provider-ID account linking (currently fail-safe at AUTH_LINKING_PENDING); also gates the AUTH-01-A "CONTRACT phase" that would finally implement E-1 |

### Decided-but-unbuilt code tasks (no decision missing — just work)

| # | item | scope | blocks |
|---|---|---|---|
| 7 | **R2 M4-M7** — cron marker (M4), PAYMENT_ABANDONED + legal-hold (M5), repeal 3x-cap + notification rewording (M6), append-only (M7) | All fully specced; grep = 0 hits; stale artifacts confirmed live (`SUBMISSION_THRESHOLD=3`, old waiver pitch text) | Unblocked and ready now per LEGAL-CLEAR-verdict; M6's stale farmer-facing text is actively wrong messaging until fixed |
| 8 | **E-1** — password nullable EXPAND + 4 fail-closed bcrypt sites + RED tests | Decided; deferred by plan.md:13; also entangled with #6 above | Health-ID first-login auto-provision (BLOCKER-1 literally still true on main) |
| 9 | **E-6** — provider-gate forgot/reset/change-password | Decided; zero code | IdP-bypass hole remains as long as external providers stay coming_soon (latent, not yet exploitable) |
| 10 | **E-4 / P3** — cookie-only FE session rewrite | Decided (strictest option) but **never dispatched and absent from QUEUE.md's SSOT queue (lines 269-308) — likely orphaned; flag to operator to re-enqueue explicitly** | Security posture of all existing sessions; queued behind กลไก 1→2 per lock order |

**C-lane note:** none of the above gates C1/Stripe work — C-lane's own gates are GAPMAP-D4 (slip-rail retire condition) and the GAP-MAP §7 S1-S5 contract, which are outside the D/E sets. GAPMAP-D3 (PromptPay-only) is DONE (bba7b71f, PR #774) — do not re-open.

**Bottom line:** of 8 E-items and 24 D-labels, only **one operator decision (D-1-CONSERVATION)** truly gates new mechanism work; everything else remaining is either an external document/credential wait (E-5, B1-CRED, HASHCID), already-decided implementation backlog (M4-M7, E-1, E-6, P3), or bookkeeping hygiene (QUEUE.md lines 22/24, PR #746 narrative, L2 closure note, M3b F3 ruling).