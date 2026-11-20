/**
 * Every door where the applicant files the กทล.1 form refuses it, by field name, when a ข้อ ๒-๓
 * field is missing (order 143(4)): /submit and /:id/revision-resubmit answer 422
 * APPLICATION_INCOMPLETE naming the field, and nothing moves. The CAR door sends evidence for a
 * form already accepted at review, so it is not a refiling and the field rule does not block it
 * (round 2, I1).
 */
'use strict';

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

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
    generatePDF: async () => Buffer.from('%PDF-1.4 fields'),
    generateFromTemplate: async () => Buffer.from('%PDF-1.4 fields'),
    replaceTemplateVariables: (t) => t,
    readTemplateCached: (templatePath) => require('fs').readFileSync(templatePath, 'utf8'),
}));
jest.mock('../../services/queue-service', () => ({
    ...jest.requireActual('../../services/queue-service'),
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-fields' }) }),
    getPdfQueue: () => null,
}));

const CAR_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'car');

function completeFiling() {
    return {
        plantId: 'cannabis',
        certificationPurposes: ['EXPORT'],
        applicantType: 'JURISTIC',
        farmData: {
            siteName: 'แปลงบางพลี', siteAddress: '99 หมู่ 1', areaSqm: '1600', province: 'สมุทรปราการ',
            district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', areaTypes: ['OUTDOOR'],
            siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
            landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '12345' },
            coordinates: '13.6069, 100.7061', plantsPerCycle: '500', cyclesPerYear: '2',
        },
        varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],
    };
}

function withFarm(farm) {
    const filing = completeFiling();
    filing.farmData = { ...filing.farmData, ...farm };
    return filing;
}

/** field name → the filing missing it, and the path the 422 must name. */
const MISSING = Object.freeze({
    'land tenure': { filing: () => withFarm({ landOwnership: undefined }), missing: 'step3.land_tenure' },
    'land document type': { filing: () => withFarm({ landDocumentDetail: { type: '', number: '12345' } }), missing: 'step3.land_document_type' },
    'land document number': { filing: () => withFarm({ landDocumentDetail: { type: 'โฉนด', number: '' } }), missing: 'step3.land_document_number' },
    'owner of rented land': { filing: () => withFarm({ landOwnership: 'RENTED' }), missing: 'step3.landlord_name' },
    coordinates: { filing: () => withFarm({ coordinates: '' }), missing: 'step3.coordinates' },
    'coordinates that are not a pair': { filing: () => withFarm({ coordinates: 'หน้าวัด' }), missing: 'step3.coordinates' },
    'plants per cycle': { filing: () => withFarm({ plantsPerCycle: '' }), missing: 'step3.plants_per_cycle' },
    'cycles per year': { filing: () => withFarm({ cyclesPerYear: '' }), missing: 'step3.cycles_per_year' },
    varieties: { filing: () => ({ ...completeFiling(), varieties: [] }), missing: 'varieties.name' },
});

const DOORS = Object.freeze({
    'POST /submit': { status: 'DRAFT', filed: 'PENDING_DOC_FEE', filesTheForm: true },
    'POST /:id/revision-resubmit': { status: 'REVISION_REQUESTED', filed: 'ASSIGNED_FOR_REVIEW', filesTheForm: true },
    'POST /:id/car': { status: 'CAR_PENDING', filed: 'CAR_REVIEWING', filesTheForm: false },
});
const doorsThat = (filesTheForm) => Object.entries(DOORS).filter(([, door]) => door.filesTheForm === filesTheForm);

