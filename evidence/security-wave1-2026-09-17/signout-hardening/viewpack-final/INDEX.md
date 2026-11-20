# signout-hardening: view-pack on the final wave-1 tree

Run on 2026-09-17 at 08:00Z (UTC), on HEAD `9648689ebe32` of `fix/security-wave1`. That commit merges the final sign-out round (round 10, `ef71f972`).

The setup, the scenes and the `ok` rule are the same as in `../../honest-limits/viewpack/INDEX.md`:
- the real app runs under `next dev`, so the real `middleware.ts`, api-client, AuthService and clear-cookie route are all in play;
- `stub-backend.js` answers every call with 403 ACCOUNT_INACTIVE;
- Chromium runs each scene 10 times per clear-cookie mode.

Rounds 3–10 changed the marker, which is now only `account_inactive.<16 hex id>`, and what the middleware accepts. This run checks that the whole path still works end to end with those changes.

| scene | `ok` |
|---|---|
| officer, clear-cookie 0 / 5 / 30 / 100 ms | 40/40 |
| officer, clear-cookie aborted | 10/10 |
| farmer, clear-cookie 0 / 5 / 30 / 100 ms | 40/40 |
| farmer, clear-cookie aborted | 10/10 |

No run ended on a dashboard. None ended on a login page without the notice, and none left a session cookie behind.

Links from elsewhere to `…/login?reason=account_inactive`, with no marker:

| who opens the link | result |
|---|---|
| logged-in officer | ends on `/provider/dashboard` with the cookie kept, as before |
| logged-out visitor, either portal | sees the login page with no notice |

Files:
- `after-final-checks-9648689ebe32.json` has the per-run results;
- each screenshot shows the first run of its scene, with the build and UTC time in the label.

Logs and traces are kept on the box in `~/work/state/signout-viewpack-final/`.

Two-tab and two-user cases cannot be covered by this single-tab script. They were run in Chromium with the real modules, over http and https; see `../green-round9-browser.txt` and `../green-round10-browser.txt`.
