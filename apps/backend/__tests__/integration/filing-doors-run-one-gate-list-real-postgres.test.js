'use strict';

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { stageCarFile, carRoundFiles } = require('../../test-support/car-staged-file');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { seedHolderScopeFixture, cleanupHolderScopeFixture } = require('./fixtures/holder-scope-fixture');

jest.mock('../../services/pdf/pdf-generator.service', () => ({
    initialize: async () => {},
    warmUp: async () => {},
    close: async () => {},
    generatePDF: async () => Buffer.from('%PDF-1.4 gates'),
    generateFromTemplate: async () => Buffer.from('%PDF-1.4 gates'),
    replaceTemplateVariables: (t) => t,
    readTemplateCached: (templatePath) => require('fs').readFileSync(templatePath, 'utf8'),
}));
jest.mock('../../services/queue-service', () => ({
    ...jest.requireActual('../../services/queue-service'),
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-gates' }) }),
    getPdfQueue: () => null,
}));

const CAR_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'car');

function taxIdWithValidCheckDigit() {
    const digits = [0, 1 + crypto.randomInt(9), ...Array.from({ length: 10 }, () => crypto.randomInt(10))];
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    return digits.join('') + String((11 - (sum % 11)) % 10);
}

function company() {
    return {
        companyName: 'บริษัท ด่านเดียว จำกัด', taxId: taxIdWithValidCheckDigit(), directorName: 'สมชาย ใจดี',
        phone: '0812345678', address: '99 หมู่ 1 บางพลี สมุทรปราการ 10540',
    };
}

const ON_SITE_CONTACT = Object.freeze({ siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true });

function katorlor1Filing(farmOverrides = {}) {
    return {
        plantId: 'cannabis',
        certificationPurposes: ['EXPORT'],
        applicantType: 'JURISTIC',
        applicantData: company(),
        varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],
        farmData: {
            siteName: 'แปลงบางพลี', siteAddress: '99 หมู่ 1', areaSqm: '1600', province: 'สมุทรปราการ',
            district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', landOwnership: 'OWN',
            landDocumentDetail: { type: 'โฉนด', number: '12345' }, coordinates: '13.6069, 100.7061', plantsPerCycle: '500', cyclesPerYear: '2',
            areaTypes: ['OUTDOOR'], ...ON_SITE_CONTACT, ...farmOverrides,
        },
    };
}

