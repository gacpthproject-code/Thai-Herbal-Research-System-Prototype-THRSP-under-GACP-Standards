'use strict';

const fs = require('fs');
const path = require('path');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { applicationVisibilityFilter } = require('../../shared/application-visibility');

const REWRITE_SECTION_6 =
    'ใครเห็นผู้ติดต่อหน้างานในขั้นตอนใดเปลี่ยนไปแล้ว ต้องแก้ข้อ 6 ของหน้านโยบายความเป็นส่วนตัว '
    + '(apps/web-app/src/app/(marketing)/privacy-policy/page.tsx) ในการเปลี่ยนแปลงเดียวกัน';

function siteContactStages() {
    const source = fs.readFileSync(path.join(__dirname, '../../routes/api/provider/applications.js'), 'utf8');
    const block = /const SITE_CONTACT_STAGES = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(source);
    if (!block) {
        throw new Error('SITE_CONTACT_STAGES is no longer an object literal in routes/api/provider/applications.js');
    }
    return Object.fromEntries(Array.from(
        block[1].matchAll(/\[CANONICAL_ROLES\.(\w+)\]: Object\.freeze\(\[([^\]]*)\]\)/g),
        ([, role, states]) => [CANONICAL_ROLES[role], Array.from(states.matchAll(/'(\w+)'/g), ([, state]) => state)],
    ));
}

function asSection6Says(check) {
    try {
        check();
    } catch (err) {
        err.message = `${REWRITE_SECTION_6}\n\n${err.message}`;
        throw err;
    }
}

describe('privacy notice section 6: who reads the person on site, and when', () => {
    test('the door opens to the dispatcher from booking to the result and a second visit, and to the inspector from the visit through the corrections', () => {
        asSection6Says(() => expect(siteContactStages()).toEqual({
            [CANONICAL_ROLES.DISPATCHER]: ['AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', 'CAR_REVIEWING'],
            [CANONICAL_ROLES.FIELD_INSPECTOR]: ['AUDIT_CONFIRMED', 'CAR_PENDING', 'CAR_REVIEWING'],
        }));
    });

    test('every dispatcher of the organization reads it, and under correction review only where the inspector asked for a second visit', () => {
        const filter = applicationVisibilityFilter({ id: 'dispatcher-1', canonicalRole: CANONICAL_ROLES.DISPATCHER, organizationId: 'org-1' });
        asSection6Says(() => {
            expect(JSON.stringify(filter)).not.toContain('dispatcher-1');
            const [organization, roleScope] = filter.AND;
            expect(organization).toEqual({ organizationId: 'org-1' });
            const plain = roleScope.OR.find((branch) => branch.status && branch.status.in);
            expect(plain.status.in).toEqual(expect.arrayContaining(['AUDIT_FEE_PAID', 'AUDIT_CONFIRMED']));
            expect(plain.status.in).not.toContain('CAR_REVIEWING');
            expect(roleScope.OR.filter((branch) => branch !== plain)).toEqual([
                { status: 'CAR_REVIEWING', formData: { path: ['reinspection', 'status'], equals: 'REQUESTED' } },
            ]);
        });
    });

    test('a field inspector reads it only for the applications it inspects, in its own organization', () => {
        asSection6Says(() => expect(
            applicationVisibilityFilter({ id: 'inspector-1', canonicalRole: CANONICAL_ROLES.FIELD_INSPECTOR, organizationId: 'org-1' }),
        ).toEqual({ AND: [{ organizationId: 'org-1' }, { auditorId: 'inspector-1' }] }));
    });
});
