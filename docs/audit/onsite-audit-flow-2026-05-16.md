# Onsite Audit Flow — Iter 25 (B25-B)

**Date**: 2026-05-16
**Scope**: Auditor's on-the-farm execution path for a confirmed audit
**Owners**: backend (audit cluster)
**Status**: Implemented (service + route + tests landing in this batch)

## 1. Why this exists

After the scheduler confirms an audit (parent `Application.status` =
`AUDIT_CONFIRMED`), the auditor needs to physically visit the farm and
record three pieces of regulated evidence:

1. **A GACP checklist** — every item in the canonical template gets a
   PASS / FAIL / NA response with optional notes.
2. **Geo-tagged photos** — at least 5 photos covering the canonical
   sections, each with GPS coordinates, capture timestamp, and a
   SHA-256 hash for tamper detection.
3. **A signed decision** — PASS, FAIL, or NEEDS_REVIEW, which drives the
   parent `Application` state transition.

Prior to B25-B these steps were spread across three legacy code paths
(`field-audit-service.js` stubs, the unmounted `farm-audit.js` route,
inline writes inside `audits.js`). The new module consolidates the
critical-path writes behind one service so:

- Workflow transitions go through `writeApplicationStatus` (no direct
  `prisma.application.update`).
- Photo bytes always carry a SHA-256 hash, matching the slip-flow
  contract in `slip-hash-integrity.js`.
- Decision + parent transition + notification happen inside one
  Prisma `$transaction` so partial commits cannot leave the farm in a
  half-audited state (Thai e-Transactions Act B.E. 2544/2001 §12).

## 2. Auditor flow

```
              ┌──────────────────────────────────┐
              │ Application.status =             │
              │ AUDIT_CONFIRMED (scheduler set)  │
              └─────────────────┬────────────────┘
                                │
                                ▼
             POST /api/audit/onsite/:auditId/start
             ├─ validate audit exists + auditor matches
             ├─ validate audit.status === 'IN_PROGRESS'
             ├─ write GpsVerificationLog (start row)
             └─ return checklist template (24 items)
                                │
                                ▼
        ┌───────────────────────┴───────────────────────┐
        │                                               │
        ▼                                               ▼
POST /api/audit/onsite/:auditId/photo       POST /api/audit/onsite/:auditId/checklist
├─ multipart upload                         ├─ batch persist via submitChecklistItem
├─ compute SHA-256 hash                     ├─ template lookup (refuse unknown)
├─ store via attachment-service              ├─ atomic upsert + photo linking
├─ write FarmAuditPhoto row                 └─ return persisted rows
│   (hash + GPS + capturedAt)
└─ return { photoId, fileHash, attachmentId }
                                │
                                ▼
         GET /api/audit/onsite/:auditId/gps-verify?lat=&lng=
         ├─ haversine vs registered farm coordinates
         └─ return { withinTolerance, distanceMeters }
                                │
                                ▼
         POST /api/audit/onsite/:auditId/decision
         ├─ enforce minimum 5 photos (GACP-PRD §6.5)
         ├─ enforce all 24 checklist items persisted (§6.4)
         ├─ atomic $transaction:
         │    ├─ update AuditChecklist (decision + summary + actor)
         │    └─ writeApplicationStatus(...) per decision matrix
         └─ fanout notification to applicant
```

## 3. Decision matrix

| Decision        | Audit row status | Parent `Application` transition         | Notify type              |
| --------------- | ---------------- | --------------------------------------- | ------------------------ |
| `PASS`          | `COMPLETED`      | `AUDIT_CONFIRMED` → `AUDIT_PASSED`      | `AUDIT_RESULT_PASSED`    |
| `FAIL`          | `COMPLETED`      | `AUDIT_CONFIRMED` → `CAR_PENDING`       | `AUDIT_RESULT_CAR`       |
| `NEEDS_REVIEW`  | `IN_PROGRESS`    | _none_ — stays in `AUDIT_CONFIRMED`     | `AUDIT_RESULT_NEEDS_REVIEW` |

- `PASS` triggers downstream certificate generation through the
  `AUDIT_PASSED → APPROVED → CERTIFIED` chain owned by
  `routes/api/audit/audits.js`.
- `FAIL` puts the application in the CAR (Corrective Action Required)
  loop. The auditor can re-issue a PASS via the existing
  `CAR_REVIEWING → AUDIT_PASSED` transition once corrective evidence
  arrives. The audit row's `formData.correctiveActionRequired` flag is
  set for the UI.
