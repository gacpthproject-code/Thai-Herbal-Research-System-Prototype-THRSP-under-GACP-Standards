// M1.5 H2 — the workspace read surface must not hand out national IDs.
// Spec: docs/superpowers/specs/2026-08-15-m1.5-hardening-design.md §H2.
//
// `Entity.thaiCitizenId` is encrypted at rest and DECRYPTED on read by the PDPA
// extension, and the holder record (payload.holder) carries a signatory's national ID.
// Every member of the workspace reads GET /api/entities/:id, VIEWER included, so both are
// masked at the service boundary for EVERY role including OWNER, the same convention as
// the members listing (__tests__/unit/entity-members-national-id-masking.test.js).
//
// `shapeEntityResponse` is shared by POST /, GET /:id and PUT /:id/holder, so masking
// there covers all three on purpose: the echo of a create or a write is masked too.

'use strict';

const express = require('express');
const request = require('supertest');

// The caller is always the same user; the ROLE under test comes from the
// membership row the entity lookup returns (pattern: entity-claim-guard.test.js:15).
jest.mock('../../middleware/auth-middleware', () => {
    const passUser = (req, _res, next) => {
        req.user = {
            id: 'user-caller',
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

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const { prisma: client } = require('../../services/prisma-database');
const entityService = require('../../services/entity-service');
const entitiesRouter = require('../../routes/api/entities/index');

// Same fixtures as entity-members-national-id-masking.test.js:54-55.
const OWNER_ID = '1100000000008';
const DIRECTOR_ID = '3100600123450';
const MASKED_OWNER_ID = '1-XXXX-XXXX-X-0008';
const MASKED_DIRECTOR_ID = '3-XXXX-XXXX-X-3450';

const ENTITY_UUID = '11111111-1111-4111-8111-111111111111';

function juristicEntity(overrides = {}) {
    return {
        id: ENTITY_UUID,
        type: 'JURISTIC',
        slug: 'abc-co-ltd',
        displayName: 'ABC Co. Ltd.',
        status: 'ACTIVE',
        organizationId: 'org-1',
        isDeleted: false,
        juristicId: '0105561234560',
        communityRegNo: null,
        thaiCitizenId: OWNER_ID,
        payload: {
            holder: {
                signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: DIRECTOR_ID, nationality: 'ไทย' },
                contact: { address: '123 Main St', phone: '0810000000', email: 'hr@example.com' },
            },
        },
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-02-01'),
        ...overrides,
    };
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/entities', entitiesRouter);
    return app;
}

describe('M1.5 H2 — presentEntityForMember masks both national-ID carriers', () => {
    it('masks thaiCitizenId and the holder signatory\'s ID for EVERY role including OWNER; the raw payload never leaves', () => {
        const out = entityService.presentEntityForMember(juristicEntity());

        expect(out.thaiCitizenId).toBe(MASKED_OWNER_ID);
        expect(out.holder.signatory.idCard).toBe(MASKED_DIRECTOR_ID);
        expect(out.payload).toBeUndefined();
        // The rest of the holder is what the screen needs, untouched.
        expect(out.holder.signatory.firstName).toBe('สมชาย');
        expect(out.holder.contact.address).toBe('123 Main St');
        expect(JSON.stringify(out)).not.toContain(DIRECTOR_ID);
    });

    it('survives an INDIVIDUAL with no payload', () => {
        const out = entityService.presentEntityForMember({ id: 'e2', type: 'INDIVIDUAL', displayName: 'สมชาย ใจดี', thaiCitizenId: null, payload: null });
        expect(out.thaiCitizenId).toBeNull();
        expect(out.holder).toMatchObject({ type: 'INDIVIDUAL', legalName: 'สมชาย ใจดี', complete: false });
    });

    it('does not mutate the row it was handed (the caller may still hold the Prisma object)', () => {
        const row = juristicEntity();
        entityService.presentEntityForMember(row);

        expect(row.thaiCitizenId).toBe(OWNER_ID);
        expect(row.payload.holder.signatory.idCard).toBe(DIRECTOR_ID);
    });
});

describe('M1.5 H2 — GET /api/entities/:id masks for every role', () => {
    let app;
    beforeAll(() => { app = makeApp(); });
    beforeEach(() => jest.clearAllMocks());

    it.each(['VIEWER', 'MANAGER', 'ADMIN', 'OWNER'])('role %s receives masked national IDs', async (role) => {
        client.entity.findFirst.mockResolvedValue({
            ...juristicEntity(),
            members: [{ role, permissions: [], status: 'ACTIVE' }],
        });

        const r = await request(app).get(`/api/entities/${ENTITY_UUID}`);

        expect(r.status).toBe(200);
        expect(r.body.data.role).toBe(role);
        expect(r.body.data.thaiCitizenId).toBe(MASKED_OWNER_ID);
        expect(r.body.data.holder.signatory.idCard).toBe(MASKED_DIRECTOR_ID);
        // Nothing anywhere in the response carries a raw 13-digit ID.
        expect(JSON.stringify(r.body)).not.toContain(OWNER_ID);
        expect(JSON.stringify(r.body)).not.toContain(DIRECTOR_ID);
        // The holder data the screen actually needs is still there.
        expect(r.body.data.displayName).toBe('ABC Co. Ltd.');
        expect(r.body.data.holder.signatory.firstName).toBe('สมชาย');
    });

    it('an INDIVIDUAL entity with a null payload still answers 200', async () => {
        client.entity.findFirst.mockResolvedValue({
            id: ENTITY_UUID, type: 'INDIVIDUAL', slug: 'me', displayName: 'สมชาย ใจดี',
            status: 'ACTIVE', organizationId: 'org-1', juristicId: null, communityRegNo: null,
            thaiCitizenId: OWNER_ID, payload: null,
            createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
            members: [{ role: 'OWNER', permissions: [], status: 'ACTIVE' }],
        });

        const r = await request(app).get(`/api/entities/${ENTITY_UUID}`);

        expect(r.status).toBe(200);
        expect(r.body.data.payload).toBeUndefined();
        expect(r.body.data.holder.type).toBe('INDIVIDUAL');
        expect(r.body.data.thaiCitizenId).toBe(MASKED_OWNER_ID);
        expect(JSON.stringify(r.body)).not.toContain(OWNER_ID);
    });
});

describe('M1.5 H2 — the create / update echoes are masked too (same helper, three endpoints)', () => {
    let app;
    beforeAll(() => { app = makeApp(); });
    beforeEach(() => jest.clearAllMocks());

    it('PUT /api/entities/:id/holder echoes the updated row masked', async () => {
        client.entity.findFirst.mockResolvedValue({
            ...juristicEntity(),
            members: [{ role: 'OWNER', permissions: [], status: 'ACTIVE' }],
        });
        client.entity.update.mockResolvedValue(juristicEntity());

        const r = await request(app)
            .put(`/api/entities/${ENTITY_UUID}/holder`)
            .send({
                legalName: 'ABC Co. Ltd.',
                signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: DIRECTOR_ID, nationality: 'ไทย' },
                contact: { address: '123 Main St', phone: '0810000000', email: '' },
            });

        expect(r.status).toBe(200);
        expect(r.body.data.thaiCitizenId).toBe(MASKED_OWNER_ID);
        expect(r.body.data.holder.signatory.idCard).toBe(MASKED_DIRECTOR_ID);
        expect(JSON.stringify(r.body)).not.toContain(DIRECTOR_ID);
    });

    it('PATCH /api/entities/:id is gone: the holder is written only through the holder page\'s validated door', async () => {
        const r = await request(app).patch(`/api/entities/${ENTITY_UUID}`).send({ payload: { anything: true } });
        expect(r.status).toBe(404);
        expect(client.entity.update).not.toHaveBeenCalled();
    });

    it('POST /api/entities echoes the created workspace masked', async () => {
        client.entity.findFirst.mockResolvedValue(null);
        client.entity.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ent-new', ...data }));
        client.entityMembership.upsert.mockResolvedValue({ id: 'mem-new', role: 'OWNER', status: 'ACTIVE' });

        const r = await request(app).post('/api/entities').send({
            type: 'JURISTIC',
            registrationNo: '0105561234560',
            holder: {
                legalName: 'ABC Co. Ltd.',
                signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: DIRECTOR_ID, nationality: 'ไทย' },
                contact: { address: '123 Main St', phone: '0810000000', email: '' },
            },
        });

        expect(r.status).toBe(200);
        expect(r.body.data.holder.signatory.idCard).toBe(MASKED_DIRECTOR_ID);
        expect(JSON.stringify(r.body)).not.toContain(DIRECTOR_ID);
        // The create path is unchanged otherwise.
        expect(r.body.data).toMatchObject({ type: 'JURISTIC', role: 'OWNER' });
    });
});
