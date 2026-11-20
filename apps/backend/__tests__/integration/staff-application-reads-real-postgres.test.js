'use strict';

/**
 * Staff reads of applications, through the real server on a real Postgres.
 *
 * Audit 2026-10-06 (reports/role-workflow-auditor/2026-10-06-staff-application-reads.md)
 * and its security review. Every request carries a real provider token, so the real
 * authenticate* middleware runs, binds the tenant context, and the tenant Prisma
 * extension narrows reads exactly as it does in production. Nothing is mocked on the
 * request path.
 *
 * Standing orders pinned here:
 *   10 — a national ID leaves the server only masked.
 *   14 — finance reads billing data only.
 *   17 — every staff role reads its own organization only; only system_admin_platform
 *        may cross; an unknown organization reads nothing. The explicit filter must hold
 *        with the tenant extension's kill-switch off (TENANT_READ_ORG_SCOPE=false).
 *
 * Every list assertion is narrowed to this file's own rows so rows left by other suites
 * on the same database cannot move the answer.
 */

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const crypto = require('crypto');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

jest.mock('../../services/pdf/pdf-generator.service', () => ({
    initialize: async () => {},
    warmUp: async () => {},
    close: async () => {},
    generatePDF: async () => Buffer.from('%PDF-1.4 staff-reads'),
    generateFromTemplate: async () => Buffer.from('%PDF-1.4 staff-reads'),
    replaceTemplateVariables: (t) => t,
    readTemplateCached: (templatePath) => require('fs').readFileSync(templatePath, 'utf8'),
}));
jest.mock('../../services/queue-service', () => ({
    ...jest.requireActual('../../services/queue-service'),
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-staff-reads' }) }),
    getPdfQueue: () => null,
}));

const STAFF = [
    ['inspector', 'field_inspector'],
    ['inspector2', 'field_inspector'],
    ['reviewer', 'document_reviewer'],
    ['dispatcher', 'dispatcher'],
    ['approver', 'certificate_approver'],
    ['financeDtam', 'finance_officer_dtam'],
    ['financePlatform', 'finance_officer_platform'],
    ['adminDtam', 'system_admin_dtam'],
    ['adminPlatform', 'system_admin_platform'],
];
const FINANCE = ['financeDtam', 'financePlatform'];
const FILED_AT = '2026-10-06T03:00:00.000Z';
const THIRTEEN_DIGITS = /(?<!\d)\d{13}(?!\d)/;

