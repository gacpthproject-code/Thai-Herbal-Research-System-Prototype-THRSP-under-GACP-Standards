/**
 * Application visibility filter (Wave A Phase 19, G4 partial).
 *
 * Returns a Prisma `where` fragment that constrains which Applications a
 * given user is allowed to see — a row-level read filter for the
 * application table.
 *
 * CONTRACT (H17, 2026-08-23): **an absent scope means DENY.** Every canonical
 * role must land in exactly one of the three buckets below; a role that lands
 * in none gets `DENY_ALL`. Before H17 this function fell through to
 * `return null` for every role it had not explicitly narrowed, and
 * `withVisibility()` reads `null` as "no additional constraint" — so
 * "no scope defined for this role" silently meant "read the whole table".
 * That is how ACCOUNT / SCHEDULER (and any future role) could pull ANY
 * application by raw id, applicant national ID and address included, through
 * `GET /provider/applications/:id`, `…/:id/activities` and
 * `…/:id/audit-timelines`.
 *
 * ORGANIZATION (order 17, operator 2026-10-06): every role except
 * `system_admin_platform` reads only rows of its own `organizationId`, ANDed here
 * so it holds with the tenant extension's kill-switch off. No organization = DENY_ALL.
 * `system_admin_platform` gets no row filter (ADR-014: the only role that may cross
 * organizations); on a door that runs inside a tenant context the tenant extension
 * still narrows its findMany/findFirst to its own organization.
 *
 * The three buckets, inside the organization:
 *
 *   1. ADMIN — `system_admin_dtam` reads every application of its organization.
 *
 *   2. ASSIGNMENT-SCOPED — `field_inspector`, `document_reviewer`: each
 *      sees only the applications assigned to it.
 *
 *   3. WORK-POOL-SCOPED — `scheduler`, `account`, `account_dtam`,
 *      `account_platform`. These roles do work a tenant-wide pool, but only a
 *      *slice* of the lifecycle. The slice is DERIVED, not hand-listed: it is
 *      the set of states named by that role's own rows in `ROLE_TRANSITIONS`
 *      (services/workflow-transition-service.js:99-139) — the states it can
 *      move an application out of, plus the states it can move one into:
 *        · scheduler → DOC_FEE_PAID, ASSIGNED_FOR_REVIEW, AUDIT_FEE_PAID,
 *          AUDIT_CONFIRMED (assign-reviewer + confirm-audit)
 *        · การเงิน   → PENDING_DOC_FEE, DOC_FEE_PAID, PENDING_AUDIT_FEE,
 *          AUDIT_FEE_PAID — หน้าต่างการชำระเงินที่เขาดูแล · **ข้อยกเว้นเดียวของถังนี้ที่
 *          ไม่ได้ derive** เพราะการเงินไม่มีขาใน ROLE_TRANSITIONS แล้ว (สลิปปลดระวาง
 *          2026-09-11 — webhook เป็นผู้ตัดสถานะ) เหตุผลเต็มอยู่ที่ FINANCE_READ_WINDOW
 *      Deriving from the SSOT means a new role edge widens the read scope in
 *      lock-step, and nothing widens it silently. Neither role loses its own
 *      product surface: the scheduler dashboard queries directly
 *      (scheduler-dashboard-handler.js:28-46) and the accounting surfaces are
 *      the finance routes (routes/api/finance/*) — neither passes through this
 *      filter — and the frontend does not admit either role to
 *      /provider/applications at all (web-app/src/lib/provider-role-config.ts:87).
 *
 *   Everything else (`health`, `system`, any future or unmapped role) →
 *   DENY_ALL.
 *
 * NOTE: do NOT assume DB-level tenant RLS backstops this filter — on current
 * main the RLS policy is observe-only (permissive) and org read-scoping is
 * flag-gated off, so any cross-organization narrowing that must hold today has
 * to be expressed HERE.
 *
 * Usage:
 *
 *   const { applicationVisibilityFilter } = require('../shared/application-visibility');
 *   const visibility = applicationVisibilityFilter(req.user);
 *   const where = visibility ? { AND: [baseWhere, visibility] } : baseWhere;
 *   const app = await prisma.application.findFirst({ where, select: ... });
 */

'use strict';

const { CANONICAL_ROLES, normalizeRole } = require('./canonical-rbac');
const { ROLE_TRANSITIONS } = require('../services/workflow-transition-service');

/**
 * A `where` no row can satisfy. Used wherever the answer is "this caller has
 * no business reading applications through this surface". Callers turn an
 * empty result into 404 (never 403), so existence is not leaked either.
 */
const DENY_ALL = Object.freeze({ id: '__no_application_scope__' });

