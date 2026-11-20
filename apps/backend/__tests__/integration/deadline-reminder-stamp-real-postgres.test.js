'use strict';

/**
 * The revision-deadline reminder records that it was sent (security re-review 2026-10-09 N3).
 *
 * GET /api/cron/auto-cancel runs the correction-deadline sweep: it reads every application waiting on
 * a revision or CAR deadline, records the reminder and sends it. It used to write back the whole
 * formData it had read at the start of the run, so whatever the applicant or an officer saved while
 * the notice went out was erased. The record touches only its own key (formData.deadlineReminders,
 * keyed to the deadline it is about, security re-review M2), and only while the application still
 * waits.
 *
 * Real Postgres. The sweep is scoped to this file's rows (the route reads every waiting application
 * in the database), and the notice is replaced by a stub that commits the other party's write while
 * the reminder is being sent.
 */

process.env.CRON_SECRET = 'a4c-cron-secret-for-this-suite-only';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

d('the deadline reminder stamps only its own field (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { appIds: [], meanwhile: null };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.org = (await raw.organization.create({ data: { name: `rs-${sfx}`, slug: `rs-${sfx}`, code: `RS_${sfx}`.toUpperCase() } })).id;
        fx.healthId = `rs-applicant-${sfx}`;
        fx.userId = (await raw.user.create({
            data: {
                canonicalId: fx.healthId, healthId: fx.healthId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `rs-${sfx}@example.test`, firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.org,
            },
        })).id;

        jest.doMock('../../services/prisma-database', () => ({
            prisma: {
                application: {
                    findMany: (args) => raw.application.findMany({ ...args, where: { ...args.where, id: { in: fx.appIds } } }),
                    update: (args) => raw.application.update(args),
                },
                $executeRaw: (...args) => raw.$executeRaw(...args),
                $transaction: (...args) => raw.$transaction(...args),
            },
        }));
        jest.doMock('../../services/notification-service', () => ({
            ...jest.requireActual('../../services/notification-service'),
            notifyRevisionDeadlineApproaching: jest.fn(async (applicationId) => {
                if (fx.meanwhile) { await fx.meanwhile(applicationId); }
                return { id: `n-${applicationId}` };
            }),
        }));
        app = express();
        app.use('/api/cron', require('../../routes/api/system/cron'));
    });

    afterAll(async () => {
        await raw.application.deleteMany({ where: { id: { in: fx.appIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: fx.userId } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.org } }).catch(() => {});
        await raw.$disconnect();
    });

    async function waitingOnRevision(tag) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-RS-${tag}-${sfx}`, healthId: fx.healthId, areaType: 'OUTDOOR', organizationId: fx.org,
                status: 'REVISION_REQUESTED',
                formData: {
                    workflowState: 'REVISION_REQUESTED',
                    revisionDueAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
                    applicantData: { phone: '0812345678' },
                },
            },
        });
        fx.appIds.push(row.id);
        return row;
    }
    const sweep = () => request(app).get('/api/cron/auto-cancel').set('x-cron-secret', process.env.CRON_SECRET);
    const formDataOf = async (id) => (await raw.application.findUnique({ where: { id } })).formData;

    test('control: nothing else happened, the reminder is stamped and the filing is as it was', async () => {
        const row = await waitingOnRevision('C');
        fx.meanwhile = null;

        const res = await sweep();

        expect(res.status).toBe(200);
        const stored = await formDataOf(row.id);
        expect(stored.deadlineReminders).toEqual({ dueAt: stored.revisionDueAt, sent: { 24: expect.any(String) } });
        expect(stored.applicantData).toEqual({ phone: '0812345678' });
    });

    test('the applicant resubmits while the reminder goes out: the resubmission stays, and the record names only the deadline it was about', async () => {
        const row = await waitingOnRevision('R');
        fx.meanwhile = async (applicationId) => {
            const current = await formDataOf(applicationId);
            // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: the applicant's resubmission, committed during the notice
            await raw.application.update({
                where: { id: applicationId },
                data: {
                    status: 'ASSIGNED_FOR_REVIEW',
                    formData: { ...current, workflowState: 'ASSIGNED_FOR_REVIEW', applicantData: { phone: '0899999999' } },
                },
            });
        };

        const res = await sweep();

        fx.meanwhile = null;
        expect(res.status).toBe(200);
        const stored = await formDataOf(row.id);
        expect([stored.workflowState, stored.applicantData.phone]).toEqual(['ASSIGNED_FOR_REVIEW', '0899999999']);
        expect(stored.deadlineReminders.dueAt).toBe(row.formData.revisionDueAt);
    });

    test('an officer saves the filing while the reminder goes out: both the save and the stamp stay', async () => {
        const row = await waitingOnRevision('O');
        fx.meanwhile = async (applicationId) => {
            const current = await formDataOf(applicationId);
            await raw.application.update({
                where: { id: applicationId },
                data: { formData: { ...current, _lastReviewComment: 'แนบโฉนดหน้าหลังด้วย' } },
            });
        };

        const res = await sweep();

        fx.meanwhile = null;
        expect(res.status).toBe(200);
        const stored = await formDataOf(row.id);
        expect(stored._lastReviewComment).toBe('แนบโฉนดหน้าหลังด้วย');
        expect(stored.deadlineReminders).toEqual({ dueAt: stored.revisionDueAt, sent: { 24: expect.any(String) } });
    });

    test('an officer\'s save read before the reminder was recorded and written while it goes out: the record is written again', async () => {
        const row = await waitingOnRevision('S');
        const before = await formDataOf(row.id);
        fx.meanwhile = async (applicationId) => {
            await raw.application.update({
                where: { id: applicationId },
                data: { formData: { ...before, _lastReviewComment: 'แนบโฉนดหน้าหลังด้วย' } },
            });
        };

        const res = await sweep();

        fx.meanwhile = null;
        expect(res.status).toBe(200);
        const stored = await formDataOf(row.id);
        expect(stored._lastReviewComment).toBe('แนบโฉนดหน้าหลังด้วย');
        expect(stored.deadlineReminders).toEqual({ dueAt: stored.revisionDueAt, sent: { 24: expect.any(String) } });
    });
});
