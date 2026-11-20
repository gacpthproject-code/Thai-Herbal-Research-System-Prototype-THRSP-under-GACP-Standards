# Adversarial Audit — Farm / Cultivation / QR / Seed-to-Sale

Date: 2026-08-16
Scope: `apps/backend/prisma/schema/{farm,cultivation,harvest,herb,trace,work-activity}.prisma`, `routes/api/{trace,cultivation,helpers,interoperability}/**`, `services/{qrcode,traceability-service,harvest-service,farm-service,plant-unit-service}*`.
Method: read-only code inspection, file:line cited. No fixes proposed. Claims I could not verify by reading code/docs in this session are marked `PENDING` or `NEEDS LEGAL CONFIRMATION` rather than asserted.
Repo root: `C:\Users\charo\Documents\GitHub\GACP-Certification-Application`

---

## 1. Data model + lifecycle — is the chain complete?

### 1.1 Actual chain (verified from schema + routes)

```
Farm ──< Plot ──< PlantingCyclePlot >── PlantingCycle >── Farm
                        │                     │
                        │                     ├─< PlantUnit (per-plant, QR)
                        │                     ├─< CultivationLog (GACP หมวด 3)
                        │                     └── Certificate (optional FK)
                        │
                  PlantUnit.cyclePlotId (per-plant plot assignment)

PlantUnit ──(batchId, bulk updateMany, no weight)──> HarvestBatch
HarvestBatch (freshWeight/dryWeight, self-declared) ──< Lot (QR, weight-capped)
Lot ──< PackagingDetail / DryingProcess (post-harvest detail)
```

- `apps/backend/prisma/schema/farm.prisma:3-107` (Farm), `:219-256` (Plot)
- `apps/backend/prisma/schema/cultivation.prisma:5-88` (PlantingCycle), `:90-112` (PlantingCyclePlot), `:117-194` (PlantUnit, the per-plant model), `:230-264` (CareLog, per-plant), `:268-319` (CultivationLog, per-cycle/plot/plant)
- `apps/backend/prisma/schema/harvest.prisma:5-85` (HarvestBatch), `:216-260` (PackagingDetail), `:264-319` (DryingProcess)
- `apps/backend/prisma/schema/trace.prisma:3-63` (Lot), `:67-124` (TraceQrSecurity/TraceQrScan)