/** Bucket 3 — tenant-wide work-pool roles, sliced by their own workflow edges. */
const WORK_POOL_ROLES = new Set([
    // ผู้ตัดสินให้การรับรอง (F-CERT-SOD 2026-09-10) — ต้องเห็นคำขอที่รอการตัดสิน
    // ทั้งหน่วยงาน ไม่ใช่เฉพาะที่มอบหมายให้ตัวเอง เพราะงานของเขาคือตัดสินคำขอที่
    // **คนอื่น** เป็นผู้ประเมิน · สไลซ์ได้มาจาก ROLE_TRANSITIONS ของเขาเอง
    // (AUDIT_PASSED / APPROVED / CERTIFIED) เหมือนทุก role ในถังนี้ — ไม่มีรายชื่อ
    // สถานะเขียนมือ ⇒ ขอบเขตการอ่านขยับตามขาที่เขาเดินได้จริงเสมอ
    //
    // ถ้าไม่มีบรรทัดนี้ ด่านที่ contract ข้างบนบอกว่า "ไม่มีสโคป = ปฏิเสธ" จะทำงาน
    // ตรงตามที่เขียนไว้: ผู้อนุมัติมองไม่เห็นอะไรเลย และคิวอนุมัติจะว่างตลอดกาล
    CANONICAL_ROLES.CERTIFICATE_APPROVER,
    CANONICAL_ROLES.DISPATCHER,
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
]);

/**
 * หน้าต่างการอ่านของฝ่ายการเงิน — **ประกาศไว้ตรงนี้ ไม่ได้ derive**
 *
 * ทุก role ในถังนี้ได้สไลซ์มาจากขาใน `ROLE_TRANSITIONS` ของตัวเอง ซึ่งใช้ได้ตราบที่
 * role นั้นมีขา · การเงินไม่มีขาแล้วตั้งแต่สลิปถูกปลดระวาง 2026-09-11 (webhook เป็น
 * ผู้ตัดสถานะ ไม่มีมนุษย์อนุมัติการชำระเงิน) ⇒ การ derive จะคืนชุดว่าง = ปฏิเสธทุกอย่าง
 * และเจ้าหน้าที่การเงินจะมองไม่เห็นคำขอที่ตัวเองต้องกระทบยอด
 *
 * ทำไมไม่ derive จาก SSOT ของเงินแทน: `PAYABLE_STATES` (stripe-checkout-service) กับ
 * `SETTLED_TARGET_STATE` (checkout-settlement-service) รวมกันได้หกสถานะ — **กว้างกว่า
 * ของเดิมสองสถานะ** (SUBMITTED, DOC_APPROVED) · การขยายขอบเขตการอ่านคือการเพิ่มอำนาจ
 * และต้องเป็น diff ที่คนเห็น ไม่ใช่ผลข้างเคียงของการเปลี่ยนวิธีคำนวณ
 *
 * ⇒ สี่สถานะนี้คือหน้าต่างเดิมเป๊ะ ๆ: สองสถานะที่ยังค้างชำระ และสองสถานะที่เพิ่งชำระ
 * ด่าน `application-visibility` ตรึงทั้งรายการไว้ การเพิ่มสถานะจึงต้องแก้เทสด้วย
 */
const FINANCE_READ_WINDOW = Object.freeze([
    'PENDING_DOC_FEE',
    'DOC_FEE_PAID',
    'PENDING_AUDIT_FEE',
    'AUDIT_FEE_PAID',
]);

const FINANCE_ROLES = Object.freeze(new Set([
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
]));

/**
 * A state a work-pool role holds only through an edge armed by a record, not by the status alone,
 * is read only where that record is (security review 2026-10-09 F8): the dispatcher books from
 * CAR_REVIEWING only when the field inspector asked for a second visit (order 27), so it reads those
 * files and no other file under corrective-evidence review.
 */
const ARMED_STATES = Object.freeze({
    [CANONICAL_ROLES.DISPATCHER]: Object.freeze({
        CAR_REVIEWING: Object.freeze({ formData: { path: ['reinspection', 'status'], equals: 'REQUESTED' } }),
    }),
});

/**
 * The lifecycle states a work-pool role may see: every state named on either
 * side of one of its `ROLE_TRANSITIONS` edges ("FROM->TO").
 *
 * @param {string} role canonical role
 * @returns {string[]} status codes (possibly empty)
 */
function workPoolStatuses(role) {
    if (FINANCE_ROLES.has(role)) {
        return [...FINANCE_READ_WINDOW];
    }
    const edges = ROLE_TRANSITIONS[role];
    if (!edges) {
        return [];
    }
    const states = new Set();
    for (const edge of edges) {
        const [from, to] = String(edge).split('->');
        if (from) {
            states.add(from);
        }
        if (to) {
            states.add(to);
        }
    }
    return [...states];
}

/**
 * @param {{ id?: string, canonicalRole?: string, role?: string, organizationId?: string }} user
 * @returns {object | null}  A Prisma `where` fragment, or null ONLY for
 *   system_admin_platform. Never null as a fall-through.
 */
