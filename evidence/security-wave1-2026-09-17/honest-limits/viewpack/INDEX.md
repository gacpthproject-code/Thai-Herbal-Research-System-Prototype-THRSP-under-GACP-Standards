# honest-limits review round 2: view-pack (HARNESS.md §4.4)

What was run (2026-09-17, on this box):
- **Web app:** the real app, started with `next dev` from this worktree. That covers the real `middleware.ts`, api-client, AuthService and the `/api/session/clear-cookie` route.
- **Backend:** `stub-backend.js`, which answers every call with `403 ACCOUNT_INACTIVE`.
- **Browser:** Chromium, driven by `viewpack.js`.
- **No database and no real account.** The portal gates are passed with unsigned role-only cookies, which middleware only decodes. The provider cookie is httpOnly, like the real one.

Labels:
- `before`: HEAD `cb3c2097`. The production files were written from `git show HEAD:`, and the fixed files were restored afterwards, sha256-identical.
- `after`: the fixed tree. The label `wt97c6da8a971f` is the first 12 hex digits of the sha256 of the sha256 manifest of the 8 changed production files.
- The `before` label has no `wt` prefix: `cb3c209717f1` is simply the commit SHA.

Each suspended-session scene was run 10 times per mode. The mode is how `/api/session/clear-cookie` behaves: delayed by 0 / 5 / 30 / 100 ms, or aborted (`page.route`).

A run counts as `ok` only when all three hold:
- it ends on the portal's login page with `?reason=account_inactive`;
- the suspended-account notice is visible;
- the portal's session cookie is gone.

| scene | before `ok` | after `ok` |
|---|---|---|
| officer, clear-cookie 0 ms | 3/10 (7 ended on `/auth/provider/login?redirect=%2Fprovider%2Fdashboard`, no notice) | 10/10 |
| officer, 5 ms | 1/10 (9 on the plain login page, no notice) | 10/10 |
| officer, 30 ms | 0/10 (10 on the plain login page, no notice) | 10/10 |
| officer, 100 ms | 1/10 (9 on the plain login page, no notice) | 10/10 |
| officer, clear-cookie aborted | 0/10 (10 back on `/provider/dashboard`, provider_token still set) | 10/10 |
| farmer, 0/5/30/100 ms | 40/40 | 40/40 |
| farmer, clear-cookie aborted | 0/10 (notice shown, but auth_token still set) | 10/10 |

Links from elsewhere to `…/login?reason=account_inactive`, with no marker cookie:

| who opens the link | before | after |
|---|---|---|
| logged-in officer | sent to `/provider/dashboard`, cookie kept | same |
| logged-out visitor, officer login | **notice shown** (untrue) | no notice |
| logged-out visitor, farmer login | **notice shown** (untrue) | no notice |

Per-run details are in `before-checks-cb3c209717f1.json` and `after-checks-wt97c6da8a971f.json`. Each screenshot is the first run of its scene and carries a label with the build and UTC time.

After the fix, a run makes 2 or 3 clear-cookie requests, not 1, and 4 to 6 when the request is aborted. I checked where they come from in one traced 30 ms run:
- 2 come from the dashboard before it leaves;
- 1 comes from the login page, whose own public call the stub also answers with ACCOUNT_INACTIVE. On a login page the client clears the session but does not navigate.

Traces for the 30 ms and aborted scenes are not in git, because `.gitignore` drops `*.zip`. They are in `~/work/state/honest-limits-viewpack/trace/`. The run logs, the next-dev log and the stub log are in `~/work/state/honest-limits-viewpack/`.

To reproduce:
1. Start the stub: `node stub-backend.js 39181`.
2. Start the app from `apps/web-app`: `INTERNAL_API_URL=http://127.0.0.1:39181 npx next dev -p 3913 -H 127.0.0.1`.
3. Run the script: `NODE_PATH=apps/web-app/node_modules node viewpack.js http://localhost:3913 <label> <sha> <outDir> <traceDir> 10`.

Use `localhost` in the URL, because next dev writes its redirects to `localhost`.
