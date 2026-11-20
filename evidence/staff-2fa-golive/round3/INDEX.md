# หลักฐาน chore/staff-2fa-golive รอบ 3 (ชั้น C · คำสั่ง 93 และ 94 · ผลตรวจอิสระ f806ee7c3)

ฐานที่แตกกิ่ง: origin/main 4b549f17c · รอบ 2 จบที่ f806ee7c3 · รอบ 3: a51720097 (RED) → f32833c29 (GREEN) → 66e4becfe (RED รายงานคำสั่ง 94 ข้อ 5) → bdfabd01f (GREEN รายงาน + คู่มือ) → merge origin/main → หลักฐาน
บันทึกการตัดสินใจ: `decisions.tsv` (แผนที่กลไก session ทุกแถวพร้อม file:line · การออกแบบรหัสเดียว · การใช้รหัสสำรองแบบอะตอม · แจ้งผู้ดูแล · การเก็บเครื่องที่ย้าย)

## สิ่งที่วัดแล้วใน session นี้ (ผลรันจริง นอก heavy.sh เพราะไม่แตะฐานข้อมูล)

| สิ่งที่วัด | ว่าอะไร | ผล |
|---|---|---|
| ชุดหน่วย backend ที่ RED (a51720097) | a-locked-out-officer-can-still-enrol · staff-2fa-emergency-reset-refuses · session-epoch-refresh · staff-mint-boundary-forces-second-factor | แดงตามที่คาดทุกข้อ: ค่าคงที่ 15 นาที undefined · ตั๋วหมดอายุตอบ TOKEN_EXPIRED · ยามปล่อยตั๋วก่อน epoch/บัญชีปิด/jti ถูก blocklist (next ถูกเรียก) · คุกกี้ชนะตั๋ว (next ไม่ถูกเรียก) · /refresh 200 ให้เจ้าหน้าที่ · ผู้ออก token กลาง resolve แทน reject |
| ชุดหน้าจอที่ RED | mfa-reenrol · mfa-enrolment-branch-has-a-screen · notification-preferences | แดงตามที่คาด: หัวข้อกลุ่ม `uppercase tracking-widest` · ไม่มีแถว STAFF_SECOND_FACTOR_CHANGED · ฟอร์มบอก "รหัสไม่ถูกต้อง" เมื่อตั๋วหมดเวลา · ปิด MFA รหัสผิดแล้วออกจากระบบ · ไม่มีปุ่มย้ายด้วยรหัสสำรองที่ใช้เข้าสู่ระบบ |
| ชุดหน่วย backend ที่ GREEN (f32833c29) | 14 ชุด: ชุดใหม่ 4 · mfa-setup-reenrol · mfa-reenrol-hardening · the-enrolment-loop · second-factor-doors · mfa-roundtrip · notification-preferences-service · closing-review-fixes · refresh-token-blocklist · disabled-account-cannot-hold-session · auth-service | 217/217 (หลังปรับ fixture ตามสัญญาใหม่ ดู decisions.tsv) |
| ชุดหน้าจอที่ GREEN | 3 ชุดเดิม | 48/48 |
| error codes | `--markdown` แล้ว `--validate` | 468/468 (เพิ่ม MFA_SETUP_TICKET_EXPIRED, MFA_DISABLE_NOT_FOR_STAFF, AUTH_STAFF_SECOND_FACTOR_REQUIRED, REFRESH_NOT_FOR_STAFF) |
| ratchet | `scripts/probes/ratchet.sh` | PASS hardcode 26 · todo 33 · env-direct 95 · dup-source 0 |
| tier-check | `scripts/probes/tier-check.sh` | TIER=C (auth-identity) |
| eslint | 17 ไฟล์ backend ที่แก้ | 0 errors (ลบ import ที่ไม่ได้ใช้ 1 ตัวก่อน commit) |

## งานหนัก (heavy.sh งานเดียว `harness/job-round3.sh` · เข้าคิวตอนเขียนส่วนนี้ · รันแล้ว 2026-10-20 23:36-23:39 ดูส่วนผลงานหนักท้ายไฟล์)

คำสั่ง: `~/work/state/heavy.sh bash /tmp/staff-2fa-golive/round3/job.sh` (สำเนาของ `harness/job-round3.sh`) · ผลลง `/tmp/staff-2fa-golive/round3/logs/` (`job.txt` สรุปทีละขั้น) และภาพหน้าจอลง `/tmp/staff-2fa-golive/round3/shots/`
coordinator คัดลอกผลเข้า `runs/` และภาพเข้า `shots/` หลัง gitleaks ทีละไฟล์ (คำสั่ง 82) แล้ว commit เป็นหลักฐาน · ถ้าคิวไม่ขยับ รันซ้ำได้ด้วยคำสั่งเดิม

