# fix/precheck-followups — evidence (2026-09-29, Node 24.21.0)

| item | commit | RED | GREEN |
|---|---|---|---|
| 1 validity ป.พ.พ. ม.193/3+193/5 | a1583515 | 1-validity/red-output.txt (7 failed ×3 TZ) | 1-validity/test-output.txt (77/77 ×3 TZ) |
| 2 one FAILED wording | efd4d6b4 | 2-failed-wording/red-output.txt | 2-failed-wording/test-output.txt |
| 3 dark-mode contrast | 3f54c1a6 | 3-dark-contrast/red-output.txt (8 failed) | 3-dark-contrast/test-output.txt + view-pack |
| 4 wizard delete control | 7e64b609 | 4-delete-control/red-output-{backend,web}.txt | 4-delete-control/test-output.txt + view-pack |
| 5 stale PENDING sweep | d44d8a09 | 5-stale-sweep/red-output.txt + tenant-lazy-thenable.txt | 5-stale-sweep/test-output.txt (scratch PG17 :5440) |
| 6 owed tests | 9489f2dd | 6-owed-tests/tesseract-red-output.txt · erasure-tx-mutation-red.txt (pin) | 6-owed-tests/test-output.txt |

Gates: probes-output.txt (retired-words, ratchet 26/53/101/0 = main's evidence/ratchet-current.txt,
no-skip, no-secret, themed-surface-tokens: all PASS) · gate-output.txt (next build exit 0, web jest
414/414 suites, backend unit+integration vs main baseline). View-pack: view-pack/INDEX.md (intercepted renders).
scripts/ci/local-gate.sh was not run in this session.
