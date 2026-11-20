-- ย้อนฐานจำลองกลับไปสภาพ "ก่อนเปลี่ยนคำ" ให้เหมือนของจริงบน staging/demo
BEGIN;

-- 1. ถอนแถวทะเบียน migration ออก เพื่อให้ migrate deploy มองว่ายังค้าง
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260910120000_rename_role_vocabulary';

-- 2. users.role กลับเป็นคำเก่า
UPDATE "users" SET "role" = 'auditor'        WHERE "role" = 'field_inspector';
UPDATE "users" SET "role" = 'scheduler'      WHERE "role" = 'dispatcher';
UPDATE "users" SET "role" = 'approver'       WHERE "role" = 'certificate_approver';

-- 2b. เติมค่าดิบที่สกปรกจริงตามที่แผนที่บอกว่ารองรับ (ตัวพิมพ์ใหญ่ · ช่องว่างหน้าหลัง · นามแฝง)
--     authType = EMAIL_LEGACY เพราะด่านตัวตน (users_auth_type_identity_ck) บังคับให้แถวที่ไม่มี
--     ตัวตนกระทรวงต้องประกาศตัวเองเป็นแบบเดิม — แถวซ้อมไม่ควรถือ providerId ซ้ำกับใคร
INSERT INTO "users"
  (id, uuid, "updatedAt", password, "role", "canonicalId", "organizationId", email,
   "firstName", "lastName", "accountType", "authType")
SELECT
  'u_rewind_' || v.tag,
  gen_random_uuid()::text,
  CURRENT_TIMESTAMP,
  u.password,
  v.raw,
  'canon_rewind_' || v.tag,
  u."organizationId",
  'rewind-' || v.tag || '@gacp.go.th',
  'ซ้อม',
  v.tag,
  'PROVIDER',
  'EMAIL_LEGACY'
FROM (VALUES
    ('head_auditor',    'head_auditor'),
    ('mixedcase',       '  Auditor  '),
    ('inspector',       'inspector'),
    ('final_approver',  'final_approver'),
    ('reviewer_auditor','reviewer_auditor'),
    ('farmer',          'farmer')
  ) AS v(tag, raw)
CROSS JOIN LATERAL (SELECT password, "organizationId" FROM "users" WHERE "role" = 'admin' LIMIT 1) u;

-- 3. role_groups กลับเป็นคำเก่า และลบบทบาทใหม่ทิ้ง (ของจริงยังไม่เคยมี)
UPDATE "role_groups" SET "code" = 'auditor',   "titleTH" = 'ผู้ตรวจประเมิน', "titleEN" = 'Auditor'   WHERE "code" = 'field_inspector';
UPDATE "role_groups" SET "code" = 'scheduler', "titleTH" = 'ผู้จัดตาราง',   "titleEN" = 'Scheduler' WHERE "code" = 'dispatcher';
DELETE FROM "role_groups" WHERE "code" = 'certificate_approver';

-- 4. candidateGroup กลับเป็นคำเก่า
UPDATE "work_activities"       SET "candidateGroup" = 'auditor'   WHERE "candidateGroup" = 'field_inspector';
UPDATE "work_activities"       SET "candidateGroup" = 'scheduler' WHERE "candidateGroup" = 'dispatcher';
UPDATE "stage_activity_configs" SET "candidateGroup" = 'auditor'   WHERE "candidateGroup" = 'field_inspector';
UPDATE "stage_activity_configs" SET "candidateGroup" = 'scheduler' WHERE "candidateGroup" = 'dispatcher';

-- 5. assignment_ledger_entries — ของจริงมีแถว ฐานนี้ว่าง จึงใส่ให้ครบทั้งคำเก่าและคำที่ไม่เปลี่ยน
INSERT INTO "assignment_ledger_entries" (id, "entityType", "entityId", action, "assigneeUserId", "role", "organizationId")
SELECT 'ale_rewind_' || v.tag, 'application', 'APP-REWIND-001', 'ASSIGN', u.id, v.raw, u."organizationId"
FROM (VALUES ('auditor','auditor'), ('scheduler','scheduler'), ('reviewer','reviewer'), ('doc','document_reviewer')) AS v(tag, raw)
CROSS JOIN LATERAL (SELECT id, "organizationId" FROM "users" WHERE "role" = 'admin' LIMIT 1) u;

COMMIT;
