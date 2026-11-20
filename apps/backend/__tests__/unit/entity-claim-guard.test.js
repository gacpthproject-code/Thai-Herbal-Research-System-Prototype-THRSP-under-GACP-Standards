// M1.5 H1 — a company tax ID / DOAE registration number is PUBLIC data. It must
// not double as the key to a workspace someone else already owns.
// Spec: docs/superpowers/specs/2026-08-15-m1.5-hardening-design.md §H1.
//
// Two halves:
//   (a) service — createOrganisationHolder driven with an
//       injected `tx` client, so every membership write is observable.
//   (b) HTTP — POST /api/entities must SURFACE the refusal as 409. Before this
//       wave the route's catch mapped only two 400 codes and everything else
//       fell through to 500, so the front end could never see the conflict.

const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
    const passUser = (req, _res, next) => {
        req.user = {
            id: 'user-stranger',
            healthId: '1100000000008',
            organizationId: 'org-1',
            canonicalRole: 'health',
            role: 'HEALTH_USER',
        };
        next();
    };
    return { authenticateHealth: passUser, authenticateAny: passUser };
});

jest.mock('../../services/prisma-database', () => {
    const mockPrisma = {
        entity: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        entityMembership: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
        },
    };
    mockPrisma.$transaction = jest.fn(async (fn) => fn(mockPrisma));
    return { prisma: mockPrisma };
});

// Pattern: applications-submit-capability-gate.test.js:76 — keep every real
// constant (AuditCategory / AuditSeverity / ResourceType) so the modules that
// share this file still resolve them; stub only the writer.
jest.mock('../../middleware/audit-logger', () => {
    const actual = jest.requireActual('../../middleware/audit-logger');
    return {
        ...actual,
        auditLogger: {
            log: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            logWithin: jest.fn(() => jest.fn()),
        },
    };
});

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const { prisma: client } = require('../../services/prisma-database');
const { auditLogger } = require('../../middleware/audit-logger');
const entityService = require('../../services/entity-service');
const entitiesRouter = require('../../routes/api/entities/index');

const { createOrganisationHolder } = entityService;

const VALID_TAX_ID = '0105561234560';
const VALID_REG_NO = '12345678901';

const HOLDER_CONTACT = Object.freeze({ address: '123 Main St', phone: '0812345678', email: '' });
const HOLDER_SIGNATORY = Object.freeze({ title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '3100600123450', nationality: 'ไทย' });

const VALID_JURISTIC = Object.freeze({
    type: 'JURISTIC',
    registrationNo: VALID_TAX_ID,
    holder: { legalName: 'ABC Co. Ltd.', signatory: HOLDER_SIGNATORY, contact: HOLDER_CONTACT },
});

const VALID_COMMUNITY = Object.freeze({
    type: 'COMMUNITY_ENTERPRISE',
    registrationNo: VALID_REG_NO,
    holder: { legalName: 'วิสาหกิจชุมชนสมุนไพรบ้านสวน', signatory: HOLDER_SIGNATORY, houseCode: '50180-001', contact: HOLDER_CONTACT },
});

const stranger = Object.freeze({ id: 'user-stranger', organizationId: 'org-1' });
const invitee = Object.freeze({ id: 'user-invitee', organizationId: 'org-1' });
const member = Object.freeze({ id: 'user-member', organizationId: 'org-1' });
const owner = Object.freeze({ id: 'user-owner', organizationId: 'org-1' });
const founder = Object.freeze({ id: 'user-founder', organizationId: 'org-1' });

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/entities', entitiesRouter);
    return app;
}

function firstAuditEnvelope() {
    return auditLogger.log.mock.calls[0]?.[0];
}

