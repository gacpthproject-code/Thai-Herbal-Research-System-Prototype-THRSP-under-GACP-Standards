/**
 * The correction-deadline sweep on real Postgres (security re-review 2026-10-09 M2 and I3, the
 * dispatcher-defaults memo's "move the reminders into the backend's own scheduler"):
 * every revision or corrective-action round gets its own 48 and 24 hour reminders, one odd filing
 * never stops the run, and an expiry never lands on a resubmission that committed meanwhile.
 *
 * The sweep reads every waiting application in the database, so its read is narrowed to this
 * file's rows, and the notice is a recorder: who is told is application-parties' own test.
 */

'use strict';

process.env.CRON_SECRET = 'cds-cron-secret-for-this-suite-only';

const express = require('express');
const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');
const { waitUntilQueued } = require('./fixtures/row-lock-race');

const HOUR = 60 * 60 * 1000;

d('correction-deadline sweep (real Postgres)', () => {
    let world;
    let fx;
    let app;
    const reminded = [];
    const unreachable = new Set();

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'cds' });
        ({ fx } = world);
        const narrowed = world.narrowedToThisWorld(world.raw);
        jest.doMock('../../services/prisma-database', () => ({ prisma: narrowed }));
        jest.doMock('../../services/notification-service', () => ({
            ...jest.requireActual('../../services/notification-service'),
            notifyRevisionDeadlineApproaching: jest.fn(async (applicationId, hours, opts) => {
                if (unreachable.has(applicationId)) { return null; }
                reminded.push({ applicationId, hours, deadlineType: opts.deadlineType });
                return { delivered: 1 };
            }),
        }));
        app = express();
        app.use('/api/cron', require('../../routes/api/system/cron'));
    });

    afterAll(async () => { await world.cleanup(); });

    const remindersOf = (applicationId) => reminded.filter((r) => r.applicationId === applicationId).map((r) => r.hours);
    const runByHand = () => request(app).get('/api/cron/auto-cancel').set('x-cron-secret', process.env.CRON_SECRET);
    const waitingOnRevision = (dueAt, formData = {}) => world.application('REVISION_REQUESTED', {
        milestones: ['M1'], reviewerId: fx.reviewerA.id, formData: { revisionDueAt: dueAt.toISOString(), ...formData },
    });

    test('a second revision round gets its own 48 and 24 hour reminders, though the first round\'s record is still on the filing', async () => {
        const { runCorrectionDeadlineSweep: sweep } = require('../../jobs/correction-deadline-sweep');
        const firstDue = new Date(Date.now() + 10 * 24 * HOUR);
        const row = await waitingOnRevision(firstDue);
        await sweep({ now: new Date(firstDue.getTime() - 47 * HOUR) });
        await sweep({ now: new Date(firstDue.getTime() - 23 * HOUR) });
        await sweep({ now: new Date(firstDue.getTime() - 22 * HOUR) });
        expect(remindersOf(row.id)).toEqual([48, 24]);

        // The next round: the officer asks again and stamps a new deadline over the same filing,
        // which still carries the first round's record (the resubmission merges the filing).
        const secondDue = new Date(firstDue.getTime() + 7 * 24 * HOUR);
        const stored = (await world.rowOf(row.id)).formData;
        expect(stored.deadlineReminders).toMatchObject({ dueAt: firstDue.toISOString() });
        await world.raw.application.update({ where: { id: row.id }, data: { formData: { ...stored, revisionDueAt: secondDue.toISOString() } } });
        await sweep({ now: new Date(secondDue.getTime() - 47 * HOUR) });
        await sweep({ now: new Date(secondDue.getTime() - 23 * HOUR) });
        expect(remindersOf(row.id)).toEqual([48, 24, 48, 24]);
    });

    test('run by hand, a round whose deadline is new is reminded even with the earlier round\'s reminder recorded', async () => {
        const earlierDue = new Date(Date.now() - 5 * 24 * HOUR);
        const row = await waitingOnRevision(new Date(Date.now() + 40 * HOUR), {
            revisionReminder48hSentAt: new Date(earlierDue.getTime() - 47 * HOUR).toISOString(),
            deadlineReminders: { dueAt: earlierDue.toISOString(), sent: { 48: new Date(earlierDue.getTime() - 47 * HOUR).toISOString() } },
        });
        const res = await runByHand();
        expect(res.status).toBe(200);
        expect(remindersOf(row.id)).toEqual([48]);
    });

    test('a reminder that reached nobody leaves no record, and the next run sends it', async () => {
        const row = await waitingOnRevision(new Date(Date.now() + 12 * HOUR));
        unreachable.add(row.id);
        expect((await runByHand()).status).toBe(200);
        expect((await world.rowOf(row.id)).formData.deadlineReminders).toEqual({ dueAt: expect.any(String), sent: {} });
        expect(remindersOf(row.id)).toEqual([]);
        unreachable.delete(row.id);
        expect((await runByHand()).status).toBe(200);
        expect(remindersOf(row.id)).toEqual([24]);
    });

    test('a filing that is not an object is skipped; the run goes on and the others are reminded (I3)', async () => {
        const due = new Date(Date.now() + 12 * HOUR);
        const fine = await waitingOnRevision(due);
        const odd = await waitingOnRevision(due);
        await world.raw.$executeRaw`UPDATE applications SET "formData" = 'null'::jsonb WHERE id = ${odd.id}`;
        await world.raw.revisionDeadline.create({ data: { applicationId: odd.id, organizationId: fx.orgA, revisionDue: due, status: 'PENDING', revisionCount: 1 } });
        const res = await runByHand();
        expect(res.status).toBe(200);
        expect(remindersOf(fine.id)).toEqual([24]);
        expect(remindersOf(odd.id)).toEqual([]);
        expect((await world.rowOf(odd.id)).status).toBe('REVISION_REQUESTED');
    });

    test('an expiry read before the applicant\'s resubmission committed does not cancel the resubmission', async () => {
        const row = await waitingOnRevision(new Date(Date.now() - HOUR));
        let pending;
        await world.raw.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM applications WHERE id = ${row.id} FOR UPDATE`;
            await tx.$executeRaw`UPDATE applications SET status = 'ASSIGNED_FOR_REVIEW', "formData" = "formData" || '{"workflowState":"ASSIGNED_FOR_REVIEW"}'::jsonb, version = version + 1 WHERE id = ${row.id}`;
            const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
            pending = runByHand().then((res) => res);
            await waitUntilQueued(world.raw, pid, 1, 15000);
        }, { timeout: 30000, maxWait: 10000 });
        const res = await pending;
        expect(res.status).toBe(200);
        expect((await world.rowOf(row.id)).status).toBe('ASSIGNED_FOR_REVIEW');
    });
});
