'use strict';

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { seedHolderScopeFixture, cleanupHolderScopeFixture } = require('./fixtures/holder-scope-fixture');

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

const FORGED_URL = '/uploads/forged-by-body.pdf';

const RELATION_COUNTERS = {
    certificates: 'certificate',
    documents: 'applicationDocument',
    paymentTransactions: 'paymentTransaction',
    invoices: 'invoice',
    quotations: 'quotation',
    checkoutOrders: 'checkoutOrder',
    workActivities: 'workActivity',
    comments: 'applicationComment',
    revisionDeadline: 'revisionDeadline',
    correctionRounds: 'correctionRound',
};

const HOSTILE_FORMDATA_KEYS = [
    'certificateNumber', 'certificateUrl', 'carDocuments', 'auditChecklist', 'revisionRequestedAt',
    'carRequestedAt', 'carRequest', 'docApprovedAt', 'inspectionMode', 'adminClosure', '_paymentAbandoned',
    'lastDraftStep', 'draftSaveClock', 'status', 'bundleId', 'reviewerId', 'phase1Status', 'certificates',
];

function completeCanonicalFormData() {
    return {
        plantId: 'cannabis', serviceType: 'NEW', certificationPurposes: ['EXPORT'], locationType: 'OUTDOOR',
        cultivationMethods: ['outdoor'], consentedPDPA: true, acknowledgedStandards: true,
        applicantData: {
            applicantType: 'JURISTIC', companyName: 'บริษัท ทดสอบประตู จำกัด', registrationNumber: '0105560000001',
            directorName: 'สมชาย ใจดี', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '1100000000008',
            phone: '0812345678', email: 'somchai@example.com', address: '123 หมู่ 4',
        },
        farmData: {
            farmName: 'ฟาร์มสมชาย', address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
            subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai',
            landOwnership: 'OWN', gpsLat: '13.12', gpsLng: '100.65',
        },
        plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
        productionData: { propagationType: ['SEED'], plantParts: ['FLOWER'] },
        harvestData: { harvestMethod: 'MANUAL', dryingMethod: 'SUN', storageSystem: 'AMBIENT' },
        documents: [{ name: 'doc.pdf', url: '/uploads/doc.pdf', type: 'LAND_RIGHT' }],
    };
}