function olderShapeFiling(farmOverrides = {}) {
    return {
        plantId: 'cannabis',
        serviceType: 'new_application',
        certificationPurposes: ['EXPORT'],
        cultivationMethods: ['OUTDOOR'],
        applicantType: 'JURISTIC',
        applicantData: { applicantType: 'JURISTIC', ...company() },
        farmData: {
            farmName: 'ไร่ทดสอบด่าน', address: '1 หมู่ 2', province: 'เชียงใหม่', totalAreaSize: '2', totalAreaUnit: 'Rai',
            landOwnership: 'OWN', ...farmOverrides,
        },
        plots: [{ id: 'p1', name: 'แปลง 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
        productionData: { propagationType: ['SEED'], plantParts: ['FLOWER'] },
        harvestData: { harvestMethod: 'MANUAL', dryingMethod: 'SUN', storageSystem: 'AMBIENT' },
        documents: [{ documentId: 'd1', type: 'land_rights', name: 'land.pdf', url: '/uploads/application-drafts/land.pdf', uploaded: true }],
    };
}

d('every filing door runs the one gate list (real Postgres, real server)', () => {
    let raw;
    let app;
    let fx;
    let seq = 0;
    const results = {};

    const answerOf = (res) => ({
        status: res.status,
        code: res.body?.code || res.body?.error || null,
        errorSteps: Object.keys(res.body?.errorsByStep || {}).sort(),
        missingFields: res.body?.missingFields || [],
    });

    async function settle(applicationId, milestone) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-GATES-${seq}-${fx.sfx}`.toUpperCase(), applicationId, healthId: fx.users.A.canonicalId,
                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0,
                dueDate: new Date(), status: 'PAID', paidAt: new Date(), organizationId: fx.orgId, metadata: {},
            },
        });
        await raw.checkoutOrder.create({
            data: {
                applicationId, milestone, platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0,
                totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id, organizationId: fx.orgId,
            },
        });
    }

    async function filingIn(status, formData, { declarations = true } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-GATES-${seq}-${fx.sfx}`.toUpperCase(), healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status,
                formData: {
                    ...formData,
                    workflowState: status,
                    ...(status === 'DRAFT' ? {} : {
                        serverRequirementSnapshot: { stampedAt: new Date(Date.now() - 86400000).toISOString(), ruleIds: [], slotIds: [] },
                        ...(declarations ? { declarationsAcceptedAt: new Date(Date.now() - 86400000).toISOString() } : {}),
                    }),
                    ...(status === 'CAR_PENDING' ? { carDueAt: new Date(Date.now() + 30 * 86400000).toISOString() } : {}),
                },
            },
        });
        if (status === 'DRAFT') {
            for (const documentType of ['COMPANY_REG', 'LICENCE_PT10']) {
                await raw.applicationDocument.create({
                    data: { applicationId: row.id, documentType, fileUrl: `/uploads/test/gates-${documentType}-${seq}.pdf` },
                });
            }
        }
        if (status === 'REVISION_REQUESTED' || status === 'CAR_PENDING') { await settle(row.id, 'M1'); }
        if (status === 'CAR_PENDING') { await settle(row.id, 'M2'); }
        if (status === 'REVISION_REQUESTED') {
            await raw.applicationDocumentReview.create({
                data: {
                    applicationId: row.id, slotId: 'land_rights', verdict: 'MORE_REQUESTED', reason: 'สำเนาโฉนดอ่านไม่ออก',
                    dueDate: new Date(Date.now() + 5 * 86400000), reviewerId: fx.users.F.id, round: 1,
                    createdAt: new Date(Date.now() - 3600000), organizationId: fx.orgId,
                },
            });
            await raw.applicationDocument.create({
                data: { applicationId: row.id, slotId: 'land_rights', documentType: 'LAND_RIGHTS', fileUrl: `/uploads/test/gates-land-${seq}.pdf` },
            });
        }
        return row.id;
    }

    async function rowOf(applicationId) {
        const row = await raw.application.findUnique({ where: { id: applicationId } });
        return {
            status: row.status,
            carDocuments: Array.isArray(row.formData?.carDocuments) ? row.formData.carDocuments.length : 0,
            quotations: await raw.quotation.count({ where: { applicationId } }),
        };
    }

    const carFilesOnDisk = () => (fs.existsSync(CAR_DIR) ? fs.readdirSync(CAR_DIR) : []);
    const stageOne = (id) => stageCarFile(raw, id);
    const sendCar = (id, h, staged) => request(app).post(`/api/applications/${id}/car`).set(h)
        .send({ notes: 'แก้แล้ว', files: carRoundFiles([staged]) });

    const CASES = {
        'PUT /:id/revision, DRAFT': {
            status: 'DRAFT', formData: () => katorlor1Filing(),
            send: (id, h) => request(app).put(`/api/applications/${id}/revision`).set(h).send({ formData: katorlor1Filing(), notes: 'ยื่น' }),
        },
        'PUT /:id/revision, REVISION_REQUESTED': {
            status: 'REVISION_REQUESTED', formData: () => katorlor1Filing(),
            send: (id, h) => request(app).put(`/api/applications/${id}/revision`).set(h).send({ formData: katorlor1Filing(), notes: 'แก้แล้ว' }),
        },
        'POST /:id/revision-resubmit, complete': {
            status: 'REVISION_REQUESTED', formData: () => katorlor1Filing(),
            send: (id, h) => request(app).post(`/api/applications/${id}/revision-resubmit`).set(h).send({}),
        },
        'POST /:id/revision-resubmit, area ticks removed': {
            status: 'REVISION_REQUESTED', formData: () => katorlor1Filing({ areaTypes: [] }),
            send: (id, h) => request(app).post(`/api/applications/${id}/revision-resubmit`).set(h).send({}),
        },
        'POST /:id/revision-resubmit, older shape without an on-site contact': {
            status: 'REVISION_REQUESTED', formData: () => olderShapeFiling(),
            send: (id, h) => request(app).post(`/api/applications/${id}/revision-resubmit`).set(h).send({}),
        },
        'POST /:id/revision-resubmit, a purpose no licence backs': {
            status: 'REVISION_REQUESTED', formData: () => ({ ...katorlor1Filing(), certificationPurposes: ['MEDICAL'] }),
            send: (id, h) => request(app).post(`/api/applications/${id}/revision-resubmit`).set(h).send({}),
        },
        'POST /:id/revision-resubmit, no declarations on record': {
            status: 'REVISION_REQUESTED', formData: () => katorlor1Filing(), declarations: false,
            send: (id, h) => request(app).post(`/api/applications/${id}/revision-resubmit`).set(h).send({}),
        },
        'POST /:id/revision-resubmit, member without consent': {
            status: 'REVISION_REQUESTED', formData: () => katorlor1Filing(), actor: 'O2',
            send: (id, h) => request(app).post(`/api/applications/${id}/revision-resubmit`).set(h).send({}),
        },
        'POST /:id/car, complete': {
            status: 'CAR_PENDING', formData: () => katorlor1Filing(),
            prepare: stageOne, send: sendCar,
        },
        'POST /:id/car, area ticks removed': {
            status: 'CAR_PENDING', formData: () => katorlor1Filing({ areaTypes: [] }),
            prepare: stageOne, send: sendCar,
        },
        'POST /:id/car, older shape without an on-site contact': {
            status: 'CAR_PENDING', formData: () => olderShapeFiling(),
            prepare: stageOne, send: sendCar,
        },
        'POST /:id/car, a purpose no licence backs': {
            status: 'CAR_PENDING', formData: () => ({ ...katorlor1Filing(), certificationPurposes: ['MEDICAL'] }),
            prepare: stageOne, send: sendCar,
        },
        'POST /:id/car, no declarations on record': {
            status: 'CAR_PENDING', formData: () => katorlor1Filing(), declarations: false,
            prepare: stageOne, send: sendCar,
        },
        'POST /:id/car, member without consent': {
            status: 'CAR_PENDING', formData: () => katorlor1Filing(), actor: 'O2',
            prepare: stageOne, send: sendCar,
        },
        'POST /submit, older shape with an on-site contact': {
            status: 'DRAFT', formData: () => olderShapeFiling(ON_SITE_CONTACT),
            send: (id, h) => request(app).post('/api/applications/submit').set(h).send({ applicationId: id, declarationsAccepted: true }),
        },
        'POST /submit, older shape without an on-site contact': {
            status: 'DRAFT', formData: () => olderShapeFiling(),
            send: (id, h) => request(app).post('/api/applications/submit').set(h).send({ applicationId: id, declarationsAccepted: true }),
        },
        'POST /submit resubmit, older shape without an on-site contact': {
            status: 'REVISION_REQUESTED', formData: () => olderShapeFiling(),
            send: (id, h) => request(app).post('/api/applications/submit').set(h).send({ applicationId: id }),
        },
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await seedHolderScopeFixture(raw);
        const { ConsentVersions } = require('../../middleware/consent-manager');
        for (const category of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'PAYMENT_TERMS']) {
            await raw.userConsent.create({
                data: { userId: fx.users.A.id, organizationId: fx.orgId, category, version: ConsentVersions[category], granted: true, grantedAt: new Date() },
            });
        }
        app = require('../../server');
        await require('../../services/prisma-database').connect();

        for (const [name, kase] of Object.entries(CASES)) {
            const id = await filingIn(kase.status, kase.formData(), { declarations: kase.declarations !== false });
            const prepared = kase.prepare ? await kase.prepare(id) : null;
            const filesBefore = carFilesOnDisk().length;
            const res = await kase.send(id, { Authorization: `Bearer ${fx.tokens[kase.actor || 'A']}` }, prepared);
            results[name] = { from: kase.status, answer: answerOf(res), row: await rowOf(id), carFilesAdded: carFilesOnDisk().length - filesBefore };
        }

        if (process.env.FILING_GATES_PROBE_OUT) {
            fs.writeFileSync(process.env.FILING_GATES_PROBE_OUT, `${JSON.stringify(results, null, 1)}\n`);
        }
    }, 300000);

    afterAll(async () => {
        if (raw) {
            const rows = await raw.application.findMany({ where: { organizationId: fx?.orgId }, select: { formData: true } }).catch(() => []);
            for (const row of rows) {
                for (const doc of [row.formData?.carDocuments, row.formData?.carStagedFiles].flatMap((list) => (Array.isArray(list) ? list : []))) {
                    if (doc && /^CAR-[\w.-]+$/.test(String(doc.filename))) { fs.rmSync(path.join(CAR_DIR, doc.filename), { force: true }); }
                }
            }
            await cleanupHolderScopeFixture(raw, fx);
            await raw.$disconnect();
        }
    });

    test.each([
        ['PUT /:id/revision, DRAFT'],
        ['PUT /:id/revision, REVISION_REQUESTED'],
    ])('%s: not a door; the application stays where it stood and nothing is priced', (name) => {
        const { from, answer, row } = results[name];
        expect(answer.status).toBe(404);
        expect(row).toMatchObject({ status: from, quotations: 0 });
    });

    test.each([
        ['POST /:id/revision-resubmit, complete', 'ASSIGNED_FOR_REVIEW'],
        ['POST /:id/car, complete', 'CAR_REVIEWING'],
        ['POST /submit, older shape with an on-site contact', 'PENDING_DOC_FEE'],
    ])('%s: filed (%s)', (name, toStatus) => {
        expect(results[name].answer.status).toBe(200);
        expect(results[name].row.status).toBe(toStatus);
    });

    test.each([
        ['POST /:id/revision-resubmit, area ticks removed', ['2']],
        ['POST /:id/car, area ticks removed', ['2']],
    ])('%s: 422 APPLICATION_INCOMPLETE on the area step, nothing moves', (name, steps) => {
        const { from, answer, row, carFilesAdded } = results[name];
        expect(answer).toMatchObject({ status: 422, code: 'APPLICATION_INCOMPLETE', errorSteps: steps });
        expect(answer.missingFields).toContain('step2.cultivation_methods');
        expect(row).toMatchObject({ status: from, carDocuments: 0 });
        expect(carFilesAdded).toBe(0);
    });

    test.each([
        ['POST /submit, older shape without an on-site contact'],
        ['POST /submit resubmit, older shape without an on-site contact'],
        ['POST /:id/revision-resubmit, older shape without an on-site contact'],
        ['POST /:id/car, older shape without an on-site contact'],
    ])('%s: 422 naming the on-site contact and nothing else, nothing moves', (name) => {
        const { from, answer, row, carFilesAdded } = results[name];
        expect(answer).toMatchObject({ status: 422, code: 'APPLICATION_INCOMPLETE', errorSteps: ['5'] });
        expect(answer.missingFields.sort()).toEqual(['step5.site_contact_informed', 'step5.site_contact_name', 'step5.site_phone']);
        expect(row).toMatchObject({ status: from, carDocuments: 0, quotations: 0 });
        expect(carFilesAdded).toBe(0);
    });

    test.each([
        ['POST /:id/revision-resubmit, a purpose no licence backs'],
        ['POST /:id/car, a purpose no licence backs'],
    ])('%s: 400 CERTIFICATION_PURPOSE_INVALID, nothing moves', (name) => {
        const { from, answer, row, carFilesAdded } = results[name];
        expect(answer).toMatchObject({ status: 400, code: 'CERTIFICATION_PURPOSE_INVALID' });
        expect(row).toMatchObject({ status: from, carDocuments: 0 });
        expect(carFilesAdded).toBe(0);
    });

    test.each([
        ['POST /:id/revision-resubmit, no declarations on record'],
        ['POST /:id/car, no declarations on record'],
    ])('%s: 422 DECLARATIONS_REQUIRED, nothing moves', (name) => {
        const { from, answer, row, carFilesAdded } = results[name];
        expect(answer).toMatchObject({ status: 422, code: 'DECLARATIONS_REQUIRED' });
        expect(row).toMatchObject({ status: from, carDocuments: 0 });
        expect(carFilesAdded).toBe(0);
    });

    test.each([
        ['POST /:id/revision-resubmit, member without consent'],
        ['POST /:id/car, member without consent'],
    ])('%s: 403 CONSENT_REQUIRED, nothing moves', (name) => {
        const { from, answer, row, carFilesAdded } = results[name];
        expect(answer).toMatchObject({ status: 403, code: 'CONSENT_REQUIRED' });
        expect(row).toMatchObject({ status: from, carDocuments: 0 });
        expect(carFilesAdded).toBe(0);
    });
});