งานนี้ทำตามลำดับ:
1. RED บน a51720097: `staff-2fa-sessions-revoked` · `staff-2fa-one-code-rebind` · `staff-2fa-emergency-reset` (คาด: แดง: สคริปต์ไม่ประทับ epoch · ไม่มี useSignInProof · รหัสซ้ำได้ · ไม่มี MFA_DISABLE_NOT_FOR_STAFF · ตั๋ว 10 นาที · ฯลฯ)
2. GREEN บนหัวกิ่ง: ชุดใหม่สองชุด · reset · rebind · doors · ชุดหน่วย 13 ชุด · ชุด sessions/one-code/rebind บน Redis จริง (`GACP_TEST_REDIS_URL`)
3. mutant 10 ตัวบนหัวกิ่ง แต่ละตัวต้องทำให้ชุดของมันแดง: R1 ข ไม่ประทับ epoch · R2 ข ไม่ลบช่องพักใน Redis (Redis จริง) · R3 ก ออก token ให้เครื่องที่ย้ายก่อน epoch · R4 ก ไม่ประทับ epoch (เครื่อง B รอด) · R5 ใช้รหัสสำรองแบบไม่อะตอม · R6 ไม่แจ้งผู้ดูแล · R7 สคริปต์เปิดธงไม่ประทับ · R8 ยามตั๋วไม่ตรวจ epoch · R9 หลักฐานการเข้าสู่ระบบใช้ซ้ำได้ (Redis จริง) · R10 เจ้าหน้าที่ปิด 2FA ได้
4. ทะเบียนรายชื่อบน seed ที่มีแถวบทบาทสะกด ` Document_Reviewer ` และแถววิธี EMAIL · สคริปต์ตัด session ตอนเปิดธง (ธงปิด = ปฏิเสธ · ธงเปิด = นับบัญชี) · ทะเบียนรายชื่ออีกครั้ง (คอลัมน์ตัด session)
5. backend จริง (`server.js` โหมด production จาก `git archive HEAD`) + `next dev` + Chromium: ภาพหน้าจอ 390x844 และ 1440x900 ของ การลงทะเบียน (รหัสสำรอง + ยืนยันบันทึกแล้ว) · หน้าความปลอดภัยหลังเข้าด้วยรหัสสำรอง · การย้ายด้วยรหัสเดียวถึงรหัสชุดใหม่ที่แสดงครั้งเดียว · แจ้งเตือนของเจ้าของ · ส่วนปิด 2FA ที่ถูกแทนด้วยคำชี้ทางย้าย (ธงเปิด) · หน้าตั้งค่าการแจ้งเตือน · กล่องของผู้ดูแล · แล้วเริ่ม backend ใหม่ธงปิด: ปิด 2FA ด้วยรหัสผิดแล้วยังอยู่ในระบบ (`capture-round3.mjs` พิมพ์ JSON สรุป url และ overflow แนวนอนต่อภาพ)

## สิ่งที่ไม่ได้รันโดยตั้งใจ
- ไม่แตะ staging หรือ demo · ไม่รันสคริปต์ ข สคริปต์เปิดธง หรือรายงาน ที่ไหนนอกฐานข้อมูลชั่วคราว
- RED ของเทสต์รายงานคำสั่ง 94 ข้อ 5 (66e4becfe) ไม่อยู่ในงานหนักที่เข้าคิว (RED sha ของงานคือ a51720097) ลำดับ commit แสดงเทสต์ก่อนสคริปต์
- full gate และการตรวจอิสระ (code + security คำสั่ง 77) เป็นของ coordinator · deslop/no-comments ไม่ได้รันเป็น skill (ตรวจ diff ด้วยมือ)

## ผลงานหนักรอบ 3 ที่รันแล้ว (เก็บ 2026-10-21 จาก `/tmp/staff-2fa-golive/round3/logs` และ `shots` · gitleaks ผ่านทีละไฟล์ · ไม่มีเลข 13 หลักในไฟล์ที่คัดลอก)

หัวข้อนี้ตรงกับผลรันจริงเท่านั้น และขัดกับรายงานรอบ 3 ในหลายข้อ (ดูบรรทัดสถานะ) log ดิบของชุดหน่วย 15 ชุด (`green-head-units`, 195 ข้อผ่าน) และ log จาก `next dev` / `serve` ไม่ได้คัดลอก สรุปไว้ใน `runs/job.txt` · ชุดทดสอบ Postgres จริงรันกับ Postgres ชั่วคราว ชุด `-real-redis` รันกับ Redis ชั่วคราวจริง

