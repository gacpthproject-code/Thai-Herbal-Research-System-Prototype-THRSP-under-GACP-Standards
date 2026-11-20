# no-recovery บน main — 2026-09-26

cherry-pick ของ `e73bab1c` (wave2/no-recovery, 2026-09-17) ลงบน main `9ce3db30` · สาขา `fix/no-recovery` · Tier C (`tier-check.txt`)
มติ operator 2026-09-17 "เราไม่มีการกู้บัญชี" · 2026-09-26: รีเซ็ตรหัสผ่านและ 2FA จะไปใช้ของหมอพร้อม อีเมลคงเป็นข้อมูล/ช่องทางติดต่อ

| artifact | พิสูจน์อะไร |
|---|---|
| `red-backend.txt` | เทส backend 7 ไฟล์ของคอมมิต รันกับไฟล์ production ของ main (`git checkout 9ce3db30 -- <prod files>`): 12 failed / 124 passed (136) |
| `red-web.txt` | เทส web 5 ไฟล์ รันกับไฟล์ production ของ main: 6 failed / 26 passed (32) |
| `green-backend.txt` · `green-web.txt` | ชุดเดียวกันบน HEAD: 136/136 · 32/32 |
| `backend-full.txt` | backend jest เต็ม (`--silent --forceExit`, SIGNING_KEY_DIR แยกใน scratchpad): 844 passed / 31 skipped suites · 10,851 passed / 207 skipped · exit 0 — **ไม่มี Postgres ในรอบนี้ ชุด integration จึง skip ตัวเอง** เทียบกับ main ได้เฉพาะ "ไม่มีตกใหม่" (`fail-branch.txt` ว่าง, `fail-main.txt` = 11 ชุดของ attestation f6932758) ยังไม่ใช่ full-gate บน DB จริง |
| `key-mtime-before.txt` · `key-mtime-after.txt` | `apps/backend/keys/private.pem` ของ tree หลักไม่ถูกแตะ (mtime เท่าเดิม 2026-09-05) |
| `web-full.txt` | web jest เต็ม: 389 suites / 3,194 tests ผ่านทั้งหมด (main 387/3,190 — +2 ไฟล์เทสใหม่) |
| `web-tsc.txt` | `tsc --noEmit` exit 0 |
| `view-pack/` | ภาพจริงจาก Chromium (Playwright) กับ `next dev` ในเครื่อง — before = ไฟล์ web ของ main สลับเข้าชั่วคราว, after = HEAD |

## view-pack

ข้อจำกัด: ไม่มี backend/DB — ทุก `/api/**` ตอบด้วย fixture ใน `view-pack/shoot.cjs` (บัญชีปลอม `สมชาย ใจดี` ถูกล็อก + เปิด 2FA)
cookie เป็น JWT ที่ไม่ได้เซ็น (middleware อ่าน role โดยไม่ตรวจลายเซ็น) · แถบ "โหลดพื้นที่ทำงานไม่สำเร็จ" บนหน้า health มาจาก fixture ไม่ใช่จากงานนี้

| ภาพ (before → after) | ควรเห็นอะไร |
|---|---|
| `*-01-health-security.png` (390×844) | ก่อน: "ไม่มีการรีเซ็ตรหัสผ่านทางอีเมลหรือ SMS" + "หากเข้าสู่ระบบไม่ได้…ติดต่อเจ้าหน้าที่ DTAM" · หลัง: "ระบบนี้ไม่มีการกู้บัญชี…" + "ให้เปลี่ยนรหัสผ่านทันที" |
| `*-02-health-privacy.png` (390×844) | ก่อน: "หลังจากผ่าน 30 วันแรก คุณจะไม่สามารถกู้คืนบัญชีได้อีก" · หลัง: "ลบแล้วจะกู้คืนบัญชีไม่ได้ เพราะระบบไม่มีการกู้บัญชี" |
| `*-04-provider-row-actions.png` + `*-04-aria-labels.txt` | ก่อน: แถวมีปุ่มกุญแจสีเหลือง `Force password reset for สมชาย ใจดี` · หลัง: ไม่มีปุ่มนั้น (diff aria-label ต่างกันบรรทัดเดียว) |
| `*-05-provider-reset-button-pressed.png` + `*-05-note.txt` | ก่อน: กดปุ่มกุญแจ → dialog "ออกโทเค็นรีเซ็ตรหัสผ่าน" · หลัง: ไม่มีปุ่มให้กด |
| `*-06-provider-edit-dialog.png` | **ยังอยู่ทั้งก่อนและหลัง**: dialog แก้ไขพนักงานมีช่อง "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" → `PUT /api/provider/directory/:id` hash แล้วเขียนทับรหัสของพนักงานคนอื่น (`apps/backend/routes/api/system/provider.js` ใน handler `router.put('/:id')`) — เส้นรีเซ็ตโดยเจ้าหน้าที่ที่คอมมิตเดิมไม่ได้แตะ รอ operator ตัดสิน |
