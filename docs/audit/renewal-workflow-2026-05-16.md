> ## ⚠️ เอกสารนี้บันทึกโมเดลที่เลิกใช้แล้ว (ปักป้าย 2026-09-05)
>
> ตัวเลขค่าธรรมเนียมและจุดยืนทางภาษีในเอกสารนี้เป็นของสูตรก่อน W14 (VAT คิดเฉพาะส่วนแพลตฟอร์ม)
> ปัจจุบัน: **ผู้ออกเอกสารรายเดียว · VAT 7% บนค่าบริการทั้งก้อน · งวด 1 = 5,885 · งวด 2 = 29,425**
> เก็บไว้อ่านเป็นบันทึกประวัติ · ความจริงปัจจุบัน: `apps/backend/services/fee-service.js`

# Renewal Workflow

> ## SUPERSEDED IN PART — 2026-08-22
>
> **§1 below (the Iter 26 diagram) no longer describes how a renewal works.**
> It is kept verbatim as the record of what the system did between 2026-05-16 and
> 2026-08-22. Read §0 first; where the two disagree, §0 is the current behaviour.
>
> Superseded by operator rulings recorded in `HARNESS_LOG.md`:
> `67ef3612` ("ต่ออายุ 30,000 ครั้งเดียว และไม่ตรวจเอกสาร นัดลงพื้นที่อย่างเดียว")
> and `851fd516` (30,000 is the pre-VAT, pre-platform base).
> Implemented on branch `fix/renewal-fee-30k`, commit `41f9986c`.
> Working notes: `reports/design-cleanup-2026-08-21/W12-renewal-fast-path.md`.
>
> §2 (reminder schedule), §3 onward and the supersession rules are NOT affected.

## 0. Current renewal workflow (2026-08-22 onward)

