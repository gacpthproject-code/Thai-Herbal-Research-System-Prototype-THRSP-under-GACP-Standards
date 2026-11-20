# Fix round 1: fix/truthful-copy (2026-09-26)

Commits: a574bd09 (review fixes) · 45618631 (merge main e42ac52b, no conflicts) · 371db8b3 (constant moved to the file foot; see below). Node v24.21.0.

| artifact | result |
|---|---|
| `red-web.txt` | e0d41300 production files + a574bd09 tests: 14 of 94 fail (one-source email guard, ค่าบริการ wording, channel from the backend list, certificates page fixed "3 ปี") |
| `red-backend.txt` | e0d41300 stripe-checkout-service + new mirror test: the channel test fails (no exported list) |
| `web-full-jest.txt` | 45618631: 402 suites / 3,283 tests pass. 371db8b3 changes only a backend file; the truthful-copy suites were re-run on it (59/59) |
| `web-tsc.txt` | 45618631: exit 0 |
| `next-build.txt` | 45618631, lint on: exit 0, 27 warnings, none in a file this branch changed |
| `backend-full-jest-before-line-fix.txt` | 45618631: quotation-gate-error-codes fails 2 tests. a574bd09 had declared the constant 9 lines up in stripe-checkout-service.js, which shifted the `file:line` sources in shared/error-codes.js (:221, :299). Fixed in 371db8b3 by declaring the constant at the foot of the file |
| `backend-full-jest.txt` | 371db8b3: 854 suites passed / 32 skipped, 11,009 tests passed / 221 skipped, EXIT 0. Fresh SIGNING_KEY_DIR, 3 GB heap. dedupeKey values redacted |
| `key-mtime-*.txt` | main tree private.pem: 2026-09-05 22:50:35 before and after |
| `gitleaks.txt` | main..HEAD: no leaks |
| `tier-check.txt` / `retired-words.txt` / `ratchet.txt` | TIER=C / PASS / PASS |
