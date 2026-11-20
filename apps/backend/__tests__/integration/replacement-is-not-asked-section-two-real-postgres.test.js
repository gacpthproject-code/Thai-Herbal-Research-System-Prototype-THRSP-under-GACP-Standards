/**
 * A replacement (ใบแทน) is asked none of the กทล.1 ส่วนที่ ๒ fields at the doors that file the form
 * (operator order 147, 2026-10-28; the form's own note: "กรณีขอต่ออายุใบอนุญาตหรือขอรับใบแทนใบอนุญาต
 * ไม่ต้องกรอกข้อมูลในส่วนที่ ๑ และส่วนที่ ๒"). A renewal is still asked them, by name: its answers
 * are carried over from the previous filing for the applicant to confirm.
 */
'use strict';

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
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
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-r3' }) }),
    getPdfQueue: () => null,
}));

const SECTION_TWO_KEYS = ['landOwnership', 'landDocumentDetail', 'coordinates', 'plantsPerCycle', 'cyclesPerYear'];

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

/** The same filing with every ข้อ ๒-๓ field order 143(4) added left out. */
function withoutSectionTwo() {
    const filing = completeFiling();
    for (const key of SECTION_TWO_KEYS) { delete filing.farmData[key]; }
    filing.varieties = [];
    return filing;
}

function withFarm(farm) {
    const filing = completeFiling();
    filing.farmData = { ...filing.farmData, ...farm };
    return filing;
}

/** kind → the filing, and what the door must name (nothing = accepted). */
const CASES = Object.freeze({
    'a replacement without any ส่วนที่ ๒ field': { requestType: 'REPLACEMENT', filing: withoutSectionTwo, missing: [] },
    'a renewal with every field': { requestType: 'RENEWAL', filing: completeFiling, missing: [] },
    'a renewal without coordinates': { requestType: 'RENEWAL', filing: () => withFarm({ coordinates: '' }), missing: ['step3.coordinates'] },
    'a renewal without a variety': { requestType: 'RENEWAL', filing: () => ({ ...completeFiling(), varieties: [] }), missing: ['varieties.name'] },
});

/** Where a filed form lands: a renewal owes no document fee, so /submit enters it at DOC_FEE_PAID. */
const DOORS = Object.freeze({
    'POST /submit': { status: 'DRAFT', filed: { RENEWAL: 'DOC_FEE_PAID', REPLACEMENT: 'PENDING_DOC_FEE' } },
    'POST /:id/revision-resubmit': { status: 'REVISION_REQUESTED', filed: { RENEWAL: 'ASSIGNED_FOR_REVIEW', REPLACEMENT: 'ASSIGNED_FOR_REVIEW' } },
});