A renewal is **one charge with a base of 30,000 THB, no document review, straight to
the site visit**. It is no longer the same journey as a new application.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Original Certificate (status=active, expiryDate > now)                 │
│                                                                          │
│   HEALTH applicant POST /api/applications/renewals                      │
│   body = { originalCertificateId }                                      │
│                          ▼                                                │
│   renewal-service.createRenewalApplication                              │
│     - validate ownership          (cert.userId === actorId)             │
│     - validate cert is ACTIVE     (else CERT_NOT_ACTIVE 409)            │
│     - validate cert NOT expired   (else CERT_ALREADY_EXPIRED 409)       │
│     - carry-forward farm + cultivation data from source application     │
│     - create new Application:                                           │
│         status   = PENDING_AUDIT_FEE          <-- was DRAFT             │
│         formData = { ...carried, renewalOf, renewalOfCertificateNumber, │
│                      renewalSourceApplicationId,                        │
│                      workflowState = PENDING_AUDIT_FEE,                 │
│                      workflowEntryState,                                │
│                      documentReviewSkipped = true,                      │
│                      documentReviewSkipReason,                          │
│                      workflowStatesSkipped = [...] }                    │
│     - emit APPLICATION audit row, action RENEWAL_FAST_PATH_ENTRY        │
│                          ▼                                                │
│  Application (PENDING_AUDIT_FEE, formData.renewalOf = origCertId)       │
│                          │                                                │
│                          │  ONE payment. Base 30,000 + platform 10%     │
│                          │  + VAT 7% of the platform fee = 33,210.      │
│                          │  Settled by the SAME untouched paths a new   │
│                          │  application uses (verified webhook, or an   │
│                          │  accountant approving a slip).               │
│                          ▼                                                │
│    AUDIT_FEE_PAID  ── scheduler assigns auditor + date ──▶ AUDIT_CONFIRMED│
│                          │                                                │
│                          ▼                                                │
│    (AUDIT_PASSED | CAR_PENDING → CAR_REVIEWING ↔ AUDIT_CONFIRMED)       │
│                          ▼                                                │
│                    APPROVED → CERTIFIED                                  │
│                          ▼                                                │
│  New Certificate issued by certificate-service.generateCertificate      │
│     - newCertificate.previousCertificateId = originalCertificateId      │
│     - originalCertificate.status            = 'renewed'                 │
│     - originalCertificate.renewedCertificateId = newCertificate.id      │
└────────────────────────────────────────────────────────────────────────┘
```

### 0.1 What a renewal skips, and what still runs

**Skipped by policy** — the document fee and the document review:
`SUBMITTED` · `PENDING_DOC_FEE` · `PHASE_1_SLIP_UNDER_REVIEW` · `DOC_FEE_PAID` ·
`ASSIGNED_FOR_REVIEW` · `DOC_APPROVED`.
The skip is recorded twice — on `formData` and as an audit row — so it is a readable
policy decision rather than an application that mysteriously starts mid-workflow.

**Still enforced, unchanged:**

| Gate | Where |
|---|---|
| Only the certificate owner may renew | `services/renewal-service.js` (`FORBIDDEN_NOT_OWNER`) |
| Certificate must be ACTIVE | `services/renewal-service.js` (`CERT_NOT_ACTIVE`) |
| Certificate must not have expired — an expired one needs a NEW application | `services/renewal-service.js` (`CERT_ALREADY_EXPIRED`) |
| The payment gate before scheduling | `services/checkout/checkout-settlement-service.js`, `services/payment-slip-service.js` |
| Site visit must be scheduled | `services/audit-scheduling-service.js` (`SCHEDULING_QUEUE_STATUS`) |
| Real onsite evidence before a certificate can be minted | `services/onsite-evidence-gate.js`, called inside `generateCertificate` |

### 0.2 Why the entry state is PENDING_AUDIT_FEE and not AUDIT_FEE_PAID

The scheduling queue selects `AUDIT_FEE_PAID` (`audit-scheduling-service.js`
`SCHEDULING_QUEUE_STATUS`; `assignAuditor` refuses any other state), so that is the
state the ruling points at. But an application only reaches it through a **settled
payment**. Creating a renewal directly in `AUDIT_FEE_PAID` would walk it through the
money gate for free. A renewal is therefore created one state earlier, at the gate
itself, and the existing settlement paths carry it forward. No new workflow edge was
added and no settlement code was changed.

### 0.3 A note on the state graph

Blocking `AUDIT_CONFIRMED` does **not** make `CERTIFIED` unreachable: the
waiver-reopen edge `EXPIRED → CAR_PENDING` reaches `CAR_REVIEWING → AUDIT_PASSED`
around it. The real choke point is `AUDIT_PASSED`. The guarantee that an onsite audit
actually happened comes from `onsite-evidence-gate.js`, not from the graph.

---

## 1. Workflow diagram — SUPERSEDED 2026-08-22, kept as the historical record

> Everything from here to the end of §1 describes the pre-2026-08-22 behaviour, when a
> renewal did travel the same canonical workflow as a new application. It is retained
> deliberately; do not implement from it.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Original Certificate (status=active, expiryDate ≈ T+30d)               │
│                                                                          │
│   HEALTH applicant POST /api/applications/renewals                      │
│   body = { originalCertificateId }                                      │
│                          ▼                                                │
│   renewal-service.createRenewalApplication                              │
│     - validate ownership (cert.userId === actorId)                      │
│     - validate cert is ACTIVE (status === 'active')                     │
│     - validate cert has NOT expired (expiryDate > now)                  │
│     - carry-forward farm + cultivation data from source application    │
│     - create new Application:                                           │
│         status   = DRAFT                                                │
│         formData = { ...carried, renewalOf, renewalOfCertificateNumber, │
│                      renewalSourceApplicationId, workflowState=DRAFT }  │
│                          ▼                                                │
│  Application (DRAFT, formData.renewalOf = origCertId)                   │
│                          │                                                │
│                          ▼                                                │
│  SAME canonical workflow as a new application:                          │
│    DRAFT → SUBMITTED → PENDING_DOC_FEE → PHASE_1_SLIP_UNDER_REVIEW      │
│         → DOC_FEE_PAID → ASSIGNED_FOR_REVIEW                            │
│         → (DOC_APPROVED | REVISION_REQUESTED ↔ ASSIGNED_FOR_REVIEW)     │
│         → PENDING_AUDIT_FEE → PHASE_2_SLIP_UNDER_REVIEW                 │
│         → AUDIT_FEE_PAID → AUDIT_CONFIRMED                              │
│         → (AUDIT_PASSED | CAR_PENDING → CAR_REVIEWING ↔ AUDIT_CONFIRMED)│
│         → APPROVED → CERTIFIED                                           │
│                          │                                                │
│                          ▼                                                │
│  New Certificate issued by certificate-service.generateCertificate      │
│     - newCertificate.previousCertificateId = originalCertificateId      │
│     - originalCertificate.status            = 'renewed'                 │
│     - originalCertificate.renewedCertificateId = newCertificate.id      │
│                                                                          │
│  (supersession performed by renewal-service.supersedeCertificate,        │
│   called from the issuance hook when formData.renewalOf is set)         │
└────────────────────────────────────────────────────────────────────────┘
```

