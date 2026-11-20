# Port of 6b7703d3 (truthful copy) onto main c2233c56 — 2026-09-26

Branch `fix/truthful-copy`: `d9c53c6c` (the port, with conflicts resolved and the sentences that became false corrected) and `bbe6e984` (phase chip copy found by the view-pack). All runs on Node v24.21.0.

| artifact | result |
|---|---|
| `red-web.txt` | c2233c56 production files + the port's tests (service-facts.ts present so the pages can load): 11 of 13 suites fail, 61 of 109 tests |
| `red-backend.txt` | mirror test with service-facts.ts absent (as on main): 3/3 fail |
| `red-phase-chip.txt` | c2233c56 phase-due-state.ts + HEAD test: the new chip case fails |
| `mutation-stale-0917-sentences.txt` | the 2026-09-17 sentences put back into HEAD (state fee inside the price, remittance, platform fee, email line removed): 7 new cases fail |
| `green-backend.txt` | mirror + renewal-fee-ssot: 16/16 pass |
| `web-full-jest.txt` | HEAD bbe6e984: 398 suites / 3,257 tests pass (main: 392 suites) |
| `web-tsc.txt` | exit 0 |
| `next-build.txt` | `next build` with lint on: exit 0, 27 warnings, none in a file this branch changed |
| `backend-full-jest.txt` | HEAD d9c53c6c (backend untouched by bbe6e984): 849 passed / 31 skipped, 10,892 tests passed / 207 skipped, EXIT 0. Fresh SIGNING_KEY_DIR under the scratchpad, 3 GB heap. No Postgres: integration suites skipped themselves. dedupeKey hashes redacted |
| `backend-full-jest-run1-maxworkers2.txt` | first run, `--maxWorkers=2`: same counts, no failing test or suite in the log, but jest exited 1. Cause not found. Run above repeated it with default workers and exited 0 |
| `key-mtime-*.txt` | main tree `apps/backend/keys/private.pem`: 2026-09-05 22:50:35 before and after |
| `tier-check.txt` | TIER=C (money: pricing, checkout, payments list, invoice card, staff invoice modal, quotation preview) |
| `retired-words.txt` / `ratchet.txt` | PASS / PASS (hardcode=27 todo=53 env-direct=102 dup-source=0) |

## View-pack (`view-pack/before`, `view-pack/after`)

Real Chromium against local `next dev` on :3117 (`NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true`, `NEXT_PUBLIC_CHECKOUT_API_MODE=mock`). `before` = the 21 production files at c2233c56, `after` = HEAD. Scripts: `view-pack/viewpack.js`, `view-pack/viewpack-faq.js`. Every screen's text is in `*-rendered-text.txt` / `*-faq-text.txt`.

What is real and what is not:
- pricing, terms, FAQ, footer: real pages, no backend needed.
- onboarding (`/health/onboarding`), checkout, payments list: health pages reached with the unsigned health-role cookie from `e2e/checkout-visual.spec.ts` and a localStorage user. No backend ran. The payments list's `/api/**` calls were answered by fixtures (one unpaid M1 invoice 5,885, an ACCEPTED quotation 35,310). The header's "โหลดพื้นที่ทำงานไม่สำเร็จ" comes from those fixtures, not from this change.
- checkout "created" state is the mock fixture `HAPPY` (฿5,535, the pre-one-fee split). That amount is the fixture's, not the product's.

Rendered phrase counts, before → after (all captured text): "ใช้งานฟรี" 5→0, "รับรองโดย" 5→0, "ค่าธรรมเนียมรัฐ" 2→0, bank-transfer wording 2→0, "ตามประกาศ" 1→0, "3 ปี" 1→0, "scope เล็ก" 1→0, "ชำระงวดนี้ได้เลย" 1→0, "ยังชำระค่าธรรมเนียมผ่านระบบไม่ได้" 0→5, "support@gacpth.com" 1→1.

Still on screen and not from this change (left for follow-up): FAQ "เจ้าหน้าที่จะนัดหมายล่วงหน้าไม่น้อยกว่า 7 วันทำการผ่านระบบและอีเมล" (notifications are in-app only); footer copyright names the department.
