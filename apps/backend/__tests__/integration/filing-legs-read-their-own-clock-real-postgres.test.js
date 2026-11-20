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
    generatePDF: async () => Buffer.from('%PDF-1.4 legs'),
    generateFromTemplate: async () => Buffer.from('%PDF-1.4 legs'),
    replaceTemplateVariables: (t) => t,
    readTemplateCached: (templatePath) => require('fs').readFileSync(templatePath, 'utf8'),
}));
jest.mock('../../services/queue-service', () => ({
    ...jest.requireActual('../../services/queue-service'),
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-legs' }) }),
    getPdfQueue: () => null,
}));

const CAR_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'car');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms);
const ahead = (ms) => new Date(Date.now() + ms);

function taxIdWithValidCheckDigit() {
    const digits = [0, 1 + crypto.randomInt(9), ...Array.from({ length: 10 }, () => crypto.randomInt(10))];
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    return digits.join('') + String((11 - (sum % 11)) % 10);
}

function katorlor1Filing() {
    return {
        plantId: 'cannabis',
        certificationPurposes: ['EXPORT'],
        applicantType: 'JURISTIC',
        applicantData: {
            companyName: 'บริษัท นาฬิกาของตัวเอง จำกัด', taxId: taxIdWithValidCheckDigit(), directorName: 'สมชาย ใจดี',
            phone: '0812345678', address: '99 หมู่ 1 บางพลี สมุทรปราการ 10540',
        },
        farmData: {
            siteName: 'แปลงบางพลี', siteAddress: '99 หมู่ 1', areaSqm: '1600', province: 'สมุทรปราการ',
            district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', landOwnership: 'OWN',
            areaTypes: ['OUTDOOR'], siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
            landDocumentDetail: { type: 'โฉนด', number: '12345' }, coordinates: '13.6069, 100.7061', plantsPerCycle: '500', cyclesPerYear: '2',
        },
        varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],
    };
}

const STALE_REVISION_ROUND = () => ({
    revisionRequestedAt: ago(20 * DAY).toISOString(), revisionDueAt: ago(10 * DAY).toISOString(),
    revision_requested_at: ago(20 * DAY).toISOString(), revision_due_at: ago(10 * DAY).toISOString(),
});

