# รอบ 6 chore/staff-2fa-golive (แก้ gate 92a6194ef)

| ข้อ | ต้นเหตุ | แก้ที่ | RED | GREEN |
|---|---|---|---|---|
| 1 always-on | เทสต์ pin รายการเก่า 4 ชนิด ขณะโค้ดมี 6 ชนิดตามคำสั่ง 73(1) 89 | apps/backend/__tests__/integration/always-on-notices-cannot-be-muted-real-postgres.test.js:24 | runs/red-always-on-head.txt (1 failed) | runs/green-always-on.txt (2 passed) |
| 2 admin-side-split | ชื่อฟังก์ชัน identity-service เปลี่ยน รายการ SELF_SERVICE ชี้ชื่อเก่า | scripts/probes/admin-side-split.js:55-65 | runs/red-admin-side-split.txt (exit 1) | runs/green-admin-side-split.txt (exit 0, selftest 12/12) |
| 3 error-codes pointers | 18 pointer เลื่อนบรรทัด | apps/backend/shared/error-codes.js, docs/api/error-codes.md | runs/red-error-codes-pointers.txt (1 failed) | runs/green-error-codes-pointers.txt (17 passed, validate 472) |
| 4 dispatcher-lock-order | ไม่ใช่กิ่งนี้ (ไม่แตะ scheduler) ล้มครั้งเดียวใน suite-green ผ่านใน integration-pg | ไม่แก้ | gate log suite-green.log:24787 | runs/green-dispatcher-lock-order-alone.txt (3 passed) |
| 5 mfa-verify-guards | แก้ในรอบ 5 | ไม่แก้ | gate log | runs/green-mfa-verify-guards.txt (6 passed) |

งานหนักหนึ่งงาน: harness/job-round6.sh ผ่าน heavy.sh
