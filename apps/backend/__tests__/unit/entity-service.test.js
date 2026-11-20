// The organisation holder create path (company, partnership, community enterprise).
// The personal-INDIVIDUAL helper is covered by the auth-service tests and
// holder-record-real-postgres.test.js.

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        entity: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        entityMembership: {
            // M1.5 H1 — the create path READS the caller's membership on
            // an already-registered entity before deciding create vs refuse.
            findUnique: jest.fn(),
            create: jest.fn(),
            upsert: jest.fn(),
        },
    },
}));

// M1.5 H1 — the refusal path writes a best-effort ENTITY_CLAIM_REFUSED row.
// Stub the writer only; the real constants stay (pattern:
// applications-submit-capability-gate.test.js:76).
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

const { prisma } = require('../../services/prisma-database');
const entityService = require('../../services/entity-service');

const VALID_JURISTIC_TAX_ID = '0105561234560';
const SIGNATORY_ID = '3100600123450';
const user = { id: 'user-1', organizationId: 'org-1' };
const holder = (extra = {}) => ({
    legalName: 'ABC Co. Ltd.',
    signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: SIGNATORY_ID, nationality: 'ไทย' },
    contact: { address: '123 Main St', phone: '0812345678', email: '' },
    ...extra,
});

describe('entity-service.createOrganisationHolder', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('creates a company holder + OWNER membership with the holder record stored once', async () => {
        prisma.entity.findFirst.mockResolvedValue(null);
        prisma.entity.create.mockResolvedValue({ id: 'entity-1', type: 'JURISTIC' });
        prisma.entityMembership.upsert.mockResolvedValue({ id: 'membership-1', role: 'OWNER' });

        const out = await entityService.createOrganisationHolder({
            user, type: 'JURISTIC', registrationNo: VALID_JURISTIC_TAX_ID, holder: holder(),
        });

        expect(out.fresh).toBe(true);
        expect(prisma.entity.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: 'JURISTIC',
                displayName: 'ABC Co. Ltd.',
                juristicId: VALID_JURISTIC_TAX_ID,
                organizationId: 'org-1',
                createdBy: 'user-1',
                payload: {
                    holder: {
                        signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: SIGNATORY_ID, nationality: 'ไทย' },
                        contact: { address: '123 Main St', phone: '0812345678', email: '' },
                    },
                },
            }),
        });
        expect(prisma.entityMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId_entityId: { userId: 'user-1', entityId: 'entity-1' } },
        }));
    });

    it('a company number already registered as a partnership is the same holder, not a second one', async () => {
        prisma.entity.findFirst.mockResolvedValue({ id: 'entity-1', type: 'PARTNERSHIP' });
        prisma.entityMembership.findUnique.mockResolvedValue(null);

        await expect(entityService.createOrganisationHolder({
            user, type: 'JURISTIC', registrationNo: VALID_JURISTIC_TAX_ID, holder: holder(),
        })).rejects.toMatchObject({ status: 409, code: 'ENTITY_ALREADY_REGISTERED' });

        expect(prisma.entity.findFirst).toHaveBeenCalledWith({
            where: { type: { in: ['JURISTIC', 'PARTNERSHIP'] }, juristicIdHash: expect.any(String) },
        });
        expect(prisma.entity.create).not.toHaveBeenCalled();
    });

    it('reuses an existing holder for its real OWNER (idempotent) and does not call create', async () => {
        prisma.entity.findFirst.mockResolvedValue({ id: 'entity-1', type: 'JURISTIC' });
        prisma.entityMembership.findUnique.mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' });

        const out = await entityService.createOrganisationHolder({
            user, type: 'JURISTIC', registrationNo: VALID_JURISTIC_TAX_ID, holder: holder(),
        });

        expect(out.fresh).toBe(false);
        expect(prisma.entity.create).not.toHaveBeenCalled();
        expect(prisma.entityMembership.upsert).not.toHaveBeenCalled();
    });

    it('refuses a personal ID as a company number, naming the field', async () => {
        await expect(entityService.createOrganisationHolder({
            user, type: 'JURISTIC', registrationNo: '1100000000008', holder: holder(),
        })).rejects.toMatchObject({
            code: 'HOLDER_VALIDATION_FAILED',
            validationErrors: [expect.objectContaining({ path: 'registrationNo' })],
        });
        expect(prisma.entity.create).not.toHaveBeenCalled();
    });

    it('refuses a holder with no legal name', async () => {
        await expect(entityService.createOrganisationHolder({
            user, type: 'PARTNERSHIP', registrationNo: '0103555123458', holder: holder({ legalName: '' }),
        })).rejects.toMatchObject({
            code: 'HOLDER_VALIDATION_FAILED',
            validationErrors: [expect.objectContaining({ path: 'legalName' })],
        });
    });

    it('refuses an INDIVIDUAL: a person\'s holder is made at registration', async () => {
        await expect(entityService.createOrganisationHolder({
            user, type: 'INDIVIDUAL', registrationNo: SIGNATORY_ID, holder: {},
        })).rejects.toMatchObject({ code: 'INVALID_HOLDER_TYPE' });
    });

    it('rejects when user.id is missing', async () => {
        await expect(entityService.createOrganisationHolder({
            user: { organizationId: 'org-1' }, type: 'JURISTIC', registrationNo: VALID_JURISTIC_TAX_ID, holder: holder(),
        })).rejects.toThrow(/user\.id/);
    });

    it('rejects when organizationId is missing (ADR-014)', async () => {
        await expect(entityService.createOrganisationHolder({
            user: { id: 'user-1' }, type: 'JURISTIC', registrationNo: VALID_JURISTIC_TAX_ID, holder: holder(),
        })).rejects.toThrow(/organizationId/);
    });

    it('creates a community enterprise keyed on its registration code, with its house code', async () => {
        prisma.entity.findFirst.mockResolvedValue(null);
        prisma.entity.create.mockResolvedValue({ id: 'entity-2', type: 'COMMUNITY_ENTERPRISE' });
        prisma.entityMembership.upsert.mockResolvedValue({ id: 'membership-2', role: 'OWNER' });

        await entityService.createOrganisationHolder({
            user,
            type: 'COMMUNITY_ENTERPRISE',
            registrationNo: '12345678901',
            holder: holder({ legalName: 'วิสาหกิจชุมชนสมุนไพรบ้านสวน', houseCode: '50180-001' }),
        });

        expect(prisma.entity.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: 'COMMUNITY_ENTERPRISE',
                displayName: 'วิสาหกิจชุมชนสมุนไพรบ้านสวน',
                communityRegNo: '12345678901',
                payload: { holder: expect.objectContaining({ houseCode: '50180-001' }) },
            }),
        });
    });

    it('keys a community enterprise on its สวช.01 code as the paper prints it, trimmed (order 145)', async () => {
        prisma.entity.findFirst.mockResolvedValue(null);
        prisma.entity.create.mockResolvedValue({ id: 'entity-3', type: 'COMMUNITY_ENTERPRISE' });
        prisma.entityMembership.upsert.mockResolvedValue({ id: 'membership-3', role: 'OWNER' });
        await entityService.createOrganisationHolder({
            user, type: 'COMMUNITY_ENTERPRISE', registrationNo: ' 5-50-01-11/1-0123 ', holder: holder({ legalName: 'วิสาหกิจชุมชน ก', houseCode: '1' }),
        });
        expect(prisma.entity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ communityRegNo: '5-50-01-11/1-0123' }) });
    });

    it('refuses a community code with anything but digits, dashes and a slash', async () => {
        await expect(entityService.createOrganisationHolder({
            user, type: 'COMMUNITY_ENTERPRISE', registrationNo: 'สวช 0123', holder: holder(),
        })).rejects.toMatchObject({
            code: 'HOLDER_VALIDATION_FAILED',
            validationErrors: [expect.objectContaining({ path: 'registrationNo', message: expect.stringContaining('ตัวเลข') })],
        });
        expect(prisma.entity.create).not.toHaveBeenCalled();
    });
});

// M1.5 H1 — the `entity-service.ensureEntityFromApplicantData (dispatcher)`
// suite that stood here (4 cases: INDIVIDUAL → null, missing applicantType →
// null, JURISTIC dispatch, legacy "COMMUNITY" alias dispatch) is deleted with
// the helper it covered. That helper minted an org Entity out of a request-body
// registration number and made the caller its OWNER; spec §H1 removes it, and
// the pin below keeps the export from coming back.
describe('entity-service — the legacy applicantData dispatcher stays deleted (M1.5 H1)', () => {
    it('does not export ensureEntityFromApplicantData', () => {
        expect(entityService.ensureEntityFromApplicantData).toBeUndefined();
    });
});