d('filing legs read their own clock and the same rules (real Postgres, real server)', () => {
    let raw;
    let app;
    let fx;
    let seq = 0;

    const answerOf = (res) => ({ status: res.status, code: res.body?.code || res.body?.error || null, body: res.body });
    const headers = () => ({ Authorization: `Bearer ${fx.tokens.A}` });
    const wizardSubmit = (id) => request(app).post('/api/applications/submit').set(headers()).send({ applicationId: id });
    const revisionResubmit = (id) => request(app).post(`/api/applications/${id}/revision-resubmit`).set(headers()).send({});
    const carSubmit = async (id) => request(app).post(`/api/applications/${id}/car`).set(headers())
        .send({ notes: 'แก้ไขแล้ว', files: carRoundFiles([await stageCarFile(raw, id)]) });
    const carFilesOnDisk = () => (fs.existsSync(CAR_DIR) ? fs.readdirSync(CAR_DIR).length : 0);

    async function settle(applicationId, milestone) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-LEGS-${seq}-${fx.sfx}`.toUpperCase(), applicationId, healthId: fx.users.A.canonicalId,
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

    async function filingIn(status, { clocks = {}, deadlineRow = null, askedAt = null, paperAt = null, extra = {} } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-LEGS-${seq}-${fx.sfx}`.toUpperCase(), healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status,
                formData: {
                    ...katorlor1Filing(),
                    workflowState: status,
                    serverRequirementSnapshot: { stampedAt: ago(30 * DAY).toISOString(), ruleIds: [], slotIds: [] },
                    declarationsAcceptedAt: ago(30 * DAY).toISOString(),
                    _lastReviewComment: 'ขอเอกสารเพิ่ม',
                    ...clocks,
                    ...extra,
                },
            },
        });
        await settle(row.id, 'M1');
        if (status === 'CAR_PENDING') { await settle(row.id, 'M2'); }
        if (askedAt) {
            await raw.applicationDocumentReview.create({
                data: {
                    applicationId: row.id, slotId: 'land_rights', verdict: 'MORE_REQUESTED', reason: 'สำเนาโฉนดอ่านไม่ออก',
                    dueDate: ahead(5 * DAY), reviewerId: fx.users.F.id, round: 1, createdAt: askedAt, organizationId: fx.orgId,
                },
            });
        }
        if (paperAt) {
            await raw.applicationDocument.create({
                data: {
                    applicationId: row.id, slotId: 'land_rights', documentType: 'LAND_RIGHTS',
                    fileUrl: `/uploads/test/legs-land-${seq}.pdf`, createdAt: paperAt,
                },
            });
        }
        if (deadlineRow) {
            await raw.revisionDeadline.create({
                data: { applicationId: row.id, organizationId: fx.orgId, revisionCount: 1, createdBy: fx.users.F.id, ...deadlineRow },
            });
        }
        return row.id;
    }

    async function rowOf(applicationId) {
        const row = await raw.application.findUnique({ where: { id: applicationId } });
        const deadline = await raw.revisionDeadline.findUnique({ where: { applicationId } });
        const history = Array.isArray(row.workflowHistory) ? row.workflowHistory : [];
        return {
            status: row.status,
            carDocuments: Array.isArray(row.formData?.carDocuments) ? row.formData.carDocuments.length : 0,
            revisionDueAt: row.formData?.revisionDueAt ?? null,
            revision_due_at: row.formData?.revision_due_at ?? null,
            reviewNote: row.formData?._lastReviewComment ?? null,
            deadlineRow: deadline ? deadline.status : null,
            lastEvent: history.length > 0 ? history[history.length - 1] : null,
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

    describe('CAR_PENDING waits on the CAR clock, never on the revision clock an earlier round left', () => {
        test('the wizard shape against POST /submit: not a CAR door, and the stale revision clock does not expire the filing', async () => {
            const id = await filingIn('CAR_PENDING', {
                clocks: { ...STALE_REVISION_ROUND(), carDueAt: ahead(30 * DAY).toISOString(), car_due_at: ahead(30 * DAY).toISOString() },
                deadlineRow: { revisionDue: ahead(30 * DAY), status: 'PENDING' },
            });
            const answer = answerOf(await wizardSubmit(id));
            expect(answer.status).toBe(409);
            expect(answer.code).toBe('INVALID_STATUS_FOR_SUBMIT');
            expect(await rowOf(id)).toMatchObject({ status: 'CAR_PENDING', carDocuments: 0, deadlineRow: 'PENDING' });
        });

        test('POST /:id/car on the same filing: filed, CAR_REVIEWING', async () => {
            const id = await filingIn('CAR_PENDING', {
                clocks: { ...STALE_REVISION_ROUND(), carDueAt: ahead(30 * DAY).toISOString(), car_due_at: ahead(30 * DAY).toISOString() },
                deadlineRow: { revisionDue: ahead(30 * DAY), status: 'PENDING' },
            });
            const before = carFilesOnDisk();
            const answer = answerOf(await carSubmit(id));
            expect([answer.status, answer.code]).toEqual([200, null]);
            expect(await rowOf(id)).toMatchObject({ status: 'CAR_REVIEWING', carDocuments: 1, deadlineRow: 'SUBMITTED' });
            expect(carFilesOnDisk() - before).toBe(1);
        });

        test('no CAR stamp on the filing: a closed RevisionDeadline row of the old round is not a clock', async () => {
            const id = await filingIn('CAR_PENDING', {
                clocks: STALE_REVISION_ROUND(),
                deadlineRow: { revisionDue: ago(10 * DAY), status: 'SUBMITTED' },
            });
            const answer = answerOf(await carSubmit(id));
            expect([answer.status, answer.code]).toEqual([200, null]);
            expect(await rowOf(id)).toMatchObject({ status: 'CAR_REVIEWING', carDocuments: 1 });
        });

        test('no CAR stamp on the filing: the open RevisionDeadline row the cron reads is the clock, and it has passed', async () => {
            const id = await filingIn('CAR_PENDING', {
                deadlineRow: { revisionDue: ago(1 * DAY), status: 'PENDING' },
            });
            const before = carFilesOnDisk();
            const answer = answerOf(await carSubmit(id));
            expect([answer.status, answer.code]).toEqual([400, 'CAR_DEADLINE_EXCEEDED']);
            expect(await rowOf(id)).toMatchObject({ status: 'EXPIRED', carDocuments: 0, deadlineRow: 'FAILED' });
            expect(carFilesOnDisk() - before).toBe(0);
        });
    });

    describe('a truly late CAR filing is refused through every door', () => {
        const lateCar = () => ({ clocks: { carDueAt: ago(1 * DAY).toISOString(), car_due_at: ago(1 * DAY).toISOString() } });

        test('POST /:id/car: 400 CAR_DEADLINE_EXCEEDED in Thai, the filing is EXPIRED by the system, no file kept', async () => {
            const id = await filingIn('CAR_PENDING', { ...lateCar(), deadlineRow: { revisionDue: ago(1 * DAY), status: 'PENDING' } });
            const before = carFilesOnDisk();
            const answer = answerOf(await carSubmit(id));
            expect([answer.status, answer.code]).toEqual([400, 'CAR_DEADLINE_EXCEEDED']);
            expect(typeof answer.body.messageTh).toBe('string');
            const row = await rowOf(id);
            expect(row).toMatchObject({ status: 'EXPIRED', carDocuments: 0, deadlineRow: 'FAILED' });
            expect(row.lastEvent).toMatchObject({ action: 'CAR_DEADLINE_EXPIRED', actorRole: 'system' });
            expect(carFilesOnDisk() - before).toBe(0);
        });

        test('the wizard shape against POST /submit: refused, never CAR_REVIEWING', async () => {
            const id = await filingIn('CAR_PENDING', lateCar());
            const answer = answerOf(await wizardSubmit(id));
            expect(answer.status).not.toBe(200);
            expect((await rowOf(id)).status).not.toBe('CAR_REVIEWING');
        });
    });

    describe('REVISION_REQUESTED: both doors replace the papers the officer asked for, then retire the revision clock', () => {
        const openRound = (paperAt) => ({
            clocks: { revisionDueAt: ahead(3 * DAY).toISOString(), revision_due_at: ahead(3 * DAY).toISOString() },
            deadlineRow: { revisionDue: ahead(3 * DAY), status: 'PENDING' },
            askedAt: ago(1 * HOUR),
            paperAt,
        });

        test('the paper was not replaced since the request: /submit refuses exactly as /:id/revision-resubmit does, nothing moves', async () => {
            const viaWizard = await filingIn('REVISION_REQUESTED', openRound(ago(2 * HOUR)));
            const viaResubmit = await filingIn('REVISION_REQUESTED', openRound(ago(2 * HOUR)));
            const wizardAnswer = answerOf(await wizardSubmit(viaWizard));
            const resubmitAnswer = answerOf(await revisionResubmit(viaResubmit));
            expect([wizardAnswer.status, wizardAnswer.code]).toEqual([409, 'REVISION_INCOMPLETE']);
            expect(wizardAnswer.body.slotIds).toEqual(['land_rights']);
            expect(wizardAnswer.body).toEqual(resubmitAnswer.body);
            expect(await rowOf(viaWizard)).toMatchObject({ status: 'REVISION_REQUESTED', deadlineRow: 'PENDING' });
            expect(await rowOf(viaResubmit)).toMatchObject({ status: 'REVISION_REQUESTED', deadlineRow: 'PENDING' });
        });

        test.each([
            ['POST /submit', (id) => wizardSubmit(id)],
            ['POST /:id/revision-resubmit', (id) => revisionResubmit(id)],
        ])('%s with the paper replaced: filed, the officer\'s note and the revision clock are retired', async (_door, send) => {
            const id = await filingIn('REVISION_REQUESTED', openRound(new Date()));
            const answer = answerOf(await send(id));
            expect([answer.status, answer.code]).toEqual([200, null]);
            expect(await rowOf(id)).toMatchObject({
                status: 'ASSIGNED_FOR_REVIEW', revisionDueAt: null, revision_due_at: null, reviewNote: null, deadlineRow: 'SUBMITTED',
            });
        });

        test.each([
            ['POST /submit', (id) => wizardSubmit(id)],
            ['POST /:id/revision-resubmit', (id) => revisionResubmit(id)],
        ])('%s on a round that asked for answers and no paper: filed', async (_door, send) => {
            const id = await filingIn('REVISION_REQUESTED', {
                clocks: { revisionDueAt: ahead(3 * DAY).toISOString(), revision_due_at: ahead(3 * DAY).toISOString() },
                deadlineRow: { revisionDue: ahead(3 * DAY), status: 'PENDING' },
                extra: { revisionRequest: { category: 'APPLICATION_ANSWERS', message: 'ขอให้แก้ไขข้อมูลในคำขอ', items: ['PURPOSE_LICENCE_REQUIRED'] } },
            });
            const answer = answerOf(await send(id));
            expect([answer.status, answer.code]).toEqual([200, null]);
            expect(await rowOf(id)).toMatchObject({ status: 'ASSIGNED_FOR_REVIEW', revisionDueAt: null, deadlineRow: 'SUBMITTED' });
        });

        test('late on the revision clock through /submit: 400 REVISION_DEADLINE_EXCEEDED in Thai, EXPIRED by the system, the row failed', async () => {
            const id = await filingIn('REVISION_REQUESTED', {
                clocks: { revisionDueAt: ago(1 * DAY).toISOString(), revision_due_at: ago(1 * DAY).toISOString() },
                deadlineRow: { revisionDue: ago(1 * DAY), status: 'PENDING' },
                askedAt: ago(6 * DAY),
                paperAt: new Date(),
            });
            const answer = answerOf(await wizardSubmit(id));
            expect([answer.status, answer.code]).toEqual([400, 'REVISION_DEADLINE_EXCEEDED']);
            expect(typeof answer.body.messageTh).toBe('string');
            const row = await rowOf(id);
            expect(row).toMatchObject({ status: 'EXPIRED', deadlineRow: 'FAILED' });
            expect(row.lastEvent).toMatchObject({ action: 'REVISION_DEADLINE_EXPIRED', actorRole: 'system' });
        });
    });
});
