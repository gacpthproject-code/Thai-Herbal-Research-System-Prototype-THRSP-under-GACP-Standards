# Document pre-check (ตรวจเอกสารเบื้องต้นอัตโนมัติ): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After an applicant uploads a document to one of 7 slots, the system checks it locally and shows warning flags to both the applicant and the officer. The system never blocks submission and never decides for the officer.

**Architecture:**
- The upload door enqueues a Bull job.
- A sandboxed processor extracts text locally: the pdf text layer via `PDFParse`, then tesseract with LOCAL traineddata.
- Pure rule modules produce flags, which are stored in two new tenant-scoped tables.
- The applicant requirements API and the officer document-check API expose the flags. Officer verdicts record the pre-check they saw, so accuracy can be measured.

**Tech Stack:** Node 24 · Express · Prisma/Postgres · Bull + Redis · tesseract.js 7 (local tessdata) · pdf-parse 2 (`PDFParse`) · Next.js 15 / React · jest 30

**Spec:** `docs/superpowers/specs/2026-09-27-document-precheck-design.md`. §8 records corrections found by the code recon; they override §1–§7 where they conflict.

## Global Constraints

- **No external AI service:** do not send documents or text to any AI provider (operator: "ตามระเบียบต้องใช้ C", "งั้นยังไม่มีไปก่อน"). OCR runs with tesseract on our server, using Thai + English traineddata bundled in the repo and image, so Thai reading works reliably and reproducibly. No data-residency rule applies here; it was retired.
- **Scope is exactly 7 canonical slot ids:** `land_deed` · `land_lease` · `land_consent` · `company_reg` · `id_card` · `house_reg` · `previous_cert`. Any other slot gets no pre-check row.
- **Flags are warnings only.** They never block submission and never change any application or document status.
- **Signature/seal is always `MANUAL`.** No automatic signature detection.
- **Every rule threshold cites its source** (กทล.1 or `reports/research/2026-09-01-dtam-application-baseline/facts.md:<line>`). Company certificate age ≤ 6 months: `facts.md:50`. No source means no check.
- **Dates use Bangkok time** (`utils/working-days.js` `getZonedParts`). Date tests pass under `TZ=UTC` and `TZ=America/Los_Angeles`.
- **Thai copy follows the `thai-ui-copy` skill.** No emoji. Brand #006633 + Sarabun. Never name the technology. IDs are masked as `…1234` (last 4 digits).
- **New tables carry `organizationId`,** and the model names are added to `TENANT_SCOPED_MODELS` in `services/tenant-prisma-extension.js`. Every query uses an explicit `select`. The Prisma select-field guard (`__tests__/unit/prisma-select-field-guard.test.js`) stays green.
- **The migration is expand-only.** Timestamp name `20260927xxxxxx_document_precheck`.
- **Jest runs:**
  - Record the mtime of `/home/ubuntu/work/GACP-Certification-Application/apps/backend/keys/private.pem` before and after; it must not change.
  - Use `SIGNING_KEY_DIR=$(mktemp -d)`.
  - Backend full suite needs `NODE_OPTIONS=--max-old-space-size=3072`.
  - Always `source ~/.nvm/nvm.sh && nvm use 24`.
- **Evidence:** commit test-log summaries only, never raw jest logs (gitleaks false positives). Never print secrets. Real-DB tests use a throwaway `postgres:17-alpine` container. Wait for `select 1` to succeed; `pg_isready` alone is not enough. Never SET/RESET on a pooled URL.
- **Tier C** (migration + officer screen), so the operator merges. The governance docs (skill + HARNESS_LOG) are updated in the same branch (operator order 2026-09-27).
- **Commits:** Thai messages ending with the two trailer lines `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01RRHmfYKxvxwbaJYaBnHbhU`.

## Review Focus

