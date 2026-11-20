'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const fs = require('fs');
const path = require('path');
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

d('the old audit result door (real Postgres, full API router)', () => {
    let world;
    let fx;
    let app;
    const as = (user) => { mockActor.current = { ...user }; };

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'ard' });
        ({ fx } = world);
        app = express();
        app.use(express.json());
        app.use('/api', require('../../routes/api/index'));
    }, 60000);

    afterAll(async () => { await world.cleanup(); });

    const bookedVisit = () => world.application('AUDIT_CONFIRMED', {
        milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: world.nextSlot(),
    });

    test('the assigned inspector\'s FAIL answers 404 and the visit stays booked, with no CAR clock', async () => {
        const row = await bookedVisit();
        as(fx.inspectorA);
        const res = await request(app).post(`/api/audits/${row.id}/result`).send({ result: 'FAIL', notes: 'ไม่มีบันทึกการใช้ปุ๋ย' });
        expect(res.status).toBe(404);
        const after = await world.rowOf(row.id);
        expect(after.status).toBe('AUDIT_CONFIRMED');
        expect(after.formData.carDueAt).toBeUndefined();
        expect(after.formData.auditResult).toBeUndefined();
        expect(await world.raw.revisionDeadline.count({ where: { applicationId: row.id } })).toBe(0);
    });

    test('control: the audit detail on the same router still answers the assigned inspector', async () => {
        const row = await bookedVisit();
        as(fx.inspectorA);
        const res = await request(app).get(`/api/audits/${row.id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(row.id);
    });
});

describe('no client calls the old audit result door', () => {
    const CLIENT_ROOTS = [
        path.resolve(__dirname, '../../../web-app/src'),
        path.resolve(__dirname, '../../../mobile-app/lib'),
    ];
    const OLD_DOOR = /audits\/[^'"`\s]*\/result\b/;

    function* sourceFiles(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { yield* sourceFiles(full); }
            else if (/\.(ts|tsx|dart)$/.test(entry.name)) { yield full; }
        }
    }

    test('web and mobile sources never spell the path', () => {
        let scanned = 0;
        const callers = [];
        for (const root of CLIENT_ROOTS) {
            for (const file of sourceFiles(root)) {
                scanned += 1;
                if (OLD_DOOR.test(fs.readFileSync(file, 'utf8'))) { callers.push(path.relative(path.resolve(__dirname, '../../..'), file)); }
            }
        }
        expect(scanned).toBeGreaterThan(500);
        expect(callers).toEqual([]);
    });
});
