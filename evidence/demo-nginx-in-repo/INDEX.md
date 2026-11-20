# demo-nginx-in-repo

Branch `fix/demo-nginx-in-repo`. Tier C (`scripts/probes/tier-check.sh` classifies `deploy/nginx/*` as deploy).

## What changed

`deploy/nginx/demo-host/` holds the nginx files the demo host (119.59.105.140) loads and serves, byte for byte, read on 2026-10-30 after the operator's 09:36 change.
Paths mirror the host: `deploy/nginx/demo-host/<path>` is `/<path>` on the demo host.

| Repo file | On the demo host |
|---|---|
| `etc/nginx/nginx.conf` | host nginx 1.24.0 main config, includes `conf.d/*.conf` |
| `etc/nginx/conf.d/00-gacp-platform.conf` | first server on :80 and :443, answers gacpth.com, www.gacpth.com and unnamed hosts |
| `etc/nginx/conf.d/demo.gacpth.com.conf` | demo.gacpth.com vhost (moved here from `deploy/nginx/demo.gacpth.com.conf`, so one copy remains) |
| `usr/share/nginx/gacpth-notice/index.html` | the gacpth.com notice page |
| `opt/gacp-platform/nginx/gacp.production.conf` | mounted into container `gacp-nginx` as `/etc/nginx/conf.d/default.conf` |
| `opt/gacp-platform/nginx/50x.html` | mounted into `gacp-nginx` as `/etc/nginx/error-pages/50x.html` |

Not in git: certificates and keys, and the root-only token include files.

Behaviour recorded (operator ruling 2026-10-30, final form applied 09:36): on gacpth.com and www.gacpth.com, any case, both ports, every path gets the notice page (200, `X-Robots-Tag: noindex, nofollow, noarchive`, `Cache-Control: no-store`), including `/api/*`. Only `/verify/...` gets 302 to `https://demo.gacpth.com$request_uri`. Methods other than GET and HEAD get 405 from nginx on the notice (measured in the walk); POST `/verify/...` still gets the 302. The guard runs before `if ($gacp_bare_domain_deny)`, so it answers addresses outside the allowlist too. demo.gacpth.com is unchanged.

`deploy/nginx/gacp-platform.conf` (staging) lost the comments that said gacpth.com must never open; its blank-page guard stays as the rollback target. `docs/operations/domain-access.md` describes the new behaviour.

## Artifacts

| File | What it shows |
|---|---|
| `red-1-no-demo-host-tree.txt` | `nginx-exposure.test.js` before the mirror existed: 28 failed, 18 passed. |
| `red-2-redirect-everything-0915.txt` | Against the 09:15 host file (302 for every path): 20 failed. |
| `red-3-inline-notice-0929.txt` | Against the 09:29 host file (inline `return 200` notice): 1 failed, the file-based notice test. |
| `green.txt` | Against the 09:36 host file: 46 passed. |
| `mutation-check.sh`, `mutation-check.txt` | 18 mutations (drop the guard, move it after the deny, 301, drop `$request_uri`, loosen or case-fold `/verify/`, unanchor the host, drop the notice rewrite, notice location loses `internal` or noindex or its root, proxies, page text and noindex meta change, demo vhost claims gacpth.com or becomes `default_server` or stops proxying, demo deny row returns). Every one turns the suite red. Files are restored byte-exact after. |
| `nginx-t-and-walk.sh`, `nginx-t-and-walk.txt` | `nginx -t` passes for the edge in `nginx:1.24.0` (demo host version) and for the container config in `nginx:alpine` image `da954fb959a3` (the image id `gacp-nginx` runs on demo), both `--network none` with a throwaway certificate, removed after. Then 135 GET requests and 3 non-GET requests against the edge: loopback and an address outside the allowlist (via `CF-Connecting-IP`), four host spellings, both ports. The served notice body is `index.html` byte for byte. |
| `drift-check-demo-e1d13b175.txt` | `~/work/state/infra/check-nginx-drift-demo.sh e1d13b175`, read-only over ssh: every mirrored file identical to the host, the container serves the same bytes as the host file, both token files present (not read), 37 live GET requests on the demo host's loopback behave as recorded, and demo.gacpth.com never answers with the notice. PASS, 47 checks. |
| `drift-check-demo-negative-6c99c363c.txt` | The same checker against the branch's first commit (09:29 file, no notice page): FAIL with 2 unexplained differences, so it does catch drift. |
| `third-party-scope-red.txt` | `third-party-services-scope.test.js` against the 09:36 page: 1 failed, because that page loaded Google Fonts (see below). |
| `third-party-scope-green.txt` | Against the 10:00 page (Sarabun embedded as data: URIs): `third-party-services-scope`, `nginx-exposure` and `nginx-upload-limit-fits-one-filing` pass, 89/89. |
| `drift-check-demo-e09f59848.txt` | The drift checker against `e09f59848` after the 10:00 page: PASS, 47 checks. |
| `rehearse-notice-headers.txt` | `nginx-t-and-walk.sh` with `DEMO_HOST_TREE` pointing at a copy of the mirror whose `00-gacp-platform.conf` is the prepared header fix: `nginx -t` passes, 135 requests pass, and the notice carries all five security headers. |
| `notice-headers-dryrun.txt` | Dry run of `~/work/state/infra/demo-gacpth-notice-headers.sh` on the demo host: the 5-line diff, and the five security headers missing on both bare hosts today. Nothing written. |