- `NEEDS_REVIEW` is a head-auditor review request. The audit row stays
  in `IN_PROGRESS` and `formData.needsHeadAuditorReview` is set. No
  parent transition fires — head-auditor manual review drives the next
  state change.

## 4. GPS verification

`verifyGpsAgainstFarm({ auditId, gpsLat, gpsLng, toleranceMeters? })`
loads the farm coordinates from `Application.formData.locationData`
(or `Farm.findUnique` when farmId is present) and computes the
haversine distance to the auditor's reported coordinates.

- Default tolerance: **500 m** (configurable via the
  `DEFAULT_GPS_TOLERANCE_M` constant or the per-call `toleranceMeters`
  argument).
- Returns `{ withinTolerance, distanceMeters, farmLatitude,
  farmLongitude, toleranceMeters, unknownFarmLocation }`.
- `unknownFarmLocation: true` when the farm has no recorded coords;
  callers should treat this as a soft-warning rather than a hard fail
  because legacy farms may have been registered without GPS.

The route layer surfaces a fraud-warning to the auditor's UI when
`withinTolerance` is false. The service does NOT auto-throw — GPS can
legitimately drift (inclement weather, indoor capture), and the
operator's judgment must remain authoritative. The result is recorded
on the GpsVerificationLog table so retrospective audits can spot
patterns.

## 5. Photo integrity (SHA-256 + GPS metadata)

`computePhotoHash(buffer)` returns the SHA-256 hex digest over the
uploaded bytes (same algorithm as `slip-hash-integrity.js` for slip
evidence). The hash is stored in two places:

1. `Attachment.fileHash` — the canonical file pointer.
2. `FarmAuditPhoto.fileHash` — denormalised onto the photo row.

Each photo row additionally carries:

- `gpsLatitude` / `gpsLongitude` — the auditor's coordinates at capture.
- `capturedAt` — the device timestamp.
- `uploadedBy` / `organizationId` — the actor + tenant scope.
- `attachmentId` — the FK back to the polymorphic Attachment row.

The hash invariant has two test guarantees:

- Same bytes → same hash (idempotent).
- Modified bytes → different hash (tamper signal).

This satisfies the integrity-preservation obligation under Thai
e-Transactions Act §12 and ISO 27799:2016 §7.10 (cryptographic
integrity controls bound to the audit trail). The hash also lets us
re-verify photos in periodic reconciliation runs the same way the
slip-flow does in `slip-hash-integrity.verifyFileHash()`.

## 6. Notification templates

The service hands the fanout layer a typed payload — the actual Thai /
English bodies live in `notification-fanout-service.js`'s template
registry (extended as needed). Payload shape per decision:

```json
{
  "userId": "<applicant.healthId>",
  "type":   "AUDIT_RESULT_PASSED" | "AUDIT_RESULT_CAR" | "AUDIT_RESULT_NEEDS_REVIEW",
  "payload": {
    "applicationId":       "<uuid>",
    "applicationNumber":   "GACP-YYYY-NNNN",
    "decision":            "PASS" | "FAIL" | "NEEDS_REVIEW",
    "summary":             "<auditor narrative>",
    "criticalFindings":    ["<itemCode>", ...]
  }
}
```

Each type fires IN_APP + EMAIL + SMS by default (subject to user
opt-out — `notificationSettings.channels[type].{email,sms,inApp}`).
The fanout layer's 60-minute dedupe key keyed by
`(userId, type, applicationId)` prevents duplicate dispatches when the
auditor accidentally re-submits.

## 7. Service exports

```
audit-onsite-service.js exports:
  // Constants
  DECISIONS                : { PASS, FAIL, NEEDS_REVIEW }
  ALL_DECISIONS            : readonly ['PASS', 'FAIL', 'NEEDS_REVIEW']
  DEFAULT_GPS_TOLERANCE_M  : 500
  DEFAULT_MIN_PHOTOS       : 5
  CHECKLIST_TEMPLATE_2026  : readonly [24 items]
  TEMPLATE_VERSION         : '2026-05'

  // GPS helpers
  haversineDistanceMeters(lat1, lon1, lat2, lon2) : number
  verifyGpsAgainstFarm({ auditId, gpsLat, gpsLng, toleranceMeters? })

  // Photo integrity
  computePhotoHash(buffer) : sha256 hex

  // Lifecycle
  startInspection({ auditId, auditorId, gpsLat, gpsLng, gpsAccuracy? })
  submitChecklistItem({ auditId, itemCode, response, notes?, photoIds?, actorId? })
  uploadPhoto({ auditId, fileBuffer, fileName, mimeType?, gpsLat, gpsLng,
                capturedAt, caption?, uploadedBy, organizationId })
  submitDecision({ auditId, decision, summary?, criticalFindings?,
                   actorId, actorRole?, minPhotos? })
```

