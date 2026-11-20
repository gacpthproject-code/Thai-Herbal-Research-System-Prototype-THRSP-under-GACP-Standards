# ขอบเขตการเข้าถึงโดเมน (domain access)

ปรับปรุง 2026-10-30 (gacpth.com ตามคำสั่ง operator 2026-10-30)

## staging.gacpth.com — redirect หน้าเปล่า → หน้า login (ติดตั้งด้วยมือ 2026-08-05, **อยู่นอก git**)

`staging.gacpth.com/` (URL เปล่า) ถูกตั้งให้ **302 → `/auth/health/login`**

- **ที่ตั้ง**: `/etc/nginx/sites-available/staging.gacpth.com.conf` (block `listen 443`) — **host nginx นอก docker** จึง **ไม่ผิด freeze** (freeze ครอบเฉพาะ `docker compose up`)
- **สถานะใน git**: **ไม่มี** — เป็น server block ที่ operator แก้ด้วยมือบนเครื่อง (มี comment กำกับวันที่+เหตุผลในไฟล์แล้ว) · แบบเดียวกับ Cloudflare rule ด้านล่าง: อ่านโค้ดในรีโปอย่างเดียวจะไม่เห็น
- **เหตุผลชั่วคราว**: หน้า `/` ของ staging ยังไม่มี landing จริง — redirect ให้เข้า login ทันทีระหว่างสาธิต/ทดสอบ
- **วิธีถอน**: ลบ block redirect ออกจาก `staging.gacpth.com.conf` แล้ว `sudo nginx -t && sudo systemctl reload nginx` (host nginx — ไม่ต้อง deploy ไม่แตะ docker)
- **แผนถอนถาวร** (A-lane หลัง freeze ปลด): ตัดสินหน้า `/` ของ staging ให้เป็น redirect ในโค้ด (Next.js) หรือ landing จริง แล้ว **ถอน nginx patch นี้** เพื่อให้พฤติกรรมกลับมาอยู่ใน git ทั้งหมด

> ⚠️ ตระกูลเดียวกับ Cloudflare rule: **การตั้งค่าที่อยู่นอก git หายเงียบได้และไม่มี CI จับ** — ถ้ามีคนแก้/ลบ `staging.gacpth.com.conf` โดยไม่รู้ที่มา redirect จะหายโดยไม่มีอะไรเตือน · จึงบันทึกไว้ที่นี่

---

เอกสารนี้บันทึกว่า **ตอนนี้ใครเข้าถึงโดเมนไหนได้บ้าง และการบล็อกถูกบังคับที่ชั้นไหน**
เขียนขึ้นเพราะการบล็อก production ปัจจุบัน **ไม่ได้อยู่ใน git** จึงไม่มีทางรู้จากการอ่านโค้ดอย่างเดียว

## สรุปสถานะปัจจุบัน

| โดเมน | เข้าถึงได้ไหม | บล็อกที่ชั้นไหน |
|---|---|---|
| `gacpth.com` | ทุกคนเห็น**หน้าแจ้งว่ายังไม่เปิดให้บริการ** (200, noindex) ยกเว้น `/verify/*` ที่ 302 ไป `https://demo.gacpth.com` พร้อม path และ query | host nginx ของเครื่อง demo (ดูหัวข้อ gacpth.com) |
| `www.gacpth.com` | เหมือน `gacpth.com` | host nginx ของเครื่อง demo |
| `demo.gacpth.com` | เปิดสาธารณะ | host nginx ของเครื่อง demo (`$gacp_demo_deny` ไม่มีแถว deny) |
| `staging.gacpth.com` | เข้าได้จาก IP ใน allowlist **หรือ อุปกรณ์ที่ถือ gate cookie** (ดูหัวข้อ cookie door) | nginx geo gate + cookie exempt |

## Cookie door ของ staging gate (เพิ่ม 2026-08-20 — lockout ครั้งที่ 4)

ประวัติ gate ล็อก operator เอง 4 ครั้ง: /32 pin → /128 pin → /64 prefix rotate → และสุดท้าย
**มือถือบนเครือข่าย AIS (`2001:44c8::/32`)** ซึ่งการไล่เติม prefix ไม่มีวันครอบได้ จึงเพิ่มช่องทางที่
ตามอุปกรณ์แทนตาม IP:

