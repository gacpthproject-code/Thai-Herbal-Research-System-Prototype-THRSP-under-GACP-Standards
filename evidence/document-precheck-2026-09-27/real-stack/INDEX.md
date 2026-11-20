# Real-stack view-pack: document pre-check, head 0b71c4bb (2026-09-29)
**Stack:** everything ran locally and was torn down afterwards. No fixtures were intercepted.
- Postgres 17 in docker on :5439. `migrate deploy` ran, then the seeds: seed-plants, seed-gacp and `seed-herb-requirement-rules --apply` (178 rules filed).
- Redis 7 on :6381. Backend from this worktree on :8012 (Node 24, NODE_ENV=development, dummy Stripe keys). The log shows `Initializing document pre-check queue` and `Queue workers initialised`.
- `next dev` on :3133. The browser was Playwright 1.63 Chromium from `~/.cache/ms-playwright`.
- Scripts are in `scripts/` (passwords are read from env). The masked browser log is `walk-log.txt` and 0 console errors were recorded. API bodies, with 13-digit runs masked, are in `api/`.

**Applicant:** มาลัย ศรีสุข, acting as the workspace บริษัท สมุนไพรทดสอบ จำกัด (juristic id …1221). The application is a new ginger filing on rented, outdoor land (APP 5d4134cb).

| # | Step | Result | Shots |
|---|---|---|---|
| 1 | Register via the door (JURISTIC), UI login, create the company workspace in the UI, switch to it, fill wizard steps 1-2 | PASS | 01-10 |
| 2a | land_rights, correct deed (text PDF) → checked-ok | PASS | 18 (checking, dark), 19 light/dark |
| 2b | juristic_reg_6m, scanned name-mismatch cert (rasterised `company_reg--name-mismatch.pdf`) → checked-flags | PASS for the state; the finding is wrong, see D1 | 11, 12 (checking), 13 light/dark |
| 2c | Same slot, `company_reg--expired.pdf` → EXPIRED; the old row is SUPERSEDED | PASS | 15 light/dark |
| 2d | id_house_reg, blank page → three UNREADABLE/NOT_FOUND observations | PASS | 14 light/dark |
| 2e | 0-byte file → FAILED | **FAIL as specified.** It is refused in the browser before any POST (0 requests), so it can never reach FAILED. FAILED was reached with a 4 KB corrupt PDF instead, and the card read "ตรวจอัตโนมัติไม่สำเร็จ เจ้าหน้าที่จะตรวจเอง" | 20 (0-byte refused, page in dark), 21 light/dark |
| 3 | Press "ยืนยันว่าเอกสารถูกต้อง" → ยืนยันแล้ว; the button is disabled and stays so after a reload. The review page submit is enabled while id_house_reg is flagged and unacknowledged and landlord_consent is FAILED. Submit POST returned 200 and the status is PENDING_DOC_FEE | PASS | 23 (+after-reload, dark), 24, 28, 29, 30 |
| 4 | DELETE `/applications/draft-documents/:id` on land_rights: the precheck goes null, the row goes SUPERSEDED, text true→false, snippets 1→0 (same for landlord_consent) | PASS through the HTTP door. The wizard has no delete control (D3) | 25 before/after, 26, api/applicant-requirements-{before,after}-delete.json |
| 5 | document_reviewer (seeded 1111…) opens document-check | PASS | 31 light/dark, 32-35 light/dark |
| 6 | API bodies | PASS, with a note | api/*.json |
| 7 | Timings; no leftover processes | PASS | see below |

**Step 5, officer page counts (light):**
- Labels: ไม่มีข้อสังเกต 6 · ตรวจเอง 3 · ผู้ยื่นยืนยันแล้ว 1 (on the acknowledged juristic row) · ความมั่นใจในการอ่าน 3.
- The disclaimer "ผลตรวจอัตโนมัติเป็นข้อสังเกตเบื้องต้น การตัดสินเป็นของเจ้าหน้าที่" appears 4 times, one per block, directly under the heading.
- The FAILED block shows no confidence.
- Snippets are masked ("…1221").

**Step 6, API bodies:**
- Applicant `GET /applications/:id/requirements`: the keys confidence, evidenceSnippet, extractedText and ocrConfidence are all absent.
- Officer `GET /provider/applications/:id/document-check`: confidence and evidenceSnippet are present, extractedText is absent.
- NOT_FOUND is shown as an observation on both sides (13, 33).
- Both bodies contain eleven 13-digit runs. All 11 are epoch-ms prefixes of `/uploads/application-drafts/<ms>-<uuid>` file names; 0 are elsewhere. So no ID leaks, but a naive `\d{13}` guard will trip on these file names.

**Step 7, timings (DB `completed_at - created_at`):**

| upload | method | time |
|---|---|---|
| scanned cert | OCR, confidence 92 | 2.63 s |
| blank page | OCR | 0.56 s |
| text PDFs | text layer | 0.26-0.36 s |
| corrupt PDF | FAILED after retries ("Invalid PDF structure.") | 30.4 s |

- The card showed "checking" within 0.6 s of the upload response. The scanned upload reached the settled card in about 7.3 s, bounded by the 5 s poll.
- After teardown `pgrep pdf-extract-worker|tesseract` found nothing. Ports 8012/3133 are free and both containers are removed.

## Defects
- **D1 behaviour:** a scanned company certificate for a *different* company (สมุนไพรทดลอง, OCR 92%) gets CROSS_MATCH NOT_FOUND, not MISMATCH. The applicant sees only "ไม่พบข้อมูลที่จะเทียบในเอกสารนี้…" (13).
  - The OCR text holds both the name and the id (grouped `09999 11111 221`).
  - Re-running `evaluate()` offline on the committed text-layer fixture `company_reg--name-mismatch.pdf` with the labels.json reference, director included, *also* returns NOT_FOUND, although labels.json says MISMATCH.
- **D2 UI, dark mode:** a slot card in the missing state keeps `bg-amber-50`, so its title is near-invisible (22-missing-slot-card-dark, 20). The same card is fine in light mode (22).
- **D3 behaviour/UI:** the wizard slot card has no delete control, only "แทนที่ไฟล์". DELETE `/draft-documents/:id` is reachable only by API, so the I2 path cannot be walked in the UI.
- **D4 behaviour:** a 0-byte file never reaches FAILED because the browser refuses it first (20). That is correct as an upload gate, but spec step "0-byte → FAILED" cannot happen.
- **D5 copy:** FAILED reasonTH in the API is "ตรวจอัตโนมัติไม่สำเร็จ ให้เจ้าหน้าที่ตรวจเอง". The card prints its own "…เจ้าหน้าที่จะตรวจเอง" and the officer row prints "…ให้ตรวจเอกสารนี้ด้วยตนเอง" (35). That is three wordings for one state.
- **D6 UI, dark mode:** the disabled confirm button (`bg-leaf-300`, white text) has low contrast after acknowledging (23-dark). "เปิดดูในหน้า" is dim on the dark card (13-dark).
- **Observation:**
  - Step 6 review does not show pre-check flags. The flagged state is visible on steps 2-3 (28).
  - A re-upload supersede keeps the old row's extracted text (row ae7bb454 txt=t), which service.js:12-13 documents; only delete clears it. Register with accountType=JURISTIC returned accountType INDIVIDUAL; the company comes from the workspace.
