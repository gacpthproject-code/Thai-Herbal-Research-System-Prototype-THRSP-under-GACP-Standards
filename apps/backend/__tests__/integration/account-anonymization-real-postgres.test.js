/**
 * Privacy notice v1.4 §7 item 1, against a real Postgres: "เมื่อครบกำหนดระบบทำให้ข้อมูลบัญชี
 * ไม่สามารถระบุตัวบุคคลได้" and the same for a confirmed erasure request.
 *
 * Every account here is seeded the way production writes it: registration stores authType
 * HEALTH_ID for an applicant and PROVIDER_ID for staff (services/prisma-auth-service.js), and
 * Postgres enforces users_auth_type_identity_ck on both. The older PDPA suites seed EMAIL_LEGACY,
 * the one authType that check leaves free, so they never met it.
 *
 * The proof is a text search: every row the account owns (users, personal entities,
 * identity_links, application drafts, notifications, survey answers, consents, membership events,
 * workspace switches) is read back as JSON and searched for every value seeded to identify the
 * person (name, national ID, email, phone, laser code, IP, user agent, tax and community IDs,
 * tokens, and the hashes derived from them). Every text column of the users row and the personal
 * entity is seeded with a value, and a test checks the seed left none null, so each clear is proven
 * rather than assumed (review F-6). The avatar is a real file under the uploads folder.
 *
 * Seeding and read-back use a raw PrismaClient (no tenant or soft-delete extension); the sweep
 * and the erasure door run through the app client, as in production.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { runPdpaRetentionSweep } = require('../../jobs/pdpa-retention-job');
const erasureService = require('../../services/pdpa-erasure-service');
const { identityLookupColumns } = require('../../services/auth/identity-lookup-columns');
const { computeLookupHmac } = require('../../utils/field-encryption');
const { thaidSubjectKey } = require('../../services/auth/thaid-identity-service');
const { resolveApplicantInfo } = require('../../utils/applicant-resolver');
const { runWithTenantContext } = require('../../services/tenant-context');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { BASE_UPLOAD_DIR } = require('../../services/storage-service');

const LONG_PAST = new Date('2001-01-01T00:00:00.000Z');
const FAR_FUTURE = new Date('2099-01-01T00:00:00.000Z');
const YEAR_MS = 365 * 24 * 3600 * 1000;
// Text columns an account of that kind leaves null by construction (users_single_identity_ck).
const NULL_BY_KIND = { applicant: ['providerId', 'providerIdHash', 'providerIdHmac'], staff: ['healthId', 'healthIdHash', 'healthIdHmac'] };

/** 13 digits whose last digit is deliberately NOT the Mod-11 check digit. */
function fakeNationalId() {
    const digits = Array.from(crypto.randomBytes(12), (b) => b % 10);
    digits[0] = 1 + (digits[0] % 8);
    const sum = digits.reduce((acc, dgt, i) => acc + dgt * (13 - i), 0);
    const check = (11 - (sum % 11)) % 10;
    return digits.join('') + String((check + 1) % 10);
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

d('§7 item 1 on a real Postgres: account data ends up identifying no one', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let orgId;
    const avatarFiles = [];

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const tag = crypto.randomBytes(4).toString('hex');
        const org = await raw.organization.create({
            data: { name: `PDPA anonymization ${tag}`, slug: `pdpa-anon-${tag}`, code: `PDPAANON_${tag}`.toUpperCase() },
        });
        orgId = org.id;
    });

    afterAll(async () => {
        for (const file of avatarFiles) {fs.rmSync(file, { force: true });}
        await raw.$disconnect();
    });

    /**
     * One account as registration leaves it, plus the rows §7 item 5 says stay: an application
     * (formData with the applicant's own details), an uploaded document on it, and a farm.
     */
    async function seedAccount({ kind = 'applicant', retainUntil = LONG_PAST, legalHold = false } = {}) {
        const tag = crypto.randomBytes(5).toString('hex');
        const nationalId = fakeNationalId();
        const isStaff = kind === 'staff';
        const authType = isStaff ? 'PROVIDER_ID' : 'HEALTH_ID';
        const hmac = computeLookupHmac(nationalId);
        const person = {
            nationalId,
            firstName: `สมหญิง${tag}`,
            lastName: `ทดลองลบ${tag}`,
            email: `pdpa-${tag}@example.test`,
            phoneNumber: `08${String(parseInt(tag.slice(0, 6), 16)).padStart(8, '0').slice(0, 8)}`,
            laserCode: `JT0${tag.toUpperCase()}`,
            ip: `203.0.113.${1 + (parseInt(tag.slice(0, 2), 16) % 250)}`,
            userAgent: `GACP-Test-Agent/${tag}`,
            taxId: `TAX${tag}`,
            companyName: `ร้านของ${tag}`,
            representativeName: `ผู้แทน${tag}`,
            representativePosition: `ตำแหน่ง${tag}`,
            communityName: `วิสาหกิจ${tag}`,
            communityRegistrationNo: `CRN${tag}`,
            emailVerificationToken: `evt-${tag}`,
            passwordResetToken: `prt-${tag}`,
            twoFactorSecret: `TOTP${tag.toUpperCase()}`,
            twoFactorBackupCode: `bkp-${tag}`,
            deleteReason: `เหตุผลของ${tag}`,
        };
        const avatarName = `${Date.now()}-avatar-${tag}.png`;
        const avatarFile = path.join(BASE_UPLOAD_DIR, avatarName);
        fs.mkdirSync(BASE_UPLOAD_DIR, { recursive: true });
        fs.writeFileSync(avatarFile, `avatar of ${person.firstName}`);
        avatarFiles.push(avatarFile);
        const lookup = identityLookupColumns(nationalId, authType);
        const user = await raw.user.create({
            data: {
                organizationId: orgId,
                password: '$2a$12$abcdefghijklmnopqrstuuCDEFGHIJKLMNOPQRSTUVWXYZ012345',
                authType,
                role: isStaff ? 'document_reviewer' : 'health',
                accountType: isStaff ? 'PROVIDER' : 'INDIVIDUAL',
                status: 'ACTIVE',
                canonicalId: nationalId,
                canonicalIdLegacy: nationalId,
                idCard: nationalId,
                idCardHash: lookup.idCardHash,
                idCardHmac: hmac,
                laserCode: person.laserCode,
                healthId: isStaff ? null : nationalId,
                healthIdHash: lookup.healthIdHash,
                healthIdHmac: isStaff ? null : hmac,
                providerId: isStaff ? nationalId : null,
                providerIdHash: lookup.providerIdHash,
                providerIdHmac: isStaff ? hmac : null,
                firstName: person.firstName,
                lastName: person.lastName,
                email: person.email,
                phoneNumber: person.phoneNumber,
                address: `99 หมู่ 1 บ้าน${person.lastName}`,
                province: 'เชียงใหม่',
                district: 'แม่ริม',
                subdistrict: 'ริมใต้',
                zipCode: '50180',
                createdByIp: person.ip,
                updatedByIp: person.ip,
                privacySettings: { avatar: `/uploads/${avatarName}` },
                entityType: 'INDIVIDUAL',
                companyName: person.companyName,
                taxId: person.taxId,
                taxIdHash: sha256(person.taxId),
                taxIdHmac: computeLookupHmac(person.taxId),
                representativeName: person.representativeName,
                representativePosition: person.representativePosition,
                communityName: person.communityName,
                communityRegistrationNo: person.communityRegistrationNo,
                communityRegistrationNoHash: sha256(person.communityRegistrationNo),
                communityRegistrationNoHmac: computeLookupHmac(person.communityRegistrationNo),
                emailVerificationToken: person.emailVerificationToken,
                passwordResetToken: person.passwordResetToken,
                twoFactorSecret: person.twoFactorSecret,
                twoFactorBackupCodes: [person.twoFactorBackupCode],
                twoFactorMethod: 'TOTP',
                notificationSettings: { APPLICATION_STATUS: true },
                createdBy: orgId,
                updatedBy: orgId,
                deletedBy: orgId,
                deleteReason: person.deleteReason,
                retainUntil,
                legalHold,
            },
        });
        const needles = [
            person.nationalId, person.firstName, person.lastName, person.email, person.phoneNumber,
            person.laserCode, person.ip, lookup.idCardHash, hmac, person.userAgent,
            person.taxId, sha256(person.taxId), computeLookupHmac(person.taxId), person.companyName,
            person.representativeName, person.representativePosition, person.communityName,
            person.communityRegistrationNo, sha256(person.communityRegistrationNo),
            computeLookupHmac(person.communityRegistrationNo), person.emailVerificationToken,
            person.passwordResetToken, person.twoFactorSecret, person.twoFactorBackupCode,
            person.deleteReason, avatarName,
        ];
        const seeded = {
            user, person, needles, kind, avatarFile, entityIds: [], linkSubjects: [], draftIds: [], notificationIds: [],
            surveyResponseIds: [], consentIds: [], membershipEventIds: [], contextSwitchIds: [],
        };

        const consent = await raw.userConsent.create({
            data: {
                userId: user.id, category: 'MARKETING_EMAIL', version: '1.0.0', granted: true, grantedAt: new Date(),
                ipAddress: person.ip, userAgent: person.userAgent, organizationId: orgId,
            },
        });
        seeded.consentIds.push(consent.id);
        Object.assign(seeded, { consent });
        const notice = await raw.notification.create({
            data: { userId: user.id, title: 'แจ้งเตือน', message: `เรียน คุณ${person.firstName} ${person.lastName}`, type: 'INFO', organizationId: orgId },
        });
        const letter = await raw.notification.create({
            data: { userId: user.id, title: 'หนังสือแจ้งผล', message: 'ผลการพิจารณาคำขอ', type: 'INFO', kind: 'OFFICIAL_LETTER', organizationId: orgId },
        });
        seeded.notificationIds.push(notice.id, letter.id);
        Object.assign(seeded, { letter });
        const draft = await raw.applicationDraft.create({
            data: {
                userId: user.id, organizationId: orgId,
                formData: { applicantName: `${person.firstName} ${person.lastName}`, nationalId, phone: person.phoneNumber },
            },
        });
        seeded.draftIds.push(draft.id);
        const template = await raw.surveyTemplate.create({
            data: { code: `PDPA-ANON-${tag}`, title: 'แบบสำรวจ', status: 'ACTIVE', organizationId: orgId, targetGroup: 'FARMER' },
        });
        const question = await raw.surveyQuestion.create({
            data: { templateId: template.id, sortOrder: 1, questionText: 'ข้อเสนอแนะ', questionType: 'TEXTAREA', isRequired: true, organizationId: orgId },
        });
        const response = await raw.surveyResponse.create({
            data: { templateId: template.id, respondentUserId: user.id, region: 'NORTH', province: 'เชียงใหม่', organizationId: orgId },
        });
        await raw.surveyAnswer.create({
            data: { responseId: response.id, questionId: question.id, valueText: `ผม${person.firstName} โทร ${person.phoneNumber}`, organizationId: orgId },
        });
        seeded.surveyResponseIds.push(response.id);

        await raw.identityLink.create({ data: { userId: user.id, provider: 'local', subject: user.id } });
        if (isStaff) {return seeded;}

        const thaidSubject = thaidSubjectKey(nationalId);
        await raw.identityLink.create({ data: { userId: user.id, provider: 'thaid', subject: thaidSubject } });
        seeded.linkSubjects.push(thaidSubject);
        needles.push(thaidSubject);

        const slug = `${person.firstName}-${person.lastName}`;
        const entity = await raw.entity.create({
            data: {
                type: 'INDIVIDUAL',
                displayName: `${person.firstName} ${person.lastName}`,
                slug,
                thaiCitizenId: nationalId,
                thaiCitizenIdHash: sha256(nationalId),
                thaiCitizenIdHmac: hmac,
                juristicId: `JUR${tag}`,
                juristicIdHash: sha256(`JUR${tag}`),
                communityRegNo: `ENT-CRN${tag}`,
                communityRegNoHash: sha256(`ENT-CRN${tag}`),
                payload: { contactPhone: person.phoneNumber },
                status: 'ACTIVE',
                createdBy: user.id,
                deletedBy: user.id,
                organizationId: orgId,
            },
        });
        needles.push(`JUR${tag}`, sha256(`JUR${tag}`), `ENT-CRN${tag}`, sha256(`ENT-CRN${tag}`));
        await raw.entityMembership.create({
            data: { userId: user.id, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: orgId },
        });
        seeded.entityIds.push(entity.id);
        needles.push(slug, sha256(nationalId));
        const event = await raw.entityMembershipEvent.create({
            data: { actorUserId: user.id, entityId: entity.id, eventType: 'INVITED', ipAddress: person.ip, userAgent: person.userAgent, organizationId: orgId },
        });
        const contextSwitch = await raw.entityContextSwitch.create({
            data: { userId: user.id, toEntityId: entity.id, ipAddress: person.ip, userAgent: person.userAgent, organizationId: orgId },
        });
        seeded.membershipEventIds.push(event.id);
        seeded.contextSwitchIds.push(contextSwitch.id);
        Object.assign(seeded, { event, contextSwitch });

        const formData = {
            applicantName: `${person.firstName} ${person.lastName}`,
            applicantPhone: person.phoneNumber,
            farmData: { siteContactName: 'ผู้ดูแลแปลง', sitePhone: '0899999999', areaSize: 3 },
        };
        const application = await raw.application.create({
            data: {
                applicationNumber: `PDPA-ANON-${tag}`,
                healthId: nationalId,
                entityId: entity.id,
                areaType: 'OUTDOOR',
                organizationId: orgId,
                status: 'DOC_APPROVED',
                formData,
            },
        });
        const document = await raw.applicationDocument.create({
            data: {
                applicationId: application.id,
                documentType: 'ID_CARD',
                fileName: `idcard-${tag}.pdf`,
                fileUrl: `/uploads/applications/${application.id}/idcard-${tag}.pdf`,
            },
        });
        const farm = await raw.farm.create({
            data: {
                ownerId: user.id,
                entityId: entity.id,
                farmName: `ไร่${person.lastName}`,
                farmType: 'CULTIVATION',
                address: '1 หมู่ 2',
                province: 'เชียงใหม่',
                district: 'แม่ริม',
                subDistrict: 'ริมใต้',
                postalCode: '50180',
                totalArea: 3,
                cultivationArea: 2,
                cultivationMethod: 'OUTDOOR',
                organizationId: orgId,
            },
        });
        Object.assign(seeded, { entity, application, document, farm, formData });
        return seeded;
    }

    async function rowsAsText(account) {
        const userRows = await raw.$queryRawUnsafe('SELECT row_to_json(t)::text AS j FROM "users" t WHERE id = $1', account.user.id);
        const entityRows = account.entityIds.length
            ? await raw.$queryRawUnsafe('SELECT row_to_json(t)::text AS j FROM "entities" t WHERE id = ANY($1::text[])', account.entityIds)
            : [];
        const linkRows = await raw.$queryRawUnsafe(
            'SELECT row_to_json(t)::text AS j FROM "identity_links" t WHERE "userId" = $1 OR subject = ANY($2::text[])',
            account.user.id, account.linkSubjects,
        );
        const byIds = async (table, ids) => (ids.length
            ? (await raw.$queryRawUnsafe(`SELECT row_to_json(t)::text AS j FROM "${table}" t WHERE id = ANY($1::text[])`, ids)).map((r) => r.j)
            : []);
        const answerRows = account.surveyResponseIds.length
            ? await raw.$queryRawUnsafe('SELECT row_to_json(t)::text AS j FROM "survey_answers" t WHERE "responseId" = ANY($1::text[])', account.surveyResponseIds)
            : [];
        return {
            users: userRows.map((r) => r.j),
            entities: entityRows.map((r) => r.j),
            identityLinks: linkRows.map((r) => r.j),
            applicationDrafts: await byIds('application_drafts', account.draftIds),
            notifications: await byIds('notifications', account.notificationIds),
            surveyResponses: await byIds('survey_responses', account.surveyResponseIds),
            surveyAnswers: answerRows.map((r) => r.j),
            userConsents: await byIds('user_consents', account.consentIds),
            membershipEvents: await byIds('entity_membership_events', account.membershipEventIds),
            contextSwitches: await byIds('entity_context_switches', account.contextSwitchIds),
        };
    }

    /** Text columns of the seeded users row (and personal entity) that hold no value. */
    async function unseededTextColumns(account) {
        const nullIn = async (table, id) => {
            const columns = await raw.$queryRawUnsafe(
                `SELECT column_name AS c FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = $1 AND data_type IN ('text', 'character varying', 'jsonb', 'json')`,
                table,
            );
            const [row] = await raw.$queryRawUnsafe(`SELECT row_to_json(t) AS j FROM "${table}" t WHERE id = $1`, id);
            return columns.map(({ c }) => c).filter((c) => row.j[c] === null);
        };
        return {
            users: (await nullIn('users', account.user.id)).filter((c) => !NULL_BY_KIND[account.kind].includes(c)),
            entities: account.entity ? await nullIn('entities', account.entity.id) : [],
        };
    }

    /**
     * Operator order 96(2): the consent, membership-event and workspace-switch rows stay, keyed to
     * the anonymized User.id, with what they record; only the IP address and user agent go.
     */
    async function expectRequestContextClearedRowsKept(account) {
        const consent = await raw.userConsent.findUnique({ where: { id: account.consent.id } });
        expect(consent).toEqual({ ...account.consent, ipAddress: null, userAgent: null, updatedAt: consent.updatedAt });
        if (!account.event) {return;}
        expect(await raw.entityMembershipEvent.findUnique({ where: { id: account.event.id } }))
            .toEqual({ ...account.event, ipAddress: null, userAgent: null });
        expect(await raw.entityContextSwitch.findUnique({ where: { id: account.contextSwitch.id } }))
            .toEqual({ ...account.contextSwitch, ipAddress: null, userAgent: null });
    }

    /** What anonymization deletes or keeps beyond the users row (review F-2, orders 96(2), 96(3)). */
    async function expectAccountLeftoversHandled(account) {
        expect(await raw.applicationDraft.count({ where: { id: { in: account.draftIds } } })).toBe(0);
        expect(await raw.notification.findMany({ where: { id: { in: account.notificationIds } }, select: { id: true } }))
            .toEqual([{ id: account.letter.id }]);
        const responses = await raw.surveyResponse.findMany({ where: { id: { in: account.surveyResponseIds } } });
        expect(responses.map((r) => r.respondentUserId)).toEqual([null]);
        await expectRequestContextClearedRowsKept(account);
        expect(fs.existsSync(account.avatarFile)).toBe(false);
    }

    /** Every seeded value still present, as [table, value] pairs. Empty means unidentifiable. */
    async function survivingValues(account) {
        const tables = await rowsAsText(account);
        const found = [];
        for (const [table, texts] of Object.entries(tables)) {
            for (const needle of account.needles) {
                if (texts.some((text) => text.includes(needle))) {found.push([table, needle]);}
            }
        }
        return found;
    }

    /** §7 item 5: the account's application, its document and its farm are exactly as seeded. */
    async function expectApplicationDataKept(account) {
        const application = await raw.application.findUnique({ where: { id: account.application.id } });
        expect(application).not.toBeNull();
        expect(application.formData).toEqual(account.formData);
        expect(application.status).toBe('DOC_APPROVED');
        expect(application.entityId).toBe(account.entity.id);
        const user = await raw.user.findUnique({ where: { id: account.user.id }, select: { canonicalId: true } });
        expect(application.healthId).toBe(user.canonicalId);
        const document = await raw.applicationDocument.findUnique({ where: { id: account.document.id } });
        expect(document).toEqual(account.document);
        const farm = await raw.farm.findUnique({ where: { id: account.farm.id } });
        expect(farm).toEqual(account.farm);
    }

    test('an active applicant past retention: no seeded value remains in users, entities or identity_links', async () => {
        const account = await seedAccount();

        const stats = await runPdpaRetentionSweep();

        expect(stats.failedUserIds).not.toContain(account.user.id);
        expect(await survivingValues(account)).toEqual([]);
        const user = await raw.user.findUnique({ where: { id: account.user.id } });
        expect(user.isAnonymized).toBe(true);
        expect(user.legalHold).toBe(false);
        expect(user.retainUntil).toEqual(LONG_PAST);
        await expectApplicationDataKept(account);
        await expectAccountLeftoversHandled(account);
    });

    test('the seed gives every text column of the users row and the personal entity a value, so each clear above is proven', async () => {
        const applicant = await seedAccount({ retainUntil: FAR_FUTURE });
        const staff = await seedAccount({ kind: 'staff', retainUntil: FAR_FUTURE });

        expect(await unseededTextColumns(applicant)).toEqual({ users: [], entities: [] });
        expect(await unseededTextColumns(staff)).toEqual({ users: [], entities: [] });
    });

    test('a staff account past retention is anonymized the same way', async () => {
        const account = await seedAccount({ kind: 'staff' });

        await runPdpaRetentionSweep();

        expect(await survivingValues(account)).toEqual([]);
        expect((await raw.user.findUnique({ where: { id: account.user.id } })).isAnonymized).toBe(true);
        await expectAccountLeftoversHandled(account);
    });

    test('an account closed with the older "ลบบัญชีของฉัน" button and past retention: the sweep reaches it', async () => {
        const account = await seedAccount();
        const reason = `ไม่ใช้แล้ว ติดต่อ ${account.person.firstName}`;
        await raw.user.update({
            where: { id: account.user.id },
            data: { isDeleted: true, deletedAt: new Date('2002-01-01T00:00:00.000Z'), deletedBy: account.user.id, deleteReason: reason },
        });

        await runPdpaRetentionSweep();

        expect(await survivingValues(account)).toEqual([]);
        const user = await raw.user.findUnique({ where: { id: account.user.id } });
        expect(user.isAnonymized).toBe(true);
        expect(user.isDeleted).toBe(true);
        await expectApplicationDataKept(account);
    });

    test('an erasure requested and confirmed through the two-step door: nothing identifying remains, and both audit rows exist', async () => {
        const account = await seedAccount({ retainUntil: FAR_FUTURE });
        const actor = { actorId: account.user.id, actorRole: 'health' };

        const request = await erasureService.requestErasure({ healthId: account.person.nationalId, reason: 'ขอลบ', ...actor });
        const summary = await erasureService.confirmErasure(request.requestId, { token: request.token, ...actor });

        expect(summary.ok).toBe(true);
        expect(await survivingValues(account)).toEqual([]);
        const user = await raw.user.findUnique({ where: { id: account.user.id } });
        expect(user.isDeleted).toBe(true);
        expect(user.isAnonymized).toBe(true);
        await expectAccountLeftoversHandled(account);

        const audit = await raw.auditLog.findMany({
            where: { resourceId: account.user.id, action: { in: ['PDPA_ERASURE_REQUESTED', 'PDPA_ERASURE_EXECUTED'] } },
            select: { action: true, actorId: true, actorRole: true },
            orderBy: { sequenceNumber: 'asc' },
        });
        expect(audit).toEqual([
            { action: 'PDPA_ERASURE_REQUESTED', actorId: account.user.id, actorRole: 'health' },
            { action: 'PDPA_ERASURE_EXECUTED', actorId: account.user.id, actorRole: 'health' },
        ]);
    });

    test('an account the door erased before this change (personal entity left named) is finished by the sweep', async () => {
        const account = await seedAccount();
        await raw.user.update({
            where: { id: account.user.id },
            data: {
                authType: 'EMAIL_LEGACY',
                healthId: null, healthIdHash: null, healthIdHmac: null, idCard: null, idCardHash: null, idCardHmac: null,
                laserCode: null, canonicalId: account.user.id, canonicalIdLegacy: null,
                firstName: 'PDPA_ERASED', lastName: 'PDPA_ERASED', email: null, phoneNumber: null, address: null,
                isDeleted: true, deletedAt: new Date('2002-01-01T00:00:00.000Z'), deleteReason: 'PDPA ม.32 user-initiated erasure',
            },
        });
        await raw.entity.update({ where: { id: account.entity.id }, data: { thaiCitizenId: null, thaiCitizenIdHash: null } });

        await runPdpaRetentionSweep();

        expect(await survivingValues(account)).toEqual([]);
    });

    async function seedReceipt(account, issuedAt) {
        const tag = crypto.randomBytes(5).toString('hex');
        return raw.invoice.create({
            data: {
                invoiceNumber: `INV-PDPA-${tag}`, applicationId: account.application.id, healthId: account.user.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_DOC_REVIEW', subtotal: 0, totalAmount: 0, dueDate: issuedAt,
                status: 'PAID', paidAt: issuedAt, organizationId: orgId, metadata: {},
                receiptNumber: `RC-PDPA-${tag}`, receiptIssuedAt: issuedAt, createdAt: issuedAt,
            },
        });
    }

    async function printedPayerName(account) {
        const entity = await raw.entity.findUnique({ where: { id: account.entity.id } });
        return resolveApplicantInfo({ entity }).name;
    }

    test('§7 item 2: while a receipt names the person, an erasure keeps the payer name it prints; the sweep clears it once that retention ends', async () => {
        const account = await seedAccount({ retainUntil: FAR_FUTURE });
        const receipt = await seedReceipt(account, new Date(Date.now() - 365 * 24 * 3600 * 1000));
        const actor = { actorId: account.user.id, actorRole: 'health' };
        const payerName = `${account.person.firstName} ${account.person.lastName}`;

        const request = await erasureService.requestErasure({ healthId: account.person.nationalId, reason: 'ขอลบ', ...actor });
        await erasureService.confirmErasure(request.requestId, { token: request.token, ...actor });

        expect(await printedPayerName(account)).toBe(payerName);
        expect(await survivingValues(account)).toEqual([
            ['entities', account.person.firstName],
            ['entities', account.person.lastName],
        ]);

        const longAgo = new Date('2010-01-01T00:00:00.000Z');
        await raw.invoice.update({ where: { id: receipt.id }, data: { createdAt: longAgo, receiptIssuedAt: longAgo, paidAt: longAgo } });

        await runPdpaRetentionSweep();

        expect(await survivingValues(account)).toEqual([]);
        expect(await printedPayerName(account)).toBe('PDPA_ERASED');
    });

    test('the retention sweep keeps the payer name of a receipt still inside its retention, then clears it on a later run', async () => {
        const account = await seedAccount();
        const receipt = await seedReceipt(account, new Date(Date.now() - 365 * 24 * 3600 * 1000));

        await runPdpaRetentionSweep();

        expect((await raw.user.findUnique({ where: { id: account.user.id } })).isAnonymized).toBe(true);
        expect(await survivingValues(account)).toEqual([
            ['entities', account.person.firstName],
            ['entities', account.person.lastName],
        ]);

        const longAgo = new Date('2010-01-01T00:00:00.000Z');
        await raw.invoice.update({ where: { id: receipt.id }, data: { createdAt: longAgo, receiptIssuedAt: longAgo, paidAt: longAgo } });

        await runPdpaRetentionSweep();

        expect(await survivingValues(account)).toEqual([]);
    });

    test('an erasure under the request\'s tenant still sees a receipt filed under another organization, and keeps the name it prints', async () => {
        const account = await seedAccount({ retainUntil: FAR_FUTURE });
        const tag = crypto.randomBytes(4).toString('hex');
        const otherOrg = await raw.organization.create({
            data: { name: `PDPA other ${tag}`, slug: `pdpa-other-${tag}`, code: `PDPAOTHER_${tag}`.toUpperCase() },
        });
        const receipt = await seedReceipt(account, new Date(Date.now() - 365 * 24 * 3600 * 1000));
        await raw.invoice.update({ where: { id: receipt.id }, data: { organizationId: otherOrg.id } });
        const actor = { actorId: account.user.id, actorRole: 'health' };

        await runWithTenantContext({ organizationId: orgId, principal: 'staff' }, async () => {
            const request = await erasureService.requestErasure({ healthId: account.person.nationalId, reason: 'ขอลบ', ...actor });
            await erasureService.confirmErasure(request.requestId, { token: request.token, ...actor });
        });

        expect(await printedPayerName(account)).toBe(`${account.person.firstName} ${account.person.lastName}`);
    });

    test('a credit note issued after an old receipt keeps the payer name for its own retention', async () => {
        const account = await seedAccount();
        const receipt = await seedReceipt(account, new Date('2010-01-01T00:00:00.000Z'));
        const recent = new Date(Date.now() - 365 * 24 * 3600 * 1000);
        await raw.creditNote.create({
            data: {
                originalInvoiceId: receipt.id, creditNoteNumber: `CN-PDPA-${crypto.randomBytes(4).toString('hex')}`,
                reason: 'แก้ไขยอด', reasonCode: 'CORRECTION', subtotal: 0, vat: 0, totalAmount: 0, status: 'POSTED',
                issuedAt: recent, postedAt: recent, organizationId: orgId,
            },
        });

        await runPdpaRetentionSweep();

        expect(await printedPayerName(account)).toBe(`${account.person.firstName} ${account.person.lastName}`);
    });

    test('a company the swept person owns keeps its name and registration: only the personal entity is the person', async () => {
        const account = await seedAccount();
        const tag = crypto.randomBytes(4).toString('hex');
        const company = await raw.entity.create({
            data: {
                type: 'JURISTIC', displayName: `บริษัท ทดลอง ${tag} จำกัด`, slug: `company-${tag}`,
                juristicId: '0000000000000', status: 'ACTIVE', createdBy: account.user.id, organizationId: orgId,
            },
        });
        await raw.entityMembership.create({
            data: { userId: account.user.id, entityId: company.id, role: 'OWNER', status: 'ACTIVE', organizationId: orgId },
        });

        await runPdpaRetentionSweep();

        expect(await survivingValues(account)).toEqual([]);
        expect(await raw.entity.findUnique({ where: { id: company.id } })).toEqual(company);
    });

    test('a legal-hold account past retention and an account inside its window are left exactly as they were', async () => {
        const held = await seedAccount({ legalHold: true });
        const current = await seedAccount({ retainUntil: FAR_FUTURE });

        await runPdpaRetentionSweep();

        for (const account of [held, current]) {
            const user = await raw.user.findUnique({ where: { id: account.user.id } });
            expect(user).toEqual(account.user);
            const entity = await raw.entity.findUnique({ where: { id: account.entity.id } });
            expect(entity).toEqual(account.entity);
            expect(await raw.identityLink.count({ where: { userId: account.user.id } })).toBe(2);
            await expectApplicationDataKept(account);
            expect(await raw.applicationDraft.count({ where: { id: { in: account.draftIds } } })).toBe(1);
            expect(await raw.notification.count({ where: { id: { in: account.notificationIds } } })).toBe(2);
            expect(await raw.userConsent.findUnique({ where: { id: account.consent.id } })).toEqual(account.consent);
            expect(await raw.entityMembershipEvent.findUnique({ where: { id: account.event.id } })).toEqual(account.event);
            expect(fs.existsSync(account.avatarFile)).toBe(true);
        }
    });

    test('§7 item 2 is five years: a receipt issued six years ago no longer keeps the payer name', async () => {
        const account = await seedAccount();
        await seedReceipt(account, new Date(Date.now() - 6 * YEAR_MS));

        await runPdpaRetentionSweep();

        expect(await printedPayerName(account)).toBe('PDPA_ERASED');
        expect(await survivingValues(account)).toEqual([]);
    });

    test('a receipt issued four years ago still keeps the payer name', async () => {
        const account = await seedAccount();
        await seedReceipt(account, new Date(Date.now() - 4 * YEAR_MS));

        await runPdpaRetentionSweep();

        expect(await printedPayerName(account)).toBe(`${account.person.firstName} ${account.person.lastName}`);
    });
});
