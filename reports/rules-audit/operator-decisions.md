# Operator decisions — rules audit 2026-08-14 (wave 1C)

Source: `evidence/rules-audit-2026-08-14/raw-result.txt`, rows with
`fixable_by_agent: false`, plus the rows that land on operator-owned surfaces
(`CLAUDE.md`, `HARNESS.md`, `scripts/probes/probe-registry.txt`, `AUDIT_LEDGER.md`,
`GOALS.md`) which an agent may not edit under L6 no matter who classified them.

**Every line number and file fact below was re-verified in this session** on branch
`chore/rules-wave1` (HEAD `ec17b4af` at the time of writing); where a claim came
from running something, the command and its output are quoted. Nothing here is
taken from the audit on trust.

Nothing in this file has been applied. Each row is a proposed diff for the
operator to accept, edit, or reject.

## Index

| # | rule / where | verdict | risk if left as-is |
|---|---|---|---|
| D-01 | L2 enforcement names "CI job TruffleHog" — `CLAUDE.md:39` | CONFLICTS | The law names a layer that cannot run; readers believe deep secret scanning is covered |
| D-02 | L1 report-integrity pointer "registry:48 รอ operator เสียบ CI" — `CLAUDE.md:38` | STALE | Pointer resolves to the wrong row; "เสียบ CI" names a plug point that no longer exists |
| D-03 | L5 "CI ล่ม = ห้าม merge โค้ด" — `CLAUDE.md:42` | CONFLICTS | Read literally, bans every code merge forever — so it gets ignored, and an ignored law is worse than none |
| D-04 | L5 deploy enforcement "workflow_dispatch only + promote if:false `[ACTIVE]`" — `CLAUDE.md:42` | CONFLICTS | `[ACTIVE]` is claimed for a guard on a machine that never starts; real deploy governance is invisible in the law |
| D-05 | tier-check unlock "ปลดเมื่อ fetch-depth:0" — `CLAUDE.md:42` + `probe-registry.txt:39` | STALE | Unmeetable condition; on 2026-09-16 probe-gate reddens demanding it |
| D-06 | §5 DoD ชั้น B "CI เขียวจริงบน runner" + "fallback ช่วง Actions ล็อก" — `CLAUDE.md:52` | CONFLICTS | The Definition of Done for ordinary code names an impossible primary path |
| D-07 | Permission matrix: staging access "ผ่าน self-hosted runner + Actions workflow เท่านั้น" — `HARNESS.md:36` | CONFLICTS | As written the agent has no lawful route to the box at all, while a practiced route exists undocumented |
| D-08 | `evidence-complete` extension still tagged `[BUILD]` — `HARNESS.md:92`, `:102` | STALE | Understates real enforcement; invites someone to "build" what exists |
| D-09 | `path-guard` specced as a CI job checking PR labels — `HARNESS.md:97` | STALE | Built to spec it would enforce nothing; L5/L6 keep citing it as future cover |
| D-10 | §4.1/§4.3 probe tables omit `gate-attestation`, `main-attestation-audit`, `deploy-drift` — `HARNESS.md:58-88` | STALE | The human-readable index hides the three probes that carry today's gate story |
| D-11 | Registry vocabulary "ci = รันใน CI ทุก PR" — `probe-registry.txt:15` | STALE | Every row's run column is read against a definition that no longer describes anything |
| D-12 | `no-secret` row: "layer2 = TruffleHog job ในรันเดียวกัน → probe คืน PASS เองเมื่อ CI=1" — `probe-registry.txt:26` | CONFLICTS | Documents a false-PASS path; any box exporting `CI=1` mints a two-layer PASS for a scan that did not happen (L2 violation) |
| D-13 | Comment block describing the dead `enforcement-guardrails` Actions job — `probe-registry.txt:33-36` | STALE | Explains three parked probes by an environment that cannot exist |
| D-14 | `settle-webhook-only` manual-until:2026-09-15 — `probe-registry.txt:37` | STALE | Expiry reddens probe-gate on 2026-09-16 demanding a wiring that cannot happen as described |
| D-15 | `webhook-idempotent` manual-until:2026-09-15 — `probe-registry.txt:38` | STALE | Same |
| D-16 | `tier-check` manual-until:2026-09-15 — `probe-registry.txt:39` | STALE | Same, plus L5's "tier decided only by tier-check" has no automated leg anywhere |
| D-17 | `suite-green` permanent manual, reason cites Actions job `Test` — `probe-registry.txt:42` | STALE | A permanent cover whose written justification is false — the phantom the registry header forbids |
| D-18 | `report-integrity` manual-until:2026-09-15, unlock already met probe-side — `probe-registry.txt:51` | STALE | Gate goes red 2026-09-16 for a decision nobody made |
| D-19 | Ratchet baseline `env-direct: 169` — `AUDIT_LEDGER.md:8` | STALE | Baseline sits 1 above measured; a real regression can hide inside the gap |
| D-20 | Ratchet baseline `dup-source: 4` — `AUDIT_LEDGER.md:9` | STALE | Baseline sits 2 above measured; two new duplicate SSOTs could land green |
| D-21 | L-001 listed open, Burned table empty — `AUDIT_LEDGER.md:20`, `:27-30` | STALE | Debt burn-down is invisible; HARNESS §4.2's "Burned must not be empty" quota looks unmet |
| D-22 | L-004 points operator effort at the dead Actions deploy job — `AUDIT_LEDGER.md:23` | DEAD | Open finding that can never be actioned; dilutes the open list |
| D-23 | G0 "เครื่องพิสูจน์กลับมามีชีวิต (ภายใน 7 วัน)" — `GOALS.md:23-29`, `:58` | CONFLICTS | G0 gates all feature work (`GOALS.md:64`); an un-closeable G0 is a permanent feature freeze |
| D-24 | GAP-MAP advises walking GP-3/4/6b via `PAYMENT_ADAPTER=mock` — `GAP-MAP.md:25`, `:91` | CONFLICTS | Simulated settles in an operator-facing walk contradict "nothing simulated user-facing" |
| D-25 | DTAM tax-ID / PromptPay literals as code fallbacks — `apps/backend/config/invoice-issuers.js:283`, `:383` | open question (money, Tier C) | Money documents can be issued under a legal identity nobody re-confirmed |

