# GACP Application Wizard — View-in-the-Loop Walkthrough (2026-08-22)

Farmer: UAT account `healthId=1100100100012` ("สมชาย เกษตรทอง"), real login, real local stack
(web :3000, backend :8000), real Postgres-backed draft — no mocks.

## HEADLINE FINDING — the wizard cannot be completed by any farmer right now

The document-upload endpoint the whole wizard depends on,
**`POST /api/applications/draft-documents`**, returns **HTTP 400 `VALIDATION_ERROR`
/ "Failed to upload draft document"** for every file tried — a hand-built PDF *and*
a plain PNG, both rejected identically. Reproduced two ways:

1. Live browser, real UI: step 2's 3 required M1 forms and step 4's ID-card upload
   both show the red "Failed to upload draft document" chip (`step-2-plant-selection-blocked.png`,
   `step-2-plant-selection-error.png`, `walk-meta.json` → `.blocked`).
2. Direct API repro (bypassing the UI entirely, same auth cookies): see
   `diag-upload.js` output — status 400 for both a `.pdf` and a `.png` fixture,
   with slotId/stepKey matching what the real UI sends.

Because `general-step.tsx` (applicant/ID-card, url `step/4`) and
`plant-selection-step.tsx` (M1 forms, url `step/2`) both **require** at least one
successful upload before their own `validate()` passes, and because
`application-step-page.tsx:106-142` has a deliberate **URL-skip guard**
(`firstIncompleteStep`) that force-redirects any direct visit to a later step
back to the earliest incomplete one — **there is currently no way, via clicking
"ถัดไป" or via typing a step URL directly, to reach steps 5 through 9
(farm/plots, cultivation, harvest/quality, documents, review) for a brand-new
application.** I proved this by navigating straight to `/step/5`: the app
silently bounced back and rendered the step-4 (applicant) screen instead
(`step-4-BLOCKED-redirected-to-step3.png`).

This is not a fixture problem on my end — the storage-service mimetype/extension
allow-list (`storage-service.js:193-200`) accepts both fixtures fine; the 400
originates deeper in `wizardController.uploadDraftDocument` (`wizard-controller.js:19-116`)
or something it calls. I did not chase the exact throw site further (no backend
console log available in this session, and I was not asked to touch the backend).

## What this means for "ขอดูรูปทุกหน้า"

Steps 1, 2, and 4 (ordinal 1–3 below) were reached and are captured in full
before/filled state. **Steps 5–9 (ordinal 4–8: farm, cultivation, harvest/quality,
documents, review) could not be shown — the app itself refuses to render them for
this account until the upload bug is fixed.** No screenshots exist for them; none
were fabricated.

## Screenshot inventory

| File | Step | What it shows |
|---|---|---|
| `step-1-consent.png` | 1 — ยินยอม (`/step/1`) | Fresh consent screen, both checkboxes unticked, ถัดไป enabled (no `isNextDisabled` gate on this step) |
| `step-1-consent-filled.png` | 1 | Both PDPA + standards checkboxes ticked (green) |
| `step-1-consent-mobile.png` | 1 | Same, 390×844 — pill stepper truncates to 4 visible tabs, clean single-column layout |
| `step-2-plant-selection.png` | 2 — ข้อมูลพืช (`/step/2`) | Plant/service/purpose/cultivation sections empty; fee summary shows ฿0 |
| `step-2-plant-selection-filled.png` | 2 | กัญชา + ขอรับรองใหม่ + เพื่อการพาณิชย์ในประเทศ + กลางแจ้ง all selected; fee updates to ฿30,000; 3 M1 upload slots appear, all still "0/3 อัปโหลดแล้ว" |
| `step-2-plant-selection-blocked.png` (= `-error.png`) | 2 | All 3 M1 slots show red **"Failed to upload draft document"** + "กรุณาอัปโหลดเอกสารบังคับให้ครบก่อนไปขั้นตอนถัดไป"; ถัดไป button stays disabled |
| `step-3-applicant.png` | 3 — ผู้ยื่นคำขอ (`/step/4`) | Applicant form auto-filled from the farmer's real profile (ชื่อ/นามสกุล/เลขบัตร/เบอร์โทร/อีเมล/ที่อยู่ all pre-populated); a red **"โหลดพื้นที่ทำงานไม่สำเร็จ"** (workspace load failed) banner is already showing at page load, with a "ลองใหม่" retry link, above a fully-functional form |
| `step-3-applicant-filled.png` | 3 | Same, plus the 3 document cards now show "ลบออก" (remove) as if a file is attached — see confusing-things #2 below |
| `step-3-applicant-blocked.png` | 3 | Same visual state as `-filled` (nothing changed between the two captures) |
| `step-4-BLOCKED-redirected-to-step3.png` | attempted 4 — farm/plots (`/step/5`) | Proof of the URL-skip guard: navigating straight to `/step/5` renders the **step-4 applicant page**, not farm info |
| `walk-meta.json` | all | Raw per-step DOM dumps (element counts/labels) + blocked-text captures behind every screenshot above |