describe('M1.5 H1 — an existing org workspace cannot be claimed by its registration number', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        client.entity.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ent-new', ...data }));
        client.entityMembership.create.mockResolvedValue({ id: 'mem-new', role: 'OWNER' });
        client.entityMembership.upsert.mockResolvedValue({ id: 'mem-new', role: 'OWNER' });
        auditLogger.log.mockResolvedValue({ id: 'audit-1' });
    });

    it('stranger → 409 ENTITY_ALREADY_REGISTERED, NO membership write, audit row with membershipStatus:null', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-1', type: 'JURISTIC' });
        client.entityMembership.findUnique.mockResolvedValue(null);

        await expect(createOrganisationHolder({ user: stranger, ...VALID_JURISTIC, tx: client }))
            .rejects.toMatchObject({ status: 409, code: 'ENTITY_ALREADY_REGISTERED' });

        expect(client.entityMembership.upsert).not.toHaveBeenCalled();
        expect(client.entityMembership.create).not.toHaveBeenCalled();
        expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({
            action: 'ENTITY_CLAIM_REFUSED',
            result: 'FAILURE',
            metadata: expect.objectContaining({ membershipStatus: null }),
        }));
    });

    it('the refusal audit row carries a HASH, never the raw registration number', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-1', type: 'JURISTIC' });
        client.entityMembership.findUnique.mockResolvedValue(null);

        await expect(createOrganisationHolder({ user: stranger, ...VALID_JURISTIC, tx: client }))
            .rejects.toMatchObject({ code: 'ENTITY_ALREADY_REGISTERED' });

        const envelope = firstAuditEnvelope();
        expect(envelope.metadata).toEqual(expect.objectContaining({
            registrationHash: expect.any(String),
            entityType: 'JURISTIC',
            membershipStatus: null,
            role: null,
        }));
        expect(JSON.stringify(envelope)).not.toContain(VALID_TAX_ID);
    });

    it('PENDING invitee → 409 with the "accept your invitation" message', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-1', type: 'JURISTIC' });
        client.entityMembership.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'PENDING' });

        await expect(createOrganisationHolder({ user: invitee, ...VALID_JURISTIC, tx: client }))
            .rejects.toMatchObject({ status: 409, message: expect.stringContaining('คำเชิญ') });
        expect(client.entityMembership.upsert).not.toHaveBeenCalled();
        expect(client.entityMembership.create).not.toHaveBeenCalled();
    });

    it('ACTIVE non-OWNER → 409 telling them they are already a member, and NO silent upgrade to OWNER', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-1', type: 'JURISTIC' });
        client.entityMembership.findUnique.mockResolvedValue({ role: 'MANAGER', status: 'ACTIVE' });

        await expect(createOrganisationHolder({ user: member, ...VALID_JURISTIC, tx: client }))
            .rejects.toMatchObject({ status: 409, message: expect.stringContaining('ไม่ต้องลงทะเบียนใหม่') });
        expect(client.entityMembership.upsert).not.toHaveBeenCalled();
        expect(client.entityMembership.create).not.toHaveBeenCalled();
        expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({
            action: 'ENTITY_CLAIM_REFUSED',
            metadata: expect.objectContaining({ membershipStatus: 'ACTIVE', role: 'MANAGER' }),
        }));
    });

    it('an OWNER row that is NOT ACTIVE (REVOKED ex-owner / PENDING invite) → 409, NO write (M1.5 audit MEDIUM-1 pin)', async () => {
        for (const status of ['REVOKED', 'PENDING']) {
            client.entityMembership.upsert.mockClear();
            client.entityMembership.create.mockClear();
            client.entity.findFirst.mockResolvedValue({ id: 'ent-1', type: 'JURISTIC' });
            client.entityMembership.findUnique.mockResolvedValue({ role: 'OWNER', status });

            await expect(createOrganisationHolder({ user: stranger, ...VALID_JURISTIC, tx: client }))
                .rejects.toMatchObject({ status: 409, code: 'ENTITY_ALREADY_REGISTERED' });
            expect(client.entityMembership.upsert).not.toHaveBeenCalled();
            expect(client.entityMembership.create).not.toHaveBeenCalled();
        }
    });

    it('the real OWNER retrying → idempotent success, NO write', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-1', type: 'JURISTIC' });
        client.entityMembership.findUnique.mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' });

        const out = await createOrganisationHolder({ user: owner, ...VALID_JURISTIC, tx: client });

        expect(out.fresh).toBe(false);
        expect(out.entity).toMatchObject({ id: 'ent-1' });
        expect(out.membership).toMatchObject({ role: 'OWNER', status: 'ACTIVE' });
        expect(client.entityMembership.upsert).not.toHaveBeenCalled();
        expect(client.entityMembership.create).not.toHaveBeenCalled();
        expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('a brand-new registration number → create entity + OWNER membership (unchanged)', async () => {
        client.entity.findFirst.mockResolvedValue(null);

        const out = await createOrganisationHolder({ user: founder, ...VALID_JURISTIC, tx: client });

        expect(out.fresh).toBe(true);
        expect(client.entity.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ type: 'JURISTIC', juristicId: VALID_TAX_ID, createdBy: 'user-founder' }),
        });
        expect(out.membership).toMatchObject({ role: 'OWNER' });
        expect(auditLogger.log).not.toHaveBeenCalled();
    });
});