### RED ที่ a51720097 กับ GREEN ที่ head 4df5c35f9
| ชุด | RED | GREEN (Redis จำลอง) | GREEN (Redis จริง) |
|---|---|---|---|
| sessions (`staff-2fa-sessions-revoked-real-postgres`) | ชุดโหลดไม่ได้ ไม่พบโมดูล `mfa-rebind-proof-store` (0 ข้อรัน) | ผ่าน 7 ล้ม 1 จาก 8 | ผ่าน 7 ล้ม 1 จาก 8 |
| one-code (`staff-2fa-one-code-rebind-real-postgres`) | ชุดโหลดไม่ได้ ไม่พบโมดูลเดียวกัน (0 ข้อรัน) | ผ่าน 9 ล้ม 1 จาก 10 | ผ่าน 9 ล้ม 1 จาก 10 |
| reset (`staff-2fa-emergency-reset-real-postgres`) | ล้ม 2 ผ่าน 9 จาก 11 | ผ่าน 10 ล้ม 1 จาก 11 | ไม่ได้รัน |
| rebind | ไม่ได้รัน | ผ่าน 3 จาก 3 | ผ่าน 3 จาก 3 |
| doors | ไม่ได้รัน | ผ่าน 25 จาก 25 | ไม่ได้รัน |
| ชุดหน่วยรวม | ไม่ได้รัน | ผ่าน 195 จาก 195 | ไม่ได้รัน |

บรรทัดสถานะ: สามชุดแรกไม่เขียว ข้อที่ล้มทั้ง 4 ข้อ (ชุดละ 1 ข้อ ซ้ำในโหมด Redis จริง) คือ (1) sessions "after the script, both devices, the pending challenge..." คาด `TOKEN_REVOKED` ได้ `undefined` ที่บรรทัด 266 (2) one-code "the sign-in with a backup code proves the move..." ได้ 401 จากการเข้าระบบด้วยรหัสสำรอง (3) reset "a DTAM admin of the same organization resets a reviewer..." `/mfa/setup` ด้วย setup ticket ได้ 401 แทน 200 บรรทัด 195 · สาเหตุยังไม่ได้ตรวจ เก็บเป็นข้อค้นพบ ไม่ได้แก้โค้ด · RED ของ sessions และ one-code ล้มเพราะไฟล์โมดูลยังไม่มี ไม่ใช่เพราะพฤติกรรมผิด (`runs/job.txt` ติดป้ายว่า "SKIPPED-ONLY (no database?)" ซึ่งไม่ตรงกับ log)

### Mutant R1-R10 บน head (ล้มเปล่า = มี log ล้ม แต่ต้องดูว่าข้อที่ล้มคือข้อใหม่หรือข้อที่ล้มอยู่แล้วที่ GREEN)
| mutant | แก้อะไร (`runs/mutant-*.diff`) | ข้อที่ล้ม | อ่านผล |
|---|---|---|---|
| R1 ทาง ข ไม่ประทับ epoch | ลบ `sessionsRevokedAt` ออกจากการล้าง | 1 (ข้อเดียวกับที่ล้มที่ GREEN) | ไม่พิสูจน์ ข้อที่ควรจับล้มอยู่แล้วโดยไม่มี mutant |
| R2 ทาง ข ไม่ลบช่องพัก Redis | ตัด `clearStore` (Redis จริง) | 1 (ข้อเดียวกับ GREEN) | ไม่พิสูจน์ เหตุผลเดียวกัน |
| R3 ย้ายแล้วตัดเครื่องที่ทำเอง | `iat` ลด 2 วินาที | 2 (ข้อ GREEN ที่ล้มอยู่ + ข้อ "device A moves the factor") | จับได้ด้วยข้อใหม่ |
| R4 ย้ายแล้วเครื่องอื่นรอด | `sessionsRevokedAt: undefined` | 2 (เหมือน R3) | จับได้ด้วยข้อใหม่ |
| R5 รหัสสำรองใช้ไม่ atomic | `AND true` แทน `@>` | 3 (ข้อ GREEN ที่ล้มอยู่ + ข้อพร้อมกัน `/setup` และ `/verify`) | จับได้ด้วย 2 ข้อใหม่ |
| R6 ไม่แจ้งผู้ดูแล | ตัด `notifySameSideAdmins` | 3 (ข้อ GREEN + 2 ข้อใหม่ รวมข้อ "company-side move is told to the platform admins") | จับได้ด้วย 2 ข้อใหม่ |
| R7 เปิดธงแล้วไม่ประทับ | `updatedAt` แทน `sessionsRevokedAt` | 2 (ข้อ GREEN + ข้อ "a staff session and an admin session issued before the run...") | จับได้ด้วยข้อใหม่ |
| R8 ตัวกั้นตั๋วไม่ดู epoch | `if (false)` | 2 (ข้อ GREEN + ข้อ "a ticket issued before the account epoch is refused") | จับได้ด้วยข้อใหม่ |
| R9 หลักฐานใช้ซ้ำได้ | `return true` ใน consume (Redis จริง) | 1 (ข้อเดียวกับที่ล้มที่ GREEN) | ไม่พิสูจน์ ข้อที่ควรจับล้มอยู่แล้ว |
| R10 เจ้าหน้าที่ปิด 2FA เองได้ | `if (false)` | 2 (ข้อ GREEN + ข้อ "DELETE /disable answers 403...") | จับได้ด้วยข้อใหม่ |

