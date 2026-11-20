# Wave 1 — ช่องโหว่ที่ production โดนอยู่ · 2026-09-17

ที่มา: ผลตรวจทั้งระบบ 2026-09-17 (คะแนน 5.0/10) + มติ operator วันเดียวกัน
"ที่เหลือแก้ให้ถูกต้องให้หมด" และ "demo = production server" (demo.gacpth.com เปิดสาธารณะต่อ)
ฐาน: `origin/main` b4d7bc06 (โค้ดที่รันบน demo และ staging วันนี้) · Tier C (auth/identity/compose/governance) → operator merge + deploy

## ก่อนแก้ — วัดได้จริง

| เรื่อง | วัดอย่างไร | ผล |
|---|---|---|
| ใครก็ได้ทำ API ค้าง (BACK-01) | benchmark middleware จริงบนเครื่องนี้ | ข้อความ 200 KB `onon…` ใช้เวลา **21.5 วินาที** (`input-limits/red.txt`) |
| multer crash (SECU-02) | payload ของ GHSA-wc9g ทั้ง 7 ประตูอัปโหลด | `RangeError: Invalid array length` ไม่ถูกจับ (`input-limits/red.txt`) |
| Next.js critical (SECU-01) | `node_modules/next` ใน container `gacp-frontend-demo` + GitHub Advisory API | `15.5.21` · GHSA-2xp9-vwfh-vxw4 แก้ใน 15.5.24 |
| dependency ที่มีช่องโหว่ | `dependency-audit` บน lockfile ของ main | **13 ข้อ high/critical (critical 2)** (`deps/red-probe-on-main.txt`) |
| demo ไม่มี gate | `nginx -T` ของเครื่องจริง | `$gacp_demo_deny { default 0; }` · repo ยังบอกว่ามี gate (`nginx/probe-red-and-after.txt`) |
| บัญชีที่ถูกระงับยังล็อกอินได้ (SECU-03) | router จริง + bcrypt จริง | ได้ 200 + token (`disabled-login/red.txt`, `session-status/red.txt`) |
| เกษตรกรปลอมผลแล็บได้ (BACK-02/X01) | router จริง + service จริง | 34 กรณีได้ 200 แทน 400/409 (`harvest-guard/red.txt`) |
| ผู้สมัครย้อนสถานะคำขอได้ (ARCH-01) | ทุกสถานะที่ไม่ใช่ DRAFT × 3 ประตู | 42 กรณีผ่าน (`bundle-state/red.txt`) |

## แก้อะไร (ทุกกลุ่มผ่านรีวิวสวนอิสระ + ทดสอบแบบ mutation ว่าเทสแดงเมื่อถอดการแก้)

