# การตรวจสอบช่องว่างการอินทิเกรชันแบบ end-to-end ของแพลตฟอร์ม GACP
**วันที่:** 17 พฤษภาคม 2566 | **สถานะ:** ร่าง

---

## สรุปผลการตรวจสอบ

**จำนวนช่องว่างการอินทิเกรชันทั้งหมด:** 11 เรื่อง  
**Routes:** 169 ไฟล์ | **Services:** 108 ไฟล์ | **Frontend Pages:** 133 หน้า | **Client API:** 9 สัญญา

**Notification Fanout Adoption:** 80% (8/10 ใช้ fanout; 2 direct call)

---

## 1. เมทริกซ์ Feature × Stakeholder

| Feature | Service | Route | UI | API Client | Fanout | Status |
|---------|---------|-------|-----|-----------|--------|--------|
| Payment Slip | ✓ | ✓ | ✓ | ✓ | ⚠️ | ⚠️ Fanout missing |
| Refund | ✓ | ✓ | ✓ | ✓ | ✓ | ✅ Complete |
| Audit | ✓ | ✓ | ✓ | ✓ | ✓ | ✅ Complete |
| Certificate | ✓ | ✓ | ✓ | ✓ | — | ✅ Complete |
| Renewal | ✓ | ✓ | ✓ | ⚠️ | ⚠️ | ⚠️ Client call missing |
| **PDPA Erasure** | ✓ | ✓ | ❌ | ❌ | ✓ | **❌ No UI** |
| **Manual Journal** | ✓ | ✓ | ❌ | ❌ | — | **❌ No UI** |
| **Period Close** | ✓ | ✓ | ⚠️ | ❌ | — | **⚠️ Read-only** |
| **Purchase Invoice** | ✓ | ✓ | ❌ | ❌ | — | **❌ No UI** |
| **WHT Cert** | ✓ | ✓ | ⚠️ | ❌ | — | **⚠️ Stub only** |
| Reports | ✓ | ✓ | ✓ | ⚠️ | — | ⚠️ Limited filters |

---

## 2. Orphan Endpoints (5 เรื่อง)

| API Path | Service | Gap | Fix | Days |
|----------|---------|-----|-----|------|
| `POST /finance/manual-journal-entries` | complete | UI form + workflow | `/provider/accounting/manual-journals` | 4 |
| `POST /pdpa/erasure/request` | complete | UI self-service form | `/health/pdpa/erasure` | 3 |
| `POST /finance/purchase-invoices` | complete | UI record supplier invoice | `/provider/accounting/purchase-invoices` | 3 |
| `POST /finance/period-close` | complete | No write form (read-only) | `/provider/accounting/period-close` form | 2 |
| `POST /finance/wht/certificate` | stub | Limited UI + create form | `/provider/accounting/wht-certificates` | 2 |

---

## 3. Orphan UI (3 เรื่อง)

| Page | UI Exists | Problem | Fix |
|------|-----------|---------|-----|
| `/health/applications/renewal` | ✓ | No API client call to `RenewalService` | Add call to `createRenewalApplication()` |
| `/provider/accounting/period-close` | ⚠️ read-only | No form to submit close period | Add POST form + approval |
| `/provider/accounting/wht` | ⚠️ read-only | No create/upload for new certificates | Add certificate upload modal |

---

## 4. Notification Fanout Adoption (80%)

**ใช้ fanout (8 callers):**
- `refund-service.js` — REFUND_INITIATED ✓
- `audit-scheduling-service.js` — AUDIT_SCHEDULED ✓
- `audit-onsite-service.js` — AUDIT_DECISION ✓
- `pdpa-erasure-service.js` — ERASURE_CONFIRMED ✓
- `renewal-reminder-cron.js` — RENEWAL_AVAILABLE ✓
- 3 unit tests ✓

**Direct call (2):**
- `payment-slip-service.js` — ❌ NO fanout (email-only, gap #1)
- `slip-notifications.js` — manual email ✓

**Gap:** Payment slip approval → applicant notification ไม่ใช้ fanout

---

## 5. Top 10 Integration Gaps

| # | Gap | Component | Effort | Impact |
|---|-----|-----------|--------|--------|
| 1 | PDPA erasure: No UI form | `/health/pdpa/erasure` page | 3d | HEALTH can't request |
| 2 | Manual journal: No approval form | `/provider/accounting` journal entry | 4d | ACCOUNT can't approve |
| 3 | Payment slip: No fanout notification | `payment-slip-service.js` line 391 | 1d | Applicant misses updates |
| 4 | Purchase invoice: No record UI | `/provider/accounting` purchase invoice form | 3d | Finance can't log INV |
| 5 | Period close: No write form | `/provider/accounting/period-close` form | 2d | ACCOUNT can't close |
| 6 | WHT: No upload form | `/provider/accounting/wht` upload modal | 2d | Finance can't upload ทบ.50 |
| 7 | Renewal: Client service not called | `/health/applications/renewal/client-view.tsx` | 1d | User sees blank page |
| 8 | Certificate: No admin list | No backend search endpoint | 1d | ADMIN can't audit certs |
| 9 | Financial reports: No date filter | `/provider/accounting/reports` client | 1d | User can't slice by period |
| 10 | Audit → Cert: No auto-generate | `audit-onsite-service.js` | 2d | Cert issued manually |

**Total Effort:** 20-22 วัน

---

## 6. Cross-Stakeholder Handoff

| Handoff | Issue | Impact |
|---------|-------|--------|
| HEALTH uploads slip → ACCOUNT reviews | No fanout notification to HEALTH | User blind to approval |
| ACCOUNT approves → HEALTH sees receipt | Receipt page missing fanout flag | Workflow appears stalled |
| AUDITOR decides PASS → Cert issued | No auto-generate; manual PDF | Certificate delayed 1-2 days |
| HEALTH requests erasure → Token sent | Page doesn't exist | User can't complete flow |
| Finance closes period → JE rejected | No write UI exists | Incomplete feature |

---

## 7. Cron + Fanout Status

| Cron | Called By | Fanout | Issue |
|------|-----------|--------|-------|
| renewal-reminder-cron.js | daily | ✓ RENEWAL_AVAILABLE | ✅ OK |
| audit-schedule-conflict | per assign | ✓ in service | ✅ OK |
| payment-slip-age-reminder | MISSING | — | ⚠️ Not implemented |
| period-close-reminder | MISSING | — | ⚠️ Not implemented |

---

## 8. Iteration Plan (4 iterations, 19-22 วัน)

**Iter 1:** PDPA + Manual Journal (7d)
- Add `/health/pdpa/erasure` page + form
- Add `/provider/accounting/manual-journals` workflow

**Iter 2:** Payment Fanout + Period Close (3d)
- Wire `payment-slip-service` → fanout
- Add period-close write form

**Iter 3:** Purchase Invoice + WHT (5d)
- Add purchase invoice record form
- Add WHT certificate upload

**Iter 4:** Tests + Polish (4d)
- E2E renewal, erasure, journal, period
- Cron reminder jobs

---

## Priority Ranking

**CRITICAL (Feature complete):**
1. PDPA erasure self-service form
2. Manual journal approval workflow
3. Payment slip fanout notification

**IMPORTANT (Finance ops):**
4. Purchase invoice record UI
5. Period close form
6. WHT certificate upload

**ENHANCEMENT:**
7. Renewal API client call
8. Financial reports filters
9. Certificate admin search