1. **Re-upload while a job is still running.** The old job finishes after the new upload. It must not write flags onto the new document, and its row must end as `SUPERSEDED`. Pinned in Task 6 (`precheck-supersede-race`).
2. **Redis down or enqueue throws.** The upload must still return 200. The pre-check row is created as `FAILED` with the "ตรวจอัตโนมัติไม่สำเร็จ" flag, never silently missing. Pinned in Task 6 (`enqueue-failure-still-uploads`).
3. **Large or odd files:** 60-page PDF, encrypted PDF, 0-byte file, HEIC/unsupported image. These need a page cap (first `MAX_PAGES = 10`, then `PAGE_COUNT` noted) and a per-job timeout, and they end as `UNREADABLE` or `FAILED`, never a crash or hang. Pinned in Task 4 (`extract-limits`).
4. **Applicant data not filled yet or not applicable.** Examples: an individual with no Entity, a JURISTIC entity with no `payload.director`. Cross-match returns `NOT_FOUND` (nothing to compare), never `MISMATCH`. Pinned in Task 3 (`cross-match-missing-reference`).
5. **Good but low-quality scans** (OCR confidence just under threshold). The expected result is "อ่านไม่ชัด", not "ผิดชนิด" or "ไม่ตรง". The doc-type and cross-match rules must return `UNREADABLE`/`NOT_FOUND` when readability failed. Pinned in Task 3 (`unreadable-short-circuits`).

---

## File Structure

```
apps/backend/data/tessdata/tha.traineddata, eng.traineddata   (vendored, sha256 in README)
apps/backend/services/ocr/tessdata.js                          (existing — langPath, verified)
apps/backend/services/document-precheck/
  catalog.js        slot → phrases, expected pages, validity rule, cited source
  normalize.js      pure: thai digits, names, BE/Thai-month dates, 13-digit checksum, mask
  extract.js        file → {pages[{text,confidence}], method, pageCount}
  rules/readability.js · rules/doc-type.js · rules/cross-match.js · rules/validity.js · rules/signature.js
  evaluate.js       pure: (extraction, reference, slotId, now) → flags[]
  service.js        enqueue/record/supersede/acknowledge + reference loader
apps/backend/jobs/document-precheck-processor.js               (Bull sandboxed processor)
apps/backend/services/queue-service.js                         (+ getPrecheckQueue)
apps/backend/prisma/schema/document-precheck.prisma             (2 models)
apps/backend/prisma/schema/application-document-review.prisma   (+ precheckId nullable)
apps/backend/prisma/migrations/20260927xxxxxx_document_precheck/
apps/backend/routes/api/applications/applications.js           (enqueue after sync, ~1671)
apps/backend/routes/api/applications/requirements.js           (slot.precheck + acknowledge)
apps/backend/routes/api/provider/document-reviews.js           (slot.precheck + verdict precheckId)
apps/backend/scripts/document-precheck/make-corpus.js, accuracy-report.js
apps/backend/__tests__/fixtures/document-precheck/ (generated corpus + labels.json)
apps/web-app/src/app/health/applications/new/_steps/steps/requirement-slot-card*.tsx/.ts
apps/web-app/src/app/provider/reviewer/[id]/document-check/client-view.tsx (+ state)
```

---

### Task 1: Make OCR read Thai (bundle tha + eng traineddata)

**Files:**
- Add: `apps/backend/data/tessdata/tha.traineddata`, `eng.traineddata`
  - From `tesseract-ocr/tessdata_fast` at a pinned commit.
  - Record the URL, commit, sha256 and Apache-2.0 licence in `apps/backend/data/tessdata/README.md`.
- Modify: `apps/backend/services/ocr/tessdata.js`. Point `langPath` at the bundled files, and rewrite its header comment: the reason is reliable Thai OCR (no runtime download, same result everywhere). The retired "foreign egress / sovereignty" rationale leaves no trace.
- Test: `apps/backend/__tests__/unit/tessdata-local-only.test.js`

**Interfaces:**
- Produces: `TESSERACT_WORKER_OPTIONS` (existing export). `langPath` is the bundled dir and `gzip: false`.

