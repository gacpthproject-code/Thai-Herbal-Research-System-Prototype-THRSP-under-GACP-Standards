'use strict';

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const fs = require('fs');
const path = require('path');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { tenantContextMiddleware } = require('../../middleware/tenant-context-middleware');
const { tenantInjectExtension } = require('../../services/tenant-prisma-extension');
const { withVisibility } = require('../../shared/application-visibility');
const { createApplicationProviderQueryMethods } = require('../../services/application-service/application-provider-query-methods');

const REWRITE_SECTION_6 =
    'ผู้ดูแลแพลตฟอร์มเปิดคำขอของหน่วยงานอื่นได้แล้ว ต้องแก้ข้อ 6 ของหน้านโยบายความเป็นส่วนตัว '
    + '(apps/web-app/src/app/(marketing)/privacy-policy/page.tsx) ที่บอกว่าเห็นคำขอฉบับเต็มภายในหน่วยงานของตน '
    + 'ในการเปลี่ยนแปลงเดียวกัน';

function asSection6Says(check) {
    try {
        check();
    } catch (err) {
        err.message = `${REWRITE_SECTION_6}\n\n${err.message}`;
        throw err;
    }
}

function clientThroughTheTenantExtension(reads) {
    const hooks = tenantInjectExtension.query.$allModels;
    const application = new Proxy({}, {
        get: (_target, verb) => (args) => {
            const query = async (finalArgs) => {
                reads.push(finalArgs.where);
                return null;
            };
            return hooks[verb] ? hooks[verb]({ model: 'Application', operation: verb, args, query }) : query(args);
        },
    });
    return { application };
}

describe('privacy notice section 6: the platform admin reads full applications in its own organization only', () => {
    const ORIGINAL_FLAG = process.env.TENANT_READ_ORG_SCOPE;
    afterAll(() => {
        if (ORIGINAL_FLAG === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; }
        else { process.env.TENANT_READ_ORG_SCOPE = ORIGINAL_FLAG; }
    });

    test('opening an application by id reads it only from the organization the platform admin belongs to', async () => {
        delete process.env.TENANT_READ_ORG_SCOPE;
        const reads = [];
        const methods = createApplicationProviderQueryMethods({ prisma: clientThroughTheTenantExtension(reads) });
        const platformAdmin = {
            id: 'platform-admin-1',
            canonicalRole: CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM,
            organizationId: 'org-of-the-platform-admin',
        };
        const req = { user: platformAdmin, method: 'GET', baseUrl: '/api/provider/applications', path: '/APP-OF-ANOTHER-ORG' };

        await tenantContextMiddleware()(req, {}, () => methods.findProviderApplicationDetail({
            where: withVisibility({ OR: [{ id: 'APP-OF-ANOTHER-ORG' }, { applicationNumber: 'APP-OF-ANOTHER-ORG' }], isDeleted: false }, platformAdmin),
            select: { id: true },
        }));

        asSection6Says(() => expect(reads).toEqual([
            expect.objectContaining({ organizationId: 'org-of-the-platform-admin' }),
        ]));
    });

    test('neither the detail door nor the router it hangs on steps outside the organization the request is bound to', () => {
        for (const file of ['routes/api/provider/applications.js', 'routes/api/provider/index.js']) {
            const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
            asSection6Says(() => expect({ file, leavesItsOrganization: /withoutTenantScope/.test(source) })
                .toEqual({ file, leavesItsOrganization: false }));
        }
    });
});
