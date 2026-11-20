'use strict';

// 2026-09-05 — every POST to /api/applications/submit below now carries
// `declarationsAccepted: true`. The submit door gates on กทล.๑ ส่วนที่ ๔
// (services/application-declarations-gate.js): a filing nobody certified may not
// reach the department, and the server — not the browser — writes the timestamp.
// A real client sends this field, so these fixtures do too; sending `{}` was
// testing a request no applicant can make.

/**
 * M2a Task 4 — the FIVE submit doors read the document law (spec §3, AC1-3).
 *
 * `m2a-doc-requirements.test.js` proves the engine. This suite proves the
 * WIRING, which is where a rules engine usually dies: one door left unwired is
 * a door every applicant will find. Pattern and scope follow
 * `m1-submit-guard-doors.test.js` — the DB-level proof (real rows, real 422 on
 * Postgres) is `__tests__/integration/m2a-submit-enforcement.test.js`.
 *
 * The service is NOT mocked here. Each request runs door → service → rulesAt →
 * prisma, so an assertion about `requirementRule.findMany` is an assertion about
 * which question the door really asked:
 *
 *   • it was asked at all      → the rule table was read (mode 'first-submit')
 *   • it was NOT asked         → the stamp on the application decided it
 *                                (mode 'resubmit'), or the door deliberately
 *                                skips the check (officer bypass, D13)
 *
 * What is pinned per door: the 422 lands BEFORE anything is written, the stamp
 * is written INSIDE the door's existing formData write (never replacing the
 * applicant's blob), and the officer bypass keeps its documented shape.
 */

const express = require('express');
const request = require('supertest');

// ── stubs shared by every door ───────────────────────────────────────────────

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

jest.mock('../../middleware/auth-middleware', () => {
    const passUser = (req, _res, next) => { req.user = globalThis.__testUser; next(); };
    return { authenticateHealth: passUser, authenticateAny: passUser, authenticateProvider: passUser };
});

jest.mock('../../middleware/role-middleware', () => ({ providerOnly: (_req, _res, next) => next() }));

jest.mock('multer', () => {
    const multer = () => ({
        array: () => (req, _res, next) => {
            req.files = [{ filename: 'car-1.pdf', originalname: 'car.pdf', size: 1234 }];
            next();
        },
        single: () => (_req, _res, next) => next(),
    });
    multer.diskStorage = () => ({});
    return multer;
});

const TX = {
    __tx: true,
    applicationBundle: { update: jest.fn(async () => ({ id: 'bundle-1', status: 'SUBMITTED', applications: [] })) },
    revisionDeadline: { updateMany: jest.fn(async () => ({ count: 1 })) },
    correctionRound: { findFirst: jest.fn(async () => null) },
    correctionSubmissionVersion: { create: jest.fn(async (a) => ({ id: 'csv', ...a.data })) },
    $queryRaw: jest.fn(async () => [{ status: 'CAR_PENDING' }]),
    application: {
        findFirst: jest.fn(async () => ({
            status: 'CAR_PENDING',
            workflowHistory: [],
            formData: { carStagedFiles: [{ id: 'CAR-m2a.pdf', filename: 'CAR-m2a.pdf', path: '/uploads/car/CAR-m2a.pdf', findingNo: 1 }] },
        })),
    },
};
const mockTransaction = jest.fn(async (cb) => cb(TX));

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        $transaction: (...a) => mockTransaction(...a),
        application: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        applicationBundle: {
            findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
        },
        revisionDeadline: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        // M2a — the three reads the requirement engine makes.
        entity: { findUnique: jest.fn() },
        requirementRule: { findMany: jest.fn() },
        applicationDocument: { findMany: jest.fn() },
        // The officer asked for no paper in these cases: a revision answer has nothing to replace.
        applicationDocumentReview: { findMany: jest.fn(async () => []) },
        // holder-access (spec 2026-09-30 §3.1): the caller may edit ent-1's filings.
        entityMembership: { findMany: jest.fn(async () => [{ entityId: 'ent-1', role: 'OWNER' }]) },
    },
}));

const mockWriteApplicationStatus = jest.fn().mockResolvedValue({ id: 'app-1' });
jest.mock('../../services/application-status-writer', () => {
    const actual = jest.requireActual('../../services/application-status-writer');
    return {
        writeApplicationStatus: (...a) => mockWriteApplicationStatus(...a),
        TERMINAL_STATUSES: actual.TERMINAL_STATUSES,
    };
});

