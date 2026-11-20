# fix/design-reproducibility — branch notes (2026-08-21)

## History cleanup owed before handoff
- `841ebdbd docs(log): operator permanently deletes the data-residency rule` accidentally carries the
  backend signed-URL work (storage-service.js, uploads-access.js, routes/api/files/files.js, shared/log-redact.js,
  config/secrets.js, 4 tests — 1,320 lines). Cause: two agents staged into the shared index concurrently.
  Action before merge handoff: split into `docs(log)` + `feat(uploads): signed-URL delivery for private files (backend)`.
  Deferred until all in-flight agents on this branch have committed (no history rewrite under live work).
- Rule for agents on this branch from now on: `git diff --cached --name-only` immediately before every commit,
  `git restore --staged` anything not yours; commit in the foreground.

## Second splice (2026-08-22)
- `b738bcba` carries the batch/lot BE-year fix (harvest-identifiers.js thaiYear, certificate-service.js :342/:827,
  ssot test, W1-3 report) under the WRONG message ("W2-E + W2-B/W2-F — consent back button and step-2 chrome").
  The wizard agent's real commit with that message is `35675495`. Reword b738bcba → "fix(backend): batch/lot
  identifiers use BE year (พ.ศ.) via one thaiYear helper (W1-3 fix round 1)".
- Policy from now on: agents do NOT commit. They leave changes in the working tree and report file lists;
  the coordinator commits each set serially. History rewrite (split 841ebdbd, reword b738bcba) happens
  once, at handoff, with no agent writing.