d('Staff application reads (real server, real auth + tenant middleware, real Postgres)', () => {
    let prisma;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { org: null, orgB: null, users: {}, apps: {}, entityIds: [], tokens: {}, checklists: {} };
    const label = new Map();
    const nationalId = `31${String(Date.now()).slice(-10)}7`;
    const farmAddress = `บ้านเลขที่ 99 หมู่ 4 ตำบลทดสอบ ${sfx}`;
    const farmerEmail = `sr-farmer-${sfx}@example.test`;
    const payerAddress = { address: `อาคารผู้ชำระ ${sfx}`, district: 'เขตทดสอบ', province: 'กรุงเทพมหานคร', postalCode: '10200' };
    const payerPhone = '0899999999';
    const ORIGINAL_SCOPE = process.env.TENANT_READ_ORG_SCOPE;

    const digits13 = (seed) => seed.replace(/\D/g, '').padEnd(13, '7').slice(0, 13);
    const auth = (name) => ({ Authorization: `Bearer ${fx.tokens[name]}` });
    const get = (name, url) => request(app).get(url).set(auth(name));

    const mkStaff = async (name, role) => {
        const id = crypto.randomUUID();
        await prisma.user.create({
            data: {
                id, canonicalId: `sr-${name}-${sfx}`, email: `sr-${name}-${sfx}@example.test`,
                password: 'x', firstName: 'ทดสอบ', lastName: name, role, organizationId: fx.org, status: 'ACTIVE',
                authType: 'PROVIDER_ID', providerId: digits13(id),
            },
        });
        fx.users[name] = { id, role };
        const jwtConfig = require('../../config/jwt-security');
        fx.tokens[name] = jwtConfig.generateToken(
            { id, userId: id, role, canonicalRole: role, authType: 'PROVIDER_ID', organizationId: fx.org },
            'provider',
        );
    };
    const mkApp = async (name, status, assignment = {}) => {
        const row = await prisma.application.create({
            data: {
                applicationNumber: `APP-SR-${name}-${sfx}`, healthId: nationalId,
                areaType: 'OUTDOOR', organizationId: fx.org, status,
                formData: {
                    plantId: 'cannabis',
                    submittedAt: FILED_AT,
                    farmerNote: 'ข้อมูลแบบฟอร์ม',
                    applicantData: { idCard: nationalId, phone: payerPhone, contactName: 'ผู้ติดต่อทดสอบ', ...payerAddress },
                    locationData: { farmAddress, latitude: 13.7563, longitude: 100.5018 },
                },
                ...assignment,
            },
        });
        fx.apps[name] = row.id;
        label.set(row.id, name);
    };
    const mine = (rows) => rows.map((a) => label.get(a.id)).filter(Boolean).sort();
    const listAs = async (name) => {
        const res = await get(name, '/api/applications/');
        return { status: res.status, mine: res.status === 200 ? mine(res.body.data) : [] };
    };
    const queueAs = async (name) => {
        const rows = [];
        const bodies = [];
        for (let page = 1; ; page += 1) {
            const res = await get(name, `/api/provider/applications/queue?limit=200&page=${page}`);
            if (res.status !== 200) { return { status: res.status, rows, bodies }; }
            rows.push(...res.body.data);
            bodies.push(JSON.stringify(res.body));
            if (page >= res.body.pagination.totalPages) { return { status: 200, rows, bodies }; }
        }
    };

    beforeAll(async () => {
        delete process.env.TENANT_READ_ORG_SCOPE;
        ({ prisma } = require('../../services/prisma-database'));
        const org = await prisma.organization.create({
            data: { name: `sr-${sfx}`, slug: `sr-${sfx}`, code: `SR_${sfx.toUpperCase()}` },
        });
        fx.org = org.id;
        const orgB = await prisma.organization.create({
            data: { name: `sr-b-${sfx}`, slug: `sr-b-${sfx}`, code: `SRB_${sfx.toUpperCase()}` },
        });
        fx.orgB = orgB.id;

        // APP_FK_USE_TOKEN off: the farmer's canonicalId, and so Application.healthId, IS the national ID.
        const farmerId = crypto.randomUUID();
        await prisma.user.create({
            data: {
                id: farmerId, canonicalId: nationalId, email: farmerEmail,
                password: 'x', firstName: 'เกษตรกร', lastName: 'ทดสอบ', role: 'health', organizationId: fx.org,
                authType: 'HEALTH_ID', healthId: nationalId, phoneNumber: '0810000000',
            },
        });
        fx.users.farmer = { id: farmerId };

        for (const [name, role] of STAFF) { await mkStaff(name, role); }

        const holder = await prisma.entity.create({
            data: {
                type: 'JURISTIC', displayName: `บริษัท ทดสอบ ${sfx}`, organizationId: fx.org,
                payload: { holder: { contact: { address: Object.values(payerAddress).join(' '), phone: payerPhone, email: '' } } },
            },
        });
        fx.entityIds.push(holder.id);

        await mkApp('draft', 'DRAFT');
        await mkApp('unpaidAudit', 'PENDING_AUDIT_FEE');
        await mkApp('docPaid', 'DOC_FEE_PAID', { entityId: holder.id });
        await mkApp('inspectorConfirmed', 'AUDIT_CONFIRMED', { auditorId: fx.users.inspector.id });
        await mkApp('reviewerAssigned', 'ASSIGNED_FOR_REVIEW', { reviewerId: fx.users.reviewer.id });
        await mkApp('inspectorReviewing', 'ASSIGNED_FOR_REVIEW', { reviewerId: fx.users.inspector.id });
        await mkApp('otherPassed', 'AUDIT_PASSED', { auditorId: fx.users.inspector2.id });
        await mkApp('orgB', 'DOC_FEE_PAID', { organizationId: fx.orgB });
        await mkApp('orgBConfirmed', 'AUDIT_CONFIRMED', { organizationId: fx.orgB, auditorId: fx.users.inspector.id });

        for (const [name, auditor] of [['inspectorConfirmed', 'inspector'], ['otherPassed', 'inspector2'], ['unpaidAudit', 'inspector']]) {
            const auditorId = fx.users[auditor].id;
            const checklist = await prisma.auditChecklist.create({
                data: { applicationId: fx.apps[name], templateName: 'GACP_CANNABIS', sections: [], auditorId, organizationId: fx.org },
            });
            fx.checklists[name] = checklist.id;
            await prisma.scopeOfWork.create({
                data: { applicationId: fx.apps[name], title: `SOW ${name}`, assignedAuditorId: auditorId, organizationId: fx.org },
            });
        }

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: `INV-SR-${sfx}`, healthId: nationalId, applicationId: fx.apps.docPaid,
                serviceType: 'DOCUMENT_REVIEW', subtotal: 5000, totalAmount: 5000,
                dueDate: new Date(Date.now() + 7 * 86400000), organizationId: fx.org,
            },
        });
        fx.invoiceId = invoice.id;
        fx.holderId = holder.id;
        const invoiceB = await prisma.invoice.create({
            data: {
                invoiceNumber: `INV-SRB-${sfx}`, healthId: nationalId, applicationId: fx.apps.orgB,
                serviceType: 'DOCUMENT_REVIEW', subtotal: 5000, totalAmount: 5000,
                dueDate: new Date(Date.now() + 7 * 86400000), organizationId: fx.orgB,
            },
        });
        fx.invoiceBId = invoiceB.id;
        const document = await prisma.applicationDocument.create({
            data: { applicationId: fx.apps.inspectorConfirmed, documentType: 'LAND_DOCUMENT', fileUrl: `/uploads/sr-${sfx}.pdf` },
        });
        fx.documentId = document.id;

        app = require('../../server');
        await require('../../services/prisma-database').connect();
    }, 120000);

    afterAll(async () => {
        if (ORIGINAL_SCOPE === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = ORIGINAL_SCOPE; }
        const ids = Object.values(fx.apps);
        await prisma.applicationDocument.deleteMany({ where: { applicationId: { in: ids } } });
        await prisma.invoice.deleteMany({ where: { applicationId: { in: ids } } });
        await prisma.auditChecklist.deleteMany({ where: { applicationId: { in: ids } } });
        await prisma.scopeOfWork.deleteMany({ where: { applicationId: { in: ids } } });
        await prisma.application.deleteMany({ where: { id: { in: ids } } });
        await prisma.entity.deleteMany({ where: { id: { in: fx.entityIds } } });
        await prisma.user.deleteMany({ where: { id: { in: Object.values(fx.users).map((u) => u.id) } } });
        await prisma.auditLog.deleteMany({ where: { organizationId: { in: [fx.org, fx.orgB] } } });
        await prisma.organization.deleteMany({ where: { id: { in: [fx.org, fx.orgB] } } });
    });

    // Order 17 must hold on the explicit filter alone, so the list runs twice: with the
    // tenant extension narrowing reads, and with its kill-switch off.
    describe.each([
        ['tenant read scope on', undefined],
        ['tenant read scope OFF (kill-switch)', 'false'],
    ])('GET /api/applications/ (staff branch), %s', (_label, scopeFlag) => {
        beforeAll(() => {
            if (scopeFlag === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = scopeFlag; }
        });
        afterAll(() => { delete process.env.TENANT_READ_ORG_SCOPE; });

        test('field_inspector sees only what is assigned to it in its own organization', async () => {
            // inspectorReviewing names the inspector as document reviewer (old data): an
            // inspector does not review documents (order 27), so that filing is not its own.
            expect(await listAs('inspector')).toEqual({ status: 200, mine: ['inspectorConfirmed'] });
        });

        test('document_reviewer sees only the review assigned to it', async () => {
            expect(await listAs('reviewer')).toEqual({ status: 200, mine: ['reviewerAssigned'] });
        });

        test('dispatcher sees its queue states in its own organization, never orgB', async () => {
            expect(await listAs('dispatcher')).toEqual({
                status: 200,
                mine: ['docPaid', 'inspectorConfirmed', 'inspectorReviewing', 'reviewerAssigned'],
            });
        });

        test('both finance roles get the same set: the payment window of their own organization', async () => {
            const dtam = await listAs('financeDtam');
            expect(dtam).toEqual({ status: 200, mine: ['docPaid', 'unpaidAudit'] });
            expect(await listAs('financePlatform')).toEqual(dtam);
        });

        test('certificate_approver sees its decision slice', async () => {
            expect(await listAs('approver')).toEqual({ status: 200, mine: ['otherPassed'] });
        });

        test('system_admin_dtam lists its own organization only', async () => {
            const ownOrg = [...label.values()].filter((n) => !n.startsWith('orgB')).sort();
            expect(await listAs('adminDtam')).toEqual({ status: 200, mine: ownOrg });
        });

        test('system_admin_platform: the filter does not narrow it; the tenant extension does when on', async () => {
            const all = [...label.values()].sort();
            const ownOrg = all.filter((n) => !n.startsWith('orgB'));
            expect(await listAs('adminPlatform')).toEqual({ status: 200, mine: scopeFlag === 'false' ? all : ownOrg });
        });
    });

    test('a staff role with no organization reads nothing (unknown organization = deny)', () => {
        const { applicationVisibilityFilter, DENY_ALL } = require('../../shared/application-visibility');
        for (const [name, role] of STAFF.filter(([n]) => n !== 'adminPlatform')) {
            expect(applicationVisibilityFilter({ id: fx.users[name].id, canonicalRole: role })).toEqual(DENY_ALL);
        }
    });

    describe('S1 — GET /api/provider/applications/queue carries no national ID, form data or applicant email', () => {
        const queueRoles = ['inspector', 'reviewer', 'dispatcher', 'approver', 'financeDtam', 'financePlatform', 'adminDtam'];

        test.each(queueRoles)('%s', async (who) => {
            const { status, rows, bodies } = await queueAs(who);
            expect(status).toBe(200);
            const own = rows.filter((r) => label.has(r.id));
            expect(own.length).toBeGreaterThan(0);
            for (const row of rows) {
                expect(row).not.toHaveProperty('formData');
                expect(row).not.toHaveProperty('healthId');
                expect(row.applicant || {}).not.toHaveProperty('email');
            }
            for (const body of bodies) {
                expect(body).not.toMatch(THIRTEEN_DIGITS);
                expect(body).not.toContain(farmerEmail);
                expect(body).not.toContain(farmAddress);
            }
            expect(mine(own)).not.toContain('orgB');
        });

        test('both finance roles get one billing shape', async () => {
            const dtam = await queueAs('financeDtam');
            const platform = await queueAs('financePlatform');
            const row = dtam.rows.find((r) => r.id === fx.apps.docPaid);
            expect(Object.keys(row).sort()).toEqual(
                ['applicationNumber', 'createdAt', 'daysWaiting', 'holder', 'id', 'priorityLevel', 'status', 'updatedAt'],
            );
            expect(row.holder).toMatchObject({ type: 'JURISTIC', displayName: `บริษัท ทดสอบ ${sfx}` });
            expect(platform.rows.find((r) => r.id === fx.apps.docPaid)).toEqual(row);
        });
    });

    describe('S2 — audit timelines are not finance data', () => {
        test.each(FINANCE)('%s is refused (403)', async (who) => {
            const res = await get(who, `/api/provider/applications/${fx.apps.docPaid}/audit-timelines`);
            expect(res.status).toBe(403);
            expect(res.body.data).toBeUndefined();
        });

        test('the assigned reviewer still reads its timeline (200)', async () => {
            const res = await get('reviewer', `/api/provider/applications/${fx.apps.reviewerAssigned}/audit-timelines`);
            expect(res.status).toBe(200);
        });
    });

    describe('S4 — onsite context needs visibility of the application', () => {
        const doors = [
            ['/:auditId/context', () => `/api/audit/onsite/${fx.checklists.otherPassed}/context`],
            ['/application/:applicationId/context', () => `/api/audit/onsite/application/${fx.apps.otherPassed}/context`],
        ];

        test.each(doors)('%s: an unassigned reviewer, dispatcher or inspector reads nothing (404)', async (_n, url) => {
            for (const who of ['reviewer', 'dispatcher', 'inspector']) {
                const res = await get(who, url());
                expect({ who, status: res.status }).toEqual({ who, status: 404 });
                expect(JSON.stringify(res.body)).not.toContain(farmAddress);
            }
        });

        test.each(doors)('%s: the assigned inspector reads the farm context (200)', async (_n, url) => {
            const res = await get('inspector2', url());
            expect(res.status).toBe(200);
            expect(res.body.data.audit.farmAddress).toBe(farmAddress);
        });
    });

    describe('S6 — fraud scan of an application needs visibility of it', () => {
        const url = () => `/api/fraud-detection/applications/${fx.apps.inspectorConfirmed}/documents`;

        test('an unassigned reviewer and both finance roles get 404', async () => {
            for (const who of ['reviewer', ...FINANCE]) {
                const res = await get(who, url());
                expect({ who, status: res.status }).toEqual({ who, status: 404 });
            }
        });

        test('the assigned inspector gets 200', async () => {
            expect((await get('inspector', url())).status).toBe(200);
        });

        test('verifying one document: an unassigned reviewer and finance get 404 and nothing is written', async () => {
            const verifiedAt = () => prisma.applicationDocument
                .findFirst({ where: { id: fx.documentId }, select: { verifiedAt: true } })
                .then((r) => r.verifiedAt);
            const before = await verifiedAt();
            for (const who of ['reviewer', ...FINANCE]) {
                const res = await request(app).post(`/api/fraud-detection/documents/${fx.documentId}/verify`).set(auth(who));
                expect({ who, status: res.status }).toEqual({ who, status: 404 });
            }
            expect(await verifiedAt()).toEqual(before);
        });

        test('verifying one document: the assigned inspector gets 200', async () => {
            const res = await request(app).post(`/api/fraud-detection/documents/${fx.documentId}/verify`).set(auth('inspector'));
            expect(res.status).toBe(200);
        });
    });

    describe('F1b + S7 — checklist, SOW and activities need visibility, and are never finance data', () => {
        const doors = [
            ['checklist', (id) => `/api/provider/applications/${id}/checklist`],
            ['sow', (id) => `/api/provider/applications/${id}/sow`],
            ['activities', (id) => `/api/provider/applications/${id}/activities`],
        ];

        test.each(doors)('%s: an inspector cannot read another inspector’s application (404)', async (_n, url) => {
            const res = await get('inspector', url(fx.apps.otherPassed));
            expect(res.status).toBe(404);
            expect(res.body.data).toBeUndefined();
        });

        test.each(doors)('%s: finance gets 404 even inside its payment window', async (_n, url) => {
            for (const who of FINANCE) {
                const res = await get(who, url(fx.apps.unpaidAudit));
                expect({ who, status: res.status }).toEqual({ who, status: 404 });
                expect(res.body.data).toBeUndefined();
            }
        });

        test.each(doors)('%s: an assigned inspector cannot reach its application in another organization (404)', async (_n, url) => {
            expect((await get('inspector', url(fx.apps.orgBConfirmed))).status).toBe(404);
        });

        test.each(doors)('%s: the assigned inspector reads its own application (200)', async (_n, url) => {
            const res = await get('inspector', url(fx.apps.inspectorConfirmed));
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        test.each(doors)('%s: the dispatcher reads an application in its queue (200)', async (_n, url) => {
            expect((await get('dispatcher', url(fx.apps.inspectorConfirmed))).status).toBe(200);
        });
    });

    describe('F3 — finance reads billing data only on the detail door', () => {
        const detailAs = (name, appName) => get(name, `/api/provider/applications/${fx.apps[appName]}`);

        test('both finance roles get the same billing shape, with no form data, contact or national ID', async () => {
            const dtam = await detailAs('financeDtam', 'docPaid');
            const platform = await detailAs('financePlatform', 'docPaid');
            expect(dtam.status).toBe(200);
            expect(platform.body).toEqual(dtam.body);

            const body = JSON.stringify(dtam.body);
            for (const key of ['formData', 'health', 'Applicant', 'workflowHistory', 'comments']) {
                expect(dtam.body.data).not.toHaveProperty(key);
            }
            expect(body).not.toContain(farmerEmail);
            expect(body).not.toContain('0810000000');
            expect(body).not.toContain('farmerNote');
            expect(body).not.toMatch(THIRTEEN_DIGITS);
            expect(dtam.body.data).toMatchObject({
                id: fx.apps.docPaid,
                applicationNumber: `APP-SR-docPaid-${sfx}`,
                status: 'DOC_FEE_PAID',
                submittedAt: FILED_AT,
                holder: { type: 'JURISTIC', displayName: `บริษัท ทดสอบ ${sfx}` },
            });
        });

        test.each([
            ['reviewer', 'reviewerAssigned'],
            ['approver', 'otherPassed'],
        ])('%s still gets the full detail', async (who, appName) => {
            const res = await detailAs(who, appName);
            expect(res.status).toBe(200);
            expect(res.body.data.formData).toMatchObject({ plantId: 'cannabis', farmerNote: 'ข้อมูลแบบฟอร์ม' });
            expect(res.body.data.health).toMatchObject({ email: farmerEmail, phone: '0810000000' });
        });

        // The field inspector reads the filing but no contact of the applicant; the person on site
        // comes from the audited site-contact door (orders 29 and 56(3)). What it reads is an allowlist
        // (security re-review L-A): a key the list does not name stays out.
        test('inspector gets the filing without the applicant\'s email or phone', async () => {
            const res = await detailAs('inspector', 'inspectorConfirmed');
            expect(res.status).toBe(200);
            expect(res.body.data.formData).toMatchObject({ plantId: 'cannabis' });
            expect(res.body.data.formData).not.toHaveProperty('farmerNote');
            expect(res.body.data.health).not.toHaveProperty('email');
            expect(res.body.data.health).not.toHaveProperty('phone');
            expect(JSON.stringify(res.body)).not.toContain(farmerEmail);
        });
    });

    describe('F4 + order 17 — the detail door stays inside the caller’s organization', () => {
        const detail = (who, appName) => get(who, `/api/provider/applications/${fx.apps[appName]}`);

        test.each(['adminDtam', 'dispatcher', ...FINANCE])('%s cannot open another organization’s application (404)', async (who) => {
            const res = await detail(who, 'orgB');
            expect(res.status).toBe(404);
            expect(res.body.data).toBeUndefined();
        });

        test('system_admin_dtam opens its own organization’s application (200)', async () => {
            expect((await detail('adminDtam', 'draft')).status).toBe(200);
        });

        test('system_admin_platform on this door is narrowed to its own organization by the tenant extension', async () => {
            expect((await detail('adminPlatform', 'draft')).status).toBe(200);
            expect((await detail('adminPlatform', 'orgB')).status).toBe(404);
        });
    });

    describe('S5 / order 18 — finance sees the payer name, never the applicant email or phone', () => {
        const noContact = (res) => {
            const body = JSON.stringify(res.body);
            expect(body).not.toContain(farmerEmail);
            expect(body).not.toContain('0810000000');
            expect(body).not.toMatch(/emailMasked|phoneNumberMasked/);
        };

        const payerAddressLine = () => Object.values(payerAddress).join(' ');
        const expectPayerBlock = (payer) => {
            expect(payer).toEqual({
                type: 'JURISTIC',
                nameLabel: 'ชื่อบริษัท',
                name: `บริษัท ทดสอบ ${sfx}`,
                idLabel: 'เลขประจำตัวผู้เสียภาษี',
                idPrinted: '-',
                address: payerAddressLine(),
            });
        };
        const noPayerContact = (res) => {
            const body = JSON.stringify(res.body);
            expect(body).not.toContain(payerPhone);
            expect(body).not.toContain('ผู้ติดต่อทดสอบ');
            expect(body).not.toContain('formData');
            expect(body).not.toMatch(THIRTEEN_DIGITS);
        };

        test.each(FINANCE)('%s: invoice detail carries the payer name + address and the applicant name only', async (who) => {
            const res = await get(who, `/api/invoices/${fx.invoiceId}`);
            expect(res.status).toBe(200);
            expect(res.body.data.applicant).toEqual({ id: fx.users.farmer.id, firstName: 'เกษตรกร', lastName: 'ทดสอบ' });
            expectPayerBlock(res.body.data.payer);
            expect(res.body.data.application.entity).toEqual({ id: fx.holderId, type: 'JURISTIC', displayName: `บริษัท ทดสอบ ${sfx}` });
            noContact(res);
            noPayerContact(res);
        });

        test.each(FINANCE)('%s: invoice list carries no national ID or applicant contact', async (who) => {
            const res = await get(who, '/api/invoices?limit=1000');
            expect(res.status).toBe(200);
            const row = res.body.data.invoices.find((i) => i.id === fx.invoiceId);
            expect(row).toBeDefined();
            expect(row).not.toHaveProperty('healthId');
            noContact(res);
            expect(JSON.stringify(res.body)).not.toContain(nationalId);
        });

        test.each(FINANCE)('%s: customer statement carries no masked phone or email', async (who) => {
            const res = await get(who, `/api/finance/customer-statement?applicantHealthId=${nationalId}`);
            expect(res.status).toBe(200);
            expect(res.body.data.applicant.name).toBeTruthy();
            noContact(res);
        });

        test('the applicant’s own invoice and statement keep its contact', async () => {
            const invoiceService = require('../../services/invoice-service');
            const statementService = require('../../services/customer-statement-service');
            const own = await invoiceService.getForHolder(fx.invoiceId, { scope: { readIds: [fx.holderId] } });
            expect(own.applicant).toMatchObject({ email: farmerEmail, phoneNumber: '0810000000' });
            const statement = await statementService.generateApplicationStatement({
                applicationId: fx.apps.docPaid, organizationId: fx.org,
            });
            expect(statement.applicant.phoneNumberMasked).toMatch(/0000$/);
            expect(statement.applicant.emailMasked).toBeTruthy();
        });
    });

    describe.each([
        ['tenant read scope on', undefined],
        ['tenant read scope OFF (kill-switch)', 'false'],
    ])('Order 17 on the finance documents, %s', (_label, scopeFlag) => {
        beforeAll(() => {
            if (scopeFlag === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = scopeFlag; }
        });
        afterAll(() => { delete process.env.TENANT_READ_ORG_SCOPE; });

        test.each(FINANCE)('%s cannot open another organization’s invoice (404)', async (who) => {
            const res = await get(who, `/api/invoices/${fx.invoiceBId}`);
            expect(res.status).toBe(404);
            expect(res.body.data).toBeUndefined();
        });

        test.each(FINANCE)('%s does not list another organization’s invoice', async (who) => {
            const res = await get(who, '/api/invoices?limit=1000');
            expect(res.status).toBe(200);
            const ids = res.body.data.invoices.map((i) => i.id);
            expect(ids).toContain(fx.invoiceId);
            expect(ids).not.toContain(fx.invoiceBId);
        });

        // Order 47 (operator 2026-10-08): the platform admin reads no finance, in any organization.
        test('system_admin_platform opens no organization’s invoice', async () => {
            expect((await get('adminPlatform', `/api/invoices/${fx.invoiceId}`)).status).toBe(403);
            expect((await get('adminPlatform', `/api/invoices/${fx.invoiceBId}`)).status).toBe(403);
            expect((await get('adminPlatform', '/api/invoices')).status).toBe(403);
        });
    });

    describe('Cleanup — the sameReviewerAuditor branch carried nothing', () => {
        test('an inspector recorded as the reviewer (old data) no longer sees that filing, and still may not inspect it', async () => {
            const { withVisibility } = require('../../shared/application-visibility');
            const { assertInspectorIsNotReviewer } = require('../../shared/reviewer-inspector-separation');
            await prisma.application.update({ where: { id: fx.apps.inspectorReviewing }, data: { sameReviewerAuditor: true } });

            const seen = await prisma.application.findMany({
                where: withVisibility(
                    { organizationId: fx.org, isDeleted: false },
                    { id: fx.users.inspector.id, canonicalRole: 'field_inspector', organizationId: fx.org },
                ),
                select: { id: true },
            });
            expect(mine(seen)).toEqual(['inspectorConfirmed']);

            expect(() => assertInspectorIsNotReviewer({ reviewerId: fx.users.inspector.id, auditorId: fx.users.inspector.id }))
                .toThrow(expect.objectContaining({ code: 'INSPECTOR_IS_APPLICATION_REVIEWER' }));
        });
    });
});
