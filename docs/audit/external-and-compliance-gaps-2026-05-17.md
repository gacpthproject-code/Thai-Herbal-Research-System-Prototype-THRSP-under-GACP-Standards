# การตรวจสอบการรวมระบบภายนอกและช่องว่างด้านความเป็นไปตามกฎหมาย

**วันที่**: 2026-05-17  
**ขอบเขต**: GACP Platform — ส่วนต่อประสานภายนอก + gaps ที่แก้ไขได้ด้วยโค้ด

---

## 1. สถานะการรวมระบบภายนอก

### ThaID OIDC
**สถานะ**: จำลองเท่านั้น | **ต้องการ**: THAID_CLIENT_SECRET จากผู้ให้บริการ

### กรมบัญชีกลาง (DTAM)
**สถานะ**: พร้อม | **บัญชี**: 4750134376 (Krungthai) | **Tax ID**: 0994000036540  
**PromptPay QR**: ผ่าน | **รายงาน**: แยก DTAM/PLATFORM

### Predictive AI Solution
**สถานะ**: ค้างอยู่ | **สัญญาณ**: PENDING_FINANCE_CONFIRMATION ที่ invoice-issuers.js  
**ต้องการ**: PLATFORM_BANK_ACCOUNT_NO, PLATFORM_BANK_NAME

### RD e-Filing
**สถานะ**: ส่วน VAT เสร็จแล้ว | **Auto-submission**: นอกขอบเขต  
**ไฟล์**: vat-report-service.js ✓

### Email Transport
**สถานะ**: ตั้งค่าแต่อยู่ localhost | **ตัวเลือก**: Gmail, SendGrid, AWS SES, SMTP  
**ต้องการ**: เปลี่ยน SMTP_HOST + DKIM/SPF สำหรับ gacpth.com

### SMS Transport
**สถานะ**: Iter 23 stub | **ผู้ให้บริการ**: ThaiBulkSMS (ยังค้างอยู่)  
**Production**: จะโยนข้อผิดพลาด NOT_PROVISIONED

### RSA Signature
**สถานะ**: โครงสร้างพร้อม/ยังไม่มี key | **ความเสี่ยง**: CRITICAL  
**ต้องการ**: RSA_PRIVATE_KEY_PASSPHRASE + key rotation runbook

### S3/MinIO
**สถานะ**: ตัวแปร env พร้อม | **ความเสี่ยง**: S3 access/secret key pending  
**ต้องการ**: bucket versioning + replication policy

### Redis
**สถานะ**: บังคับ | **ความใช้งาน**: rate-limiter + token blocklist  
**ความเสี่ยง**: fail-OPEN ยอมรับโดย Security Lead (2026-05-16)

---

## 2. ช่องว่างที่แก้ไขได้ด้วยโค้ด (3 Missing PDPA Items)

### ม.23 Privacy Notice (Partial)
- [ ] ตรวจสอบ `apps/web-app` i18n สำหรับ privacy_policy_text (th + en)
- [ ] ยืนยัน checkbox ปรากฏก่อนส่งแบบฟอร์ม register

### ม.28 Breach Notification (Missing × 3)
- [ ] สร้าง `docs/security/incident-response-runbook.md` (NIST SP 800-61 phases)
- [ ] สร้าง `docs/security/pdpc-breach-notification-template.md` (ภาษาไทย + อังกฤษ)
- [ ] เพิ่ม `apps/backend/services/email/templates/breach-notification.hbs` (ส่งอีเมลถึงผู้ใช้)

---

## 3. ผลการตรวจสอบค่าหลัง (Hard-Coded Values)

✓ Tax IDs + Account numbers: พื้นฐานที่ยอมรับได้ + env override  
⚠ localhost references: swagger.js + env-validator.js (เพียงแค่เตือน)  
✓ ไม่มี PII ในไฟล์บันทึก — masking + encryption ทำงาน  
✓ ไม่มี AuditLog deletion — hash-chain ป้องกัน

---

## 4. บล็อกเกอร์สูงความสำคัญ (Top 10)

| # | บล็อกเกอร์ | ประเภท | เจ้าของ |
|---|---------|------|--------|
| 1 | PLATFORM_BANK_ACCOUNT_NO | CRITICAL | Finance |
| 2 | RSA key + rotation | CRITICAL | Ops/Security |
| 3 | DTAM hosting infra | CRITICAL | Infra |
| 4 | Penetration test SoW | HIGH | Security |
| 5 | PDPA ม.28 runbook | HIGH | Legal/Security |
| 6 | Email provider (SendGrid/SES) | HIGH | Ops |
| 7 | Privacy notice i18n | HIGH | Legal/QA |
| 8 | ThaiBulkSMS onboard | MEDIUM | Ops |
| 9 | DNS/SSL/DKIM/SPF | MEDIUM | Ops/Network |
| 10 | Redis HA setup | MEDIUM | Ops |

---

## สรุป

**External Integrations**: 7/10 ready — email/sms/thaid still stub  
**Code-Fixable Compliance**: 18 implemented + 2 partial (verify) + 3 missing (write docs)  
**Gate for Production**: Fix HIGH items (#1–7) + pentest + legal sign-off