d('a replacement is not asked ส่วนที่ ๒ at the doors that file the form; a renewal still is (real Postgres, real server)', () => {
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

    const dayAgo = () => new Date(Date.now() - 86400000).toISOString();

    /** A live certificate of holder C, so the claim the filing makes is a proven one. */
    async function certificateOf(n) {
        const certified = await raw.application.create({
            data: {
                applicationNumber: `APP-R3C-${n}-${fx.sfx}`.toUpperCase(), healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status: 'CERTIFIED',
                formData: { plantId: 'cannabis', workflowState: 'CERTIFIED' },
            },
        });
        return raw.certificate.create({
            data: {
                certificateNumber: `R3-${n}-${fx.sfx}`.toUpperCase(), verificationCode: `V-R3-${n}-${fx.sfx}`, qrData: 'qr',
                applicationId: certified.id, userId: fx.users.A.id, farmId: fx.more.farm, farmName: 'ฟาร์มโฮลเดอร์',
                applicantName: 'ทดสอบ', cropType: 'cannabis', farmSize: 1, province: 'สมุทรปราการ', district: 'บางพลี',
                subDistrict: 'บางพลีใหญ่', standardId: 'std', standardName: 'GACP', validityMonths: 12,
                expiryDate: new Date(Date.now() + 365 * 86400e3), issuedBy: fx.users.F.id, status: 'active',
                organizationId: fx.orgId, holderType: 'JURISTIC', holderDisplayName: 'บริษัท โฮลเดอร์ จำกัด',
                submittedByUserId: fx.users.A.id,
            },
        });
    }

    async function settle(applicationId) {
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-R3-${seq}-${fx.sfx}`.toUpperCase(), applicationId, healthId: fx.users.A.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 0, totalAmount: 0,
                dueDate: new Date(), status: 'PAID', paidAt: new Date(), organizationId: fx.orgId, metadata: {},
            },
        });
        await raw.checkoutOrder.create({
            data: {
                applicationId, milestone: 'M1', platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0,
                totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id, organizationId: fx.orgId,
            },
        });
    }

    async function document(applicationId, documentType, slotId) {
        await raw.applicationDocument.create({
            data: { applicationId, documentType, ...(slotId ? { slotId } : {}), fileUrl: `/uploads/test/r3-${documentType}-${seq}.pdf` },
        });
    }

    async function filingIn(status, { requestType, filing }) {
        seq += 1;
        const cert = await certificateOf(seq);
        const succession = requestType === 'REPLACEMENT'
            ? { requestType, replacementOf: cert.id, renewalOf: null }
            : { requestType, renewalOf: cert.id, replacementOf: null };
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-R3-${seq}-${fx.sfx}`.toUpperCase(), healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status,
                formData: {
                    ...filing(),
                    ...succession,
                    renewalOfCertificateNumber: cert.certificateNumber,
                    workflowState: status,
                    ...(status === 'DRAFT' ? {} : {
                        serverRequirementSnapshot: { stampedAt: dayAgo(), ruleIds: [], slotIds: [] },
                        declarationsAcceptedAt: dayAgo(),
                        renewalChangeDeclaration: { changed: false, details: null, declaredAt: dayAgo() },
                    }),
                },
            },
        });
        // A replacement brings the police report instead of ส่วนที่ ๓; every filing's purpose asks its licence.
        const [paperType, paperSlot] = requestType === 'REPLACEMENT' ? ['POLICE_REPORT', 'police_report'] : ['LICENCE_PT10', 'licence_pt10'];
        if (status === 'DRAFT') {
            await document(row.id, 'COMPANY_REG');
            await document(row.id, 'LICENCE_PT10');
            if (requestType === 'REPLACEMENT') { await document(row.id, paperType, paperSlot); }
        } else {
            await settle(row.id);
            await raw.applicationDocumentReview.create({
                data: {
                    applicationId: row.id, slotId: paperSlot, verdict: 'MORE_REQUESTED', reason: 'อ่านไม่ออก',
                    dueDate: new Date(Date.now() + 5 * 86400000), reviewerId: fx.users.F.id, round: 1,
                    createdAt: new Date(Date.now() - 3600000), organizationId: fx.orgId,
                },
            });
            await document(row.id, paperType, paperSlot);
        }
        return row.id;
    }

    async function send(door, id, headers) {
        if (door === 'POST /submit') {
            return request(app).post('/api/applications/submit').set(headers)
                .send({ applicationId: id, declarationsAccepted: true, renewalChangeDeclaration: { changed: false } });
        }
        return request(app).post(`/api/applications/${id}/revision-resubmit`).set(headers).send({});
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
            for (const [kase, spec] of Object.entries(CASES)) {
                const id = await filingIn(status, spec);
                const answer = answerOf(await send(door, id, headers));
                const row = await raw.application.findUnique({ where: { id }, select: { status: true } });
                results[`${door} · ${kase}`] = { from: status, answer, status: row.status };
            }
        }
    }, 300000);

    afterAll(async () => {
        if (raw) {
            await cleanupHolderScopeFixture(raw, fx);
            await raw.$disconnect();
        }
    });

    test.each(
        Object.entries(DOORS).flatMap(([door, { filed }]) => Object.entries(CASES)
            .filter(([, spec]) => spec.missing.length === 0)
            .map(([kase, spec]) => [door, kase, filed[spec.requestType]])),
    )('%s: %s is filed (%s)', (door, kase, filed) => {
        const { answer, status } = results[`${door} · ${kase}`];
        expect(answer).toEqual({ status: 200, code: null, missingFields: [], missingSlots: [] });
        expect(status).toBe(filed);
    });

    test.each(
        Object.entries(DOORS).flatMap(([door]) => Object.entries(CASES)
            .filter(([, spec]) => spec.missing.length > 0)
            .map(([kase, spec]) => [door, kase, spec.missing])),
    )('%s: %s is refused naming %s, nothing moves', (door, kase, missing) => {
        const { from, answer, status } = results[`${door} · ${kase}`];
        expect(answer).toMatchObject({ status: 422, code: 'APPLICATION_INCOMPLETE' });
        expect(answer.missingFields).toEqual(missing);
        expect(status).toBe(from);
    });
});
