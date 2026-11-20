'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

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

d('ประตู context ของผู้ตรวจพื้นที่บอกชื่อผู้ถือ (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], auditIds: [] };
    let seq = 0;

    async function person(role, accountType = 'PROVIDER') {
        const id = crypto.randomUUID();
        seq += 1;
        const key = `ctx-${seq}-${sfx}`;
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

    async function filing({ entityId, entityType, applicantData }) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-CTX-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId, submitterId: fx.applicant.id, status: 'AUDIT_CONFIRMED',
                auditorId: fx.inspector.id, certificationPurposes: ['RESEARCH'], scheduledDate: new Date(),
                formData: { workflowState: 'AUDIT_CONFIRMED', applicantType: entityType, applicantData },
            },
        });
        fx.appIds.push(row.id);
        const audit = await raw.auditChecklist.create({
            data: {
                applicationId: row.id, templateName: 'GACP_GENERAL', sections: [],
                auditorId: fx.inspector.id, organizationId: fx.org, status: 'IN_PROGRESS',
            },
        });
        fx.auditIds.push(audit.id);
        return { applicationId: row.id, auditId: audit.id };
    }

    const as = (actor) => { mockActor.current = { ...actor }; };
    const byApplication = (id, actor = fx.inspector) => {
        as(actor);
        return request(app).get(`/api/audit/onsite/application/${id}/context`);
    };
    const byAudit = (auditId, actor = fx.inspector) => {
        as(actor);
        return request(app).get(`/api/audit/onsite/${auditId}/context`);
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `ctx-${sfx}`, slug: `ctx-${sfx}`, code: `CTX_${sfx}`.toUpperCase() } });
        fx.org = org.id;
        fx.orgIds.push(org.id);
        fx.inspector = await person('field_inspector');
        fx.applicant = await person('health', 'HEALTH');
        fx.company = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท ผู้ถือ ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.company);
        fx.gone = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท ที่ลบแล้ว ${sfx} จำกัด`, organizationId: fx.org, isDeleted: true } })).id;
        fx.entityIds.push(fx.gone);

        app = express();
        app.use(express.json());
        app.use('/api/audit/onsite', require('../../routes/api/audit/onsite'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        await wipe('gpsVerificationLog', { entityId: { in: fx.auditIds } });
        await wipe('auditChecklist', { id: { in: fx.auditIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await raw.$disconnect();
    });

    test('a juristic filing names the holder company on both doors', async () => {
        const { applicationId, auditId } = await filing({
            entityId: fx.company, entityType: 'JURISTIC',
            applicantData: { companyName: `บริษัท ผู้ถือ ${sfx} จำกัด`, taxId: '0105560000001' },
        });
        const a = await byApplication(applicationId);
        expect(a.status).toBe(200);
        expect(a.body.data.audit.applicantName).toBe(`บริษัท ผู้ถือ ${sfx} จำกัด`);
        const b = await byAudit(auditId);
        expect(b.status).toBe(200);
        expect(b.body.data.audit.applicantName).toBe(`บริษัท ผู้ถือ ${sfx} จำกัด`);
    });

    test('a deleted holder falls back to the company name on the filing', async () => {
        const { applicationId } = await filing({
            entityId: fx.gone, entityType: 'JURISTIC',
            applicantData: { companyName: 'ห้างหุ้นส่วน ตามแบบ' },
        });
        const res = await byApplication(applicationId);
        expect(res.body.data.audit.applicantName).toBe('ห้างหุ้นส่วน ตามแบบ');
    });

    test('control: with no live holder and no company name, first and last name still compose', async () => {
        const { applicationId } = await filing({
            entityId: fx.gone, entityType: 'INDIVIDUAL',
            applicantData: { firstName: 'สมหญิง', lastName: 'ใจดี' },
        });
        const res = await byApplication(applicationId);
        expect(res.body.data.audit.applicantName).toBe('สมหญิง ใจดี');
    });
});
