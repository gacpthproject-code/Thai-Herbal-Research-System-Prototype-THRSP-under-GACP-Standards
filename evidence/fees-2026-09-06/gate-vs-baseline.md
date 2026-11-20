# The two money rulings — gate vs baseline

Operator ruling 2026-09-06 answered both open questions and authorised the merge:

1. **F-APPV2-01** — *"จะบอกว่าคูณหรือไม่คูณลำบาก มันเป็นการบวกมากกว่า ถ้าเลือก 3 รูปแบบการปลูก
   ราคาก็คือ 3 รูปแบบ แต่ในเสนอราคา และใบวางบิลก็ต้องลงรายละเอียดด้วย เช่น 1.ค่าธรรมเนียมขออนุญาต
   แบบกลางแจ้ง งวดที่ 1 หากมี 3 รูปแบบในใบเสนอราคาต้องมีบอกเป็น 1 2 3 แล้วราคาก็เอามารวมกัน"*
   and, on the wording: *"outdoor เราต้องลงในใบเสนอราคาว่ากลางแจ้ง หรือ glasshouse เป็นโรงเรือน"*
2. **F-G4-71** — option **ก**: issue automatically when the documents are approved.
3. **merge** — the appv2 branch went to main as `ef363d4f` (73 commits), verified with
   `git ls-remote`. This fee work is a SEPARATE branch so that money code the operator had
   not yet seen did not ride along with the merge they had just approved.

| | baseline | this branch |
|---|---|---|
| HEAD | d44cbd98 | 8c3ac122 |
| probe FAIL | 5 | **5 (same names)** |
| suites failed | 4 | **2** |
| tests failed | 8 | **4** |
| tests passed | 9,767 | **10,403** |

ratchet: `PASS — no counter above baseline` (hardcode 24 · todo 56 · env-direct 114 ·
dup-source 0 — the Thai label map lives beside the map it mirrors precisely so this stayed 0).

tier-check: **TIER=C**, on one file — `modules/billing/internal/fee-service.js (money)` —
so the operator merges, as L5 requires for every money path.

## comparison, verbatim
```
===== probes =====
-- baseline: 5  new: 5
OK — no new probes failures

===== suites =====
-- baseline: 4  new: 2
OK — no new suites failures
.. fixed since baseline:
FAIL __tests__/unit/application-status-writer-cert-hook-evidence-gate.test.js
FAIL __tests__/unit/error-codes-catalog.test.js

===== tests =====
-- baseline: 8  new: 4
OK — no new tests failures
.. fixed since baseline:
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (EVIDENCE_CAPTURE_UNAVAILABLE — audit row exists but photo/checklist models are not provisioned) -> same refuse-and-revert contract
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (NO_ONSITE_AUDIT) -> writer rolls the status back to fromStatus and re-throws -> caller tx aborts, nothing persists at AUDIT_PASSED
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › control: sufficient evidence -> the real chain mints a certificate and does NOT roll back
● shared/error-codes catalog › every discovered code is catalogued (no drift between code and catalog)

===== step verdicts (new run) =====
[local-gate] banned-terms: PASS
[local-gate] green-mask: PASS
[local-gate] mojibake: PASS
[local-gate] probe-gate: FAIL
[local-gate] unit-suite: FAIL

===== totals =====
baseline: Test Suites: 4 failed, 21 skipped, 730 passed, 734 of 755 total Tests: 8 failed, 142 skipped, 9767 passed, 9917 total 
new     : Test Suites: 2 failed, 30 skipped, 798 passed, 800 of 830 total Tests: 4 failed, 201 skipped, 10403 passed, 10608 total 

VERDICT: NO NEW FAILURES vs baseline
```

## what the ruling changed that the numbers cannot show

At today's rates `base × 3` and `rate + rate + rate` are the same number, so every total on
every existing document is unchanged — which is the point of the golden tests that still
pass. What changed is the direction of the arithmetic:

- **before** — a phase total was `ratePerScope × scopeCount`, and the document divided that
  total by the count to invent a per-type line. The file said so itself: *"the lines are a
  presentation of it"*.
- **after** — each declared type is a line, and the total is their sum. Pinned by a test
  that passes a NON-uniform per-type rate, which multiplication cannot satisfy at all.

The day one cultivation type is priced differently from another, the old model prints wrong
lines under a right-looking total. That is the failure this ruling forecloses, and it is
invisible in any figure measured today.

## what is still open, and why it is not in here

F-G4-71 names four shapes that no door can quote. Option ก closes the first — an
application that reaches an M2-payable state carrying no quotation at all. The other three
(a lapsed pre-W14 DTAM+PLATFORM pair, a row that prices the wrong instalment, a row whose
`phase2InvoicedAt` is already stamped) still need someone to issue a replacement, which is
option **ค**, a finance-officer door. The operator chose ก, so ค was not built.
