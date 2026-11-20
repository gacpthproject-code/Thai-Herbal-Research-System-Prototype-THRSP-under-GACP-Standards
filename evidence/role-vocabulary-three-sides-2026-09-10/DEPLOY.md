# ขึ้นของจริง — 2026-09-11

`main af2d5d1c` · อิมเมจ `main-af2d5d1c` (build บนเครื่องนี้จาก main หลัง merge)

## ลำดับที่เดินจริง

1. build อิมเมจจาก main — พิสูจน์เนื้อในก่อนใช้: สิบคำครบ · คำใหม่แปลเป็นตัวเอง ·
   **คำเก่าคืน `null`** (`admin` · `account` · `platform_admin`) ⇒ ตัดขาดจริง
2. ตั้งแท็กใน `.env.staging` / `.env.demo` (สำรองไฟล์เดิมไว้) → recreate ทั้งสองฝั่ง
3. `prisma migrate deploy` — ใบ `20260910200000` ลงครบสามฐาน (staging · demo · dev)
4. seed ในคอนเทนเนอร์ของแต่ละฝั่ง (ใช้กุญแจลงนามของสภาพแวดล้อมนั้น)
5. ถอด `gacpth.com` — `docker compose rm -sf backend frontend`

## ด่านตอนบูตทำงานจริงระหว่างทาง

demo **ปฏิเสธที่จะขึ้น** หลัง recreate เพราะ migration ยังไม่ลง:

    [boot] CRITICAL - [migration-level] 1 migration(s) NOT applied:
    20260910200000_role_vocabulary_three_sides ... (refusing to boot: NODE_ENV=production)

หายเองทันทีที่ migration ผ่าน · staging เป็น `NODE_ENV=staging` จึงเตือนแล้วขึ้นได้
กลไกนี้ทำให้ "โค้ดใหม่คุยกับฐานเก่า" กลายเป็นคอนเทนเนอร์ที่ไม่ขึ้น แทนที่จะเป็น 500
ตอนมีคนกดปุ่ม

## ใบ migration พิสูจน์บนฐานที่ถือคำเก่าจริง

ต่างจากใบเมื่อวานที่รันบนฐานเปล่า (คำสั่ง UPDATE ไม่เคยแปลงอะไรเลย) — รอบนี้แปลงจริง:

    account → finance_officer_platform      admin → system_admin_dtam
    role_groups เหลือ 8 กลุ่มคำใหม่ล้วน (กลุ่มคำเปล่าถูกลบตามที่ใบเขียนไว้)

และบัญชีที่ถูกแปลงคำ **ล็อกอินผ่านประตูจริงได้**

## หนึ่งจุดที่ต้องตัดสินด้วยมือ และเป็นด่านที่ทำงานถูก

หลัง migration บัญชี `finance@gacp.go.th` (ฝั่งกรม) ถือ `finance_officer_platform`
เพราะใบแปลงคำเปล่า `account` ไปฝั่งบริษัทตามที่โค้ดเดิมเขียนเจตนาไว้ · แล้ว
`repairSeededUserRow` **ปฏิเสธที่จะทับ** ตอน seed เพราะการย้ายข้างคือ "การตัดสินใจ
ไม่ใช่การสะกด" — ซึ่งเป็นสิ่งที่ `shared/role-spelling-repair.js` มีไว้กันพอดี

ผลคือมีการเงินฝั่งบริษัทสองคน ไม่มีฝั่งกรมเลย ⇒ แก้ด้วยการตัดสินใจที่บันทึกไว้:
โดเมน `.go.th` = กรม ⇒ แถวนั้นเป็น `finance_officer_dtam` (อัปเดตแถวเดียว มีเงื่อนไข
ทั้ง providerId · email · role เดิม กันแตะผิดแถว)

## ผลสุดท้าย

ทั้งสามฐานมีครบเก้าบทบาท คนละหนึ่งคน (health สองคน) · คีย์ลงนามไม่ถูกหมุน (md5 เท่าเดิม)

ล็อกอินผ่านประตูจริงบน staging ครบแปดบทบาทเจ้าหน้าที่:

    document_reviewer · dispatcher · field_inspector · certificate_approver
    finance_officer_dtam · finance_officer_platform
    system_admin_dtam · system_admin_platform

demo ตอบ `mfa_setup_required` ทุกบัญชี — เป็นการออกแบบเดิม ไม่ใช่ของเสีย
ประตูสาธารณะทั้งสองโดเมนตอบ 200 · `/api/webapp-version` คืน JSON (เมื่อวานเป็น HTML 404)

## gacpth.com

ถอดคอนเทนเนอร์แล้ว · ที่สำคัญกว่าการหยุด crash-loop คือ `map $host $backend_up` มี
`default backend:8000` ⇒ ทุกโฮสต์ที่ไม่ใช่ staging/demo **เคยตกลงคอนเทนเนอร์ที่ปลดระวาง
แล้วเงียบ ๆ** (คอมเมนต์ในไฟล์เตือนเรื่องนี้ไว้เอง) · ตอนนี้ตอบ 502 อย่างชัดเจน
`nginx -t` ยังผ่าน เพราะ `proxy_pass` ใช้ตัวแปร จึง resolve ตอนมีคำขอ ไม่ใช่ตอนโหลด

## ที่ยังไม่ได้ทำ

- ความลับ MFA ของ demo ชุดเดิม (`~/work/state/demo-mfa-secrets-2026-09-07.json`) ใช้ไม่ได้แล้ว
- โปรเจกต์ Supabase เก่าสามตัว (`bgim…` `hqdb…` `nnfbugfmk…`) ยังไม่ถูกลบ และยังไม่มี dump
- เก็บกวาด nginx ของ `gacpth.com` — แยกเป็นงานของตัวเอง เพราะบล็อกนั้นถือ `_` default server
