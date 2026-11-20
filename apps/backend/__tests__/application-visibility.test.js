/**
 * Unit tests for application-visibility helper.
 *
 * Wave A Phase 44 simplified the filter to check only the canonical
 * role columns (`auditorId`, `headAuditorId`, `reviewerId`). The dormant
 * column sets get dropped in Phase D.
 *
 * H17 (2026-08-23) replaced the "unnarrowed roles fall through to null"
 * fall-through with an explicit three-bucket contract — an absent scope now
 * means DENY. See shared/application-visibility.js's header and
 * __tests__/unit/h17-application-visibility-scope.test.js for the route-level
 * proof on the three surfaces that leaked.
 */

const {
    applicationVisibilityFilter,
    withVisibility,
    DENY_ALL,
} = require('../shared/application-visibility');
const { ROLE_TRANSITIONS } = require('../services/workflow-transition-service');

// Order 17: every staff role except system_admin_platform reads its own organization only.
const ORG = 'org-a';
const inOrg = (scope) => ({ AND: [{ organizationId: ORG }, scope] });
const roleScope = (filter) => filter.AND[1];

describe('applicationVisibilityFilter — system admins', () => {
    // ADR-014: only system_admin_platform crosses organizations. system_admin_dtam reads
    // every application of its own organization (operator 2026-10-06).
    it('returns null (no narrowing) for system_admin_platform', () => {
        expect(applicationVisibilityFilter({ id: 'u-pa', canonicalRole: 'system_admin_platform' })).toBeNull();
    });

    it('holds system_admin_dtam to its own organization', () => {
        expect(applicationVisibilityFilter({ id: 'u-admin', canonicalRole: 'system_admin_dtam', organizationId: 'org-a' }))
            .toEqual({ organizationId: 'org-a' });
    });

    it('denies system_admin_dtam when no organization is known', () => {
        expect(applicationVisibilityFilter({ id: 'u-admin', canonicalRole: 'system_admin_dtam' })).toEqual(DENY_ALL);
    });
});

describe('applicationVisibilityFilter — work-pool roles narrowed to their own workflow edges', () => {
    // H17 regression: these returned null (= whole table, applicant national
    // ID + address included). They are now sliced to the lifecycle states
    // named by their own ROLE_TRANSITIONS rows.
    // การเงินสองฝั่งไม่อยู่ในชุดนี้ตั้งแต่ 2026-09-11: สไลซ์ของเขาไม่ได้มาจากขาใน
    // ROLE_TRANSITIONS อีกแล้ว (เขาไม่มีขาเลย — webhook เป็นผู้ตัดสถานะ) หน้าต่างของเขา
    // ถูกประกาศไว้ตรง ๆ ที่ FINANCE_READ_WINDOW และมีเทสของตัวเองข้างล่างที่ตรึงทั้งรายการ
    const SECOND_VISIT_ASKED = { status: 'CAR_REVIEWING', formData: { path: ['reinspection', 'status'], equals: 'REQUESTED' } };

    it('dispatcher sees only the states its own role edges touch, CAR_REVIEWING only where a second visit was asked for', () => {
        const filter = roleScope(applicationVisibilityFilter({ id: 'u-1', canonicalRole: 'dispatcher', organizationId: ORG }));
        const expected = new Set();
        for (const edge of ROLE_TRANSITIONS.dispatcher) {
            const [from, to] = String(edge).split('->');
            expected.add(from);
            expected.add(to);
        }
        const [plain, ...armed] = filter.OR;
        expect(new Set([...plain.status.in, ...armed.map((read) => read.status)])).toEqual(expected);
        // Security review 2026-10-09 F8: the edge out of CAR_REVIEWING is the dispatcher's only once the
        // inspector asked for a second visit, so every other file under corrective-evidence review is out.
        expect(armed).toEqual([SECOND_VISIT_ASKED]);
        expect(plain.status.in).not.toContain('CAR_REVIEWING');
        expect(plain.status.in).not.toContain('DRAFT');
        expect(plain.status.in).not.toContain('CERTIFIED');
    });

    it('dispatcher is scoped to assign-reviewer and confirm-audit states, and the re-inspection files asked for', () => {
        const filter = roleScope(applicationVisibilityFilter({ id: 'u-s', canonicalRole: 'dispatcher', organizationId: ORG }));
        expect(new Set(filter.OR[0].status.in)).toEqual(new Set([
            'DOC_FEE_PAID', 'ASSIGNED_FOR_REVIEW', 'AUDIT_FEE_PAID', 'AUDIT_CONFIRMED',
        ]));
        expect(filter.OR.slice(1)).toEqual([SECOND_VISIT_ASKED]);
    });

    // หน้าต่างนี้ถูกประกาศไว้ตรง ๆ ไม่ได้ derive (ดู FINANCE_READ_WINDOW) เพราะการเงิน
    // ไม่มีขาใน ROLE_TRANSITIONS แล้วหลังสลิปปลดระวาง · ข้อนี้จึงเป็นด่านของ "อำนาจอ่าน":
    // เพิ่มสถานะเข้าไปต้องแก้บรรทัดนี้ด้วย จะแอบกว้างขึ้นไม่ได้
    it('การเงินถูกจำกัดอยู่ในหน้าต่างการชำระเงินที่ตัวเองดูแล และไม่กว้างกว่านั้น', () => {
        const expected = new Set([
            'PENDING_DOC_FEE', 'DOC_FEE_PAID',
            'PENDING_AUDIT_FEE', 'AUDIT_FEE_PAID',
        ]);
        for (const role of ['finance_officer_platform', 'finance_officer_dtam']) {
            const filter = roleScope(applicationVisibilityFilter({ id: 'u-a', canonicalRole: role, organizationId: ORG }));
            expect(new Set(filter.status.in)).toEqual(expected);
        }
        // และตรงกับรายการที่โมดูลประกาศไว้ — ไม่ใช่เลขที่เทสจำเอง
        const { FINANCE_READ_WINDOW } = require('../shared/application-visibility');
        expect(new Set(FINANCE_READ_WINDOW)).toEqual(expected);
    });
});