---

## D-01 · CLAUDE.md:39 — L2 enforcement names a job that cannot run

**Why stale:** the enforcement cell ends with `CI job TruffleHog`. That job lives in
`.github/workflows/security-scan.yml`, and hosted Actions is permanently unavailable
(`HARNESS_LOG.md` 2026-08-14). The real second layer today is gitleaks: locally in
`scripts/probes/no-secret.sh`, and full-history as the **required** full-gate check
`secret-scan-deep` (`scripts/ci/full-gate-checks.txt:44`, verified this session).

```
OLD:  `no-secret` `[ACTIVE]` fail-loud เมื่อ deep scanner ไม่มี — ห้าม PASS เงียบ · CI job TruffleHog
NEW:  `no-secret` `[ACTIVE]` fail-loud เมื่อ deep scanner ไม่มี — ห้าม PASS เงียบ · full-gate `secret-scan-deep` (gitleaks ทั้ง history, required — scripts/ci/full-gate-checks.txt:44)
```

**Risk of leaving it:** the law itself certifies a control that cannot fire, and D-12
(the probe's `CI=1` self-PASS) keeps its cover story.

---

## D-02 · CLAUDE.md:38 — L1 report-integrity pointer

**Why stale:** the row now sits at `probe-registry.txt:51` (verified), not `:48`; and
"เสียบ CI" means a PR job that no longer exists. The plug points that do exist are
full-gate's `probe-ci` (`full-gate-checks.txt:45`) and `check-done.sh`'s DEFAULT list
(`scripts/check-done.sh:12` — verified: `report-integrity` IS in DEFAULT, `tier-check`
is not).

```
OLD:  `report-integrity` `[MANUAL]` (เงื่อนไขปลดทำแล้ว — registry:48 รอ operator เสียบ CI)
NEW:  `report-integrity` `[MANUAL]` (เงื่อนไขปลดทำแล้ว — registry:51 · เหลือ operator ชี้ REPORT_INTEGRITY_TARGET ต่อ run แล้วย้ายแถวเป็น ci ให้ probe-gate/full-gate รัน)
```

**Risk of leaving it:** a reader following the pointer lands on the wrong row and
concludes the harness is lying about its own registry.

---

## D-03 · CLAUDE.md:42 — "CI ล่ม = ห้าม merge โค้ด"

**Why stale:** with Actions permanently down, read literally this bans every code merge
forever. The sanctioned gate is full-gate on the staging box, whose output
`evidence/gate/<sha>.json` is checked by the `ci` probe `gate-attestation`
(`probe-registry.txt:29`, runbook `docs/operations/runbooks/full-gate-on-staging.md`,
both verified present).

```
OLD:  CI ล่ม = ห้าม merge โค้ด (fallback ใน §5)
NEW:  ไม่มี full-gate attestation ของ HEAD (evidence/gate/<sha>.json — probe `gate-attestation`) = ห้าม merge โค้ดที่แตะ path ใน full-gate-checks.txt
```

**Risk of leaving it:** a law nobody can obey gets treated as decorative, and the habit
spreads to the laws that matter.

---

## D-04 · CLAUDE.md:42 — deploy enforcement entry

**Why stale:** `workflow_dispatch only + promote if:false (#775)` is tagged `[ACTIVE]`,
but a trigger shape on a platform that never dispatches enforces nothing. Real deploy
governance today: the on-box runbook plus the probe `deploy-drift`, which the operator
flipped to `ci` **and** to full-gate `required` on 2026-08-14
(`probe-registry.txt:50`, `full-gate-checks.txt:47` — both verified).

```
OLD:  deploy: `workflow_dispatch` only + promote `if:false` (#775) `[ACTIVE]`
NEW:  deploy: build/deploy บนเครื่องตาม runbook build-images-on-the-box.md + probe `deploy-drift` (ci, full-gate required) `[ACTIVE]` — deploy สั่งโดย operator เท่านั้น · workflow_dispatch/promote `if:false` เก็บไว้เป็นรูปทรงที่ถูกต้องเผื่อ Actions กลับมา (ไม่ใช่ enforcement วันนี้)
```

**Risk of leaving it:** the law credits a dead guard, so the live one (`deploy-drift`
going red when staging lags) looks like noise instead of the control it is.

---

## D-05 · CLAUDE.md:42 + probe-registry.txt:39 — tier-check unlock condition

**Why stale:** `fetch-depth: 0` is an `actions/checkout` knob. The second half of the
condition is genuinely unmet: `scripts/check-done.sh:12` DEFAULT contains no
`tier-check` (verified — the list is `suite-green no-skip no-secret ratchet
stripe-sdk-isolated webhook-idempotent settle-webhook-only holiday-single-source
stripe-keys-ready drain-complete money-equation crawler-clean evidence-complete
report-integrity`). The probe itself works wherever `origin/main` resolves and BLOCKs
honestly otherwise.

CLAUDE.md:42 annotation:

```
OLD:  `tier-check` `[MANUAL]` (ปลดเมื่อ fetch-depth:0 + เข้า DEFAULT check-done)
NEW:  `tier-check` `[MANUAL]` (ปลดเมื่อเข้า probe-ci ของ full-gate — checkout เต็มบนเครื่อง staging มี origin/main — และเพิ่มเข้า DEFAULT ใน check-done.sh:12)
```

Registry row (see also D-16):

```
OLD:  tier-check             | manual-until:2026-09-15 | - | operator | ต้องการ `origin/main` ref เทียบ merge-base — actions/checkout ตื้น (fetch-depth 1) ทำให้คืน BLOCKED เสมอ = ไม่มี signal · ปลดเมื่อตั้ง fetch-depth: 0 · ⚠️ ยังไม่อยู่ใน DEFAULT ของ check-done.sh ด้วย (ช่องโหว่ที่ทะเบียนนี้จับได้)
NEW:  tier-check             | manual | -                 | operator | ต้องการ `origin/main` ref เทียบ merge-base · บริบทที่ไม่มี origin/main คืน BLOCKED = ไม่มี signal (ไม่ใช่ FAIL) · ยืนพื้น: รันตอนตัดสิน tier โดยผู้ merge ตาม L5 · ⚠️ ยังไม่อยู่ใน DEFAULT ของ check-done.sh:12 — ถ้า operator สั่งให้เข้า full-gate probe-ci ให้ย้ายแถวนี้เป็น ci พร้อมกัน
```

**Risk of leaving it:** on 2026-09-16 probe-gate reddens (`scripts/ci/probe-gate.js:153-158`)
demanding a knob that cannot be set, and the usual reflex will be to re-sign a new date
rather than fix the hole — L5's "tier decided only by tier-check.sh" stays unenforced.

---

## D-06 · CLAUDE.md:52 — §5 DoD ชั้น B

**Why stale:** the primary gate is "CI เขียวจริงบน runner" and the fallback is framed as
temporary ("ช่วง Actions ล็อก"). Both describe a world that ended on 2026-08-14. The
proven path is full-gate on the staging box producing `evidence/gate/<sha>.json`.

```
OLD:  CI เขียวจริงบน runner (full suite + ratchet ไม่เพิ่ม) + `engineering:review` + `security-review` · fallback ช่วง Actions ล็อก (operator 2026-08-06): `LOCAL_GATE_FULL=1 local-gate.sh` + review 2 ชั้น
NEW:  full-gate บนเครื่อง staging (runbook full-gate-on-staging.md) PASS ครบ required checks = attestation `evidence/gate/<sha>.json` ที่ `gate-attestation` ตรวจได้ + `engineering:review` + `security-review` · fallback นอกเครื่อง (งานที่ไม่แตะ path ที่ full-gate ครอบ): `LOCAL_GATE_FULL=1 local-gate.sh` + review 2 ชั้น
```

**Risk of leaving it:** the DoD every ordinary code change is judged against is
unreachable as written, so each work item invents its own standard.

---

## D-07 · HARNESS.md:36 — how anyone reaches the staging box

**Why stale:** the only permitted agent path is "self-hosted runner + Actions workflow
เท่านั้น". That path is gone, so as written the agent has no lawful route at all, while
the route actually used since 2026-08-14 is operator-executed runbooks
(`build-images-on-the-box.md`, `full-gate-on-staging.md` — both present).

```
OLD:  | สั่งงานบนเครื่อง staging | ผ่าน self-hosted runner + Actions workflow เท่านั้น (ไม่มี SSH ตรง — L-008) | — | SSH ตรงได้ |
NEW:  | สั่งงานบนเครื่อง staging | เสนอคำสั่งตาม runbook ให้ operator รัน (ไม่มี SSH ตรง — L-008 · คำสั่งคนละเครื่องห้ามอยู่บล็อกเดียวกัน — HARNESS_LOG.md 2026-08-14) | — | SSH ตรงได้ |
```

**Risk of leaving it:** the rule that is supposed to keep agents off the box instead
describes a road that does not exist — so the real working arrangement is unwritten and
unreviewed.

---

## D-08 · HARNESS.md:92 and :102 — `evidence-complete` extension is already built

**Why stale:** verified this session at `scripts/probes/evidence-complete.sh:11-16` —
when `UI_ITEM=1` the probe fails on empty `trace/`, `video/`, `screenshots/` or a
missing `crawler-report.json`. The `[BUILD]` tag understates real enforcement.

```
OLD (:92):   - enforcement: ขยาย `evidence-complete` — งาน UI ที่ screenshots/ ว่าง = FAIL `[BUILD]`
NEW (:92):   - enforcement: `evidence-complete` ทำแล้ว — `UI_ITEM=1` แล้ว trace/ video/ screenshots/ ว่าง หรือไม่มี crawler-report.json = FAIL (`scripts/probes/evidence-complete.sh:11-16`) `[ACTIVE ผ่าน probe-gate/check-done]`
OLD (:102):  | `evidence-complete` (ขยาย) | งาน UI: screenshots/ ไม่ว่าง + INDEX.md + SHA/วันที่ | §4.4 |
NEW (:102):  (ลบแถวนี้ออกจากรายการ [BUILD] — งานเสร็จแล้ว ดู §4.4)
```

**Risk of leaving it:** a `[BUILD]` list that contains finished work trains readers to
ignore the list.

---

## D-09 · HARNESS.md:97 — `path-guard` as specced cannot exist

**Why stale:** the spec is "CI job + PR label ที่ operator ติด". Both halves require
GitHub Actions and the PR UI. The path-classification half already exists in
`scripts/probes/tier-check.sh` (C_STRUCTURAL patterns).

```
OLD:  | `path-guard` (CI job) | PR แตะ path Tier C/operator-owned โดยไม่มี label ที่ operator ติด = FAIL | L5, L6 |
NEW:  | `path-guard` (probe — รันโดย probe-gate/full-gate) | diff เทียบ origin/main แตะ path Tier C/operator-owned โดยไม่มี artifact ยืนยันจาก operator = FAIL (label ใช้ไม่ได้ ไม่มี Actions/PR UI) · ใช้การจำแนก path จาก tier-check.sh | L5, L6 |
```

**Risk of leaving it:** the one machine guard L5/L6 point at for Tier-C protection is
specced against dead infrastructure, so it stays unbuilt with an honest-looking excuse.

---

## D-10 · HARNESS.md:58-88 — probe tables omit the three probes that matter most today

**Why stale:** verified by grep — `gate-attestation`, `main-attestation-audit` and
`deploy-drift` appear **nowhere** in HARNESS.md, yet all three are `ci` rows in the
registry (`:29`, `:30`, `:50`) and the last two carry the current gate/deploy story.

```
Add to §4.1/§4.3 (or replace both tables with a pointer):

| `gate-attestation`       | ci | HEAD ที่แตะ path ใน full-gate-checks.txt ต้องมี evidence/gate/<sha>.json ที่ผูก SHA เป๊ะ | §5 |
| `main-attestation-audit` | ci | ไล่ first-parent บน main 30 commit ล่าสุดที่แตะ apps/ แล้วรายงานตัวที่ไม่มี attestation | §5 |
| `deploy-drift`           | ci | commit ที่แต่ละบริการรันอยู่จริง เทียบ ref ใน deploy-targets.txt (full-gate required) | L5 |

หรือแทนทั้งสองตารางด้วย: "รายการครบอยู่ที่ scripts/probes/probe-registry.txt เท่านั้น — ตารางนี้เป็นสรุป ไม่ใช่ทะเบียน"
```

**Risk of leaving it:** the human-readable index disagrees with the machine registry;
whoever reads HARNESS.md first gets an outdated picture of what is enforced.

---

## D-11 · probe-registry.txt:15 — what `ci` means

**Why stale:** there are no PR-triggered runs. `ci` today means "executed by
`node scripts/ci/probe-gate.js`", which runs inside `scripts/ci/local-gate.sh:30`
(verified) and as the required full-gate check `probe-ci` (`full-gate-checks.txt:45`).

```
OLD:  #   ci                        รันใน CI ทุก PR
NEW:  #   ci                        รันโดย probe-gate.js ทุกครั้งที่ local-gate/full-gate ทำงาน (ไม่มี hosted CI อีกต่อไป — HARNESS_LOG.md 2026-08-14)
```

**Risk of leaving it:** every row in the registry is read through a definition that
points at nothing, which makes "why isn't this running?" unanswerable.

---

## D-12 · probe-registry.txt:26 — the `no-secret` two-layer story

**Why stale / dangerous:** `scripts/probes/no-secret.sh:31-35` returns PASS whenever the
environment exports `CI`, crediting "layer2 = TruffleHog job in this CI run". That job
can never run. Any machine with `CI=1` therefore mints a two-layer PASS for a deep scan
that did not happen — the exact silent pass L2 forbids, on the probe L2 cites.

```
OLD:  no-secret              | ci     | -                 | -        | layer1 grep; layer2 = TruffleHog job ในรันเดียวกัน → probe คืน PASS เองเมื่อ CI=1
NEW:  no-secret              | ci     | -                 | -        | layer1 grep; layer2 = gitleaks (ในเครื่องถ้ามี) และ full-gate required check `secret-scan-deep` (gitleaks ทั้ง history) — ไม่มี scanner = BLOCKED ห้าม PASS เอง
```

**Coupled change (needs the operator, Tier C):** the registry wording alone does not
close the hole — `no-secret.sh:31-35` must lose its `CI=1` branch so PASS requires
gitleaks to have actually run. That is probe logic under L6: it ships as a PR with a
`--selftest` covering both the fail and the pass case (this probe has no selftest
today), and the merge is the operator's because the secret path is Tier C.
**Not done in wave 1C** — this wave only touched prose.

**Risk of leaving it:** one `export CI=1` anywhere turns L2 into a rubber stamp.

---

## D-13 · probe-registry.txt:33-36 — the parking explanation

**Why stale:** the block explains three parked probes by the shape of the Actions job
`enforcement-guardrails` (`--ignore-scripts`, shallow checkout). That job cannot run.
The live reason is different and true: full-gate runs both prisma-dependent probes as
the required check `probe-prisma-deps` (`full-gate-checks.txt:46`), while probe-gate
contexts such as local-gate have no prisma client.

```
OLD:
# ── ยังไม่รันใน CI **ชั่วคราว** — ติดสภาพแวดล้อมของ job ไม่ใช่ติดตัว probe ────────
# job `enforcement-guardrails` ติดตั้งด้วย `--ignore-scripts` (ไม่มี prisma generate)
# และ checkout ตื้น (ไม่มี origin/main) — สามตัวนี้จึงจะแดง/BLOCKED ด้วยเหตุผลผิด
# ถ้าเสียบวันนี้ · รอบแรกเอาเฉพาะ probe ที่พิสูจน์ได้ว่าเขียวจริงบน runner ก่อน

NEW:
# ── ไม่อยู่ในกอง ci เพราะสภาพแวดล้อมที่รัน probe-gate ไม่มี prisma client ─────────
# local-gate.sh:30 เรียก probe-gate.js โดยไม่มี pnpm install/prisma generate ⇒ probe
# ที่ต้องใช้ prisma จะ FAIL ด้วยเหตุผลผิดถ้าตั้งเป็น ci · ของจริงมันรันแบบ blocking อยู่แล้ว
# ในชื่อ check `probe-prisma-deps` ของ full-gate (scripts/ci/full-gate-checks.txt:46)
```

**Risk of leaving it:** the registry explains a live parking decision with a dead
reason, so nobody can tell whether the parking is still justified.

---

## D-14 · probe-registry.txt:37 — `settle-webhook-only`

**Why stale:** the unlock "ปลดเมื่อ job มี deps ครบ" refers to the dead Actions job. The
probe already runs blocking on the real gate path (`full-gate-checks.txt:46`). Flipping
the row to `ci` would be wrong too: local-gate runs probe-gate without prisma generate,
so `ci` would false-FAIL there.

```
OLD:  settle-webhook-only    | manual-until:2026-09-15 | - | operator | รัน `npx jest stripe-checkout-engine.test.js` (`scripts/probes/settle-webhook-only.sh:10`) — ต้องมี prisma generate ใน job · ปลดเมื่อ job มี deps ครบ
NEW:  settle-webhook-only    | manual | -                 | operator | รัน `npx jest stripe-checkout-engine.test.js` (`scripts/probes/settle-webhook-only.sh:10`) — ต้องมี prisma client · ยืนพื้น: รันแบบ blocking อยู่แล้วในชื่อ full-gate required check `probe-prisma-deps` (full-gate-checks.txt:46) · บริบท probe-gate ที่ไม่มี prisma (local-gate) จะ false-FAIL ถ้าตั้งเป็น ci
```

**Risk of leaving it:** on 2026-09-16 the gate reddens over a probe that is, in fact,
already enforced — training everyone to treat expiry reds as noise.

---

## D-15 · probe-registry.txt:38 — `webhook-idempotent`

Identical situation to D-14 ("เงื่อนไขเดียวกับข้างบน" points at the same dead job).

```
OLD:  webhook-idempotent     | manual-until:2026-09-15 | - | operator | รัน jest ชุดเดียวกัน (`scripts/probes/webhook-idempotent.sh:5`) — เงื่อนไขเดียวกับข้างบน
NEW:  webhook-idempotent     | manual | -                 | operator | รัน jest ชุดเดียวกัน (`scripts/probes/webhook-idempotent.sh:5`) — เงื่อนไขเดียวกับข้างบน (full-gate required check `probe-prisma-deps`)
```

**Risk of leaving it:** same as D-14, on the webhook-replay invariant.

---

## D-16 · probe-registry.txt:39 — `tier-check`

Diff given in D-05 (the CLAUDE.md annotation and the registry row must move together, or
the two documents will contradict each other).

**Risk of leaving it:** L5's only mechanical leg expires with no replacement, and tier
decisions quietly return to agent judgement — the exact thing L5 forbids.

---

## D-17 · probe-registry.txt:42 — `suite-green` permanent manual

**Why stale:** the standing reason cites the Actions job `Test`. The conclusion is still
right for a different reason: `suite-green` is a required check inside full-gate
(`full-gate-checks.txt:42`), so a second run inside probe-ci would double the suite on
the same box for no new signal.

```
OLD:  suite-green            | manual | -                 | operator | ซ้ำกับ job `Test` ที่รัน suite เต็มอยู่แล้ว — รันซ้ำ = เพิ่มเวลา CI เท่าตัวโดยไม่ได้ signal ใหม่
NEW:  suite-green            | manual | -                 | operator | ซ้ำกับ full-gate required check `suite-green` (scripts/ci/full-gate-checks.txt:42) ที่รัน suite เต็มอยู่แล้ว — รันซ้ำใน probe-ci = เพิ่มเวลา gate เท่าตัวโดยไม่ได้ signal ใหม่
```

**Risk of leaving it:** a permanent cover justified by a fact that is false is exactly
the phantom the registry header (`:16`, `:20-21`) exists to forbid.

---

## D-18 · probe-registry.txt:51 — `report-integrity`

**Why stale:** the row itself says "เงื่อนไขปลดทำแล้ว รอ operator เสียบ CI". The L-031 fix
is implemented and verifiable at `scripts/probes/report-integrity.sh:33-47` (explicit
target via `argv[1]`/`REPORT_INTEGRITY_TARGET`, missing explicit target = FAIL,
mode+target always printed). Only the operator decision is outstanding, and "CI" now
means probe-gate/full-gate on the box.

**Decision needed (not a wording fix):** pick the per-run `REPORT_INTEGRITY_TARGET`
convention, then either flip the row to `ci` or re-sign a new date / permanent manual
before 2026-09-15.

**Risk of leaving it:** probe-gate goes red on 2026-09-16 (`scripts/ci/probe-gate.js:153-158`) for a
condition that was met weeks earlier.

---

## D-19 · AUDIT_LEDGER.md:8 — `env-direct` baseline

**Measured this session** — `bash scripts/probes/ratchet.sh`:

```
hardcode: 43
todo: 59
env-direct: 168
dup-source: 2
PASS: no counter above baseline — current: hardcode=43 todo=59 env-direct=168 dup-source=2
```

```
OLD:  - `env-direct`: 169
NEW:  - `env-direct`: 168        <!-- lowered 2026-08-14 from measured count, evidence/ratchet-current.txt -->
```

**Risk of leaving it:** the ratchet has 1 unit of slack — a new direct `process.env`
access can land and the gate stays green.

---

## D-20 · AUDIT_LEDGER.md:9 — `dup-source` baseline

Same run as D-19: measured `dup-source: 2`, after L-001 was burned via #834
(`probe-registry.txt:25`).

```
OLD:  - `dup-source`: 4
NEW:  - `dup-source`: 2          <!-- lowered 2026-08-14; L-001 burned in #834, measured by scripts/probes/ratchet.sh -->
```

**Risk of leaving it:** two whole duplicate SSOTs could be reintroduced without the gate
noticing — the precise failure this counter exists to prevent.

---

## D-21 · AUDIT_LEDGER.md:20 and :27-30 — L-001 open, Burned empty

**Why stale:** the registry records "L-001 เผาแล้ว (#834) — แหล่งเดียวที่
utils/working-days.js; waiver คืนแล้ว 2026-08-07" (`probe-registry.txt:25`), and
`holiday-single-source` now runs `ci` un-waived. The ledger still shows L-001 open and
zero rows under Burned.

```
Burned table — replace the placeholder row:

OLD:  | — | — | — |
NEW:  | L-001 | 2026-08-07 | #834 — ยุบเหลือ utils/working-days.js แหล่งเดียว; waiver ของ holiday-single-source คืนแล้ว |

and mark the L-001 row in Findings (open) as closed (pointer to the Burned row)
rather than deleting it — the ledger is append-style.
```

**Risk of leaving it:** the burn-down quota (HARNESS §4.2) looks unmet while it is met,
and the open list loses credibility item by item.

---

## D-22 · AUDIT_LEDGER.md:23 — L-004

**Why dead:** the finding directs operator effort at SSH secrets for the Actions "Deploy
to Staging" job. That path is permanently retired, and staging deployment now happens
on-box with `deploy-drift` proving staging runs `origin/main` (HARNESS_LOG.md
2026-08-14; `full-gate-checks.txt:47`).

```
Append a closure note (do not edit history):

| L-004 | 2026-08-14 | ปิดแบบ overtaken-by-events — เส้นทาง deploy ผ่าน Actions เลิกใช้ถาวร (HARNESS_LOG.md 2026-08-14); staging deploy บนเครื่อง + probe deploy-drift (full-gate required) แทน |
```

**Risk of leaving it:** an open P2 that can never be closed makes the open list a
graveyard, and real items get lost in it.

---

## D-23 · GOALS.md:23-29, :58 — G0

**Why it conflicts:**

- `:25` "จ่าย Actions billing" contradicts the written operator decision not to pay
  (HARNESS_LOG.md 2026-08-14).
- `:26` "CI เขียวจริงบน runner" was superseded by the on-box full-gate, proven green with
  `deploy-drift` required on 2026-08-14; and it targets "Law 3.5", a v2 law that no
  longer exists (folded into L4 — CLAUDE.md §0).
- `:27` (#832 status-vocab) is done — the probe is a `ci` row (`probe-registry.txt:31`).
- `:28` (#834, dup-source 4→2) is done — measured `dup-source: 2` this session.
- The 7-day deadline from 2026-08-07 has passed; `GOALS.md:60` requires a slip to be
  logged, and `GOALS.md:64` makes an un-closeable G0 a permanent feature freeze.
- `:58` "กฎใหม่เขียนได้เมื่อ probe ของมันเขียวบน runner แล้ว 1 ครั้ง" — same dead word "runner".

```
Proposed G0 replacement (operator's wording to finalise):

### G0 — เครื่องพิสูจน์มีชีวิต (ทำได้แล้วเป็นส่วนใหญ่ — ทบทวน 2026-08-14)
ทุกอย่างที่เหลือไร้ความหมายถ้า gate ยังตาย
- [x] full-gate บนเครื่อง staging รันครบและเขียว → attestation evidence/gate/<sha>.json (probe gate-attestation)
- [x] deploy-drift เป็น ci + full-gate required (operator เซ็น 2026-08-14)
- [x] #832 probe status-vocab เข้ากอง ci (probe-registry.txt:31)
- [x] #834 L-001 เผาแล้ว → dup-source 4→2 (ยังรอ operator ปรับ baseline ใน AUDIT_LEDGER — D-20)
- [ ] tier-check + report-integrity มีบ้านจริง (probe-ci ของ full-gate หรือ DEFAULT ของ check-done.sh) — D-05/D-18
- **ตัววัด:** `node scripts/ci/probe-gate.js` บนเครื่องที่รัน full-gate: 0 FAIL ที่ไม่มี waiver มีเหตุ
(ลบข้อ "จ่าย Actions billing" — operator ตัดสินแล้วว่าไม่จ่าย, HARNESS_LOG.md 2026-08-14)

:58 — "runner" → "เครื่องที่รัน full-gate/local-gate"
```

Per `GOALS.md:60`, the revision itself should be appended to `HARNESS_LOG.md`.

**Risk of leaving it:** G0 gates all feature work. A goal whose first checkbox is
"pay for something we decided not to pay for" cannot be closed, so the freeze is
permanent and will simply be ignored instead.

---

## D-24 · GAP-MAP.md:25 and :91 — `PAYMENT_ADAPTER=mock` walkthrough advice

**Why it conflicts:** GAP-MAP recommends walking GP-3/4/6b "via `PAYMENT_ADAPTER=mock`
for E2E". A mock-driven settle rendered in the staging UI is simulated money shown as
real — against the standing "nothing simulated user-facing" direction. GAP-MAP itself
flags the missing `NODE_ENV` guard on `PAYMENT_ADAPTER=mock` at GP-6b. Jest-level
doubles are a different thing and remain legitimate.

**Decision needed:** scope where `PAYMENT_ADAPTER=mock` may run — test process only,
`NODE_ENV`-guarded, never in an operator-facing walkthrough? Until ruled, mock settles
should not appear in any walk shown to a human.

**Risk of leaving it:** someone follows the documented advice and demonstrates fake
settlements to the ministry.

---

## D-25 · Money, Tier C — the DTAM tax-ID and PromptPay fallbacks

**What is true (verified this session):** no 13-digit literal remains in any PDF
template — `grep -n "[0-9]\{13\}" apps/backend/services/pdf/templates/*.html` returns
nothing. The number now lives as a code fallback:
`apps/backend/config/invoice-issuers.js:283` — `taxId: process.env.DTAM_TAX_ID ||
'0994000036540'` — and `:383` — `promptpayId: process.env.DTAM_PROMPTPAY_ID ||
'0994000036540'`. The header of `scripts/ci/check-hardcoded-tax-ids.js` carried an
open item ("DTAM tax ID hasn't been confirmed by Finance yet") that had gone stale in
place; wave 1C rewrote it to point here rather than to keep restating an unowned
question.

**Decision needed:** is `0994000036540` the correct issuer identity for the documents
that use it, and should a money document be issuable at all when `DTAM_TAX_ID` is unset
(today it silently falls back)? Both are Tier C money-path questions — an agent may
propose the diff but not decide or merge it (L3).

**Risk of leaving it:** tax documents can be issued under an identity nobody re-confirmed,
and a missing environment variable produces a document that looks correct.