- เปิด `https://staging.gacpth.com/__gate?t=<token>` **ครั้งเดียว** บนอุปกรณ์ → ได้ cookie
  (`Secure; HttpOnly; SameSite=Lax`, อายุ 1 ปี) → เข้าได้จากทุกเครือข่ายตลอดอายุ cookie
- URL `/__gate` อยู่ใน exempt map จึงเปิดได้แม้กำลังโดนบล็อก — แต่มันแค่ **ตั้ง** cookie:
  token ผิด = cookie ไร้ค่า ยังโดน 403 เหมือนเดิม (ตัวตัดสินคือ map `$gacp_gate_cookie_ok`)
- **token อยู่นอก git**: `/etc/nginx/gacp-gate-token.conf` (root 600, บรรทัดเดียว: `"<hex>" 1;`)
  — include แบบ mask ใน `deploy/nginx/gacp-platform.conf` จึง fail-soft: ไฟล์หาย = ไม่มี cookie
  ใดผ่าน = gate ทำงานแบบเดิมเป๊ะ · rotate token = เขียนไฟล์ใหม่ + `nginx -s reload`
- โครงสร้าง config อยู่ใน git ทั้งหมด: `deploy/nginx/gacp-platform.conf` (maps) +
  `deploy/nginx/staging.gacpth.com.conf` (`location = /__gate`)

### เหตุการณ์ 2026-08-18 ที่พบระหว่างสอบสวน (บันทึกไว้กันงง)

พบไฟล์ `/etc/nginx/conf.d/00-gacp-prelaunch-gate.conf` หัวเขียนว่า "PUBLIC GO-LIVE
CONFIGURATION" ตั้ง `default 0` (เปิดทั้งโลก) mtime 2026-08-18 21:54 พร้อม reload —
**แต่ไม่เคยมีผลจริง** เพราะ geo ตัวเดียวกันถูกนิยามซ้ำใน `sites-enabled/gacp-platform.conf`
(`default 1`) และตัวหลังชนะ ⇒ ใครกดเปิด gate วันนั้นคิดว่าเปิดแล้วแต่จริงๆ ยังปิดอยู่ ·
geo ซ้ำสองที่แบบนี้อันตราย (ลำดับ include เปลี่ยน = ม่านพลิกเงียบๆ) จึงย้ายไฟล์ conf.d
คู่นั้นไปเก็บที่ `/etc/nginx/retired-2026-08-20/` เมื่อติดตั้ง cookie door — เหลือ gate
นิยามเดียวใน sites-enabled · ถ้าต้องการเปิดแพลตฟอร์มจริง แก้ `default 1` → `default 0`
ที่ `deploy/nginx/gacp-platform.conf` ที่เดียว (อ่าน runbook restrict-site-to-one-ip ก่อน)
| `dev.gacpth.com` | ยังไม่มี vhost ของตัวเอง | ดูหัวข้อ "ข้อควรระวัง" |
| `api.gacpth.com` | ยังไม่มี vhost ของตัวเอง | ดูหัวข้อ "ข้อควรระวัง" |

## gacpth.com และ www.gacpth.com (คำสั่ง operator 2026-10-30)

DNS ของ `gacpth.com` และ `www.gacpth.com` ชี้ไปเครื่อง demo (119.59.105.140) ผ่าน Cloudflare แล้ว
เครื่อง demo ตอบสองชื่อนี้เองที่ host nginx ไฟล์ `/etc/nginx/conf.d/00-gacp-platform.conf`
ซึ่งเก็บไว้ในรีโปที่ `deploy/nginx/demo-host/etc/nginx/conf.d/00-gacp-platform.conf`

- ทุก path ที่ไม่ใช่ `/verify/...` ได้หน้าแจ้ง "เว็บไซต์นี้ยังไม่เปิดให้บริการ / ระบบอยู่ระหว่างการพัฒนาและทดสอบ"
  สถานะ 200 พร้อม `X-Robots-Tag: noindex, nofollow, noarchive` รวมถึง `/api/*` ด้วย จึงไม่มีคำขอไหนถึงแอป
  ตัวหน้าเป็นไฟล์ `/usr/share/nginx/gacpth-notice/index.html` (ในรีโป `deploy/nginx/demo-host/usr/share/nginx/gacpth-notice/index.html`)
- คำขอที่ไม่ใช่ GET/HEAD (เช่น POST `/api/auth/login`) ได้ 405 จาก nginx ไม่ใช่หน้าแจ้ง และไม่ถึงแอปเช่นกัน
- `/verify/...` ได้ 302 ไป `https://demo.gacpth.com$request_uri` เพื่อให้ QR ที่พิมพ์เป็น gacpth.com ยังเปิดหน้าตรวจสอบได้
  (`/verify` ที่ไม่มี `/` ต่อท้าย และ `/VERIFY/...` ได้หน้าแจ้ง)