describe('M1.5 H1 — the same guard for a community enterprise', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        client.entity.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ent-new', ...data }));
        client.entityMembership.create.mockResolvedValue({ id: 'mem-new', role: 'OWNER' });
        client.entityMembership.upsert.mockResolvedValue({ id: 'mem-new', role: 'OWNER' });
        auditLogger.log.mockResolvedValue({ id: 'audit-1' });
    });

    it('stranger → 409 ENTITY_ALREADY_REGISTERED, NO membership write, audit row', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-2', type: 'COMMUNITY_ENTERPRISE' });
        client.entityMembership.findUnique.mockResolvedValue(null);

        await expect(createOrganisationHolder({ user: stranger, ...VALID_COMMUNITY, tx: client }))
            .rejects.toMatchObject({ status: 409, code: 'ENTITY_ALREADY_REGISTERED' });

        expect(client.entityMembership.upsert).not.toHaveBeenCalled();
        expect(client.entityMembership.create).not.toHaveBeenCalled();
        const envelope = firstAuditEnvelope();
        expect(envelope).toMatchObject({ action: 'ENTITY_CLAIM_REFUSED', result: 'FAILURE' });
        expect(envelope.metadata).toEqual(expect.objectContaining({
            entityType: 'COMMUNITY_ENTERPRISE',
            membershipStatus: null,
            role: null,
        }));
        expect(JSON.stringify(envelope)).not.toContain(VALID_REG_NO);
    });

    it('PENDING invitee → 409 with the "accept your invitation" message', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-2', type: 'COMMUNITY_ENTERPRISE' });
        client.entityMembership.findUnique.mockResolvedValue({ role: 'VIEWER', status: 'PENDING' });

        await expect(createOrganisationHolder({ user: invitee, ...VALID_COMMUNITY, tx: client }))
            .rejects.toMatchObject({ status: 409, message: expect.stringContaining('คำเชิญ') });
    });

    it('the real OWNER retrying → idempotent success, NO write', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-2', type: 'COMMUNITY_ENTERPRISE' });
        client.entityMembership.findUnique.mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' });

        const out = await createOrganisationHolder({ user: owner, ...VALID_COMMUNITY, tx: client });

        expect(out.fresh).toBe(false);
        expect(client.entityMembership.upsert).not.toHaveBeenCalled();
        expect(client.entityMembership.create).not.toHaveBeenCalled();
    });

    it('a brand-new DOAE number → create entity + OWNER membership (unchanged)', async () => {
        client.entity.findFirst.mockResolvedValue(null);

        const out = await createOrganisationHolder({ user: founder, ...VALID_COMMUNITY, tx: client });

        expect(out.fresh).toBe(true);
        expect(client.entity.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ type: 'COMMUNITY_ENTERPRISE', communityRegNo: VALID_REG_NO }),
        });
    });
});

describe('M1.5 H1 — POST /api/entities surfaces the refusal as 409, not 500', () => {
    let app;
    beforeAll(() => { app = makeApp(); });

    beforeEach(() => {
        jest.clearAllMocks();
        client.entity.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ent-new', ...data }));
        client.entityMembership.create.mockResolvedValue({ id: 'mem-new', role: 'OWNER' });
        client.entityMembership.upsert.mockResolvedValue({ id: 'mem-new', role: 'OWNER' });
        auditLogger.log.mockResolvedValue({ id: 'audit-1' });
    });

    it('someone else already registered the tax ID → HTTP 409 + code, no membership write', async () => {
        client.entity.findFirst.mockResolvedValue({ id: 'ent-1', type: 'JURISTIC' });
        client.entityMembership.findUnique.mockResolvedValue(null);

        const r = await request(app).post('/api/entities').send(VALID_JURISTIC);

        expect(r.status).toBe(409);
        expect(r.body).toMatchObject({ success: false, code: 'ENTITY_ALREADY_REGISTERED' });
        expect(typeof r.body.error).toBe('string');
        expect(r.body.error).not.toContain(VALID_TAX_ID);
        expect(client.entityMembership.upsert).not.toHaveBeenCalled();
        expect(client.entityMembership.create).not.toHaveBeenCalled();
    });

    it('a free registration number still creates the workspace (200)', async () => {
        client.entity.findFirst.mockResolvedValue(null);

        const r = await request(app).post('/api/entities').send(VALID_JURISTIC);

        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ type: 'JURISTIC', role: 'OWNER' });
    });
});
