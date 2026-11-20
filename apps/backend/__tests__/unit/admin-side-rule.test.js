'use strict';

/**
 * Each side's admin changes only its own side (order 13, operator 2026-10-06
 * "แยกให้ผู้ดูแลแพลตฟอร์มตั้งบทบาทฝั่งบริษัท"; order 34(2), 2026-10-07).
 *
 *   system_admin_dtam      DTAM-side roles and accounts, plus applicant accounts as before
 *   system_admin_platform  company-side roles and accounts
 *
 * The sides below are written out by hand, never read back from the table under test.
 */

jest.mock('../../shared/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    stream: { write: jest.fn() },
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { adminManagesRole, rolesAssignableBy, assertSameSideChange } = require('../../shared/canonical-rbac');

const DTAM_SIDE = [
    'document_reviewer', 'dispatcher', 'field_inspector', 'certificate_approver',
    'finance_officer_dtam', 'system_admin_dtam',
];
const COMPANY_SIDE = ['finance_officer_platform', 'system_admin_platform'];
const NOT_A_ROLE = ['system', 'webhook', 'cron', 'auditor', 'ADMIN', '', null, undefined];

function refusalOf(fn) {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
}

describe('which accounts each admin manages', () => {
    test.each(DTAM_SIDE)('the DTAM admin manages a %s account', (role) => {
        expect(adminManagesRole('system_admin_dtam', role)).toBe(true);
    });

    test.each(COMPANY_SIDE)('the DTAM admin does not manage a %s account', (role) => {
        expect(adminManagesRole('system_admin_dtam', role)).toBe(false);
    });

    test('the DTAM admin keeps the applicant accounts it had before', () => {
        expect(adminManagesRole('system_admin_dtam', 'health')).toBe(true);
    });

    test.each(COMPANY_SIDE)('the platform admin manages a %s account', (role) => {
        expect(adminManagesRole('system_admin_platform', role)).toBe(true);
    });

    test.each([...DTAM_SIDE, 'health'])('the platform admin does not manage a %s account', (role) => {
        expect(adminManagesRole('system_admin_platform', role)).toBe(false);
    });

    test.each(NOT_A_ROLE)('no admin manages an account whose role is %p', (role) => {
        expect(adminManagesRole('system_admin_dtam', role)).toBe(false);
        expect(adminManagesRole('system_admin_platform', role)).toBe(false);
    });

    test.each(['document_reviewer', 'finance_officer_platform', 'finance_officer_dtam', 'health', 'system', null])(
        'a %p caller manages no account at all', (actor) => {
            for (const role of [...DTAM_SIDE, ...COMPANY_SIDE, 'health']) {
                expect(adminManagesRole(actor, role)).toBe(false);
            }
        },
    );
});

describe('which roles each admin may give', () => {
    test('the DTAM admin: the DTAM-side roles and the applicant role', () => {
        expect(rolesAssignableBy('system_admin_dtam')).toEqual(['health', ...DTAM_SIDE]);
    });

    test('the platform admin: the company finance role, never another platform admin', () => {
        expect(rolesAssignableBy('system_admin_platform')).toEqual(['finance_officer_platform']);
    });

    test.each(['document_reviewer', 'finance_officer_platform', 'health', 'system', null])('a %p caller: none', (actor) => {
        expect(rolesAssignableBy(actor)).toEqual([]);
    });
});

describe('assertSameSideChange', () => {
    const dtamStaff = { id: 'u-dtam', role: 'document_reviewer' };
    const companyStaff = { id: 'u-company', role: 'finance_officer_platform' };

    test('the DTAM admin giving a company role to its own staff is refused with the facts of the refusal', () => {
        const error = refusalOf(() => assertSameSideChange({
            actorRole: 'system_admin_dtam', target: dtamStaff, requestedRole: 'finance_officer_platform',
        }));
        expect(error).not.toBeNull();
        expect(error.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
        expect(error.status).toBe(403);
        expect(error.refusal).toEqual({
            targetUserId: 'u-dtam',
            actorRole: 'system_admin_dtam',
            actorSide: 'certification_body',
            targetRole: 'document_reviewer',
            targetSide: 'certification_body',
            requestedRole: 'finance_officer_platform',
            requestedSide: 'platform_operator',
        });
    });

    test('the DTAM admin touching a company account is refused even with no role in the request', () => {
        const error = refusalOf(() => assertSameSideChange({ actorRole: 'system_admin_dtam', target: companyStaff }));
        expect(error?.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
        expect(error.refusal.targetSide).toBe('platform_operator');
        expect(error.refusal.requestedRole).toBeNull();
    });

    test('the DTAM admin moving a company account to a DTAM role is refused', () => {
        const error = refusalOf(() => assertSameSideChange({
            actorRole: 'system_admin_dtam', target: companyStaff, requestedRole: 'dispatcher',
        }));
        expect(error?.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
    });

    test('the DTAM admin giving dispatcher to its own staff passes', () => {
        expect(refusalOf(() => assertSameSideChange({
            actorRole: 'system_admin_dtam', target: dtamStaff, requestedRole: 'dispatcher',
        }))).toBeNull();
    });

    test('creating an account checks only the requested role', () => {
        expect(refusalOf(() => assertSameSideChange({
            actorRole: 'system_admin_dtam', target: null, requestedRole: 'certificate_approver',
        }))).toBeNull();
        const error = refusalOf(() => assertSameSideChange({
            actorRole: 'system_admin_dtam', target: null, requestedRole: 'finance_officer_platform',
        }));
        expect(error?.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
        expect(error.refusal.targetUserId).toBeNull();
        expect(error.refusal.targetRole).toBeNull();
    });

    test('the platform admin is held to the mirror rule', () => {
        expect(refusalOf(() => assertSameSideChange({ actorRole: 'system_admin_platform', target: dtamStaff }))?.code)
            .toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
        expect(refusalOf(() => assertSameSideChange({
            actorRole: 'system_admin_platform', target: null, requestedRole: 'system_admin_dtam',
        }))?.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
        expect(refusalOf(() => assertSameSideChange({
            actorRole: 'system_admin_platform', target: companyStaff, requestedRole: 'finance_officer_platform',
        }))).toBeNull();
    });

    test('an account whose role reads as nothing is refused, not waved through', () => {
        expect(refusalOf(() => assertSameSideChange({
            actorRole: 'system_admin_dtam', target: { id: 'u-x', role: 'auditor' },
        }))?.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
    });

    test('a caller that is not an admin is refused', () => {
        expect(refusalOf(() => assertSameSideChange({
            actorRole: 'dispatcher', target: dtamStaff, requestedRole: 'field_inspector',
        }))?.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
    });

    test.each(['dispatcher', 'finance_officer_platform', 'health', 'system', 'auditor', null])(
        'a %p caller is refused even when the request names no account and no role', (actor) => {
            const error = refusalOf(() => assertSameSideChange({ actorRole: actor }));
            expect(error?.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
            expect(error.refusal).toMatchObject({ targetUserId: null, targetRole: null, requestedRole: null });
        },
    );

    test.each([
        ['the platform admin creating one', 'system_admin_platform', null],
        ['the platform admin promoting company staff', 'system_admin_platform', companyStaff],
        ['the DTAM admin creating one', 'system_admin_dtam', null],
    ])('the rule itself never gives system_admin_platform: %s', (_name, actorRole, target) => {
        const error = refusalOf(() => assertSameSideChange({ actorRole, target, requestedRole: 'system_admin_platform' }));
        expect(error?.code).toBe('CROSS_SIDE_USER_CHANGE_FORBIDDEN');
        expect(error.refusal.requestedRole).toBe('system_admin_platform');
    });

    test.each(['system_admin_dtam', 'system_admin_platform'])(
        'a %s call that names neither an account nor a role is a door bug, not a pass', (actorRole) => {
            const error = refusalOf(() => assertSameSideChange({ actorRole }));
            expect(error).toBeInstanceOf(TypeError);
        },
    );
});