## The notice page no longer calls Google (fixed at the source)

The 09:36 page loaded `fonts.googleapis.com` and preconnected to `fonts.gstatic.com`, which `third-party-services-scope.test.js` forbids. The operator's 10:00 page embeds Sarabun (thai and latin subsets, weights 300 and 600) as woff2 `data:` URIs and makes no external request. It was written to the demo host as `/usr/share/nginx/gacpth-notice/index.html` (61939 bytes), and `index.html` here is the same bytes (sha256 `3848cee2…`).

## The notice drops the server's security headers (measured, fix prepared, not applied)

`location = /__gacp_notice` sets `X-Robots-Tag` and `Cache-Control`, and a location with any `add_header` of its own inherits none from its server. Measured on the demo host's loopback (`curl -I --resolve gacpth.com:443:127.0.0.1`) and through Cloudflare (`curl -I https://gacpth.com/`): the notice has no `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`. The `/verify/` 302 keeps all five, because it answers before any location is chosen.

The fix restates the five lines inside the :443 notice location. The :80 server sets no security headers, so its notice location loses nothing. Prepared outside the repo, because the mirror must equal the live host:

- `~/work/state/infra/gacpth-notice/00-gacp-platform.notice-headers.conf` is the whole after-file (the mirror plus 5 lines).
- `~/work/state/infra/demo-gacpth-notice-headers.sh` (dry run by default) refuses unless the host file is byte-equal to the before or after state, backs up to `/root`, writes, checks the write, runs `nginx -t`, reloads, probes, and prints the rollback command.
- `~/work/state/infra/gacpth-notice/after-apply-notice-headers.patch` carries the mirror change and a test that every `add_header` a bare-host server sets is restated in its notice location. Against the live mirror it fails with exactly the five headers; with the after-file it passes, 47/47.

## Known demo defect kept visible

The demo container config predates order 120 (F-A8-12): `api_upload` is 5r/m with burst 10 and no `limit_req_status 429`, so a filing with more than 10 documents gets 503 on demo. `nginx-upload-limit-fits-one-filing.test.js` keeps checking every deployable config and pins the demo snapshot's old values in its own describe block, so a sync of the demo host must update that test.

## Not done here

Nothing on the demo host was edited, reloaded or restarted. The checker and the walks send GET requests only.

## Gate

`~/work/state/heavy.sh timeout 7200 ~/work/state/gate/gate-locked.sh e09f59848` then `~/work/state/gate/compare.sh e09f59848`, against main's gate 110d5ed96. Summary in `test-output.txt`, `probe-results.json`, `ratchet-before-after.txt` (from `~/work/state/gate/evidence-pack.py`).

Full suite: 15897 passed, 7 failed, 52 skipped. compare.sh lists no new failing suite against main's gate. The three failing integration suites (`a0-pr2-per-hop-invariant`, `onsite-decision-mint-e2e`, `status-writer-audit-default-invariant`) also fail on main's gate.

Round 1 (`e1d13b175`) had two new suites. `third-party-services-scope.test.js` came from the 09:36 notice page and passes now. `quotation-states-both-instalments-real-postgres.test.js` is a known load flake (14 of 184 earlier gates) and did not fail this time.

`secret-scan-deep` reports 60 fingerprints that are not in `gitleaks-base`. They are the same 60 as round 1's gate. All are `generic-api-key` matches in evidence logs from six commits already on main (`212943a3e`, `226b12741`, `66b894664`, `8c3246996`, `d22fc2ab6`, `de3bf6082`). None comes from this branch.
