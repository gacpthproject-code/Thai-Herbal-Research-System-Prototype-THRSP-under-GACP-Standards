/**
 * The applicant's page of a refused application says what happened (U1 screenshot 08 read
 * "คำขอหมดเวลาแก้ไขและถูกยกเลิก" on a refusal): the action card names the outcome, and the
 * payload carries the reason and the consideration the order states, never who decided.
 */

'use strict';

const {
    buildActionCard, buildApplicationDetailPayload,
} = require('../../routes/api/helpers/application-payload-builders');
const { CERTIFICATION_REFUSAL_REASONS } = require('../../shared/certification-decision-reasons');

const REFUSED = Object.freeze({
    outcome: 'REFUSED',
    decidedAt: '2026-10-14T09:00:00.000Z',
    decidedBy: 'approver-user-id',
    reasonCode: 'CRITICAL_NONCONFORMITY',
    fromStatus: 'AUDIT_NOT_PASSED',
    consideration: 'ข้อบกพร่องทั้งสองข้อกระทบการควบคุมผลผลิตโดยตรง',
    refusalId: '0b4f2c1e-6f1a-4c43-9d55-8d5bb3f7f0a1',
});

const detail = (status, certificationDecision) => buildApplicationDetailPayload({
    id: 'app-1', applicationNumber: 'APP-1', status, formData: { certificationDecision },
});

describe('a refused application tells the applicant it was not certified, and why', () => {
    test('the action card of REJECTED is NOT_CERTIFIED; an expired or cancelled one still asks to re-apply', () => {
        expect(buildActionCard('REJECTED').key).toBe('NOT_CERTIFIED');
        expect(buildActionCard('EXPIRED').key).toBe('REAPPLY');
        expect(buildActionCard('CANCELLED').key).toBe('REAPPLY');
    });

    test('the payload carries the reason, the consideration and the date of the order, and no officer id', () => {
        const payload = detail('REJECTED', REFUSED);
        expect(payload.certificationRefusal).toEqual({
            reasonLabel: CERTIFICATION_REFUSAL_REASONS.CRITICAL_NONCONFORMITY,
            consideration: REFUSED.consideration,
            decidedAt: REFUSED.decidedAt,
        });
        expect(JSON.stringify(payload)).not.toContain('approver-user-id');
    });

    test('a typed OTHER reason is the reason shown', () => {
        const payload = detail('REJECTED', { ...REFUSED, reasonCode: 'OTHER', reasonText: 'แปลงที่ตรวจไม่ใช่แปลงที่ยื่นไว้' });
        expect(payload.certificationRefusal.reasonLabel).toBe('แปลงที่ตรวจไม่ใช่แปลงที่ยื่นไว้');
    });

    test('no refusal view on any other status, nor for another outcome', () => {
        expect(detail('CAR_PENDING', { ...REFUSED, outcome: 'CORRECTION_REQUESTED' }).certificationRefusal).toBeNull();
        expect(detail('AUDIT_NOT_PASSED', undefined).certificationRefusal).toBeNull();
        expect(detail('CERTIFIED', { outcome: 'APPROVED', decidedBy: 'x' }).certificationRefusal).toBeNull();
    });
});