function applicationVisibilityFilter(user) {
    if (!user) {
        // Defensive: no user = caller must have already auth-gated.
        // Returning null here would silently broaden the query, so we
        // return an impossible filter to fail closed.
        return { id: '__no_user__' };
    }

    const role = normalizeRole(user.canonicalRole || user.role);
    if (!role) {
        // Unmapped or missing role — no scope, therefore no read.
        return DENY_ALL;
    }

    const ownOrganization = organizationScope(user);
    if (ownOrganization === null) {
        return null;
    }
    if (ownOrganization === DENY_ALL) {
        return DENY_ALL;
    }
    const roleScope = roleRowScope(role, user.id);
    if (roleScope === DENY_ALL) {
        return DENY_ALL;
    }
    return roleScope ? { AND: [ownOrganization, roleScope] } : ownOrganization;
}

/**
 * Order 17 (operator 2026-10-06): the organization a staff caller reads in, as a
 * `where` fragment for any model with an `organizationId` column. Stated explicitly so
 * it holds without the tenant extension (TENANT_READ_ORG_SCOPE).
 *
 * @returns {object | null} null for system_admin_platform only (ADR-014: the one role
 *   that crosses organizations); DENY_ALL when the caller has no organization.
 */
function organizationScope(user) {
    if (normalizeRole(user?.canonicalRole || user?.role) === CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM) {
        return null;
    }
    return user?.organizationId ? { organizationId: user.organizationId } : DENY_ALL;
}

/** The answer a door gives when organizationScope denies: the caller has no organization. */
function answerNoOrganization(res) {
    const row = require('./error-codes').ERROR_CODES.NO_ORGANIZATION;
    return res.status(row.httpStatus).json({
        success: false, code: row.code, error: row.code, message: row.messageTh, messageTh: row.messageTh,
    });
}

/**
 * The rows a role reads inside its organization: null = every row of the organization.
 *
 * @param {string} role canonical role
 * @param {string | undefined} userId
 * @returns {object | null}
 */
function roleRowScope(role, userId) {
    if (role === CANONICAL_ROLES.SYSTEM_ADMIN_DTAM) {
        return null;
    }

    // FIELD_INSPECTOR — sees only the applications it inspects (auditorId). It never
    // reviews documents (order 27), so reviewerId is not its door in, and headAuditorId
    // names the certificate approver, not an inspector.
    if (role === CANONICAL_ROLES.FIELD_INSPECTOR) {
        if (!userId) {
            return DENY_ALL;
        }
        return { auditorId: userId };
    }

    // DOCUMENT_REVIEWER — sees only the applications assigned to it for review, by the
    // reviewerId column alone. The formData copy is not reassigned when the dispatcher
    // swaps reviewers, so reading it kept the previous reviewer inside the filing.
    if (role === CANONICAL_ROLES.DOCUMENT_REVIEWER) {
        if (!userId) {
            return DENY_ALL;
        }
        return { reviewerId: userId };
    }

    // Work-pool roles — organization-wide but lifecycle-sliced (bucket 3). A role whose
    // ROLE_TRANSITIONS row is missing or empty gets nothing rather than everything.
    if (WORK_POOL_ROLES.has(role)) {
        const statuses = workPoolStatuses(role);
        if (statuses.length === 0) { return DENY_ALL; }
        const armed = ARMED_STATES[role] || {};
        const armedReads = statuses.filter((status) => armed[status]).map((status) => ({ status, ...armed[status] }));
        const plain = { status: { in: statuses.filter((status) => !armed[status]) } };
        return armedReads.length === 0 ? plain : { OR: [plain, ...armedReads] };
    }

    // health / system / anything unmapped — no application-read scope here.
    // Applicants read their own applications through the health-side routes
    // (routes/api/applications/*), which do not use this filter.
    return DENY_ALL;
}

/**
 * Convenience: combine the visibility filter with a base where clause
 * using AND. If no constraint applies, returns the base unchanged.
 *
 * @param {object} baseWhere
 * @param {{ canonicalRole?: string, providerId?: string | null }} user
 * @returns {object}
 */
function withVisibility(baseWhere, user) {
    const v = applicationVisibilityFilter(user);
    if (!v) {
        return baseWhere;
    }
    return { AND: [baseWhere, v] };
}

module.exports = {
    applicationVisibilityFilter,
    withVisibility,
    organizationScope,
    answerNoOrganization,
    roleRowScope,
    DENY_ALL,
    // ส่งออกเพื่อให้ด่านตรึงรายการได้ — การเพิ่มสถานะเข้าหน้าต่างนี้คือการเพิ่มอำนาจอ่าน
    FINANCE_READ_WINDOW,
    FINANCE_ROLES,
};