State-machine identity is preserved end-to-end: no new workflow states
were added in Iter 26. The single difference is the `formData.renewalOf`
marker, which the frontend uses to render a "ต่ออายุใบรับรอง" indicator
without requiring backend awareness of renewal at any other step.

## 2. Reminder schedule

The renewal-reminder cron (`apps/backend/cron/renewal-reminder-cron.js`)
walks three cadence tiers daily. Each tier is a window of Bangkok days
left, from the next shorter tier (exclusive) up to the tier's own day
(`renewal-service.REMINDER_WINDOW_FLOOR_BY_DAYS`), so a tier whose day
was missed (cron down, failed run, nobody reran it) still goes out on the
next run, once, and never after the shorter tier has taken over. The
message prints the real number of days left, not the tier's number.
A certificate expiring today, an expired one and a revoked one are never
selected.

| Tier | Days left      | reminderType | Priority           |
|------|----------------|--------------|--------------------|
| D60  | 31 to 60       | `D60`        | NORMAL             |
| D30  | 16 to 30       | `D30`        | NORMAL             |
| D15  | 1 to 15        | `D15`        | HIGH (≤ 15 days)   |

Suggested invocation: `0 2 * * *` UTC (= 09:00 ICT) once per day. The
cron supports three orchestration modes:

1. **System cron / supervisord**
   `0 2 * * * node apps/backend/cron/renewal-reminder-cron.js`

2. **Kubernetes CronJob**
   ```yaml
   apiVersion: batch/v1
   kind: CronJob
   spec:
     schedule: "0 2 * * *"
     jobTemplate:
       spec:
         template:
           spec:
             containers:
               - name: renewal-reminder
                 image: gacp-backend:latest
                 command: ["node", "apps/backend/cron/renewal-reminder-cron.js"]
   ```

3. **In-process node-cron (apps/backend/jobs/scheduler.js)**
   Add an entry that calls `require('../cron/renewal-reminder-cron').run()`.

The script exits non-zero on fatal errors so supervisord / Kubernetes can
record failures. Each cron run is logged via `shared/logger`.

### Idempotency

A cron tier is idempotent in two layers:

