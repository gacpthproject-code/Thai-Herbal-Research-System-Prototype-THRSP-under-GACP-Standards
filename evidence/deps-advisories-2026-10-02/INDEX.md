## deps-advisories-2026-10-02 — 2026-10-03
Status: DONE(probe:dependency-audit) — on this branch's dependency commit 0a6b8131 (base main 3f5c4198) · Tier C (tier-check) · operator merge
Did:
- before.txt: on main 3f5c4198 the probe FAILs with 12 lines = 10 distinct high GHSA ids (axios ×7, basic-ftp ×1, brace-expansion ×2 across two version ranges); pnpm audit --prod reports high 14 (incl. 2 operator-accepted extract-zip), moderate 17
- after.txt: probe PASS (3 operator-accepted) · high 2 (the same extract-zip rows) · moderate 10 · nothing new to accept
- Fixes, all real upgrades (no accepted row, no auditConfig change):
  - axios ^1.20.0: direct dep (backend + root dev) and override; minor bump within major 1
  - basic-ftp ^6.2.1: transitive override; no 5.x fix exists, so this crosses a major. get-uri declares ^5. 6.0.0's only breaking change: separate transfer host disabled by default; get-uri's calls keep the same signatures
  - brace-expansion overrides: @1 >=1.1.21, @2 >=2.1.7
- No framework major bump (next/react/prisma/express/jest unchanged)
Tests (Node v24.21.0, NODE_OPTIONS unset, SIGNING_KEY_DIR=mktemp):
- backend full jest, branch vs main 3f5c4198: both runs Suites 894 pass / 4 fail / 47 skip (of 945), Tests 11837 pass / 22 fail / 339 skip
  - Same on both: payer-block-matrix + dtam-schema-drop (no DB) · finance-paper-text-inside-print-margin (browser navigation timeout)
  - Differs, both flaky: auth-idp-providers-endpoint failed only on the branch (30s timeout under load) and passes when run alone · document-precheck/extract failed only on main; run alone 4× it passed 3/4 on the branch and 2/4 on main (child-process timing race)
  - No new failure
- web: tsc exit 0 · jest Suites 428/428, Tests 3525/3525 · next build exit 0 (116/116 static pages)
Build: docker build backend + web Dockerfile, both exit 0 (tags deps-test-*:0a6b8131, removed afterwards). The backend image contains axios@1.20.0, basic-ftp@6.2.1, brace-expansion@1.1.21 + 2.1.7
Probes (branch): dependency-audit PASS (selftest 22/22) · ratchet PASS 26/53/101/0 · retired-words PASS · no-secret PASS (gitleaks clean) · no-skip PASS · tier-check TIER=C
Blocked: -
Next:
- Operator: review + merge (Tier C: package.json / lockfile)
- Remaining moderate advisories (probe does not fail on these): morgan (direct, ->1.12.1), qs ->6.16, ip-address ->10.7.1, stream-json, decode-uri-component
- Finding: CVE-2026-14257 (GHSA-mh99-v99m-4gvg) now has backports 1.1.17/2.1.3. With ignoreCves emptied, pnpm audit (prod and full) shows no brace-expansion advisory. The suppression, its acceptance row and security/vulnerability-exceptions.json can be retired (operator's call; not done here)
Evidence: before.txt · after.txt · raw logs outside the repo at ~/work/state/deps-advisories-2026-10-02/
