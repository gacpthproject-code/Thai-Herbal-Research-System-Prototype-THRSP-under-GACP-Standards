# security-review · 2026-09-15T23:53:34Z · branch chore/retire-forgot-password 1de927a5 vs origin/main 00bb27b8

ผล: **No security findings meeting the confidence threshold** (เกณฑ์ >0.8 confidence, HIGH/MEDIUM เท่านั้น)

branch นี้เป็นการลบ surface อย่างเดียวในส่วนที่เกี่ยวกับความปลอดภัย ไฟล์แกนความปลอดภัยไม่ถูกแตะเลย
(auth-middleware, validate, api-response, jwt-security, rate-limiter, system/provider.js, admin-user-actions-helpers)

สิ่งที่ตรวจแล้วปลอดภัย:
- ไม่มีทางใหม่ให้ใครสร้าง token รีเซ็ต: ผู้เขียน passwordResetToken เหลือ buildForceResetPayload ที่เรียกได้จาก
  POST /:id/force-password-reset ซึ่งมี authenticateProvider + ด่าน isAdminCaller 403 (ไฟล์ไม่ถูกแตะ)
- ปลายทางไถ่ token ยังคุมเหมือนเดิม: validate(resetPasswordWithTokenSchema), หา token ด้วย SHA-256, ตรวจวันหมดอายุ,
  ใช้ครั้งเดียว, ล้าง loginAttempts/isLocked, ประทับ sessionsRevokedAt และ revokeAllUserTokens
- passwordResetLimiter mount แบบ prefix จึงยังครอบ /reset-password/:token (เปลี่ยนแค่คอมเมนต์)
- ไม่มี wildcard route ใน auth-health.js ที่จะมารับ POST /reset-password ที่ว่างลง
- การถอด /forgot-password ออกจาก role-utils ไม่กระทบการตัดสิน auth: ตัวคุมจริงคือ middleware.ts ที่มีรายการของตัวเอง
- ไม่มี reference ค้างฝั่ง client/contract (mobile + openapi) และ openapi ไม่มี generator/contract test ใช้
- ถอดแถว SMTP_PASSWORD เป็น fail-closed: getSecret() โยน error กับชื่อที่ไม่อยู่ใน catalog และไม่มีผู้เรียกเหลือ
- เทส guard ใหม่อ่านเฉพาะ source ที่อยู่ใน repo และ .env.*.example ไม่ได้อ่านค่าลับ
- error code 4 ตัวที่ลบไม่มีผู้ส่ง จึงไม่มี handler ไหนตกไปหา status ที่ไม่มีนิยาม
- nodemailer หายจาก lockfile ทั้งหมด ไม่มีแพ็กเกจอื่นพึ่งพา การถอด override จึงไม่ทำให้เวอร์ชันเก่ากลับมา