Screenshot count: **10 PNGs** + 1 raw dump (`walk-meta.json`).

## Per-step observations

| Ordinal | Thai title | Inputs/selects/textareas | Distinct questions a human sees | Required fields | Notes |
|---|---|---|---|---|---|
| 1 — ยินยอม | "ยินยอมและประเภทคำขอ" | 2 checkboxes | 2 (PDPA consent, standards ack) | both | Simplest step; no back button (first step); advances cleanly |
| 2 — ข้อมูลพืช | "ข้อมูลพืชและสายพันธุ์" | 6 plant buttons (1 shown + 5 behind "ตัวเลือกพืชอื่น" disclosure) + 3 service-type + 3 purpose + 3 cultivation + 3 file inputs (once a purpose is picked) = 17→20 controls | 4 visible sections (plant / service type / purpose / cultivation) + a 5th (M1 documents) that only appears after purpose is picked | plant, service type, ≥1 purpose, ≥1 cultivation method, all 3 M1 PDFs | Fee estimate (฿30,000 for 1 cultivation method) shown live, before any payment step — good transparency. **Blocked here**: M1 uploads fail server-side |
| 3 — ผู้ยื่นคำขอ | "ข้อมูลผู้ยื่นคำขอ" | 6 text inputs (5 required + email optional) + 3 file inputs | 2 groups: "ข้อมูลส่วนบุคคล" (6 fields) + "เอกสารแนบ" (3 uploads) | firstName, lastName, idCard, phone, address, idCardDoc | All 6 text fields arrive **pre-filled from the real user profile** — a returning farmer never has to retype them. **Blocked here too**: idCardDoc upload fails the same way |
| 4–8 — farm/plots, cultivation, harvest & quality, documents, review | — | — | — | — | **Not reachable.** App redirects any direct URL visit back to step 3 (applicant) while it is incomplete. No screenshot exists; none fabricated. |

## Top 5 most confusing things (first-time farmer's view)

1. **A file upload can silently "succeed" locally while failing on the server.** On the applicant step, after picking a file for "สำเนาบัตรประชาชน" the card switches to showing the filename and a "ลบออก" (remove) button — visually identical to a real successful attach — even though the upload actually failed and nothing reached the server (`inline-document-upload.tsx`: `setFile(payload)` runs before the network call, and is never rolled back on failure). A farmer would reasonably believe the file is attached and be confused later when the step still won't advance.
2. **The same failure is loud one step earlier and silent one step later.** On plant-selection (step 2) a failed upload shows a clear red "Failed to upload draft document" chip per document. On the very next step (applicant, step 4) the same underlying failure shows no error at all next to the file control — only a generic top-of-page banner unrelated to the specific field. Inconsistent error visibility for the same failure mode.
3. **A scary red "workspace failed to load" banner sits permanently above a form that otherwise works fine.** It appeared on first paint of the applicant step, before any interaction, and never depended on anything I did. A real farmer has no way to know whether it's safe to keep filling in the form underneath it.
4. **"บันทึกและไปขั้นตอนถัดไป" vs "ถัดไป."** Step 2's primary button reads differently ("Save and go to next step") from every other step's plain "ถัดไป" ("Next") — a small but real inconsistency in a flow that otherwise repeats the same button in the same place on every screen.
5. **Typing a later step's URL doesn't error, it teleports you backwards with no explanation.** Going to `/step/5` directly lands you back on the applicant screen with zero indication that anything redirected — it just looks like the "farm info" link never worked. (This guard is intentional per the code comment referencing a 2026-05-03 bug fix, but it currently has no user-facing message.)

## Artifacts for reproduction
- `diag-upload.js` (scratch script, not part of this report dir) — direct API repro of the upload failure, run against the live backend with the farmer's real session cookies.
- `walk-meta.json` — per-step DOM dumps + captured on-screen error text behind every screenshot.
