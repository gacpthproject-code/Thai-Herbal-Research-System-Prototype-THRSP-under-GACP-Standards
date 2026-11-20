---
description: เดิน S0–S6 ของ role เดียวผ่าน role-workflow-auditor agent (เสนอ diff เท่านั้น)
---
Dispatch role-workflow-auditor agent (.claude/agents/role-workflow-auditor.md)
สำหรับ role ที่ระบุใน argument — ใช้ **canonical role string** จาก
`apps/backend/shared/canonical-rbac.js` → `CANONICAL_ROLES` เท่านั้น (memory
role-vocabulary-three-sides, 10 ค่า ไม่มี alias):
`health` (บุคคลทั่วไป — ผู้ยื่น, **ไม่ใช่**เกษตรกร, memory role-words-health-and-provider) |
`document_reviewer` | `dispatcher` | `field_inspector` |
`certificate_approver` | `finance_officer_dtam` | `system_admin_dtam` |
`finance_officer_platform` | `system_admin_platform` | `system` (non-human)
(ชื่อเก่า reviewer/scheduler/auditor/account/admin/platform_admin/farmer เป็น alias ที่
`normalizeRole()` แปลไม่ออกแล้วโดยเจตนา — คืน `null` — ห้ามใช้ในรายงาน เพราะ `account`
เดี่ยว ๆ กลบการแยก dtam/platform):
เดิน S0–S6 แล้วตอบต่อ step: เห็นอะไร / กดอะไรได้ / อ้างข้อมูลชุดไหน / จุดไหนยังชี้ของที่ถูกถอด
— หลักฐานจาก route + middleware + Prisma query จริงเท่านั้น (file + symbol ทุกข้อ)

Output: reports/role-workflow-auditor/<date>-<role>.md — diff เสนอ ไม่ apply
ปิดท้าย: สรุป finding ที่ต้องเข้า AUDIT_LEDGER.md (id ใหม่ + severity + effort)
