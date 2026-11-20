# quotation issuer fix — 2026-09-27 (branch fix/quotation-issuer-undefined, base 87b197bf, fix c34e61fc)

Bug: `services/quotation-service.js` read `ISSUER_TYPES.DTAM` after 3fc6a56a removed it, so
`_readLiveQuotationRows` asked Prisma `issuerType in [undefined, 'PLATFORM']` and every issuance failed
→ every checkout answered 409 QUOTATION_NOT_ISSUED.

| file | what it shows |
|---|---|
| `red-output.txt` | RED on a real Postgres (postgres:17-alpine, migrate deploy 144 migrations): submit hook returns `{issued:false}`, Prisma `Can not use \`undefined\` value within array`; unit map test sees `ISSUER.DTAM = undefined` |
| `red-output-round2.txt` | the full 3-test integration file (incl. legacy-DTAM-only case) against base quotation-service.js: 3 failed |
| `test-output.txt` | GREEN on the same Postgres (6/6) + two mutants of the legacy read sites, each killed by one test |
| `backend-full-suite.txt` | backend full suite base vs fix, summary lines only; signing-key mtime unchanged |
| `probes.txt` | retired-words, ratchet, tier-check (TIER=C), no-secret/gitleaks (hits are on another branch's commit, not this branch) |

Raw jest logs are not committed (they trip gitleaks); they stay in the session scratchpad.
