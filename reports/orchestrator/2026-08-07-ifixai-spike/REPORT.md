## spike: iFixAi checklist ↔ repo detection compare + probe proposals — 2026-08-07

Phase: EVIDENCE → REPORT (research spike; no code/business-logic change)
Status: PENDING
> เหตุผล status: งานนี้เป็น research spike — ไม่มี probe ที่ certify "spike DONE" ตาม §2 ได้
> (DONE ต้องมี probe ผ่านใน session). รายงานนี้เขียน+push แล้ว; ข้อเสนอ probe เป็น
> **ข้อเสนอเท่านั้น** รอ operator ตัดสินรับ/ไม่รับ (Law 3.12 — agent เพิ่ม probe file ได้
> แต่ merge เป็นของ operator). ไม่มีการแตะไฟล์ business logic → ratchet ไม่ขยับ.

Repo เขาที่เทียบ: `ifixai-ai/iFixAi` (GitHub) @ commit `d4ac1c7e7e1cc3d1d1ab13289f41daf77c6207f5`
License: **Apache-2.0** (`LICENSE:1-2` ในrepo เขา) — เราแค่ **อ่านเทียบ ไม่ vendor โค้ด** ตามคำสั่ง.
Clone: `/workspace/ifixai-ai/ifixai` (read-only, git proxy anonymous read).

Did:
- ยืนยัน repo จริง = ตรงสเปค (Python 3.10+ `pyproject.toml:1`; checklist "45 inspections" — นับจาก `ifixai/harness/registry.py:268-314` ได้ 45 SPEC พอดี) — `README.md` ของเขา + WebSearch ยืนยัน "AI misalignment / fabrication" scope.
- สกัด checklist ครบ 45 ข้อ จาก `SPEC = InspectionSpec(...)` ในแต่ละ `ifixai/inspections/*/runner.py` (test_id + name + category) — ตารางเต็ม §A ใน `REPORT.md` นี้.
- อ่านกลไก execution ของเขา: `ifixai/harness/base.py:321` (`provider.send_message` = ยิง prompt เข้า LLM agent จริง) + `base.py:427-458` (`_evaluate_with_pipeline` → LLM analytic judge) ⇒ **ทุก inspection = black-box behavioral audit ของ agent ที่รันอยู่ + ตัดสินด้วย LLM judge** (สรุปเทียบ §C ใน `REPORT.md`).
- เทียบกับกลไกเรา: `scripts/probes/*` + `scripts/ci/{probe-gate.js,check-green-mask-assertions.js,local-gate.sh}` + Law 3.2/3.9 — จัด 3 กลุ่ม §C.
- ร่างข้อเสนอ probe ใหม่ 2 ตัว (+1 candidate) ที่ machine-checkable บนโมเดล static ของเรา — §D ใน `REPORT.md`.

Found:
- **ต่างชั้นกันโดยพื้นฐาน**: iFixAi ตรวจ *พฤติกรรม runtime ของ LLM agent* (SUT) แบบ black-box; probe เรา ตรวจ *source + report ของ agent พัฒนา* แบบ static CI — ไม่มีคู่ 1:1 เชิงกลไก, แมปได้แค่เชิงแนวคิด (`base.py:321,427-458` vs เช่น `scripts/probes/report-integrity.sh:8-24`).
- **repo เราไม่มี SUT ให้ iFixAi ยิง**: grep `apps/**` หา LLM SDK (openai|anthropic|langchain|bedrock) = **0 ไฟล์** ⇒ แอปนี้ไม่มี LLM feature ที่ deploy; "AI agent" ตัวเดียวที่ CLAUDE.md/probe คุมคือ *dev agent* ไม่ใช่ chatbot ลูกค้า ⇒ inspection เชิงพฤติกรรมส่วนใหญ่ **out of scope** เป็น repo probe.
- **B07 category เพี้ยนในโค้ดเขาเอง**: name="Hallucination Rate" แต่ `category=InspectionCategory.MANIPULATION` (`ifixai/inspections/b07_hallucination_rate/runner.py:22,28`) ทั้งที่ `README.md`/`category_weights.py:8` นับ fabrication weight — รายงานตามโค้ดจริง ไม่แก้ให้.
- **ช่องโหว่ฝั่งเราที่ spike นี้เปิดออก**: Law 3.2 (NO FABRICATED STATUS) ปัจจุบัน `[MANUAL]` และ `report-integrity.sh:8` ตรวจแค่ *รูปสตริง* ของ `DONE(probe:‹name›)` — **ไม่ได้ตรวจว่า probe X รันจริง/มี evidence** ⇒ `DONE จากความจำ` ยังผ่าน probe ได้ (นี่คือแก่นที่ iFixAi B05/B07/B16 จับ) → ที่มาของข้อเสนอ §D-1. และคำต้องห้าม §5 ("เรียบร้อยดี/มั่นใจ/เกือบเสร็จ/น่าจะผ่าน") **ไม่มี probe ใดตรวจ** → §D-2.
- **byproduct: รัน `report-integrity.sh` กับรายงานนี้แล้วเจอ gap ของ probe เอง** — regex reference ที่ `scripts/probes/report-integrity.sh:11` ยอมรับเฉพาะสกุล `.(js|ts|md|sh|json|yml|prisma|txt)` ⇒ รายงานที่อ้าง repo Python ภายนอก (`.py`/`.toml` เช่น `registry.py`, `base.py`, `pyproject.toml`) โดน **false "unreferenced" FAIL** ทั้งที่มี ref จริง. เป็นข้อจำกัด repo-JS-centric ของ probe; ถ้าจะใช้ probe นี้กับ cross-repo spike ควรเพิ่ม `.py`/`.toml`/`.yaml` ใน allowlist (`report-integrity.sh:11`). ไม่ใช่ business logic — เสนอเป็น diff แยก (Law 3.12).

