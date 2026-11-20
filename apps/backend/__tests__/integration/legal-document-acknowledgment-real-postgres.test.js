'use strict';
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

let mockCurrentUser = null;
jest.mock('../../middleware/auth-middleware', () => ({
    authenticateHealth: (req, _res, next) => {
        req.user = mockCurrentUser;
        next();
    },
}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue(undefined) },
    AuditCategory: { SECURITY: 'SECURITY' },
}));

const WORDING_EDITION = { version: '1.4.1', effectiveDate: '2026-11-10', change: 'WORDING' };

d('privacy notice acknowledgment and terms acceptance on a real Postgres (order 160)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let prisma;
    let app;
    let orgId;
    const userIds = [];
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { requireConsent, consentManager, RequiredConsents } = require('../../middleware/consent-manager');

    async function newUser(tag) {
        const user = await prisma.user.create({
            data: { canonicalId: `pdpaack-${tag}-${suffix}`, password: 'x', organizationId: orgId, authType: 'EMAIL_LEGACY' },
        });
        userIds.push(user.id);
        return user;
    }

    const actAs = (user) => { mockCurrentUser = { id: user.id, role: 'HEALTH_USER', canonicalRole: 'health' }; };
    const eventsOf = (userId) => prisma.userConsentEvent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

    beforeAll(async () => {
        prisma = new PrismaClient();
        await prisma.$connect();
        const org = await prisma.organization.create({
            data: { name: 'PDPA ack org', slug: `pdpaack-${suffix}`, code: `PDPAACK_${suffix}`.toUpperCase().slice(0, 24) },
        });
        orgId = org.id;
        app = express();
        app.use(express.json());
        app.use('/api/consent', require('../../routes/api/identity/consent'));
        app.post('/gated', (req, _res, next) => { req.user = mockCurrentUser; next(); }, requireConsent, (_req, res) => res.json({ ok: true }));
    });

    afterAll(async () => {
        await prisma.$transaction([
            prisma.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
            prisma.userConsentEvent.deleteMany({ where: { userId: { in: userIds } } }),
            prisma.userConsent.deleteMany({ where: { userId: { in: userIds } } }),
            prisma.user.deleteMany({ where: { id: { in: userIds } } }),
            prisma.organization.deleteMany({ where: { id: orgId } }),
        ]);
        await prisma.$disconnect();
    });

    test('a grant recorded before the registry (version 1.0.0) does not pass the gate', async () => {
        const user = await newUser('legacy');
        for (const category of RequiredConsents) {
            await prisma.userConsent.create({
                data: { userId: user.id, organizationId: orgId, category, version: '1.0.0', granted: true, grantedAt: new Date() },
            });
        }
        actAs(user);
        const res = await request(app).post('/gated');
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CONSENT_REQUIRED');
    });

    test('acknowledging the notice and accepting the terms opens the gate, each with its own history row and screen', async () => {
        const user = await newUser('prompt');
        actAs(user);
        for (const category of ['PRIVACY_POLICY', 'TERMS_OF_SERVICE']) {
            const res = await request(app).post('/api/consent').send({ category, granted: true, source: 'UPDATE_PROMPT' });
            expect(res.status).toBe(200);
        }
        expect((await request(app).post('/gated')).status).toBe(200);

        const events = await eventsOf(user.id);
        expect(events.map(({ category, version, granted, source }) => ({ category, version, granted, source }))).toEqual([
            { category: 'PRIVACY_POLICY', version: '1.4', granted: true, source: 'UPDATE_PROMPT' },
            { category: 'TERMS_OF_SERVICE', version: '1.1', granted: true, source: 'UPDATE_PROMPT' },
        ]);
    });

    test('history is append-only: a second acknowledgment adds a row, and the database refuses to change or remove one', async () => {
        const user = await newUser('append');
        actAs(user);
        await request(app).post('/api/consent').send({ category: 'PRIVACY_POLICY', granted: true, source: 'APPLICATION_REVIEW' });
        await request(app).post('/api/consent').send({ category: 'PRIVACY_POLICY', granted: true, source: 'UPDATE_PROMPT' });

        const events = await eventsOf(user.id);
        expect(events.map((e) => e.source)).toEqual(['APPLICATION_REVIEW', 'UPDATE_PROMPT']);
        await expect(prisma.$executeRaw`UPDATE "user_consent_events" SET "version" = '9.9' WHERE "id" = ${events[0].id}`)
            .rejects.toThrow(/append-only/);
        await expect(prisma.$executeRaw`DELETE FROM "user_consent_events" WHERE "id" = ${events[0].id}`)
            .rejects.toThrow(/append-only/);
        expect((await eventsOf(user.id)).map((e) => e.version)).toEqual(['1.4', '1.4']);
    });

    test('a source the screens do not send is recorded as UNSPECIFIED, never as a guess', async () => {
        const user = await newUser('nosource');
        actAs(user);
        await request(app).post('/api/consent').send({ category: 'TERMS_OF_SERVICE', granted: true });
        await request(app).post('/api/consent').send({ category: 'PRIVACY_POLICY', granted: true, source: 'SOMEWHERE_ELSE' });
        expect((await eventsOf(user.id)).map((e) => e.source)).toEqual(['UNSPECIFIED', 'UNSPECIFIED']);
    });

    test.each([
        ['POST granted:false', (category) => request(app).post('/api/consent').send({ category, granted: false })],
        ['DELETE', (category) => request(app).delete(`/api/consent/${category}`)],
    ])('%s cannot withdraw the notice or the terms, and leaves the row and the history as they were', async (_door, send) => {
        const user = await newUser(`withdraw-${_door.length}`);
        actAs(user);
        for (const category of RequiredConsents) {
            await request(app).post('/api/consent').send({ category, granted: true, source: 'UPDATE_PROMPT' });
        }
        for (const category of RequiredConsents) {
            const res = await send(category);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('LEGAL_DOCUMENT_NOT_WITHDRAWABLE');
            expect(res.body.messageTh).toMatch(/ไม่ใช่ความยินยอม/);
        }
        const rows = await prisma.userConsent.findMany({ where: { userId: user.id } });
        expect(rows.every((r) => r.granted === true)).toBe(true);
        expect(await eventsOf(user.id)).toHaveLength(2);
        expect((await request(app).post('/gated')).status).toBe(200);
    });

    test('a true consent (marketing) can still be withdrawn, and both steps stay in the history', async () => {
        const user = await newUser('marketing');
        actAs(user);
        expect((await request(app).post('/api/consent').send({ category: 'MARKETING_EMAIL', granted: true })).status).toBe(200);
        expect((await request(app).delete('/api/consent/MARKETING_EMAIL')).status).toBe(200);
        const row = await prisma.userConsent.findUnique({ where: { userId_category: { userId: user.id, category: 'MARKETING_EMAIL' } } });
        expect(row.granted).toBe(false);
        expect((await eventsOf(user.id)).map((e) => e.granted)).toEqual([true, false]);
    });

    test('registration records the notice and the terms as two rows and two history entries from the registration screen', async () => {
        const user = await newUser('register');
        const { failures } = await consentManager.recordRegistrationConsents({
            userId: user.id, organizationId: orgId, categories: RequiredConsents, metadata: { source: 'REGISTRATION' },
        });
        expect(failures).toEqual([]);
        const rows = await prisma.userConsent.findMany({ where: { userId: user.id }, orderBy: { category: 'asc' } });
        expect(rows.map((r) => [r.category, r.version])).toEqual([['PRIVACY_POLICY', '1.4'], ['TERMS_OF_SERVICE', '1.1']]);
        const events = await eventsOf(user.id);
        expect(events.map((e) => [e.category, e.source]).sort()).toEqual([
            ['PRIVACY_POLICY', 'REGISTRATION'], ['TERMS_OF_SERVICE', 'REGISTRATION'],
        ]);
    });

    test('a wording edition published after the acknowledged one never blocks, and is reported as a notice', async () => {
        const user = await newUser('wording');
        actAs(user);
        for (const category of RequiredConsents) {
            await request(app).post('/api/consent').send({ category, granted: true, source: 'UPDATE_PROMPT' });
        }

        let isolated;
        jest.isolateModules(() => {
            const registry = jest.requireActual('@gacp/validation/legal-document-versions');
            jest.doMock('@gacp/validation/legal-document-versions', () => {
                const history = {
                    ...registry.LEGAL_DOCUMENT_HISTORY,
                    PRIVACY_POLICY: [...registry.LEGAL_DOCUMENT_HISTORY.PRIVACY_POLICY, WORDING_EDITION],
                };
                return {
                    ...registry,
                    LEGAL_DOCUMENT_HISTORY: history,
                    currentEditionOf: (doc) => history[doc][history[doc].length - 1],
                    standingOf: (doc, recorded) => registry.standingIn(history[doc], recorded),
                };
            });
            isolated = require('../../middleware/consent-manager');
        });

        expect(await isolated.consentManager.hasRequiredConsents(user.id)).toBe(true);
        const status = await isolated.consentManager.getUserConsents(user.id);
        expect(status.PRIVACY_POLICY).toMatchObject({
            version: '1.4', currentVersion: '1.4.1', standing: 'WORDING_NOTICE',
            currentEffectiveDate: '2026-11-10', currentChange: 'WORDING',
        });
        expect(status.TERMS_OF_SERVICE).toMatchObject({ version: '1.1', currentVersion: '1.1', standing: 'CURRENT' });
    });
});