สรุป: จับได้ด้วยข้อใหม่ 7 ตัว (R3 R4 R5 R6 R7 R8 R10) ไม่พิสูจน์ 3 ตัว (R1 R2 R9) เพราะข้อทดสอบที่ต้องจับมันล้มอยู่แล้วที่ GREEN

### ทะเบียนรายชื่อและสคริปต์เปิดธง (`runs/roster-*.txt` `runs/flag-on-script*.txt`)
- ก่อนเปิดธง ทะเบียนแสดงบัญชีเจ้าหน้าที่ที่ใช้งานอยู่ 5 บัญชี ลงทะเบียนแล้ว 2 ยังไม่ลงทะเบียน 3 คอลัมน์ "ตัด session ตั้งแต่เปิดธงแล้ว" เป็น ไม่ใช่ ทุกแถว อีเมลถูกปิดบังเป็น `s***@example.test` บทบาทที่สะกดต่างจากปกติถูกนับ (1 แถว) และบัญชีวิธีเดิมที่ปลดแล้วถูกนับเป็นยังไม่ลงทะเบียน (1 แถว)
- สคริปต์เปิดธงรันแล้วตัด 5 บัญชี exit 0 พิมพ์เวลา epoch รอบสอง `runs/flag-on-script-refused.txt` สคริปต์ปฏิเสธเมื่อธงไม่เปิด exit 2 หลังรัน ทะเบียนแสดง "ตัด session ตั้งแต่เปิดธงแล้ว" เป็น ใช่ ทุกแถว

### ภาพหน้าจอ (มี 2 จาก 16 ที่วางแผน)
`harness/capture-round3.mjs` ถ่ายสำเร็จเฉพาะ 390x844 ขั้นแรก ขั้นที่ 2 (เข้าด้วยรหัสสำรองแล้วย้าย) หมดเวลา 30 วินาทีที่ `waitForURL` เพราะ `POST /api/mfa/verify` ตอบ 401 (บรรทัดใน `serve-flag-on.log` ที่เห็นในงาน ไม่ได้คัดลอก) ซึ่งตรงกับข้อ one-code ที่ล้มข้างบน ผลคือไม่มีภาพ 03-08, ไม่มีภาพ 1440x900 เลย, และเฟส flag-off พังด้วย `Cannot read properties of undefined (reading 'toUpperCase')` เพราะไม่มี secret ใหม่จากการย้าย (`runs/capture-flag-on.json` `capture-flag-off.json`) ไม่ได้รันซ้ำ เพราะต้นเหตุเป็นข้อล้มจริงของโค้ด ไม่ใช่ของคิว

1. `shots/390x844-01-enrolment-codes-and-confirmation.png` มือถือ 390x844 หน้าลงทะเบียน 2FA ของเจ้าหน้าที่ใหม่ หัวข้อ "ตั้งค่ายืนยันตัวตนสองชั้น" คำอธิบายว่าต้องผูกเครื่องก่อนเข้าใช้งานครั้งแรก กล่องรหัสตั้งค่าสำหรับแอป ปุ่มคัดลอก ส่วน "รหัสสำรอง" 10 รหัส (บัญชีทดสอบบนฐานชั่วคราว) ปุ่ม "คัดลอกทั้งหมด" ช่องติ๊ก "บันทึกรหัสสำรองแล้ว" ยังไม่ติ๊ก ช่องรหัส 6 หลัก ปุ่ม "ยืนยันและเปิดใช้งาน" จางเพราะกดไม่ได้ และข้อความ "กรุณาใช้เลขประจำตัว 13 หลักและรหัสผ่านที่ได้รับจากระบบ" ไม่มีแถบเลื่อนแนวนอน (overflow 0px)
2. `shots/390x844-02-enrolment-done.png` มือถือ 390x844 หน้า "เปิดใช้งานเรียบร้อย" บอกว่าลงทะเบียนเสร็จ รหัสสำรองแสดงไปแล้วจะไม่แสดงอีก ปุ่ม "กลับไปเข้าสู่ระบบ" และลิงก์ "กลับหน้าหลัก" ไม่มีแถบเลื่อนแนวนอน (overflow 0px)

ภาพทั้งสองแสดงเฉพาะขั้นลงทะเบียน ไม่ได้พิสูจน์การย้ายด้วยรหัสเดียว ข้อความแจ้งเตือน ส่วนปิด 2FA ที่ถูกแทน หรือกล่องของผู้ดูแล