## 8. Route summary

| Method | Path                                          | RBAC       | Body / query                                                            |
| ------ | --------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| POST   | `/api/audit/onsite/:auditId/start`            | AUDITORS   | `{ gpsLat, gpsLng, gpsAccuracy? }`                                      |
| POST   | `/api/audit/onsite/:auditId/checklist`        | AUDITORS   | `{ items: [{ itemCode, response, notes?, photoIds? }, ...] }`           |
| POST   | `/api/audit/onsite/:auditId/photo`            | AUDITORS   | multipart: `photo` file + `gpsLat, gpsLng, capturedAt?, caption?`       |
| GET    | `/api/audit/onsite/:auditId/gps-verify`       | AUDITORS   | query: `lat, lng, tolerance?`                                           |
| POST   | `/api/audit/onsite/:auditId/decision`         | AUDITORS   | `{ decision: 'PASS' \| 'FAIL' \| 'NEEDS_REVIEW', summary?, criticalFindings? }` |

All routes share the file-level `AUDIT_STAFF` gate (defence in depth)
on top of the per-route `AUDITORS` gate.

## 9. Failure modes + error codes

| HTTP | Code                       | Cause                                                |
| ---- | -------------------------- | ---------------------------------------------------- |
| 400  | `CHECKLIST_ITEM_UNKNOWN`   | Unknown `itemCode` (not in canonical template)        |
| 400  | `CHECKLIST_ITEMS_REQUIRED` | Empty `items[]` array on checklist submission        |
| 400  | `PHOTO_FILE_REQUIRED`      | Multipart upload missing the `photo` field           |
| 403  | `AUDIT_AUDITOR_MISMATCH`   | Caller is not the assigned auditor                   |
| 404  | `AUDIT_NOT_FOUND`          | `auditId` does not exist                             |
| 409  | `AUDIT_STATUS_INVALID`     | Audit row is not in an editable state                |
| 422  | `INSUFFICIENT_PHOTOS`      | Fewer than `minPhotos` photos uploaded (default 5)   |
| 422  | `INCOMPLETE_CHECKLIST`     | Not every template item has a response               |

## 10. Tests

`apps/backend/__tests__/services/audit-onsite-service.test.js` — 25
tests, all green:

- `haversineDistanceMeters` — identical-coord + 1-degree separation.
- `computePhotoHash` — same-bytes / modified-bytes / non-Buffer.
- `startInspection` — happy path, audit-not-found, auditor-mismatch,
  bad-status.
- `submitChecklistItem` — known item, unknown item, invalid response,
  photo linking.
- `uploadPhoto` — hash invariant + attachment + photo row write.
- `verifyGpsAgainstFarm` — within tolerance, beyond tolerance, unknown
  farm location, custom tolerance.
- `submitDecision` — PASS transition, FAIL CAR_PENDING, NEEDS_REVIEW
  flag, insufficient photos, incomplete checklist, invalid decision,
  fanout failure best-effort.

```
Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
```

## 11. Out of scope (B25-A / B25-C boundaries)

- **B25-A** (`audit-scheduling-service.js`): scheduling is upstream of
  this service — by the time we run, `Application.status` is already
  `AUDIT_CONFIRMED`.
- **B25-C** (frontend onsite UI): the route contract above is the
  handoff; the frontend team owns the on-device capture UX.
- Refund / period-close / journal-entry: not touched.
- `application-status-writer.js`: read-only — we call
  `writeApplicationStatus` and never bypass it.
- `notification-fanout-service.js`: read-only — we call `send()` and
  never bypass it.

## 12. Open follow-ups

- Once the canonical Prisma models for `FarmAuditChecklists`,
  `FarmAuditPhotos`, `GpsVerificationLogs`, and `GcpChecklistTemplate`
  land in the schema (currently referenced by name from
  `farm-audit-checklist-service.js` but not yet declared), the
  CHECKLIST_TEMPLATE_2026 constant in this service should defer to
  the DB row so versioning is centralised.
- Mount `routes/api/audit/onsite.js` from `routes/api/index.js` once
  the schema migration ships — kept un-mounted for the same reason
  the legacy `farm-audit.js` route is un-mounted (avoid a landmine
  endpoint that 500s on every call until the backing tables exist).
