'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { filedFormData } = require('../../test-support/filed-application');
const { syncApplicationDocument } = require('../../services/application-document-sync');
const { deriveDimensions } = require('../../services/application-requirements-service');

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

// Canonical v2 กทล.1 slot ids (packages/validation/src/upload-rules.js folds the old
// spellings onto them, and the door answers in canonical ids).
const FILED_SLOTS = ['land_rights', 'sop_manual', 'juristic_reg_6m'];
const UNFILED_SLOT = 'site_map_coords';

d('ผู้ตรวจพื้นที่อ่านเอกสารประกอบของคำขอที่ได้รับมอบหมาย (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], ruleIds: [] };
    let seq = 0;

    async function person(role, accountType = 'PROVIDER') {
        const id = crypto.randomUUID();
        seq += 1;
        const key = `doc-${seq}-${sfx}`;
        const health = accountType === 'HEALTH';
        await raw.user.create({
            data: {
                id, canonicalId: key, healthId: health ? key : null, password: 'x', role,
                authType: health ? 'EMAIL_LEGACY' : 'PROVIDER_ID', providerId: health ? null : key,
                email: `${key}@example.test`, firstName: 'คน', lastName: role, organizationId: fx.org, status: 'ACTIVE',
                ...(health ? {} : { accountType: 'PROVIDER' }),
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId: fx.org, canonicalId: key };
    }

    const as = (actor) => { mockActor.current = { ...actor }; };
    const documentsDoor = (id, actor) => {
        as(actor);
        return request(app).get(`/api/provider/applications/${id}/documents`);
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `doc-${sfx}`, slug: `doc-${sfx}`, code: `DOC_${sfx}`.toUpperCase() } });
        fx.org = org.id;
        fx.orgIds.push(org.id);
        fx.inspector = await person('field_inspector');
        fx.otherInspector = await person('field_inspector');
        fx.reviewer = await person('document_reviewer');
        fx.dtamAdmin = await person('system_admin_dtam');
        fx.applicant = await person('health', 'HEALTH');
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท เอกสาร ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.entity);

        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-DOC-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.entity, submitterId: fx.applicant.id, status: 'AUDIT_CONFIRMED',
                auditorId: fx.inspector.id, reviewerId: fx.reviewer.id, certificationPurposes: ['EXPORT'],
                scheduledDate: new Date(), formData: filedFormData({ workflowState: 'AUDIT_CONFIRMED' }),
            },
        });
        fx.appIds.push(row.id);
        fx.applicationId = row.id;
        const { plantCode } = deriveDimensions(row);
        for (const slotId of [...FILED_SLOTS, UNFILED_SLOT]) {
            const rule = await raw.requirementRule.create({
                data: {
                    plantCode, slotId, isRequired: true, effectiveFrom: new Date('2020-01-01'),
                    createdBy: fx.dtamAdmin.id, reason: 'fixture: the papers this filing owes',
                },
            });
            fx.ruleIds.push(rule.id);
        }
        for (const slotId of FILED_SLOTS) {
            await syncApplicationDocument(raw, {
                applicationId: row.id, documentId: crypto.randomUUID(), slotId,
                fileName: `${slotId}.pdf`, fileUrl: `/uploads/application-drafts/doc-${sfx}-${slotId}.pdf`,
                mimeType: 'application/pdf', uploadedBy: fx.applicant.id,
            });
        }

        app = express();
        app.use(express.json());
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        await wipe('applicationDocument', { applicationId: { in: fx.appIds } });
        await wipe('requirementRule', { id: { in: fx.ruleIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await raw.$disconnect();
    });

    test('the assigned inspector gets every slot of the filing, with the file behind each filed one', async () => {
        const res = await documentsDoor(fx.applicationId, fx.inspector);
        expect(res.status).toBe(200);
        const slots = res.body.data.slots;
        const bySlot = new Map(slots.map((s) => [s.slotId, s]));
        for (const slotId of FILED_SLOTS) {
            expect(bySlot.get(slotId)).toEqual(expect.objectContaining({
                labelTH: expect.any(String), satisfied: true,
                fileUrl: `/uploads/application-drafts/doc-${sfx}-${slotId}.pdf`, fileName: `${slotId}.pdf`,
            }));
        }
        expect(bySlot.get(UNFILED_SLOT)).toEqual(expect.objectContaining({ required: true, satisfied: false, fileUrl: null, fileName: null }));
        for (const slot of slots) {
            expect(Object.keys(slot).sort()).toEqual(['fileName', 'fileUrl', 'labelTH', 'required', 'satisfied', 'slotId']);
        }
    });

    test('an inspector the file is not assigned to gets 404', async () => {
        expect((await documentsDoor(fx.applicationId, fx.otherInspector)).status).toBe(404);
    });

    test('the DTAM admin reads it; the document reviewer keeps its own door', async () => {
        expect((await documentsDoor(fx.applicationId, fx.dtamAdmin)).status).toBe(200);
        expect((await documentsDoor(fx.applicationId, fx.reviewer)).status).toBe(403);
    });
});