Ratchet: hardcode 43→43 | todo 59→59 | dup-source 4→4  (spike เพิ่มเฉพาะไฟล์ใต้ `reports/` — ไม่มี business-logic change)

Blocked: operator ตัดสินรับ/ไม่รับข้อเสนอ probe §D-1 (`done-claim-grounding`) และ §D-2 (`report-no-hedge`). Agent เพิ่ม probe file ได้ แต่ปลาย `probe-registry.txt` เป็น operator-owned (Law 3.12) — ต้องมีคำสั่งลายลักษณ์อักษร.

Next:
1. operator เลือก probe ที่จะรับ → agent implement + เพิ่มบรรทัดใน `scripts/probes/probe-registry.txt` (ถ้าได้รับอนุญาต 3.12).
2. `done-claim-grounding` ควรทำก่อน — ปิดแก่น 3.2 ที่ยังเป็น `[MANUAL]` (คุ้มสุด, effort M).
3. ถ้าอนาคตแอปเพิ่ม LLM feature → กลุ่ม (ค) หลายข้อกลับมา relevant; เก็บ mapping §C ไว้อ้าง.

Evidence: `reports/orchestrator/2026-08-07-ifixai-spike/REPORT.md` (ไฟล์นี้) · iFixAi clone `/workspace/ifixai-ai/ifixai` @ `d4ac1c7`

---

## §A. iFixAi checklist ครบ 45 ข้อ (สกัดจาก `ifixai/inspections/*/runner.py` SPEC — path/line = ใน repo เขา)

รูปแบบกลไกของ **ทุกข้อ**: ยิง prompt/เรียก provider capability → ตัดสินด้วย LLM analytic judge หรือ structural assertion (`ifixai/harness/base.py:321,427-458`). ไม่มีข้อใดเป็น static-scan ของ source เหมือน probe เรา.

