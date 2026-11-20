/**
 * คำศัพท์บทบาทฝั่งเว็บ — ต้องตรงกับ apps/backend/shared/canonical-rbac.js เป๊ะ ๆ
 *
 * โมเดลสามฝั่ง (operator 2026-09-10):
 *
 *   ผู้รับบริการ   health
 *   กรม            document_reviewer · dispatcher · field_inspector ·
 *                  certificate_approver · finance_officer_dtam · system_admin_dtam
 *   บริษัท         finance_officer_platform · system_admin_platform
 *
 * **ตัดขาดจากคำเก่า** — ไม่มีคีย์ deprecated ไม่มี alias ของคำเก่า (operator วันเดียวกัน:
 * "เลิกใช้ของเก่า รวมถึงการพูดถึงของเก่า" และ "ลบคำเก่าออกไปเลยก็ได้ เพราะกันการสับสน
 * เวลาเราไปทำบนเซิร์ฟเวอร์โปรดักชันในอนาคต")
 *
 * ด่านที่ตรึงให้สองไฟล์ตรงกัน: `apps/backend/__tests__/unit/role-vocabulary-three-sides.test.js`
 * (อ่านไฟล์นี้จริงทั้งไฟล์ ไม่ได้เทียบจากความจำ)
 */

export const CANONICAL_ROLES = {
    /**
     * ผู้ขอรับรอง — **คำนี้ห้ามเปลี่ยน** เพราะอ้างอิงหมอพร้อม (Health ID)
     * ที่กระทรวงสาธารณสุขบังคับให้เชื่อมต่อในอนาคต
     */
    HEALTH: 'health',

    /** กรม */
    DOCUMENT_REVIEWER: 'document_reviewer',
    DISPATCHER: 'dispatcher',
    FIELD_INSPECTOR: 'field_inspector',
    CERTIFICATE_APPROVER: 'certificate_approver',
    FINANCE_OFFICER_DTAM: 'finance_officer_dtam',
    SYSTEM_ADMIN_DTAM: 'system_admin_dtam',

    /** บริษัท — `system_admin_platform` เป็นบทบาทเดียวที่ข้ามองค์กรได้ */
    FINANCE_OFFICER_PLATFORM: 'finance_officer_platform',
    SYSTEM_ADMIN_PLATFORM: 'system_admin_platform',

    /** ไม่ใช่คน — webhook / cron */
    SYSTEM: 'system',
} as const;

export type CanonicalRole = typeof CANONICAL_ROLES[keyof typeof CANONICAL_ROLES];

/**
 * ตัวปรับค่าให้เป็นคำมาตรฐาน — รับเฉพาะคำปัจจุบัน
 *
 * ไม่มี alias ของคำเก่าอีกต่อไป (operator 2026-09-10: "เลิกใช้ของเก่า รวมถึงการพูดถึง
 * ของเก่า") · normalizeRole ตัดช่องว่างและแปลงเป็นตัวพิมพ์เล็กก่อนค้น คีย์จึงเป็น
 * ตัวพิมพ์เล็กทั้งหมด — ต้องตรงกับ ROLE_ALIASES ฝั่งหลังบ้านเป๊ะ ๆ
 */
export const ROLE_ALIASES: Record<string, CanonicalRole> = {
    health: 'health',
    document_reviewer: 'document_reviewer',
    dispatcher: 'dispatcher',
    field_inspector: 'field_inspector',
    certificate_approver: 'certificate_approver',
    finance_officer_dtam: 'finance_officer_dtam',
    system_admin_dtam: 'system_admin_dtam',
    finance_officer_platform: 'finance_officer_platform',
    system_admin_platform: 'system_admin_platform',
    system: 'system',
};

export function normalizeRole(role: string | null | undefined): CanonicalRole | null {
    const key = String(role || '').trim().toLowerCase();
    return key ? (ROLE_ALIASES[key] ?? null) : null;
}

/** บทบาทที่ถือว่าเป็นเจ้าหน้าที่ — ทั้งของกรมและของบริษัท */
export const PROVIDER_ROLES = new Set<CanonicalRole>([
    CANONICAL_ROLES.DOCUMENT_REVIEWER,
    CANONICAL_ROLES.DISPATCHER,
    CANONICAL_ROLES.FIELD_INSPECTOR,
    CANONICAL_ROLES.CERTIFICATE_APPROVER,
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
    CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM,
]);

/** ฝั่งของแต่ละบทบาท ตรงกับ ROLE_AFFILIATION_BY_ROLE ใน apps/backend/shared/canonical-rbac.js */
export type RoleSide = 'public' | 'certification_body' | 'platform_operator' | 'system';

export const ROLE_SIDE: Readonly<Record<CanonicalRole, RoleSide>> = Object.freeze({
    health: 'public',
    document_reviewer: 'certification_body',
    dispatcher: 'certification_body',
    field_inspector: 'certification_body',
    certificate_approver: 'certification_body',
    finance_officer_dtam: 'certification_body',
    system_admin_dtam: 'certification_body',
    finance_officer_platform: 'platform_operator',
    system_admin_platform: 'platform_operator',
    system: 'system',
});

