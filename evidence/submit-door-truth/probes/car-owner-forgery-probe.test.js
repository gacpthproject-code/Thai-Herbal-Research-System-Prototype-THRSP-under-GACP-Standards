'use strict';

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';
process.env.HOLDER_READ_WITNESS = process.env.PROBE_WITNESS || 'shadow';
require('../../config/holder-read-witness').resetHolderReadWitnessModeCache();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { seedHolderScopeFixture, cleanupHolderScopeFixture } = require('./fixtures/holder-scope-fixture');

jest.mock('../../services/pdf/pdf-generator.service', () => ({
    initialize: async () => {}, warmUp: async () => {}, close: async () => {},
    generatePDF: async () => Buffer.from('%PDF-1.4 probe'), generateFromTemplate: async () => Buffer.from('%PDF-1.4 probe'),
    replaceTemplateVariables: (t) => t, readTemplateCached: (p) => require('fs').readFileSync(p, 'utf8'),
}));
jest.mock('../../services/queue-service', () => ({
    ...jest.requireActual('../../services/queue-service'),
    getPrecheckQueue: () => ({ add: async () => ({ id: 'job-probe' }) }), getPdfQueue: () => null,
}));

d('probe #67: a carDocuments entry landed through /prepare vs another applicant\'s CAR file', () => {
    test('measure', async () => {
        const raw = new PrismaClient();
        await raw.$connect();
        const fx = await seedHolderScopeFixture(raw);
        const name = `${Date.now()}-${crypto.randomInt(1_000_000_000)}.pdf`;
        const victimUrl = `/uploads/car/${name}`;
        const disk = path.join(__dirname, '..', '..', 'public', 'uploads', 'car', name);
        const out = {};
        try {
            fs.mkdirSync(path.dirname(disk), { recursive: true });
            fs.writeFileSync(disk, '%PDF-1.4 victim car evidence');
            const victim = await raw.application.create({
                data: {
                    applicationNumber: `APP-PROBE-CAR-${fx.sfx}`, healthId: fx.users.S.canonicalId, areaType: 'OUTDOOR',
                    organizationId: fx.orgId, entityId: fx.entities.PS, submitterId: fx.users.S.id, status: 'CAR_PENDING',
                    formData: { plantId: 'cannabis', workflowState: 'CAR_PENDING', carDocuments: [{ filename: name, originalName: 'car.pdf', path: victimUrl }] },
                },
            });
            const app = require('../../server');
            await require('../../services/prisma-database').connect();
            const get = async (actor) => (await request(app).get(victimUrl).set({ Authorization: `Bearer ${fx.tokens[actor]}` })).status;
            out.before = { victimS: await get('S'), attackerA: await get('A') };
            const prep = await request(app).post('/api/applications/prepare').set({ Authorization: `Bearer ${fx.tokens.A}` })
                .send({ applicationId: fx.apps.D, carDocuments: [{ path: victimUrl, originalName: 'mine.pdf' }] });
            out.prepare = prep.status;
            const holders = await raw.$queryRaw`SELECT id FROM applications WHERE "formData"->'carDocuments' @> ${JSON.stringify([{ path: victimUrl }])}::jsonb`;
            out.rowsListingThePath = holders.map((r) => (r.id === victim.id ? 'victim' : r.id === fx.apps.D ? 'attacker draft D' : r.id));
            const first = await raw.application.findFirst({
                where: { formData: { path: ['carDocuments'], array_contains: [{ path: victimUrl }] } }, select: { id: true },
            });
            out.ownerRecordFindFirstPicks = first?.id === victim.id ? 'victim' : first?.id === fx.apps.D ? 'attacker draft D' : first?.id;
            out.after = { victimS: await get('S'), attackerA: await get('A') };
            out.witnessMode = require('../../config/holder-read-witness').holderReadWitnessMode();
        } finally {
            fs.rmSync(disk, { force: true });
            await cleanupHolderScopeFixture(raw, fx);
            await raw.$disconnect();
            fs.writeFileSync('/tmp/submit-work/probe-67-car.json', `${JSON.stringify(out, null, 1)}\n`);
        }
    }, 120000);
});