**Verdict: the chain from Farm → plant → harvest → packaged lot is structurally present and reasonably complete for a single-farm, single-cycle "raw material" flow.** It is NOT complete as a product/retail chain: `Lot.status` tops out at `SHIPPED` (`trace.prisma:44`) with no downstream Product/SKU/POS-sale model — there is no entity representing a consumer-facing finished product batch or its sale transaction. Severity: **MEDIUM** (matches the code's own self-description, see §4.1 — this may be in-scope-as-designed, not a bug).

### 1.2 `herb.prisma` is not part of this chain — likely a false lead in the file list

`apps/backend/prisma/schema/herb.prisma:1-11` states this is a **separate contract deliverable** ("ฐานข้อมูลสมุนไพรไทย 6 ฐานข้อมูล", a herb *knowledge* database — varieties/compounds/legal text, ≥300 rows/herb). `HerbSpecies`/`HerbKnowledgeEntry` have **no FK relation** to `Farm`, `PlantingCycle`, or `PlantUnit` — they're keyed independently by `code`/`herbCode` (`herb.prisma:19,46`). `PlantSpecies` (the model actually used by cultivation, `trace.prisma:175-228`) is a different table with similar-looking codes (`CAN`, `KRA`, `TUR`) — no FK to `HerbSpecies` either. **Verdict: naming collision risk, not a traceability defect** — anyone editing `herb.prisma` expecting to affect farm traceability would be editing the wrong file. Severity: **LOW** (documentation/discoverability risk only).

### 1.3 Status machines — enforced vs. decorative

| Entity | Declared flow | Enforced server-side? | Evidence |
|---|---|---|---|
| PlantUnit | DRAFT→PLANTED→GROWING→HARVESTED→SOLD (+DIED,REMOVED terminal) | **Yes** — explicit `statusFlow` map, rejects illegal transitions | `apps/backend/services/plant-unit-service.js:7-27`, `edit-methods.js:28-37` |
| HarvestBatch | RECEIVED→DRYING→PROCESSED→PACKED→SOLD (comment only, `harvest.prisma:54`) | **No** — `PUT /api/harvest-batches/:id` passes `status` straight to Prisma with no transition map | `apps/backend/routes/api/cultivation/harvest-batches.js:411-444`, `services/harvest-service.js:130-145` |
| Lot | CREATED→PACKAGED→TESTED→SHIPPED (comment only, `trace.prisma:44`) | `PENDING` — not verified in this session (out of primary scope; `PUT /api/lots/:id` allow-lists *fields* but I did not confirm a status-order check exists) | `apps/backend/routes/api/trace/lots.js:395-414` |
| PlantingCycle | PLANNING→…→COMPLETED (comment only, `cultivation.prisma:54-55`) | `PENDING` — no dedicated status-transition route found in `planting-cycles.js` in the time available; not confirmed either way | — |

A real per-plant status machine exists and is enforced; the batch-level one is not. This matters directly for §3.

---

## 2. QR issuance — farm-level and plant-level

### 2.1 Plant/tree-level QR — real, but NOT cryptographically sealed (contradicts internal docs)

Genuine per-plant traceability exists: `PlantUnit.qrCode`/`qrUrl` (`cultivation.prisma:143-145`, unique), generated at unit-creation time gated on an **active, non-expired Certificate** on the cycle (`core-methods.js:162-176` `validateCertificate`, called from `generatePlantUnits` at `:193-197`), publicly resolvable at `GET /api/trace/plant/:qrCode` with lifecycle status, plot/farm, care-log history (`routes/api/trace/trace.js:179-314`).

**Finding (HIGH):** despite the Prisma schema comment listing `PLANT_UNIT` as a supported `TraceQrSecurity.entityType` (`trace.prisma:72`), and despite the codebase's own manual explicitly claiming *"entityType รองรับ 3 ชนิดที่ถูกผนึก: HARVEST_BATCH | PACKAGING_LOT | PLANT_UNIT"* (`docs/contract/manual/04-track-trace-farm.md:36`), **no code path ever calls `qrcodeService.registerTraceIntegrity()` with `entityType: 'PLANT_UNIT'`** — confirmed by a repo-wide grep for `PLANT_UNIT` across `apps/backend/**/*.js` (only hits: response labels, interoperability event projection, activity-scope enums — zero integrity-registration calls). The public plant-trace response (`trace.js:296-303`) has no `integrity` block at all — only a hardcoded `verification: { valid: true, verifiedBy: 'DTAM' }`, which is **always true whenever a record is found** and is not an actual DTAM attestation. Individual-plant QR codes are therefore forgeable/unattested in a way batch and lot QR codes are not (§2.3). This is also excluded from the public integrity-check allow-list: `VERIFY_ENTITY_TYPES` only recognizes `HARVEST_BATCH`, `PACKAGING_LOT`, `PLANTING_CYCLE` (`routes/api/trace/trace-verification-routes.js:12-16`) — `PLANT_UNIT` is absent there too.

### 2.2 Farm-level QR — exists as a generator, but is a dead link end-to-end

A dedicated "Farm QR Code" sticker feature exists: `GET /api/farms/:id/qrcode` (`routes/api/cultivation/farms.js:266-289`) calls `farmService.generateQRCode()` (`services/farm-service.js:353-401`), which renders a printable HTML sticker with a real QR image encoding:

```
${PUBLIC_APP_URL}/verify/farm/${farm.id}      (farm-service.js:357)
```

**Finding (HIGH — broken by construction):** no route matches `/verify/farm/:id` anywhere. Confirmed by:
- Backend: repo-wide grep for `verify/farm` across `apps/backend/**/*.js` returns exactly **one** hit — the line that *constructs* this URL. No route registers it.
- Frontend: `apps/web-app/src/app/verify/` contains only `page.tsx` (a flat page backing a generic `TrustVerifierPortal` component for certificate/revocation lookup) — no `farm/` subfolder, no `[id]` or catch-all segment (`find apps/web-app/src/app/verify -type f` → `verify/page.tsx` only).

Scanning the printed "Farm QR Code" sticker in production would 404. This is the operator's specifically-requested feature ("QR issuance — farm-level") and it does not work end-to-end today.

### 2.3 Batch/Lot QR — the one part of this system that is genuinely well-built

`services/qrcode/qrcode-service.js:330-364` (`buildTraceIntegrity`) implements real RSA-SHA256 signing over a SHA-256 payload digest, chained per-entity-type (`previousHash` from the latest ACTIVE row of the same `entityType`, `:213-224`), with a **fail-closed production policy**: if RSA signing fails in prod it throws `QR_RSA_REQUIRED_IN_PROD` rather than silently degrading to HMAC (`:274-292`). Verification recomputes both hashes and checks the signature (`:450-515`). This is called for `HARVEST_BATCH` (`harvest-batches.js:315-334`) and `PACKAGING_LOT` (`lots.js:185-206`) at creation. Verdict: **GOOD** — real tamper-evidence for batch/lot, not cosmetic. Noted for balance; this part should not be lumped in with §2.1/§2.2.

### 2.4 Certificate-level "verify" — also real and working

`Certificate.qrData`/`verificationCode` (`certification.prisma:10-12`) are wired to a live public route: `GET /verify/:certificateNumber` and `/verify/:certificateNumber/page` (`routes/api/auth/public.js:69,203`), backed by the same `apps/web-app/src/app/verify/page.tsx`. This is a real, functioning "farm's certificate" lookup — it just isn't a **farm-level QR** (it's certificate-number-keyed, and a farm can hold zero, one, or several certificates over time via `Farm.certificates Certificate[]`, `farm.prisma:88`).