| กลุ่ม | commit | สรุป |
|---|---|---|
| deps | b7e7a216 | next 15.5.25 · multer 2.3.0 · sharp 0.35.4 · js-yaml 4.3.2 · nanoid 3.3.18 · browserslist 4.28.9 · probe `dependency-audit` ใหม่ (--selftest 8/8) |
| nginx | f9073717 | บันทึกมติ demo เปิดสาธารณะลง `deploy/nginx` · probe `nginx-config-drift` ใหม่ (--selftest 7/7) |
| input-limits | 294e076e → 93de060b | ตรวจอินพุตแบบเวลาเชิงเส้น (200 KB: 21.5 s → 3 ms) · body JSON 10 MB → 1 MB · ทุกประตู multer มีขีดจำกัดครบ · `/register` ตอบ 415 กับ multipart |
| disabled-login | 0ca0eb52, a14e7352 | กฎกลาง `canAccountHoldSession` ใช้ทุกประตูที่ออก session (login, mint, refresh, MFA, ThaID) · staff ต้อง ACTIVE · challenge MFA ที่ออกก่อนระงับใช้ไม่ได้ |
| session-status | df49fc82 | ตัวกลางตรวจ access token อ่านสถานะบัญชีทุกคำขอ (ปิดช่อง token ที่ออกระหว่างกดระงับ และการแก้สถานะตรงใน SQL) |
| harvest-guard | 9f4b61f5 | `PUT /harvest-batches/:id` เป็น allowlist · nested write ถูกปฏิเสธ · `POST /:id/harvest` แช่แข็งเหมือนประตูอื่น |
| harvest-lock | e605dbad | เกรดคุณภาพ (แสดงบนหน้า trace สาธารณะ) แช่แข็งหลังออกล็อต · ประตูแก้ถือ row lock เดียวกับการออกล็อต |
| bundle-state | a5801565 | bundle รับเฉพาะคำขอ DRAFT · การเขียนสถานะใช้โหมดเข้ม + expectedVersion |
| honest-limits | cb3c2097, 445e4b72 | ขีดจำกัดอัปโหลด/ขนาด body ตอบ 413/400 พร้อมรหัส (เดิม 500) · เว็บออกจากระบบทันทีเมื่อบัญชีถูกระงับและบอกเหตุผลตามจริง ไม่สัญญาการกู้บัญชี |
| signout-hardening | 15d04e66 → 776f1a14 → 07f1617f → ed894a66 → 9f1c2d28 → ff9b9359 → 0fb6616d → ea2890b2 → ef71f972 | marker บน https ใช้ชื่อ `__Host-` (subdomain พี่น้องตั้งแทนไม่ได้) · ทางลัดใน middleware เฉพาะหน้าล็อกอินสองหน้าที่มีจริง · พาออกครั้งเดียวและการพาออกเพราะถูกระงับชนะ `?expired=true` · รอบ 3–10 ตามรีวิว: สถานะ "กำลังออก" ไม่ค้างเมื่อผู้ใช้กดอยู่ต่อ, ไม่อ่อนลงเป็น "หมดเวลา" แม้กล่องถามค้าง, marker ใช้ได้ครั้งเดียว, แท็บที่สองไม่ขโมยข้อความของแท็บแรก, marker มี id ของการพาออกครั้งนั้น (รับเฉพาะรูปแบบนี้) — แท็บที่กดอยู่ต่อไม่ลบ marker ที่อีกแท็บตั้งให้ผู้ใช้อีกคน, crypto ใช้ไม่ได้ก็ยังพาออก (ตารางด้านล่าง) |

รอบของ signout-hardening — RED รันเทสใหม่กับโค้ดก่อนแก้ของรอบนั้น · GREEN รันทุกไฟล์เทสที่อ้างโมดูลที่แก้

| รอบ | RED | GREEN |
|---|---|---|
| 1 (`red.txt` / `green.txt`) | 11 ใน 13 ตก | 449/449 |
| 3 | 4 ใน 10 ตก | 516/516 |
| 4 | 5 ใน 14 ตก | 520/520 |
| 5 | 3 ใน 17 ตก | 523/523 |
| 6 | 3 ใน 32 ตก | 526/526 |
| 7 | 1 ใน 19 ตก | 103 suites · 735/735 (ขยายชุดเป็นทุกไฟล์ที่อ้าง api-client / middleware / login page) · tsc 0 · eslint 0 |
| 8 | jest 2 ใน 29 ตก · Chromium จริง กรณี Z: แท็บ 2 ไม่เห็นข้อความ (`red-round8-browser.txt`) — รอบ 7 แค่แคบช่องเหลือ 120 วินาที | 103 suites · 738/738 · tsc 0 · eslint 0 · Chromium จริง Z / M / C2 ถูกทั้งสาม (`green-round8-browser.txt`) |
| 9 | 4 ใน 80 ตก: ค่าไม่มี id ยังถูกนับ (หน้า + middleware), ค่าที่ percent-encode อ่านไม่ตรงกับ middleware, getRandomValues throw แล้วแท็บไม่ออกจากหน้า | 103 suites · 742/742 · tsc 0 · eslint 0 · Chromium จริง Z / M / C2 บน http และ https, CR (getRandomValues throw) ไปถึงหน้าที่บอกเหตุผล (`green-round9-browser.txt`) |
| 10 | — (ถอด try/catch ที่ไม่มีทางทำงาน ไม่เปลี่ยนพฤติกรรม) | 742/742 · tsc 0 · eslint 0 · Chromium จริงผลเท่ารอบ 9 (`green-round10-browser.txt`) |

ข้อจำกัดที่คงไว้ (รีวิวรอบ 8–9 ยืนยันว่าเหมือนเดิมตั้งแต่รอบ 7): ผู้ใช้คนเดียวมีสองแท็บที่มีงานค้าง ทั้งสองถูกพาออก
แล้วผู้ใช้กดอยู่ต่อในแท็บที่ตั้ง marker หลังสุดและเปิดหน้าล็อกอินเอง → แท็บแรกไปถึงหน้าที่มี reason โดยไม่เห็นข้อความ (ฉาก ZT)
ไม่มีข้อมูลข้ามผู้ใช้ · marker หมดอายุใน 120 วินาที

