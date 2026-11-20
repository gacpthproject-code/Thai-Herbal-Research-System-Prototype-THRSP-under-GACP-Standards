'use strict';

/**
 * R1 (security re-review 2026-10-09) and order 56(2): every edge that needs more than a status is
 * refused on the generic workflow-transitions door, because only its own door writes what it needs:
 * the dispatcher's reviewer or visit, the certificate approver's decision file, the inspector's
 * findings for "ไม่ผ่าน". An edge added to the workflow table without a refusal on that door would
 * be walkable with nothing written; this pins the tables to each other.
 */

const { ROLE_TRANSITIONS } = require('../../services/workflow-transition-service');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { ERROR_CODES } = require('../../shared/error-codes');
const { EDGE_DOOR } = require('../../routes/api/provider/handlers/workflow-transitions-handler');

// The approver's return and the inspector's reversal of its own pass are the same edge; the
// inspector walks it on this door (it voids any live certificate in the same transaction).
const SHARED_WITH_THE_INSPECTOR = 'AUDIT_PASSED->CAR_REVIEWING';

describe('the generic transitions door refuses every edge that has its own door', () => {
    test('every dispatcher edge', () => {
        for (const edge of ROLE_TRANSITIONS[CANONICAL_ROLES.DISPATCHER]) {
            expect([edge, Boolean(EDGE_DOOR[edge])]).toEqual([edge, true]);
        }
    });

    test('every certificate-approver decision', () => {
        for (const edge of ROLE_TRANSITIONS[CANONICAL_ROLES.CERTIFICATE_APPROVER]) {
            if (edge === SHARED_WITH_THE_INSPECTOR) { continue; }
            expect([edge, EDGE_DOOR[edge]]).toEqual([edge, 'CERTIFICATION_DECISION_USE_FILE']);
        }
    });

    test('the inspector\'s "ไม่ผ่าน", which carries its findings', () => {
        expect(EDGE_DOOR['AUDIT_CONFIRMED->AUDIT_NOT_PASSED']).toBe('INSPECTION_RESULT_USE_RESULT_DOOR');
    });

    test('each refusal is a catalogued 409 with a Thai message', () => {
        for (const code of new Set(Object.values(EDGE_DOOR))) {
            expect([code, ERROR_CODES[code]?.httpStatus]).toEqual([code, 409]);
            expect(ERROR_CODES[code].messageTh).toMatch(/[ก-๙]/);
        }
    });
});
