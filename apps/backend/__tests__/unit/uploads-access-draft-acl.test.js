'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => ({
    authenticateAny: (req, res, next) => {
        const raw = req.headers['x-test-user'];
        if (!raw) {
            return res.status(401).json({ success: false, code: 'NO_TOKEN' });
        }
        req.user = JSON.parse(raw);
        return next();
    },
}));

const mockMemberships = new Map();
jest.mock('../../services/holder-access', () => ({
    holderScopeForUser: jest.fn(async (userId) => ({ userId, readIds: mockMemberships.get(userId) || [], editIds: [] })),
    holderReadWhere: jest.fn((scope) => ({ holderOf: [...scope.readIds] })),
}));
const mockVisible = new Set();
jest.mock('../../middleware/require-visible-application', () => ({
    isApplicationVisibleTo: jest.fn(async (user, applicationId) => mockVisible.has(`${user.id}:${applicationId}`)),
}));

const APP_DRAFT = '/uploads/application-drafts/1716000000000-abc.pdf';
const HOLDER = 'entity-1';
const APPLICATION = 'app-1';

const inScope = (where) => !where.AND[0].holderOf || where.AND[0].holderOf.includes(HOLDER);
const mockPrisma = {
    applicationDocument: { findFirst: jest.fn() },
    application: { findFirst: jest.fn() },
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockPrisma }));

const { gateSensitiveUploads, gateUploadsObjectAccess } = require('../../middleware/uploads-access');

function buildApp() {
    const app = express();
    app.use(
        '/uploads',
        gateSensitiveUploads,
        gateUploadsObjectAccess,
        (_req, res) => res.status(200).send('FILE-BYTES'),
    );
    return app;
}

const as = (user) => request(buildApp()).get(APP_DRAFT).set('x-test-user', JSON.stringify(user));
const FILER = { id: 'u-filer', canonicalId: 'TOK', canonicalRole: 'health' };
const UPLOADER = { id: 'u-uploader', canonicalId: 'TOK-2', canonicalRole: 'health' };
const MEMBER = { id: 'u-member', canonicalId: 'TOK-3', canonicalRole: 'health' };
const SAME_ORG_INSPECTOR = { id: 'p-1', canonicalRole: 'field_inspector', organizationId: 'org1' };

beforeEach(() => {
    mockMemberships.clear();
    mockVisible.clear();
    mockPrisma.applicationDocument.findFirst.mockReset();
    mockPrisma.application.findFirst.mockReset();
    mockPrisma.applicationDocument.findFirst.mockImplementation(async ({ where }) => (
        where.AND[1].fileUrl === APP_DRAFT && inScope(where) ? { applicationId: APPLICATION } : null));
    mockPrisma.application.findFirst.mockResolvedValue(null);
});

describe('M4 — the filer, the uploader and the organization no longer open a file by themselves', () => {
    test.each([
        ['the filer (national-ID token) who is not a member', FILER],
        ['the uploader who is not a member', UPLOADER],
        ['a same-organization inspector the application is not visible to', SAME_ORG_INSPECTOR],
    ])('%s → 404, bytes never served', async (_label, user) => {
        const res = await as(user);
        expect([res.status, res.text.includes('FILE-BYTES')]).toEqual([404, false]);
    });
});

describe('M4 — the read model opens it', () => {
    test('an ACTIVE member of the holder → 200', async () => {
        mockMemberships.set(MEMBER.id, [HOLDER]);
        const res = await as(MEMBER);
        expect([res.status, res.text]).toEqual([200, 'FILE-BYTES']);
    });

    test('a member of some other holder → 404', async () => {
        mockMemberships.set(MEMBER.id, ['entity-2']);
        expect((await as(MEMBER)).status).toBe(404);
    });

    test('a staff user the application is visible to → 200, asked about that application', async () => {
        mockVisible.add(`${SAME_ORG_INSPECTOR.id}:${APPLICATION}`);
        const res = await as(SAME_ORG_INSPECTOR);
        expect(res.status).toBe(200);
        const { isApplicationVisibleTo } = require('../../middleware/require-visible-application');
        expect(isApplicationVisibleTo).toHaveBeenCalledWith(expect.objectContaining({ id: SAME_ORG_INSPECTOR.id }), APPLICATION);
    });

    test('a system account or a role nobody mapped gets no file, whatever the predicate says', async () => {
        for (const canonicalRole of ['system', 'some_future_role']) {
            const user = { id: `x-${canonicalRole}`, canonicalRole, organizationId: 'org1' };
            mockVisible.add(`${user.id}:${APPLICATION}`);
            expect([canonicalRole, (await as(user)).status]).toEqual([canonicalRole, 404]);
        }
    });
});

describe('B3 — unresolvable draft object fails CLOSED', () => {
    test('an application-draft with NO owner record anywhere → 404, bytes never served', async () => {
        mockPrisma.applicationDocument.findFirst.mockResolvedValue(null);
        mockVisible.add(`${SAME_ORG_INSPECTOR.id}:${APPLICATION}`);
        const res = await as(SAME_ORG_INSPECTOR);
        expect([res.status, res.text.includes('FILE-BYTES')]).toEqual([404, false]);
    });

    test('a resolver ERROR does not serve the bytes → 500', async () => {
        mockPrisma.applicationDocument.findFirst.mockRejectedValue(new Error('db down'));
        mockMemberships.set(MEMBER.id, [HOLDER]);
        const res = await as(MEMBER);
        expect([res.status, res.text.includes('FILE-BYTES')]).toEqual([500, false]);
    });
});

describe('B3 — the canonical store still names the application when the mirror row is gone (H7)', () => {
    beforeEach(() => {
        mockPrisma.applicationDocument.findFirst.mockResolvedValue(null);
        mockPrisma.application.findFirst.mockImplementation(async ({ where }) => (
            where.AND[1].formData.array_contains[0].fileUrl === APP_DRAFT && inScope(where) ? { id: APPLICATION } : null));
    });

    test('a member of the holder is still served → 200', async () => {
        mockMemberships.set(MEMBER.id, [HOLDER]);
        const res = await as(MEMBER);
        expect([res.status, res.text]).toEqual([200, 'FILE-BYTES']);
    });

    test('a non-member is still refused → 404', async () => {
        const res = await as(FILER);
        expect([res.status, res.text.includes('FILE-BYTES')]).toEqual([404, false]);
    });
});

describe('C2 — regression', () => {
    test('anonymous draft request is still auth-gated → 401', async () => {
        const res = await request(buildApp()).get(APP_DRAFT);
        expect(res.status).toBe(401);
    });
});