(รอบ 2 = 445e4b72 ในกลุ่ม honest-limits)

## ข้อเท็จจริงจาก production ที่ใช้ตัดสินความเสี่ยงของการแก้ (อ่านอย่างเดียว)

- `production-checks/user-status-counts.txt` — ทุกบัญชีเป็น ACTIVE (16) หรือ PENDING_VERIFICATION (21) ไม่มีบัญชีที่ถูกลบ → กฎใหม่ไม่ล็อกใครออก
- `production-checks/harvest-lab-counts.txt` — harvest batch = 0, ผลแล็บ = 0 ทั้ง demo และ staging → ไม่มีข้อมูลที่อาจถูกปลอมผ่าน BACK-02

## ผลทดสอบของ branch รวม

| ชุด | ผล |
|---|---|
| backend unit | **779/779 suites · 10,204 tests · EXIT=0** @ 9648689e (`test-output.txt`) |
| web-app | **387/387 suites · 3,190 tests · EXIT=0** @ 9648689e (`webapp-test-output.txt`) |
| tsc web-app | 0 @ 9648689e |
| eslint (ไฟล์ที่แก้ทั้งหมด: backend 58 · web 15) | 0 error @ 9648689e · backend warning 5 ข้อ มีอยู่แล้วบน main ทุกข้อ · web 0 |
| probe | ratchet · no-secret · no-skip · deploy-drift · status-vocab **PASS** · tier-check **TIER=C** (`probe-results.json`) |
| full gate @ ac873d86 | verdict fail เหมือน main — suite-green ตก 11 suites / 33 tests และ integration-pg ตก 9 suites / 31 tests **ชุดเดียวกับ baseline ของ main ทุกตัว** · ผ่านเพิ่ม 11 suites / 361 tests (`gate-vs-main-baseline.txt`, `evidence/gate/ac873d86….json`) |
| probe ที่แดงโดยตั้งใจ | `dependency-audit`: extract-zip 2 ข้อไม่มีเวอร์ชันแก้ — รอ operator เซ็นแถวยอมรับ · `nginx-config-drift`: repo นำหน้าเครื่อง — จะเขียวเมื่อ operator ติดตั้ง `deploy/nginx` |

## view-pack

`honest-limits/viewpack/INDEX.md` — แอปจริง (`next dev`) + backend จำลองที่ตอบ 403 ACCOUNT_INACTIVE · ฉากละ 10 รอบ
เจ้าหน้าที่ที่ถูกระงับ: ก่อนแก้ไปถึงหน้าแจ้งเตือนแค่ 0–3 ใน 10 (ถูกส่งกลับ dashboard) → หลังแก้ 10/10 ทุกโหมด ·
ลิงก์ `?reason=account_inactive` จากที่อื่นไม่ทำให้ใครหลุดและไม่แสดงข้อความเท็จอีก ·
view-pack นี้รันบน http (`next dev`) จึงใช้ marker ชื่อธรรมดา — พฤติกรรมบน https (`__Host-`) พิสูจน์ด้วยเทสของ middleware
ที่ส่ง `X-Forwarded-Proto: https` และเทส jsdom ที่หน้าเป็น `https://demo.gacpth.com` (`signout-hardening/green.txt`)

รันซ้ำบน HEAD สุดท้าย (`9648689e`, หลังรอบ 10): 100/100 ทุกโหมด · ลิงก์จากที่อื่นยังไม่แสดงข้อความเท็จ
(`signout-hardening/viewpack-final/INDEX.md`) · สองแท็บ/สองผู้ใช้ และ https: Chromium จริงกับโมดูลจริง (`signout-hardening/green-round9-browser.txt`, `green-round10-browser.txt`)

## สิ่งที่ต้องทำบนเครื่องหลัง merge (operator)

1. build image จาก SHA ของ main ที่ merge แล้ว และ deploy staging → demo ตามขั้นตอนปกติ
2. ติดตั้ง nginx จาก git: `deploy/nginx/gacp-platform.conf` และ `deploy/nginx/staging.gacpth.com.conf` → `nginx -t` → reload → `bash scripts/probes/nginx-config-drift.sh` ต้อง PASS
3. เซ็นหรือปฏิเสธแถว extract-zip ใน `scripts/probes/dependency-audit-accepted.txt`
