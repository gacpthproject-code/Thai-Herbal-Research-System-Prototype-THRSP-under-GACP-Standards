'use strict';

/**
 * Every blocking code the requirement engine can raise says whether the applicant can
 * fix it (security review 2026-10-06 N5). A code nobody classified is not fixable, so a
 * new rule never sends a filing back to an applicant who cannot act on it.
 */

const fs = require('fs');
const path = require('path');
const { applicantCanFix, BLOCKING_APPLICANT_CAN_FIX } = require('../../services/application-requirements-service');

const ENGINE = path.join(__dirname, '../../services/application-requirements-service.js');

function blockingCodesRaisedByTheEngine() {
    const source = fs.readFileSync(ENGINE, 'utf8');
    const constants = Object.fromEntries(
        [...source.matchAll(/const (BLOCKING_[A-Z_]+) = '([A-Z_]+)';/g)].map(([, name, value]) => [name, value]),
    );
    const raised = [...source.matchAll(/code: (BLOCKING_[A-Z_]+|'[A-Z_]+')/g)].map(([, expr]) => (
        expr.startsWith("'") ? expr.slice(1, -1) : constants[expr]
    ));
    return { constants: Object.values(constants), raised: [...new Set(raised)] };
}

describe('blocking codes', () => {
    test('every code the engine raises is classified', () => {
        const { constants, raised } = blockingCodesRaisedByTheEngine();
        expect(raised.length).toBeGreaterThan(0);
        expect(raised).not.toContain(undefined);
        expect(Object.keys(BLOCKING_APPLICANT_CAN_FIX).sort()).toEqual([...new Set(constants)].sort());
        for (const code of raised) {
            expect(typeof BLOCKING_APPLICANT_CAN_FIX[code]).toBe('boolean');
        }
    });

    test('the applicant fixes the filing-side issues and not the holder or the register', () => {
        expect(applicantCanFix('CERTIFICATION_PURPOSE_INVALID')).toBe(true);
        expect(applicantCanFix('PLANT_NOT_DECLARED')).toBe(true);
        expect(applicantCanFix('AREA_TYPE_UNREADABLE')).toBe(true);
        expect(applicantCanFix('APPLICANT_TYPE_NOT_THE_HOLDER')).toBe(false);
        expect(applicantCanFix('PLANT_LAW_NOT_FILED')).toBe(false);
    });

    test('a code nobody classified is not fixable', () => {
        expect(applicantCanFix('A_RULE_ADDED_TOMORROW')).toBe(false);
        expect(applicantCanFix(undefined)).toBe(false);
    });
});