- [ ] **Step 1: Write the failing test.**
  - `tessdata-local-only`: both files exist, and their sha256 equals the values in README.md.
  - `TESSERACT_WORKER_OPTIONS.langPath` resolves to `apps/backend/data/tessdata`.
  - `thai-ocr-reads-thai`: a real `recognize()` of generated Thai images returns text containing the phrase. The images are "โฉนดที่ดิน", "หนังสือรับรอง กรมพัฒนาธุรกิจการค้า", and a Thai date "27 กันยายน พ.ศ. 2569" with Thai digits.
  - Also test a Thai-only phrase with tone marks and sara am (for example "ทำ", "น้ำ"); these are common OCR failures.
- [ ] **Step 2:** Run `npx jest __tests__/unit/tessdata-local-only.test.js`. Expected: FAIL, files missing.
- [ ] **Step 3:** Add the traineddata files and the README hashes. Fix `tessdata.js` if needed.
- [ ] **Step 4:** Re-run. Expected: PASS. Also check that the backend Docker image contains the files: `docker build` the backend and `ls /app/apps/backend/data/tessdata` in the image.
- [ ] **Step 5:** Commit.

### Task 2: `normalize.js`, the pure Thai text helpers

**Files:** Create `apps/backend/services/document-precheck/normalize.js`. Test `__tests__/unit/document-precheck/normalize.test.js`.

**Interfaces (Produces):**
- `thaiDigitsToArabic(s: string): string`
- `normalizeName(s: string): string` strips the company/person affixes (`บริษัท`, `จำกัด`, `(มหาชน)`, `ห้างหุ้นส่วน…`, `นาย`, `นาง`, `นางสาว`), whitespace and punctuation.
- `nameSimilarity(a: string, b: string): number`, range 0–1, normalized Levenshtein on `normalizeName` output.
- `findThirteenDigitIds(text: string): string[]` handles Thai digits and dashes/spaces between digit groups.
- `isValidThirteenDigitId(s: string): boolean` reuses `isThaiIdChecksumValid` from `@gacp/validation/thai-id-checksum`.
- `parseThaiDates(text: string): Date[]` finds `d <เดือนไทยเต็ม|ย่อ> พ.ศ. yyyy`, `d/m/yyyy` with BE years (> 2400 → −543), and Thai digits. Each result is a Date at 00:00 Asia/Bangkok.
- `maskId(s: string): string` returns `…` + the last 4 digits.

- [ ] **Step 1: Failing tests** (table-driven):
  - `thaiDigitsToArabic('๐๑๒๓')==='0123'`
  - `normalizeName('บริษัท ทดสอบ จำกัด')===normalizeName('ทดสอบ')`
  - `nameSimilarity('ทดสอบพร้อมเพย์','ทดสอบพรอมเพย์')>=0.85`
  - `findThirteenDigitIds('เลข ๐-๑๐๕๕-๖๘๐๔๕-๙๓-๒')` → `['0105568045932']`
  - `parseThaiDates('ออกให้ ณ วันที่ 27 กันยายน พ.ศ. 2569')` → one date equal to 2026-09-27 Bangkok
  - `parseThaiDates('27 ก.ย. 69')` → same
  - `maskId('0105568045932')==='…5932'`
  - both TZ runs
- [ ] **Step 2:** Run the tests. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run with `TZ=UTC` and `TZ=America/Los_Angeles`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 3: Catalog, rules and `evaluate`, all pure

**Files:** Create `catalog.js`, `rules/*.js` and `evaluate.js` under `services/document-precheck/`. Test `__tests__/unit/document-precheck/rules.test.js`.

**Interfaces (Produces):**
- `CATALOG: Record<SlotId, { phrases: string[][], expectedPages?: number, validity?: { maxAgeMonths: number, source: string }, reference: ('ENTITY_NAME'|'JURISTIC_ID'|'DIRECTOR_NAME'|'APPLICANT_NAME'|'CITIZEN_ID')[] }>`
  - `phrases`: each inner array is one alternative that must fully appear, with fuzzy tolerance.
  - `company_reg.validity = { maxAgeMonths: 6, source: 'facts.md:50' }`. Only `company_reg` has a validity rule.