- **Per-certificate marker** — `renewalReminders[]` on the OWNING
  application's `formData`. The cron asks `hasRenewalReminderBeenSent`
  before building the payload and skips a marked certificate; it calls
  `markRenewalReminderSent` only after `fanoutToApplicationParties`
  reports no failure and at least one bell row written (`delivered > 0`).
  That function never throws: a failed recipient lookup comes back as
  `lookupFailed`, a party whose row could not be written counts in
  `failed`, and the cron treats both as a failed certificate that stays
  unmarked. A certificate nobody received (no reachable party because
  the applicant left the company and no member holds SUBMIT_APPLICATION,
  or every party opted out) also stays unmarked, is counted as
  `unreachable` and logged, so a member who joins later still gets the
  reminder.
  (2026-10-21: the mark used to come first, so a refusal to build the
  link on production without `APP_PUBLIC_URL`, or a failed dispatch,
  left the certificate marked and the reminder lost; the tier query was
  exact-day, so the next day never retried it. Later the same day: the
  cron awaited the fanout but ignored its result, so a swallowed lookup
  or write failure was still marked; and the exact-day query became the
  catch-up window of §2.)
- **Fanout 60-minute dedupe** — notification-fanout-service.js maintains
  a SHA-256 hash of `(userId|type|applicationId|invoiceId|certNumber|period)`
  and collapses duplicates within a 60-minute window.

