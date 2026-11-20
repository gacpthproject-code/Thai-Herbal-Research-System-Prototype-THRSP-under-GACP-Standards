# verify-49 — skeptic check: สรุป "ปัจจัยการผลิตที่กรอกครบ x/y รายการ" (production summary counter)

Role: SKEPTIC defending the farmer's application against an over-eager cut.
Item under challenge (census row A3 of production.md):

| file:line | UI shows (Thai) | kind | proposed verdict | citation |
|---|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx:280-285 | label "ปัจจัยการผลิตที่กรอกครบ" + value "{completedInputRows} / {productionInputs.length} รายการ" | page-section (display-only summary tile) | MOVE_TO_AUDIT | facts §3 ข้อ 1 |

What the counter actually is (step:94-97): `completedInputRows` counts productionInputs rows where both `type` and `name` are filled. It is chrome over Section 4 "ปัจจัยการผลิต" (production-info-production-inputs-panel.tsx:36-183), whose rows the coordinator already censused E1-E27 as MOVE_TO_AUDIT. The counter has no data of its own — its fate is derivative of the panel's.

## Refutation attempts (all failed)

1. **กทล.1 form field?** Re-read facts.md §1 in full. ส่วนที่ ๒ asks: วัตถุประสงค์ · ลักษณะพื้นที่ · ชื่อสถานที่ (ข้อ ๑) · ข้อมูลแปลง/เอกสารสิทธิ์/พิกัด/ปริมาณการปลูก (ข้อ ๒) · พันธุ์และส่วนของกัญชา (ข้อ ๓). No field itemizes ปุ๋ย/ยาป้องกันศัตรูพืช/สารปรับปรุงดิน. ส่วนที่ ๑, ๔ and the จนท. checklist (facts.md:55-57) likewise never mention production inputs. FAILED.
2. **A5 แผนการผลิต attachment?** The strongest counter-argument: planned inputs could appear inside the production plan. But A5 is a *document attachment* (facts.md:40), and the wizard already has its own A5 slot elsewhere (documents-step-config.tsx:272-275 `PRODUCTION_PLAN` "แผนการผลิตหรือแผนการเพาะปลูก"). The panel this counter summarizes is not a plan — its fields are usage records: "ปริมาณที่ใช้" (inputs:122-129), "วันที่ใช้" (inputs:145-150), "วิธีการใส่" (inputs:151-163). Past-tense usage data cannot truthfully exist at application time on this platform (planting is locked until certification per the approved planting spec). FAILED.
3. **facts.md §3 itself?** §3 ข้อ 1 (facts.md:60) names "บันทึกการซื้อ/ใช้ปัจจัยการผลิต" verbatim as วันตรวจ ณ แปลง evidence — the exact subject matter the counter counts. This is the citation the census used; re-reading confirms it is on point. SUPPORTS the verdict.
4. **Other Thai-law basis in the repo?**
   - docs/standards/tas-3502-2561-records-and-traceability.md:33 — มกษ. 3502-2561 ข้อ 8(1) lists "บันทึกรายการปัจจัยการผลิต แหล่งที่มา และรายละเอียดเฉพาะของปัจจัยการผลิตที่สำคัญ" under เอกสารและ*บันทึก*ข้อมูล, i.e. farm record-keeping inspected on audit day. A named standard, and it lands on the *audit/record* side — it strengthens MOVE_TO_AUDIT (over CUT) rather than refuting it. It creates no application-day form field.
   - docs/requirements/dtam-requirements-analysis.md:39-44 — internal analysis; its own table says input usage "มีใน CultivationLog" (record-keeping). Its "ทะเบียนปุ๋ย ต้องเพิ่ม" row cites no named กฎกระทรวง/ประกาศ — a wishlist row, not a legal basis under the hard rules. (พ.ร.บ.ปุ๋ย registration numbers bind fertilizer *manufacturers/sellers*, not GACP applicants.)
   - apps/backend (constants, prisma, shared): ProductionInput appears only in trace.prisma / cultivation routes / seed scripts — the post-cert cultivation-record surface, which is where MOVE_TO_AUDIT sends this data. No licence obligation found tying itemized inputs to submission. FAILED.
5. **Wrong verdict in-vocabulary — should it be CUT instead?** No. CUT means "no DTAM basis and no other Thai-law basis". Here there IS a named basis — facts.md §3 ข้อ 1 and มกษ. 3502-2561 ข้อ 8(1) — it just binds at audit day. The data is genuinely required of the farm, at the right time; the farmer is better defended by MOVE_TO_AUDIT (the surface survives, relocated to the post-cert cultivation-records flow) than by CUT. And a counter cannot outlive its panel: with all of E1-E27 moved, "x/y รายการ" on the application page would count nothing. MOVE_TO_AUDIT for the whole family, counter included, is the coherent verdict.

## Verdict

**UPHELD — MOVE_TO_AUDIT** (facts §3 ข้อ 1: "บันทึกการซื้อ/ใช้ปัจจัยการผลิต" is วันตรวจ ณ แปลง record-keeping; reinforced by มกษ. 3502-2561 ข้อ 8(1) — a records obligation, not an application field). Whether the relocated audit-day surface keeps a completeness counter is a design choice for that surface, not for the กทล.1 wizard.

Checked 2026-09-01 · read-only · files read: facts.md (full), production-info-step.tsx (full), production-info-production-inputs-panel.tsx (full), census/production.md (rows A1-A9, E1-E27, headline findings), docs/standards/tas-3502-2561-records-and-traceability.md, docs/requirements/dtam-requirements-analysis.md, documents-step-config.tsx:269-276.
