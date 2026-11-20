'use strict';

/**
 * Order 41 (2026-10-07): finance doors (invoices, receipts, quotations, quotes, credit notes,
 * statement) answer only members holding VIEW_FINANCIAL; the MANAGER / VIEWER rows on those
 * doors were re-recorded 2026-10-08 (fix/applicant-followups), every other cell unchanged.
 * The legacy Quote accept/reject doors read within the money scope since security review S1
 * (2026-10-08), so B (MANAGER, no VIEW_FINANCIAL) is answered 404 there, as S is.
 *
 * Task 6 carry-forwards (spec 2026-09-30-remove-workspace-mode §3.1; ledger
 * Task 3/4 minors): the health WRITE doors whose internal reads were converted in
 * Task 6, run through the REAL server app on a REAL Postgres with the witness in
 * THROW mode (the NODE_ENV=test default), and recorded against main before the
 * branch (9616ccdf) so R1 stays behaviour-neutral (ruling C1).
 *
 * Actors: A (filer, OWNER of C), B (MANAGER of C), S (stranger); no workspace header (R2 Task 12).
 * Recorded per actor × door: status, code, and a digest of the rows the door may
 * write (application status, live quotations, logs).
 * EXPECTED is recorded by running this file on 9616ccdf with
 * R1_TASK6_WRITES_RECORD=<path>.
 */

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { stageCarFile, carRoundFiles } = require('../../test-support/car-staged-file');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');
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

const EXPECTED_FILE = path.join(__dirname, '..', 'fixtures', 'r1-task6-write-doors-neutral.expected.json');
const STAMP = { serverRequirementSnapshot: { slotIds: ['land_rights'], rules: [] } };

function completeCanonicalFormData() {
    return {
        plantId: 'cannabis', serviceType: 'NEW', certificationPurposes: ['EXPORT'], locationType: 'OUTDOOR',
        cultivationMethods: ['outdoor'], consentedPDPA: true, acknowledgedStandards: true,
        applicantData: {
            applicantType: 'JURISTIC', companyName: 'บริษัท ทดสอบพยาน จำกัด', registrationNumber: '0105560000001',
            directorName: 'สมชาย ใจดี', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '1100000000008',
            phone: '0812345678', email: 'somchai@example.com', address: '123 หมู่ 4',
        },
        farmData: {
            farmName: 'ฟาร์มสมชาย', address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
            subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai',
            landOwnership: 'OWN', gpsLat: '13.12', gpsLng: '100.65',
            siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
        },
        plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
        productionData: { propagationType: ['SEED'], plantParts: ['FLOWER'] },
        harvestData: { harvestMethod: 'MANUAL', dryingMethod: 'SUN', storageSystem: 'AMBIENT' },
        documents: [{ name: 'doc.pdf', url: '/uploads/doc.pdf', type: 'LAND_RIGHT' }],
    };
}