jest.mock('../../services/application-service', () => ({
    resolveHealthIdentity: jest.fn(),
    healDraftEntityColumns: jest.fn(),
    findOwnedApplicationForApplicant: jest.fn(),
    findDraftForSubmit: jest.fn(),
    findApplicationByIdForHealth: jest.fn(),
    findLatestOpenDraftForHealth: jest.fn(),
    createDraftForHealth: jest.fn(),
    updateApplicantDraftColumns: jest.fn(),
    getApplicationSlice: jest.fn(),
    deleteDraft: jest.fn(),
    findUserOrganizationId: jest.fn(),
    getApplicantReadinessSnapshot: jest.fn(),
    getLatestOpenDraftForApplicant: jest.fn(),
}));

jest.mock('../../services/notification-service', () => ({
    createNotification: jest.fn().mockResolvedValue(null),
    createBulkNotifications: jest.fn().mockResolvedValue({ count: 0 }),
    sendNotification: jest.fn().mockResolvedValue({}),
    NotifyType: {},
}));
jest.mock('../../services/provider-user-service', () => ({ listActiveProviders: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/correction-submission-version-service', () => ({
    snapshotCorrectionSubmission: jest.fn().mockResolvedValue({ id: 'csv-1' }),
}));
jest.mock('../../services/quotation-service', () => ({
    issueQuotationsForApplication: jest.fn().mockResolvedValue(undefined),
    ensurePhase1Quotations: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/storage-service', () => ({
    createUploader: jest.fn(() => ({ single: jest.fn(() => (_req, _res, next) => next()) })),
    decodeMultipartFilename: jest.fn((n) => n),
    // รากของโฟลเดอร์อัปโหลด — ประกาศไว้ที่เดียวในโมดูลจริง และ applications-car.js อ่านค่านี้
    // ตอนโหลดโมดูล mock ที่ไม่มีคีย์นี้จะทำให้ path.join ได้ undefined แล้ว router พังตั้งแต่ require
    BASE_UPLOAD_DIR: '/tmp/gacp-test-uploads',
}));
jest.mock('../../services/fee-service', () => ({}));

// The guard says yes throughout this suite: authority is M1's question and is
// answered before this one (plan Step 3 — สิทธิ์ก่อน แล้วค่อยความครบเอกสาร).
jest.mock('../../services/entity-effective-permissions-service', () => ({
    assertEntityActionPermission: jest.fn(),
}));
jest.mock('../../middleware/audit-logger', () => {
    const actual = jest.requireActual('../../middleware/audit-logger');
    return {
        ...actual,
        auditLogger: { log: jest.fn().mockResolvedValue({ id: 'audit-1' }), logWithin: jest.fn(() => jest.fn()) },
    };
});

// Wizard completeness is a DIFFERENT 422 with a different body (errorsByStep).
// It is stubbed to "complete" so every failure this suite reports is the
// document law and nothing else.
jest.mock('../../validation/application-submission-validator', () => ({
    validateFilingCompleteness: jest.fn(() => ({ isValid: true })),
}));
jest.mock('../../validation/application-schemas', () => ({
    validateStep: jest.fn(() => ({ success: true, errors: [] })),
}));
jest.mock('../../routes/api/preview/preview-utils', () => ({
    normalizeDocuments: jest.fn(() => []),
    summarizeCompletion: jest.fn(() => ({ isComplete: true, missingFields: [] })),
}));
jest.mock('../../routes/api/applications/application-listing-handlers', () => require('express').Router());

const { prisma: prismaMock } = require('../../services/prisma-database');
const applicationService = require('../../services/application-service');
const { assertEntityActionPermission } = require('../../services/entity-effective-permissions-service');
const { SERVER_OWNED_FORM_DATA_KEYS } = require('../../shared/form-data-ownership');
const { mergeWizardAnswers } = require('../../routes/api/helpers/application-constants');

const HEALTH_USER = {
    id: 'user-1',
    healthId: '1100000000008',
    canonicalId: 'canon-1',
    organizationId: 'org-1',
    canonicalRole: 'health',
    role: 'HEALTH_USER',
};

const YESTERDAY = new Date(Date.now() - 86400000);
const COMPANY_REG_RULE = {
    id: 'm2a-seed-juristic-company-reg',
    holderType: 'JURISTIC',
    requestType: null,
    plantCode: null,
    slotId: 'company_reg',
    isRequired: true,
    maxDocumentAgeMonths: 6,
    effectiveFrom: YESTERDAY,
    effectiveTo: null,
    createdBy: 'SYSTEM-M2A-SEED',
};

