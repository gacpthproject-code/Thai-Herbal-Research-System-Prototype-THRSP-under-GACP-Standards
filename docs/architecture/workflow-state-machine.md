<!-- สร้างโดย scripts/docs/generate-architecture-diagrams.js ห้ามแก้ด้วยมือ -->

# ตารางอ้างอิงวงจรสถานะคำขอ

ที่มา: `apps/backend/services/workflow-transition-service.js` · ป้ายบนจอ: `apps/web-app/src/lib/constants/workflow-states.ts` · แผนภาพ: [diagrams/application-states.md](diagrams/application-states.md)

## เส้นที่เดินได้และบทบาทที่เดินได้

| จาก | ไป | บทบาท |
|---|---|---|
| `DRAFT` | `SUBMITTED` | `health` |
| `SUBMITTED` | `PENDING_DOC_FEE` | `system` |
| `SUBMITTED` | `DOC_FEE_PAID` | `system` |
| `PENDING_DOC_FEE` | `DOC_FEE_PAID` | `system` |
| `PENDING_DOC_FEE` | `EXPIRED` | `system` |
| `PENDING_DOC_FEE` | `CANCELLED` | `health` |
| `DOC_FEE_PAID` | `ASSIGNED_FOR_REVIEW` | `dispatcher` |
| `DOC_FEE_PAID` | `CANCELLED` | `health` `system` |
| `ASSIGNED_FOR_REVIEW` | `DOC_APPROVED` | `document_reviewer` |
| `ASSIGNED_FOR_REVIEW` | `REVISION_REQUESTED` | `document_reviewer` |
| `REVISION_REQUESTED` | `ASSIGNED_FOR_REVIEW` | `health` |
| `REVISION_REQUESTED` | `EXPIRED` | `system` |
| `DOC_APPROVED` | `PENDING_AUDIT_FEE` | `system` |
| `PENDING_AUDIT_FEE` | `AUDIT_FEE_PAID` | `system` |
| `PENDING_AUDIT_FEE` | `EXPIRED` | `system` |
| `AUDIT_FEE_PAID` | `AUDIT_CONFIRMED` | `dispatcher` |
| `AUDIT_FEE_PAID` | `CANCELLED` | `system` |
| `AUDIT_CONFIRMED` | `AUDIT_PASSED` | `field_inspector` |
| `AUDIT_CONFIRMED` | `AUDIT_NOT_PASSED` | `field_inspector` |
| `AUDIT_CONFIRMED` | `CAR_PENDING` | `field_inspector` |
| `AUDIT_CONFIRMED` | `CANCELLED` | `system` |
| `CAR_PENDING` | `CAR_REVIEWING` | `health` |
| `CAR_PENDING` | `EXPIRED` | `system` |
| `CAR_REVIEWING` | `AUDIT_PASSED` | `field_inspector` |
| `CAR_REVIEWING` | `CAR_PENDING` | `field_inspector` |
| `CAR_REVIEWING` | `AUDIT_CONFIRMED` | `dispatcher` |
| `AUDIT_PASSED` | `APPROVED` | `certificate_approver` |
| `AUDIT_PASSED` | `CAR_REVIEWING` | `field_inspector` `certificate_approver` |
| `AUDIT_PASSED` | `REJECTED` | `certificate_approver` |
| `AUDIT_NOT_PASSED` | `REJECTED` | `certificate_approver` |
| `AUDIT_NOT_PASSED` | `CAR_PENDING` | `certificate_approver` |
| `APPROVED` | `CERTIFIED` | `certificate_approver` |
| `EXPIRED` | `REVISION_REQUESTED` | `system` |
| `EXPIRED` | `CAR_PENDING` | `system` |

## สถานะปลายทางที่ต้องมีเหตุผลประกอบ (`REQUIRES_COMMENT_TARGETS`)

- `REVISION_REQUESTED`
- `CAR_PENDING`
- `REJECTED`

## สถานะที่ผู้ยื่นแก้ฟอร์มได้ (`EDITABLE_STATUSES`)

- `DRAFT`
- `REVISION_REQUESTED`
- `CAR_PENDING`
