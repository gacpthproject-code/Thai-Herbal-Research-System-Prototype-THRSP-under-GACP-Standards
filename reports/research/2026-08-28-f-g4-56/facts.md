# F-G4-56 — What happens to planting cycles / harvest / lots / QR / public trace when the certificate is REVOKED

Read-only fact-find, 2026-08-28. Repo `c:/Users/charo/Documents/GitHub/GACP-Certification-Application`,
branch `fix/review-step-shared-dedupe-lens`. Real case: **GACP-TH-2569-CAE820**, revoked 2026-08-27.

No writes were performed. The public-trace resolvers were NOT executed, because a scan increments
`TraceQrSecurity.scanCount` (`apps/backend/services/qrcode/qrcode-service.js:559-562`) and writes an
audit row — that would have been a DB mutation. Live HTTP responses below are therefore derived from
code reading, and marked where they are inference rather than observation.

---

## 0. HEADLINE

Revocation is **certificate-local**. It stamps three columns on one row and writes one audit entry.
Nothing downstream is touched: the planting cycles keep pointing at the revoked certificate, the
harvest batch and lot keep their QR codes, and every `TraceQrSecurity` row stays `status = 'ACTIVE'`.

The consequences that DO exist are accidental side effects of read-time filters, and they fall the
wrong way round:

| Surface | Spec says | Code does |
|---|---|---|
| Farmer's cycle list | keep recording the existing cycle (spec:52) | **cycle disappears** — hard-filtered on active cert |
| Starting a new cycle | blocked until cert active again (spec:52) | blocked — but by a 409 naming an **invisible** cycle |
| Public LOT / BATCH / generic QR | show the real status (spec:76) | **410 Gone**, rendered to the consumer as "ไม่พบข้อมูล" |
| Public PLOT QR (`/trace/plot-cycle/:qr`) | show the real status (spec:76) | **200 OK + a hardcoded green "GACP certified" shield** |

So a consumer scanning the bag QR is told the product does not exist; a consumer scanning the sign in
the field is shown a green shield asserting the site is GACP certified. And the farmer, whose data
the spec says must remain recordable, is the one locked out.

**The single highest-severity finding:** `/trace/plot-cycle/:qrCode` has no certificate gate on the
server and an unconditional certified claim on the client — and plot-sign QR printing is not
cert-gated either, so a farmer whose certificate was revoked can still print signs that publicly
assert active certification.

---

## 1. SCHEMA — how the trace chain references the certificate

`apps/backend/prisma/schema/*.prisma`

- **`PlantingCycle.certificateId`** — `apps/backend/prisma/schema/cultivation.prisma:18-19`
  (`certificateId String?` / `certificate Certificate? @relation(...)`). **Nullable, no `onDelete`
  behaviour, no status denormalisation.** This is the ONLY edge from the whole cultivation/trace tree
  to the certificate.
- Reverse side: `Certificate.plantingCycles PlantingCycle[]` — `certification.prisma:153`.
- **`HarvestBatch`** — `harvest.prisma:8-88`. Reaches the certificate only transitively via `cycleId`
  (`:22-23`, **nullable**) and `farmId` (`:26-27`). Carries its own `qrCode` (`:18`) and
  `trackingUrl` (`:19`). No certificate column.
- **`Lot`** — `trace.prisma:3-63`. Reaches the certificate only via `batchId → cycleId →
  certificateId` (`:13-14`). Carries `qrCode String @unique` (`:23`, **non-nullable**) and
  `trackingUrl` (`:24`). No certificate column.
- **`TraceQrSecurity`** — `trace.prisma:67-101`. The QR seal itself. Has its own
  `status String @default("ACTIVE")` (`:86`) and an `(entityType, entityId)` key (`:95`).
  **No certificateId.** `entityType` is documented as `HARVEST_BATCH | PACKAGING_LOT | PLANT_UNIT`
  (`:72`) — the live data also holds `PLANTING_CYCLE_PLOT` rows, which that comment does not list.
- **`Plot.qrRevokedAt`** exists and is read at
  `apps/backend/services/trace-service/resolve-plot-cycle.js:308,313`.
- Certificate revocation columns: `certification.prisma:74-77` (`revokedAt`, `revokedBy`,
  `revokedReason`); suspension `:79-88`; renewal chain `:90-92`.
- Status vocabulary is a free-text `String`, not an enum — `certification.prisma:53`:
  `status String @default("active") // active, expired, revoked, renewed, suspended`.
  Casing is inconsistent across the codebase and is a live defect source (see §3.4, §5.1).

**Negative finding:** there is no `certificateStatus` snapshot, no `revokedAt` propagation column,
and no join table anywhere in the cultivation/harvest/trace schema. Nothing in the schema can express
"this lot was produced under a certificate that has since been revoked" except by re-walking the FK
chain at read time.

---

## 2. SPEC — the planting + T&T design (R1-R20)

File: **`docs/superpowers/specs/2026-08-20-planting-tnt-design.md`** (250 lines).
Commit `930277aa` ("docs(spec): R8 — per-plant (PlantUnit) tracking retired…", 2026-08-20) touched
exactly this one file.

### The rules the question asks about

- **R2 — planting locked until cert** (`:17`):
  > "**ห้ามใช้ระบบบันทึกการปลูกก่อนได้ใบรับรอง** — ทั้งเมนูล็อกจนกว่าผู้ใช้มีใบ GACP ที่ active"
- **R3 — QR after cert only** (`:18`):
  > "**QR ออกได้หลังมีใบรับรองเท่านั้น** (เป็นผลอัตโนมัติจาก R2 — รอบปลูกเกิดได้เฉพาะหลังมีใบ)"

### The revocation / expiry rule — the load-bearing line

**`docs/superpowers/specs/2026-08-20-planting-tnt-design.md:52`**:
> "ใบหมดอายุ/ถูกเพิกถอนกลางรอบ: บันทึกรอบเดิม**ต่อได้** (ข้อมูลจริงต้องบันทึกได้)
> แต่**เริ่มรอบใหม่ไม่ได้** จนใบกลับมา active"

