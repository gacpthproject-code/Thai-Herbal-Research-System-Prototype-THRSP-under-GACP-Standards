# Q3 — REOPEN-READINESS AUDIT — mandate (operator instruction 2026-08-03, verbatim)

> read-only เท่านั้น ห้ามแก้โค้ดทุกไฟล์
> Design ที่จะรองรับในอนาคต: "เคสที่จบ terminal แล้ว เปิดเคสใหม่ผูกเคสเก่าผ่าน `reopenedFrom` + เลขที่หนังสืออนุมัติ โดย role เจ้าหน้าที่" — งานนี้ตรวจว่าโค้ดปัจจุบันสอดคล้อง/ขัดตรงไหน ด้วยหลักฐานจริง

## ตรวจ 6 ข้อ (ทุก finding ต้องมี file:line)

1. **TERMINAL จริงไหม**: EXPIRED/CANCELLED (order/invoice) และ terminal states ของ application (S0–S6) — มี transition ออกจาก terminal ที่ไหนบ้าง (transition table, DB CHECK, probe pins) — แยกให้ชัดจาก sticky-return ซึ่งเป็น returnable โดย design ไม่ใช่ terminal
2. **RESURRECTION PATHS**: writer ใดก็ตามที่ mutate status จาก terminal → non-terminal (repository, admin endpoint, script, seed, cron) — เจอ = ระบุทุกจุด
3. **UNIQUENESS**: partial unique index / constraint ที่ assume "1 เคส active ต่อ farmer/plot/อะไรก็ตาม" — เคสใหม่ที่เปิดหลังเคสเก่า terminal จะชน constraint ไหนบ้าง (ข้อนี้ชี้ขาดว่า design ทำได้เลยหรือไม่)
4. **1:1 ASSUMPTIONS**: invoice/payment/certificate ผูก application แบบ assume ตลอดชีพหนึ่งใบไหม — จุดไหนพังถ้ามีเคสที่สองอ้างเคสแรก
5. **REOPEN HACKS ที่มีอยู่แล้ว**: การแก้ status มือ, admin override, หรือ workaround ใด ๆ ที่ทำหน้าที่นี้อยู่แบบไม่มีหลักฐานอนุมัติ
6. **EXPAND FEASIBILITY**: ประเมินว่า `reopenedFrom` + approval-reference เพิ่มได้แบบ EXPAND ล้วนจริงไหม หรือมีของเดิมบังคับให้ contract

## Output

`evidence/Q3-reopen-audit/findings.md` แยก 3 กอง:
- (a) สอดคล้องอยู่แล้ว
- (b) ขัด — ต้องแก้ก่อน design นี้ลง
- (c) ขัด — แต่รอแก้พร้อมงาน reopen ได้

ทุกข้อจัดกองพร้อมเหตุผล **ห้ามเสนอ patch** — remediation เป็นงานแยก รอ operator เลือกรายการจาก findings ก่อน

## Dispatch design (operator กำหนด)

- spec-reader ทำได้ทั้งงาน (read-only ตรง mandate)
- auditor ตรวจซ้ำเฉพาะข้อ 1-3 ว่า findings ครบถ้วนไม่ตกหล่น
- Gate §4 ใช้เฉพาะข้อ 5-6 (evidence ครบ + report commit) — ข้อ CI/ratchet ไม่เกี่ยวเพราะไม่มี diff โค้ด