/** the stamp a first submit leaves behind */
const STAMP = {
    stampedAt: '2026-08-15T00:00:00.000Z',
    ruleIds: ['m2a-seed-juristic-company-reg'],
    slotIds: ['company_reg'],
};

// The company registration, plus the issued licence the EXPORT purpose of APPLICANT_ANSWERS
// requires (operator ruling 2026-10-05) — so a filing "with its papers on file" stays complete.
const PAPERS_ON_FILE = [
    { documentId: 'd1', slotId: 'company_reg', fileUrl: '/uploads/1.pdf' },
    { documentId: 'd2', slotId: 'licence_pt10', fileUrl: '/uploads/2.pdf' },
];
const LICENCE_PT10_MISSING = {
    slotId: 'licence_pt10',
    labelTH: 'ใบอนุญาตให้ส่งออกสมุนไพรควบคุมเพื่อการค้า (ภ.ท. 10)',
};

/** the applicant's own answers — they must survive every stamp we write */
// `plantId` is part of every real filing's answers: since 2026-09-05 a filing that names no
// plant is refused at the gate rather than judged by whatever law binds every plant.
const APPLICANT_ANSWERS = { plantId: 'cannabis', certificationPurposes: ['EXPORT'], farmData: { farmName: 'ไร่ทดสอบ' }, applicantData: { fullName: 'สมชาย' } };

function writerCalls() {
    return mockWriteApplicationStatus.mock.calls.map(([arg]) => arg);
}

function mount(mountPath, routerPath) {
    const app = express();
    app.use(express.json());
    app.use(mountPath, require(routerPath));
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    globalThis.__testUser = { ...HEALTH_USER };
    assertEntityActionPermission.mockResolvedValue({ allowed: true, via: 'ENTITY_PERMISSION' });
    applicationService.resolveHealthIdentity.mockResolvedValue({ userId: 'user-1', healthId: '1100000000008' });
    applicationService.getApplicationSlice.mockResolvedValue({
        id: 'app-1', applicationNumber: 'GACP-2026-0001', status: 'PENDING_DOC_FEE',
    });
    mockWriteApplicationStatus.mockResolvedValue({ id: 'app-1' });
    mockTransaction.mockImplementation(async (cb) => cb(TX));
    // A JURISTIC holder, and the seed rule that binds them.
    prismaMock.entity.findUnique.mockResolvedValue({ type: 'JURISTIC' });
    prismaMock.requirementRule.findMany.mockResolvedValue([COMPANY_REG_RULE]);
    prismaMock.applicationDocument.findMany.mockResolvedValue([]);
});

// ── door 1: POST /api/applications/submit (the mixed door) ───────────────────

