'use strict';

/**
 * ต่ออายุเริ่มจากคำขอเดิม (operator คำสั่ง 143 (3), 2026-10-27) · real Postgres, ประตูร่างจริง
 *
 * คำขอต่ออายุที่ระบบรับรองว่าต่อจากใบเดิมได้ เริ่มด้วยคำตอบขั้นสถานที่ปลูก (farmData) และขั้นพันธุ์
 * และวัตถุประสงค์ (varieties, varietiesNote, processing, certificationPurposes) ของคำขอที่ออกใบนั้น
 * ทุกช่องแก้ได้ · ข้อมูลผู้ถือมาจากทะเบียนผู้ถือ ไม่คัดลอกตัวตนเข้าคำขอ · ไฟล์แนบไม่ยกมา ·
 * เลขใบเดิมที่ไม่มีในระบบ หรือใบที่ไม่มีคำตอบเดิมให้ยก = ร่างว่าง ไม่มีข้อผิดพลาด
 */

const { dropConsentRows } = require('../../test-support/consent-history');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { filedHolderData } = require('../../test-support/filed-application');

const mockActor = { current: null };
jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const { tenantContextMiddleware } = jest.requireActual('../../middleware/tenant-context-middleware');
    const bindTenant = tenantContextMiddleware();
    const attach = (req, res, next) => {
        req.user = { ...mockActor.current };
        return bindTenant(req, res, next);
    };
    return { ...actual, authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach, authenticateToken: attach };
});

const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');

