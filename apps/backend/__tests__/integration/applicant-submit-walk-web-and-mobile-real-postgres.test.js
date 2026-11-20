'use strict';

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const request = require('supertest');
const { isDeepStrictEqual } = require('util');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { seedHolderScopeFixture, cleanupHolderScopeFixture } = require('./fixtures/holder-scope-fixture');
const { filedHolderData } = require('../../test-support/filed-application');

jest.mock('../../services/pdf/pdf-generator.service', () => ({
    initialize: async () => {},
    warmUp: async () => {},
    close: async () => {},
    generatePDF: async () => Buffer.from('%PDF-1.4 walk'),
    generateFromTemplate: async () => Buffer.from('%PDF-1.4 walk'),
    replaceTemplateVariables: (t) => t,
    readTemplateCached: (templatePath) => require('fs').readFileSync(templatePath, 'utf8'),
}));
jest.mock('../../services/queue-service', () => ({
    ...jest.requireActual('../../services/queue-service'),
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-walk' }) }),
    getPdfQueue: () => null,
}));

function taxIdWithValidCheckDigit() {
    const digits = [0, 1 + crypto.randomInt(9), ...Array.from({ length: 10 }, () => crypto.randomInt(10))];
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    return digits.join('') + String((11 - (sum % 11)) % 10);
}

function webAnswers() {
    return {
        plantId: 'cannabis',
        certificationPurposes: ['EXPORT'],
        applicantData: {
            companyName: 'บริษัท เดินประตู จำกัด', taxId: taxIdWithValidCheckDigit(), directorName: 'สมชาย ใจดี',
            phone: '0812345678', address: '99 หมู่ 1 บางพลี สมุทรปราการ 10540',
        },
        farmData: {
            siteName: 'แปลงบางพลี', siteAddress: '99 หมู่ 1', areaSqm: '1600', province: 'สมุทรปราการ',
            district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', landOwnership: 'OWN',
            areaTypes: ['OUTDOOR'], siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
            landDocumentDetail: { type: 'โฉนด', number: '12345' }, coordinates: '13.6069, 100.7061', plantsPerCycle: '500', cyclesPerYear: '2',
        },
        varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],
        locationType: 'OUTDOOR',
        consentedPDPA: true,
        acknowledgedStandards: true,
    };
}