describe('M2a — POST /submit, DRAFT branch = first submit', () => {
    let app;
    beforeAll(() => { app = mount('/api/applications', '../../routes/api/applications/applications'); });

    const submit = () => request(app).post('/api/applications/submit').send({ declarationsAccepted: true });

    function draftRow(formData) {
        return {
            id: 'app-1',
            applicationNumber: 'GACP-2026-0001',
            status: 'DRAFT',
            healthId: '1100000000008',
            entityId: 'ent-1',
            submitterId: 'user-1',
            formData: { ...APPLICANT_ANSWERS, ...formData },
            workflowHistory: [],
        };
    }

    it('JURISTIC with no company registration on file → 422, and NOTHING is written', async () => {
        applicationService.findDraftForSubmit.mockResolvedValue(draftRow({}));

        const r = await submit();

        expect(r.status).toBe(422);
        expect(r.body.code || r.body.error).toBe('APPLICATION_INCOMPLETE');
        expect(r.body.missingSlots).toEqual([{
            slotId: 'juristic_reg_6m',
            labelTH: 'สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล (ออกให้ไม่เกิน 6 เดือน)',
        }, LICENCE_PT10_MISSING]);
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
    });

    it('a client flag cannot buy the way in — documents[].uploaded stays worthless at the door (AC2)', async () => {
        applicationService.findDraftForSubmit.mockResolvedValue(draftRow({
            documents: [{ slotId: 'company_reg', uploaded: true }],
        }));

        const r = await submit();

        expect(r.status).toBe(422);
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
    });

    it('with the document on file → 200, and BOTH hops carry the stamp beside the applicants own answers', async () => {
        applicationService.findDraftForSubmit.mockResolvedValue(draftRow({ draftDocuments: PAPERS_ON_FILE }));

        const r = await submit();

        expect(r.status).toBe(200);
        const hops = writerCalls();
        expect(hops).toHaveLength(2);
        hops.forEach((hop) => {
            // The stamp is server-owned truth about which law judged this filing …
            expect(hop.additionalData.formData.serverRequirementSnapshot).toMatchObject({
                ruleIds: ['m2a-seed-juristic-company-reg'],
                slotIds: ['juristic_reg_6m', 'licence_pt10'], // purpose EXPORT + controlled plant: stamped (fix round 1)
            });
            // … written INTO the applicant's blob, never over it. Hop 2 rebuilds
            // formData from the pre-submit copy, so a stamp left only on hop 1
            // would be erased by the very next statement.
            expect(hop.additionalData.formData.farmData).toEqual(APPLICANT_ANSWERS.farmData);
        });
    });

    it('SUBMITTED echoes the REAL status — no transition, no writer call, an honest nextRequiredAction (F-SUBMIT-ECHO-LIES fix, Ruling 6)', async () => {
        applicationService.findDraftForSubmit.mockResolvedValue({ ...draftRow({}), status: 'SUBMITTED' });

        const r = await submit();

        expect(r.status).toBe(200);
        // The response status is exactly the DB status this request read —
        // never a fabricated literal. Before the ORIGINAL fix this branch
        // hardcode-echoed 'PENDING_DOC_FEE' while the DB stayed SUBMITTED
        // (found by a real-DB walk). A FIRST fix attempt then self-heal-
        // advanced this branch to PENDING_DOC_FEE via the canonical writer —
        // reverted (Ruling 6): the bundle submit door legitimately parks
        // member applications at bare SUBMITTED by design
        // (application-bundles.js:523-556) with no per-member hop 2, and this
        // route's id-lookup carries no status filter to tell a bundle member
        // from a stray row — an auto-advance here risked irreversibly pulling
        // a bundled application out of its bundle's billing model. So: no
        // transition, ever, on this branch.
        expect(r.body.data.status).toBe('SUBMITTED');
        // nextRequiredAction must mean "still processing", never PAY_PHASE_1
        // (there may be no issuable quotation to pay against — e.g. a bundle
        // member) and never any other fabricated action.
        expect(r.body.nextRequiredAction).toBe('WAIT_PROCESSING');
        // No status change occurred, so nothing was written and nothing
        // needed an audit row.
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
        // Still idempotent: no re-judging of the document law.
        expect(prismaMock.requirementRule.findMany).not.toHaveBeenCalled();
        expect(prismaMock.applicationDocument.findMany).not.toHaveBeenCalled();
    });

    it('PENDING_DOC_FEE stays a true no-op echo — nothing written, nothing audited, never re-judged', async () => {
        applicationService.findDraftForSubmit.mockResolvedValue({ ...draftRow({}), status: 'PENDING_DOC_FEE' });

        const r = await submit();

        expect(r.status).toBe(200);
        expect(r.body.data.status).toBe('PENDING_DOC_FEE');
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
        expect(prismaMock.requirementRule.findMany).not.toHaveBeenCalled();
        expect(prismaMock.applicationDocument.findMany).not.toHaveBeenCalled();
    });
});