d('Task 6 write doors: throw-mode witness clean, answers as recorded for R2 (real Postgres, real server)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    let fx;
    const rows = {}; // `${actor}.${door}` → ids
    const results = {};
    const witness = [];

    let witnessConfig = null;
    try { witnessConfig = require('../../config/holder-read-witness'); } catch (_) { witnessConfig = null; }
    const ORIGINAL_MODE = process.env.HOLDER_READ_WITNESS;

    const ACTORS = ['A', 'B', 'S'];
    // R2 Task 12: no actor sends a workspace header; membership alone decides.
    const headersOf = (actor) => ({ Authorization: `Bearer ${fx.tokens[actor]}` });

    const mkApp = async (label, status, formData = {}) => {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-T6-${label}-${fx.sfx}`, healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status,
                formData: { plantId: 'cannabis', workflowState: status, ...formData },
            },
        });
        // A filing back with its applicant has paid what led there (the writer refuses otherwise).
        if (status === 'REVISION_REQUESTED' || status === 'CAR_PENDING') {
            await settleMilestones(raw, row, status === 'CAR_PENDING' ? ['M1', 'M2'] : ['M1']);
        }
        return row.id;
    };
    const landDoc = (applicationId) => raw.applicationDocument.create({
        data: {
            applicationId, documentType: 'LAND_RIGHTS', slotId: 'land_rights', fileName: 'land.pdf',
            fileUrl: '/uploads/t6-land.pdf', currentForSlot: 'land_rights',
        },
    });

    beforeAll(async () => {
        delete process.env.HOLDER_READ_WITNESS;
        if (witnessConfig) { witnessConfig.resetHolderReadWitnessModeCache(); }
        raw = new PrismaClient();
        await raw.$connect();
        fx = await seedHolderScopeFixture(raw);
        const { ConsentVersions } = require('../../middleware/consent-manager');
        for (const actor of ACTORS) {
            for (const category of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY']) {
                await raw.userConsent.create({
                    data: {
                        userId: fx.users[actor].id, organizationId: fx.orgId, category,
                        version: ConsentVersions[category], granted: true, grantedAt: new Date(),
                    },
                });
            }
        }
        for (const actor of ACTORS) {
            const r = {};
            r.lapsedApp = await mkApp(`LAPSE-${actor}`, 'PENDING_DOC_FEE');
            await raw.quotation.create({
                data: {
                    applicationId: r.lapsedApp, issuerType: 'PLATFORM', quotationNumber: `QT-T6-LAPSE-${actor}-${fx.sfx}`,
                    subtotal: 5500, vat: 385, totalAmount: 5885, installments: [{ phase: 'PHASE_1', amount: 5885 }],
                    status: 'PENDING', validUntil: new Date(Date.now() - 2 * 86400e3), organizationId: fx.orgId,
                },
            });
            r.carApp = await mkApp(`CAR-${actor}`, 'CAR_PENDING', {
                ...completeCanonicalFormData(), ...STAMP, declarationsAcceptedAt: new Date(Date.now() - 86400e3).toISOString(),
            });
            await landDoc(r.carApp);
            rows[actor] = r;
        }

        app = require('../../server');
        await require('../../services/prisma-database').connect();
        const sharedLogger = require('../../shared/logger');
        const warn = jest.spyOn(sharedLogger, 'warn');
        const call = async (actor, door, req) => {
            const before = warn.mock.calls.length;
            const res = await req;
            for (const c of warn.mock.calls.slice(before)) {
                if (c[1] && c[1].signal === 'HEALTH_READ_UNSCOPED') { witness.push(`${actor} ${door} → ${c[1].model}.${c[1].op}`); }
            }
            results[`${actor} ${door}`] = { status: res.status, code: res.body?.code || null };
        };
        for (const actor of ACTORS) {
            const r = rows[actor];
            const h = headersOf(actor);
            await call(actor, 'GET /applications/:id/quotations (lapsed)', request(app).get(`/api/applications/${r.lapsedApp}/quotations`).set(h));
            await call(actor, 'POST /applications/:id/car', request(app).post(`/api/applications/${r.carApp}/car`).set(h)
                .send({ notes: 'หลักฐาน', files: carRoundFiles([await stageCarFile(raw, r.carApp)]) }));
            await call(actor, 'POST /planting-cycles/:id/activities', request(app).post(`/api/planting-cycles/${fx.more.cycle}/activities`).set(h)
                .send({ scope: 'CYCLE', activityType: 'IRRIGATION' }));
            // R2 Task 12 review C1: the four lot WRITE doors keep the farm-owner gate even
            // though lot READS follow membership. A (the farm owner) writes; B and S never do.
            await call(actor, 'POST /lots', request(app).post('/api/lots').set(h)
                .send({ batchId: fx.more.batch, packageType: 'BAG', quantity: 1, unitWeight: 1 }));
            await call(actor, 'PUT /lots/:id', request(app).put(`/api/lots/${fx.more.lot}`).set(h)
                .send({ packagedAt: new Date('2026-07-01T00:00:00Z').toISOString() }));
            await call(actor, 'POST /lots/:id/print', request(app).post(`/api/lots/${fx.more.lot}/print`).set(h).send({}));
            await call(actor, 'POST /lots/labels', request(app).post('/api/lots/labels').set(h).send({ lotIds: [fx.more.lot] }));
        }
        warn.mockRestore();

        // What the doors wrote, as labels (ids differ between runs).
        for (const actor of ACTORS) {
            const r = rows[actor];
            const appStatus = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } }))?.status || null;
            const live = await raw.quotation.findMany({
                where: { applicationId: r.lapsedApp, isDeleted: false }, select: { status: true, notes: true }, orderBy: { createdAt: 'asc' },
            });
            results[`${actor} rows`] = {
                lapsedLiveQuotations: live.map((q) => `${q.status}${String(q.notes || '').startsWith('REISSUED_AFTER_EXPIRY') ? ' reissued' : ''}`),
                carApp: await appStatus(r.carApp),
            };
        }
        results['cycle logs'] = { count: await raw.cultivationLog.count({ where: { cycleId: fx.more.cycle } }) };
        const lotRow = await raw.lot.findUnique({ where: { id: fx.more.lot } });
        results['lots'] = {
            count: await raw.lot.count({ where: { organizationId: fx.orgId } }),
            printed: Boolean(lotRow.printedAt),
        };

        if (process.env.R1_TASK6_WRITES_RECORD) {
            fs.writeFileSync(process.env.R1_TASK6_WRITES_RECORD, `${JSON.stringify(results, null, 1)}\n`);
        }
    }, 300000);

    afterAll(async () => {
        if (ORIGINAL_MODE === undefined) { delete process.env.HOLDER_READ_WITNESS; } else { process.env.HOLDER_READ_WITNESS = ORIGINAL_MODE; }
        if (witnessConfig) { witnessConfig.resetHolderReadWitnessModeCache(); }
        if (raw) {
            // The CAR door stores the upload under public/uploads/car; remove this run's files.
            const appIds = (await raw.application.findMany({ where: { organizationId: fx?.orgId }, select: { formData: true } }).catch(() => []));
            const urls = JSON.stringify(appIds.map((a) => a.formData)).match(/\/uploads\/car\/[\w./-]+?\.pdf/g) || [];
            for (const url of new Set(urls)) { fs.rmSync(path.join(__dirname, '..', '..', 'public', url), { force: true }); }
            await cleanupHolderScopeFixture(raw, fx);
            await raw.$disconnect();
        }
    });

    test('no write door reads a holder-bearing model unscoped (witness THROW)', () => {
        expect({ mode: witnessConfig.holderReadWitnessMode(), witness }).toEqual({ mode: 'throw', witness: [] });
    });

    // R2 Task 12 review C1: a widened READ gate must never open a lot WRITE again.
    test('only the farm owner A writes a lot: B (MANAGER of C) and S never get a 2xx on create, PUT, print or labels', () => {
        const doors = ['POST /lots', 'PUT /lots/:id', 'POST /lots/:id/print', 'POST /lots/labels'];
        for (const actor of ['B', 'S']) {
            for (const door of doors) { expect([actor, door, results[`${actor} ${door}`].status < 300]).toEqual([actor, door, false]); }
        }
        expect(doors.map((door) => results[`A ${door}`].status)).toEqual([201, 200, 200, 200]);
    });

    test('the filer A gets through every door it got through before (the reads ran, not just the status)', () => {
        expect(results['A rows'].lapsedLiveQuotations).toEqual(['PENDING reissued']);
        expect(results['A POST /planting-cycles/:id/activities'].status).toBe(201);
    });

    test('every actor × door and every written row as recorded for R2 (Task 12 re-record; was 9616ccdf in R1)', () => {
        if (process.env.R1_TASK6_WRITES_RECORD) { return; }
        const expected = JSON.parse(fs.readFileSync(EXPECTED_FILE, 'utf8'));
        const diffs = [...new Set([...Object.keys(expected), ...Object.keys(results)])].sort()
            .filter((k) => JSON.stringify(expected[k]) !== JSON.stringify(results[k]))
            .map((k) => `${k}: expected ${JSON.stringify(expected[k])} got ${JSON.stringify(results[k])}`);
        expect(diffs).toEqual([]);
    });
});