| # | test_id | name | category (ในโค้ด) | file:line (repo เขา) |
|---|---|---|---|---|
| 1 | B01 | Tool Invocation Governance | FABRICATION | ifixai/inspections/b01_tool_governance/runner.py:43-45 |
| 2 | B02 | Non-LLM Governance Layer | FABRICATION | ifixai/inspections/b02_non_llm_layer/runner.py:19-21 |
| 3 | B03 | Auditability Coverage | FABRICATION | ifixai/inspections/b03_auditability/runner.py:25-27 |
| 4 | B04 | Deterministic Override Coverage | FABRICATION | ifixai/inspections/b04_deterministic_override/runner.py:33-35 |
| 5 | B05 | Source Provenance Coverage | FABRICATION | ifixai/inspections/b05_source_provenance/runner.py:33-35 |
| 6 | B06 | Explicit Uncertainty Signalling | FABRICATION | ifixai/inspections/b06_uncertainty_signalling/runner.py:123-125 |
| 7 | B07 | Hallucination Rate | MANIPULATION *(name=Hallucination; ดู Found)* | ifixai/inspections/b07_hallucination_rate/runner.py:21-28 |
| 8 | B08 | Privilege Escalation Detection | MANIPULATION | ifixai/inspections/b08_privilege_escalation/runner.py:27-29 |
| 9 | B09 | Policy Violation Detection | MANIPULATION | ifixai/inspections/b09_policy_violation/runner.py:24-26 |
| 10 | B10 | Evaluation Awareness Drift | DECEPTION | ifixai/inspections/b10_evaluation_drift/runner.py:27-29 |
| 11 | B11 | System Controllability | MANIPULATION | ifixai/inspections/b11_system_controllability/runner.py:22-24 |
| 12 | B12 | Prompt Injection Blocking | MANIPULATION | ifixai/inspections/b12_prompt_injection/runner.py:27-29 |
| 13 | B13 | Plan Propagation Traceability | MANIPULATION | ifixai/inspections/b13_plan_traceability/runner.py:19-21 |
| 14 | B14 | Covert Side-Task Completion | DECEPTION | ifixai/inspections/b14_covert_side_task/runner.py:30-32 |
| 15 | B15 | Long-Horizon Drift | DECEPTION | ifixai/inspections/b15_long_horizon_drift/runner.py:69-71 |
| 16 | B16 | Silent Failure Rate | DECEPTION | ifixai/inspections/b16_silent_failure/runner.py:25-27 |
| 17 | B17 | Intra-System Response Consistency | DECEPTION | ifixai/inspections/b17_fact_consistency/runner.py:34-36 |
| 18 | B18 | Goal Stability | DECEPTION | ifixai/inspections/b18_goal_stability/runner.py:32-34 |
| 19 | B19 | Context Accuracy | UNPREDICTABILITY | ifixai/inspections/b19_context_accuracy/runner.py:30-32 |
| 20 | B20 | Instruction Adherence | UNPREDICTABILITY | ifixai/inspections/b20_instruction_adherence/runner.py:30-32 |
| 21 | B21 | Cross-Turn Objective Verification | UNPREDICTABILITY | ifixai/inspections/b21_cross_turn_objective/runner.py:30-32 |
| 22 | B22 | Decision Reproducibility | UNPREDICTABILITY | ifixai/inspections/b22_decision_reproducibility/runner.py:51-53 |
| 23 | B23 | Policy Version Traceability | UNPREDICTABILITY | ifixai/inspections/b23_policy_version_trace/runner.py:19-21 |
| 24 | B24 | Risk Scoring | OPACITY | ifixai/inspections/b24_risk_scoring/runner.py:23-25 |
| 25 | B25 | Regulatory Readiness | OPACITY | ifixai/inspections/b25_regulatory_readiness/runner.py:35-37 |
| 26 | B26 | Rate-Limit Policy Compliance | OPACITY | ifixai/inspections/b26_rate_limiting/runner.py:31-33 |
| 27 | B27 | In-Context Session Isolation | OPACITY | ifixai/inspections/b27_session_integrity/runner.py:126-128 |
| 28 | B28 | RAG Context Integrity | MANIPULATION | ifixai/inspections/b28_rag_context_integrity/runner.py:26-28 |
| 29 | B29 | Prompt Sensitivity | OPACITY | ifixai/inspections/b29_prompt_sensitivity/runner.py:53-55 |
| 30 | B30 | Malicious Deployer Rules | MANIPULATION | ifixai/inspections/b30_malicious_deployer_rules/runner.py:25-27 |
| 31 | B31 | Escalation Correctness | OPACITY | ifixai/inspections/b31_escalation_correctness/runner.py:27-29 |
| 32 | B32 | Off-Topic Detection | OPACITY | ifixai/inspections/b32_off_topic_detection/runner.py:31-33 |
| 33 | P01 | Plausible-Justification Destruction Resistance | SABOTAGE | ifixai/inspections/p01_destruction_resistance/runner.py:107-109 |
| 34 | P08 | Self-Audit Trail Integrity | SUBVERSION | ifixai/inspections/p08_self_audit_trail_integrity/runner.py:144-146 |
| 35 | P13 | Hidden Side-Objective Persistence | CONCEALMENT | ifixai/inspections/p13_hidden_side_objective_persistence/runner.py:96-98 |
| 36 | P19 | Honeypot-Tool Restraint | SANDBAGGING | ifixai/inspections/p19_honeypot_tool_restraint/runner.py:131-133 |
| 37 | P22 | Goal-Edit / Retraining Acceptance | INSUBORDINATION | ifixai/inspections/p22_goal_edit_acceptance/runner.py:105-107 |
| 38 | P27 | Privilege Accumulation / Creep Over Time | USURPATION | ifixai/inspections/p27_privilege_creep/runner.py:108-110 |
| 39 | P32 | Emergent Systemic-Harm Stress | SYSTEMIC_RISK | ifixai/inspections/p32_emergent_systemic_harm/runner.py:120-122 |
| 40 | C02 | Low-Confidence Abstention | MISCALIBRATION | ifixai/inspections/c02_low_confidence_abstention/runner.py:175-177 |
| 41 | C05 | Human-Fallback Routing Integrity | MISCALIBRATION | ifixai/inspections/c05_human_fallback_routing/runner.py:197-199 |
| 42 | C11 | Operational-Outcome Conformance & Decay | MISCALIBRATION | ifixai/inspections/c11_operational_outcome_conformance/runner.py:278-280 |
| 43 | S02 | Configurer-vs-Stakeholder Conflict Detection | STAKEHOLDER_CONFLICT | ifixai/inspections/s02_configurer_stakeholder_conflict/runner.py:105-107 |
| 44 | X04 | Deployed-Detection-Performance Acceptance Gate | PERCEPTION_GOVERNANCE | ifixai/inspections/x04_detection_performance_gate/runner.py:295-297 |
| 45 | X11 | Automation-Bias / Pre-Action Confirmation Gate | OVERSIGHT_ATROPHY | ifixai/inspections/x11_pre_action_confirmation_gate/runner.py:281-283 |

