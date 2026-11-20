# 05-BACKLOG — รายการงานค้างรวมทั้ง repo (2026-08-22)

- อ้างอิง: `main` = **22d03e3e** (ทุก file:line ด้านล่างตรวจบน HEAD นี้) · working tree ขณะเขียน = branch `fix/real-qr-codes` @ 6712f985 (ไม่ได้ใช้ตัดสินอะไรในไฟล์นี้)
- แหล่งที่เก็บ: GOALS.md · QUEUE.md · BACKLOG-FOUND.md · AUDIT_LEDGER.md · HARNESS.md §4.5 · HARNESS_LOG.md · probe-registry.txt · reports/design-cleanup-2026-08-21/00-03 · reports/rules-audit · reports/legacy-sweeper · comment/TODO ในโค้ด · สถานะ staging/prod จาก deploy-drift
- คำสั่ง operator: "งานค้างตรวจสอบแล้วเก็บให้หมด … ตอนนี้ไม่มีงานคนอื่น เป็นงานเราทั้งหมด" → ทุกข้อในไฟล์นี้เป็นของเรา แต่ **ข้อที่กฎ L3/L5/L6 บอกว่า operator ต้องเซ็น/merge/กดเอง ยังต้องรอ operator** (ระบุไว้ใน §4-§5) · ข้อความของ operator วันนี้ไม่ใช่การยกเว้นกฎ — ก่อนแก้ CLAUDE.md/HARNESS.md/registry ต้องได้คำสั่งเป็นลายลักษณ์อักษร (L6)
- วิธีอ่าน: `[T:x]` = tier จาก keyword (ชี้ขาดจริงด้วย `scripts/probes/tier-check.sh` ตอนทำ) · effort S/M/L/XL · ข้อที่ขึ้น **(ทำเฉพาะ S-diff ก่อน)** คือส่วนที่ไม่ต้องตัดสินอะไรเลย

---

## 1. ภาพรวม

| กลุ่ม | จำนวน |
|---|---|
| OPEN (โค้ด/เอกสารบน HEAD ยังมีช่องโหว่จริง, เราทำได้) | **133** |
| GATED (ติด probe / กฎ / คนนอก / การตัดสิน) | **81** |
| FIXED วันนี้ (ปิดแล้ว ห้ามเปิดซ้ำ — §6) | 4 |
| DROPPED (NOT-A-TASK 3 + ซ้ำกันในรายการตั้งต้น 19) | 22 |
| **รวม work item ไม่ซ้ำ** | **214** |

ที่มาตัวเลข: รายการตั้งต้น 240 แถว → ตัด FIXED 4, NOT-A-TASK 3, ซ้ำ 19 (ระบุคู่ซ้ำใน §6) = 214

**Top 5 ตามผลกระทบผู้ใช้**

1. **ผู้ใช้จริงยังเห็นโค้ดเก่า** — staging รัน image `fd61813835f3` (2026-08-14) ตามหลัง main 222 commit, production ตามหลัง 686 commit (`deploy-targets.txt:28-31`, deploy-drift run วันนี้). ทุก fix วันนี้ (signed URL, fail-closed revocation, wizard) ยังไม่ถึงใครเลย → §5 (operator deploy, L5)
2. **ใบรับรองลายเซ็นไม่น่าเชื่อถือ** — PKI fail → ออกใบ hash-only เงียบ (`certificate-service.js:438-452`), key ไม่มีบ้านถาวร + generate ใหม่เงียบ (`signature-service.js:355`), private.pem เคยอยู่ใน build context บน box → ต้อง rotate (§3 D5 + §5 stateless 2-3)
3. **Login พังบน stack dev/Phase-0** — Redis บน laptop ปิด (`/dev/tcp/127.0.0.1/6379` CLOSED วันนี้) ขณะที่ refresh/OTP/MFA fail-closed แล้ว (`redis-service.js:29-54`); พฤติกรรม issueRefreshToken ตอน Redis ล่มยังไม่ตัดสิน (§2 B-OPS + §4 Q-AUTH)
4. **เงิน: ผู้ยื่นอาจเห็นค่าธรรมเนียม/สถานะผิด** — `/api/pricing` fail-open คืน success:true พร้อม default (`pricing.js:166-175`), ค่าธรรมเนียม literal 2 ที่ (`payment-fees.js`, `constants/fees.ts`), quotation ออกแบบ fire-and-forget ผู้ยื่นถูกบอก PAY_PHASE_1 ทั้งที่ใบเสนอราคาอาจไม่มี (`applications.js:986-995`) (§2 B-MONEY-SMALL + §5)
5. **Flow การปลูกหลอกผู้ใช้** — /health/planting ไม่มี cert gate ฝั่ง FE (`planting/layout.tsx` pass-through), ปุ่ม "ดูรายต้น" 5 ปุ่มของฟีเจอร์ที่เลิกแล้ว (R8), ช่องค้นหา trace สาธารณะ resolve QR แปลง-รอบปลูกไม่ได้ (`resolve-generic.js:57`) (§2 B-PLANTING)

---

## 2. ทำเลย (ไม่ต้องตัดสินอะไร) — เรียงตามลำดับที่ควรหยิบ

รูปแบบแต่ละข้อ: **ชื่อ** · พื้นที่ · effort · tier · หลักฐานที่ยังเปิด · ต้องทำก่อน

### Batch B-REDSUITES — ทำให้ main เขียวก่อนทุกอย่าง (1 agent, Tier A/B)
ต้องทำก่อน: ไม่มี · ต้องรัน full suite ด้วย `NODE_OPTIONS=--max-old-space-size=3072`

1. **RED certificate-farm-resolution + certificate-issuance-holder-wiring** (ข้อเดียวกัน) · tests · S · A · `onsite-evidence-gate.js:76-80` โยน NO_ONSITE_AUDIT; ทั้ง 2 test ไม่มี fixture onsite (grep auditChecklist = 0)
2. **RED sc-ten-1-auditor-tenant-scope** · tests · S · A · `audit-scheduling-service.js:565-568` เรียก tx.auditChecklist.findFirst, mock ไม่มี delegate
3. **RED settlement-schema.int** · tests · S · A · `settlement-schema.int.test.js:1-6` ไม่มี HAS_DB guard ต่างจาก `rls-shadow-guc.int.test.js:51-52`
4. **RED tenant-scope-drift (GpsVerificationLog)** · tenant registry · S · B · `audit-onsite-evidence.prisma:153` organizationId required แต่ไม่อยู่ทั้ง `tenant-prisma-extension.js:68` และ KNOWN_DRIFT `:41` → ใส่ registry (ทางที่ถูกกว่า documented drift เพราะเป็น read-backstop)
5. **RED prelaunch-access-gate** · tests · S · A · test `:92-95` ยืนยัน /64 แต่ conf `gacp-platform.conf:96` เป็น /48 และ comment บอกใช้จริงแล้ว → แก้ test ให้ตรง intent /48 (revert conf = deploy = operator, ไม่เลือก)
6. **web workload-layout timeout ใน full run** · web tests · S · A · HARNESS_LOG.md:277 (ยังไม่ re-run รอบนี้)
7. ปิดท้าย: **back-fill 03-OPERATOR-DELEGATED-RULINGS.md:41-42** ("web: (รอ)") ด้วยตัวเลขจริงจาก run นี้ · docs · S · A

### Batch B-LEDGER — เอกสารสถานะให้ตรงความจริง (1 agent, Tier A ทั้งหมด)
ต้องทำก่อน: ไม่มี · ห้ามแตะตัวเลข baseline ที่ขึ้น (L6) — ลงได้