const PREVIOUS_FARM = Object.freeze({
    siteName: 'แปลงหนองจอก', siteAddress: '45 หมู่ 3 ถนนเลียบคลอง', subDistrict: 'กระทุ่มราย', district: 'หนองจอก',
    province: 'กรุงเทพมหานคร', postalCode: '10530', sitePhone: '0891234567', siteContactName: 'สมศรี ดูแลแปลง',
    siteContactIsApplicant: false, siteContactInformed: true,
    landOwnership: 'RENTED', landlordName: 'นายที่ดิน ให้เช่า', landConsentValidUntil: '2028-12-31',
    landDocumentDetail: { type: 'โฉนด', number: '12345', volume: '12', page: '34', issuedBy: 'สำนักงานที่ดินเขตหนองจอก' },
    areaSqm: '3200', coordinates: '13.8551, 100.8623', plantsPerCycle: '400', cyclesPerYear: '2', areaTypes: ['OUTDOOR'],
});
const PREVIOUS_VARIETIES = Object.freeze([
    { kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์วิจัยสกลนคร', quantity: '400', unit: 'เมล็ด' },
]);
const PREVIOUS_PROCESSING = Object.freeze({ plantPart: 'ช่อดอก', strain: 'หางกระรอกภูพาน', source: 'แปลงของตนเอง', quantity: '120', unit: 'กิโลกรัม' });

/** A site filed by the wizard before 2026-09-01 (domain-types.ts FarmData): other keys, another tenure word. */
const LEGACY_FARM = Object.freeze({
    farmName: 'ฟาร์มเก่าภูพาน', address: '1 หมู่ 1', province: 'สกลนคร', district: 'เมืองสกลนคร', subdistrict: 'ธาตุเชิงชุม',
    postalCode: '47000', gpsLat: '17.15', gpsLng: '104.14', totalAreaSize: '2', totalAreaUnit: 'Rai', landOwnership: 'RENT',
});

/** What the previous certificate's application filed (the wizard's own keys), plus what must stay behind. */
function previousFiling() {
    return {
        plantId: 'cannabis',
        requestType: 'NEW',
        certScope: 'PLANTING',
        certificationPurposes: ['EXPORT', 'MEDICAL'],
        farmData: { ...PREVIOUS_FARM },
        varieties: PREVIOUS_VARIETIES.map((row) => ({ ...row })),
        varietiesNote: 'พันธุ์ที่สามปลูกในรอบถัดไป',
        processing: { ...PREVIOUS_PROCESSING },
        applicantData: { companyName: 'บริษัท เดิม จำกัด', registrationNumber: '0105560000001', phone: '0812345678' },
        stepDocuments: [{ slotId: 'land_rights', fileName: 'chanote.pdf' }],
        draftDocuments: [{ slotId: 'land_rights', fileUrl: '/uploads/application-drafts/chanote.pdf' }],
        declarationsAcceptedAt: '2025-11-01T00:00:00.000Z',
        workflowState: 'CERTIFIED',
    };
}

/** The renewal's steps 3-4 as the previous filing answered them; the contact notice is asked again. */
function expectedPrefill() {
    const { siteContactInformed: _askedAgain, ...farm } = PREVIOUS_FARM;
    return {
        farmData: farm,
        varieties: PREVIOUS_VARIETIES.map((row) => ({ ...row })),
        varietiesNote: 'พันธุ์ที่สามปลูกในรอบถัดไป',
        processing: { ...PREVIOUS_PROCESSING },
        certificationPurposes: ['EXPORT'],
    };
}

const BLANK_ANSWERS = Object.freeze({ farmData: null, varieties: [], varietiesNote: null, processing: null, certificationPurposes: [] });

/** What the wizard's store holds when step 1 is answered from ?renew=: every later answer empty. */
function stepOneStore(certificateNumber) {
    return {
        requestType: 'RENEWAL', certScope: null, previousCertificateNumber: certificateNumber, plantId: null,
        farmData: null, varieties: [], varietiesNote: null, processing: null, certificationPurposes: [],
        applicantData: null, stepDocuments: [], documents: [], plots: [], siteData: null,
    };
}

d('ต่ออายุเริ่มจากคำตอบขั้นสถานที่และพันธุ์ของคำขอเดิม แก้ได้ทุกช่อง (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { entityIds: [], appIds: [], certIds: [] };
    const session = `prefill-${sfx}`;
    let seq = 0;

    const save = (body) => request(app).post('/api/applications/draft')
        .send({ saveSession: session, saveSeq: ++seq, ...body });
    const stored = async (id) => (await raw.application.findUnique({ where: { id } })).formData;
    const stepAnswers = (formData) => ({
        farmData: formData.farmData ?? null,
        varieties: formData.varieties ?? [],
        varietiesNote: formData.varietiesNote ?? null,
        processing: formData.processing ?? null,
        certificationPurposes: formData.certificationPurposes ?? [],
    });

    async function certify(label, formData, entityId = fx.C) {
        const source = await raw.application.create({
            data: {
                applicationNumber: `APP-PF-${label}-${sfx}`, healthId: fx.X.canonicalId, areaType: 'OUTDOOR', organizationId: fx.org,
                entityId, submitterId: fx.X.id, status: 'CERTIFIED', formData,
            },
        });
        fx.appIds.push(source.id);
        const number = `GACP-PF-${label}-${sfx}`;
        const cert = await raw.certificate.create({
            data: {
                certificateNumber: number, verificationCode: `V-PF-${label}-${sfx}`, qrData: 'qr', applicationId: source.id, userId: fx.X.id,
                farmId: fx.farm, farmName: 'แปลงหนองจอก', applicantName: 'ทดสอบ', cropType: 'cannabis', farmSize: 1, province: 'กรุงเทพมหานคร',
                district: 'หนองจอก', subDistrict: 'กระทุ่มราย', standardId: 'std', standardName: 'GACP', validityMonths: 12,
                expiryDate: new Date(Date.now() + 30 * 86400e3), issuedBy: fx.X.id, status: 'active', organizationId: fx.org,
                holderDisplayName: `บริษัท pf ${sfx} จำกัด`, holderType: 'JURISTIC', submittedByUserId: fx.X.id,
            },
        });
        fx.certIds.push(cert.id);
        return number;
    }

    async function startRenewal(certificateNumber) {
        const res = await save({ entityId: fx.C, step: 2, formData: stepOneStore(certificateNumber) });
        const id = res.body?.data?.draftId;
        if (id) { fx.appIds.push(id); }
        return { res, id };
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.org = (await raw.organization.create({ data: { name: `pf-${sfx}`, slug: `pf-${sfx}`, code: `PF_${sfx}`.toUpperCase() } })).id;
        const id = crypto.randomUUID();
        const canonicalId = `pf-x-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `pf-x-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: 'ต่ออายุ', organizationId: fx.org,
            },
        });
        fx.X = { id, canonicalId };
        for (const category of [ConsentCategory.TERMS_OF_SERVICE, ConsentCategory.PRIVACY_POLICY, ConsentCategory.PAYMENT_TERMS]) {
            await raw.userConsent.create({
                data: { userId: id, organizationId: fx.org, category, version: ConsentVersions[category] || '1.0', granted: true, grantedAt: new Date() },
            });
        }
        fx.C = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท pf ${sfx} จำกัด`, organizationId: fx.org, createdBy: id, ...filedHolderData('JURISTIC') },
        })).id;
        fx.entityIds.push(fx.C);
        await raw.entityMembership.create({ data: { userId: id, entityId: fx.C, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org } });
        fx.farm = (await raw.farm.create({
            data: {
                ownerId: id, farmName: `ฟาร์ม pf ${sfx}`, farmType: 'CULTIVATION', address: '45', province: 'กรุงเทพมหานคร',
                district: 'หนองจอก', subDistrict: 'กระทุ่มราย', postalCode: '10530', totalArea: 1, cultivationArea: 1,
                cultivationMethod: 'OUTDOOR', organizationId: fx.org, entityId: fx.C,
            },
        })).id;
        fx.D = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท pf-อื่น ${sfx} จำกัด`, organizationId: fx.org, createdBy: id, ...filedHolderData('JURISTIC') },
        })).id;
        fx.entityIds.push(fx.D);
        await raw.entityMembership.create({ data: { userId: id, entityId: fx.D, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org } });
        fx.filedCert = await certify('FILED', previousFiling());
        fx.bareCert = await certify('BARE', { plantId: 'cannabis', cultivationMethods: ['outdoor'], workflowState: 'CERTIFIED' });
        fx.legacyCert = await certify('LEGACY', { ...previousFiling(), farmData: { ...LEGACY_FARM } });
        fx.otherHolderCert = await certify('OTHER', previousFiling(), fx.D);

        mockActor.current = { id, canonicalId, healthId: canonicalId, role: 'health', canonicalRole: 'health', organizationId: fx.org };
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        const appIds = (await raw.application.findMany({ where: { organizationId: fx.org }, select: { id: true } })).map((r) => r.id);
        const wipe = (model, where) => (raw[model] ? raw[model].deleteMany({ where }).catch(() => {}) : null);
        await wipe('certificate', { id: { in: fx.certIds } });
        await wipe('farm', { organizationId: fx.org });
        for (const model of ['paymentTransaction', 'invoice', 'quotation', 'documentPrecheck', 'applicationDocument', 'workActivity', 'notification']) {
            await wipe(model, { applicationId: { in: appIds } });
        }
        await wipe('auditLog', { resourceId: { in: appIds } });
        await wipe('application', { id: { in: appIds } });
        await dropConsentRows(raw, fx.X?.id).catch(() => {});
        await wipe('entityMembership', { entityId: { in: fx.entityIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: fx.X?.id });
        await wipe('organization', { id: fx.org });
        await raw.$disconnect();
    });

    // A save without an applicationId resumes the applicant's open draft; each test starts a fresh one.
    afterEach(async () => {
        await raw.application.updateMany({ where: { organizationId: fx.org, status: 'DRAFT' }, data: { isDeleted: true } });
    });

    test('the first save of a renewal starts steps 3-4 from the previous filing; identity and uploads stay behind', async () => {
        const { res, id } = await startRenewal(fx.filedCert);
        const formData = await stored(id);
        expect({
            status: res.status,
            requestType: res.body?.data?.requestType,
            answers: stepAnswers(formData),
            applicantData: formData.applicantData ?? null,
            stepDocuments: formData.stepDocuments ?? [],
            draftDocuments: formData.draftDocuments ?? null,
            documentRows: await raw.applicationDocument.count({ where: { applicationId: id } }),
            told: res.body?.data?.renewalPrefill ?? null,
        }).toEqual({
            status: 200,
            requestType: 'RENEWAL',
            answers: expectedPrefill(),
            applicantData: null,
            stepDocuments: [],
            draftDocuments: null,
            documentRows: 0,
            told: expectedPrefill(),
        });
    });

    test('an edit after the prefill is kept by the next saves and by submit', async () => {
        const { id } = await startRenewal(fx.filedCert);
        const edited = { ...(await stored(id)).farmData, siteName: 'แปลงหนองจอก ฝั่งเหนือ', plantsPerCycle: '600', siteContactInformed: true };
        const editedVarieties = [{ ...PREVIOUS_VARIETIES[0], name: 'หางกระรอกภูพาน 2', quantity: '600' }];
        const editSave = await save({ applicationId: id, step: 4, formData: { farmData: edited, varieties: editedVarieties, varietiesNote: '' } });
        const again = await save({ applicationId: id, step: 4, formData: { farmData: edited } });
        for (const [documentType, slotId] of [
            ['JURISTIC_REG_6M', 'juristic_reg_6m'], ['LICENCE_PT10', 'licence_pt10'], ['LAND_RIGHTS', 'land_rights'], ['LAND_CONSENT', 'land_consent'],
        ]) {
            await raw.applicationDocument.create({
                data: { applicationId: id, documentType, slotId, fileName: `${slotId}.pdf`, fileUrl: `/uploads/${slotId}.pdf`, currentForSlot: slotId },
            });
        }
        const submitted = await request(app).post('/api/applications/submit').send({
            applicationId: id, declarationsAccepted: true, renewalChangeDeclaration: { changed: true, details: 'ขยายจำนวนต้นต่อรอบเป็น 600 ต้น' },
        });
        const filed = await raw.application.findUnique({ where: { id } });
        expect({
            saves: [editSave.status, again.status],
            told: [editSave.body?.data?.renewalPrefill ?? null, again.body?.data?.renewalPrefill ?? null],
            submit: { status: submitted.status, body: submitted.status === 200 ? null : submitted.body },
            filedStatus: filed.status,
            farm: { siteName: filed.formData.farmData.siteName, plantsPerCycle: filed.formData.farmData.plantsPerCycle },
            varieties: filed.formData.varieties,
            varietiesNote: filed.formData.varietiesNote,
        }).toEqual({
            saves: [200, 200],
            told: [null, null],
            submit: { status: 200, body: null },
            filedStatus: 'DOC_FEE_PAID',
            farm: { siteName: 'แปลงหนองจอก ฝั่งเหนือ', plantsPerCycle: '600' },
            varieties: editedVarieties,
            varietiesNote: '',
        });
    });

    test('answers the applicant gave before claiming the renewal are not overwritten', async () => {
        const typed = { siteName: 'แปลงใหม่ลำลูกกา', siteAddress: '9 หมู่ 9' };
        const first = await save({ entityId: fx.C, step: 1, formData: { requestType: 'NEW', certScope: 'PLANTING', plantId: 'cannabis', farmData: typed } });
        const id = first.body?.data?.draftId;
        fx.appIds.push(id);
        const claimed = await save({ applicationId: id, step: 2, formData: { requestType: 'RENEWAL', previousCertificateNumber: fx.filedCert, farmData: typed } });
        const formData = await stored(id);
        expect({
            status: claimed.status,
            requestType: claimed.body?.data?.requestType,
            farmData: formData.farmData,
            varieties: formData.varieties,
            told: claimed.body?.data?.renewalPrefill ?? null,
        }).toEqual({
            status: 200,
            requestType: 'RENEWAL',
            farmData: { ...expectedPrefill().farmData, ...typed },
            varieties: expectedPrefill().varieties,
            told: { ...expectedPrefill(), farmData: { ...expectedPrefill().farmData, ...typed } },
        });
    });

    test('the reply that carried the prefill is lost: the next save posts blanks, yet the filing stays and is offered again until the wizard says it loaded it', async () => {
        const { id } = await startRenewal(fx.filedCert);
        const typedMeanwhile = { siteName: 'แปลงหนองจอก ฝั่งเหนือ' };
        const blankStore = { ...stepOneStore(fx.filedCert), farmData: typedMeanwhile };
        const afterLostReply = await save({ applicationId: id, step: 3, formData: blankStore });
        const keptFiling = stepAnswers(await stored(id));
        const farmLoaded = { ...keptFiling.farmData, landlordName: '' };
        const loadedThenCleared = { ...blankStore, farmData: farmLoaded, varieties: [], varietiesNote: '' };
        const acknowledged = await save({ applicationId: id, step: 4, renewalPrefillLoaded: true, formData: loadedThenCleared });
        const afterAck = stepAnswers(await stored(id));
        const withoutFlag = await save({ applicationId: id, step: 4, formData: loadedThenCleared });
        const expectedFilled = { ...expectedPrefill(), farmData: { ...expectedPrefill().farmData, ...typedMeanwhile } };
        expect({
            saves: [afterLostReply.status, acknowledged.status, withoutFlag.status],
            keptFiling,
            offeredAgain: afterLostReply.body?.data?.renewalPrefill ?? null,
            afterAck: { farm: { landlordName: afterAck.farmData.landlordName, siteName: afterAck.farmData.siteName }, varieties: afterAck.varieties, varietiesNote: afterAck.varietiesNote },
            toldAfterAck: [acknowledged.body?.data?.renewalPrefill ?? null, withoutFlag.body?.data?.renewalPrefill ?? null],
            stillCleared: stepAnswers(await stored(id)).varieties,
        }).toEqual({
            saves: [200, 200, 200],
            keptFiling: expectedFilled,
            offeredAgain: expectedFilled,
            afterAck: { farm: { landlordName: '', siteName: 'แปลงหนองจอก ฝั่งเหนือ' }, varieties: [], varietiesNote: '' },
            toldAfterAck: [null, null],
            stillCleared: [],
        });
    });

    test('a previous filing in the pre-2026-09 shape fills only the step-3 fields it shares, and no tenure word the wizard does not know', async () => {
        const { res, id } = await startRenewal(fx.legacyCert);
        const sharedFields = { province: 'สกลนคร', district: 'เมืองสกลนคร', postalCode: '47000' };
        expect({
            status: res.status,
            requestType: res.body?.data?.requestType,
            farmData: (await stored(id)).farmData,
            toldFarm: res.body?.data?.renewalPrefill?.farmData ?? null,
        }).toEqual({ status: 200, requestType: 'RENEWAL', farmData: sharedFields, toldFarm: sharedFields });
    });

    test('a certificate number mistyped for one save and corrected on the next does not refill what the applicant cleared', async () => {
        const { id } = await startRenewal(fx.filedCert);
        const loadedStore = { ...stepOneStore(fx.filedCert), ...expectedPrefill(), varieties: [] };
        const cleared = await save({ applicationId: id, step: 4, renewalPrefillLoaded: true, formData: loadedStore });
        const mistyped = await save({ applicationId: id, step: 4, formData: { ...loadedStore, previousCertificateNumber: `${sfx}/2566` } });
        const corrected = await save({ applicationId: id, step: 4, formData: loadedStore });
        expect({
            saves: [cleared.status, mistyped.status, corrected.status],
            requestTypes: [mistyped.body?.data?.requestType, corrected.body?.data?.requestType],
            varieties: (await stored(id)).varieties,
            told: corrected.body?.data?.renewalPrefill ?? null,
        }).toEqual({ saves: [200, 200, 200], requestTypes: ['NEW', 'RENEWAL'], varieties: [], told: null });
    });

    test("another holder's certificate, readable to this caller, is refused at the draft door and carries nothing across", async () => {
        const { res, id } = await startRenewal(fx.otherHolderCert);
        expect({
            status: res.status,
            requestType: res.body?.data?.requestType,
            notice: res.body?.data?.lawNotice?.code ?? null,
            told: res.body?.data?.renewalPrefill ?? null,
            answers: stepAnswers(await stored(id)),
        }).toEqual({ status: 200, requestType: 'NEW', notice: 'PREVIOUS_CERTIFICATE_OTHER_HOLDER', told: null, answers: BLANK_ANSWERS });
    });

    test.each([
        ['a certificate number this system never issued (the DTAM register)', () => `${sfx}/2566`, 'NEW', 'PREVIOUS_CERTIFICATE_NOT_FOUND'],
        ['a certificate whose application holds no filing to carry', () => fx.bareCert, 'RENEWAL', null],
    ])('%s: the draft starts empty and saves without error', async (_label, number, requestType, notice) => {
        const { res, id } = await startRenewal(number());
        expect({
            status: res.status,
            requestType: res.body?.data?.requestType,
            notice: res.body?.data?.lawNotice?.code ?? null,
            told: res.body?.data?.renewalPrefill ?? null,
            answers: stepAnswers(await stored(id)),
        }).toEqual({
            status: 200,
            requestType,
            notice,
            told: null,
            answers: BLANK_ANSWERS,
        });
    });
});
