'use strict';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');

d('recordInspectionResult refuses a row that moved under it (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = {};

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `l1-${sfx}`, slug: `l1-${sfx}`, code: `L1_${sfx}`.toUpperCase() } });
        fx.org = org.id;
        fx.inspector = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.inspector, canonicalId: `l1-inspector-${sfx}`, providerId: `l1-inspector-${sfx}`, password: 'x', role: 'field_inspector',
                authType: 'PROVIDER_ID', email: `l1-inspector-${sfx}@example.test`, firstName: 'คน', lastName: 'ตรวจ',
                organizationId: fx.org, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.applicant = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.applicant, canonicalId: `l1-applicant-${sfx}`, healthId: `l1-applicant-${sfx}`, password: 'x', role: 'health',
                authType: 'EMAIL_LEGACY', email: `l1-applicant-${sfx}@example.test`, firstName: 'คน', lastName: 'ยื่น',
                organizationId: fx.org, status: 'ACTIVE',
            },
        });
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-L1-${sfx}`, healthId: `l1-applicant-${sfx}`, areaType: 'OUTDOOR', organizationId: fx.org,
                status: 'CAR_REVIEWING', auditorId: fx.inspector, formData: { workflowState: 'CAR_REVIEWING' },
            },
        });
        fx.app = row.id;
        await settleMilestones(raw, row);
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        await wipe('checkoutOrder', { applicationId: fx.app });
        await wipe('invoice', { applicationId: fx.app });
        await wipe('workActivity', { applicationId: fx.app });
        await wipe('auditLog', { resourceId: fx.app });
        await wipe('application', { id: fx.app });
        await wipe('user', { id: { in: [fx.inspector, fx.applicant] } });
        await wipe('organization', { id: fx.org });
        await raw.$disconnect();
    });

    it('the booking commits first: the PASS decided on CAR_REVIEWING answers 409 and writes nothing', async () => {
        const { recordInspectionResult } = require('../../services/inspection-result-service');
        const { lockApplicationRow } = require('../../services/checkout/application-row-lock');
        let release;
        const gate = new Promise((r) => { release = r; });
        let held;
        const holding = new Promise((r) => { held = r; });
        const booking = raw.$transaction(async (tx) => {
            await lockApplicationRow(tx, fx.app);
            await tx.application.update({ where: { id: fx.app }, data: { status: 'AUDIT_CONFIRMED', formData: { workflowState: 'AUDIT_CONFIRMED' } } });
            held();
            await gate;
        }, { timeout: 30000 });
        await holding;
        const result = raw.$transaction((tx) => recordInspectionResult(tx, {
            applicationId: fx.app, expectedStatus: 'CAR_REVIEWING', inspectorId: fx.inspector, inspectorRole: 'field_inspector', verdict: 'PASS',
        }), { timeout: 30000 }).then(() => null, (error) => error);
        for (let i = 0; i < 200; i += 1) {
            const [{ n }] = await raw.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
                WHERE wait_event_type = 'Lock' AND datname = current_database()`;
            if (n > 0) { break; }
            await new Promise((r) => { setTimeout(r, 25); });
        }
        release();
        await booking;
        const error = await result;
        expect(error && [error.code, error.status || error.statusCode]).toEqual(['APPLICATION_STATE_CHANGED', 409]);
        const row = await raw.application.findUnique({ where: { id: fx.app }, select: { status: true, auditResult: true, formData: true } });
        expect([row.status, row.auditResult, row.formData.auditDecision]).toEqual(['AUDIT_CONFIRMED', null, undefined]);
    });
});
