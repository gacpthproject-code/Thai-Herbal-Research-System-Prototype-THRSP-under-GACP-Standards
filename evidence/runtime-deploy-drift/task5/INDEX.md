# Task 5 — พิสูจน์ทั้งวงจรบนเครื่องจริง · 2026-08-14

**Status:** `DONE(probe:deploy-drift)` เฉพาะฝั่ง staging — ผลรันจริงทุกขั้นอยู่ในไฟล์นี้ ·
ฝั่ง production ตรวจจากเครื่องไม่ได้ (Cloudflare WAF) — บันทึกเป็นรายการค้าง ไม่ใช่ข้ออ้าง

ทุก output ในไฟล์นี้คัดจากเทอร์มินัลจริงของ operator บนเครื่อง `43.134.175.51` — ไม่มีการเรียบเรียงใหม่

## เส้นทางที่พิสูจน์แล้ว

```
docker build บนเครื่อง (ไม่ใช้ Actions) → deploy-staging.sh (backup→migrate→recreate)
→ endpoint ประกาศ revision ผ่าน Cloudflare + host nginx + docker nginx ครบสามชั้น
→ deploy-drift probe อ่านและตัดสินถูกทุกกรณีที่เจอจริง
```

## หลักฐานหลัก — probe อ่าน drift จริงได้ถูกต้อง (ไม่ใช่แค่เขียวสวย)

probe เจอสถานการณ์จริง 4 แบบใน 1 วัน และตัดสินถูกทุกแบบ:

| สถานการณ์ | ผลที่ probe รายงาน |
|---|---|
| endpoint ยังไม่มีบน image เก่า | `not JSON carrying a revision field` — FAIL ไม่ใช่ผ่านเงียบ |
| nginx บัง route (`/api/version` ชน backend mobile) | body ของ backend ถูกจับได้ว่าไม่ใช่คำตอบ frontend |
| **drift ของแท้**: main ขยับ 2 commit หลัง merge ใบ nginx | `running: fc91c479... expected: 2de55ff2... 2 commit(s) behind` — บอกครบ SHA สองฝั่ง + ระยะ |
| หลัง rebuild ที่ HEAD | แถว staging หายจากรายการ FAIL |

```
{"revision":"fc91c4797a22f48c64b706c3dcd428bcea4863b8","builtAt":"2026-08-14T03:33:01Z"}
```
— `/api/webapp-version` ผ่านโดเมนจริงครั้งแรก หลัง carve-out ใน docker nginx + ติดตั้ง host vhost จากรีโป

## อุปสรรคที่เจอจริง เรียงตามเวลา (ทั้งหมดถูกแก้และมี commit)

| # | อุปสรรค | การแก้ |
|---|---|---|
| 1 | `deploy-staging.sh` บังคับ image ต้องอยู่บน GHCR | local-first (`027251c0`) |
| 2 | migration `canonicalize_user_role` **ABORT ตามออกแบบ** — user role `COORDINATOR` map ไม่ได้ | operator ตัดสินลบบัญชี seed ตาย 1 + `ACCOUNTANT` เก่า 3 (พร้อม notifications 226 แถว) → `migrate resolve --rolled-back` → รันใหม่ผ่าน · **role ทั้งฐานเป็น canonical แล้ว** |
| 3 | frontend `/api/version` ถูก nginx บังเข้า backend | ย้ายเป็น `/api/webapp-version` + carve-out exact-match (`df673197`) |
| 4 | conf docker nginx เป็น bind mount รายไฟล์ — reload ได้ conf เก่า (inode) | `docker restart gacp-nginx` |
| 5 | host nginx routing เอง ข้าม docker nginx — เวอร์ชันรีโปแก้ไว้แล้วแต่ไม่เคยติดตั้ง | ติดตั้งจาก `deploy/nginx/` |
| 6 | **ติดตั้งแล้วล็อกเอาต์ทุกคน** — allowlist ไม่มี IP เครื่อง และปัก IP operator เป็น /32 ที่หมุนทิ้งไปแล้ว | rollback จาก backup → แก้ allowlist (`d9431b12`) → operator merge → ติดตั้งใหม่สำเร็จ |
| 7 | rollback ตาม `ls -t` เสี่ยงหยิบ backup ผิดชุด + `$(ls /root/...)` วิ่งนอก sudo | rollback ตามลายเซ็นเนื้อไฟล์ใน `sudo bash -c` |

ข้อ 6 คือเหตุการณ์ที่ต้องบันทึกตรง ๆ: **คำแนะนำติดตั้งของ agent ทำให้ staging ปฏิเสธทุกคนช่วงสั้น ๆ**
(รวม operator เอง) · กู้ด้วย backup ที่ทำไว้ก่อนติดตั้ง — การบังคับ backup ก่อนแตะ config
คือสิ่งที่ทำให้เรื่องนี้จบใน ~นาที ไม่ใช่ชั่วโมง

## สิ่งที่ **ยังไม่** ปิด

- **production ตรวจจากเครื่องไม่ได้** — Cloudflare WAF บล็อก IP เครื่อง (หน้า block มี Ray ID
  ก่อนถึง host nginx) ⇒ แถว prod ของ probe จะ FAIL แบบ "ยิงไม่ถึง" ตลอดเมื่อรันจากเครื่องนี้ ·
  ทางแก้อยู่ใน **Cloudflare dashboard เท่านั้น** (WAF skip rule ให้ IP `43.134.175.51`) —
  รายการค้างของ operator · ระหว่างนั้น probe ยัง FAIL ซึ่ง**ถูกต้อง**: ตรวจไม่ได้ ≠ ผ่าน
- **production ยังรัน image เก่า** (ไม่มี endpoint ทั้งสอง) — ตั้งใจ: ยังไม่มีคำสั่ง deploy production
- **probe ยังเป็น `manual-until:2026-08-28`** — เงื่อนไขปลด (build บนเครื่องได้จริง) **พิสูจน์แล้ววันนี้**
  ⇒ พร้อมให้ operator เซ็นเปลี่ยนเป็น `ci` + เปลี่ยน `full-gate-checks.txt` เป็น `required` ในใบเดียว
- image tag ยังเป็น mutable + สอง Dockerfile ของ monitoring ยังใช้ `:latest` — ตามที่ spec §6 บันทึก
