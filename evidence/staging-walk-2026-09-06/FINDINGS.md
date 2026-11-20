# Staging walk — register → six-step wizard → submit, on the DEPLOYED environment — 2026-09-06

Env: https://staging.gacpth.com · images staging-c5fccd0e (main c5fccd0e) · staging Supabase
(<retired-project>) · seeded: 23 กทล.๑ rules + 6 plant_species + 55 doc requirements.

## ✅ PROVEN on the deployed, user-facing environment (real browser, no shortcuts)
1. REGISTER: 4-step /register → 201 "ลงทะเบียนสำเร็จ" (วิภา, 3904150072317)
2. LOGIN → dashboard
3. Six-step wizard end-to-end:
   - step 3 carries จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ (F-WALK-03 fix LIVE)
   - 3 ลักษณะพื้นที่ ticks → the register demanded TEN required docs
     (building_plan_photos AND field_surround_photos both — the B1 union rule live)
   - uploads across their OWN steps: step2×2 + step3×5 + step5×3 = 10/10 → lens complete:true
4. Review page: **fee 105,930** (additive, 3 types — F-APPV2-01 live) · ส่วนที่ ๔ consents
5. SUBMIT → 200 → APP-2569-MTPIVPN0-3058BF PENDING_DOC_FEE
6. **Quotation QT-PRD-2026-000001 auto-issued ฿105,930**

## Fixed DURING this walk (each found by walking the deployed env — invisible on scratch)
- **nginx**: api_upload zone (5r/m) covered ALL /api/applications/* → wizard 503'd from step two
  ("ไม่สามารถโหลดแบบฟอร์มได้ชั่วคราว"). Scoped to draft-documents only (f2294bcd) + live reload.
  One server block serves prod/demo too — real applicants were hitting this wall.
- **web-app Dockerfile**: unpinned pnpm → pnpm10 vs lockfile8 build failure (79635634).
- **compose staging**: DATABASE_URL hardcoded to the retired local postgres — env-file now wins
  (d32b4986); without it staging would have silently run on the wrong database.
- **seeds are part of a fresh environment**: requirement rules + plant_species + doc requirements
  must be seeded or step 4 has no plants and the lens has no law. (Runbook material.)

## Findings recorded, NOT yet fixed (UX/latency class)
- F-STG-01: cross-session wizard RESUME does not rehydrate step forms (step 2 empty on return;
  deep-link to a later step bounces to step 1). In-session completion works.
- F-STG-02: step-5 with no applicationId silently renders "ไม่มีเอกสารที่ต้องแนบ" (the empty-state
  the component's own comment forbids); with appId it needs ~8s before slots render. Same slow-
  render on review (status sync) — submit stays disabled until sync lands (correct fail-closed,
  but reads as broken to an impatient user; walker needed reload+40s budget).
- Observed once during the 503-degraded state: step 4 allowed ถัดไป with no plant picked.
  Post-fix the gate held (disabled until a plant chip pressed). Not reproduced healthy.

Logs: final-walk*.out · shots w-s3/w-s4-*/w-s5/w-s6-review.png · req-check*.out (lens verdicts).
