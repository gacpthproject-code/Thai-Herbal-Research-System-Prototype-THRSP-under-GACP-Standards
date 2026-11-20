/**
 * Every timestamp column is timestamp(3) with no zone, and these writes take the time from Postgres'
 * own clock, so the stored value is the wall clock of the session. Prisma reads that value back as
 * UTC, so the session has to be UTC. Under Asia/Bangkok each test below is off by seven hours.
 * Real doors, real Postgres. The database setting comes from migration
 * 20261107120000_database_session_timezone_utc.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { dropConsentRows } = require('../../test-support/consent-history');
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

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SITE_CONTACT = { siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true };

const offsetFromNow = (at) => Math.abs(at.getTime() - Date.now());

// From 29 February, Postgres lands on 28 February and setUTCFullYear on 1 March, so the date may
// differ by a day. A wrong session zone moves the time of day, which is what this has to catch.
const isFiveYearsAfter = (retainUntil, madeAt) => {
    const fiveYears = new Date(madeAt);
    fiveYears.setUTCFullYear(fiveYears.getUTCFullYear() + 5);
    const gap = Math.abs(retainUntil.getTime() - fiveYears.getTime());
    return gap < DAY + MINUTE && Math.min(gap % DAY, DAY - (gap % DAY)) < MINUTE;
};

d('every database session runs in UTC (real Postgres)', () => {
    let world;
    let fx;
    let app;

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'utc' });
        ({ fx } = world);
        mockActor.current = {
            id: fx.applicant.id, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId,
            role: 'health', canonicalRole: 'health', organizationId: fx.orgA,
        };
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/application-site-contact'));
        app.use('/api/applications', require('../../routes/api/applications/applications'));
    });
    afterAll(async () => {
        await dropConsentRows(world.raw, { in: [fx.applicant.id] });
        await world.cleanup();
    });

    test('a new connection reports UTC, by name, so a database that lost the setting is caught on a UTC cluster too', async () => {
        const [row] = await world.raw.$queryRawUnsafe('SHOW timezone');
        expect(Object.values(row)).toEqual(['UTC']);
    });

    test('the consent trigger stamps the history row with the time it happened', async () => {
        await world.raw.userConsent.create({
            data: { userId: fx.applicant.id, organizationId: fx.orgA, category: 'TERMS_OF_SERVICE', version: '1.0.0', granted: true, grantedAt: new Date() },
        });
        const [event] = await world.raw.userConsentEvent.findMany({ where: { userId: fx.applicant.id } });
        expect(offsetFromNow(event.createdAt)).toBeLessThan(MINUTE);
    });

    test('a draft save stamps updatedAt with the time it happened', async () => {
        const draft = await world.application('DRAFT');
        const saved = await request(app).post('/api/applications/draft').send({
            applicationId: draft.id, saveSession: 'utc', saveSeq: 1, step: 2, currentStep: 1, plantId: 'cannabis', areaType: 'OUTDOOR',
            formData: { applicantData: { firstName: 'ทดสอบ', lastName: 'ทดสอบ', phone: '0812345678' } },
        });
        expect(saved.status).toBe(200);
        const { updatedAt } = await world.raw.application.findUnique({ where: { id: draft.id }, select: { updatedAt: true } });
        expect(offsetFromNow(updatedAt)).toBeLessThan(MINUTE);
    });

    test('a visit three hours ahead still takes a new site contact, and the write stamps updatedAt with the time it happened', async () => {
        const booked = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: new Date(Date.now() + 3 * HOUR),
        });
        const res = await request(app).patch(`/api/applications/${booked.id}/site-contact`).send(SITE_CONTACT);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 200, code: undefined });
        const { updatedAt } = await world.raw.application.findUnique({ where: { id: booked.id }, select: { updatedAt: true } });
        expect(offsetFromNow(updatedAt)).toBeLessThan(MINUTE);
    });

    test('retainUntil defaults to five years from the time the row was made', async () => {
        const { retainUntil } = await world.application('DRAFT');
        expect(isFiveYearsAfter(retainUntil, new Date())).toBe(true);
    });

    test('the five-year check holds for a row made on 29 February, and still catches seven hours', async () => {
        const madeAt = new Date('2028-02-29T12:00:00Z');
        const [{ due }] = await world.raw.$queryRawUnsafe("SELECT TIMESTAMP '2028-02-29 12:00:00' + INTERVAL '5 years' AS due");
        expect(isFiveYearsAfter(due, madeAt)).toBe(true);
        expect(isFiveYearsAfter(new Date(due.getTime() + 7 * HOUR), madeAt)).toBe(false);
    });
});