d('the doors that file the กทล.1 form demand its ข้อ ๒-๓ fields; the CAR door does not (real Postgres, real server)', () => {
    let raw;
    let app;
    let fx;
    let seq = 0;
    const results = {};

    const answerOf = (res) => ({
        status: res.status,
        code: res.body?.code || res.body?.error || null,
        missingFields: res.body?.missingFields || [],
        missingSlots: res.body?.missingSlots || [],
    });

    async function settle(applicationId, milestone) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-FIELDS-${seq}-${fx.sfx}`.toUpperCase(), applicationId, healthId: fx.users.A.canonicalId,
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

    async function filingIn(status, formData) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-FIELDS-${seq}-${fx.sfx}`.toUpperCase(), healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status,
                formData: {
                    ...formData,
                    workflowState: status,
                    ...(status === 'DRAFT' ? {} : {
                        serverRequirementSnapshot: { stampedAt: new Date(Date.now() - 86400000).toISOString(), ruleIds: [], slotIds: [] },
                        declarationsAcceptedAt: new Date(Date.now() - 86400000).toISOString(),
                    }),
                    ...(status === 'CAR_PENDING' ? { carDueAt: new Date(Date.now() + 30 * 86400000).toISOString() } : {}),
                },
            },
        });
        if (status === 'DRAFT') {
            for (const documentType of ['COMPANY_REG', 'LICENCE_PT10']) {
                await raw.applicationDocument.create({
                    data: { applicationId: row.id, documentType, fileUrl: `/uploads/test/fields-${documentType}-${seq}.pdf` },
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
                data: { applicationId: row.id, slotId: 'land_rights', documentType: 'LAND_RIGHTS', fileUrl: `/uploads/test/fields-land-${seq}.pdf` },
            });
        }
        return row.id;
    }

    async function send(door, id, headers) {
        if (door === 'POST /submit') {
            return request(app).post('/api/applications/submit').set(headers).send({ applicationId: id, declarationsAccepted: true });
        }
        if (door === 'POST /:id/revision-resubmit') {
            return request(app).post(`/api/applications/${id}/revision-resubmit`).set(headers).send({});
        }
        const staged = await stageCarFile(raw, id);
        return request(app).post(`/api/applications/${id}/car`).set(headers).send({ notes: 'แก้แล้ว', files: carRoundFiles([staged]) });
    }

    async function rowOf(applicationId) {
        const row = await raw.application.findUnique({ where: { id: applicationId } });
        return {
            status: row.status,
            carDocuments: Array.isArray(row.formData?.carDocuments) ? row.formData.carDocuments.length : 0,
            quotations: await raw.quotation.count({ where: { applicationId } }),
        };
    }

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
        const headers = { Authorization: `Bearer ${fx.tokens.A}` };

        for (const [door, { status }] of Object.entries(DOORS)) {
            const controlId = await filingIn(status, completeFiling());
            results[`${door} · complete`] = { answer: answerOf(await send(door, controlId, headers)), row: await rowOf(controlId) };
            for (const [field, kase] of Object.entries(MISSING)) {
                const id = await filingIn(status, kase.filing());
                results[`${door} · ${field}`] = { from: status, answer: answerOf(await send(door, id, headers)), row: await rowOf(id) };
            }
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

    test.each(Object.entries(DOORS).map(([door, { filed }]) => [door, filed]))('%s: the complete filing is filed (%s)', (door, filed) => {
        const { answer, row } = results[`${door} · complete`];
        expect(answer.status).toBe(200);
        expect(row.status).toBe(filed);
    });

    test.each(
        doorsThat(true).flatMap(([door]) => Object.entries(MISSING).map(([field, { missing }]) => [door, field, missing])),
    )('%s without %s: 422 APPLICATION_INCOMPLETE naming %s, nothing moves', (door, field, missing) => {
        const { from, answer, row } = results[`${door} · ${field}`];
        expect(answer).toMatchObject({ status: 422, code: 'APPLICATION_INCOMPLETE' });
        expect(answer.missingFields).toEqual([missing]);
        expect(row).toMatchObject({ status: from, carDocuments: 0, quotations: 0 });
    });

    test.each(
        doorsThat(false).flatMap(([door, { filed }]) => Object.keys(MISSING).map((field) => [door, field, filed])),
    )('%s without %s: corrective-action evidence is not a refiling, so it is accepted (%s)', (door, field, filed) => {
        const { answer, row } = results[`${door} · ${field}`];
        expect(answer.status).toBe(200);
        expect(row).toMatchObject({ status: filed, carDocuments: 1 });
    });
});