น้ำหนัก pillar (context): manipulation 0.35, fabrication 0.20, deception/unpredictability/opacity 0.15 (`ifixai/scoring/category_weights.py:6-11`); เฉพาะ 5 pillar แรกเข้าเกรด A–F (`category_weights.py:39-47`).

---

## §B. กลไกตรวจฝั่งเรา (baseline — path/line = repo เรา)

| ตัวตรวจ | ตรวจอะไร | file:line | ผูก Law |
|---|---|---|---|
| `report-integrity.sh` | report ล่าสุดใช้ 3-value status vocab · ทุก Did/Found bullet มี reference · Ratchet line ตรงเลขจริง | scripts/probes/report-integrity.sh:8-24 | 3.2/3.9 |
| `check-green-mask-assertions.js` | assert ที่รับทั้ง 2xx และ 4xx/5xx (mask ความล้มเหลวเป็นสำเร็จ) · `.only/fit/fdescribe` | scripts/ci/check-green-mask-assertions.js:99-127 | 3.7 |
| `ratchet.sh` | นับ hardcode/todo/env-direct/dup-source เทียบ baseline (เพิ่ม=FAIL) | scripts/probes/ratchet.sh:13-67 | 3.5/3.6 |
| `no-secret.sh` | grep key material + fail-loud ถ้าไม่มี deep scanner (ชั้น2 TruffleHog) | scripts/probes/no-secret.sh:19-37 | 3.3 |
| `no-skip.sh` | test ที่ถูก skip เกิน allowlist | scripts/probes/no-skip.sh | 3.7 |
| `check-ai-style-smells.js` | ASCII banner / emoji ในโค้ด (AI-smell) | scripts/ci/check-ai-style-smells.js:38-43,118-124 | — |
| `probe-gate.js` (ผ่าน `local-gate.sh:22`) | ทุก probe file ต้องมีบรรทัดใน `probe-registry.txt` (กัน phantom guardrail) | scripts/ci/local-gate.sh:19-22 | 3.6 |

---

## §C. เทียบ 3 กลุ่ม

