# T&T scope boundary — proven on the deployed image, 2026-09-06

Door: `GET /api/trace/lot/:id` (public, NO login) — the buyer's quality-scan door.
Lot: LOT-2569-000001-A (real data, minted by the scratch pipeline walk to a certificate).
Image: the same backend built from main and deployed to staging+demo.

## Public tier enforces the boundary field-by-field
OPEN (present in payload): farm name + FULL address (สันทราย, เชียงใหม่ / 12 หมู่ 3 /
  หนองหาร / 50290), lotNumber, labName + COA, harvestDate, province, certificate, status.
WITHHELD (verified ABSENT): plotName, expectedHarvest(TH), plannedPlantCount,
  allocatedAreaSqm, internal id, any yield forecast.
Declared scope in the payload itself: traceabilityScope = "RAW_MATERIAL_GACP".
Legal-scope disclaimer served: "DTAM certifies agricultural practices (GACP) only, not
  medical safety" (TH+EN).

Why this split: farm identity + COA are OPEN by operator ruling (design doc §3.1 line 153
"เมื่อสแกนต้องเห็นทั้งหมด" + F-WALK-04). Forecast/plot-name/internal-id stay closed — not
PDPA but business secrecy + guess-handles (design doc line 163).

## The three-tier design (docs/design/2026-09-05-tnt-loop-and-farmer-updates.md §3)
- ชั้นเปิด (public, no login): the fields above — legal basis PDPA disclosure + ม.44-46 tracing.
- ชั้นเกษตรกร (farmer, own data): edits the cultivation cycle until each field's freeze
  point (§2.2 field-by-field timing table); activities append-only (§2.4); after freeze
  NOBODY edits (operator ruling 2026-09-05 §2.3). **The farmer-update SCREEN is designed,
  not yet built (§0.1)** — the honest open item.
- ชั้นพนักงานติดตาม (tracking officer): bounded farm scope per §3.

## Status
PROVEN live: public tier scope boundary (this file). DESIGNED: farmer-update screen +
officer-tracking scope enforcement (doc §2, §3) — next build.

## Farmer-update freeze enforcement — VERIFIED in code (System 2 legal core)
Door: PATCH /api/cultivation/planting-cycles/:id (ensureCycleOwned — farmer edits own cycle).
Enforcement (planting-service.js:384-416): isLocked when status HARVESTED/COMPLETED or the
cycle has harvest batches. After lock, the FOUR fields that the public scan publishes —
seedSource, varietyName, irrigationType, soilType — are refused LOUDLY (CYCLE_FROZEN, 409,
with the offending `fields` listed), never silently dropped; `notes` (never published) stays
editable. Matches design §2.2 (freeze at the cut; notes survive; a post-cut correction of a
published field is an officer decision, not a quiet PATCH).
STATUS: farmer-update BACKEND + freeze = DONE and correct. Remaining T&T gap = the farmer-update
UI SCREEN (design §0.1) and the officer-tracking role/scope (design §3) — both need operator
direction/design sign-off before building on a legally-sensitive national flow.

## Tier 3 — tracking officer (design §3.3, ruling 2026-09-05 "ทุกฟาร์มทั้งประเทศ")
Verified in code this session, against the four things the ruling demands:
1. Nationwide farm visibility, not assignment-bound — the provider planting endpoints
   (GET /api/provider/planting-cycles, /:id, /:id/activities, /:id/plot-qrs) are not
   scoped to assigned work. ✅ as ruled.
2. NO financial data in the tracking surface — grep of routes/api/provider/handlers/planting.js
   for invoice/amount/fee/payment/quotation returns nothing. ✅ ("คนละหน้าที่ ไม่ได้อยู่ในคำว่าติดตาม")
3. PDPA ม.39 access recording — services/farm-access-audit.js `recordFarmDataAccess` is mounted
   at the ROUTER level of provider/planting.js (so a route added later is covered by default),
   and handlers set res.locals.auditFarmIds for reads whose body cannot reveal the farm.
   PROVEN: 5 suites / 79 tests green (farm-access, farm-access-is-recorded,
   farm-access-recorded-on-every-route, farm-access-fired-worker, cultivation-farm-access-routes).
4. The screen must TELL the officer they are being recorded (§3.3 point 3) — was NOT built:
   the API existed but NO provider-side screen called it (only farmer screens did). Being built now.

So the legal core of tier 3 (breadth + no-finance + ม.39 record) is in force and tested; the
missing piece was the officer UI itself and its recording notice.
