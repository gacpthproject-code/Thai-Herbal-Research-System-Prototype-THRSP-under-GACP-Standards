'use strict';

const { dropConsentRows } = require('../../test-support/consent-history');
const crypto = require('crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { healthRegisterSchema } = require('../../shared/schemas/auth-schemas');
const authService = require('../../services/prisma-auth-service');

const FORM_FIELDS = ['firstName', 'lastName', 'phoneNumber', 'email', 'password', 'healthId', 'idCard'];
const USER_COLUMNS = Prisma.dmmf.datamodel.models
    .find((model) => model.name === 'User')
    .fields.filter((field) => field.kind === 'scalar' && !FORM_FIELDS.includes(field.name));

function syntheticThaiId() {
    const digits = [1 + crypto.randomInt(8), ...Array.from({ length: 11 }, () => crypto.randomInt(10))];
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    return digits.join('') + String((11 - (sum % 11)) % 10);
}

function smuggledValue(field, sfx) {
    if (field.name === 'accountType') {
        return 'JURISTIC';
    }
    switch (field.type) {
        case 'Boolean': return field.default !== true;
        case 'Int': return 4242;
        case 'DateTime': return '2031-01-02T03:04:05.000Z';
        case 'Json': return { smuggled: field.name };
        default: return `smuggled-${field.name}-${sfx}`;
    }
}

const sameValue = (stored, sent) => JSON.stringify(stored instanceof Date ? stored.toISOString() : stored)
    === JSON.stringify(sent);

d('a public registration sets no protected column of its own account (real Postgres)', () => {
    let raw;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [] };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgId = (await raw.organization.findUnique({ where: { slug: 'default' } })).id;
        fx.victimEntityId = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: `บริษัทผู้เสียหาย ${sfx}`, organizationId: fx.orgId },
        })).id;
    });

    afterAll(async () => {
        if (!raw) { return; }
        const ids = { in: fx.userIds };
        const users = await raw.user.findMany({ where: { id: ids }, select: { canonicalId: true } });
        const owned = await raw.entityMembership.findMany({ where: { userId: ids }, select: { entityId: true } });
        await raw.application.deleteMany({ where: { healthId: { in: users.map((u) => u.canonicalId) } } }).catch(() => {});
        await dropConsentRows(raw, ids).catch(() => {});
        for (const table of ['userPermissionGrant', 'userGroupMembership', 'identityLink', 'entityMembershipEvent']) {
            await raw[table].deleteMany({ where: table === 'entityMembershipEvent' ? { OR: [{ actorUserId: ids }, { targetUserId: ids }] } : { userId: ids } }).catch(() => {});
        }
        await raw.entityMembership.deleteMany({ where: { userId: ids } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: [fx.victimEntityId, ...owned.map((m) => m.entityId)] } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: ids } }).catch(() => {});
        await raw.$disconnect();
    });

    async function registerWith(extra) {
        const nationalId = syntheticThaiId();
        const parsed = healthRegisterSchema.safeParse({
            accountType: 'INDIVIDUAL',
            identifier: nationalId,
            healthId: nationalId,
            firstName: 'ทดสอบ',
            lastName: `ลงทะเบียน ${sfx}`,
            phoneNumber: `08${String(crypto.randomInt(1e8)).padStart(8, '0')}`,
            email: `reg-${sfx}-${crypto.randomInt(1e6)}@example.test`,
            password: `Reg-${crypto.randomBytes(6).toString('hex')}-Ok9`,
            acceptedTermsOfService: true,
            acceptedPrivacyPolicy: true,
            ...extra,
        });
        expect(parsed.error?.issues).toBeUndefined();
        const res = await authService.registerHealthUser(parsed.data);
        const id = res.body?.data?.user?.id;
        if (id) { fx.userIds.push(id); }
        return { status: res.status, row: id ? await raw.user.findUnique({ where: { id } }) : null };
    }

    test('no column outside the form keeps the value the body sent', async () => {
        const smuggled = Object.fromEntries(USER_COLUMNS.map((field) => [field.name, smuggledValue(field, sfx)]));
        expect(Object.keys(smuggled)).toEqual(expect.arrayContaining([
            'legalHold', 'isEmailVerified', 'taxIdHash', 'laserCode', 'entityType', 'ministryVerifiedAt',
            'loginAttempts', 'isLocked', 'lockedUntil', 'passwordResetToken', 'isDeleted', 'deletedAt',
            'twoFactorEnabled', 'twoFactorSecret', 'companyName', 'taxId', 'role', 'status', 'organizationId',
        ]));

        const { status, row } = await registerWith(smuggled);

        expect(status).toBe(201);
        expect(USER_COLUMNS.filter((field) => sameValue(row[field.name], smuggled[field.name])).map((f) => f.name)).toEqual([]);
        expect(row).toMatchObject({
            role: 'health', accountType: 'INDIVIDUAL', organizationId: fx.orgId,
            legalHold: false, isEmailVerified: false, isLocked: false, loginAttempts: 0, isDeleted: false, twoFactorEnabled: false,
            laserCode: null, taxIdHash: null, entityType: null, ministryVerifiedAt: null, lockedUntil: null, deletedAt: null,
        });
    });

    const RELATION_WRITES = [
        ['an application already CERTIFIED',
            () => ({ applications: { create: [{ applicationNumber: `SMUG-${sfx}`, areaType: 'OUTDOOR', status: 'CERTIFIED', organizationId: fx.orgId }] } }),
            (row) => raw.application.count({ where: { healthId: row.canonicalId } })],
        ['OWNER of another company',
            () => ({ entityMemberships: { create: [{ entityId: fx.victimEntityId, role: 'OWNER', organizationId: fx.orgId }] } }),
            (row) => raw.entityMembership.count({ where: { userId: row.id, entityId: fx.victimEntityId } })],
        ['a per-user permission grant',
            () => ({ permissionGrants: { create: [{ permission: 'report.export', effect: 'GRANT', organizationId: fx.orgId }] } }),
            (row) => raw.userPermissionGrant.count({ where: { userId: row.id } })],
        ['a certificate approver group',
            () => ({ groupMemberships: { create: [{ groupId: 'rg_certificate_approver', organizationId: fx.orgId }] } }),
            (row) => raw.userGroupMembership.count({ where: { userId: row.id } })],
        ['a consent row',
            () => ({ consents: { create: [{ category: 'RESEARCH_SURVEY', version: 'smuggled', granted: true, organizationId: fx.orgId }] } }),
            (row) => raw.userConsent.count({ where: { userId: row.id } })],
        ['a ThaiD identity link',
            () => ({ identityLinks: { create: [{ provider: 'thaid', subject: `smuggled-${sfx}` }] } }),
            (row) => raw.identityLink.count({ where: { userId: row.id } })],
    ];

    test.each(RELATION_WRITES)('a nested write in the body creates no %s', async (_name, body, rowsFor) => {
        const { status, row } = await registerWith(body());
        expect({ status, rows: row ? await rowsFor(row) : null }).toEqual({ status: 201, rows: 0 });
    });
});