function mobileBody(applicationId) {
    return {
        applicationId,
        plantId: 'cannabis',
        serviceType: 'new_application',
        certificationPurposes: ['EXPORT'],
        cultivationMethods: ['OUTDOOR'],
        locationType: 'OUTDOOR',
        applicantData: { applicantType: 'INDIVIDUAL', idCard: '1100000000008', phone: '0812345678', email: 'm@example.com', address: '1 หมู่ 2', province: 'เชียงใหม่', firstName: 'สมหญิง', lastName: 'ใจดี', name: 'สมหญิง ใจดี' },
        farmData: { farmName: 'ไร่สมหญิง', address: '1 หมู่ 2', province: 'เชียงใหม่', totalAreaSize: '2', totalAreaUnit: 'Rai', landOwnership: 'OWN', gpsLat: '18.8', gpsLng: '98.9', hasFence: true, hasCCTV: false },
        siteData: {},
        plots: [{ id: 'p1', name: 'แปลง 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
        productionData: { propagationType: ['SEED'], plantParts: ['FLOWER'], sourceDetail: 'เมล็ด', estimatedYield: '10', productionCycle: '1' },
        harvestData: { harvestMethod: 'MANUAL', dryingMethod: 'SUN', storageSystem: 'AMBIENT', packaging: 'BAG' },
        documents: [{ documentId: 'd1', type: 'land_rights', name: 'land.pdf', url: '/uploads/application-drafts/land.pdf' }],
        consentedPDPA: true,
        acknowledgedStandards: true,
    };
}

d('the web wizard and the mobile app still file through the real doors (real Postgres, real server)', () => {
    let raw;
    let app;
    let fx;
    let tmpDir;
    let pdf;
    const results = {};
    const extraHolders = [];

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
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'submit-walk-'));
        pdf = path.join(tmpDir, 'paper.pdf');
        await new Promise((resolve, reject) => {
            const doc = new PDFDocument();
            const out = fs.createWriteStream(pdf);
            doc.pipe(out);
            doc.fontSize(14).text('Company registration certificate '.repeat(200));
            doc.end();
            out.on('finish', resolve);
            out.on('error', reject);
        });

        app = require('../../server');
        await require('../../services/prisma-database').connect();
        const h = { Authorization: `Bearer ${fx.tokens.A}` };
        const upload = (applicationId, slotId) => request(app).post('/api/applications/draft-documents').set(h)
            .field('applicationId', applicationId).field('slotId', slotId).field('stepKey', 'documents').attach('file', pdf);
        const holderWithoutDraft = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท เดินประตู ${fx.sfx} จำกัด`, organizationId: fx.orgId, createdBy: fx.users.A.id, ...filedHolderData('JURISTIC') },
        })).id;
        extraHolders.push(holderWithoutDraft);
        await raw.entityMembership.create({
            data: { userId: fx.users.A.id, entityId: holderWithoutDraft, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgId },
        });

        let res = await request(app).post('/api/applications/draft').set(h).send({
            entityId: holderWithoutDraft, plantId: 'cannabis', serviceType: 'NEW', areaType: 'OUTDOOR', purpose: 'EXPORT',
            cultivationMethods: [], step: 1, currentStep: 0, saveSession: 'web-walk', saveSeq: 1,
            formData: { plantId: 'cannabis', certificationPurposes: ['EXPORT'], locationType: 'OUTDOOR' },
        });
        const webId = res.body?.data?.id;
        results.webCreate = { status: res.status, code: res.body?.code || res.body?.error || null };
        if (!webId) { throw new Error(`the first web autosave created no draft: ${JSON.stringify(results.webCreate)}`); }
        results.webUploads = [(await upload(webId, 'juristic_reg_6m')).status, (await upload(webId, 'licence_pt10')).status];
        res = await request(app).post('/api/applications/draft').set(h).send({
            applicationId: webId, plantId: 'cannabis', serviceType: 'NEW', areaType: 'OUTDOOR', purpose: 'EXPORT',
            cultivationMethods: [], step: 3, currentStep: 2, saveSession: 'web-walk', saveSeq: 2, formData: webAnswers(),
        });
        results.webSave = { status: res.status, savedStep: res.body?.data?.savedStep };
        res = await request(app).post('/api/applications/submit').set(h).send({
            applicationId: webId, saveSession: 'web-walk', lastAppliedSeq: 2, declarationsAccepted: true,
        });
        results.webSubmit = {
            status: res.status, error: res.body?.error || res.body?.code || null, errorsByStep: res.body?.errorsByStep || null,
            appStatus: res.body?.data?.status, cases: (res.body?.cases || []).map((c) => ({ status: c.status, areaType: c.areaType })),
        };
        const webRow = await raw.application.findUnique({ where: { id: webId } });
        results.webRow = {
            status: webRow.status, areaType: webRow.areaType,
            siteContact: webRow.formData?.farmData?.siteContactName || null,
            declarationsAcceptedAt: Boolean(webRow.formData?.declarationsAcceptedAt),
            requirementStamp: Boolean(webRow.formData?.serverRequirementSnapshot),
            farmId: Boolean(webRow.formData?.farmId),
        };

        res = await request(app).post('/api/applications/draft').set(h).send({ entityId: fx.entities.PA, plantId: 'cannabis' });
        const mobileId = res.body?.data?.id;
        res = await request(app).post('/api/applications/prepare').set(h).send(mobileBody(mobileId));
        const mobileRow = await raw.application.findUnique({ where: { id: mobileId } });
        const sent = mobileBody(mobileId);
        results.mobilePrepare = {
            status: res.status,
            keysKept: Object.keys(sent).filter((k) => k !== 'applicationId' && isDeepStrictEqual(mobileRow.formData?.[k], sent[k])),
        };
        res = await request(app).post('/api/applications/submit').set(h).send({ applicationId: mobileId });
        results.mobileSubmitAsTheAppSendsIt = {
            status: res.status, error: res.body?.error || res.body?.code || null,
            errorSteps: Object.keys(res.body?.errorsByStep || {}),
            missingSlots: (res.body?.missingSlots || res.body?.meta?.missingSlots || []).map((slot) => slot.slotId),
        };
        res = await request(app).post('/api/applications/prepare').set(h).send({ ...mobileBody(undefined), applicationId: undefined });
        results.mobileFirstPrepareWithoutADraft = { status: res.status, code: res.body?.code || res.body?.error || null };

        if (process.env.SUBMIT_DOOR_PROBE_OUT) {
            fs.writeFileSync(process.env.SUBMIT_DOOR_PROBE_OUT, `${JSON.stringify(results, null, 1)}\n`);
        }
    }, 300000);

    afterAll(async () => {
        if (tmpDir) { fs.rmSync(tmpDir, { recursive: true, force: true }); }
        if (raw) {
            const rows = await raw.application.findMany({ where: { organizationId: fx?.orgId }, select: { formData: true } }).catch(() => []);
            const urls = JSON.stringify(rows.map((r) => r.formData)).match(/\/uploads\/application-drafts\/[\w.-]+/g) || [];
            for (const url of new Set(urls)) {
                fs.rmSync(path.join(__dirname, '..', '..', 'public', url), { force: true });
            }
            await cleanupHolderScopeFixture(raw, { ...fx, entities: { ...fx.entities, ...extraHolders } });
            await raw.$disconnect();
        }
    });

    test('web: create, two uploads, full save, submit → PENDING_DOC_FEE with the ticked area and the on-site contact', () => {
        expect(results.webCreate.status).toBe(200);
        expect(results.webUploads).toEqual([200, 200]);
        expect(results.webSave.status).toBe(200);
        expect(results.webSubmit).toMatchObject({ status: 200, appStatus: 'PENDING_DOC_FEE', cases: [{ status: 'PENDING_DOC_FEE', areaType: 'OUTDOOR' }] });
        expect(results.webRow).toEqual({
            status: 'PENDING_DOC_FEE', areaType: 'OUTDOOR', siteContact: 'สมชาย ใจดี',
            declarationsAcceptedAt: true, requirementStamp: true, farmId: true,
        });
    });

    test('mobile: /prepare keeps every answer the app sends', () => {
        expect(results.mobilePrepare.status).toBe(200);
        expect(results.mobilePrepare.keysKept.sort()).toEqual(Object.keys(mobileBody('x')).filter((k) => k !== 'applicationId').sort());
    });
});