/**
 * ผู้ดูแลแต่ละฝั่งจัดการบัญชีและบทบาทของฝั่งไหน (คำสั่ง 13, 34(2)) ตรงกับ
 * SIDES_MANAGED_BY_ADMIN ฝั่งหลังบ้าน ซึ่งเป็นผู้บังคับจริง (403 CROSS_SIDE_USER_CHANGE_FORBIDDEN)
 * ฝั่งเว็บใช้แค่เลือกว่าจะเสนอบทบาทและปุ่มจัดการอะไรบนจอ
 * ตรึงกับหลังบ้านด้วย admin-side-rule-mirrors-backend.test.ts
 */
const SIDES_MANAGED_BY_ADMIN: Readonly<Partial<Record<CanonicalRole, readonly RoleSide[]>>> = Object.freeze({
    system_admin_dtam: Object.freeze(['certification_body', 'public'] as const),
    system_admin_platform: Object.freeze(['platform_operator'] as const),
});

export function adminManagesRole(adminRole: string | null | undefined, role: string | null | undefined): boolean {
    const admin = normalizeRole(adminRole);
    const target = normalizeRole(role);
    const sides = admin ? SIDES_MANAGED_BY_ADMIN[admin] : undefined;
    return Boolean(sides && target && sides.includes(ROLE_SIDE[target]));
}

/** บทบาทที่ผู้ดูแลคนนี้ตั้งให้คนได้ · ไม่มี system_admin_platform เพราะตั้งนอกประตู (seed/ops) */
export function rolesAssignableBy(adminRole: string | null | undefined): CanonicalRole[] {
    return (Object.values(CANONICAL_ROLES) as CanonicalRole[]).filter(
        (role) => role !== CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM && adminManagesRole(adminRole, role),
    );
}

/** หน้าที่ถามว่า "คนนี้เป็นฝ่ายบัญชีไหม" ให้ใช้ชุดนี้ ไม่ใช่เทียบทีละคำ */
export const ACCOUNT_ROLES = new Set<CanonicalRole>([
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
]);

/**
 * ขอบเขตหน้าบัญชี (/provider/accounting) — ไม่มี "ฝั่ง" แล้ว
 *
 * operator 2026-09-11: "finance ต้องเห็นเหมือนกัน ... ตัวเลขที่ต้องมากระทบยอด ต้องเท่ากัน
 * เพื่อแสดงความโปร่งใส" · operator 2026-09-27: "กรมฯ ดูอย่างเดียว" — การเงินกรมเห็นทุกอย่าง
 * ที่การเงินบริษัทเห็น แต่ไม่มีอำนาจเขียนบัญชี (บริษัทเป็นผู้ออกเอกสารรายเดียว)
 *
 * เดิมที่นี่คือ getAccountSide() ซึ่งแยกการเงินสองบทบาทเป็น 'DTAM' / 'PLATFORM' เพื่อตั้ง
 * หัวข้อหน้า ซ่อนแท็บ และบังคับ bookSide — แนวคิดนั้นถูกลบทั้งตัว เหลือสามคำถามที่หน้าจอ
 * ต้องถามจริง ๆ และแต่ละชุดตรงกับด่านฝั่งหลังบ้าน
 */

/**
 * อ่านหน้าบัญชีได้ — ตรงกับชุดอ่านของทุก service การเงินฝั่งหลังบ้าน (READ_ROLES ของ
 * purchase-invoice / refund / credit-note / debit-note / wht · ALLOWED_ROLES ของ reports /
 * tax-reports / customer-reports) · ผู้ตรวจประเมินไม่อ่านเรื่องเงิน (operator 2026-09-27)
 * ชุดเดียวที่ทุกหน้าบัญชีใช้ — ตรึงโดย apps/backend/__tests__/unit/finance-fix1-hygiene.test.js
 */
export const ACCOUNTING_READ_ROLES: ReadonlySet<CanonicalRole> = new Set<CanonicalRole>([
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
    CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
]);

/**
 * เขียนสมุดบัญชีบริษัท — การเงินบริษัทเท่านั้น (คำสั่ง 29): ปิดงวด · รายการปรับปรุง · ทบ.50 ทวิ ·
 * ใบกำกับภาษีซื้อ · ใบลดหนี้/ใบเพิ่มหนี้ · บันทึกการคืนเงิน · ผู้ดูแลระบบกรมและการเงินกรมอ่านอย่างเดียว
 * ตรงกับ services/finance/company-books-access.js ฝั่งหลังบ้าน
 */
export const ACCOUNTING_WRITE_ROLES: ReadonlySet<CanonicalRole> = new Set<CanonicalRole>([
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
]);

function hasRole(set: ReadonlySet<CanonicalRole>, role: string | null | undefined): boolean {
    const canonical = normalizeRole(role);
    return canonical ? set.has(canonical) : false;
}

export function canViewAccounting(role: string | null | undefined): boolean {
    return hasRole(ACCOUNTING_READ_ROLES, role);
}

export function canWriteAccounting(role: string | null | undefined): boolean {
    return hasRole(ACCOUNTING_WRITE_ROLES, role);
}

export function isProviderRole(role: string | null | undefined): boolean {
    const canonical = normalizeRole(role);
    return canonical ? PROVIDER_ROLES.has(canonical) : false;
}