- ชื่อ host เทียบแบบไม่สนตัวพิมพ์ ชื่ออื่นที่คล้ายกัน เช่น `demo.gacpth.com` หรือ `gacpth.com.example` ไม่โดนกติกานี้
- กติกานี้อยู่ก่อนบรรทัด `if ($gacp_bare_domain_deny)` จึงตอบทุกคน ไม่ใช่แค่คนใน IP allowlist
- ไม่ใช้ Cloudflare Security rule บล็อกสองชื่อนี้แล้ว (วัด 2026-10-30 จากเครื่อง staging: `https://gacpth.com/` ได้หน้าแจ้งผ่าน Cloudflare)
- การตรวจว่าเครื่อง demo ยังตรงกับรีโป: `~/work/state/infra/check-nginx-drift-demo.sh <commit>` (อ่านอย่างเดียวผ่าน ssh)
  เทสต์ที่ล็อกพฤติกรรมนี้อยู่ใน `apps/backend/__tests__/unit/nginx-exposure.test.js`
- `deploy.sh` ของเครื่อง demo ไม่แตะ nginx การแก้ไฟล์เหล่านี้บนเครื่องต้องใช้สคริปต์ที่ operator อนุมัติ แล้วแก้ไฟล์ในรีโปให้ตรงกัน

บนเครื่อง staging `deploy/nginx/gacp-platform.conf` ยังมีหน้าเปล่าของสองชื่อนี้ (`/__gacp_blank`) เก็บไว้เป็นจุดถอยกลับ
ถ้าวันหนึ่งชี้ DNS กลับมาที่เครื่อง staging

## การสาธิต (demo)

**ใช้ `demo.gacpth.com`** ถ้ามีใครเปิด `gacpth.com` จะเห็นหน้าแจ้งว่ายังไม่เปิดให้บริการ นั่นคือพฤติกรรมที่ถูกต้อง

**การสาธิต QR ของใบรับรอง** ให้ **เปิดหน้าตรวจสอบบนเครื่องที่เชื่อมต่อได้แล้วฉายให้ดู**
ห้ามให้ผู้ชมสแกน QR ด้วยมือถือตัวเอง เพราะเส้นทางตรวจสอบสาธารณะ (`/verify/`) ยังไม่เปิด
และมีเงื่อนไขสามข้อที่ต้องแก้ก่อนจะเปิดได้ (บันทึกไว้ใน `BACKLOG-FOUND.md`)
มือถือของผู้ชมอยู่นอก allowlist จึงจะได้หน้า block ไม่ใช่หน้าใบรับรอง

## ข้อควรระวัง: `dev.gacpth.com` และ `api.gacpth.com` ยังไม่มี vhost ของตัวเอง

DNS ของทั้งสองชี้มาที่เครื่องเดียวกันแล้ว แต่ในรีโปมี server block แค่สองชุด
คือ `gacpth.com localhost _` (`deploy/nginx/gacp-platform.conf`) และ `staging.gacpth.com`
(`deploy/nginx/staging.gacpth.com.conf`) และ **ไม่มี `default_server` ที่ไหนเลย**

เครื่องหมาย `_` ไม่ใช่ wildcard เป็นเพียงชื่อที่ไม่มีวันตรงกับ Host จริง เมื่อไม่มี server block ใดตรงกับ
`dev.gacpth.com` nginx จะใช้ server block แรกของ listen address นั้น ซึ่งเรียงตามชื่อไฟล์ใน
`sites-enabled/` แล้วได้ vhost ของ production **ทั้งสองชื่อจึงตกไปที่ stack production**

ผลคือคนที่อยู่ใน allowlist และคิดว่ากำลังทดลองบน dev จะกำลังทำงานกับข้อมูลจริง
รายละเอียดและหลักฐานอยู่ใน `BACKLOG-FOUND.md` รายการวันที่ 2026-08-04

**ยังไม่ต้องแก้ตอนนี้** operator ตัดสินแล้วว่าไม่แยก vhost ในรอบนี้ เพราะไม่มีการแก้ server block แล้ว
แต่ต้องจัดการก่อนจะเปิดสิทธิ์ให้คนเพิ่มเข้ามาใช้ dev