describe('M2a — POST /submit, REVISION_REQUESTED / CAR_PENDING branch = resubmit', () => {
    let app;
    beforeAll(() => { app = mount('/api/applications', '../../routes/api/applications/applications'); });

    const submit = () => request(app).post('/api/applications/submit').send({ declarationsAccepted: true });

    function resubmitRow(formData, status = 'REVISION_REQUESTED') {
        return {
            id: 'app-1',
            applicationNumber: 'GACP-2026-0001',
            status,
            healthId: '1100000000008',
            entityId: 'ent-1',
            submitterId: 'user-1',
            formData: {
                ...APPLICANT_ANSWERS,
                revisionDueAt: new Date(Date.now() + 86400000).toISOString(),
                ...formData,
            },
            workflowHistory: [],
        };
    }

    it('judges by the stamp, not by todays law — a rule filed later cannot 422 it (AC3)', async () => {
        applicationService.findDraftForSubmit.mockResolvedValue(resubmitRow({
            serverRequirementSnapshot: STAMP,
            draftDocuments: PAPERS_ON_FILE,
        }));
        // today the ministry demands a site map too …
        prismaMock.requirementRule.findMany.mockResolvedValue([
            COMPANY_REG_RULE,
            { ...COMPANY_REG_RULE, id: 'later', holderType: null, slotId: 'site_map' },
        ]);

        const r = await submit();

        expect(r.status).toBe(200);
        // … and the table was never asked: the application carries its own law
        expect(prismaMock.requirementRule.findMany).not.toHaveBeenCalled();
    });

    it('the stamped set is still enforced on resubmit → 422 before any write', async () => {
        applicationService.findDraftForSubmit.mockResolvedValue(resubmitRow({ serverRequirementSnapshot: STAMP }));

        const r = await submit();

        expect(r.status).toBe(422);
        expect(r.body.missingSlots).toEqual([{
            slotId: 'juristic_reg_6m',
            labelTH: 'สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล (ออกให้ไม่เกิน 6 เดือน)',
        }]);
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
    });

    it('an application filed before M2a carries no stamp — it is let through, not refused', async () => {
        applicationService.findDraftForSubmit.mockResolvedValue(resubmitRow({}));

        const r = await submit();

        expect(r.status).toBe(200);
        expect(prismaMock.requirementRule.findMany).not.toHaveBeenCalled();
    });
});


// ── door 3: POST /api/applications/:id/car ───────────────────────────────────

describe('M2a — POST /applications/:id/car (resubmit)', () => {
    let app;
    beforeAll(() => { app = mount('/api/applications', '../../routes/api/applications/applications-car'); });

    const post = () => request(app).post('/api/applications/app-1/car')
        .send({ notes: 'ส่งหลักฐาน', files: [{ id: 'CAR-m2a.pdf', findingNo: 1 }] });
    beforeAll(() => {
        require('fs').mkdirSync('/tmp/gacp-test-uploads/car', { recursive: true });
        require('fs').writeFileSync('/tmp/gacp-test-uploads/car/CAR-m2a.pdf', '%PDF-1.4');
    });
    afterAll(() => { require('fs').rmSync('/tmp/gacp-test-uploads/car/CAR-m2a.pdf', { force: true }); });

    function carRow(formData) {
        return {
            id: 'app-1',
            applicationNumber: 'GACP-2026-0001',
            status: 'CAR_PENDING',
            healthId: '1100000000008',
            entityId: 'ent-1',
            formData: {
                ...APPLICANT_ANSWERS,
                workflowState: 'CAR_PENDING',
                carDueAt: '2099-01-01T00:00:00.000Z',
                declarationsAcceptedAt: '2026-01-01T00:00:00.000Z',
                ...formData,
            },
            workflowHistory: [],
        };
    }

    it('a stamped slot the server cannot see → 422, no status write', async () => {
        applicationService.findOwnedApplicationForApplicant.mockResolvedValue(carRow({ serverRequirementSnapshot: STAMP }));

        const r = await post();

        expect(r.status).toBe(422);
        expect(r.body.missingSlots).toEqual([{
            slotId: 'juristic_reg_6m',
            labelTH: 'สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล (ออกให้ไม่เกิน 6 เดือน)',
        }]);
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
    });

    it('stamped and satisfied → the CAR resubmit proceeds, judged by the stamp alone', async () => {
        applicationService.findOwnedApplicationForApplicant.mockResolvedValue(carRow({
            serverRequirementSnapshot: STAMP,
            draftDocuments: PAPERS_ON_FILE,
        }));

        const r = await post();

        expect(r.status).toBe(200);
        expect(prismaMock.requirementRule.findMany).not.toHaveBeenCalled();
        expect(writerCalls()[0].additionalData.formData.carDocuments).toHaveLength(1);
    });
});