("Certificate expires / is revoked mid-cycle: recording on the EXISTING cycle **may continue** — real
data must be recordable — but **a new cycle may not be started** until the certificate is active
again.")

This is a two-part rule, and the code today gets **both halves wrong in the same direction** (§3.1,
§3.2): recording on the existing cycle is broken, and starting a new cycle is blocked by an error
naming a cycle the farmer can no longer see.

### The public-page rule

- **`:76`** (§4.4 table, "หน้าสแกนสาธารณะ"):
  > "| สถานะใบรับรอง | เลขใบ + สถานะจริงเสมอ (active/หมดอายุ/เพิกถอน) + ลิงก์ verify |"

  ("Certificate status | number + **always the real status** (active / expired / revoked) + a link to
  verify") — the spec asks for *disclosure*, not for a withdrawn page.
- **`:144`** (§7.4, "สิ่งที่ยังต้องมี ไม่งั้นยังไม่ใช่ Track & Trace"):
  > "**ใบรับรอง ณ วันตัด**: ต้องตรวจว่าใบ active ณ วันเก็บเกี่ยว ไม่ใช่แค่ active วันนี้"

  ("The certificate **as at the cut date**: must check the certificate was active on the harvest
  date, not merely active today.") — **not implemented anywhere**; every check in the codebase
  compares against `new Date()`.

### Other rules bearing on this

- **R8** (`:23`) — per-plant (`PlantUnit`) tracking retired permanently. Still 500 live rows (§6).
- **R10 revised** (`:223-229`) — three identities: plot QR (permanent, editable until cut),
  harvest-batch QR, lot QR (frozen at packing).
- **R12** (`:100`) — once cut, the cycle's planting record is locked forever.
- **R15** (`:152`) — one open cycle per plot, enforced at the DB.
- **R20** (`:181`) — "**เลิกใช้พื้นที่ = เพิกถอนป้าย** (`qrRevokedAt`) ไม่ปล่อยค้างให้สแกนเจอ"
  ("abandoning a plot = revoke the sign; do not leave it hanging around to be scanned"). This is
  about abandoning a *plot*, **not** about certificate revocation.

**Negative finding — important:** the spec never says what happens to an already-issued QR, an
already-packed lot, or an already-harvested batch when the certificate behind them is revoked. R20 is
the closest thing and it has a different trigger. There is no rule in the spec matching ISO/IEC 17065
§7.11's "the client must stop using the certification and the marks". The 410 gate that exists in the
code (§3.4) is therefore an engineering decision with **no spec line behind it**, and it contradicts
spec `:76`, which asks for the real status to be shown rather than the page withdrawn.

---

## 3. BACKEND SERVICES — the guards that exist today

### 3.1 Planting-cycle listing: the revoked cycle VANISHES

`apps/backend/services/planting-service.js`

```
:122-124  isActiveCertificateStatus(status) → status.trim().toLowerCase() === 'active'
:125-135  getActiveCertificateWhere()  → { isDeleted:false, status:{in:['active','ACTIVE']}, expiryDate:{gte:now} }
:137-158  listByFarm()   — where.certificateId={not:null}; where.certificate = getActiveCertificateWhere(now)
:159-183  listByOwner()  — same filter
```

Both list methods **hard-filter on an active, unexpired certificate**. A cycle whose certificate is
revoked matches no row and is silently dropped from the farmer's list.

Routes: `apps/backend/routes/api/cultivation/planting-cycles.js:73` (`listByOwner`) and `:117`
(`listByFarm`).

**This directly violates spec `:52`.** The farmer cannot record on a cycle they cannot see.

The detail loader does NOT filter — `apps/backend/services/planting/planting-cycle-detail-loader.js:8-9`
(`prisma.plantingCycle.findUnique({ where: { id } })`). So the cycle is still reachable by direct URL
if the id is known. That is an inconsistency, not a mitigation.

### 3.2 Creating a new cycle: blocked, but by a confusing error

`apps/backend/services/planting-service.js:270-305` (`createCycle`):

- `:271-289` — an explicitly-passed `certificateId` is verified: must belong to the farm (`:282`
  `'Certificate not found for this farm'`), must be active (`:284-285`
  **`'Certificate is not active'`** ← a revoked cert lands here), must not be expired (`:287-288`
  `'Certificate has expired'`).
- `:291-304` — otherwise it **auto-links the farm's latest active certificate** (`:292-302`), and if
  there is none: `:303-304` `'Active certificate is required before creating planting cycle'`.

So the "cannot start a new cycle" half of spec `:52` IS enforced. But see the trap.

**The trap (R15 × revocation).** The one-open-cycle-per-plot guard,
`apps/backend/services/planting-service.js:71-121` (`assertNoOpenCycle`), filters on
`status: { in: OPEN_CYCLE_STATUSES }` (`:80`) where
`OPEN_CYCLE_STATUSES = ['PLANNING','PLANTED','GROWING','READY_HARVEST']` (`:54`).
It does **not** filter on certificate status.

For CAE820's farm that means cycle `f5a675aa` (status `PLANTED`, cert revoked) is **hidden from the
list** by §3.1 but **still holds plot `PLOT-BEJAD-M4SR7`**. The farmer — who now holds a fresh active
certificate `E5960D` on the same farm (§6) — presses "new cycle" on that plot and gets HTTP 409:

```
planting-service.js:108-113
  `พื้นที่ปลูก "<plot>" มีรอบปลูกที่ยังเปิดอยู่คือ "<cycleName>" คุณต้องปิดรอบเดิมโดยบันทึกการเก็บเกี่ยวก่อน ...`
  error.code = 'PLOT_ALREADY_HAS_OPEN_CYCLE'   error.statusCode = 409
```

The message tells them to close the cycle by recording its harvest. They cannot: the cycle is not in
their list (§3.1), and recording its harvest is refused because the certificate is not active (§3.3).
**This is a closed loop with no in-app exit.**

### 3.3 Harvest: gated on certificate status

`apps/backend/services/planting-cycle/harvest-capacity-operations.js`

```
:35      loads certificate { id, status, expiryDate }
:53-54   !cycle.certificateId              → 400 'Active certificate is required before harvest'
:56-57   status.toLowerCase() !== 'active' → 400 'Certificate is not active'      ← REVOKED lands here
:59-60   expiryDate < now                  → 400 'Certificate has expired'
:325-329 capacity query filters certificates to status in ['active','ACTIVE']
```

Duplicated on the legacy route:
`apps/backend/routes/api/cultivation/planting-cycles-activity-harvest-routes.js:225,233,240`.

A cycle under a revoked certificate therefore **cannot be harvested** — consistent with "no new
activity", but it is also what makes §3.2's loop inescapable, and the spec (`:52`) explicitly wanted
recording to continue.

### 3.4 Public trace — TWO DIFFERENT ANSWERS

**The shared gate** — `apps/backend/services/trace-service/common.js:242-274`:

```js
function evaluateCertGate(cert) {
    const statusRaw = String(cert?.status || '').toUpperCase();
    const certExpired = !!cert?.expiryDate && new Date(cert.expiryDate) < new Date();
    const isValid = !!cert && statusRaw === 'ACTIVE' && !certExpired;
    const gated  = !!cert && !isValid;              // ← revoked ⇒ gated
    ...
    minimalBody(type) → { success:false, verification:{ valid:false, reason:`certificate_${statusLower}` },
                          certificate:{ reference, status, issuedDate, expiryDate },
                          message: 'ใบรับรองไม่อยู่ในสถานะใช้งาน / Certificate is not active' }
```

For a revoked cert this yields `reason: 'certificate_revoked'`, `status: 'revoked'`, and the Thai
message "ใบรับรองไม่อยู่ในสถานะใช้งาน". The message does **not** say "เพิกถอน" — it says "not in an
active state", the same wording a suspended or renewed certificate gets. The machine-readable
`reason` distinguishes them; the human-readable text does not (and no frontend reads `reason` — §5.4).

**Doors that DO gate (HTTP 410 Gone):**

| Door | File:line |
|---|---|
| generic `/api/trace/:qrCode` → PLANTING_CYCLE | `services/trace-service/resolve-generic.js:134-135` |
| generic → HARVEST_BATCH | `resolve-generic.js:245-246` |
| generic → LOT | `resolve-generic.js:322-323` |
| `/api/trace/batch/:batchId` | `routes/api/trace/trace-batch-lot-routes.js:64,75-83` |
| `/api/trace/lot/:lotId` | `routes/api/trace/trace-batch-lot-routes.js:204,212-219` |

The batch route carries the intent verbatim (`trace-batch-lot-routes.js:67-75`):
> "PR-1.9: revoked / expired certificates must NOT continue to expose full trace data via the public
> batch endpoint. A consumer scanning a QR after revocation should get a clear 'this certificate has
> been revoked / expired' response, not the original trace as if everything were fine."

Both gated routes also write an audit row with `rejectedReason: 'CERT_REVOKED'`
(`trace-batch-lot-routes.js:76-82`, `:205-215`).

Cross-farm hardening exists alongside: the certificate is dropped when the batch's cycle belongs to a
different farm (`resolve-generic.js:242-244`, `:319-321`; `trace-batch-lot-routes.js:61-62`, `:201-202`).

**The door that DOES NOT gate — the plot sign (QR #1):**

`apps/backend/services/trace-service/resolve-plot-cycle.js` (690 lines) **never queries the
certificate at all.** The word "certificate" appears exactly twice in the file, both in prose comments
(`:249`, `:342`). Confirmed:

- `ASSIGNMENT_INCLUDE` (`:56-71`) selects plot, cycle, farm, plantSpecies — **no certificate**.
- The success body (`:566-644`) has **no `certificate` key**: it publishes farm name + district +
  province (`:578-583`), plot name and code (`:575`, `:605-610`), cycle name/status/dates (`:596-604`),
  species (`:635-639`), and a batch/lot summary (`:618-628`).
- `:640` hardcodes **`verification: { valid: true, scannedAt: ... }`**.
- The only 410 in the file is `:313-317`, driven by **`Plot.qrRevokedAt`** (R20) — a *different
  trigger* — returning `reason: 'plot_sign_revoked'` (`:260`).

So `GET /api/trace/plot-cycle/<qr>` for a cycle under a revoked certificate returns **200 with
`valid: true`** and full farm/plot/crop data. (Inference from code read; not executed.)

A second, quieter consequence: the plot resolver requires an OPEN cycle (`:321-331`,
`cycle.status in OPEN_CYCLE_STATUSES`). A harvested cycle falls to `buildDormantPlotBody`
(`:184-215`) → **200 `plotStatus: 'NO_OPEN_CYCLE'`**. Also no certificate field.

**Dead code:** `buildCertificateSnapshot` (`common.js:207-220`) builds exactly the
`{ number, status, isValid }` shape the plot page is missing — and it is **exported (`common.js:306`)
but never imported by any caller** (repo-wide grep: only its own definition and the export). It also
carries the uppercase-casing bug the gate was written to fix: `:209` `cert.status === 'ACTIVE'`
against rows stored `'active'`, so its `isValid` would be `false` for every live certificate.

### 3.5 QR / lot issuance guards

- `apps/backend/services/qrcode/qrcode-service.js` — **grep for `cert` returns zero hits.** Minting a
  QR seal performs no certificate check whatsoever (the single `traceQrSecurity.create` site is
  `:423`). R3 ("QR only after a certificate") is enforced *indirectly*, via the cycle-creation gate
  (§3.2), and only at creation time — nothing re-checks later.
- The plot-QR generation route `POST /:id/plot-qrs/generate`
  (`apps/backend/routes/api/cultivation/planting-cycles-plot-routes.js:35`) gates on
  `ensureCycleReachable` + `requireCycleFarmPermission('QR_GENERATE')` (RBAC) — **not** on
  certificate status. `generatePlotCycleQrsForCycle`
  (`apps/backend/services/planting-cycle-service.js:348`) reads no certificate.
- **No code path anywhere flips `TraceQrSecurity.status` away from `'ACTIVE'` in response to a
  certificate revocation.** The only writers are the mint/upsert (`qrcode-service.js:397-403`) and
  the scan-count increment (`:559-562`).
- **Nothing in the repo ever writes `Plot.qrRevokedAt`.** Grep over `services/`, `routes/`,
  `scripts/`, `prisma/` finds only reads (`resolve-plot-cycle.js:308,313`) and a comment
  (`plot-code-extension.js:42`). R20's write side does not exist.

### 3.6 Two dead guards

`apps/backend/services/planting-cycle-service.js`:

- `hasActiveCertificate(cycle)` — `:274-281`. Correct logic (lowercases, checks expiry, checks
  `isDeleted`). Exported at `:637`. **Zero callers repo-wide.**
- `verifyOwnedCycle(..., { requireActiveCert: true })` — the option is implemented at `:323-331`.
  **No caller ever passes it** (grep for `requireActiveCert` returns only `:212`, `:305` comments and
  the `:323` implementation).
- The docblock at `:212` refers to a function `requireActiveCertificate(cycle)` that **does not exist**.

---

## 4. `revokeCertificate` — what it actually touches

`apps/backend/services/certificate-service.js:1672-1761`.

Sequence: validate reason (`:1681-1684`) → resolve by number then id (`:1690-1694`) → 404 if missing
(`:1697-1700`) → org-guard, fail-closed, same 404 cross-tenant (`:1702-1711`) → 409 if already revoked
(`:1713-1723`) → **one atomic `certificate.update`** (`:1728-1749`) setting `status:'revoked'`,
`revokedAt`, `revokedBy`, `revokedReason`, `updatedBy` → best-effort audit (`:1758`).

The ISO reference is in-line at `:1713-1716`:
> "the revocation record (revokedAt/revokedBy/revokedReason) is the ISO/IEC 17065 §7.11 record of
> decision; a second press must never overwrite who/when/why."

`:1741-1747` deliberately does **not** soft-delete, so the row stays visible as REVOKED on the public
verify / interop endpoints instead of reading as "never existed".

`_auditCertLifecycle` (`:2030-2051`) writes one audit-log row and swallows its own errors (`:2050`).

**Negative findings — confirmed by reading the full method body:**
- It does **not** touch `PlantingCycle` (no `plantingCycle` reference in the method).
- It does **not** touch `HarvestBatch`, `Lot`, or `TraceQrSecurity`.
- It does **not** touch the `Application` (CAE820's application is still `CERTIFIED` — §6).
- It sends **no notification.** The only `notif` hit in the whole 2000+ line file is `:1516`, a
  comment about a *renewal-reminder* bulk route. The farmer is never told.
- The admin door `POST /api/admin/certificates/:id/revoke`
  (`apps/backend/routes/api/admin/certificates.js:79-146`) only validates the body and delegates
  (`:103`); it adds no side effects (`:14-17` says so explicitly).

**The one thing that does propagate:** the partner interoperability feed emits a
`CERTIFICATE_REVOKED` event —
`apps/backend/routes/api/interoperability/interoperability-trace-events.js:34-43` (with
`revokedReason` masked for Thai national IDs, `:8-9`). That is an outbound partner read API, not an
internal state change.

---

## 5. WEB — what a farmer and a consumer see today

### 5.1 The planting menu gate — EXISTS, and it does lock on revoked

`apps/web-app/src/app/health/planting/layout.tsx:11` wraps the whole subtree in `PlantingCertGate`.
`apps/web-app/src/app/health/planting/planting-cert-gate.tsx:37-38`:
```
const { hasActiveCert, certsLoaded } = useNavChips({ chips: false });
const locked = certsLoaded && !hasActiveCert;
```

The comparison is **case-insensitive**, via
`apps/web-app/src/lib/navigation/use-nav-chips.ts:196-200` →
`apps/web-app/src/app/health/certificates/cert-status.ts:56-57`:
```
const s = String(status || '').toUpperCase();
if (s !== 'ACTIVE' || daysLeft <= 0) return 'expired';
```
`'revoked'` → not `'ACTIVE'` → `'expired'` → `hasActiveCert:false` → **locked**. This is deliberate:
`cert-status.ts:47-54` documents the exact bug being defended against ("a REVOKED cert keeps a future
expiryDate, so the old days-left → active fallthrough painted it green").

**What the farmer is told** — `planting-cert-gate.tsx:50-53`:
> **เมนูนี้ยังใช้งานไม่ได้**
> บันทึกการปลูกเปิดใช้เมื่อคุณได้รับใบรับรอง GACP ที่ยังไม่หมดอายุ ขณะนี้คุณยังไม่มีใบรับรอง GACP ที่ใช้งานได้

**The copy is wrong for this user.** A farmer whose certificate was *revoked* is told he has *no
certificate*, and that the menu opens with one *"ที่ยังไม่หมดอายุ"* (not expired). Revocation is never
named. Buttons offered are `/health/status` and `/health/home` (`:56-61`).

The gate **fails OPEN** on unknown/error state (`:38`, documented `:29-34`) — during load or on a
fetch error the planting UI renders normally; `planting-service.js` is the real boundary.

### 5.2 Cycle list page — NOTHING (negative finding)

`apps/web-app/src/app/health/planting/client-view.tsx` (233 lines): **no certificate status display,
no banner, no warning, no reference to a certificate of any kind.** The card renders only cycle
status, species, plot/plant counts, progress bar, dates and a `READY_HARVEST` chip (`:216-221`).
`statusLabelMap` (`:24-31`) and `statusChipMap` (`:37-44`) contain only cycle statuses.

### 5.3 Cycle detail page — DOES warn, but never says "revoked"

Computed at `apps/web-app/src/app/health/planting/[id]/planting-cycle-detail-page-config.ts:44-53`,
here with **lowercase** normalisation (the opposite direction from §5.1, both case-insensitive):
```
const status = String(cycle?.certificate?.status || '').toLowerCase();
if (status !== 'active') { return false; }
```
Note `:49-51` — **a missing `expiryDate` returns `true`**.

Four renderings:
1. Hero badge — `planting-cycle-detail-header-block.tsx:126`: `ยังไม่ผูกใบรับรองที่ใช้งานได้`
2. Alert — `planting-cycle-detail-header-block.tsx:176-180`: title **ยังไม่พร้อมดำเนินการรอบปลูก** /
   `รอบปลูกนี้ยังไม่ผูกใบรับรองที่ใช้งานได้ คุณจึงยังบันทึกเก็บเกี่ยวและสร้างลอตไม่ได้`
3. Overview field — `planting-cycle-detail-tabs-section-a-overview-plots.tsx:122-129`. The certificate
   **number IS shown**, annotated:
   `${cycle.certificate.certificateNumber} (${hasActiveCertificate ? 'ใช้งานได้' : 'ยังไม่พร้อม'})`
4. Harvest blocker list — `use-planting-cycle-detail-derived.ts:65-67`: `'ไม่มีใบรับรองที่ใช้งานได้'`

All four say "not linked" / "not ready" / "don't have". For a revoked cert the number *is* on screen
but annotated merely `(ยังไม่พร้อม)` — "not ready yet", which reads as *pending*, the opposite of
*revoked*. **No banner anywhere in the planting subtree contains เพิกถอน, ถูกยกเลิก or หมดอายุ.**

### 5.4 New-cycle page

`apps/web-app/src/app/health/planting/new/client-view.tsx:82-91` filters (lowercase compare), and
`:92-97` then filters the **farm list itself** down to farms with an eligible cert — so the farm
silently disappears from the dropdown (duplicated as a `useMemo` at `:157-172`). Copy:
- `:343` `ยังไม่มีใบรับรองที่ใช้งานได้`
- `:354` `ไม่พบใบรับรองที่ใช้งานได้ของฟาร์มนี้ จึงยังไม่สามารถเปิดรอบปลูกได้`
- `:371-373` `ยังไม่มีฟาร์มที่พร้อมเปิดรอบปลูก`
- `:405-408` `ยังเปิดรอบปลูกไม่ได้` / `ฟาร์มนี้ยังไม่มีใบรับรองที่ใช้งานได้ กรุณาดำเนินการรับรองหรือเลือกฟาร์มที่มีใบรับรองก่อน`

`กรุณาดำเนินการรับรอง` ("please go get certified") is misleading advice for someone who *was*
certified and got revoked.

### 5.5 Harvest vs QR-print — asymmetric

- **Harvest IS gated.** `planting-cycle-detail-gates.ts:31-43` (`if (!hasActiveCertificate) return false`),
  wired at `[id]/client-view.tsx:85,105-107`; button `disabled={!canHarvest}` at
  `planting-cycle-detail-header-block.tsx:144`.
- **QR is NOT gated by certificate status.** The "รีเฟรช QR" button
  (`planting-cycle-detail-header-block.tsx:141-143`) has only `loading=`, no `disabled` on cert state.
  `[id]/plot-qr-permission.ts:34-38` gates purely on workspace *permission*. `[id]/plot-signs/client-view.tsx`
  and `[id]/plot-signs/page.tsx` contain **zero** `cert|hasActive` hits — the printable plot-sign
  sheet has no certificate gating at all.

**A farmer with a revoked certificate can still refresh and print plot-sign QR codes bearing GACP marks.**

### 5.6 Public trace pages

Routes: `/trace` (search landing), `/trace/[qr-code]`, `/trace/batch/[qr-code]`, `/trace/lot/[lot-id]`,
`/trace/plot-cycle/[qr-code]` — all under `apps/web-app/src/app/trace/`. **There is no
`(public)/trace` directory** (negative finding); only `(public)/verify` exists.

**The 410 becomes "not found".** `apps/web-app/src/app/trace/trace-fetch.ts:62-63` maps
**410 → `'not-found'`** (documented `:14-18`). So the consumer sees the red not-found card:
- `trace/[qr-code]/client-view.tsx:52,86-98` — heading (`:93`) **ไม่พบข้อมูลผลิตภัณฑ์**, body (`:94`)
  `ใบรับรองไม่อยู่ในสถานะใช้งาน / Certificate is not active`
- `trace/batch/[qr-code]/client-view.tsx:177-182` — heading **ไม่พบข้อมูลการตรวจสอบย้อนกลับ**, reason at `:181`

The headline asserts the product does not exist; only the small sub-line hints at the real cause, and
it says "not active", not "revoked". A consumer holding a physical package is told it is not in the
system. Transport failures are correctly separated (`trace-unavailable.tsx:27-32`, neutral amber
**ไม่สามารถตรวจสอบได้ในขณะนี้** with retry) — that part is well done.

The batch/lot pages do have a status badge — `batch/[qr-code]/client-view.tsx:269-276` and
`lot/[lot-id]/client-view.tsx:284-300`, rendering `ยังไม่หมดอายุ (Active)` vs
**`หมดอายุหรือไม่มีผล`** — but these are **effectively dead code for a revoked cert**, since the 410
gate fires before the render path is reached.

**The gap — `/trace/plot-cycle/[qr-code]`.**
`apps/web-app/src/app/trace/plot-cycle/[qr-code]/client-view.tsx:295-298` renders an
**unconditional, hardcoded** green shield:
```
<ShieldCheck className="h-4 w-4" />
แหล่งปลูกได้รับการรับรอง GACP
```
No conditional, no data binding, no certificate status anywhere in the file — and the backend behind
it never checks either (§3.4). **Scanning a plot-sign QR for a plot whose certificate has been
revoked shows the consumer a green shield asserting "This growing site is GACP certified."**

**No page anywhere under `/trace` contains เพิกถอน or ถูกยกเลิก.**

### 5.7 The comparison point — `/verify/[cert-number]` handles it properly

`apps/web-app/src/app/(public)/verify/[cert-number]/verify-view.tsx:105-133` is a frozen reason-code table:
- `REVOKED` (`:114-117`): **ใบรับรองถูกเพิกถอนแล้ว** / `หน่วยรับรองเพิกถอนใบรับรองฉบับนี้แล้ว ใช้อ้างอิงไม่ได้อีก`
- `EXPIRED` (`:106-109`), `SUSPENDED` (`:110-113`) **ใบรับรองถูกระงับชั่วคราว**
- `RENEWED` (`:118-121`): **ใบรับรองฉบับนี้ถูกแทนที่ด้วยฉบับต่ออายุแล้ว** / `กรุณาตรวจสอบใบรับรองฉบับปัจจุบันแทน`
- `NOT_FOUND` (`:125-128`), `CODE_MISMATCH` (`:129-132`), expired+successor (`:140-141`),
  unknown-code fallback (`:151-153`)
- Rendered red by `StatusReason` (`:317-344`), **including a link to the successor certificate**
  (`:335-340`, `ตรวจสอบฉบับปัจจุบัน {number}`) — the "renewed/superseded" case has a real forward
  path here and **nowhere else**.

**`/verify` is the only surface in the entire product that ever tells anyone a certificate was revoked.**

### 5.8 The signal exists on the wire and is discarded

The backend emits `reason: 'certificate_revoked'` (`common.js:260`), but **no frontend consumes it** —
grep for `certificate_revoked` across `apps/web-app` returns nothing. The distinguishing information
is already on the wire; the UI throws it away and prints the generic message instead.

---

## 6. LIVE DB — CAE820's actual footprint

Read-only `SELECT`s via Prisma against the repo-root `.env` database, 2026-08-28.
Script: `scratchpad/research-f-g4-56/db.js`. No names of natural persons included.

**Certificate**
```
GACP-TH-2569-CAE820   id a1e74a31-50f0-478e-9dc5-b841d0ff0bbe
status      revoked
issued      2024-01-01      expiry 2027-01-01   ← NOT expired; revocation is the only reason it is invalid
revokedAt   2026-08-27 01:32:05.158
reason      "ใบรับรองนี้ลงนามด้วยคีย์ที่ระบบไม่เชื่อถือ (คีย์ถูกหมุนโดยการรันเทสเมื่อ 2026-08-26 ...)"
            — revoked because a test run rotated the signing key, not for an agronomic fault
org         621002a3-4542-446e-9504-838693009c84
```

**Application** `APP-2569-MT87HW1N-450568` — status **`CERTIFIED`**, unchanged by the revocation.

**Farm** `f55137a9…` — "ไร่ใจดีสมุนไพรไทย", เมืองเชียงใหม่, เชียงใหม่, `isDeleted=false`.

**Certificates on that farm — the farm now holds a VALID one:**
| number | status | expiry | revokedAt |
|---|---|---|---|
| GACP-TH-2569-CAE820 | revoked | 2027-01-01 | 2026-08-27 |
| **GACP-TH-2569-E5960D** | **active** | 2029-08-26 | – |

**Planting cycles — both still bound to the REVOKED certificate:**
| id | name | status | certificateId | plotId | start | harvested | isDeleted |
|---|---|---|---|---|---|---|---|
| f5a675aa… | รอบที่ 1/2567 ฤดูแล้ง | **PLANTED** (open) | a1e74a31 (revoked) | 6f5574ab | 2024-01-15 | – | false |
| b727d0f2… | รอบที่ 1/2567 ฤดูแล้ง | **HARVESTED** | a1e74a31 (revoked) | 6f5574ab | 2024-01-15 | 2024-04-20 | false |

Neither was re-pointed at the new active certificate E5960D. Both share plot `6f5574ab` /
**`PLOT-BEJAD-M4SR7`** / "แปลงกลางแจ้ง 1" (cycle-plot rows `e869aa52`, `1fbb996c`).

**Harvest batch** — `BATCH-2569-000019`, status `PACKED`, harvested 2024-04-20, `qrCode 5c508e31-…`,
`trackingUrl http://localhost/trace/batch/b153edc0-…`, `isDeleted=false`.

**Lot** — `LOT-2569-000019-A`, status `PACKAGED`, `qrCode 812c4940-…`,
`trackingUrl http://localhost/trace/lot/eefa90c1-…`, `printedAt = null`, `isDeleted=false`.

**QR seals — all four still `ACTIVE` the day after revocation:**
| entityType | entityId | qrCode | status | scanCount |
|---|---|---|---|---|
| HARVEST_BATCH | b153edc0… | 5c508e31… | **ACTIVE** | 0 |
| PACKAGING_LOT | eefa90c1… | 812c4940… | **ACTIVE** | **1** |
| PLANTING_CYCLE_PLOT | 1fbb996c… (HARVESTED cycle) | b2304d83… | **ACTIVE** | 0 |
| PLANTING_CYCLE_PLOT | e869aa52… (PLANTED cycle) | ebb46e67… | **ACTIVE** | 0 |

**`plant_units` under these two cycles: 500 rows** — R8 retired per-plant tracking in the design; the
rows are still live (consistent with the known "PlantUnit retired but still live" item).

**What this data means combined with §3 and §5** (inference from code; resolvers not executed):
- `/trace/lot/eefa90c1…` and `/trace/batch/b153edc0…` → **410**, rendered to the consumer as
  **ไม่พบข้อมูล** ("not found").
- `/trace/plot-cycle/ebb46e67…` (the PLANTED cycle) → **200 OK, `valid:true`**, full farm/plot/crop
  data, and the page paints **"แหล่งปลูกได้รับการรับรอง GACP"**.
- `/trace/plot-cycle/b2304d83…` (the HARVESTED cycle) → **200 OK**, `plotStatus: 'NO_OPEN_CYCLE'`.
- Farmer's `/api/cultivation/planting-cycles` list → **both cycles absent**.
- Farmer starting a new cycle on `PLOT-BEJAD-M4SR7` → auto-links E5960D, then **409
  `PLOT_ALREADY_HAS_OPEN_CYCLE`** naming "รอบที่ 1/2567 ฤดูแล้ง", which is not in their list.
- The planting menu itself is **not** locked, because E5960D is active — so the farmer reaches a list
  that is missing their own history, with no explanation anywhere.

---

## 7. TESTS

| # | Behaviour | Verdict |
|---|---|---|
| 1 | Planting-cycle create gated on cert status | **BACKEND: DO NOT EXIST.** UI-only test exists, expired branch only |
| 2 | Harvest gated on cert status | **PARTIAL** — only the `certificateId: null` branch |
| 3 | QR mint / TraceQrSecurity gated on cert status | **DO NOT EXIST** (no gate in the code either) |
| 4 | Public trace under revoked/expired cert | **EXIST** for `/:qrCode`, `/batch/*`, `/lot/*`. **DO NOT EXIST** for `/plot-cycle/*` (no gate either) |
| 5 | `revokeCertificate` + admin revoke route | **EXIST** (4 files). Side effects on cycles/QR/lots/trace: **CONFIRMED ABSENT** |
| 6 | Suspension / reinstatement (§7.11) | **EXIST** |
| 7 | e2e revoked-cert → trace walk | **CONFIRMED ABSENT** (both halves exist, never joined) |

**Detail**

1. No backend test asserts any of the four `createCycle` strings
   (`'Certificate not found for this farm'`, `'Certificate is not active'`, `'Certificate has expired'`,
   `'Active certificate is required before creating planting cycle'`). Nearby tests mock
   `plantingService.createCycle` wholesale so the gate never runs
   (`apps/backend/__tests__/integration/planting-plot-trace.test.js:332,404`;
   `apps/backend/__tests__/integration/cycle-create-mints-zero-plant-units.test.js:153-186`).
   UI gate tests: `apps/web-app/src/app/health/planting/__tests__/planting-cert-gate.test.tsx:94,100,115,136,151`
   — **no case uses a `'revoked'` status**; the revoked path works by inference through
   `getCertBadgeKind`, not by assertion.
   `hasActiveCertificate` / `requireActiveCert` (§3.6): **zero callers, zero tests**.
2. `apps/backend/__tests__/unit/harvest-does-not-require-plant-units.test.js:80` —
   `it('still refuses when the certificate is missing, so removing the unit gate did not open the cert gate')`,
   asserting 400 + `'Active certificate is required before harvest'` for `certificateId: null`
   (assertion `:108-109`). **`'Certificate is not active'` (the revoked branch) and
   `'Certificate has expired'` are UNTESTED on the harvest path.** The legacy route
   `planting-cycles-activity-harvest-routes.js` has **no test file at all**.
3. Existing QR-mint tests cover partial-failure reporting and RBAC only —
   `apps/backend/__tests__/unit/generate-plot-cycle-qrs-partial.test.js:42,60,68,76`;
   `apps/backend/__tests__/unit/plot-qr-partial-route-consumption.test.js:103,120,135`.
4. `apps/backend/__tests__/integration/generic-trace-cert-gate.test.js` (uses the real
   `evaluateCertGate` via `requireActual`, `:39`) — `:93` revoked cycle → 410; `:106` revoked batch →
   410; `:116` expired lot → 410; `:127` lowercase-active → 200 + `isValid:true` (casing fix);
   `:139`, `:152` un-certified still 200; `:159` 410 body deep-equals the batch route's.
   `apps/backend/__tests__/integration/batch-lot-route-cert-gate.test.js:105,118,134,145`.
   Statuses covered: **revoked and expired only** — `suspended` and `renewed` are never exercised
   (`evaluateCertGate` treats them the same by `!== 'ACTIVE'`, but nothing pins that).
   `/plot-cycle` tests (`trace-plot-cycle-plant-count-ssot.test.js:91`,
   `trace-resolves-plot-code.test.js`) cover plant-count SSOT and plot-code resolution, not cert status.
   Frontend: `apps/web-app/src/app/trace/__tests__/trace-fetch.test.ts:41`.
5. `apps/backend/__tests__/integration/cert-revoke-org-guard.test.js:54,68,86,103,149,164,253`;
   `apps/backend/__tests__/unit/admin-certificates-revoke-route.test.js:145+`;
   `apps/backend/__tests__/unit/admin-certificates-revoke-already-revoked.test.js:139+`;
   `apps/backend/__tests__/unit/admin-routes-rbac.test.js:770-774,807,836`.
   Grepping all three revoke test files for `plantingCycle`, `traceQrSecurity`, `harvestBatch`, `lot`
   returns **zero matches**. Everything asserted is confined to the certificate row.
6. `apps/backend/__tests__/unit/certificate-service.test.js:311` (section header),
   `:312` suspend describe (`:317,323,329,346`), `:355` reinstate describe (`:360,375`). Again purely
   the certificate row — no downstream assertion.
7. `apps/web-app/e2e-g4/c01-revoke-untrusted-key-certificate.spec.ts:30` —
   `test('C01 admin revokes the untrusted-key certificate through the real door')`, asserting the
   revoked panel `ใบรับรองนี้ถูกเพิกถอน` (`:68`). **This is the spec that revoked CAE820.** It never
   visits a trace page afterwards.
   `apps/web-app/e2e-g4/c06-verify-status-reason.spec.ts:26` — `/verify`, not `/trace`.
   `apps/web-app/e2e-g4/b01-first-planting-cycle.spec.ts:32` — visits `/trace/lot/...` (`:295`) but
   only under a **valid** cert.
   No spec in `e2e/`, `e2e-g4/`, `e2e-phase0/`, `e2e-walkthrough/` revokes a certificate and then
   loads a trace page for that farm.

---

## 8. ISO/IEC 17065 §7.11 in the repo

§7.11 is cited **only** for the certificate row's own lifecycle — never for the downstream consequence
the clause is actually about ("the client must stop using the certification and the marks").

Where §7.11 is named:
- `apps/backend/prisma/schema/certification.prisma:79-83` — suspension columns; "temporary,
  reversible withdrawal … distinct from permanent revocation".
- `apps/backend/services/certificate-service.js:1714` — the revocation record is the §7.11 record of decision.
- `apps/backend/services/certificate-service.js:2025` — audit must never block the transition.
- `apps/backend/services/certificate-service.js:2054` — `suspendCertificate`.
- `apps/backend/services/certificate-service.js:2076` — reason ≥ 3 chars required.
- `apps/backend/services/certificate-service.js:2111` — `reinstateCertificate`.
- `apps/backend/shared/error-codes.js:1425` — remediation text for `CERTIFICATE_ALREADY_REVOKED`.
- `apps/backend/shared/error-codes.js:2070` — "certificate lifecycle (ISO 17065 §7.11 suspension)".
- `apps/backend/routes/api/auth/public.js:194` — public verify can distinguish expired / suspended.
- `apps/backend/__tests__/unit/admin-certificates-revoke-already-revoked.test.js:9`
- `apps/backend/__tests__/integration/cert-revoke-org-guard.test.js:164`
- `apps/backend/__tests__/unit/certificate-service.test.js:311,323`

Unrelated clause, listed to avoid confusion — **§7.6** (two-person certification decision) is cited far
more widely and was **deliberately removed** on 2026-06-05: `GAP-MAP.md:46`, `GAP-MAP.md:116` (marked
`REVERSIBLE-17065`), `apps/backend/services/workflow-transition-service.js:153,352`,
`.claude/skills/gacp-workflow-rules/SKILL.md:100`.

Full §7.6 citation list (the removed two-person gate), for completeness:
`apps/backend/services/workflow-transition-service.js:153,352`,
`apps/backend/services/application-status-writer.js:959`,
`apps/backend/services/application-service/application-provider-query-methods.js:656`,
`apps/backend/routes/api/provider/handlers/workflow-transitions-handler.js:129`,
`apps/backend/routes/api/admin/applications.js:325`,
`apps/backend/prisma/seed-gacp.js:200,936`,
`apps/backend/scripts/e2e/gacp-lifecycle-simulation.mjs:74,243,315`,
`apps/backend/shared/error-codes.js:2088,2101`,
`apps/backend/__tests__/unit/application-status-writer-cert-hook.test.js:5`,
`apps/backend/__tests__/unit/canonical-contract-verification.test.js:240`,
`GAP-MAP.md:46,116`, `.claude/skills/gacp-workflow-rules/SKILL.md:100`,
`docs/contract/manual/03-workflow.md:142`,
`docs/contract/evidence/full-system-audit-2026-07-11.md:38`,
`reports/g4-journey/prep-P1.md:31`, `reports/g4-journey/prep-P2.md:129`.

General / branding (no clause number): `PRODUCT.md:23,43,77`, `DESIGN.md:105`,
`.impeccable/design.json:125`,
`apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx:353` and
`.../revision/[n]/page.tsx:249` (footer: "ภายใต้มาตรฐาน ISO/IEC 17065"),
`docs/architecture/2026-04-28-design-system-review.md:123` (proposed footer "ISO/IEC 17065 / GACP
scheme reference"), `docs/superpowers/specs/2026-08-20-tile-home-navigation-design.md:24` (KPI scope),
`reports/design-cleanup-2026-08-21/05-BACKLOG.md:116` (backlog item D6, cross-role leaderboard
visibility — cites "ISO 17065" with no clause).

**Negative finding (exhaustive):** a repo-wide sweep over `.js .ts .tsx .md .prisma .sql .json`
(49 hit lines total, evidence/ and reports/ transcripts included) finds **no §7.11 citation anywhere
in connection with planting cycles, harvest, lots, QR codes or the trace surface**. Every §7.11 hit is
one of the 12 certificate-row sites listed above; every other 17065 hit is §7.6 or branding. The 410 gate in `evaluateCertGate` — the one mechanism that
actually implements "stop using the marks" — cites `PR-1.9` and `H3`
(`trace-batch-lot-routes.js:67`, `common.js:231`), not the standard.

---

## 9. GAP SUMMARY

| # | Gap | Evidence |
|---|---|---|
| G1 | Plot QR page paints an unconditional "แหล่งปลูกได้รับการรับรอง GACP" shield, and the backend never checks the cert | `apps/web-app/src/app/trace/plot-cycle/[qr-code]/client-view.tsx:295-298`; `resolve-plot-cycle.js:566-644,640`, cert absent from `ASSIGNMENT_INCLUDE` `:56-71` |
| G2 | Plot-sign QR refresh/print is not cert-gated — a revoked farmer can print GACP marks | `planting-cycle-detail-header-block.tsx:141-143`; `plot-qr-permission.ts:34-38`; `plot-signs/*` zero cert hits |
| G3 | Farmer's own cycles vanish from the list on revocation — spec `:52` says recording must continue | `planting-service.js:137-183` vs spec `:52` |
| G4 | Hidden-but-blocking cycle: R15 409 names a cycle the farmer cannot see or close | `planting-service.js:71-121` × `:137-183` × `harvest-capacity-operations.js:53-60` |
| G5 | Consumer sees "ไม่พบข้อมูลผลิตภัณฑ์" (does not exist) for a revoked cert, not "เพิกถอน" | `trace-fetch.ts:62-63`; `trace/[qr-code]/client-view.tsx:86-98` |
| G6 | `revokeCertificate` notifies nobody | `certificate-service.js:1672-1761`; only `notif` hit is `:1516` (renewal reminders) |
| G7 | `TraceQrSecurity.status` stays `ACTIVE`; no writer exists for cert-driven QR revocation | live DB §6; grep §3.5 |
| G8 | `Plot.qrRevokedAt` (R20) has readers but **no writer anywhere** | grep §3.5 |
| G9 | Spec `:144` "certificate active **as at the cut date**" unimplemented — all checks use `new Date()` | `harvest-capacity-operations.js:56-60`; `common.js:244` |
| G10 | 410 body says "ไม่อยู่ในสถานะใช้งาน" for revoked, suspended and renewed alike | `common.js:268-270` |
| G11 | `reason: 'certificate_revoked'` is on the wire but no frontend reads it | `common.js:260`; zero hits in `apps/web-app` |
| G12 | `buildCertificateSnapshot` is dead code and carries the uppercase-casing bug | `common.js:207-220,306` |
| G13 | `hasActiveCertificate` and `requireActiveCert` are dead guards; the docblock names a function that does not exist | `planting-cycle-service.js:212,274-281,305,323-331,637` |
| G14 | Cycles keep pointing at the revoked cert even though the farm now holds a valid one | live DB §6 |
| G15 | 410 (withdraw the page) contradicts spec `:76` (show the real status + verify link) | `common.js:253-272` vs spec `:76` |
| G16 | No test anywhere asserts a revocation side effect on cycles / QR / lots / trace; no e2e joins revoke → trace | §7 items 5, 7 |

---

## UNVERIFIED

- **Live HTTP behaviour was not observed.** Every claim about what a given URL returns today is
  inference from static code reading. The backend was not running (ports 3001/5000/8080/4000 refused;
  3000 answered 307, i.e. the Next dev server), and I did not start it because the trace resolvers
  write `scanCount` and audit rows.
- Whether `/api/certificates/my` returns revoked certificates in its array at all. If it omits them,
  the §5.1 gate reaches the same lock via an empty list rather than via `getCertBadgeKind` — same UX,
  different path.
- The test-absence claims in §7 rest on literal-string and symbol greps across the full `__tests__`
  tree, not on reading all ~600 backend test files. A test asserting these behaviours via a
  differently-worded error code rather than the message string would not have surfaced (though no
  `CERT_EXPIRED`/`CERT_REQUIRED` constant is in use outside `trace-batch-lot-routes.js:80,212`).
- `trace-verification-routes.js` and `routes/api/trace/lots.js` were not audited for additional gates.
- Whether the web UI surfaces the 409 `PLOT_ALREADY_HAS_OPEN_CYCLE` message text to the farmer or
  swallows it.
