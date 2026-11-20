'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { analyzeApplication, analyzeRecord } = require('../../services/standards-analyzer-service');
const { STANDARDS } = require('../../data/standards/gacp-requirement-comparison');
const { cases } = require('../../data/standards/a5-answer-key/cases.json');

const verdicts = (result) => result.requirements.map((r) => [r.id, r.status]);
const areaTypeOf = (c) => c.application.formData.farmData?.areaTypes?.[0] ?? 'OUTDOOR';

d('KPI A5: answer-key cases through the database give the same verdicts (real Postgres)', () => {
    let raw;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { apps: new Map() };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `a5-${sfx}`, slug: `a5-${sfx}`, code: `A5_${sfx}`.toUpperCase() } });
        fx.orgId = org.id;
        const filerId = crypto.randomUUID();
        fx.filer = { id: filerId, canonicalId: `a5-filer-${sfx}` };
        await raw.user.create({
            data: {
                id: filerId, canonicalId: fx.filer.canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                healthId: fx.filer.canonicalId, email: `${fx.filer.canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: 'A5',
                organizationId: fx.orgId, status: 'ACTIVE', accountType: 'HEALTH',
            },
        });
        for (const c of cases) {
            const row = await raw.application.create({
                data: {
                    applicationNumber: `APP-A5-${c.id}-${sfx}`, healthId: fx.filer.canonicalId, areaType: areaTypeOf(c),
                    organizationId: fx.orgId, submitterId: filerId, status: c.application.status, formData: c.application.formData,
                },
            });
            for (const documentType of c.application.documentTypes) {
                await raw.applicationDocument.create({
                    data: { applicationId: row.id, documentType, fileName: `${documentType}.pdf`, fileUrl: `/uploads/a5/${row.id.slice(0, 8)}/${documentType}.pdf` },
                });
            }
            fx.apps.set(c.id, row.id);
        }
    });

    afterAll(async () => {
        if (!raw) { return; }
        const ids = [...fx.apps.values()];
        await raw.applicationDocument.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
        if (fx.filer) { await raw.user.deleteMany({ where: { id: fx.filer.id } }).catch(() => {}); }
        if (fx.orgId) { await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {}); }
        await raw.$disconnect();
    });

    test.each(cases.map((c) => [c.id, c]))('%s', async (_id, c) => {
        const actor = { canonicalRole: 'document_reviewer', role: 'document_reviewer', organizationId: fx.orgId };
        for (const { code } of STANDARDS) {
            const throughDoor = await analyzeApplication(fx.apps.get(c.id), code, { actor });
            const inProcess = analyzeRecord(code, {
                status: c.application.status,
                formData: c.application.formData,
                documents: c.application.documentTypes.map((documentType) => ({ documentType })),
            });
            expect(verdicts(throughDoor)).toEqual(verdicts(inProcess));
        }
    });
});