describe('applicationVisibilityFilter — document_reviewer narrowed to own assignments', () => {
    // Regression: previously returned null → the GENERAL /provider/applications
    // list/queue/:id/activities leaked the whole tenant pipeline + applicant PII to a
    // reviewer. Now scoped to its own assigned apps (mirrors the reviewer dashboard:
    // reviewerId column + legacy formData.PROVIDERAssignment.reviewerId fallback).
    it('matches the reviewerId column only (the formData copy is not moved on reassignment)', () => {
        expect(applicationVisibilityFilter({ id: 'u-rv', canonicalRole: 'document_reviewer', organizationId: ORG }))
            .toEqual(inOrg({ reviewerId: 'u-rv' }));
    });

    it('fails closed when a document_reviewer has no User.id', () => {
        expect(applicationVisibilityFilter({ canonicalRole: 'document_reviewer', organizationId: ORG })).toEqual(DENY_ALL);
    });
});

describe('applicationVisibilityFilter — fail-closed paths', () => {
    it('returns an impossible filter when no user is supplied', () => {
        expect(applicationVisibilityFilter(null)).toEqual({ id: '__no_user__' });
        expect(applicationVisibilityFilter(undefined)).toEqual({ id: '__no_user__' });
    });

    it('returns an impossible filter when a field inspector has no User.id', () => {
        for (const id of [undefined, null]) {
            expect(applicationVisibilityFilter({ canonicalRole: 'field_inspector', id, organizationId: ORG })).toEqual(DENY_ALL);
        }
    });

    // Order 17: unknown organization = deny, for every staff role but system_admin_platform.
    it.each([
        ['field_inspector'], ['document_reviewer'], ['dispatcher'], ['certificate_approver'],
        ['finance_officer_dtam'], ['finance_officer_platform'], ['system_admin_dtam'],
    ])('denies %s when no organization is known', (role) => {
        expect(applicationVisibilityFilter({ id: 'u-1', canonicalRole: role })).toEqual(DENY_ALL);
    });

    // H17: the fall-through case. A role with no declared scope must DENY,
    // never fall through to null (= no restriction).
    it.each([
        ['health'],
        ['system'],
        ['some_future_role'],
        [''],
        [undefined],
    ])('denies a role with no declared application scope (%s)', (role) => {
        expect(applicationVisibilityFilter({ id: 'u-x', canonicalRole: role })).toEqual(DENY_ALL);
        expect(applicationVisibilityFilter({ id: 'u-x', canonicalRole: role })).not.toBeNull();
    });
});

describe('withVisibility', () => {
    const baseWhere = { isDeleted: false, status: 'APPROVED' };

    it('passes the base where through unchanged for system_admin_platform', () => {
        const out = withVisibility(baseWhere, { id: 'u-admin', canonicalRole: 'system_admin_platform' });
        expect(out).toBe(baseWhere); // identity preserved
    });

    it('wraps in AND for a field inspector', () => {
        const out = withVisibility(baseWhere, { id: 'u-99', canonicalRole: 'field_inspector', organizationId: ORG });
        expect(out).toEqual({
            AND: [
                baseWhere,
                // No reviewerId: the field inspector does not review documents (order 27).
                // No headAuditorId: that column names the certificate approver.
                inOrg({ auditorId: 'u-99' }),
            ],
        });
    });

    it('fails closed when no user is supplied', () => {
        const out = withVisibility(baseWhere, null);
        expect(out).toEqual({
            AND: [baseWhere, { id: '__no_user__' }],
        });
    });

    it('fails closed for a role with no declared scope', () => {
        const out = withVisibility(baseWhere, { id: 'u-x', canonicalRole: 'some_future_role' });
        expect(out).toEqual({ AND: [baseWhere, DENY_ALL] });
    });
});
