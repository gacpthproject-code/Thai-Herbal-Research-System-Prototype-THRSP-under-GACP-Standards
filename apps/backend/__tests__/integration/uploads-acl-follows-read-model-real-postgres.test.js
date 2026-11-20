'use strict';

process.env.RATE_LIMIT_MAX = '1000000';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const UPLOADS = path.join(__dirname, '../../public/uploads');
const STUB = `uploads-acl-stub-${crypto.randomUUID()}`;

function raw(req) {
    return req.buffer(true).parse((res, done) => {
        let body = '';
        res.setEncoding('latin1');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => done(null, body));
    });
}

d('the /uploads object ACL follows the read model (real server, real Postgres)', () => {
    const db = new PrismaClient();
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { users: {}, tokens: {}, files: {}, ids: { users: [] } };
    const createdDirs = [];
    const plantedFiles = [];
    let app;
    const ORIGINAL_SCOPE = process.env.TENANT_READ_ORG_SCOPE;

    const plant = (rel) => {
        const full = path.join(UPLOADS, rel);
        let dir = path.dirname(full);
        const missing = [];
        while (!fs.existsSync(dir)) { missing.unshift(dir); dir = path.dirname(dir); }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        createdDirs.push(...missing);
        fs.writeFileSync(full, `%PDF-1.4 ${STUB} ${rel}`);
        plantedFiles.push(full);
        return `/uploads/${rel}`;
    };

    const mkUser = async (key, role, organizationId) => {
        const id = crypto.randomUUID();
        const canonicalId = `ua-${key.toLowerCase()}-${sfx}`;
        const health = role === 'health';
        await db.user.create({
            data: {
                id, canonicalId, healthId: health ? canonicalId : null, password: 'x', role,
                authType: 'EMAIL_LEGACY', email: `ua-${key.toLowerCase()}-${sfx}@example.test`,
                firstName: 'ทดสอบ', lastName: key, organizationId, status: 'ACTIVE',
            },
        });
        fx.ids.users.push(id);
        fx.users[key] = { id, canonicalId, role };
        const jwtConfig = require('../../config/jwt-security');
        fx.tokens[key] = health
            ? jwtConfig.generateToken({ id, userId: id, role, canonicalRole: role }, 'public')
            : jwtConfig.generateToken(
                { id, userId: id, role, canonicalRole: role, organizationId },
                'provider',
            );
    };

    beforeAll(async () => {
        await db.$connect();
        fx.org = (await db.organization.create({
            data: { name: `ua-${sfx}`, slug: `ua-${sfx}`, code: `UA_${sfx}`.toUpperCase() },
        })).id;
        fx.orgB = (await db.organization.create({
            data: { name: `ua-b-${sfx}`, slug: `ua-b-${sfx}`, code: `UAB_${sfx}`.toUpperCase() },
        })).id;

        for (const key of ['formerFiler', 'uploader', 'coMember', 'viewer', 'formerUploader', 'stranger', 'otherOwner']) {
            await mkUser(key, 'health', fx.org);
        }
        await mkUser('reviewer', 'document_reviewer', fx.org);
        await mkUser('otherReviewer', 'document_reviewer', fx.org);
        await mkUser('inspector', 'field_inspector', fx.org);
        await mkUser('otherInspector', 'field_inspector', fx.org);
        await mkUser('approver', 'certificate_approver', fx.org);
        await mkUser('adminDtam', 'system_admin_dtam', fx.org);
        await mkUser('financeDtam', 'finance_officer_dtam', fx.org);
        await mkUser('financePlatform', 'finance_officer_platform', fx.org);
        await mkUser('otherOrgAdmin', 'system_admin_dtam', fx.orgB);

        fx.entity = (await db.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท ยูเอซีแอล ${sfx} จำกัด`, organizationId: fx.org },
        })).id;
        const memberships = [
            ['formerFiler', 'MANAGER', 'REVOKED'],
            ['uploader', 'MANAGER', 'ACTIVE'],
            ['coMember', 'MANAGER', 'ACTIVE'],
            ['viewer', 'VIEWER', 'ACTIVE'],
            ['formerUploader', 'MANAGER', 'REVOKED'],
        ];
        for (const [key, role, status] of memberships) {
            await db.entityMembership.create({
                data: { userId: fx.users[key].id, entityId: fx.entity, role, status, organizationId: fx.org },
            });
        }
        fx.otherEntity = (await db.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัท อื่น ${sfx} จำกัด`, organizationId: fx.org },
        })).id;
        await db.entityMembership.create({
            data: { userId: fx.users.otherOwner.id, entityId: fx.otherEntity, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org },
        });
        fx.otherDraft = (await db.application.create({
            data: {
                applicationNumber: `APP-UA-O-${sfx}`, healthId: fx.users.otherOwner.canonicalId,
                submitterId: fx.users.otherOwner.id, entityId: fx.otherEntity, areaType: 'OUTDOOR',
                organizationId: fx.org, status: 'DRAFT',
                formData: { steps: {}, workflowState: 'DRAFT', applicantType: 'JURISTIC' },
            },
        })).id;

        fx.files.document = plant(`application-drafts/${Date.now()}-${crypto.randomUUID()}.pdf`);
        fx.files.formerUploadersDocument = plant(`application-drafts/${Date.now()}-${crypto.randomUUID()}.pdf`);
        fx.files.car = plant(`car/${Date.now()}-${crypto.randomUUID()}.jpg`);
        fx.files.certificate = plant(`gacp-certificates/TH-GACP-${crypto.randomInt(1e6)}-2569.pdf`);
        fx.files.labReport = plant(`lab-results/${Date.now()}-${crypto.randomUUID()}.pdf`);

        fx.application = (await db.application.create({
            data: {
                applicationNumber: `APP-UA-${sfx}`, healthId: fx.users.formerFiler.canonicalId,
                submitterId: fx.users.formerFiler.id, entityId: fx.entity, areaType: 'OUTDOOR',
                organizationId: fx.org, status: 'AUDIT_PASSED',
                reviewerId: fx.users.reviewer.id, auditorId: fx.users.inspector.id,
                formData: {
                    draftDocuments: [{ fileUrl: fx.files.document }, { fileUrl: fx.files.formerUploadersDocument }],
                    carDocuments: [{ path: fx.files.car, originalName: 'ภาพป้าย.jpg' }],
                },
            },
        })).id;
        await db.applicationDocument.create({
            data: { applicationId: fx.application, documentType: 'ID_CARD', fileUrl: fx.files.document, uploadedBy: fx.users.uploader.id },
        });
        await db.applicationDocument.create({
            data: { applicationId: fx.application, documentType: 'LAND_DOCUMENT', fileUrl: fx.files.formerUploadersDocument, uploadedBy: fx.users.formerUploader.id },
        });
        fx.checklist = (await db.auditChecklist.create({
            data: { applicationId: fx.application, templateName: 'GACP_CANNABIS', sections: [], auditorId: fx.users.inspector.id, organizationId: fx.org },
        })).id;
        fx.files.photo = plant(`audits/${fx.checklist}/${Date.now()}-plot.jpg`);
        await db.attachment.create({
            data: {
                resModel: 'FarmAuditPhoto', resId: fx.checklist, field: 'photo', fileName: 'plot.jpg',
                fileUrl: fx.files.photo, fileSize: 10, mimeType: 'image/jpeg', uploadedBy: fx.users.inspector.id,
                organizationId: fx.org,
            },
        });

        fx.files.deletedDocument = plant(`application-drafts/${Date.now()}-${crypto.randomUUID()}.pdf`);
        fx.files.deletedCar = plant(`car/${Date.now()}-${crypto.randomUUID()}.jpg`);
        fx.deletedApplication = (await db.application.create({
            data: {
                applicationNumber: `APP-UA-D-${sfx}`, healthId: fx.users.uploader.canonicalId,
                submitterId: fx.users.uploader.id, entityId: fx.entity, areaType: 'OUTDOOR',
                organizationId: fx.org, status: 'AUDIT_PASSED', isDeleted: true, deletedAt: new Date(),
                reviewerId: fx.users.reviewer.id, auditorId: fx.users.inspector.id,
                formData: {
                    draftDocuments: [{ fileUrl: fx.files.deletedDocument }],
                    carDocuments: [{ path: fx.files.deletedCar }],
                },
            },
        })).id;
        await db.applicationDocument.create({
            data: { applicationId: fx.deletedApplication, documentType: 'ID_CARD', fileUrl: fx.files.deletedDocument, uploadedBy: fx.users.uploader.id },
        });
        fx.deletedChecklist = (await db.auditChecklist.create({
            data: { applicationId: fx.deletedApplication, templateName: 'GACP_CANNABIS', sections: [], auditorId: fx.users.inspector.id, organizationId: fx.org },
        })).id;
        fx.files.deletedPhoto = plant(`audits/${fx.deletedChecklist}/${Date.now()}-plot.jpg`);
        await db.attachment.create({
            data: {
                resModel: 'FarmAuditPhoto', resId: fx.deletedChecklist, field: 'photo', fileName: 'plot.jpg',
                fileUrl: fx.files.deletedPhoto, fileSize: 10, mimeType: 'image/jpeg', uploadedBy: fx.users.inspector.id,
                organizationId: fx.org,
            },
        });

        app = require('../../server');
        await require('../../services/prisma-database').connect();
    }, 60000);

    afterAll(async () => {
        if (ORIGINAL_SCOPE === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = ORIGINAL_SCOPE; }
        for (const file of plantedFiles) { fs.rmSync(file, { force: true }); }
        for (const dir of createdDirs.reverse()) { fs.rmSync(dir, { recursive: true, force: true }); }
        const applications = [fx.application, fx.deletedApplication];
        await db.attachment.deleteMany({ where: { resId: { in: [fx.checklist, fx.deletedChecklist] } } }).catch(() => {});
        await db.auditChecklist.deleteMany({ where: { applicationId: { in: applications } } }).catch(() => {});
        await db.applicationDocument.deleteMany({ where: { applicationId: { in: applications } } }).catch(() => {});
        await db.application.deleteMany({ where: { id: { in: [...applications, fx.otherDraft] } } }).catch(() => {});
        await db.entityMembership.deleteMany({ where: { entityId: { in: [fx.entity, fx.otherEntity] } } }).catch(() => {});
        await db.entity.deleteMany({ where: { id: { in: [fx.entity, fx.otherEntity] } } }).catch(() => {});
        await db.user.deleteMany({ where: { id: { in: fx.ids.users } } }).catch(() => {});
        await db.organization.deleteMany({ where: { id: { in: [fx.org, fx.orgB] } } }).catch(() => {});
        await db.$disconnect();
    });

    const ALL = ['document', 'formerUploadersDocument', 'car', 'photo'];
    const OBJECTS = [...ALL, 'deletedDocument', 'deletedCar', 'deletedPhoto'];
    const APPLICANT_FILES = ['document', 'formerUploadersDocument', 'car'];
    const READS = {
        formerFiler: [],
        uploader: APPLICANT_FILES,
        coMember: APPLICANT_FILES,
        viewer: APPLICANT_FILES,
        formerUploader: [],
        stranger: [],
        otherOwner: [],
        reviewer: ALL,
        otherReviewer: [],
        inspector: ALL,
        otherInspector: [],
        approver: ALL,
        adminDtam: ALL,
        financeDtam: [],
        financePlatform: [],
        otherOrgAdmin: [],
    };

    const staticDoor = async (actor, object) => {
        const res = await raw(request(app).get(fx.files[object]).set('Authorization', `Bearer ${fx.tokens[actor]}`));
        const served = res.body.includes(STUB);
        if (res.status === 200 && served) { return 'read'; }
        if (res.status === 404 && !served) { return 'refused'; }
        return `${res.status}${served ? '+bytes' : ''}`;
    };
    const mintDoor = async (actor, object) => {
        const res = await request(app).post('/api/files/signed-url')
            .set('Authorization', `Bearer ${fx.tokens[actor]}`).send({ fileUrl: fx.files[object] });
        if (res.status === 200 && res.body?.data?.url) { return 'read'; }
        if (res.status === 404 && !res.body?.data) { return 'refused'; }
        return String(res.status);
    };
    const expected = () => Object.fromEntries(Object.entries(READS).map(([actor, readable]) => [
        actor, Object.fromEntries(OBJECTS.map((o) => [o, readable.includes(o) ? 'read' : 'refused'])),
    ]));
    const measure = async (door) => {
        const out = {};
        for (const actor of Object.keys(READS)) {
            out[actor] = {};
            for (const object of OBJECTS) { out[actor][object] = await door(actor, object); }
        }
        return out;
    };

    describe.each([
        ['tenant read scope on (default)', undefined],
        ['tenant read scope kill-switch off', 'false'],
    ])('%s', (_label, scope) => {
        beforeAll(() => {
            if (scope === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = scope; }
        });

        test('GET /uploads/<file> with a session: every actor gets exactly its read model', async () => {
            expect(await measure(staticDoor)).toEqual(expected());
        });

        test('POST /api/files/signed-url: the mint grants exactly what the session door grants', async () => {
            expect(await measure(mintDoor)).toEqual(expected());
        });
    });

    test('a link minted for a current co-member opens without a session; a former filer gets no link', async () => {
        const minted = await request(app).post('/api/files/signed-url')
            .set('Authorization', `Bearer ${fx.tokens.coMember}`).send({ fileUrl: fx.files.document });
        expect(minted.status).toBe(200);
        const opened = await raw(request(app).get(minted.body.data.url));
        expect([opened.status, opened.body.includes(STUB)]).toEqual([200, true]);

        const refused = await request(app).post('/api/files/signed-url')
            .set('Authorization', `Bearer ${fx.tokens.formerFiler}`).send({ fileUrl: fx.files.document });
        expect([refused.status, refused.body.data]).toEqual([404, undefined]);
    });

    test('the owner of another company cannot claim this application\'s CAR file through /prepare', async () => {
        const planted = await request(app).post('/api/applications/prepare')
            .set('Authorization', `Bearer ${fx.tokens.otherOwner}`)
            .send({ applicationId: fx.otherDraft, carDocuments: [{ path: fx.files.car }] });
        const draft = await db.application.findUnique({ where: { id: fx.otherDraft }, select: { formData: true } });
        expect({
            prepare: planted.status,
            stored: draft.formData.carDocuments ?? null,
            static: await staticDoor('otherOwner', 'car'),
            mint: await mintDoor('otherOwner', 'car'),
        }).toEqual({ prepare: 200, stored: null, static: 'refused', mint: 'refused' });
    });

    test('a staff caller whose organization is unknown reads nothing, even its own assignment', async () => {
        const { authorizeUploadsObject } = require('../../middleware/uploads-access');
        const reviewer = { id: fx.users.reviewer.id, role: 'document_reviewer', canonicalRole: 'document_reviewer' };
        const rel = (object) => fx.files[object].slice('/uploads/'.length);
        const decide = async (user) => Object.fromEntries(await Promise.all(ALL.map(
            async (o) => [o, (await authorizeUploadsObject(user, rel(o))).allowed],
        )));
        expect(await decide(reviewer)).toEqual({ document: false, formerUploadersDocument: false, car: false, photo: false });
        expect(await decide({ ...reviewer, organizationId: fx.org })).toEqual({ document: true, formerUploadersDocument: true, car: true, photo: true });
    });

    test('a stored certificate copy is served to nobody, the holder\'s members included', async () => {
        const anonymous = await raw(request(app).get(fx.files.certificate));
        expect([anonymous.status, anonymous.body.includes(STUB)]).toEqual([401, false]);
        for (const actor of ['uploader', 'coMember', 'adminDtam', 'approver']) {
            const res = await raw(request(app).get(fx.files.certificate).set('Authorization', `Bearer ${fx.tokens[actor]}`));
            expect([actor, res.status, res.body.includes(STUB)]).toEqual([actor, 404, false]);
        }
    });

    test('a lab report still opens without a session for the consumer trace page', async () => {
        const res = await raw(request(app).get(fx.files.labReport));
        expect([res.status, res.body.includes(STUB)]).toEqual([200, true]);
    });

    test('a symlink in lab-results/ to the stored certificate copy opens nothing', async () => {
        const link = path.join(UPLOADS, `lab-results/${crypto.randomUUID()}-link.pdf`);
        fs.symlinkSync(path.join(UPLOADS, fx.files.certificate.slice('/uploads/'.length)), link);
        plantedFiles.push(link);
        const res = await raw(request(app).get(`/uploads/lab-results/${path.basename(link)}`));
        expect([res.status, res.body.includes(STUB)]).toEqual([404, false]);
    });
});