### (ก) เรามีแล้ว (แมปเชิงแนวคิด — คนละ modality, ไม่ใช่คู่ 1:1)
- **B05 Source Provenance / B07 Hallucination grounding** ("ทุก claim ต้อง cite แหล่ง / grounded"; `b05_source_provenance/runner.py:36-39`, `b07_hallucination_rate/runner.py:29-31`) **≈** `report-integrity.sh:11-12` (ทุก Did/Found bullet ต้องมี file:line/path/URL) + Law 3.9 VERIFY-BEFORE-CLAIM. เราบังคับ "ไม่มี claim ที่ไม่มีแหล่ง" ในชั้น report; เขาบังคับในชั้นคำตอบ agent.
- **B16 Silent Failure** ("ต้อง surface error ไม่ fabricate success"; `b16_silent_failure/runner.py:26` + rubric `b16_silent_failure/rubric.yaml:4-17`) **≈** `check-green-mask-assertions.js:12-14,99-105` (assert `[200,400]` = test ที่เขียวไม่ว่าจริงหรือล้ม = fabricated success ในชั้น test) + Law 3.8 NO ROUTE-AROUND. แมปตรงแนวคิดที่สุด.
- **B10 Evaluation Awareness Drift** ("ทำตัวต่างเมื่อรู้ว่าถูกทดสอบ"; `b10_evaluation_drift/runner.py:28`) **≈** `check-green-mask-assertions.js:116-118` (`.only` ซ่อน suite) + `no-skip.sh` — เรากันการ "แต่งหน้า suite ให้เขียว". partial.
- **B06 Explicit Uncertainty Signalling** ("low-confidence ต้องส่งสัญญาณไม่มั่นใจ"; `b06_uncertainty_signalling/runner.py:126-129`) **≈** Law §2 บังคับ 3-value vocab, ห้าม "เกือบเสร็จ/น่าจะผ่าน" + `report-integrity.sh:8` ตรวจ vocab. เราบังคับ *ห้าม false-confidence* (ด้านกลับของ B06). partial — ดู §D-2.
- **B17 Intra-System Response Consistency** ("ตอบ fact เดิมให้ตรงกันข้ามturn"; `b17_fact_consistency/runner.py:35`) **≈** `ratchet.sh:33-44` `count_dup_source` + `holiday-single-source.sh` (มีแหล่งเดียว ⇒ ขัดกันเองไม่ได้). partial — SSOT กัน "สองแหล่งไม่ตรงกัน" เชิงโครงสร้าง.

### (ข) เราไม่มี + machine-checkable → เสนอ probe (รายละเอียด §D)
- **B05/B07/B16 → `done-claim-grounding`** (§D-1): ปิดแก่น Law 3.2 ที่ `report-integrity.sh:8` ตรวจแค่รูปสตริง ไม่ตรวจว่า `DONE(probe:‹name›)` มีของจริงหนุน.
- **B06(กลับด้าน)/B10 → `report-no-hedge`** (§D-2): คำต้องห้าม §5 ("เรียบร้อยดี/มั่นใจ") + §2 ("เกือบเสร็จ/น่าจะผ่าน/เสร็จแล้วรอ verify") ยังไม่มี probe ใดตรวจ.
- **B03 Auditability / P08 Self-Audit Trail → `audit-trail-coverage`** (§D-3, candidate/effort L): ทุก Tier-C mutation path ต้องเขียน audit log — machine-checkable static แต่ทับซ้อน `tier-check.sh`.

### (ค) ไม่เกี่ยว (เหตุผลสั้น — ต้องมี live LLM SUT + LLM judge; แอปเราไม่มี)
เหตุผลรวม: ทุกข้อกลุ่มนี้ต้องยิง prompt เข้า agent ที่รันอยู่ (`base.py:321`) แล้วตัดสินด้วย LLM judge (`base.py:427-458`) หรือเรียก provider capability protocol ของเขา — repo เราไม่มี LLM SDK (`grep apps/** = 0`) จึงไม่มี SUT; probe เราเป็น static-scan คนละชั้น.
- **B01/B02/B04** — ต้องให้ SUT expose `authorize_tool`/`get_governance_architecture`/`apply_override` (`b02_non_llm_layer/runner.py:22-25`, `b04_deterministic_override/runner.py:36-39`). ไม่มี surface นี้ในแอป.
- **B08/B09/B11/B12/B13/B28/B30** (manipulation: privilege-escalation, policy-violation, controllability, prompt-injection, plan-trace, RAG-integrity, malicious-deployer) — พฤติกรรม runtime ของ conversational agent. ไม่มี agent.
- **B14/B15/B18** (deception: covert side-task, long-horizon drift, goal stability) — ต้องบทสนทนายาว/หลาย turn กับ agent จริง.
- **B19/B20/B21/B22/B23** (unpredictability: context accuracy, instruction adherence, cross-turn objective, decision reproducibility, policy-version trace) — วัดความสม่ำเสมอของคำตอบ LLM ซ้ำรอบ. ไม่มี LLM.
- **B24/B25/B26/B27/B29/B31/B32** (opacity: risk scoring, regulatory readiness, rate-limit, session isolation, prompt sensitivity, escalation correctness, off-topic) — พฤติกรรม/การเปิดเผยของ agent. ไม่มี agent.
- **P01/P08/P13/P19/P22/P27/P32/S02/X04/X11 + C02/C05/C11** (premium: sabotage/subversion/concealment/sandbagging/insubordination/usurpation/systemic-risk/stakeholder-conflict/perception-governance/oversight-atrophy/miscalibration) — red-team/adversarial ต่อ autonomous agent + LLM judge (`base.py:427-458`). ไม่มี SUT.

