/**
 * The provider certificates dashboard (security re-review 2026-10-09 M-C): the expiring list names
 * the holder without e-mail or phone (orders 18, 29 and 56(3)), and every staff role reads only its
 * own organization's certificates (order 17); only system_admin_platform crosses organizations, and a
 * caller with no organization reads nothing. Real Postgres, with the tenant read scope switched off
 * so the door's own scope is what is tested.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');

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

const DAY = 24 * 60 * 60 * 1000;

d('the provider certificates dashboard (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const made = { certificates: [], farms: [] };
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'certdash' });
        ({ fx } = world);
        fx.financeA = await world.staff('finance_officer_dtam', fx.orgA);
        fx.platformAdmin = await world.staff('system_admin_platform', fx.orgA);
        const account = await world.raw.user.findUnique({ where: { id: fx.applicant.id }, select: { email: true } });
        fx.applicant.email = account.email;
        fx.holderB = await world.healthUser('holderB', fx.orgB, { email: `certdash-holder-b-${crypto.randomUUID().slice(0, 6)}@example.test`, phoneNumber: '0807770000' });
        fx.holderB.email = (await world.raw.user.findUnique({ where: { id: fx.holderB.id }, select: { email: true } })).email;
        fx.certA = await certificateFor({ org: fx.orgA, userId: fx.applicant.id });
        fx.certB = await certificateFor({ org: fx.orgB, userId: fx.holderB.id });
        app = express();
        app.use(express.json());
        app.use('/api/provider/certificates', require('../../routes/api/provider/certificates'));
    });

    afterAll(async () => {
        await world.raw.certificate.deleteMany({ where: { id: { in: made.certificates } } }).catch(() => {});
        await world.raw.farm.deleteMany({ where: { id: { in: made.farms } } }).catch(() => {});
        await world.cleanup();
    });

    async function certificateFor({ org, userId }) {
        const farm = await world.raw.farm.create({
            data: {
                ownerId: userId, farmName: 'ฟาร์มทดสอบแดชบอร์ด', farmType: 'CULTIVATION', address: '1', province: 'เชียงใหม่', district: 'x', subDistrict: 'x',
                postalCode: '50000', totalArea: 1, cultivationArea: 1, cultivationMethod: 'OUTDOOR', organizationId: org,
            },
        });
        made.farms.push(farm.id);
        const row = await world.application('CERTIFIED', { milestones: ['M1', 'M2'], org });
        const cert = await world.raw.certificate.create({
            data: {
                certificateNumber: `CERTDASH-${crypto.randomUUID().slice(0, 8)}`, verificationCode: 'x', qrData: 'x', applicationId: row.id, userId,
                farmId: farm.id, farmName: 'ฟาร์มทดสอบแดชบอร์ด', applicantName: 'ผู้ถือทดสอบ', cropType: 'x', farmSize: 1, province: 'เชียงใหม่', district: 'x',
                subDistrict: 'x', standardId: 'x', standardName: 'GACP', status: 'active', expiryDate: new Date(Date.now() + 30 * DAY),
                validityMonths: 12, issuedBy: 'test', organizationId: org,
            },
        });
        made.certificates.push(cert.id);
        return cert;
    }

    const dashboard = () => request(app).get('/api/provider/certificates/dashboard');
    const numbersIn = (res) => (res.body.data?.expiringList || []).map((cert) => cert.certificateNumber);
    const contactIn = (res) => {
        const text = JSON.stringify(res.body);
        return [fx.applicant.email, '0891112222', fx.holderB.email, '0807770000'].filter((value) => text.includes(value));
    };

    test.each(['dispatcherA', 'inspectorA', 'financeA', 'reviewerA'])('%s reads its own organization\'s expiring certificates without the holder\'s e-mail or phone', async (who) => {
        as(fx[who]);
        const res = await dashboard();
        expect(res.status).toBe(200);
        expect(contactIn(res)).toEqual([]);
        expect(numbersIn(res)).toContain(fx.certA.certificateNumber);
        expect(numbersIn(res)).not.toContain(fx.certB.certificateNumber);
        const listed = res.body.data.expiringList.find((cert) => cert.certificateNumber === fx.certA.certificateNumber);
        expect(listed.user).toEqual({ firstName: 'applicant', lastName: 'ทดสอบ' });
    });

    test('system_admin_platform crosses organizations, still without e-mail or phone', async () => {
        as(fx.platformAdmin);
        const res = await dashboard();
        expect(res.status).toBe(200);
        expect(numbersIn(res)).toEqual(expect.arrayContaining([fx.certA.certificateNumber, fx.certB.certificateNumber]));
        expect(contactIn(res)).toEqual([]);
    });

    test('a staff account with no organization reads nothing', async () => {
        as({ id: crypto.randomUUID(), role: 'dispatcher', canonicalRole: 'dispatcher', organizationId: null });
        const res = await dashboard();
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('NO_ORGANIZATION');
        expect(numbersIn(res)).toEqual([]);
    });
});
