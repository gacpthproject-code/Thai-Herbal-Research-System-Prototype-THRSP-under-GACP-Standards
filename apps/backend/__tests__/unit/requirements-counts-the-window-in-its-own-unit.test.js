'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
    const attach = (req, _res, next) => {
        req.user = { id: 'user-A', role: 'health', canonicalRole: 'health' };
        next();
    };
    return { authenticateAny: attach, authenticateHealth: attach };
});
jest.mock('../../services/application-service', () => ({
    resolveHealthIdentity: jest.fn(async () => ({ userId: 'user-A', healthId: 'health-A' })),
}));
jest.mock('../../services/holder-access', () => ({
    holderScope: jest.fn(async () => ({ entityIds: ['ent-A'] })),
    holderReadWhere: jest.fn(() => ({})),
}));

const mockDb = { application: null, reviews: [] };
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        application: { findFirst: jest.fn(async () => mockDb.application) },
        applicationDocument: { findMany: jest.fn(async () => []) },
        applicationDocumentReview: { findMany: jest.fn(async () => mockDb.reviews) },
    },
}));
jest.mock('../../services/application-requirements-service', () => ({
    resolveApplicationRequirements: jest.fn(async () => ({
        slots: [], blockingIssues: [], missingRequired: [], complete: true, appliedRules: [], requiredSlotIds: [],
    })),
}));
jest.mock('../../services/document-precheck/service', () => ({
    currentForSlots: jest.fn(async () => ({})),
    precheckViewFor: jest.fn(() => null),
}));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const { onsiteCorrectionDueAt } = require('../../services/correction-windows');
const { addWorkingDays } = require('../../utils/working-days');
const { PAYMENT } = require('../../config/business-rules');

function buildApp() {
    const app = express();
    app.use('/api/applications', require('../../routes/api/applications/requirements'));
    return app;
}

function seed(status, formData) {
    mockDb.application = { id: 'app-A', healthId: 'health-A', entityId: 'ent-A', isDeleted: false, status, formData, entity: null };
    mockDb.reviews = [
        { id: 'rev-1', applicationId: 'app-A', round: 1, slotId: 'land_rights', verdict: 'MORE_REQUESTED', reason: 'อ่านไม่ออก', createdAt: new Date('2026-11-03T05:00:00.000Z') },
    ];
}

async function requestedRow() {
    const res = await request(buildApp()).get('/api/applications/app-A/requirements?includeReviews=1');
    expect(res.status).toBe(200);
    expect(res.body.data.requestedDocuments).toHaveLength(1);
    return res.body.data.requestedDocuments[0];
}

describe('GET /applications/:id/requirements?includeReviews=1 counts the window in its own unit', () => {
    test('CAR_PENDING: the thirty-day on-site window is sent as calendar days, never as working days', async () => {
        const carDueAt = onsiteCorrectionDueAt(new Date());
        seed('CAR_PENDING', { carDueAt: carDueAt.toISOString() });

        const row = await requestedRow();
        expect(row.dueDate).toBe(carDueAt.toISOString());
        expect(row.workingDaysLeft).toBeNull();
        expect(row.calendarDaysLeft).toBe(30);
    });

    test('REVISION_REQUESTED: the five-working-day document window is sent as working days only', async () => {
        const revisionDueAt = addWorkingDays(new Date(), PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS);
        seed('REVISION_REQUESTED', { revisionDueAt: revisionDueAt.toISOString() });

        const row = await requestedRow();
        expect(row.dueDate).toBe(revisionDueAt.toISOString());
        expect(row.workingDaysLeft).toBe(PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS);
        expect(row.calendarDaysLeft).toBeNull();
    });

    test('any other status owes no correction: no deadline and no count, whatever the filing still stamps', async () => {
        seed('ASSIGNED_FOR_REVIEW', { revisionDueAt: '2026-11-11T16:59:59.999Z', carDueAt: '2026-12-03T16:59:59.999Z' });

        const row = await requestedRow();
        expect(row.dueDate).toBeNull();
        expect(row.workingDaysLeft).toBeNull();
        expect(row.calendarDaysLeft).toBeNull();
    });
});