Replays converge on "sent": a certificate whose dispatch failed stays
unmarked and the next run (the next day's, or a manual rerun) sends it
while the tier's window lasts; two runs racing on the same certificate
before either wrote its marker collapse in the fanout dedupe. The one
window left is a dispatch that succeeded and a marker write that then
failed: a rerun after the 60-minute dedupe window sends that
certificate's tier a second time. A party whose bell row failed while
another party's succeeded leaves the certificate unmarked too, so the
next run reaches the missed party and the reached one gets the row again
after the 60-minute window; accepted over losing one party's reminder.

## 3. Certificate supersession

Supersession is the act of marking the OLD certificate as "renewed" when
the NEW certificate issues. The `Certificate` schema already exposes the
columns we need; no migration was performed for Iter 26.

- `Certificate.status` transitions: `active` → `renewed`
- `Certificate.renewedCertificateId` is set to the new certificate's id
- `Certificate.previousCertificateId` on the NEW certificate is set to
  the old id (forward + backward chain)

The single supersession path is `renewal-service.supersedeCertificate`.
It is **idempotent**: a second call with the same arguments is a no-op
(the service checks the current values before issuing the write).

Call site contract: the certificate issuance flow must call
`supersedeCertificate` when:

1. `application.formData.renewalOf` is non-null, AND
2. a new Certificate row has just been created for this application.

Public verification (the `/api/public/verify/:certNumber` endpoint, which
does NOT filter by `isDeleted`) will visibly report a renewed certificate
as `status=renewed` with a forward pointer — preventing counterfeit
attempts that reuse an obsolete certificate number.

## 4. Carry-forward fields

The `_buildCarryForwardFormData` helper copies a narrow allow-list. Every
other field (audit history, payment status, documents, score, comments,
etc.) is intentionally NOT carried — those must be re-submitted for the
new cycle so each annual certification stands on its own evidence.

| Key                    | Reason                                  |
|------------------------|-----------------------------------------|
| `farmData`             | Farm name + address rarely change       |
| `farmName`             | Display field                           |
| `farmId`               | Stable Farm reference                   |
| `plantName`            | Crop type identity                      |
| `plantSpecies`         | Crop type identity (schema variant)     |
| `locationData`         | Address / province / district / coords  |
| `locationType`         | OUTDOOR / GREENHOUSE / INDOOR class      |
| `areaType`             | Same area-type classification           |
| `productionData`       | Crop production methodology             |
| `plots`                | Field plot layout                       |
| `totalArea`            | Cultivation area baseline               |
| `cultivation_methods`  | Cultivation method list                 |
| `cultivationMethods`   | Cultivation method list (alt spelling)  |
| `cultivationMethod`    | Singular cultivation method              |

### Fields explicitly NOT carried

- `auditResult`, `auditedAt` — fresh audit required each cycle
- `paymentStatus`, `phase1Status`, `phase2Status` — fresh payments
- `documents[]` — fresh evidence required each cycle
- `comments`, `workflowHistory` — applicant starts a clean record

## 5. Notification templates

The cron dispatches `CERTIFICATE_EXPIRING_SOON`. Since 2026-10-21 the type
has a first-class entry in the `notification-fanout-service.js` template
registry, so the bell row names the certificate and the day it expires
(Bangkok date, Buddhist era) instead of the generic "การแจ้งเตือนใหม่" the
fanout writes for a type without a template. The payload carries only
data; the template renders it. `actionUrl` becomes the row's button.

### Payload shape

```json
{
  "certificateId": "cert-1",
  "certNumber": "TH-GACP 87/2568",
  "farmName": "ไร่ตัวอย่าง",
  "daysLeft": 30,
  "expiryDate": "2027-01-15T00:00:00.000Z",
  "renewalUrl": "https://demo.gacpth.com/health/applications/renewal?certId=cert-1",
  "actionUrl": "https://demo.gacpth.com/health/applications/renewal?certId=cert-1",
  "priority": "NORMAL"
}
```

The rendered row: title "ใบรับรองเลขที่ TH-GACP 87/2568 จะหมดอายุในอีก 30 วัน",
message "ใบรับรอง GACP เลขที่ TH-GACP 87/2568 (ไร่ตัวอย่าง) จะหมดอายุวันที่
15 มกราคม พุทธศักราช 2570 กรุณายื่นต่ออายุก่อนวันหมดอายุ".

`renewalUrl` is `<app base>/health/applications/renewal?certId=<certificate id>`,
the same renewal entry the certificates list links to. The app base comes from
`config/public-urls` (APP_PUBLIC_URL and its aliases), read at send time like the
verify and QR links; production refuses to guess a host. (2026-10-21: replaced the
old `RENEWAL_URL_BASE` env var and its `/dashboard/certificates/:id/renew` default,
a route the web app never had.)

## 6. HTTP surface

| Method | Path                                                | Auth     | Notes                                |
|--------|-----------------------------------------------------|----------|--------------------------------------|
| POST   | `/api/applications/renewals`                        | HEALTH   | Create a renewal DRAFT (must own cert)|
| GET    | `/api/applications/renewals/upcoming-expiry`        | PROVIDER | Dashboard of expiring certificates   |

Mount: `apps/backend/routes/api/index.js`, inside the `appConsolidated`
router, BEFORE the `/:applicationId/...` catch-all sub-router so the
literal `/renewals` segment never gets parsed as an applicationId.

## 7. File boundaries (Iter 26)

Iter 26 touches the following files only:

- **Added** — `apps/backend/services/renewal-service.js`
- **Added** — `apps/backend/cron/renewal-reminder-cron.js`
- **Added** — `apps/backend/routes/api/applications/renewals.js`
- **Added** — `apps/backend/__tests__/services/renewal-service.test.js`
- **Added** — `docs/audit/renewal-workflow-2026-05-16.md` (this file)
- **Edited** — `apps/backend/routes/api/index.js` (single-line mount addition)

No edits to: `certificate-service.js`, `notification-fanout-service.js`,
`audit-scheduling-service.js`, `audit-onsite-service.js`,
`period-close-service.js`, `refund-service.js`, `journal-entry-service.js`,
`payment-slip-service.js`, `shared/canonical-rbac.js`, or the Prisma
schema. The `Certificate.metadata`-style reminder state lives on
`Application.formData.renewalReminders[]` so no migration is needed —
the `Application.formData Json?` column was already in production.

## 8. Test coverage

`apps/backend/__tests__/services/renewal-service.test.js` — 23 tests.

| Group                                    | Count |
|------------------------------------------|-------|
| `_buildCarryForwardFormData`             | 2     |
| `createRenewalApplication`               | 7     |
| `getApplicationsForRenewalReminder`      | 3     |
| `markRenewalReminderSent`                | 5     |
| `supersedeCertificate`                   | 3     |
| `listUpcomingExpiry`                     | 1     |
| Public constants                         | 2     |

All 23 tests pass.
