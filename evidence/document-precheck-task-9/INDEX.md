# document-precheck Task 9 — corpus, accuracy report, thresholds (ratchet)

Branch `feat/document-precheck` · Node v24.21.0 · NODE_OPTIONS unset · SIGNING_KEY_DIR = mktemp -d

| file | what it shows |
|---|---|
| `red-output-thresholds-parameter.txt` | RED: `evaluate`/`nameMatchLevel` ignored a thresholds parameter (3 failed / 3 passed — the 3 passing are pins: "omitting = constants" held before and after) |
| `red-output.txt` | RED: accuracy test before `accuracy-report.js` / `thresholds.json` existed (`Cannot find module`) |
| `test-output.txt` | GREEN of the first round (superseded numbers — kept as the record of that round) |
| `fixround1-red-output.txt` | fix round 1 RED (review I1): `computeMetrics` scored DOC_TYPE/CROSS_MATCH/VALIDITY on truth-UNREADABLE files (n 3 vs 2, overall 12 vs 9) |
| `fixround1-rescored-vs-old-floors.txt` | the re-scored report against the first-round floors: 7 breaches — the old floors were inflated by the cascade |
| `fixround1-test-output.txt` | fix round 1 GREEN: plain gate command, accuracy + unit folder, 9 suites / 192 tests, `floor breaches: []`, 0 leftover `pdf-extract-worker` |
| `sweep-output.txt` | `accuracy-report.js --sweep` after fix round 1: metrics, every disagreement, the 9 x 6 table, the rule's pick, "floors: all met", exit=0 |
| `floor-bites-output.txt` | NAME_SIMILARITY_MIN edited to 0.5 → the plain gate command FAILS (CROSS_MATCH.precision 0.5 < 0.6364, CROSS_MATCH.recall 0.3333 < 0.7778, overall.recall 0.7813 < 0.9063); edited back to 0.85 |
| `ocr-confidence-by-variant.txt` | OCR confidence per scanned variant (why the OCR sweep is flat 50..80) |
| `tone-mark-audit.txt` (+ `.js` that made it) | tone marks kept by tessdata_fast vs the faithful text layer, per scanned file |

## Corpus
61 files, 4.0 MB, committed (`apps/backend/__tests__/fixtures/document-precheck/corpus`), 7 slots x 7-10 variants: correct-text (PDF text layer),
correct-scan (image-only PDF), scan-blur (σ3.5, legible), scan-rotate3, scan-heavy-blur (σ5, Thai not legible), illegible (σ9), wrong-type,
name-mismatch (near name, 1-4 letters off), id-mismatch (company_reg / id_card / house_reg — the only types that print an id), and for
company_reg expired + no-date. Truth in `labels.json`, set from what each page prints. Generator is deterministic (two runs, same sha256).

## Scoring (fix round 1, review I1)
READABILITY is scored on all 61 files. DOC_TYPE / CROSS_MATCH / VALIDITY are scored only on the 47 files whose truth READABILITY is
PASS: on an unreadable file the rule layer emits UNREADABLE / NOT_FOUND / DATE_NOT_FOUND for them automatically, and the first round
counted those as ~26 true positives, so the dependent checks' numbers described READABILITY. A false UNREADABLE on a readable file
still counts against them; a missing cascade flag is still a presence error (`__tests__/unit/document-precheck/accuracy-metrics.test.js`).

## Sweep and the pick (pooled; precision / recall)
```
OCR \ name     0.7          0.75         0.8          0.85         0.9          0.95
40          69.6%/50.0%  70.8%/53.1%  70.8%/53.1%  73.1%/59.4%  71.4%/62.5%  72.4%/65.6%
45          76.7%/71.9%  77.4%/75.0%  77.4%/75.0%  78.8%/81.3%  77.1%/84.4%  77.8%/87.5%
50..80      78.8%/81.3%  79.4%/84.4%  79.4%/84.4%  80.6%/90.6%  79.0%/93.8%  79.5%/96.9%   (rows 50-80 identical)
```
Rule (dispatch decision 4): best recall = 96.9%; eligible = recall ≥ 91.9% → name 0.90 / 0.95 at OCR ≥ 50; highest precision →
**the rule's output is OCR 60 / name 0.95** (79.5% / 96.9%). OCR rows 50..80 tie exactly; tie-break = nearest the current value → 60.
- OCR 60 (rule output): every legible scan reads 90-94, every heavy/illegible one 26-49 (`ocr-confidence-by-variant.txt`); nothing in
  50-89, so the corpus cannot place the threshold inside that gap; 40/45 let illegible pages through.

### Exception: NAME_SIMILARITY_MIN stays 0.85 — coordinator decision 2026-09-28, operator to confirm
This is NOT the pick rule's output. At OCR 60, per check (precision / recall, false warnings):
| name | CROSS_MATCH | overall | CROSS_MATCH false warnings |
|---|---|---|---|
| 0.85 (shipped) | .6364 / .7778 | .8056 / .9063 | 4 |
| 0.90 | .6154 / .8889 | .7895 / .9375 | 5 |
| 0.95 (rule's pick) | .6429 / 1.0000 | .7949 / .9688 | 5 |
Between 0.85 and 0.95 exactly three files change: 0.95 catches the two near names 0.85 misses (land_lease ใหม่/ใหญ่, sim 0.94;
house_reg ธนากร/ธนา, sim 0.867) and adds one false warning on a correct document, `company_reg--scan-blur.png` (an OCR-blurred
company name). Reasoning: the corpus is clean synthetic text; real scans lose tone marks under tessdata_fast (README), so 0.95 would
flag many legitimately OCR-degraded names as mismatches — the false-warning class §6.4 wants fewest of. The one blurred page that
flips here is that class, under-represented. DOC_TYPE / VALIDITY / READABILITY are identical at all three values.

## Floors (thresholds.json = achieved at OCR 60 / name 0.85)
| check | precision | recall | exact agreement | n |
|---|---|---|---|---|
| READABILITY | 1.0000 | 1.0000 | 100% | 61 |
| DOC_TYPE | 0.7143 | 0.8333 | 92.7% | 41 |
| CROSS_MATCH | 0.6364 | 0.7778 | 73.2% | 41 |
| VALIDITY | 0.7500 | 1.0000 | 77.8% | 9 |
| overall | 0.8056 | 0.9063 | 89.5% | 152 |
UNREADABLE rate ceiling 0.2295 (14/61 — exactly the 14 files labelled unreadable). No tolerance; measured with tesseract.js 7.0.0 on this
machine (thresholds.json `_about`). The first-round floors were higher only because of the cascade scoring; they were never on main.
Extraction wall time 37-57 s over 61 files; accuracy suite ~40-45 s.

## Limits of these numbers
- Synthetic, one font (Sarabun), clean white pages: OCR here is better than real phone scans. tessdata_fast lost (net) 36/219 mai ek
  (mostly under blur) and 2/114 mai tho; no on-file name lost a tone mark, so no TONE_ONLY false warning appears. The README's
  mai-tho loss is under-represented — a real-scan corpus is needed before these floors describe production accuracy.
- The 7 false warnings on correct documents: OCR letter slips under blur (4), id digit groups merged by OCR (2), the issue date
  unread under blur (1). Rule-side causes are in BACKLOG-FOUND.md (2026-09-28 Task 9 section).
