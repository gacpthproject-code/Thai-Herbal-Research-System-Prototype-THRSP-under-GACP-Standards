# Merge main 03424563 into fix/no-recovery on Node 24 (2026-09-26)

Merge commit `2168770e`, parents `90b46a07` (branch) and `03424563` (main). Conflicts: **none**. No file was changed on both sides: main touched 86 files (Node 24 / CI / Docker / probes / reports / tier-check), and the branch touched the auth, 2FA and docs files. `pnpm install --frozen-lockfile` on Node v24.21.0 passed, and the lockfile was not edited.

| artifact | result (all on Node v24.21.0) |
|---|---|
| `backend-full.txt` | 848 suites passed / 31 skipped, 10,889 tests passed / 207 skipped, exit 0, no failures (fresh SIGNING_KEY_DIR, 3 GB heap). No Postgres: the integration suites skipped themselves. dedupeKey hashes are redacted |
| `key-mtime-*.txt` | `apps/backend/keys/private.pem` in the main tree: 2026-09-05 22:50:35 before and after |
| `web-full.txt` | 392 suites / 3,191 tests, all pass |
| `web-tsc.txt` | exit 0 |
| `next-build.txt` | `next build` with lint on: exit 0. 28 lint warnings, none in a file this branch changed |
| `deps-health.txt` | PASS. Node 24 is consistent everywhere, EOL 2028-04-30, audit critical=0 (high=5, moderate=9, low=3 — main's baseline, no dependency changed on this branch) |
| `retired-words.txt` | PASS |
| `tier-check.txt` | TIER=C |

These results are for the merged tree, after the merge commit. The controller runs full-gate next.
