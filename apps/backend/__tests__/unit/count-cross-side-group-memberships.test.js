'use strict';

/**
 * The read-only counting script of review item M1 (apps/backend/scripts/ops/
 * count-cross-side-group-memberships.js). It must run inside an older container through
 * `node -`, so it carries its own copy of the role sides; this file keeps that copy equal to
 * canonical-rbac and checks that the script needs nothing but @prisma/client.
 */

const fs = require('fs');
const path = require('path');
const { ROLE_AFFILIATION_BY_ROLE, CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const script = require('../../scripts/ops/count-cross-side-group-memberships');

const SOURCE = fs.readFileSync(path.join(__dirname, '../../scripts/ops/count-cross-side-group-memberships.js'), 'utf8');

describe('count-cross-side-group-memberships', () => {
    test('its side table is canonical-rbac\'s, role for role', () => {
        expect(script.SIDE_BY_ROLE).toEqual(Object.fromEntries(
            Object.values(CANONICAL_ROLES).map((role) => [role, ROLE_AFFILIATION_BY_ROLE[role]]),
        ));
    });

    test('it needs nothing but @prisma/client', () => {
        const required = [...SOURCE.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
        expect(required).toEqual(['@prisma/client']);
    });

    test('it counts per pair of sides, flags the cross-side pairs and skips deleted accounts', () => {
        const lines = script.tally([
            { groupCode: 'system_admin_dtam', accountRole: 'finance_officer_platform', accountDeleted: false },
            { groupCode: 'system_admin_dtam', accountRole: 'finance_officer_platform', accountDeleted: true },
            { groupCode: 'dispatcher', accountRole: 'health', accountDeleted: false },
            { groupCode: 'dispatcher', accountRole: 'document_reviewer', accountDeleted: false },
            { groupCode: 'dispatcher', accountRole: 'REVIEWER_AUDITOR', accountDeleted: false },
        ]);
        expect(lines).toEqual([
            { groupSide: 'certification_body', accountSide: 'certification_body', memberships: 1, crossSide: false },
            { groupSide: 'certification_body', accountSide: 'platform_operator', memberships: 1, crossSide: true },
            { groupSide: 'certification_body', accountSide: 'public', memberships: 1, crossSide: true },
            { groupSide: 'certification_body', accountSide: 'unknown', memberships: 1, crossSide: true },
        ]);
        expect(script.render(lines).split('\n').pop()).toBe('cross-side total: 3');
    });
});