---

## 3. Seed-to-sale correctness / mass balance

Grilled against: continuous per-unit tracking seed→harvest→product→sale, immutable chain of custody, mass-balance reconciliation (input weight vs. output weight, no leakage), batch/lot genealogy.

| Control | Exists? | Evidence | Severity |
|---|---|---|---|
| Per-plant weight capture | **No** — `PlantUnit` has no weight field at all (`cultivation.prisma:117-194`); `linkToBatch()` bulk-flips plants to `HARVESTED` via `updateMany`, no weight recorded per plant | `services/plant-unit-service/trace-methods.js:72-108` | HIGH |
| Batch weight validated against plant count/yield cap | **No** — `PlantSpecies.maxYieldPerPlant` (`trace.prisma:198`) is written only by a one-off seed script and read nowhere else in the app (repo-wide grep) | `apps/backend/scripts/update_yield_data.js:24-36` | MEDIUM |
| Batch weight (freshWeight/dryWeight) immutable once lots are cut against it | **No** — `PUT /api/harvest-batches/:id` → `updateBatch()`'s mass-assignment guard excludes `freshWeight`/`dryWeight`/`status`/`qcPassed`; the code's own comment confirms this: *"the batch PUT does not validate weights and they are not immutable"* | `services/harvest-service.js:5-20,130-145`; comment at `services/traceability-service.js:598-599` | HIGH |
| QR signature re-issued when weight is later edited | **No** — `PUT /api/harvest-batches/:id` never calls `registerTraceIntegrity()` again; only the `POST` (create) path does | `harvest-batches.js:315-334` vs. `:411-444` (no integrity call) | HIGH |
| Lot weight cannot exceed batch weight (the one real reconciliation gate) | **Yes** — `createLotWithQuotaCheck` sums existing lot weights and rejects a new lot that would push cumulative packaged weight over `batch.dryWeight ?? batch.freshWeight`; fails **closed** on a zero/missing weight (Bug #22 fix, explicitly documented) | `services/traceability-service.js:547-644` | GOOD (only such gate found) |
| Batch status order enforced (e.g. can't skip QC) | **No** — see §1.3 table; `qcPassed` defaults `false` (`harvest.prisma:49`) and nothing blocks `status` reaching `PACKED`/`SOLD` while `qcPassed` is still `false` | `harvest-service.js:130-145` | MEDIUM |
| Lab test (THC/CBD/pass-fail) independently verified | **No** — `testStatus` can be set to `PASSED` by the farmer with no `labTestReportUrl` requirement; explicitly self-attested per the route's own comment | `routes/api/trace/lots.js:340,395-439`; `traceability-service.js:400-414` (`normalizeLotTestStatus` validates the enum string only) | HIGH (if THC/CBD claims feed any legal threshold — see §4.3) |
| Destruction/waste accounting (DIED/REMOVED) | **No mandatory reason, no weight** — `DIED`/`REMOVED` are terminal (`statusFlow` has `[]` for both), only `notes` (free text, optional) remains editable after; since `PlantUnit` has no weight field, destroyed material can never be reconciled into any mass balance | `plant-unit-service.js:14-26`; `edit-methods.js:4-37` | HIGH |
| Batch/lot genealogy (splits/merges across batches) | **Not supported** — one `Lot.batchId` FK, one `HarvestBatch.farmId`/`cycleId`; no model represents combining two harvests into one processing run, or splitting one plant's contribution across batches | `harvest.prisma:5-85`, `trace.prisma:3-63` | MEDIUM |
| Immutable chain-of-custody (event log, append-only) | **Partial** — `PlantUnitEditHistory` (`cultivation.prisma:198-226`) and `TraceQrScan` (`trace.prisma:103-124`) are real append-only audit trails, but the *business data itself* (batch weight, as above) is mutable without re-attestation | mixed | MEDIUM |

**Verdict: mass-balance is one hard-coded cap (packaged lot weight ≤ batch weight) sitting on top of an otherwise self-declared, mutable, unreconciled chain.** There is no continuous gram-in/gram-out accounting from plant → dry weight → packaged weight → destroyed/lost weight anywhere in this codebase.

---

## 4. Thai legal / GACP-DTAM compliance

### 4.1 The system's own contract scope is narrower than "regulatory seed-to-sale" — important framing for the operator

The codebase's own acceptance evidence explicitly frames this deliverable as **"traceability + Dynamic QR"** (a farmer interface + DTAM portal + updatable QR), not a certified controlled-substance seed-to-sale ledger:
- `docs/contract/evidence/item-7-traceability.md:5-6` — "ระบบ QR Code **แบบเปลี่ยนแปลงได้**" (a QR system whose data **can be changed**) — updatable แหล่งปลูก/วันเก็บเกี่ยว/การรับรอง (source/harvest date/certification).
- `docs/contract/manual/04-track-trace-farm.md:5-7,44-48` (internal manual, dated 10 ก.ค. 2569) — uses the term "seed-to-sale" (`:16`) for the Farm→Plot→Cycle→PlantUnit→Batch→Lot chain, but describes the batch QR explicitly as **"dynamic QR" that re-mints on request** (`:47`), i.e. mutability is the documented design intent, not an oversight.

This is a real tension worth flagging to the operator directly: a contractually-accepted "dynamic/updatable QR" is **structurally incompatible** with a regulatory seed-to-sale requirement for immutable chain-of-custody, if such a requirement applies to this platform's crops. **NEEDS LEGAL CONFIRMATION**: which bar actually governs this system — the contract's own "traceability + dynamic QR" deliverable, or a stricter controlled-substance seed-to-sale duty? I cannot resolve this from code.

### 4.2 GACP labeling is not conditioned on holding a valid certificate

`GET /api/trace/batch/:batchId` and `/lot/:lotId` hardcode `status: 'Raw Material (GACP)'` and `traceabilityScope: 'RAW_MATERIAL_GACP'` for **every** batch/lot regardless of whether a valid `Certificate` is actually attached (`routes/api/trace/trace-batch-lot-routes.js:116,156` and `:254,294`) — the nested `certificate` field is `null` when uncertified, but the top-level label does not change. Compounding this: `POST /api/harvest-batches` has **no certificate-validity check at all** (contrast with `generatePlantUnits`, which does gate on `validateCertificate()`, §2.1) — `cycleId` is optional (`harvest-batches.js:268-280`), so a batch, its Lots, and their signed QR codes (payload `scope: 'RAW_MATERIAL_GACP'`, `harvest-batches.js:320-321`; `lots.js:191`) can all be created for a farm with **no certificate ever issued**. Severity: **HIGH** — this is a factual mislabeling risk independent of which specific Thai statute applies.

### 4.3 Cannabis/kratom-specific controls — not found

`HerbSpecies.isControlled` (`herb.prisma:27`) flags cannabis and kratom as legally controlled, but this flag lives in the disconnected knowledge-base model (§1.2) and I found no code path anywhere in `apps/backend/routes` or `apps/backend/services` that:
- gates farm/cycle/plant-unit/batch creation differently when the cultivated species is controlled (no permit-number-required check tied to `PlantSpecies.requiresLicense`, `trace.prisma:194`, beyond the generic active-certificate gate already covered in §2.1/§4.2);
- enforces any THC ceiling — `Lot.thcContent` is stored and farmer-editable with no threshold comparison anywhere (repo-wide grep for a THC limit constant returned nothing);
- proactively reports cultivation/harvest/destruction events to DTAM/อย./ONCB. The only DTAM-facing surface found is a **pull** API (`routes/api/interoperability/*`, partner-API-key gated, `PartnerAccessLog`-audited — `trace.prisma:266-281`) that a partner must actively query; I found no outbound push/report-filing job in `apps/backend/jobs` or `cron` in the time available.

**NEEDS LEGAL CONFIRMATION** (I do not have confident knowledge of the current in-force Thai statute here and should not assert one): whether Thai law imposes a proactive cultivation/harvest/destruction reporting duty on this platform's crop scope (cannabis's legal regime has been actively evolving), and whether a pull-only DTAM API discharges that duty if it exists.

### 4.4 Plant-variety-source registration field — unverified form number

`SeedSource.isPorPor4Registered`/`porPor4No` (`apps/backend/prisma/schema/gacp-compliance.prisma:109-112`) references a "ภ.พ.4" registration number tied to seed/cutting source. **NEEDS LEGAL CONFIRMATION**: I cannot verify this is the correct, current Thai form number for plant-variety source documentation from code alone — flagging rather than asserting it is right or wrong.

---

## MISSING-FOR-LEGAL-SEED-TO-SALE (consolidated checklist)

1. Per-plant weight at harvest (wet/dry) — not just a status flip.
2. A yield-plausibility check (plant count × species cap vs. declared batch weight) — field exists, unused.
3. Immutability of batch weight once any Lot has been cut against it (or: re-sign integrity on every edit).
4. An enforced batch/lot status order (no skipping QC/dry/cure before PACKED/SOLD).
5. Independent (not self-attested) lab-test verification before a Lot can be marked `PASSED`, if THC/CBD claims are legally load-bearing.
6. A destruction/waste workflow with mandatory reason + weight, reconciled into mass balance.
7. Batch/lot genealogy for splits and merges across harvests.
8. Cryptographic sealing (`TraceQrSecurity`) actually extended to `PLANT_UNIT`, matching the codebase's own documentation claim.
9. A working `/verify/farm/:id` destination for the already-generated Farm QR sticker.
10. Certificate-validity gate on `HarvestBatch`/`Lot` creation (or, short of that, stop the public trace response from asserting "(GACP)" for uncertified batches).
11. Any THC/controlled-substance ceiling enforcement, if legally required for this crop scope (needs legal confirmation).
12. A proactive DTAM/อย. reporting/filing mechanism, if legally required (needs legal confirmation) — today only a partner-pull API exists.

---

*All findings above are cited to file:line read in this session. Items marked `PENDING` or `NEEDS LEGAL CONFIRMATION` were not asserted as fact. No code was modified.*