// ── the SECOND refusal, through the doors ────────────────────────────────────
//
// Review layer 2, finding C5. `submit-doors-answer-every-gate-refusal.test.js` proves
// the shared responder and greps each door for `isSubmitGateRefusal` /
// `respondSubmitGateRefusal` — structural, so a SIXTH door cannot reintroduce the inline
// copy. What grep cannot prove is that the catch actually ROUTES: a door could import the
// helper, keep an earlier `catch` that swallows first, and still read green. The refusal
// that gets mislabelled is the new one, so it is the one driven through the wire here.
//
// Trigger: the register holds law for cannabis, the filing names ขมิ้นชัน. That is
// PLANT_LAW_NOT_FILED — no document list exists to demand, so "attach these papers" would
// be wrong advice and the door must say so in the applicant's own language.
describe('M2a — a filing no filed law can judge is refused BY NAME at every first-submit door', () => {
    const CANNABIS_ONLY = [{ ...COMPANY_REG_RULE, id: 'law-cannabis', holderType: null, plantCode: 'cannabis' }];
    const UNJUDGEABLE = { ...APPLICANT_ANSWERS, plantId: 'turmeric' };

    beforeEach(() => {
        // The same mock answers both reads: rulesAt, and the lens asking which plants
        // the register holds law for at all.
        prismaMock.requirementRule.findMany.mockResolvedValue(CANNABIS_ONLY);
    });

    /** Every door must name the refusal and hand over the Thai sentence with it. */
    function expectNotJudgeable(r) {
        expect(r.status).toBe(422);
        expect(r.body.code).toBe('APPLICATION_NOT_JUDGEABLE');
        expect(r.body.error).toBe('APPLICATION_NOT_JUDGEABLE');
        // Never the OTHER refusal's clothes: this filing is not missing a paper.
        expect(r.body.missingSlots).toEqual([]);
        expect(r.body.blockingIssues[0]).toMatchObject({ code: 'PLANT_LAW_NOT_FILED' });
        // The farmer's screen reads `.meta.messageTh`; `message` is stripped by the
        // browser envelope, so the Thai has to travel in both.
        expect(r.body.message).toMatch(/[ก-๙]/);
        expect(r.body.messageTh).toBe(r.body.message);
    }

    it('POST /submit (DRAFT)', async () => {
        const app = mount('/api/applications', '../../routes/api/applications/applications');
        applicationService.findDraftForSubmit.mockResolvedValue({
            id: 'app-1',
            applicationNumber: 'GACP-2026-0001',
            status: 'DRAFT',
            healthId: '1100000000008',
            entityId: 'ent-1',
            submitterId: 'user-1',
            formData: UNJUDGEABLE,
            workflowHistory: [],
        });

        const r = await request(app).post('/api/applications/submit').send({ declarationsAccepted: true });

        expectNotJudgeable(r);
        // The refusal lands before anything is written, exactly like the other one.
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
        expect(mockTransaction).not.toHaveBeenCalled();
    });

});

// ── the stamp is server-owned (AC2, second half) ─────────────────────────────

describe('M2a — the applicant cannot write the stamp through /prepare', () => {
    let app;
    beforeAll(() => { app = mount('/api/applications', '../../routes/api/applications/applications'); });

    it('both M2 snapshot keys are declared server-owned', () => {
        expect(SERVER_OWNED_FORM_DATA_KEYS).toContain('serverRequirementSnapshot');
        expect(SERVER_OWNED_FORM_DATA_KEYS).toContain('serverVaultSnapshot');
    });

    it('the answers merge keeps the stored stamp, whatever the client sends', () => {
        const merged = mergeWizardAnswers(
            { serverRequirementSnapshot: STAMP },
            { serverRequirementSnapshot: { slotIds: [] }, farmData: { farmName: 'ok' } },
        );

        expect(merged.serverRequirementSnapshot).toEqual(STAMP);
        expect(merged.farmData).toEqual({ farmName: 'ok' });
    });

    it('POST /prepare strips a forged stamp at the edge — the stored one survives', async () => {
        applicationService.findApplicationByIdForHealth.mockResolvedValue({
            id: 'app-1', status: 'DRAFT', entityId: 'ent-1', submitterId: 'user-1',
            formData: { ...APPLICANT_ANSWERS, serverRequirementSnapshot: STAMP },
            workflowHistory: [],
        });
        applicationService.updateApplicantDraftColumns.mockResolvedValue({
            id: 'app-1', applicationNumber: 'GACP-2026-0001', status: 'DRAFT',
        });

        const r = await request(app).post('/api/applications/prepare').send({
            applicationId: 'app-1',
            serverRequirementSnapshot: { stampedAt: '1999-01-01T00:00:00.000Z', ruleIds: [], slotIds: [] },
            serverVaultSnapshot: { forged: true },
            farmData: { farmName: 'ไร่ใหม่' },
        });

        expect(r.status).toBe(200);
        const written = applicationService.updateApplicantDraftColumns.mock.calls[0][1].formData;
        expect(written.serverRequirementSnapshot).toEqual(STAMP);
        expect(written.serverVaultSnapshot).toBeUndefined();
        expect(written.farmData).toEqual({ farmName: 'ไร่ใหม่' });
    });
});