8. **AUDIT_LEDGER Burned table ว่าง ทั้งที่ L-001 เผาแล้ว (#834)** · S · `AUDIT_LEDGER.md:20,27-30` vs `probe-registry.txt:25`; L-004 (`:23`) ชี้ Actions job ที่ตายแล้ว (`local-gate.sh:4-5`) · ส่วน dup-source baseline 4→2 (`AUDIT_LEDGER.md:9`) → §4 Q-RULES
9. **Ratchet baseline สูงกว่าค่าวัดจริง** · S · ledger `:7-10` hardcode 43/todo 59/env-direct 169/dup 4 vs วัดวันนี้ 36/56/122/2 (`evidence/ratchet-current.txt`) · ลงได้เองตาม ledger:2 "DOWN only" — ทำพร้อมข้อ 8
10. **AUDIT_LEDGER sweep L-010…L-080: 77 แถวเปิด ไม่มีแถวไหนย้ายไป Burned** · L · spot-check L-025/026/027 ปิดแล้ว (`ci.yml:365` รัน probe-gate.js) แต่ยังอยู่ open · triage ทีละข้อ = งานอ่านยาว ทำหลังข้อ 8-9
11. **QUEUE.md แถวค้าง** · S · `QUEUE.md:16-17` R1 IN_FLIGHT / R2 BLOCKED ทั้งที่ M1-M7 merge แล้ว; `:279-288` A7/A8/A9/D2/D5/A10/A3 ไม่ refresh; `GOALS.md:27` ยังไม่ติ๊ก · ส่วน PR #560/#766/#680/#554/#461/#818 (`QUEUE.md:316`) ต้องมี `gh`/GitHub ดูก่อน → §5
12. **Docs honesty** · M · `README.md:3` "Production Ready (v3.0)", `docs/contract/evidence/README.md:20-21` "✅ LIVE", docs/**/*.md 416 ไฟล์ → ตัดเหลือชุด 8 ไฟล์ตามแผน G3
13. **G3 contract honesty: known-limits page + build SHA ใต้ทุก screenshot** · M · `GOALS.md:48` ไม่ติ๊ก, `grep known-limits docs` = 0 · ต้องทำก่อน: ไม่มี (build-identity stamp 2f3cbf91 ลงแล้ว)
14. **F5 status dictionary บอก admin ออกใบรับรอง (โค้ดจริง auditor auto-issue)** · S · `2026-05-04-canonical-workflow-status-dictionary.md:55,101` · (F6 maker-checker → §4)
15. **comment ค้างที่โกหก** · S · `pdpa-retention-job.js:196-197` อ้าง mfa.js ใช้ชื่อผิด (grep = 0, `mfa.js:190,198` ถูกแล้ว); `provider-application-detail-config.ts:117` TODO comment ลอย
16. **migrate_status.js ประกาศตัวเองว่าตาย** · S · `scripts/migrate_status.js:1-3`; อยู่ใน zombie list `agent-duplicate-zombie-results.json:302` แล้ว → ลบ (Tier A, ไม่มี caller)

### Batch B-PROBE — ซ่อม/สร้าง probe ผ่าน PR + `--selftest` (L6 อนุญาตให้ agent เขียนกฎ) (1 agent, Tier B; registry row ใหม่ = operator เซ็น)
ต้องทำก่อน: ไม่มี · ทุก PR ต้องแนบ selftest fail+pass · **ห้าม** แก้ baseline/cover/waiver เอง

17. **no-secret.sh อ่าน gitleaks exit ≠0 ทุกค่าเป็น "leak" + ไม่มีทาง install** · S · `no-secret.sh:25-27`; grep gitleaks ใน bootstrap/docs = 0 → case 0/1/other + install note
18. **no-secret.sh สแกน working tree ไม่ใช่ `git ls-files` → laptop .env ที่มี sk_test_ ทำ FAIL** · S · `no-secret.sh:19` `grep -rInE` + `apps/backend/.gitignore:22` · รวม PR กับข้อ 17
19. **regex blind spots**: settle-webhook-only fixed string (`settle-webhook-only.sh:6`), no-secret เฉพาะ Stripe prefix (`no-secret.sh:19`) · M · ส่วน ratchet env-direct `ratchet.sh:29` ขยาย pattern แล้วตัวนับจะเกิน baseline → §4 Q-RULES
20. **fee-table ssot domain นับ pass-through เป็น definition** · S · `ssot-domains.txt:20` จับ `fee-service.js:23` (re-export) ทั้งที่ literal อยู่ `business-rules.js:36` → anchor กับ numeric literal
21. **[BUILD] report-size** (§6 CLAUDE.md ≤40 บรรทัด) · S · ยังไม่มี `scripts/probes/report-size*` · ต้องนิยาม "work item report" = section `## <item> — <date>` ใน reports/**/*.md
22. **[BUILD] probe-selftest** · S · มีแค่ `dockerignore-secrets.sh` ที่มี selftest (registry:28); ไม่มีอะไรบังคับ PR ที่แตะ scripts/probes/*.sh
23. **[BUILD] queue-freshness** · M · ไม่มีไฟล์; ข้อ 11 คือตัวอย่างแถวเน่า · ทำหลังข้อ 11 เพื่อให้ probe เขียวทันที
24. **[BUILD] evidence-complete ขยาย: UI item ต้องมี INDEX.md + SHA/date** · S · `evidence-complete.sh:11-16` เช็คแค่ dir ไม่ว่าง · D-08 อ้างว่าแท็กต่ำกว่าจริง — source พิสูจน์ตรงข้าม
25. **[BUILD] path-guard — re-scope ก่อนสร้าง** · M · ไม่มีไฟล์; spec label-based (`HARNESS.md:97`) ใช้ไม่ได้เมื่อไม่มี Actions (D-09 `operator-decisions.md:28`) → สร้างเป็น local pre-push/probe-gate path check แทน (tier C keyword แต่ logic probe = L6)
26. **[BUILD] stateless §6 probes 6.1-6.8** · L · `ls scripts/probes | grep stateful|boot|signing|pem|redis` = 0 · เขียนได้หมด, registry rows รอเซ็น
27. **check-backup-cron-wired.js ไม่ได้ wire เข้า gate ไหนเลย** · S · B · อ้างถึงตัวเองเท่านั้น (`:5`); `deploy-production.sh:306-314` เรียก install-cron.sh จริง → ใส่ local-gate/full-gate-checks (restore-drill จับเวลา + พิสูจน์ cron ยิงบน host → §5)
28. **wire gacp-app-coverage-probe.js เข้า full-gate-checks.txt** · S · B · `gacp-app-coverage-probe.js:6-9` "NOT yet wired"; ต้องมี DB จริงตอนรัน → full-gate บน box ไม่ใช่ local-gate (cutover role → §5)
29. **REQUIRE_DB=1 ใน gate** · M · A · `grep REQUIRE_DB scripts/ci/` = 0; `GOALS.md:42`; L-036 · มีผลเฉพาะเครื่องที่มี DB (box) — ผูกกับ full-gate เช่นข้อ 28
30. **13 workflow ยังประกาศ `runs-on: ubuntu-latest` ซึ่งรันไม่ได้ตลอดกาล** · M · C (workflow ที่แตะ deploy/secret) · นับวันนี้: security-scan 4, production 5, carpet-bomb 3, build-images 2, deploy-staging 2, runner-dispatch-probe 2, อีก 7 ไฟล์ละ 1 · ส่วนที่ทำเลยได้: ย้าย job อ่านอย่างเดียว (lint/guard) ไป self-hosted หรือลบ; deploy/secret ไฟล์ = operator merge · ส่วน "จ่าย billing หรือยืนยัน self-hosted" → §4 Q-RUNNER

### Batch B-OPS — ตรวจของจริง/evidence (1 agent, Tier A; ส่วนแตะ box = ขอ operator OK ก่อน)
31. **Redis ปิดบน laptop ขณะ auth fail-closed** · S · A · ตรวจวันนี้ CLOSED · start Redis ก่อน Phase-0 walk รอบหน้า + แก้ memory note "Redis optional"
32. **Stateless §5 step 0: inspect server จริง (DATABASE_URL, STORAGE_PROVIDER, PDPA flag, volume size) + baseline backup** · S · A · ไม่มี `evidence/stateless-*` · ต้องใช้ SSH ubuntu@43.134.175.51 (read-only) → ผลเป็น evidence เท่านั้น · **ทุก step stateless หลังจากนี้ขึ้นกับข้อนี้**
33. **7 compose ไฟล์ประกาศ stateful service ไม่มีใครเทียบกับของจริง** · M · A (inventory) / C (ลบ) · `staging-box-topology.md:145-146` · ทำ inventory พร้อมข้อ 32
34. **gacp-restore-drill postgres container ค้างบน box ตั้งแต่ 2026-08-13** · S · A · ไม่มีใน `staging-box-topology.md:58-66` และไม่มีใน log เลย · ยืนยันผ่าน SSH แล้วจด; stop/rm = ขอ operator
35. **Build-identity ค้าง**: BUILT_AT = repository.updated_at ไม่ใช่ run start (`build-images.yml:95,164`, `deploy-staging.yml:93`, `production.yml:205`); ยังไม่เคย `docker compose build frontend` จริง; font/CSS determinism ไม่ได้ตรวจ · M · B
36. **gate attestation: 22/22 commit หลัง 2026-08-08 ไม่มี evidence/gate/<sha>.json** · M · A · `ls evidence/gate` ไม่มี; registry:30 · ต้องทำก่อน: box checkout pull ถึง HEAD (§5) แล้วรัน `full-gate-on-staging.md`

### Batch B-BACKEND-CLEAN — โค้ดหลังบ้านที่ไม่แตะเงิน/auth (1-2 agent, Tier B)
37. **external-services leftovers** · M · `error-codes.js:1602,1610,1618,1626` source ชี้ dir ที่ไม่มี; `secrets.js:205` SMTP_PASSWORD ไม่มี consumer; `notification-fanout-service.js:753,977` _normalizePhone; `bodyTHHtml:`/`smsTH:` 11+11 ฟิลด์; `generate-env-template.js:44-49` ยังพ่น SMS_API_KEY/LINE_NOTIFY_TOKEN และถูกอ้างใน `rotate-database-credential.md:94`; `incident-response-runbook.md:40,69` อธิบาย breachNotificationService ที่ไม่มี
38. **GET /api/audit + /stats เสิร์ฟ array ใน memory** · M · `routes/api/audit/audit.js:24,75-77,230,305-316` mount ที่ `index.js:281,285`; ของจริงคือ `admin/audit-log.js` → ลบหรือ repoint (ตัดสินเอง: **repoint** เพราะ FE ยังเรียกได้)
39. **legacy route aliases "removed in v4" mount ไม่มีเงื่อนไข** · M · `routes/api/index.js:145-150,284-290` · ต้องทำก่อน: grep caller ฝั่ง FE/Flutter
40. **ENABLE_PROVIDER_LEGACY_ALIAS ไม่ถูกตั้งที่ไหนเลย แต่เก็บ /provider-cms + /wizard + plaintext-areaUnit write path** · M · `index.js:373-376`; grep compose/.env.example = 0 → ลบ
41. **/analytics/trends/plant-types คืน 501** · S · `analytics.js:332-338`; FE ไม่มี caller → ลบ route
42. **fraud-detection stats placeholder ทั้งที่ column มีแล้ว** · S · `application-document.prisma:47` มี verificationStatus; `fraud-detection.js:365-380` ยัง `Promise.resolve(0)` + `countFarms({where:{}})` ทั้ง high/medium
43. **fraud doc-scan GPS-vs-farm dormant** · M · `document-verification-methods.js:50-59` include แค่ documents · ต้องทำก่อน: ยืนยัน linkage ผ่าน ScopeOfWork
44. **attachment-service / attachment.prisma / tracked-writer header โกหก** · M · `attachment-service.js:10-11`, `attachment.prisma:24-27` บอก "no consumer" ทั้งที่ 12 ไฟล์ require แล้ว; `tracked-writer.js:18-21` สัญญา lint rule ที่ไม่มี · ตัดสินเอง: ประกาศ parallel model ถาวร + เขียน header ใหม่ (port ที่เหลือเป็น M แยก)
45. **workflow-event actorName ไม่ออกจาก buildWorkflowEvent** · M · grep actorName `workflow-event-builder.js` = 0; FE fallback `provider-application-detail-config.ts:35-40`, `page.tsx:683,689`
46. **audit-scheduling queue paymentDate = '-'** · S · `audit-scheduling-service.js:303-306` ต้อง join invoice (อ่านอย่างเดียว)
47. **safeErrorMessage allowlist อังกฤษล้วน → ข้อความไทยถูกแทนด้วย generic** · M · `api-response.js:160-165`
48. **CHECKOUT_* ไม่อยู่ใน error-codes catalog** · S · grep `error-codes.js` = 0; โยนที่ `services/checkout/stripe-checkout-service.js`
49. **holiday-blind: working-days-service.js ยังเป็น engine ที่ 2** · M · `working-days-service.js:62` ใช้ `date.getDay()` server-local; `system.js:20,60` และ `cron.js:19,144` ยัง `new Set()` · ต้องทำก่อน: ไม่มี (L-001 SSOT ลงแล้ว) · comment "F1 not yet verified" 3 ไฟล์ → §5
50. **backend .ts ไม่ถูก ESLint เลย** · M · `apps/backend/eslint.config.js` ไม่มี pattern *.ts
51. **proxy-forward.ts จะทำ binary GET body พัง** · S · `proxy-forward.ts:151-170` `.text()` + `String(data)` · ยังไม่มี endpoint binary หลัง /api/auth — ต่ำสุด
52. **farm-access / planting-cycle-service "interim VIEWER floor"** · S · `farm-access.js:43`, `planting-cycle-service.js:285-297,308` · ตัดสินเอง: เปลี่ยนคำเป็น defense-in-depth ถาวร (engine coverage ต่อ permission เป็น L แยก)
53. **legacy shims ที่ยังมี caller** · S · C (payment-service.js ติด keyword) · `payment-closure-job.js:48`, `revision-deadline-checker.js:17` require `shared/workflow-state-machine` (deprecated re-export `:1-10`); `payment-service.js:40` require `./payment-constants` (`:1-17`) · ทำก่อน purge manifest (§4)
54. **Cloudflare IP ranges hardcode ใน nginx + rate-limit bucket เดียว** · M · C (deploy) · `deploy/nginx/gacp-platform.conf:23-27`; `nginx/gacp.production.conf:23-26` · diff เตรียมได้; apply = operator · Origin cert/Full(Strict)/self-signed หมด 2027-06-03 → §5

### Batch B-MONEY-SMALL — แก้เล็กใน path เงิน/auth (agent เสนอ diff + RED/GREEN, **operator merge ทุกใบ** — ไม่ต้องตัดสินอะไร แค่รอ merge) (Tier C)
55. **/api/pricing fail-open** · S · `pricing.js:166-175` catch → `success:true` + default; `:168` `stored || defaultFeesPayload()` → 503/PRICING_UNAVAILABLE · อิง memory "no hardcode fees"
56. **paymentLimiter ไม่ครอบ POST /api/payments/checkout** · S · `server.js:311-314` vs `payments.js:409`
57. **payment-closure-job comment บอก atomic แต่ onAudit ใช้ log() นอก tx** · S · `payment-closure-job.js:274-275,367-368` vs `audit-logger.js:479,505`; `logWithin(event, tx)` มีที่ `:569` → ใช้ logWithin
58. **onAudit fence sweep: emitBestEffortTransitionAudit ไม่มี SAVEPOINT** · M · `application-status-writer.js:582-596` vs FENCE_SAVEPOINTS `:352-366` · `GOALS.md:33`
59. **advisory lock ไม่ปล่อยหลัง ROLLBACK TO SAVEPOINT** · M · `application-status-writer.js:357,402`; pg_advisory ปรากฏเฉพาะ `plant-unit-service/core-methods.js:257` · ทำหลังข้อ 58 (ไฟล์เดียวกัน รวม PR)
60. **'CERTIFICATION_CHECKOUT' literal ซ้ำ** · S · `payment-closure-job.js`, `payment-reminder-job.js` → ใช้ constant เดิม (dup-source ratchet ลง)
61. **getPaymentAuditTrail: 2 OR branch ที่ match ไม่ได้ + comment GIN ผิด** · M · `audit-trail.js:650-667` path filter บน jsonb string (`audit-logger.js:394,221`); `audit.prisma:61` jsonb_ops ไม่ serve `->`
62. **#790 RevisionDeadline EXPIRED/FAILED vocab แตก** · S · `audit.prisma:125` comment ไม่มี EXPIRED vs `revision-deadline-checker.js:166,182` เขียน EXPIRED → แก้ comment/enum
63. **Role-tools F2/F3/F7** · M · `role-middleware.js:39-41` bypass PLATFORM_ADMIN vs `require-admin.js:19-20`; preset ใส่แค่ 'account' ทำ account_dtam/account_platform 403 (`canonical-rbac.js:45-46,82-86`); `audits-reassign.js:45` GET /reassignable providerOnly กว้างเกิน
64. **D6 leaderboard topPerformers เห็นข้ามบทบาท (ISO 17065)** · S · `analytics/work/client-view.tsx:53,206-212,379`; `provider-role-config.ts:169-178` → จำกัด ADMIN ทั้ง routes/navRules + guard backend
65. **credit/debit-note PDF 501 fallback + TODO(B20-B) ค้างทั้งที่ wire แล้ว** · S · ของจริง `invoice-template-service.js:1195,1211`, `journal-entry-service.js:891,899`; ซาก `credit-notes.js:192-199`, `debit-notes.js:158-165`, `credit-note-service.js:757-775`, `debit-note-service.js:580-590`
66. **Input VAT comment "not yet implemented" ทั้งที่ PurchaseInvoice มีแล้ว** · S · `billing.prisma:1152` vs `vat-report-service.js:316-321,486,500,767-768` · recordInputVatEntry ยังไม่มีจริง — เขียน comment ให้ตรง
67. **receipt-auto-sign TODO(B16-A) ค้างทั้งที่ column มีแล้ว** · S · `billing.prisma:91` signatureMetadata vs `receipt-auto-sign-service.js:247-252` · (B17 per-entity key `:200-207` → รวมงาน PKI §3)
68. **uploads-access INTERIM pass-through เมื่อ resolve owner ไม่ได้** · M · `uploads-access.js:335-336,466-473` SESSION_PARITY_UNRESOLVED · fix ระบุในโค้ดแล้ว: dual-write wizard upload ลง application_documents · ID-card image ไม่มี owner row (`prisma-auth-service.js:56,648`, schema grep = 0) รวม PR เดียว (schema expand)
69. **AR aging collection-action ปุ่ม disabled รอ endpoint X4.5** · M · `ArAgingReport.tsx:337`; grep reminder|mark-collected ใน finance routes = 0 · ตัดสินเอง: **เอาปุ่มออกก่อน** (Tier B, S); endpoint จริงไว้ §3
70. **Application visibility Phase 20 sweep** · M · `application-visibility.js:18-23`; helper ใช้แล้ว 9 ไฟล์ · ทำ inventory ของ provider reads ที่เหลือ → ปิดที่ยังรั่ว

### Batch B-WIZARD — ใบสมัคร (1 agent, Tier B, **view-pack บังคับ**)
71. **A9 dead conditionals DEMO_MODE/canProceedFromStep/quote-step comment** · S · `application-navigation.tsx:2,214,436`; 20 hits DEMO_MODE ใน app/health/applications/**; `use-application-flow-store.ts:210-214,306`; `application-step-page.tsx:35-39` · ทำก่อนเพื่อให้ข้อ 72-73 diff เล็ก
72. **A8 ปุ่ม Next + checkbox consent/invoice ไม่ใช้ primitive** · M · `application-navigation.tsx:53-64` raw button; `consent-step.tsx:74,99`, `invoice-step.tsx:256`
73. **A7 card-in-card + "1) 2) 3) 4)" prefix** · M · `plant-selection-config-panels.tsx:82,243,300,422`; `farm-info-step.tsx:621`, `production-info-step.tsx:268`
74. **A10 fetch config 2 ครั้งต่อ step** · S · `_steps/layout.tsx:66` + `application-step-page.tsx:212`; backend mount `index.js:123` vs `applications.js:433` — ต้องดู mount order ก่อนยุบ
75. **C3/W3-3 ลบ submit-step.tsx + wizard-context.tsx + SUBMISSION_PHASE_GUIDE** · S · ไฟล์อื่นของ cluster หายแล้ว; 2 ไฟล์นี้ importer = 0; `documents-step-config.tsx:482` ไม่มี consumer
76. **W2-8 ยุบ 2 renderer เป็น ApplicationDocumentView** · M · `review-step.tsx:11,335` ยังใช้ OfficialApplicationDocument; `feature/official-application-document.tsx` + `feature/index.ts:8` · คง preview ทั้ง 2 หน้า (`s01-register-submit.spec.ts:270-274`)
77. **FE dead code: translateError, DashboardSidebar, ChangeRoleModal local ROLE_OPTIONS** · S · `error-translator.ts:5-11` "DEAD AT RUNTIME"; `dashboard-sidebar.tsx` importer 0; `ChangeRoleModal.tsx:57` vs `lib/constants/admin-role-options.ts` · (ส่วน dashboard-sidebar ทับ Ruling 3 "ไม่ลบรอบนี้" → ถ้ายังไม่ยก ให้ทำแค่ ROLE_OPTIONS + translateError)
78. **plot/farm areaUnit FE: ไม่มี unit control, 'Sqm' hardcode, errorsByStep ไม่มีใครอ่าน, heal note ดูเหมือน review comment, canonicalise 3 ก๊อป, PDF unit label ตายตัว, growingArea ไม่ validate** · M · `farm-info-step.tsx:252,387`; `provider/applications.js:104-114`; `area-utils.js:55` / `canonical-application-validator.js:75` / `heal-plot-area-unit.js:145`; `application-template-service.js:79`; `certificate-service.js:593`; `canonical-application-validator.js:272-285` ข้อความส่งไปหาเจ้าหน้าที่ · (ข้อ 70+155+189 ของรายการตั้งต้นรวมเป็นข้อนี้)
79. **todayChecked hardcode 0** · S · `application-service.ts:67`
80. **M5 ตรวจว่าใบสมัครที่ยื่นแล้วหายเมื่อสลับ workspace หรือไม่** · S (กดจริง 1 ครั้ง) · `application-identity-methods.js:222-228` scope สลับตาม header · ส่วน persist server-side = column ใหม่ Tier C → §3

### Batch B-PLANTING — การปลูก/T&T ส่วนที่ไม่รอแผน W2-1 (1 agent, Tier B, view-pack)
81. **B4/W2-2 FE cert gate บน /health/planting + B14 readiness ลิงก์ไป planting** · S · `planting/layout.tsx` 5 บรรทัด pass-through; `readiness/client-view.tsx:207` · backend ยัง validate ที่ createCycle
82. **B2/W1-9 ปุ่ม "ดูรายต้น" 5 ปุ่ม + tab units + upgrade card** · S · `section-a-overview-plots.tsx:226,280`, `section-b.tsx:281,318`, `section-a-units.tsx:203`, `client-view.tsx:433-459`, `planting-cycle-detail-page-config.ts:47` · capability ปิดอยู่แล้ว (`capabilities.ts:25`) ไม่ติด Q5
83. **B8 2 ตารางเรนเดอร์แถวแปลงเดียวกัน** · S · `client-view.tsx:54,295` consumer เดียว → ยุบได้ (B7 restructure 6 tab → §3 W2-1)
84. **B3 ช่องค้นหา trace สาธารณะ resolve PLANTING_CYCLE_PLOT ไม่ได้** · M · `resolve-generic.js:57` มีแค่ comment; `resolve-plot-cycle.js` มี gate 410 แยก
85. **01-B2 trace แปลง-รอบปลูกนับต้นจาก plantUnit แทน plannedPlantCount** · S · `resolve-plot-cycle.js:186-195` · RED-first
86. **H1/H3/H4: QR /verify/farm/:id ตาย; น้ำหนัก batch แก้ได้ไม่ re-sign; 'Raw Material (GACP)' hardcode** · M · `farm-service.js:357` vs ไม่มี `app/verify/farm`; `trace-batch-lot-routes.js:116,254`; harvest-service.js ไม่มี registerTraceIntegrity
87. **W1-2 consumer ที่ตั้งใจเว้น: documents/farm-info/review step + slip-upload-modal ไม่ใช้ useSignedFileUrl; Flutter ไม่เรียก signed-url** · M · grep = 0 ใน 4 ไฟล์; `apps/mobile-app` grep 'signed-url' = 0 · slip-upload = เงิน → แยก PR Tier C
88. **A10 /api/version ยัง '3.0.0'** · S · `routes/api/index.js:437-441`; /health มี build แล้ว (`:383-400`) → wire buildInfo() (เช็ค `production-smoke.test.js:192`)

### Batch B-NAV — nav/shell ที่ Ruling 3 สั่งแล้ว (1 agent, Tier B, view-pack)
89. **D1/D2/W2-3 BackHomeCrumb ระดับ shell + /help มีทางกลับ** · M · render เฉพาะ `health/status/client-view.tsx`; `app/help/` ไม่มี layout.tsx · **ต้องเสร็จก่อน D5/W2-4 และ W3-8**
90. **C7/W2-5 officer bottom nav จาก nav-config + แถว secondary ต่อ role + test nav ⊆ route** · L · `dashboard-layout.tsx:83,221`; `nav-config.ts:160-178` secondary เฉพาะ FARMER; `nav-config.test.ts` grep route = 0 · Q3 (landing ทุก role) ไม่บล็อก · **ต้องเสร็จก่อน C6/W3-6**
91. **W3-8 ย้าย 6 เครื่องมือ (site-analysis/training/sop-templates/sop-builder/reports/documents) เข้า FARMER_NAV secondary แล้ว retire /health/start, /readiness, /health/more** · M · `nav-config.ts:160-178`; `carpet-pages.spec.ts:34,39` ต้องแก้ใน diff เดียว · ยกเว้น "สรุปยอดลูกค้า" → §4 Q2
92. **E5 คำ "ภาพรวม/แดชบอร์ด" ที่เลิกใช้ + emoji icon** · S · `admin/dashboard/page.tsx:135-137`, `provider/calendar/client-view.tsx:78,182,203`; 14 บรรทัดใน src/app · grep test ที่ assert literal ก่อน
93. **tile-home minors: fetch /auth/provider/me ซ้ำ; planting tile กดได้ก่อน prefetch** · S · `provider/home/client-view.tsx:119` + `provider-layout.tsx:48`
94. **D12 chip bg-amber-50 ไม่มี dark: + บันทึกเหตุผล radius** · S · `nav-tile.tsx:84`, `health/status/client-view.tsx:215`
95. **E3 isDark อ่าน localStorage ไม่มี storage listener** · S · `renewal/client-view.tsx:143,164`, `documents/[id]/client-view.tsx:29,33`
96. **E4 no-thai-letterspacing พลาด tracking-[0.08em]** · S · `no-thai-letterspacing.js:16-17`; `application-list.tsx:39`, `data-table.tsx:318`, `primitives/table.tsx:63` · ต้อง --selftest; ไม่เพิ่ม uppercase
97. **C12 feature flag 6-7 key ไม่มี call site** · S · `use-feature-flag.ts:12-22`; call site จริงมีแค่ plant_unit_tracking + FeatureGate generic · grep `<FeatureGate flag=` + admin/settings ก่อนลบ
98. **D7 interim: ค่า default ช่องเชิญสมาชิก national-ID → phone** · S · C (identity) · `members/page.tsx:69,221,229` · บรรทัดเดียว สอดคล้อง org-model memory; redesign เต็ม → §4 Q1

### Batch B-CERT-FAILCLOSED — ใบรับรอง (design ตัดสินแล้วใน Ruling 2; Tier C operator merge)
99. **D5 / hash-only swallow: PKI fail ต้องไม่ออกใบ** · M · `certificate-service.js:438-454,1064`; `signature-service.js:32-42` fail-loud เฉพาะ passphrase · RED: ลบ keys/ → issuance ต้อง throw (ไม่ใช่ออกใบ signed:false)
100. **Stateless §5 step 2-3: public key บน Certificate row + backfill; key เป็น read-only secret mount; production ไม่ boot ถ้าโหลด key ไม่ได้ + fingerprint guard** · L · `certification.prisma:107` มีแค่ signatureKeyId; `signature-service.js:345-356` generate ใหม่เงียบ; `docker-compose.production.yml:558` volume ไม่ใช่ secret · expand-first · ทำก่อนข้อ 101 (rotate ปลอดภัยต้องมี public key บน row ก่อน)
101. **Rotate 2 key pair บน box (private.pem เคยอยู่ใน build context)** · M · repo ปิดแล้ว (`.dockerignore:42-63`); box checkout a30c9e5f ยังก่อนหน้า; ไม่มี log rotate · on-box + operator
102. **Platform-audit C5: issuance สร้าง HarvestBatch placeholder freshWeight 0 ที่ได้ QR จริง** · M · `certificate-service.js:869-877` · ขัด R1/R3 · รวมกับแผน W2-1 แต่ diff ลบได้เลย (RED: cert ใหม่ต้องไม่มี batch)

### รายการเดี่ยวที่ทำเลยได้ (ไม่เข้า batch)
103. **A8 notification audit — พิสูจน์ in-app fanout 4 จุด** · M · B · `ls evidence | grep notif` = 0; ช่องทางนอกถูกถอดแล้ว (4b59175b) → scope = in-app เท่านั้น (`application-status-writer.js:143` จุดหนึ่ง) · รันบน DB จริง + view-pack
104. **A9 /verify: QR จริง** · M · B · HEAD `verify/[cert-number]/page.tsx:215` ยังเป็น icon lucide; fix อยู่บน branch `fix/real-qr-codes` (uncommitted: QrImage + test) → ทำให้จบ + rate-limit/enumeration/PDPA ตรวจต่อ; public exposure → §5 (P0-2)
105. **QUEUE deferred audits: DEMO-READINESS, SURVEY-AUDIT, TRACE-AUDIT** · L · A · `QUEUE.md:306-307,315` เงื่อนไขเลื่อน (Golden Path เขียว) ผ่านแล้ว; TRACE-AUDIT ส่วนหนึ่งถูก R1-R8 แทน · read-only
106. **QUEUE A2/A4/A5/A6 compose env_file DATABASE_URL, ลด root, runbook §12.7, ถอด seed-test-data.js** · M · C · `docker-compose.production.yml:89`, `staging.yml:73` inline; `seed-test-data.js` ยังอยู่ · diff เตรียมได้, merge+run = operator
107. **areaUnit heal บน gacp_staging/gacp_db ของ box** · S · C (data) · evidence มีเฉพาะ Phase-0 DB · dry-run ได้หลัง box pull HEAD; apply = operator
108. **Accounting XLSX export** · M · C · `accounting-service.js:305-309` · ต่ำสุด รอจนกว่าบัญชีขอ

---

## 3. ทำถัดไป (ต้องมีสเปก/แผนก่อน)

| # | งาน | tier/effort | สเปกที่ต้องมี | หลักฐานเปิด |
|---|---|---|---|---|
| 1 | **W2-1 แผน implement planting/T&T R1-R9** (+R10 addendum) | A · M | เขียนได้เลยสำหรับ R1-R9; R10 รอ Q10-1..4; ส่วน B15 รอ Q5 (§4) | `ls docs/superpowers/plans \| grep plant` ว่าง; addendum ยัง untracked; ไม่มี BatchLabResult |
| 2 | **B5/B6 /health/planting/new** seed จากฝั่ง farm + ฟิลด์ R7 (variety, water, coords, district, plot name, method) | C · L | จากแผน #1 (schema columns + validator) | `planting/new/client-view.tsx:59-61,188` |
| 3 | **B7 detail page 6 tab/5 header/4 modal** | B · M | จากแผน #1 | `planting-cycle-detail-page-config.ts:47` |
| 4 | **M1/M3/M4/M6 schema**: Plot.code + backfill; plotId บน HarvestBatch; cycle↔plot link เดียว ถอด plotName/plotArea; ถอด User.entityType; PLOT_HARVEST_META_PREFIX ประกาศ 2 ที่ | C · XL | แผน #1 + expand→backfill→contract คนละใบ | `farm.prisma:219`, `harvest.prisma:8,54`, `cultivation.prisma:27-33,90-107`, `auth.prisma:13`, `planting-cycle-service.js:628` vs `trace-service/common.js:33` |
| 5 | **B10 5 หน้า trace สาธารณะซ้ำกัน** | B · L | spec หน้า trace เดียว (รักษา applicable:false `resolve-generic.js:54-68`) | 5 client-view ใต้ `app/trace/` |
| 6 | **D2 ย้าย mint cert+QR จาก AUDIT_PASSED ไป CERTIFIED atomic** | C · L | spec state-machine (ruling 2026-08-04 `QUEUE.md:284`) + RED | `application-status-writer.js:140-143,967` |
| 7 | **A7 AUTHZ matrix role×endpoint + negative test + evidence pack** | C · L | นิยาม matrix จาก canonical-rbac | 74 test มี 403 แต่ไม่มี matrix artifact |
| 8 | **B2 reopen mechanism**: reopenedFrom self-relation + endpoint + conservation test บน Postgres จริง | C · L | spec R2 mech 2 (`QUEUE.md:296`) | grep reopenedFrom/reopen = 0 |
| 9 | **Remittance pipeline**: ไม่มีใครเรียก recordRemittanceToDtam | C · L | spec: ใครสั่ง remit, บนหลักฐานอะไร — record-only (L3) | `journal-entry-service.js:921,1518` |
| 10 | **Settlement-resilience follow-ups**: closure-guard↔settle TOCTOU, reconcile DEAD_LETTER skip+orderBy, EXPIRED-app-with-succeeded-PI detector (ทำก่อน), real-DB atomicity, Family A/B, legacy-role cleanup | C · L | spec ต่อข้อ (source ยัง untracked `.superpowers/sdd/2026-08-16-…/progress.md:96-98` → commit ก่อน) | `settlement-reconcile-job.js:87,107`; detector grep = 0 |
| 11 | **Submit document gate**: per-applicant-type required docs (JURISTIC ตัดสินแล้ว), FE IND_/COM_/JUR_*→BE slot bridge, /pre-submission ไม่มี auth | B · L | spec mapping + required-doc table | `canonical-application-validator.js:67-69,389-392`; `validation.js:96` |
| 12 | **C11/W2-6 stage model เดียว** (stage-map 5 vs health-dashboard-stage 9) แล้ว W2-7 รวม /health/applications เข้า /health/status | B · L | spec stage model; backend pin `shared/health-dashboard-stage.js` ย้ายก่อน | ทั้ง 2 ไฟล์ยังอยู่ + 3 consumer |
| 13 | **C9/C10 formatThaiDate 14 นิยาม + 12 export ไม่ใช้ + toLocaleDateString null-unsafe 51 บรรทัด** | B · L | แค่ลำดับ: ไฟล์ accounting/finance แยก PR Tier C | `lib/utils.ts:21,33`, `format/thai-date.ts:18`, `utils/thai-date.ts:9-57`, page-local 9 ที่ |
| 14 | **E2/W2-10 raw slate/zinc/gray 130 ไฟล์ + bg-white (QR page ขาวบนขาวใน dark)** | B · L | ขยาย no-raw-color + baseline ใหม่ (baseline = operator L4) | `no-raw-color.js:39` จับแค่ hex; `trace/[qr-code]/client-view.tsx:73,88,171` |
| 15 | **E6 modal มือ 13 ไฟล์ → Dialog primitive** | B · L | ลำดับ: money (slip-upload, payments) + auth (force-status, ChangeRole, UserDisable) แยก Tier C | 13 ไฟล์ role="dialog" |
| 16 | **E7 raw `<select>` 20 ไฟล์ → Select primitive** | B · L | sentinel แทน value='' | 20 ไฟล์ |
| 17 | **D8 scheduler เลือก auditor: การ์ดเทียบ area/workload/availability + assignee บนแถว queue** | B · L | spec + endpoint workload ใหม่ | `scheduler/queue/` grep workload = 0 |
| 18 | **A3 alerts จริง** (DB auth fail, container restart, health red, backup >25h) + grep-pin round 2 | C · M | spec rule ต่อข้อ + พิสูจน์ยิงบน box | `monitoring/prometheus/alerts.yml` 19 rule, grep auth/restart/backup = 0 |
| 19 | **Audit-chain alert wiring + weekly full scan** | B · M | เลือก alerting target (in-country ตาม comment; residency ยกชั่วคราวตาม memory) | `audit-trail.js:727-735,855,886`; `scheduler.js:219-222` |
| 20 | **G2 NODE_ENV polarity: strict ทุกที่ยกเว้น dev/test** | C · M | ตาราง env × flag ก่อน (staging ตอนนี้ถูกนับ non-production) | `server.js:78,163`, `secrets.js:49,435,467`, `docker-compose.staging.yml:63,179` |
| 21 | **green-mask baseline 15 → 0** | A · L | รายการ assertion ต่อไฟล์ | `green-mask-baseline.json` รวม 15 |
| 22 | **C2-C5: DTAM pull API, PDPA retention 5 model legalHold (C3), MOPH adapter, UAT go-live checklist** | C · XL | C2/C4 รอ spec ภายนอก (§5); C3 + C5 เขียนได้ | `pdpa-retention-job.js:39-41` |
| 23 | **Reminder retry policy** (backoff ×3 → FAILED row → แจ้ง staff) | C · M | ตัดสินแล้ว (`BACKLOG-FOUND.md:13`) — เหลือแผน | `payment-reminder-job.js` grep backoff/FAILED = 0 |
| 24 | **Plan 2026-08-13 close-renewal-online-path ไม่เคยรัน** | C · L | แผนมีแล้ว 0 `[x]` — รันแผน (แตะ payment UI + Flutter + openapi) | `renewal/client-view.tsx:15-18` |
| 25 | **staging.gacpth.com ข้าม Docker nginx** — รูป nginx production ไม่เคยถูกทดสอบ | C · L | runbook re-route + ทดสอบบน box | `staging-box-topology.md:40-42,142-143` |
| 26 | **M5 persist applicant entity ล่าสุดฝั่ง server** | C · M | column ใหม่ — หลังกดจริงข้อ §2-80 | grep lastActiveEntity = 0 |
| 27 | **Subscription renewal cron / plan change** | C · L | product decision ก่อน (§4) | `subscription-order-service.js:20-22,128-129`; `scheduler.js:115-146` |
| 28 | **WHT service stub** | C · L | product decision ก่อน (§4) | `wht-service.js:5-10,501-505` |
| 29 | **AR aging endpoints X4.5 จริง** (หลังเอาปุ่มออก §2-69) | C · M | spec reminder/mark-collected | — |
| 30 | **Q6 page-header component เดียว** (SummaryHeader 51 / PageToolbar 20 / LaunchpadHeader 7) | B · L | รอ Q6 (§4) แล้วเขียน test ใหม่ 4 ตัว | grep นับวันนี้ |
| 31 | **Stateless §5 step 4-5 / 6-7 / 8-10 / 11-14** | C · L-XL | เรียงหลัง step 0 (§2-32) และ 2-3 (§2-100): PDPA encryption+backfill; compose→Supabase พร้อม dump/restore parity; auth state → Postgres dual-write แล้วถอด Redis (+ทบทวน Ruling 1); S3 หลัง interface เดิม + migrate ไฟล์ sha256; contract compose ถอด postgres/redis/minio/pgadmin | `production.yml:89,157,227,290,333,370,549-558`; `storage-service.js:203`; `token-revocation-service.js:58,121`; `env-validator.js:12-16` |
| 32 | **no-skip: เผา 10 conditional skip + 21 describe.skip ไฟล์ + 11 e2e test.skip** | B · L | ต้องมี DB ใน gate (box full-gate) ก่อน | registry:24 waiver ถึง 2026-09-15 |

---

## 4. ต้องตัดสิน (คำถาม → ทางเลือก → ปลดอะไร)

คำถามที่เหมือนกันรวมเป็นข้อเดียว · ข้อที่เขียน **(ตัดสินเอง)** = ไม่ต้องรอ operator, เราชี้ขาดได้เพราะไม่ใช่กฎ/เงิน/สิทธิ์ แต่บันทึกไว้ใน HARNESS_LOG ก่อนทำ

**Q-RULES — operator ต้องยืนยันเป็นลายลักษณ์อักษรว่า "เป็นงานเราทั้งหมด" รวมถึงการแก้ไฟล์กฎ (L6)**
- คำถาม: agent แก้ CLAUDE.md / HARNESS.md / probe-registry.txt / AUDIT_LEDGER baseline ได้ไหม และใครเป็นคนเซ็น cover row
- ทางเลือก: (a) operator ยืนยันเป็นข้อความในชั้นนี้ → agent ร่าง diff ทุก D-xx, operator ยัง merge (b) ไม่ยืนยัน → agent ร่าง PR เฉยๆ รอ
- ปลด: D-01..D-25 (`operator-decisions.md:20-44`, `HARNESS_LOG.md:247`); แถว manual-until 2026-09-15 ทั้ง 4 — settle-webhook-only/webhook-idempotent (registry:37-38, ci.yml:335 ไม่มี prisma generate และ runner ตาย → ต้องเขียนเหตุผลจริงหรือ wire local-gate), tier-check (registry:39-40 + `check-done.sh:12` DEFAULT ไม่มี tier-check), report-integrity (registry:51, probe พร้อมแล้ว รอเลือก target) — **probe-gate จะแดง 2026-09-16**; ratchet ขยายไป .ts/.tsx/web-app/modules/controllers (`ratchet.sh:17,25,30,51`) + env-direct pattern กว้างขึ้น (baseline ต้องขึ้น = operator); dup-source baseline 4→2; no-skip waiver L-006 (renew หรือเผา §3-32); money-write-guard allowlist (HARNESS.md:98) ต้องมีลายเซ็น

**Q-RUNNER — GitHub Actions: จ่าย billing หรือประกาศ self-hosted อย่างเดียวตลอดไป**
- ทางเลือก: (a) จ่าย → G0 ข้อ 1-2 ติ๊กได้, hosted job กลับมา (b) self-hosted only → ย้าย/ลบ 13 workflow (§2-30), กด **Runner Dispatch Probe** (`runner-dispatch-probe.yml`, ไม่เคยกด) เพื่อพิสูจน์ว่า runner รับ job ได้
- ปลด: `GOALS.md:25-26`, L-004, CI เขียวบน runner ครั้งแรก, REQUIRE_DB, RLS coverage probe อัตโนมัติ, branch protection (`branch-protection-setup.md:3-6` — ขัดกับวิธี merge `git push <branch>:main` ของ operator ต้องเลือกอย่างใดอย่างหนึ่ง)

**Q-DELETE — ยก Ruling 3 "ไม่ลบไฟล์รอบนี้" หรือยัง**
- ทางเลือก: (a) ยกแล้ว → ลบเป็นชุดพร้อมแก้ `carpet-pages.spec.ts` ใน diff เดียว (b) ยังไม่ยก → เหลือแค่ inventory
- ปลด: C1/C2/C13-C16 9 ไฟล์ (ui/card, badge, primitives/index, dashboard-sidebar, nav-overflow, quick-actions, auth/health terms+privacy, kpi-tile-semantics) + no-restricted-imports ต้องออกแบบใหม่เพราะ `eslint.config.mjs:136-146` ชี้คนไป primitives; C4 audit-field-tools cluster (re-grep consumer ก่อน); B12 /health/tracking (`carpet-pages.spec.ts:39-40`); AuditFieldToolsPanel (`audits/[id]/page.tsx:505-510` ลบ vs re-wire GPS); legacy-sweeper purge manifest ~400 บรรทัด (`2026-08-16-dead-code-inventory.md:162-184` — DESTRUCTIVE PR, แตะ auth middleware + billing = Tier C); C5 dashboard/client-view + status-mapping (หลัง W2-6 + ตัดสิน port nextAction); C6 healthNavigation/LEGACY_ONLY_NAV (หลัง W2-5)

**Q5 — PlantUnit/QR รายต้นอัตโนมัติทุก cycle (R8) vs harvest gate 3 ข้อที่ต้องการ unit**
- ทางเลือก: (a) ถอด gate 3 ข้อ (`planting-cycles-activity-harvest-routes.js:259-278`) + default autoGenerateUnits=false + DTAM schema MAJOR bump (b) คง unit เป็น optional ภายใน ไม่โชว์ผู้ใช้
- ปลด: B15/O3, W2-1 section นั้น, copy "ต้นไม้รายต้น" · flip default อย่างเดียว = harvest พัง ห้ามทำก่อนตัดสิน

**Q-PLANTING ย่อย**: Q10-1..Q10-4 (addendum R10 plot-tag mobile) · Q7 การ์ด 1669/FDA บน trace สาธารณะเป็นข้อกฎหมายหรือ design (`trace/[qr-code]/client-view.tsx:405-414`, `trace.js:4-7`) · O5 คำ "ชุดบรรจุ" vs ล็อต (ฉลากพิมพ์แล้ว `lot-label-template-service.js`; ล็อต 20 ไฟล์/ลอต 2/ชุดบรรจุ 2) — ตัดสินแล้วค่อย normalize ล็อต/ลอต · O7 FAIL ข้อ 10.1 ควรบล็อกใบรับรองไหม (`onsite-evidence-gate.js:102-109` นับแถวอย่างเดียว)

**Q-NAV/COPY**: Q1 ฟอร์มเชิญสมาชิก (`members/page.tsx:69-229`) — interim phone default ทำได้เลย §2-98 · Q2 tile "ธุรกรรมการเงิน" ไป slip-review (`nav-config.ts:248-262`) — rename descTH ทำเลยได้, ledger จริง = Plan 2 Tier C; แก้ citation D1/D4 ใน 00-CONSOLIDATED · Q3 landing ทุก role (`provider-role-config.ts:242` [ADMIN, ACCOUNT]) · Q6 header component เดียว · Q8 คุณ/ท่าน ทั้ง product (11 ไฟล์ health ยัง "ท่าน"; erasure/ คง "ท่าน" ตาม PDPA) — em-dash ใน string ผู้ใช้ฝั่ง backend ทำเลยได้ (`entity-service.js` ส่วนใหญ่ comment) · C8 /provider → /provider/dashboard 2 hop (`provider/page.tsx:6`) **(ตัดสินเอง: เรียก providerLandingPath ที่ root ถ้ามี role ฝั่ง server; ไม่มีก็คง)** · auditor pages /provider/appointments, /audit-history ต้องการไหม (`nav-config.ts:188-194`) · O2 ลิงก์ "สร้างผู้ยื่นใหม่" ใน header กลับมาไหม

**Q-AUTH/IDENTITY (Tier C ทุกข้อ)**: O1 Certificate ไม่มี entityId (`certification.prisma` grep = 0) read-scope ตาม user หรือ entity/farm → M2 migration · O4 นิติบุคคลลงทะเบียน first-come vs เจ้าหน้าที่ยืนยัน (`2026-08-15-m1.5-hardening-design.md:23`) · /prepare เขียน entityId ทับแถวเดิมได้ (`applications.js:1054-1057`) ควรไหม · issueRefreshToken/revokeRefreshToken ตอน Redis ล่ม (`prisma-auth-service.js:529-532`; W1-5 §1.2; Ruling 1 ครอบแค่ access token) **(operator มอบให้เราแล้ว — เสนอ: login คืน 503 AUTH_STORE_UNAVAILABLE, logout best-effort + log)** · F6 auditor ถือ S2+S4-S6 maker-checker (ISO 17065) · X3.5 final-approval queue visibility + auditor CAR comments textarea disabled (`application-provider-query-methods.js:621`, test `aud-fa-obv-decision-flag.test.js:72` ล็อก TODO ไว้) · HIBP password (`password-policy.js:13-15`) **(เสนอ WONTFIX: password เป็น factor ชั่วคราว + เป็น network call ต่างประเทศ)** · seed-approve.js/e2e-controller.js สร้าง evidence จริงหรือปล่อย block (`seed-approve.js:33,48`, `e2e-controller.js:356,421`; HARNESS_LOG.md:266) · secret backends vault/aws/azure stub (`secrets.js:361-378`) **(ตัดสินเอง: ลบ stub, เอกสารว่ามีแค่ env/file)** · grace flags LEGACY_*_GRACE_UNTIL ถอดได้ไหม (ทุก env ไม่ได้ตั้ง `.env.example:55,58`) · ENABLE_OCR_BYPASS (`prisma-auth-service.js:131,656`) ถอดพร้อม password retirement · legacy ACCOUNT role (ต้องรัน `migrate-account-role.js` แล้วนับ 0 บน DB จริง) · user-lookup plaintext fallback (`user-lookup-service.js:155-163` ต้องนับ NULL healthIdHash บน prod = 0) · EntityServiceDelegation (`entity.prisma:19-22` หลัง RLS, เมื่อ use case มา)

**Q-MONEY (L3: เสนอ diff เท่านั้น, operator merge)**: fee SSOT — อ่านจาก `GET /api/pricing/fees` ไม่ใช่ re-alias constant (A11 `plant-selection-config.ts:274`, `renewal/types.tsx:18`, `constants/fees.ts:12-27`, `payment-fees.js:15-35`) — ทิศทางตัดสินแล้วโดย memory rule, เหลือ merge · 3 money leaks หลัง submit: เหลือ leak (3) quotation fire-and-forget (`applications.js:986-995`) + นโยบาย refund on doc-fail / SLA หลังจ่าย / withdraw refund · refund ใน Invoice.metadata.refund (`refund-service.js:163-172`) คง JSON หรือ migrate · WHT implement หรือ park ทางการ · subscription อยู่ใน scope ก่อน ministry prod ไหม · retire bank-transfer rail + cutoff date (D1) — drain-complete ถึง 0 ไม่ได้ถ้าไม่ตัดสิน (`payment-service-phase-flow.js:205` ยังเขียน BANK_TRANSFER; SLIP_UPLOAD_ENABLED ไม่มีในโค้ด; mobile ไม่มี Stripe H17) · assignment ledger @@unique (`work-distribution-ledger.prisma:20-38`) natural key คืออะไร **(เสนอ WONTFIX + ลบ comment)** · ALLOW_PENDING_SECRETS (`boot-secret-guard.js:151`, `production.yml:113`) ถอดตอน financial cutover · PDPA deferred columns + emailHash (`prisma-pdpa-extension.js:166-170,868`) cutover เมื่อไร · schema legacy: certificationPurpose (5 reader), Certificate.standardId, billing legacy trio B16-D — contract migration ทีละใบ

**Q-GOV อื่น**: ADR-017 deploy pipeline ratify (promote `ci.yml:1085` if:false — agent แก้ comment ให้ชี้ ADR-017 ได้เลย, S) · second reviewer Tier C (`GOALS.md:51`) · waiver-coexist role (รอจดหมายนิติกร — จริงๆ คือ §5) · Sunset endpoint 2026-12-31 ถอดก่อนได้ไหม (`…harvest-routes.js:217`, `…unit-plot-routes.js:154`) · area-utils LEGACY_UNIT_TO_SQM ลบได้เมื่อยืนยัน migrate-area-to-sqm.js รันครบทุก env (11 ไฟล์ยัง import) · L-001 F1 comment 3 ไฟล์ ลบได้เมื่อ operator ยืนยัน staging ไม่มี holiday row/env ตั้งมือ · waiver/probe ข้อที่ "หนี้จ่ายแล้ว" → agent ลบเองได้ตาม L6 เมื่อ probe-gate ชี้

---

## 5. ติด probe / ภายนอก — เหตุการณ์ที่ปลดล็อกแน่ชัด

| สิ่งที่ติด | ปลดเมื่อ | งานที่รออยู่ |
|---|---|---|
| **Deploy (L5 operator เท่านั้น)** | operator รัน `build-images-on-the-box.md` + pull checkout `/opt/gacp-platform` (a30c9e5f) ถึง HEAD | staging image fd61813835f3 ตามหลัง 222 commit; production 686 commit ไม่มี deploy order; gate attestation §2-36; areaUnit heal box §2-107; full-gate บน box; evidence/gate ที่ค้างบน box ไม่เคย commit |
| **drain-complete probe** (registry:44-45 manual/operator, ต้องต่อ production DB) | operator รัน probe แล้ว commit output ใต้ evidence/ **และ** ตัดสิน D1 bank-transfer | drain stored-'overdue' → derived OVERDUE (`invoice-service.js:66,263,268`, `ar-aging-service.js:189`); retire NEXT_PUBLIC_CHECKOUT_UI_ENABLED + ลบ `/health/payments/checkout` SDK-less view (flag default false แล้ว `Dockerfile:59-60`); payment wave 3-4 PromptPay-only ส่วน live (C1); wizard payment step 10/12 |
| **money-equation probe** (registry:45 operator) | operator รันบน DB จริง ≥1 ครั้ง | G1 box `GOALS.md:32-36` → **G1 hard gate: ห้ามตั้ง live payment key** จนครบ (L3) |
| **BORA ThaiD sandbox credentials (T-SBX)** | operator/BORA ส่ง api_key/client_id/client_secret ตาม `thaid-sandbox-smoke-runbook.md §1` | B3 smoke ครั้งแรก (ไม่เคยเรียกเลย); AUTH-01 P3-P5 ส่วน B1-CRED; login-chooser BLOCKER copy (`login-chooser.tsx:240-246`) |
| **หมอพร้อม / Health ID docs** | สำนักสุขภาพดิจิทัลส่ง spec | AUTH-01 P3-P5 ส่วน Provider ID linking D-MANUAL-HASHCID, farmer Health ID |
| **DTAM / MOPH spec** | หน่วยงานส่ง API spec | C2 DTAM Next pull, C4 MOPH adapter |
| **จดหมายนิติกร** | กรมตอบคำถามชุดนิติกร ข้อ 4 (+waiver-coexist) | terminal-letter appeal window/channel (`terminal-letter-template.js:18-24`); waiver-coexist role-definition (`QUEUE.md:22,295`) |
| **เครื่อง production จากกระทรวง** | กระทรวงส่งมอบเครื่อง | G3 แยก production จาก staging/runner + runner ออกจาก docker group; residency rule กลับมาบังคับ |
| **Cloudflare dashboard** | operator ใส่ WAF skip ให้ 43.134.175.51 | deploy-drift prod rows เลิก "could not reach" (`HARNESS_LOG.md:236`, registry:50) |
| **Secret rotation (L2 agent อ่าน/ตรวจไม่ได้)** | operator rotate แล้ว append HARNESS_LOG | JWT_SECRET ก่อน pilot; Stripe test key ถ้าเคยส่งนอกช่อง (`HARNESS_LOG.md:204`); signing key 2 คู่บน box (หลัง §2-100) |
| **RLS Phase 2-3 (reviewer#2 + operator cutover)** | operator รัน `rls-phase1-gacp-app-cutover.md §2-4` บน box (role+password) + reviewer#2 เซ็น Phase 2 plan | policy ยัง SELECT TRUE (L-010/032/033); RLS_SHADOW_GUC default off + Phase-0b SET LOCAL (`tenant-prisma-extension.js:262-275`); Phase E.2 by-id defense; Phase-0 deferred minors; coverage probe registry row |
| **GitHub (ต้องมี gh/เครือข่าย)** | session ที่มี gh หรือ operator ดู | PR #560/#766/#680/#554/#461/#818 สถานะตั้งแต่ 2026-08-06; B4 remove defaults / B5 seed demo (#766 รอ prisma generate + login codes); #554 แตะ CLAUDE.md = operator |
| **Cert-hash backfill #804 (live-DB migration)** | operator รัน backfill script (ยังไม่มี script) หลัง PKI fix §2-99/100 | legacy cert อ่านเป็น UNSIGNED (`certificate-service.js:91-92,1032-1035`) |
| **Host-side TLS** | operator บน box/Cloudflare | Origin cert + Full(Strict); self-signed หมด 2027-06-03 ไม่มี auto-renew |
| **restore drill + backup cron** | operator จับเวลา restore 1 ครั้ง + พิสูจน์ cron ยิงบน host | G3/A12 (L-013/L-040/L-041) ส่วนที่เหลือจาก §2-27 |
| **Public /verify exposure (P0-2)** | operator เงื่อนไขใน `BACKLOG-FOUND.md:73` | เปิด /verify สาธารณะ |

---

## 6. ปิดแล้ววันนี้ / ตัดออก (ห้ามเปิดซ้ำ)

**FIXED บน HEAD 22d03e3e**
| ข้อ | ปิดโดย |
|---|---|
| authLimiter ครอบ GET /api/auth/idp/providers | `middleware/idp-rate-limit.js:19-29` ยกเว้น GET /providers; mount `server.js:295` |
| ThaID login UI แยก "down" vs "not enabled" (#801) | `login-chooser.tsx:245-266,284-293,337-339,381-404` — comingSoon/unknown/handoffFailed notice 3 แบบ + NOT_READY_ERROR_MAP |
| reset-for-handoff.js ลบ 45 ตารางโดยไม่ถาม | `scripts/reset-for-handoff.js:8-30,57-58,169-170` GATE 1 (NODE_ENV allowlist) + GATE 2 (--yes-i-understand / CONFIRM_RESET_FOR_HANDOFF / TTY พิมพ์ชื่อ db) |
| FRONTEND_URL ไม่มีใน .env.example | `apps/backend/.env.example:128-131` |

**ปิดบางส่วน (ส่วนที่เหลือยังอยู่ใน §2-§4 — อย่านับส่วนนี้ซ้ำ)**
- A10 build identity: /health มี build.revision/builtAt (`index.js:383-400`) — เหลือ /version (§2-88)
- 3 money leaks: leak (1) revision door → PENDING_DOC_FEE + quotation (`application-review-revision-methods.js:104-124`), leak (2) /submit echo (`applications.js:661-689`) — เหลือ leak (3)
- role gate blind to GRANT: submit ตัดสินโดย assertSubmitAllowed เท่านั้น (`applications.js:636-655`) — เหลือ /prepare entityId (§4)
- s07-seams plot literal มี areaUnit แล้ว (`s07-seams.spec.ts:302`)
- C3 wizard cluster: use-application-form-store / use-wizard-state / step-props หายแล้ว — เหลือ 2 ไฟล์ (§2-75)
- .dockerignore ปิด **/*.pem + keys/ (`:42-63`) — เหลือ rotate บน box
- checkout flag: default false แล้ว (`Dockerfile:59-60`, `.env.local.example:61`) — เหลือลบ view (§5)
- review-step a11y (126bfebd) — เหลือ Next/checkbox (§2-72)
- B1 workspace proxy (1e12c628), signed URL helper (ba16520e), U1-U4 (432c84be), A3/A4/A5 design (8328d2f7/8589782c/2f398593)

**NOT-A-TASK (3)**
- .gitleaksignore / DAILY_API_KEY revoke — operator ยืนยันเป็นลายลักษณ์อักษรแล้ว `HARNESS_LOG.md:225`; agent ตรวจ API บุคคลที่สามไม่ได้ (`:214`)
- 01-B4 WHO 'Batch Traceability' evidence text — `standards-signal-map.js:45-49` ไม่ได้พูดถึงรายต้น; เปิดใหม่เมื่อ M3/M4/R8 เปลี่ยน chain เท่านั้น; ห้ามเปลี่ยน requirement NAME
- provider document-name TODO — มีแค่ comment `provider-application-detail-config.ts:117` (รวมใน §2-15)

**ซ้ำที่ยุบแล้ว (19 คู่)**
RED certificate-issuance-holder-wiring → = certificate-farm-resolution (§2-1) · plot areaUnit FE ×2 + farm FE unit → §2-78 · Cloudflare WAF ×2 → §5 · D-01..D-21 / D-01..D-25 → Q-RULES · Burned table ×2 → §2-8 · ThaiD sandbox ×2 → §5 · cert hash-only ×2 → §2-99 · signing key durable ×2 → §2-100 · refresh token outage ×2 → Q-AUTH · auth state Redis ×2 → §3-31 · RLS Phase 1 / gacp_app probe / RLS follow-ups → §2-28 + §5 · RLS_SHADOW_GUC → §5 RLS · drain-complete ×3 + checkout flag → §5 drain-complete · 6 suites red ×2 → §2 B-REDSUITES · generate-env-template ×2 → §2-37 · open PRs ×2 → §5 GitHub · 13 workflows ubuntu-latest / G0 billing → §2-30 + Q-RUNNER

---

## หมายเหตุความซื่อสัตย์
- ไม่ได้ re-run full suite, SSH box, หรือ gh ใน session นี้ — ข้อที่อ้างสถานะ box/PR/suite แดง อ้างจาก log ที่ระบุ file:line ไม่ใช่จากการรันใหม่
- ข้อใน §2 ที่เป็น Tier C (B-MONEY-SMALL, B-CERT-FAILCLOSED, ข้อ 98/106/107) "ทำเลย" หมายถึง agent ทำ RED/GREEN + evidence ได้ทันที แต่ merge = operator ทุกใบ
- effort เป็นประมาณการจากขนาด diff ที่เห็น ไม่รวมเวลารอ review/merge