- `evaluate({ extraction, reference, slotId, now }): Flag[]`, where
  - `Flag = { check: 'READABILITY'|'DOC_TYPE'|'CROSS_MATCH'|'VALIDITY'|'SIGNATURE', result: string, reasonTH: string, confidence: number, evidenceSnippet?: string }`
  - The `result` values are exactly spec §3: `PASS`/`UNREADABLE`/`PAGE_COUNT` · `MATCH`/`NOT_FOUND`/`UNREADABLE` · `MATCH`/`MISMATCH`/`NOT_FOUND` · `PASS`/`EXPIRED`/`DATE_NOT_FOUND` · `MANUAL`.
- `reference = { entityType, entityName?, juristicId?, directorName?, applicantName?, citizenIdLast4? }`, loaded in Task 6.
- `OCR_CONFIDENCE_MIN` and `NAME_SIMILARITY_MIN` are exported constants. Task 9's corpus report sets their values. The initial values are `60` and `0.85`, marked `// provisional — set from corpus (Task 9)`.

- [ ] **Step 1: Failing tests:**
  - one test per result value per check;
  - `cross-match-missing-reference`: an individual with no entity yields `NOT_FOUND` and never `MISMATCH`;
  - `unreadable-short-circuits`: when readability is `UNREADABLE`, doc-type is `UNREADABLE` and cross-match is `NOT_FOUND`;
  - the `company_reg` issued-date boundary: exactly 6 months → `PASS`, one day over → `EXPIRED`, evaluated in Bangkok;
  - the signature result is always `MANUAL`;
  - `reasonTH` never contains a full 13-digit number (regex `\d{13}` absent).
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the rules, `CATALOG` (with a `source` string on every rule) and `evaluate`.
- [ ] **Step 4:** PASS under both TZ.
- [ ] **Step 5:** Commit.

### Task 4: `extract.js`, from file to page texts, fully local

**Files:** Create `services/document-precheck/extract.js`. Test `__tests__/unit/document-precheck/extract.test.js`, using real small fixtures generated in the test.

**Interfaces (Produces):** `extractDocument(absPath: string, mimeType: string, { maxPages = 10, timeoutMs = 60000 } = {}): Promise<{ method: 'TEXT_LAYER'|'OCR'|'NONE', pageCount: number, pages: {text: string, confidence: number}[], truncated: boolean }>`

Order of attempts:
1. A PDF with a text layer is read with `new PDFParse({data}).getText()`. The confidence is 100 per page.
2. A scanned PDF (no text on a page) is rasterised with `PDFParse#getScreenshot` for pages ≤ `maxPages`, then OCR'd.
3. JPEG and PNG images go straight to OCR through `services/ocr/tesseract-service.js` (`tha+eng`, local tessdata).
4. Anything else, a 0-byte file or an encrypted PDF gives `method: 'NONE'`, `pages: []`.