d('#67 applicant doors write only what the form declares (real Postgres, real server)', () => {
    let raw;
    let app;
    let fx;
    let tmpDir;
    let pdf;
    let otherOrg;
    let forged;
    const holders = {};
    const results = {};
    const shapeVerdicts = {};

    const headersOf = (actor) => ({ Authorization: `Bearer ${fx.tokens[actor]}` });

    const hostileColumns = () => ({
        status: 'CERTIFIED', organizationId: otherOrg, healthId: fx.users.S.canonicalId, submitterId: fx.users.S.id,
        applicationNumber: forged, reviewerId: fx.users.F.id, auditorId: fx.users.F.id, headAuditorId: fx.users.F.id,
        schedulerId: fx.users.F.id, phase1Status: 'PAID', phase1PaidAt: '2026-01-01T00:00:00.000Z', phase1Amount: 1,
        phase2Status: 'PAID', phase2Amount: 1, auditResult: 'PASS', closedReason: 'CANCELLED_BY_APPLICANT', legalHold: true,
        isDeleted: true, version: 99, rejectCount: 9, cultivationScopeCount: 9, bundleId: fx.more.bundle,
        idempotencyKey: forged, submissionHash: forged, standardCode: fx.more.standardCode, isPreviewReady: true,
        labResultStatus: 'PASS', scheduledDate: '2026-12-01T00:00:00.000Z', createdAt: '2000-01-01T00:00:00.000Z',
        retainUntil: '2000-01-01T00:00:00.000Z',
    });
    const hostileRelations = () => ({
        certificates: {
            create: [{
                certificateNumber: forged, verificationCode: forged, qrData: 'qr', userId: fx.users.A.id, farmId: fx.more.farm,
                farmName: 'f', applicantName: 'a', cropType: 'cannabis', farmSize: 1, province: 'p', district: 'd',
                subDistrict: 's', standardId: 'std', standardName: 'GACP', validityMonths: 12,
                expiryDate: '2099-01-01T00:00:00.000Z', issuedBy: fx.users.F.id, status: 'active', organizationId: fx.orgId,
            }],
        },
        documents: { create: [{ documentType: 'LAND_RIGHTS', slotId: 'land_rights', fileUrl: FORGED_URL }] },
        paymentTransactions: { create: [{ phase: 'PHASE_1', gateway: 'STRIPE', amount: 588500, status: 'COMPLETED', organizationId: fx.orgId }] },
        invoices: { create: [{ invoiceNumber: forged, healthId: fx.users.A.canonicalId, serviceType: 'X', subtotal: 0, totalAmount: 0, dueDate: '2099-01-01T00:00:00.000Z', status: 'PAID', organizationId: fx.orgId }] },
        quotations: { create: [{ issuerType: 'PLATFORM', quotationNumber: forged, subtotal: 0, vat: 0, totalAmount: 0, installments: [], status: 'ACCEPTED', validUntil: '2099-01-01T00:00:00.000Z', organizationId: fx.orgId }] },
        checkoutOrders: { create: [{ milestone: 'M1', status: 'SETTLED', platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0, totalPayableAmount: 0, organizationId: fx.orgId }] },
        workActivities: { create: [{ workType: 'FORGED', candidateGroup: 'FORGED', triggeredAtStage: 'FORGED', organizationId: fx.orgId }] },
        comments: { create: [{ content: 'forged', authorId: fx.users.F.id, role: 'document_reviewer', organizationId: fx.orgId }] },
        revisionDeadline: { create: { revisionDue: '2099-01-01T00:00:00.000Z', organizationId: fx.orgId } },
        correctionRounds: { create: [{ stage: 'DOC_REVIEW', roundNo: 1, decidedAt: '2026-01-01T00:00:00.000Z', dueAt: '2099-01-01T00:00:00.000Z', organizationId: fx.orgId }] },
        entity: { connect: { id: fx.entities.PS } },
        organization: { connect: { id: otherOrg } },
        applicant: { connect: { canonicalId: fx.users.S.canonicalId } },
        reviewer: { connect: { id: fx.users.F.id } },
        bundle: { connect: { id: fx.more.bundle } },
    });
    const hostileFormData = () => ({
        certificateNumber: forged, certificateUrl: 'https://evil.example/cert.pdf',
        carDocuments: [{ originalName: 'หลักฐานครบแล้ว.pdf', path: '/uploads/other-applicant.pdf', uploadedAt: '2026-01-01T00:00:00.000Z' }],
        auditChecklist: [{ itemId: 'C1', answer: 'PASS' }],
        revisionRequestedAt: '2099-01-01T00:00:00.000Z', carRequestedAt: '2099-01-01T00:00:00.000Z',
        carRequest: { dueAt: '2099-01-01T00:00:00.000Z' }, docApprovedAt: '2099-01-01T00:00:00.000Z',
        inspectionMode: 'ONLINE', adminClosure: { reasonCode: 'FORGED' }, _paymentAbandoned: true,
        lastDraftStep: 6, draftSaveClock: { session: 'forged', seq: 999999 }, status: 'CERTIFIED',
        bundleId: fx.more.bundle, reviewerId: fx.users.F.id, phase1Status: 'PAID', certificates: { create: [{}] },
    });

    async function freshHolder(label) {
        const entity = await raw.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท ${label} ${fx.sfx} จำกัด`, organizationId: fx.orgId, createdBy: fx.users.A.id },
        });
        await raw.entityMembership.create({
            data: { userId: fx.users.A.id, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgId },
        });
        return entity.id;
    }

    async function relationCounts(applicationId) {
        const counts = {};
        for (const [relation, model] of Object.entries(RELATION_COUNTERS)) {
            counts[relation] = await raw[model].count({ where: { applicationId } });
        }
        return counts;
    }

    async function readBack(applicationId) {
        const row = await raw.application.findUnique({ where: { id: applicationId } });
        const formData = row.formData && typeof row.formData === 'object' ? row.formData : {};
        return {
            columns: {
                status: row.status,
                organizationId: row.organizationId === fx.orgId ? 'fixture org' : row.organizationId,
                entityId: row.entityId,
                healthId: row.healthId === fx.users.A.canonicalId ? 'A' : row.healthId,
                submitterId: row.submitterId === fx.users.A.id ? 'A' : row.submitterId,
                applicationNumberForged: row.applicationNumber === forged,
                reviewerId: row.reviewerId, auditorId: row.auditorId, headAuditorId: row.headAuditorId, schedulerId: row.schedulerId,
                phase1Status: row.phase1Status, phase1PaidAt: row.phase1PaidAt, phase2Status: row.phase2Status,
                amountsForged: row.phase1Amount === 1 || row.phase2Amount === 1,
                auditResult: row.auditResult, closedReason: row.closedReason, legalHold: row.legalHold, isDeleted: row.isDeleted,
                versionForged: row.version === 99, rejectCount: row.rejectCount, cultivationScopeCount: row.cultivationScopeCount,
                bundleId: row.bundleId, idempotencyKey: row.idempotencyKey, submissionHash: row.submissionHash,
                standardCode: row.standardCode, isPreviewReady: row.isPreviewReady, labResultStatus: row.labResultStatus,
                scheduledDate: row.scheduledDate, createdIn2000: row.createdAt.getUTCFullYear() === 2000,
                retainUntilIn2000: row.retainUntil.getUTCFullYear() === 2000,
            },
            areaType: row.areaType,
            relations: await relationCounts(applicationId),
            formDataKeysLanded: HOSTILE_FORMDATA_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(formData, key)),
            stamps: { lastDraftStep: formData.lastDraftStep ?? null, draftSaveClock: formData.draftSaveClock ?? null },
        };
    }

    const cleanColumns = (status, entityId) => ({
        status, organizationId: 'fixture org', entityId, healthId: 'A', submitterId: 'A', applicationNumberForged: false,
        reviewerId: null, auditorId: null, headAuditorId: null, schedulerId: null, phase1Status: 'PENDING',
        phase1PaidAt: null, phase2Status: 'PENDING', amountsForged: false, auditResult: null, closedReason: null,
        legalHold: false, isDeleted: false, versionForged: false, rejectCount: 0, cultivationScopeCount: null,
        bundleId: null, idempotencyKey: null, submissionHash: null, standardCode: null, isPreviewReady: false,
        labResultStatus: null, scheduledDate: null, createdIn2000: false, retainUntilIn2000: false,
    });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await seedHolderScopeFixture(raw);
        forged = `FORGED-${fx.sfx}`;
        otherOrg = (await raw.organization.create({
            data: { name: `other-${fx.sfx}`, slug: `other-${fx.sfx}`, code: `OTHER_${fx.sfx}`.toUpperCase() },
        })).id;
        for (const relation of Object.keys(RELATION_COUNTERS)) {
            shapeVerdicts[relation] = await raw.$transaction(async (tx) => {
                await tx.application.create({
                    data: {
                        applicationNumber: `SHAPE-${relation}-${fx.sfx}`, healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
                        organizationId: fx.orgId, [relation]: hostileRelations()[relation],
                    },
                });
                throw new Error('ROLLBACK');
            }).catch((err) => (err.message === 'ROLLBACK' ? 'accepted' : err.message.split('\n').pop()));
        }
        const { ConsentVersions } = require('../../middleware/consent-manager');
        for (const category of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'PAYMENT_TERMS']) {
            await raw.userConsent.create({
                data: { userId: fx.users.A.id, organizationId: fx.orgId, category, version: ConsentVersions[category], granted: true, grantedAt: new Date() },
            });
        }
        for (const label of ['draftCreate', 'prepareCreate', 'uploadCreate', 'refused']) {
            holders[label] = await freshHolder(label);
        }
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'declared-fields-'));
        pdf = path.join(tmpDir, 'land.pdf');
        await new Promise((resolve, reject) => {
            const doc = new PDFDocument();
            const out = fs.createWriteStream(pdf);
            doc.pipe(out);
            doc.fontSize(14).text('Land rights document '.repeat(200));
            doc.end();
            out.on('finish', resolve);
            out.on('error', reject);
        });

        app = require('../../server');
        await require('../../services/prisma-database').connect();
        const h = headersOf('A');
        const answer = (res) => ({ status: res.status, code: res.body?.code || res.body?.error || null });

        let res = await request(app).post('/api/applications/draft').set(h).send({
            ...hostileColumns(), ...hostileRelations(), entityId: holders.draftCreate, areaType: 'OUTDOOR',
            plantId: 'cannabis', serviceType: 'NEW', step: 1, formData: { plantId: 'cannabis', ...hostileFormData() },
        });
        results['POST /draft create'] = { answer: answer(res), row: res.body?.data?.id ? await readBack(res.body.data.id) : null };

        res = await request(app).post('/api/applications/draft').set(h).send({
            ...hostileColumns(), ...hostileRelations(), applicationId: fx.apps.D, saveSession: 'probe-session', saveSeq: 1,
            step: 1, formData: { plantId: 'cannabis', ...hostileFormData() },
        });
        results['POST /draft save (clock)'] = { answer: answer(res), row: await readBack(fx.apps.D) };
        res = await request(app).post('/api/applications/draft').set(h).send({
            ...hostileColumns(), ...hostileRelations(), applicationId: fx.apps.D2, step: 1,
            formData: { plantId: 'cannabis', ...hostileFormData() },
        });
        results['POST /draft save (no clock)'] = { answer: answer(res), row: await readBack(fx.apps.D2) };

        res = await request(app).post('/api/applications/prepare').set(h).send({
            ...hostileColumns(), ...hostileRelations(), ...hostileFormData(), ...completeCanonicalFormData(),
            entityId: holders.prepareCreate,
        });
        results['POST /prepare create'] = { answer: answer(res), row: res.body?.data?.id ? await readBack(res.body.data.id) : null };
        const prepareSaveTarget = res.body?.data?.id;
        res = await request(app).post('/api/applications/prepare').set(h).send({
            ...hostileColumns(), ...hostileRelations(), ...hostileFormData(), ...completeCanonicalFormData(),
            applicationId: prepareSaveTarget,
        });
        results['POST /prepare save'] = { answer: answer(res), row: prepareSaveTarget ? await readBack(prepareSaveTarget) : null };

        let upload = request(app).post('/api/applications/draft-documents').set(h)
            .field('entityId', holders.uploadCreate).field('slotId', 'land_rights').field('stepKey', 'documents');
        for (const [key, value] of Object.entries(hostileColumns()).slice(0, 26)) { upload = upload.field(key, String(value)); }
        res = await upload.attach('file', pdf);
        const uploadedTo = res.body?.data?.applicationId;
        results['POST /draft-documents create'] = {
            answer: answer(res),
            row: uploadedTo ? await readBack(uploadedTo) : null,
            forgedDocumentRows: await raw.applicationDocument.count({ where: { fileUrl: FORGED_URL } }),
        };

        const before = await raw.application.count({ where: { entityId: fx.entities.PS } });
        res = await request(app).post('/api/applications/draft').set(h).send({ entityId: fx.entities.PS, plantId: 'cannabis' });
        const refusedDraft = answer(res);
        res = await request(app).post('/api/applications/prepare').set(h).send({ entityId: fx.entities.PS, ...completeCanonicalFormData() });
        results['create on another holder'] = {
            draft: refusedDraft, prepare: answer(res),
            created: (await raw.application.count({ where: { entityId: fx.entities.PS } })) - before,
        };

        if (process.env.SUBMIT_DOOR_PROBE_OUT) {
            fs.writeFileSync(process.env.SUBMIT_DOOR_PROBE_OUT, `${JSON.stringify(results, null, 1)}\n`);
        }
    }, 300000);

    afterAll(async () => {
        if (tmpDir) { fs.rmSync(tmpDir, { recursive: true, force: true }); }
        if (raw) {
            const rows = await raw.application.findMany({ where: { organizationId: fx?.orgId }, select: { id: true, formData: true } }).catch(() => []);
            const docUrls = (await raw.applicationDocument.findMany({
                where: { applicationId: { in: rows.map((r) => r.id) } }, select: { fileUrl: true },
            }).catch(() => [])).map((r) => r.fileUrl);
            const formUrls = JSON.stringify(rows.map((r) => r.formData)).match(/\/uploads\/[\w./-]+?\.pdf/g) || [];
            for (const url of new Set([...docUrls, ...formUrls])) {
                if (typeof url === 'string' && /^\/uploads\/application-drafts\/[\w.-]+$/.test(url)) {
                    fs.rmSync(path.join(__dirname, '..', '..', 'public', url), { force: true });
                }
            }
            await raw.entityMembership.deleteMany({ where: { entityId: { in: Object.values(holders) } } }).catch(() => {});
            await cleanupHolderScopeFixture(raw, { ...fx, entities: { ...fx.entities, ...holders } });
            await raw.organization.deleteMany({ where: { id: otherOrg } }).catch(() => {});
            await raw.$disconnect();
        }
    });

    test('every hostile nested write is one Prisma accepts, so a door that spread the body would land it', () => {
        expect(shapeVerdicts).toEqual(Object.fromEntries(Object.keys(RELATION_COUNTERS).map((k) => [k, 'accepted'])));
    });

    test('POST /draft create: 200, the holder named, no undeclared column, relation or blob key', () => {
        const { answer, row } = results['POST /draft create'];
        expect(answer.status).toBe(200);
        expect(row.columns).toEqual(cleanColumns('DRAFT', holders.draftCreate));
        expect(row.relations).toEqual(Object.fromEntries(Object.keys(RELATION_COUNTERS).map((k) => [k, 0])));
        expect(row.formDataKeysLanded.filter((key) => !['lastDraftStep', 'draftSaveClock'].includes(key))).toEqual([]);
        expect(row.stamps).toEqual({ lastDraftStep: 1, draftSaveClock: null });
    });

    test('POST /draft create: the areaType column is the ticks, not the body\'s areaType (nothing ticked = UNDECLARED)', () => {
        expect(results['POST /draft create'].row.areaType).toBe('UNDECLARED');
    });

    test.each([
        ['POST /draft save (clock)', { session: 'probe-session', seq: 1 }],
        ['POST /draft save (no clock)', null],
    ])('%s: 200, nothing undeclared lands, the server stamps are the server\'s', (door, clock) => {
        const { answer, row } = results[door];
        expect(answer.status).toBe(200);
        expect(row.columns).toEqual(cleanColumns('DRAFT', fx.entities.C));
        expect(row.relations).toEqual(Object.fromEntries(Object.keys(RELATION_COUNTERS).map((k) => [k, 0])));
        expect(row.formDataKeysLanded.filter((key) => !['lastDraftStep', 'draftSaveClock'].includes(key))).toEqual([]);
        expect(row.stamps).toEqual({ lastDraftStep: 1, draftSaveClock: clock });
    });

    test.each(['POST /prepare create', 'POST /prepare save'])('%s: 200, nothing undeclared lands', (door) => {
        const { answer, row } = results[door];
        expect(answer.status).toBe(200);
        expect(row.columns).toEqual(cleanColumns('DRAFT', holders.prepareCreate));
        expect(row.relations).toEqual(Object.fromEntries(Object.keys(RELATION_COUNTERS).map((k) => [k, 0])));
        expect(row.formDataKeysLanded).toEqual([]);
    });

    test('POST /draft-documents create: 200, only the uploaded file is recorded', () => {
        const { answer, row, forgedDocumentRows } = results['POST /draft-documents create'];
        expect(answer.status).toBe(200);
        expect(row.columns).toEqual(cleanColumns('DRAFT', holders.uploadCreate));
        expect({ ...row.relations, documents: row.relations.documents <= 1 }).toEqual({
            ...Object.fromEntries(Object.keys(RELATION_COUNTERS).map((k) => [k, 0])), documents: true,
        });
        expect(forgedDocumentRows).toBe(0);
    });

    test('a holder the caller may not edit: both create doors 403, nothing created', () => {
        expect(results['create on another holder']).toEqual({
            draft: { status: 403, code: 'ENTITY_PERMISSION_DENIED' },
            prepare: { status: 403, code: 'ENTITY_PERMISSION_DENIED' },
            created: 0,
        });
    });
});
