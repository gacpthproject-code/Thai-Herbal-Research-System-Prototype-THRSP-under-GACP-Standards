'use strict';

const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { computeLookupHmac } = require('../../utils/field-encryption');

const idp = { exchangeCode: async () => { throw new Error('exchangeCode not scripted'); }, getProfile: async () => ({}) };
jest.mock('../../services/auth/idp/idp-adapter', () => ({
    getIdpAdapter: () => ({
        getAuthorizeUrl: ({ state }) => `https://idp.example/authorize?state=${state}`,
        exchangeCode: (...args) => idp.exchangeCode(...args),
        getProfile: (...args) => idp.getProfile(...args),
    }),
}));

const STAFF_ROLES = [
    CANONICAL_ROLES.DOCUMENT_REVIEWER,
    CANONICAL_ROLES.DISPATCHER,
    CANONICAL_ROLES.FIELD_INSPECTOR,
    CANONICAL_ROLES.CERTIFICATE_APPROVER,
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
    CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM,
];
const PASSWORD = 'Gacp#TwoFactor2026x';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const SESSION_COOKIES = ['provider_token', 'auth_token', 'refresh_token'];
const IDP_ENV = {
    SESSION_SECRET: 'test-only-idp-state-secret-at-least-32-chars-long',
    AUTH_THAID_STATE: 'enabled',
    AUTH_THAID_CLIENT_ID: 'test-thaid-client',
    AUTH_THAID_CLIENT_SECRET: 'test-thaid-client-secret-value',
    AUTH_THAID_REDIRECT_URI: 'https://gacp.example/auth/callback/thaid',
    AUTH_THAID_AUTHORIZE_URL: 'https://thaid.example/oauth/authorize',
    AUTH_THAID_TOKEN_URL: 'https://thaid.example/oauth/token',
    AUTH_THAID_SCOPE: 'pid name given_name family_name openid',
    AUTH_PROVIDERID_STATE: 'enabled',
    AUTH_PROVIDERID_CLIENT_ID: 'test-providerid-client',
    AUTH_PROVIDERID_CLIENT_SECRET: 'test-providerid-client-secret-value',
    AUTH_PROVIDERID_REDIRECT_URI: 'https://gacp.example/auth/callback/providerid',
    AUTH_PROVIDERID_AUTHORIZE_URL: 'https://providerid.example/oauth/authorize',
    AUTH_PROVIDERID_TOKEN_URL: 'https://providerid.example/oauth/token',
    AUTH_PROVIDERID_PROFILE_URL: 'https://providerid.example/profile',
    AUTH_PROVIDERID_PID_CLIENT_ID: 'test-pid-client',
    AUTH_PROVIDERID_SECRET_KEY: 'test-providerid-secret-key-value',
    AUTH_PROVIDERID_TOKEN_EXCHANGE_URL: 'https://providerid.example/oauth/exchange',
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function thaiNationalId() {
    const digits = Array.from({ length: 12 }, () => crypto.randomInt(0, 10));
    digits[0] = crypto.randomInt(1, 9);
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

const idToken = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

function mintedSession(res) {
    const cookies = (res.headers['set-cookie'] || [])
        .filter((c) => SESSION_COOKIES.some((name) => c.startsWith(`${name}=`)))
        .filter((c) => !/^[^=]+=;/.test(c) && !/expires=thu, 01 jan 1970/i.test(c))
        .map((c) => c.split('=')[0]);
    const data = (res.body && res.body.data) || {};
    const tokens = [data.token, data.tokens && data.tokens.accessToken, data.tokens && data.tokens.refreshToken,
        res.body && res.body.tokens && res.body.tokens.access_token].filter(Boolean);
    return { cookies, tokens };
}

function outcome(res) {
    const data = (res.body && res.body.data) || {};
    const minted = mintedSession(res);
    if (res.status === 200 && data.mfa_setup_required === true && typeof data.setup_token === 'string') { return 'SETUP_TICKET'; }
    if (res.status === 200 && data.mfa_required === true && typeof data.mfa_session === 'string') { return 'CHALLENGE'; }
    if (res.status === 200 && (minted.cookies.length || minted.tokens.length)) { return 'SESSION'; }
    return `${res.status} ${(res.body && res.body.code) || ''}`.trim();
}

d('every staff sign-in door refuses a session to a staff account without a usable second factor while REQUIRE_MFA_FOR_PRIVILEGED is on (real Postgres, real HTTP)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    let envBackup;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], orgId: null };
    let seq = 0;

    async function account(role, { enrolled = false } = {}) {
        seq += 1;
        const id = crypto.randomUUID();
        const nationalId = thaiNationalId();
        const isStaff = role !== CANONICAL_ROLES.HEALTH;
        const identity = isStaff
            ? { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId, providerIdHash: sha256(nationalId) }
            : { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId, healthIdHash: sha256(nationalId), idCardHash: sha256(nationalId) };
        await raw.user.create({
            data: {
                id, canonicalId: `s2fa-${seq}-${sfx}`, password: PASSWORD_HASH, role, status: 'ACTIVE',
                email: `s2fa-${seq}-${sfx}@example.test`, firstName: `ชื่อ${seq}`, lastName: `สกุล${sfx}`,
                organizationId: fx.orgId, idCardHmac: computeLookupHmac(nationalId), ...identity,
                ...(enrolled ? { twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: 'JBSWY3DPEHPK3PXP' } : {}),
            },
        });
        fx.userIds.push(id);
        return { id, role, nationalId };
    }

    const providerLogin = (user) => request(app).post('/api/auth/provider/login').send({ providerId: user.nationalId, password: PASSWORD });
    const healthLogin = (user) => request(app).post('/api/auth/health/login').send({ identifier: user.nationalId, password: PASSWORD });

    async function idpCallback(provider, { claims = null, profile = null } = {}) {
        const start = await request(app).post(`/api/auth/idp/${provider}/authorize-url`);
        expect(start.status).toBe(200);
        const stateCookie = (start.headers['set-cookie'] || []).find((c) => c.startsWith('idp_state=')).split(';')[0];
        const state = new URL(start.body.data.authorizeUrl).searchParams.get('state');
        idp.exchangeCode = async () => ({ accessToken: 'access-1', raw: claims ? { id_token: idToken(claims) } : {} });
        idp.getProfile = async () => profile || {};
        return request(app).post(`/api/auth/idp/${provider}/callback`).set('Cookie', stateCookie).send({ code: 'code-1', state });
    }

    beforeAll(async () => {
        envBackup = { ...process.env };
        Object.assign(process.env, IDP_ENV);
        process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
        raw = new PrismaClient();
        const org = await raw.organization.create({
            data: { name: `หน่วยงานทดสอบ 2FA ${sfx}`, slug: `s2fa-${sfx}`, code: `S2FA_${sfx.toUpperCase()}` },
        });
        fx.orgId = org.id;
        app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use('/api/auth/provider', require('../../routes/api/auth/auth-provider'));
        app.use('/api/auth/health', require('../../routes/api/auth/auth-health'));
        app.use('/api/auth/idp', require('../../routes/api/auth/auth-idp'));
        app.use('/api/mfa', require('../../routes/api/identity/mfa'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
    });

    afterAll(async () => {
        if (raw) {
            await raw.identityLink.deleteMany({ where: { userId: { in: fx.userIds } } });
            await raw.user.deleteMany({ where: { id: { in: fx.userIds } } });
            if (fx.orgId) { await raw.organization.delete({ where: { id: fx.orgId } }).catch(() => {}); }
            await raw.$disconnect();
        }
        for (const key of Object.keys(process.env)) {
            if (!(key in envBackup)) { delete process.env[key]; }
        }
        Object.assign(process.env, envBackup);
    });

    describe('flag on', () => {
        beforeEach(() => { process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true'; });

        test.each(STAFF_ROLES)('provider password door: %s without 2FA gets a setup ticket and no session', async (role) => {
            const res = await providerLogin(await account(role));
            expect(outcome(res)).toBe('SETUP_TICKET');
            expect(mintedSession(res)).toEqual({ cookies: [], tokens: [] });
        });

        test('provider password door: an enrolled staff account gets the authenticator challenge and no session', async () => {
            const res = await providerLogin(await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, { enrolled: true }));
            expect(outcome(res)).toBe('CHALLENGE');
            expect(mintedSession(res)).toEqual({ cookies: [], tokens: [] });
            const probe = await request(app).get('/api/provider/applications').set('Authorization', `Bearer ${res.body.data.mfa_session}`);
            expect(probe.status).toBe(401);
        });

        test('the setup ticket opens only the enrolment doors: staff doors answer 401, POST /mfa/setup answers 200', async () => {
            const login = await providerLogin(await account(CANONICAL_ROLES.DISPATCHER));
            expect(outcome(login)).toBe('SETUP_TICKET');
            const bearer = `Bearer ${login.body.data.setup_token}`;
            for (const door of ['/api/provider/applications', '/api/provider/applications/queue', '/api/auth/provider/me/notification-prefs']) {
                const res = await request(app).get(door).set('Authorization', bearer);
                expect({ door, status: res.status }).toEqual({ door, status: 401 });
            }
            const setup = await request(app).post('/api/mfa/setup').set('Authorization', bearer).send({});
            expect(setup.status).toBe(200);
            expect(typeof setup.body.data.secret).toBe('string');
            expect(typeof setup.body.data.qrCodeUri).toBe('string');
        });

        test.each(STAFF_ROLES)('health password door: %s is refused as a cross-portal login and gets no session', async (role) => {
            const res = await healthLogin(await account(role));
            expect(outcome(res)).toBe('403 AUTH_ROUTE_MISMATCH');
            expect(mintedSession(res)).toEqual({ cookies: [], tokens: [] });
        });

        test('health password door control: an applicant without 2FA still signs in', async () => {
            const res = await healthLogin(await account(CANONICAL_ROLES.HEALTH));
            expect(outcome(res)).toBe('SESSION');
        });

        test('ThaID door: a staff account reached through its existing identity link is refused and gets no session', async () => {
            const staff = await account(CANONICAL_ROLES.CERTIFICATE_APPROVER);
            const { thaidSubjectKey } = require('../../services/auth/thaid-identity-service');
            const sub = `sub-${sfx}-${staff.id.slice(0, 8)}`;
            await raw.identityLink.create({ data: { provider: 'thaid', subject: thaidSubjectKey(sub), userId: staff.id } });
            const res = await idpCallback('thaid', { claims: { sub, pid: staff.nationalId } });
            expect(outcome(res)).toBe('403 AUTH_AUTOPROVISION_ROLE_FORBIDDEN');
            expect(mintedSession(res)).toEqual({ cookies: [], tokens: [] });
        });

        test('ThaID door: a staff account matched by national ID is refused and gets no session', async () => {
            const staff = await account(CANONICAL_ROLES.FIELD_INSPECTOR);
            const res = await idpCallback('thaid', { claims: { sub: `sub-${sfx}-${staff.id.slice(0, 8)}`, pid: staff.nationalId } });
            expect(outcome(res)).toBe('403 AUTH_AUTOPROVISION_ROLE_FORBIDDEN');
            expect(mintedSession(res)).toEqual({ cookies: [], tokens: [] });
            expect(await raw.identityLink.count({ where: { userId: staff.id } })).toBe(0);
        });

        test('หมอพร้อม door: linking is still pending, so no account gets a session there', async () => {
            const staff = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM);
            const res = await idpCallback('providerid', { profile: { account_id: `acct-${sfx}`, hash_cid: sha256(staff.nationalId) } });
            expect(outcome(res)).toBe('409 AUTH_LINKING_PENDING');
            expect(mintedSession(res)).toEqual({ cookies: [], tokens: [] });
        });
    });

    describe('flag off keeps today\'s behaviour', () => {
        beforeEach(() => { process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'false'; });

        test('provider password door: a staff account without 2FA signs in', async () => {
            const res = await providerLogin(await account(CANONICAL_ROLES.DOCUMENT_REVIEWER));
            expect(outcome(res)).toBe('SESSION');
            expect(mintedSession(res).cookies).toEqual(['provider_token']);
        });

        test('provider password door: an enrolled staff account is still challenged', async () => {
            const res = await providerLogin(await account(CANONICAL_ROLES.DISPATCHER, { enrolled: true }));
            expect(outcome(res)).toBe('CHALLENGE');
        });

        test('health password door: a staff account is still refused', async () => {
            const res = await healthLogin(await account(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM));
            expect(outcome(res)).toBe('403 AUTH_ROUTE_MISMATCH');
        });
    });
});