- [ ] **Step 1: Failing tests:**
  - a text-layer PDF → `TEXT_LAYER`, containing its Thai phrase;
  - an image-only PDF → `OCR`;
  - a PNG → `OCR`;
  - `extract-limits`: a 60-page PDF → `pageCount 60`, `pages.length 10`, `truncated true`;
  - 0-byte → `NONE`;
  - encrypted → `NONE`;
  - timeout → rejects with `code: 'PRECHECK_TIMEOUT'`;
  - a scanned Thai page OCRs with the bundled Thai data (text contains the page's Thai phrase).
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Record the wall-time per case in the test log summary.
- [ ] **Step 5:** Commit.

### Task 5: Data model and migration

**Files:**
- Create `prisma/schema/document-precheck.prisma`.
- Modify `prisma/schema/application-document-review.prisma` (add `precheckId String? @map("precheck_id")` + relation).
- Create migration `prisma/migrations/20260927xxxxxx_document_precheck/migration.sql`.
- Modify `services/tenant-prisma-extension.js` (add `DocumentPrecheck`, `DocumentPrecheckFlag` to `TENANT_SCOPED_MODELS`). Update the backfill-list comment the same file instructs.
- Test `__tests__/integration/document-precheck-schema.test.js` (real Postgres).

**Interfaces (Produces):**
- `DocumentPrecheck`, table `document_prechecks`:
  - `id` (uuid) · `organizationId` · `applicationId` · `documentId` (the upload's `documentId` uuid) · `slotId` (canonical)
  - `status` `PENDING|DONE|FAILED|SUPERSEDED` · `rulesVersion` (Int) · `extractMethod` `TEXT_LAYER|OCR|NONE?` · `ocrConfidence Float?` · `pageCount Int?` · `extractedText String?`
  - `applicantAcknowledgedAt DateTime?` · `createdAt` · `completedAt DateTime?`
  - Unique constraint: `@@unique([documentId])`. Index: `@@index([applicationId, slotId, status])`.
- `DocumentPrecheckFlag`, table `document_precheck_flags`:
  - `id` · `organizationId` · `precheckId` (FK, onDelete Cascade) · `check` · `result` · `reasonTH` · `confidence Float` · `evidenceSnippet String?`
- Both carry `organizationId` with FK to Organization, `onDelete: Restrict`, following `application-document-review.prisma`.

- [ ] **Step 1: Failing integration test:**
  - `migrate deploy` on a throwaway DB;
  - insert a precheck with 2 flags;
  - the unique `documentId` refuses a duplicate;
  - the `ApplicationDocumentReview.precheckId` FK works.
  - The tenant extension scopes reads: org A cannot read org B's precheck through `prisma.documentPrecheck.findFirst` in a bound tenant context.
- [ ] **Step 2:** FAIL (no tables).
- [ ] **Step 3:** Write the schema and migration (expand only), and update the allowlist.
- [ ] **Step 4:** PASS. The `prisma-select-field-guard` test is green.
- [ ] **Step 5:** Commit.

### Task 6: Service, queue, processor, and the upload hook

**Files:**
- Create `services/document-precheck/service.js` and `jobs/document-precheck-processor.js`.
- Modify:
  - `services/queue-service.js`: add `getPrecheckQueue()`, queue name `document-precheck`, `process(1, processorPath)`, job `{attempts: 2, backoff: 30000, timeout: 120000, removeOnComplete: 500}`.
  - `routes/api/applications/applications.js`: after `syncApplicationDocument(...)` (~1671), call `documentPrecheck.enqueueForUpload(...)`. Wrap it in try/catch so the upload response never changes.
- Tests:
  - `__tests__/unit/document-precheck/service.test.js`;
  - `__tests__/integration/document-precheck-flow.test.js` (real Postgres + real `extract` + real tesseract; the processor function is called directly, not through Redis).

**Interfaces (Produces):**
- `enqueueForUpload({ applicationId, organizationId, documentId, slotId, absPath, mimeType }): Promise<{ precheckId } | null>`
  - Returns null for slots outside `CATALOG`.
  - Marks earlier non-SUPERSEDED rows for the same `(applicationId, slotId)` as `SUPERSEDED`.
  - Creates a `PENDING` row and adds the job. If adding the job throws, it sets the row to `FAILED` with one flag `{check:'READABILITY', result:'UNREADABLE', reasonTH:'ตรวจอัตโนมัติไม่สำเร็จ เจ้าหน้าที่จะตรวจเอง'}`.
- `runPrecheck(precheckId): Promise<void>`: the processor body.
  - Loads the row. It exits if the row is not `PENDING`, which is the supersede guard.
  - Runs extract, then `loadReference(applicationId)`, then `evaluate`.
  - Writes the flags and `DONE`, in one transaction, conditional on `status = 'PENDING'`. An `updateMany` count of 0 means it was superseded meanwhile, and the flags are discarded.
  - On a thrown error it writes `FAILED` plus the failure flag.
- `loadReference(applicationId): Promise<Reference>`: explicit selects of Application → Entity (`type`, `displayName`, `juristicId`, `payload`) and the applicant User (`firstName`, `lastName`).
- `acknowledge(precheckId, healthUserId): Promise<void>`: owner only. Sets `applicantAcknowledgedAt`.
- `RULES_VERSION = 1`.

- [ ] **Step 1: Failing tests:**
  - A `land_deed` upload creates a PENDING row. `runPrecheck` gives DONE with ≥ 5 flags (one per check).
  - A slot outside scope (`sop_cultivation`) creates no row.
  - `precheck-supersede-race`: upload A → upload B for the same slot → run A's job after B exists. A's flags are not written, and A is `SUPERSEDED`.
  - `enqueue-failure-still-uploads`: when the queue add throws, POST `/draft-documents` still returns 200 and the row is `FAILED` with the failure flag.
  - A processor exception yields `FAILED` plus the flag. Nothing is left `PENDING`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. In `server.js` the queue is initialised the same way as `initQueues()`: never under `NODE_ENV=test`.
- [ ] **Step 4:** PASS (unit + integration on a throwaway Postgres).
- [ ] **Step 5:** Commit.

### Task 7: APIs for the applicant and the officer

**Files:**
- Modify:
  - `routes/api/applications/requirements.js` (`GET /applications/:id/requirements`): each in-scope slot gets `precheck: { status, flags[{check,result,reasonTH}], acknowledgedAt } | null`.
  - Add `POST /applications/:id/prechecks/:precheckId/acknowledge` (health owner only).
  - `routes/api/provider/document-reviews.js`: `GET /:id/document-check` slots gain `precheck` (the same shape plus `confidence`, `evidenceSnippet`). `POST /:id/document-reviews` stores `precheckId`, the slot's current DONE precheck id, on the verdict row.
- Tests: `__tests__/unit/document-precheck/routes.test.js` (real routers).

**Interfaces:** they consume Task 6's `service.acknowledge` and a read helper `service.currentForSlots(applicationId): Promise<Map<slotId, PrecheckView>>`.

- [ ] **Step 1: Failing tests:**
  - The owner sees flags on their slots. A different health user gets 404.
  - Only an officer role that can read document-check sees `evidenceSnippet`, and the snippet contains no `\d{13}`.
  - A non-owner is refused acknowledge.
  - A verdict row stores `precheckId`.
  - The acknowledge endpoint never changes application status: assert the status before equals the status after.
  - Tenant: an officer of org B cannot read org A's flags.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement with explicit selects.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 8: Screens (applicant slot card and officer row)

**Files:**
- Modify:
  - `apps/web-app/src/app/health/applications/new/_steps/steps/requirement-slot-card-state.ts`: `SlotCardState` gains `'checking' | 'checked-ok' | 'checked-flags' | 'check-failed'`, derived from `slot.precheck`.
  - `requirement-slot-card.tsx`: renders the copy below and the two buttons. `lib/services/application-requirements.ts` gets the type and `acknowledgePrecheck()`.
  - The officer screen `apps/web-app/src/app/provider/reviewer/[id]/document-check/client-view.tsx` and `document-check-state.ts`.
- Tests: the sibling `__tests__/` of each, plus a view-pack.

Exact copy, taken from spec §5:

| State | Applicant sees |
|---|---|
| `checking` | "กำลังตรวจเอกสาร…" |
| `checked-ok` | "ตรวจเบื้องต้นแล้ว ไม่พบข้อสังเกต" |
| `checked-flags` | the list of `reasonTH`, plus the buttons "อัปโหลดไฟล์ใหม่" and "ยืนยันว่าเอกสารถูกต้อง" |
| `check-failed` | "ตรวจอัตโนมัติไม่สำเร็จ เจ้าหน้าที่จะตรวจเอง" |

On the officer row:
- a badge "ผู้ยื่นยืนยันแล้ว" when `acknowledgedAt` is set;
- the line "ตรวจลายมือชื่อ/ตรา" for `MANUAL`.

- [ ] **Step 1: Failing tests:**
  - Each state renders its exact copy.
  - The submit button stays enabled in `checked-flags`, since the flags never block.
  - The card polls the requirements endpoint every 5 s while any slot is `checking`, and stops once no slot is.
  - The officer row shows flags, the acknowledged badge and the signature line.
  - No emoji characters appear in the rendered text.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement using existing design tokens.
- [ ] **Step 4:** Web jest, `tsc` and `next build` all PASS. View-pack: screenshots of the four applicant states and one officer row, taken on a local stack with seeded data, under `evidence/document-precheck-2026-09-27/view-pack/`.
- [ ] **Step 5:** Commit.

### Task 9: Test corpus and accuracy report (sets thresholds; ratchet)

**Files:**
- Create:
  - `scripts/document-precheck/make-corpus.js`: renders synthetic Thai documents for the 7 types with pdf-lib/sharp, using the repo's Sarabun font. Variants: correct, blurred/rotated, wrong type, name/ID mismatch, expired (`company_reg`), no date, text-layer PDF and scanned PDF.
  - `__tests__/fixtures/document-precheck/labels.json`: human-set expected results for every file.
  - `scripts/document-precheck/accuracy-report.js`: per check, precision of warnings, recall, `UNREADABLE` rate.
  - `__tests__/fixtures/document-precheck/thresholds.json`.
- Test: `__tests__/integration/document-precheck-accuracy.test.js`, which fails if any metric is below `thresholds.json`.

- [ ] **Step 1:** Generate the corpus with at least 6 variants × 7 types. Commit the files if the total is under 5 MB; otherwise commit the generator and a seed.
- [ ] **Step 2:** Run the report. Choose `OCR_CONFIDENCE_MIN` and `NAME_SIMILARITY_MIN` so the precision of warnings is maximised while recall stays ≥ what the data allows. Write the values into `evaluate.js`/`catalog.js`, and write the achieved metrics into `thresholds.json` (floor = achieved). Record the reasoning in the evidence INDEX.
- [ ] **Step 3:** Accuracy test: PASS at the new floors. Show it FAILs if `NAME_SIMILARITY_MIN` is set to 0.5, as a demonstration that the floor bites.
- [ ] **Step 4:** Commit. Add the floors to HARNESS.md as a ratchet (raising a floor = normal; lowering = operator + log).

### Task 10: Remove dead code, and update governance

**Files:**
- Delete `routes/api/documents/documents.js`'s `POST /verify` handler, `services/document-analysis-service.js`, `services/ai/document-classifier.js`, and their tests (`document-analysis-service.test.js`, `land-extraction.test.js`, and the verify cases in `documents.test.js`).
- Fix `controllers/plant-controller.js` `GET /api/cultivation/plants/:plantId/documents`. It calls the removed `getBaseRequirements()`.
  - First grep the web app for callers.
  - No caller → delete the route and its handler.
  - Caller → serve it from the B1 requirement register (`services/application-requirements-service.js`). Report which.
- Delete `services/ocr-service.js` if nothing imports it after this. Otherwise wire it to local tessdata and `PDFParse`.
- PDPA retention: extend `jobs/pdpa-retention-job.js` so a precheck's `extractedText` and `evidenceSnippet` are cleared by the same rule that removes the underlying document. Test: `pdpa-retention-clears-precheck-text`.
- Resources: measure the OCR wall time and peak RSS of the processor inside the real backend image (one scanned 3-page PDF). Put the numbers in the evidence INDEX and justify the concurrency value `1`.
- Governance:
  - Add a "Document pre-check" section to `.claude/skills/gacp-workflow-rules/SKILL.md`: 7 slots, local-only, flags never block, signature manual, thresholds ratchet.
  - HARNESS_LOG.md entry (append-only).
  - HARNESS.md ratchet row from Task 9.
  - BACKLOG-FOUND.md: image-based signature detection; more slots.

- [ ] **Step 1:** Failing test (`dead-doc-analysis-gone.test.js`):
  - requiring the deleted modules throws;
  - `POST /api/documents/verify` returns 404;
  - `GET /api/cultivation/plants/:id/documents` never returns 500, whether the route is removed (404) or serves the register (200);
  - `pdpa-retention-clears-precheck-text`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Delete, fix, and update the docs.
- [ ] **Step 4:** Full gate:
  - backend full suite (flags above) and web full jest, both green;
  - `status-vocab`, `retired-words`, ratchet, gitleaks and tier-check (TIER=C);
  - integration dir on a throwaway Postgres.
- [ ] **Step 5:** Commit. Hand off to the operator for merge.
