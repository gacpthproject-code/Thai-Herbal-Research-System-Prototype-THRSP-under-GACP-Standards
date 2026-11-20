# R2 — legal basis: อำนาจสั่ง reopen (ธง L2) — บันทึกการ supersede
> สร้างตามคำสั่ง operator 2026-08-03 ข้อ 7 ("legal-basis.md: mark คำตอบ L2 เดิม...")
> **หมายเหตุความจริง (Law 3.2)**: ก่อนคำสั่งนี้ **ไม่มีไฟล์ `legal-basis.md` ในรีโป** — ตรวจด้วย `find . -name 'legal-basis.md'` ทั้งรีโป = 0 ไฟล์
> บันทึก L2 ที่มีอยู่จริงกระจายอยู่ 3 ที่: `QUEUE.md:22` · `mandate-ssot.md` ข้อ 7 · `DECISIONS-CROSSREF.md` D-6 → ไฟล์นี้รวบทั้งหมดแล้ว mark ตามคำสั่ง

## ประวัติคำตอบ L2 — **ทุกรายการ SUPERSEDED, implementer/auditor ห้ามอ้าง**

| # | คำตอบ/มติเดิม | ที่บันทึก | สถานะ |
|---|---|---|---|
| 1 | **"บัญชีเท่านั้น"** — Account (DTAM accountant) เป็นผู้อนุมัติ | operator อ้างถึงในคำสั่ง 2026-08-03; ร่องรอยใกล้สุดในรีโปคือ precedent ของ waiver (AUDIT-001): SoD = inspector ยื่น + DTAM accountant อนุมัติ (`apps/backend/services/waiver-reopen-service.js:250-279`) — **ตัวคำตอบ L2 ฉบับนี้ไม่เคยถูก persist เป็นไฟล์** | **[SUPERSEDED 2026-08-03 by operator decision — Account ไม่อยู่ใน process reopen]** |
| 2 | "role ชั่วคราว = **Admin เท่านั้น** (ธง L2)" | `mandate-ssot.md` ข้อ 7 (มติ SSOT รอบ 07:19Z) | **[SUPERSEDED 2026-08-03 — R2 FINAL ข้อ 6]** |
| 3 | D-6 ครึ่งเทคนิค: เช็ค `normalizeRole(...) === CANONICAL_ROLES.ADMIN` ในชั้น service | `DECISIONS-CROSSREF.md` D-6 | **[SUPERSEDED 2026-08-03 — ไม่มีขาอนุมัติแล้ว จึงไม่มี admin check ให้เขียน]** |

## ACTIVE requirement — แหล่งเดียว
**R2 FINAL ข้อ 6** (`final-requirements.md`):
- **reviewer (ตกตรวจเอกสาร) / Audit (ตกลงพื้นที่) กดได้เลย** — ไม่มีขาอนุมัติ, **ไม่มี Account ใน process ทุกจุด**
- บังคับครบสามอย่างมิฉะนั้นทำไม่ได้ (test pin): note เหตุผล / เอกสารแสดงความจำนงลูกค้า / บันทึกผู้ทำ+role+เวลา+เคสต้นทางอัตโนมัติ
- เปิดเคสใหม่ผูก `reopenedFrom` เคสเก่าคง terminal
- รายการ reopen ทั้งหมด query ย้อนได้ (list view สำหรับผู้มีสิทธิ์ดู)
- scope: **เฉพาะเคสที่ถูกปิดโดย cron ข้อ 5** เท่านั้น

role ในระบบที่ตรงกับถ้อยคำ (gap report ยืนยันสิทธิ์อีกชั้น): reviewer = `CANONICAL_ROLES.DOCUMENT_REVIEWER` (`'document_reviewer'`, `apps/backend/shared/canonical-rbac.js:40`) · Audit = `CANONICAL_ROLES.AUDITOR` (`'auditor'`, `:41`)

## สิ่งที่การ supersede นี้ **ไม่ได้** ปิด
- **ธง L4 (waiver coexist)** — `QUEUE.md:22` ยังค้างรอหนังสือนิติกรกรมฯ ตามเดิม (แคบลงเพราะ scope ใหม่ แต่ยังไม่ปิด)
- **ธง L3 (carry-over)** — ยังค้างตามเดิม (D-9)
- **D-1 (เงิน)** — FINAL ไม่ได้ตอบ ยัง OPEN
