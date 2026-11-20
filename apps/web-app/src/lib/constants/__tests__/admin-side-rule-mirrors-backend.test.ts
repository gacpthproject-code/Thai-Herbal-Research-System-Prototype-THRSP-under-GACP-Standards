/**
 * The web picks which roles and which manage buttons to offer from the same two-sided rule
 * the backend enforces (orders 13 and 34(2)). Compared against the backend module itself,
 * never against a list retyped in this test.
 */
import { CANONICAL_ROLES, ROLE_SIDE, adminManagesRole, rolesAssignableBy } from '../canonical-roles';
import {
    CROSS_SIDE_USER_CHANGE_FORBIDDEN_CODE,
    CROSS_SIDE_USER_CHANGE_FORBIDDEN_TH,
} from '@/lib/i18n/error-code-map';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const backend = require('../../../../../backend/shared/canonical-rbac.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ERROR_CODES } = require('../../../../../backend/shared/error-codes.js');

const ROLES: Array<string | null> = [...Object.values(CANONICAL_ROLES), 'auditor', 'ADMIN', '', null];

describe('the web side rule is the backend side rule', () => {
    it.each(Object.values(CANONICAL_ROLES))('%s sits on the side the backend gives it', (role) => {
        expect(ROLE_SIDE[role]).toBe(backend.roleAffiliation(role));
    });

    it.each(ROLES)('a %p caller manages exactly the accounts the backend lets it change', (actor) => {
        for (const role of ROLES) {
            expect([role, adminManagesRole(actor, role)]).toEqual([role, backend.adminManagesRole(actor, role)]);
        }
    });

    it.each(ROLES)('a %p caller is offered exactly the roles the backend lets it give', (actor) => {
        expect(rolesAssignableBy(actor)).toEqual(backend.rolesAssignableBy(actor));
    });

    it('the DTAM admin is never offered a company role, the platform admin only the company finance role', () => {
        expect(rolesAssignableBy('system_admin_dtam')).not.toContain('finance_officer_platform');
        expect(rolesAssignableBy('system_admin_platform')).toEqual(['finance_officer_platform']);
    });

    it('the refusal reads the same Thai on the screen as in the backend catalog', () => {
        const row = ERROR_CODES[CROSS_SIDE_USER_CHANGE_FORBIDDEN_CODE];
        expect(row.httpStatus).toBe(403);
        expect(row.messageTh).toBe(CROSS_SIDE_USER_CHANGE_FORBIDDEN_TH);
    });
});
