'use strict';

/**
 * One source for "where may this staff caller read and act" (order 17, security review
 * 2026-10-06 N4): every role reads its own organization, only system_admin_platform
 * crosses organizations, and no organization is a denial.
 */

const { organizationScope, applicationVisibilityFilter, DENY_ALL } = require('../../shared/application-visibility');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');

const ORG = 'org-a';
const SCOPED_ROLES = [
    CANONICAL_ROLES.DOCUMENT_REVIEWER,
    CANONICAL_ROLES.DISPATCHER,
    CANONICAL_ROLES.FIELD_INSPECTOR,
    CANONICAL_ROLES.CERTIFICATE_APPROVER,
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
    CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
];

describe('organizationScope', () => {
    test.each(SCOPED_ROLES)('%s reads only its own organization', (role) => {
        expect(organizationScope({ id: 'u', role, organizationId: ORG })).toEqual({ organizationId: ORG });
    });

    test.each(SCOPED_ROLES)('%s with no organization is denied', (role) => {
        expect(organizationScope({ id: 'u', role, organizationId: null })).toBe(DENY_ALL);
        expect(applicationVisibilityFilter({ id: 'u', role, organizationId: null })).toBe(DENY_ALL);
    });

    test('system_admin_platform alone crosses organizations, with or without its own', () => {
        expect(organizationScope({ id: 'u', role: CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM, organizationId: ORG })).toBeNull();
        expect(organizationScope({ id: 'u', role: CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM, organizationId: null })).toBeNull();
    });

    test('the canonical role wins over a stale role spelling', () => {
        expect(organizationScope({ id: 'u', role: 'admin', canonicalRole: CANONICAL_ROLES.DISPATCHER, organizationId: null })).toBe(DENY_ALL);
    });

    test('there is no second organization-scope module', () => {
        expect(() => require('../../shared/staff-organization-scope')).toThrow(/Cannot find module/);
    });
});
