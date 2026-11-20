# full local gate — N1-N5 (notifications) vs baseline

รัน: 2026-09-05 · `NODE_OPTIONS=--max-old-space-size=3072 LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh`
HEAD: `b8f42db1`
baseline: `/home/ubuntu/backups/local-gate-b1.txt`

เกณฑ์คือ **ไม่มีความล้มเหลวใหม่** ไม่ใช่ทุกอย่างเขียว — local-gate แดงบน main อยู่แล้ว

## ตัวเลข

| | baseline | รอบนี้ | |
|---|---|---|---|
| suites failed | 4 | **3** | ดีขึ้น |
| tests failed | 8 | **7** | ดีขึ้น |
| tests passed | 9767 | **10125** | +358 |
| probe FAIL | 5 | 5 | เท่าเดิม ชื่อเดียวกัน |

## ชื่อ suite ที่แดง — สำคัญกว่าตัวเลข

รอบนี้แดง 3 ตัว **เป็นสับเซ็ตของ baseline ทั้งหมด ไม่มีชื่อใหม่**:

| suite | baseline | รอบนี้ |
|---|---|---|
| `application-status-writer-cert-hook-evidence-gate.test.js` | FAIL | FAIL |
| `auth-idp-providers-endpoint.test.js` | FAIL | FAIL |
| `farm-entityid-stamp.test.js` | FAIL | FAIL |
| `error-codes-catalog.test.js` | FAIL | **PASS** — หายไปจากรายการแดง |

`apps/web-app/e2e/farmer-services-carpet.spec.ts` เป็น Playwright spec ที่ no-skip รายงานอยู่แล้ว
(waiver L-006 ถึง 2026-09-15) ไม่ได้อยู่ในชุด jest นี้

## probe

```
deploy-drift FAIL prod-frontend: could not reach https://gacpth.com/api/webapp-version (network or HTTP error)
dockerignore-secrets PASS PASS: 10 sensitive file(s) in the tree, all excluded from the build context by .dock
fee-single-source PASS PASS: one fee table: apps/backend/config/business-rules.js
gate-attestation FAIL FAIL: no attestation for HEAD b8f42db15940fbf7e1624a7ded4bcfe6c316abf6 — evidence/gate
holiday-single-source PASS PASS: single calendar source: apps/backend/utils/working-days.js
main-attestation-audit FAIL 24 of 24 gated commit(s) on origin/main in the last 30 first-parent commit(s) (cut
no-secret FAIL FAIL: gitleaks found leaks — evidence/gitleaks.log
no-skip FAIL apps/web-app/e2e/farmer-services-carpet.spec.ts:100: test.skip(!HAS_CREDS, 'E2E_TEST_IDENTIFIER /
ratchet PASS PASS: no counter above baseline — current: hardcode=24 todo=56 env-direct=114 dup-source=0 (evi
schema-arg-resolves FAIL - scripts/deploy/remote-install.sh:155 'is' (not path-shaped — reads as prose, not 
status-vocab PASS PASS: 11 DONE(probe:...) claim(s) in QUEUE.md + reports/**/*.md all name registered probes (
stripe-sdk-isolated PASS PASS: stripe SDK only in services/payment/stripe-adapter.js
```

## signing key

ตรวจก่อนและหลังรัน — **ไม่เปลี่ยน** (`npx jest` เคยหมุนคีย์และทำใบรับรองจริงเสีย มาแล้วครั้งหนึ่ง)

```
1254f786bc590fcdecf2f5ce1d146d77c22b1df80df07eb932a8c6d65be98876  apps/backend/keys/private.pem
f6034bc172000afef8a2e982992faf52eddd9481ea9b3820aaebe78906bac19b  apps/backend/keys/public.pem
```

## สรุป

**ไม่มีความล้มเหลวใหม่** — ผ่านเกณฑ์ DoD ชั้น B ข้อ "CI เขียวจริง" ในรูปแบบ fallback
ที่ operator อนุมัติไว้ (2026-08-06) · ที่ยังขาดคือ **รีวิวชั้นที่สอง**
