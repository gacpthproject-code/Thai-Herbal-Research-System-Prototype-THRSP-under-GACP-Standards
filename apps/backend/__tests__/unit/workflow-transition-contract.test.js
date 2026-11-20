/**
 * Contract lock on who may walk the document-review edges.
 *
 * Operator 2026-10-06 (order 27): document review is the document reviewer's alone; the
 * field inspector does not hold ASSIGNED_FOR_REVIEW → DOC_APPROVED / REVISION_REQUESTED.
 * The edges used to sit in the inspector's set as a leftover of the HEAD_AUDITOR merge;
 * this file pinned them there and now pins them out.
 */

const workflowSvc = require('../../services/workflow-transition-service');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');

describe('the field inspector holds no document-review edge (order 27)', () => {
    it('ROLE_TRANSITIONS exposes the field inspector set', () => {
        const inspectorTransitions = workflowSvc.ROLE_TRANSITIONS[CANONICAL_ROLES.FIELD_INSPECTOR];
        expect(inspectorTransitions).toBeDefined();
        expect(inspectorTransitions instanceof Set).toBe(true);
    });

    it('canRoleTransition refuses both document edges to the field inspector, in any casing', () => {
        for (const role of [CANONICAL_ROLES.FIELD_INSPECTOR, 'FIELD_INSPECTOR', 'inspector']) {
            expect(workflowSvc.canRoleTransition(role, 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED')).toBe(false);
            expect(workflowSvc.canRoleTransition(role, 'ASSIGNED_FOR_REVIEW', 'REVISION_REQUESTED')).toBe(false);
        }
    });

    it('the field inspector set is exactly its on-site result edges (full lock)', () => {
        // Frozen-dictionary assertion. Adding / removing entries requires updating
        // this list deliberately.
        const expected = [
            'AUDIT_CONFIRMED->AUDIT_PASSED',
            'AUDIT_CONFIRMED->CAR_PENDING',
            // คำสั่ง 56(2): ผู้ตรวจพื้นที่บันทึกไม่ผ่านแล้วส่งผู้อนุมัติ ไม่ปิดคำขอเอง
            'AUDIT_CONFIRMED->AUDIT_NOT_PASSED',
            'CAR_REVIEWING->AUDIT_PASSED',
            'CAR_REVIEWING->CAR_PENDING',
            // F-CERT-SOD 2026-09-10 — 'AUDIT_PASSED->APPROVED' และ 'APPROVED->CERTIFIED'
            // ถูกถอดออกจากผู้ตรวจประเมินแปลง และย้ายไปอยู่กับ CERTIFICATE_APPROVER
            // ผู้ตรวจยังย้อนผลของตัวเองได้ (ขาข้างล่าง) แต่ตัดสินให้การรับรองไม่ได้แล้ว
            'AUDIT_PASSED->CAR_REVIEWING',
        ];
        const auditorTransitions = workflowSvc.ROLE_TRANSITIONS[CANONICAL_ROLES.FIELD_INSPECTOR];
        const actual = [...auditorTransitions].sort();
        expect(actual).toEqual([...expected].sort());
    });

    test('ผู้ตัดสินให้การรับรอง ถือขาตัดสินครบ และไม่มีขาบันทึกผลตรวจเลย', () => {
        const approver = workflowSvc.ROLE_TRANSITIONS[CANONICAL_ROLES.CERTIFICATE_APPROVER];
        expect([...approver].sort()).toEqual([
            'APPROVED->CERTIFIED',
            'AUDIT_NOT_PASSED->CAR_PENDING',
            'AUDIT_NOT_PASSED->REJECTED',
            'AUDIT_PASSED->APPROVED',
            'AUDIT_PASSED->CAR_REVIEWING',
            'AUDIT_PASSED->REJECTED',
        ]);
        // ขาที่บันทึก "ผลการตรวจ" ต้องไม่อยู่ในมือผู้ตัดสิน
        expect(approver.has('AUDIT_CONFIRMED->AUDIT_PASSED')).toBe(false);
        expect(approver.has('AUDIT_CONFIRMED->AUDIT_NOT_PASSED')).toBe(false);
    });
});

describe('V2-B RB-2 — DOCUMENT_REVIEWER permission set is exactly the documented 2 entries', () => {
    it('ROLE_TRANSITIONS exposes the DOCUMENT_REVIEWER set', () => {
        const docReviewerTransitions = workflowSvc.ROLE_TRANSITIONS[CANONICAL_ROLES.DOCUMENT_REVIEWER];
        expect(docReviewerTransitions).toBeDefined();
        expect(docReviewerTransitions instanceof Set).toBe(true);
    });

    it('DOCUMENT_REVIEWER contains exactly the 2 documented transitions', () => {
        const expected = [
            'ASSIGNED_FOR_REVIEW->DOC_APPROVED',
            'ASSIGNED_FOR_REVIEW->REVISION_REQUESTED',
        ];
        const docReviewerTransitions = workflowSvc.ROLE_TRANSITIONS[CANONICAL_ROLES.DOCUMENT_REVIEWER];
        const actual = [...docReviewerTransitions].sort();
        expect(actual).toEqual([...expected].sort());
    });

    it('DOCUMENT_REVIEWER CANNOT perform AUDITOR-only transitions', () => {
        // Negative checks — proves the set is bounded above as well as
        // below. If DOCUMENT_REVIEWER ever picks up audit-result
        // transitions silently, this test fails.
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.DOCUMENT_REVIEWER,
            'AUDIT_CONFIRMED',
            'AUDIT_PASSED',
        )).toBe(false);
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.DOCUMENT_REVIEWER,
            'AUDIT_CONFIRMED',
            'REJECTED',
        )).toBe(false);
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.DOCUMENT_REVIEWER,
            'AUDIT_PASSED',
            'APPROVED',
        )).toBe(false);
    });

    it('DOCUMENT_REVIEWER CANNOT perform SCHEDULER transitions', () => {
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.DOCUMENT_REVIEWER,
            'DOC_FEE_PAID',
            'ASSIGNED_FOR_REVIEW',
        )).toBe(false);
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.DOCUMENT_REVIEWER,
            'AUDIT_FEE_PAID',
            'AUDIT_CONFIRMED',
        )).toBe(false);
    });
});

