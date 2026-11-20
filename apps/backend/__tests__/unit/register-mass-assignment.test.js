'use strict';

/**
 * SECURITY regression (auth audit 2026-06-11): mass-assignment privilege
 * escalation on the PUBLIC /auth/health/register endpoint.
 *
 * healthRegisterSchema uses `.passthrough()`, so a client could smuggle
 * privileged columns (role, ministryVerified, accountTier, status, …) past
 * validation; registerHealthUser spread `...body` and register()'s
 * `_resolveIdentity` reads `userData.role`, so POST /auth/health/register
 * with {"role":"ADMIN"} created a PROVIDER/ADMIN account (ACTIVE if
 * ENABLE_OCR_BYPASS).
 */

const captured = { createData: null };

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        systemConfig: { findUnique: jest.fn().mockResolvedValue(null) }, // no OCR bypass row → env fallback (default off)
        organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-default' }) },
        user: { update: jest.fn() },
        $transaction: jest.fn(async (cb) => cb({
            user: {
                create: jest.fn(async ({ data }) => {
                    captured.createData = data;
                    return { id: 'user-1', status: data.status, healthId: data.healthId };
                }),
            },
        })),
    },
}));

jest.mock('../../services/entity-service', () => ({
    ensurePersonalIndividualEntity: jest.fn().mockResolvedValue({ id: 'entity-1' }),
}));

const { Prisma } = require('@prisma/client');
const authService = require('../../services/prisma-auth-service');
const { CANONICAL_ROLES, normalizeRole } = require('../../shared/canonical-rbac');

describe('registerHealthUser() — public endpoint cannot mass-assign privilege', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        captured.createData = null;
        delete process.env.ENABLE_OCR_BYPASS;
    });

    const baseBody = {
        identifier: '1234567890123',
        healthId: '1234567890123',
        firstName: 'mallory',
        lastName: 'attacker',
        phoneNumber: '0890000009',
        password: 'AttackPass123!',
        acceptedTermsOfService: true,
        acceptedPrivacyPolicy: true,
    };

    it.each(Object.values(CANONICAL_ROLES).filter((role) => role !== CANONICAL_ROLES.HEALTH))(
        'ignores a smuggled role=%s: the account is HEALTH, not staff', async (role) => {
            expect(normalizeRole(role)).toBe(role);
            const res = await authService.registerHealthUser({ ...baseBody, role });

            expect(res.status).toBe(201);
            expect(captured.createData).toMatchObject({
                role: CANONICAL_ROLES.HEALTH,
                accountType: 'INDIVIDUAL',
                healthId: '1234567890123',
                providerId: null,
            });
        },
    );

    it('ignores smuggled ministryVerified / accountTier / status / verificationStatus', async () => {
        await authService.registerHealthUser({
            ...baseBody,
            ministryVerified: true,
            accountTier: 'PREMIUM',
            status: 'ACTIVE',
            verificationStatus: 'VERIFIED',
            organizationId: 'attacker-org',
        });

        const d = captured.createData;
        // ministryVerified/accountTier are not set by the client (undefined or schema default — never the smuggled true/PREMIUM)
        expect(d.ministryVerified).not.toBe(true);
        expect(d.accountTier).not.toBe('PREMIUM');
        // status is server-derived (OCR bypass off → PENDING_VERIFICATION), never the client's ACTIVE
        expect(d.status).toBe('PENDING_VERIFICATION');
        // organization is the default tenant, not the attacker's
        expect(d.organizationId).toBe('org-default');
    });

    const FORM_FIELDS = ['firstName', 'lastName', 'phoneNumber', 'email', 'password', 'healthId', 'idCard'];
    const notOnTheForm = Prisma.dmmf.datamodel.models.find((model) => model.name === 'User').fields
        .filter((field) => !FORM_FIELDS.includes(field.name));
    const smuggledBody = Object.fromEntries(notOnTheForm.map((field) => [
        field.name, field.kind === 'object' ? { create: [{}] } : `smuggled-${field.name}`,
    ]));
    const keptFromBody = (data) => Object.keys(smuggledBody)
        .filter((key) => JSON.stringify(data[key]) === JSON.stringify(smuggledBody[key]));

    it('keeps no User column or relation from the body beyond the form fields', async () => {
        const res = await authService.registerHealthUser({ ...baseBody, ...smuggledBody });
        expect([res.status, keptFromBody(captured.createData)]).toEqual([201, []]);
    });

    it('register() writes no column its caller passes beyond the applicant fields', async () => {
        const { providerId: _identity, ...columns } = smuggledBody;
        await authService.register({ ...baseBody, ...columns });
        expect(keptFromBody(captured.createData)).toEqual([]);
    });

    it('still creates a normal HEALTH applicant from a clean body', async () => {
        const res = await authService.registerHealthUser({ ...baseBody });
        expect(res.status).toBe(201);
        expect(captured.createData).toMatchObject({
            firstName: 'mallory',
            lastName: 'attacker',
            role: CANONICAL_ROLES.HEALTH,
            accountType: 'INDIVIDUAL',
            healthId: '1234567890123',
            organizationId: 'org-default',
        });
    });
});
