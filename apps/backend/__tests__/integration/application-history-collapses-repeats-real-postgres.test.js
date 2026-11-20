'use strict';

/**
 * Live walk 2026-10-07 F12: the wizard autosave writes one APPLICATION_DRAFT_SAVED event
 * every few seconds, and the applicant's timeline printed all 114 of them. The history
 * door now folds a run of identical events (same action, same actor, no status change, no
 * comment) into one entry that says how many times and since when. The stored audit trail
 * is not touched. Real Postgres, read through GET /applications/:id/history as the filer.
 */

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

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

d('application history folds repeated events (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = {};
    const at = (minute) => new Date(Date.UTC(2026, 9, 6, 3, minute)).toISOString();
    const saved = (minute, actorId) => ({ timestamp: at(minute), action: 'APPLICATION_DRAFT_SAVED', actorId, actorRole: 'health', metadata: { step: 2 } });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const org = await raw.organization.create({ data: { name: `ahc-${sfx}`, slug: `ahc-${sfx}`, code: `AHC_${sfx}`.toUpperCase() } });
        fx.orgId = org.id;
        fx.userId = crypto.randomUUID();
        fx.otherId = crypto.randomUUID();
        for (const [id, label] of [[fx.userId, 'filer'], [fx.otherId, 'colleague']]) {
            await raw.user.create({
                data: {
                    id, canonicalId: `ahc-${label}-${sfx}`, healthId: `ahc-${label}-${sfx}`, password: 'x', role: 'health',
                    authType: 'EMAIL_LEGACY', email: `ahc-${label}-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: label,
                    organizationId: fx.orgId,
                },
            });
        }
        const entity = await raw.entity.create({ data: { type: 'JURISTIC', displayName: 'บริษัท ประวัติ จำกัด', organizationId: fx.orgId } });
        fx.entityId = entity.id;
        await raw.entityMembership.create({ data: { userId: fx.userId, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: fx.orgId } });
        fx.history = [
            ...Array.from({ length: 114 }, (_, i) => saved(i % 60, fx.userId)),
            saved(59, fx.otherId),
            { timestamp: at(30), action: 'APPLICATION_PREPARED', actorId: fx.userId, actorRole: 'health' },
            saved(31, fx.userId),
            saved(32, fx.userId),
            { timestamp: at(40), action: 'WORKFLOW_TRANSITION', fromStatus: 'DRAFT', toStatus: 'PENDING_DOC_FEE', actorId: fx.userId, actorRole: 'health' },
            { timestamp: at(41), action: 'REVIEW_NOTE', actorRole: 'document_reviewer', comment: 'ขอสำเนาโฉนดหน้าหลัง' },
            { timestamp: at(42), action: 'REVIEW_NOTE', actorRole: 'document_reviewer', comment: 'ขอใบอนุญาตฉบับจริง' },
            { timestamp: at(43), action: 'REVIEW_NOTE', actorRole: 'document_reviewer' },
        ];
        fx.appId = (await raw.application.create({
            data: {
                applicationNumber: `APP-AHC-${sfx}`, healthId: `ahc-filer-${sfx}`, areaType: 'OUTDOOR', organizationId: fx.orgId,
                entityId: entity.id, submitterId: fx.userId, status: 'PENDING_DOC_FEE', workflowHistory: fx.history,
            },
        })).id;
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/applications'));
        mockActor.current = {
            id: fx.userId, canonicalId: `ahc-filer-${sfx}`, healthId: `ahc-filer-${sfx}`, role: 'health', canonicalRole: 'health', organizationId: fx.orgId,
        };
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.application.deleteMany({ where: { id: fx.appId } }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: fx.entityId } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: fx.entityId } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: [fx.userId, fx.otherId] } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    test('a run of autosaves is one entry with its count and first time; other events stay one each', async () => {
        const res = await request(app).get(`/api/applications/${fx.appId}/history`);
        expect(res.status).toBe(200);
        const rows = res.body.data.workflowHistory;
        expect(rows.map((r) => [r.action, r.repeatCount])).toEqual([
            ['APPLICATION_DRAFT_SAVED', 114],
            ['APPLICATION_DRAFT_SAVED', 1],
            ['APPLICATION_PREPARED', 1],
            ['APPLICATION_DRAFT_SAVED', 2],
            ['WORKFLOW_TRANSITION', 1],
            ['REVIEW_NOTE', 1],
            ['REVIEW_NOTE', 1],
            ['REVIEW_NOTE', 1],
        ]);
        expect(rows[0]).toEqual(expect.objectContaining({ firstTimestamp: at(0), timestamp: at(113 % 60), index: 114 }));
        expect(rows[3]).toEqual(expect.objectContaining({ firstTimestamp: at(31), timestamp: at(32) }));
        expect(rows[5].comment).toBe('ขอสำเนาโฉนดหน้าหลัง');
        expect(rows[6].comment).toBe('ขอใบอนุญาตฉบับจริง');
    });

    test('the stored audit trail keeps every event', async () => {
        const row = await raw.application.findUnique({ where: { id: fx.appId }, select: { workflowHistory: true } });
        expect(row.workflowHistory).toHaveLength(fx.history.length);
        expect(row.workflowHistory).toEqual(fx.history);
    });
});