describe('V2-B — cross-role boundary integrity', () => {
    it('SCHEDULER cannot approve documents', () => {
        // V1's RFC §RB-6 asserts this informally; lock it explicitly so
        // a future refactor that widens SCHEDULER fails the test.
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.DISPATCHER,
            'ASSIGNED_FOR_REVIEW',
            'DOC_APPROVED',
        )).toBe(false);
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.DISPATCHER,
            'ASSIGNED_FOR_REVIEW',
            'REVISION_REQUESTED',
        )).toBe(false);
    });

    it('การเงินทั้งสองฝั่งเดินสถานะคำขอไม่ได้เลย — รวมถึงขาที่เป็นเงินของตัวเอง', () => {
        // เดิมสองบทบาทนี้ถือขาอนุมัติสลิปเป็นขาเดียวที่มี · สลิปถูกปลดระวาง 2026-09-11
        // การจ่ายเป็น Stripe และ webhook ที่ยืนยันลายเซ็นแล้วเป็นผู้ตัดสถานะ
        // ⇒ ชุดว่างคือความจริงของงาน ไม่ใช่ของที่ลืมเติม
        expect(workflowSvc.canRoleTransition('finance_officer_dtam', 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED')).toBe(false);
        expect(workflowSvc.canRoleTransition('finance_officer_platform', 'AUDIT_FEE_PAID', 'AUDIT_CONFIRMED')).toBe(false);
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
            'ASSIGNED_FOR_REVIEW',
            'DOC_APPROVED',
        )).toBe(false);

        // ขาตัดเงินเป็นของ webhook ไม่ใช่ของคน — เจ้าหน้าที่การเงินกดเองไม่ได้
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
            'PENDING_DOC_FEE',
            'DOC_FEE_PAID',
        )).toBe(false);
        expect(workflowSvc.canRoleTransition(
            CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
            'PENDING_AUDIT_FEE',
            'AUDIT_FEE_PAID',
        )).toBe(false);

        // และแถวของทั้งสองต้อง **ยังอยู่** ในตาราง แม้ชุดจะว่าง — บทบาทที่ไม่มีแถว
        // จะตกไปทางผ่อนปรน คือผ่านด่านบทบาทได้ทุกขาที่ตารางขาอนุญาต (บทเรียน P0-E)
        expect(Object.keys(workflowSvc.ROLE_TRANSITIONS))
            .toEqual(expect.arrayContaining([
                CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
                CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
            ]));
    });

    it('HEALTH cannot impersonate any doc-review or audit-result transition', () => {
        expect(workflowSvc.canRoleTransition('health', 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED')).toBe(false);
        expect(workflowSvc.canRoleTransition('health', 'AUDIT_CONFIRMED', 'AUDIT_PASSED')).toBe(false);
        expect(workflowSvc.canRoleTransition('health', 'AUDIT_PASSED', 'APPROVED')).toBe(false);
    });

    it('unknown / falsy roles return false (never throw)', () => {
        expect(workflowSvc.canRoleTransition('garbage', 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED')).toBe(false);
        expect(workflowSvc.canRoleTransition(null, 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED')).toBe(false);
        expect(workflowSvc.canRoleTransition(undefined, 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED')).toBe(false);
        expect(workflowSvc.canRoleTransition('', 'ASSIGNED_FOR_REVIEW', 'DOC_APPROVED')).toBe(false);
    });
});