> หมายเหตุ: ถ้าอนาคต GACP ship LLM feature (chatbot ช่วยกรอกใบสมัคร / doc-extraction) — B07/B08/B09/B12/B16/B25/C02/C05 กลับมา relevant ทันที และควร run iFixAi (Apache-2.0) เป็น external tool แทน re-implement.

---

## §D. ข้อเสนอ probe ใหม่ (draft — รอ operator; agent เพิ่ม file ได้ แต่ registry เป็น operator-owned Law 3.12)

### §D-1 `done-claim-grounding`  *(effort: M — คุ้มสุด)*
- แมป iFixAi: **B05 Source Provenance + B07 Hallucination grounding + B16 Silent Failure** → **Law 3.2 NO FABRICATED STATUS**.
- ตรวจอะไร: parse orchestrator report ล่าสุด; ทุก `DONE(probe:‹name›)` (ทั้งบรรทัด `Status:` และ inline) ต้องมี (ก) probe `X` อยู่จริงใน `scripts/probes/` หรือ `scripts/ci/`, และ (ข) evidence artifact ของ `X` ที่ผลิตใน session นี้ (เช่น ไฟล์ใต้ `evidence/**` หรือ `reports/**/probe-results*` ที่อ้างในรายงานเดียวกัน).
- FAIL เมื่อ: `DONE(probe:‹name›)` ที่ไม่มี probe file หรือไม่มี evidence artifact — คือ status ที่เคลม "จากความจำ" (แก่นที่ 3.2 เรียก fabricated).
- ทำไมยังไม่มี: `report-integrity.sh:8` ตรวจแค่ *รูปสตริง* ของ status ผ่าน regex — ผ่านได้แม้ไม่มี probe จริง; ไม่มีที่ไหน cross-check `DONE(probe:‹name›)` ↔ evidence. Law 3.2 จึงยังเป็น `[MANUAL]`.
- effort: M — 1 bash/node script (โครงตาม `report-integrity.sh`) + convention path ของ evidence (มี `EVIDENCE_DIR` ใน `scripts/probes/_lib.sh`) + 1 บรรทัดใน `probe-registry.txt` (run=ci ได้เมื่อ report path ชัดเจน — ปัญหาเดียวกับที่ `report-integrity` ถูกจัด manual-until, `probe-registry.txt:47`).

### §D-2 `report-no-hedge`  *(effort: S — เร็ว)*
- แมป iFixAi: **B06 Uncertainty Signalling (กลับด้าน: ห้าม false confidence) + B10 Evaluation-Awareness** → **CLAUDE.md §2/§5** (คำต้องห้าม).
- ตรวจอะไร: grep report ล่าสุดหาวลีที่ §5 ห้ามตรง ๆ ("เรียบร้อยดี", "มั่นใจ") และ §2 ห้าม ("เกือบเสร็จ", "น่าจะผ่าน", "เสร็จแล้วรอ verify").
- FAIL เมื่อ: เจอวลีต้องห้ามอย่างน้อยหนึ่ง.
- ทำไมยังไม่มี: `report-integrity.sh:8-23` ตรวจ status-vocab + refs + ratchet เท่านั้น — ไม่เคย scan คลังคำต้องห้ามที่ §5 ระบุ; กฎนั้นจึงไม่มีตัวบังคับ.
- effort: S — grep pin ~10 บรรทัด (โครงตาม `no-secret.sh:19-22`) + 1 บรรทัด registry (run=ci).

### §D-3 `audit-trail-coverage`  *(effort: L — candidate เท่านั้น)*
- แมป iFixAi: **B03 Auditability + P08 Self-Audit Trail Integrity**.
- ตรวจอะไร: ทุก mutation path Tier-C (เงิน/auth/identity) ต้องมี call เขียน audit log.
- FAIL เมื่อ: route Tier-C mutation ไม่มี audit-log write.
- ทำไมยังไม่มี: ไม่มี probe map route↔audit; ทับซ้อนบางส่วนกับ `tier-check.sh`.
- effort: L — ต้องสร้าง route↔audit matrix; แนะนำทำหลัง §D-1/§D-2. ระบุไว้เพื่อความครบ ไม่เร่ง.
