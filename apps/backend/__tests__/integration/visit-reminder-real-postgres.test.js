/**
 * The reminder before a field visit (operator order 56(1) 3.3, 2026-10-09), on real Postgres: two
 * Bangkok working days before the visit the applicant and the holder are told the day, the time and
 * the place in the approved words, once per visit, and nobody can mute it.
 *
 * The job reads every booked visit in the database, so its read is narrowed to this file's rows.
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { createDispatcherWorld } = require('./fixtures/dispatcher-world');
const { addWorkingDays, startOfLocalDay, isWorkingDay, getZonedParts } = require('../../utils/working-days');

const mockNotice = { throwFor: null };
jest.mock('../../services/notification/application-parties', () => {
    const actual = jest.requireActual('../../services/notification/application-parties');
    return {
        ...actual,
        notifyApplicationParties: async (applicationId, ...rest) => {
            if (applicationId === mockNotice.throwFor) {
                mockNotice.throwFor = null;
                throw new Error('test: the notice store is unavailable');
            }
            return actual.notifyApplicationParties(applicationId, ...rest);
        },
    };
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

/** 09:30 Bangkok on the `n`th working day from today. */
function visitOn(n) {
    return new Date(startOfLocalDay(addWorkingDays(new Date(), n)).getTime() + 9.5 * HOUR);
}

/** The start of the Bangkok working day two working days before `visitAt`, counted without the code under test. */
function twoWorkingDaysBefore(visitAt) {
    let day = startOfLocalDay(visitAt);
    let counted = 0;
    while (counted < 2) {
        day = startOfLocalDay(new Date(day.getTime() - 12 * HOUR));
        if (isWorkingDay(day)) { counted += 1; }
    }
    return day;
}

function thaiDate(at) {
    const { year, month, day } = getZonedParts(at);
    return `${day} ${THAI_MONTHS[month - 1]} ${year + 543}`;
}

d('the reminder before a field visit (real Postgres)', () => {
    let world;
    let fx;
    let run;

    beforeAll(async () => {
        world = await createDispatcherWorld({ tag: 'vrm' });
        ({ fx } = world);
        jest.doMock('../../services/prisma-database', () => {
            const actual = jest.requireActual('../../services/prisma-database');
            return { ...actual, prisma: world.narrowedToThisWorld(actual.prisma) };
        });
        ({ runVisitReminders: run } = require('../../jobs/visit-reminder-job'));
    });

    afterAll(async () => { await world.cleanup(); });

    const remindersOf = (userId, applicationNumber) => world.raw.notification.findMany({
        where: { userId, type: 'AUDIT_VISIT_REMINDER', message: { contains: applicationNumber } },
    });

    /** A visit booked a week before its reminder day, at the place the dispatcher typed. */
    async function bookedVisit(visitAt, { place = 'แปลงสาธิต บ้านดอยคำ', bookedAt } = {}) {
        return world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitAt,
            formData: {
                auditSchedule: {
                    scheduledDate: visitAt.toISOString(), auditorId: fx.inspectorA.id, location: place,
                    scheduledAt: (bookedAt || new Date(twoWorkingDaysBefore(visitAt).getTime() - 7 * DAY)).toISOString(),
                },
            },
        });
    }

    test('from two working days before the visit the applicant and the holder are told once, in the approved words', async () => {
        const visitAt = visitOn(6);
        const remindFrom = twoWorkingDaysBefore(visitAt);
        const row = await bookedVisit(visitAt);

        await run({ now: new Date(remindFrom.getTime() - 60 * 1000) });
        expect(await remindersOf(fx.applicant.id, row.applicationNumber)).toHaveLength(0);

        await run({ now: new Date(remindFrom.getTime() + HOUR) });
        const [told] = await remindersOf(fx.applicant.id, row.applicationNumber);
        expect(told.message).toBe(
            `คำขอเลขที่ ${row.applicationNumber} มีนัดตรวจพื้นที่วันที่ ${thaiDate(visitAt)} เวลา 09:30 น. ที่ แปลงสาธิต บ้านดอยคำ `
            + 'กรุณาเตรียมเอกสารและผู้ติดต่อหน้างานให้พร้อม หากต้องการเลื่อนนัด กรุณาแจ้งผ่านหน้าคำขอโดยเร็ว',
        );
        expect(await remindersOf(fx.holderMember.id, row.applicationNumber)).toHaveLength(1);

        await run({ now: new Date(remindFrom.getTime() + 2 * HOUR) });
        expect(await remindersOf(fx.applicant.id, row.applicationNumber)).toHaveLength(1);
        expect((await world.rowOf(row.id)).formData.visitReminder).toMatchObject({ forVisit: visitAt.toISOString() });
    });

    test('a member who muted visit reminders still gets this one', async () => {
        const muted = await world.healthUser('muted', fx.orgA);
        await world.raw.user.update({ where: { id: muted.id }, data: { notificationSettings: { channels: { AUDIT_VISIT_REMINDER: { inApp: false }, AUDIT_SCHEDULED: { inApp: false } } } } });
        await world.raw.entityMembership.create({ data: { userId: muted.id, entityId: fx.entityA, role: 'ADMIN', status: 'ACTIVE', organizationId: fx.orgA } });
        const visitAt = visitOn(7);
        const row = await bookedVisit(visitAt);
        await run({ now: new Date(twoWorkingDaysBefore(visitAt).getTime() + HOUR) });
        expect(await remindersOf(muted.id, row.applicationNumber)).toHaveLength(1);
        await world.raw.entityMembership.deleteMany({ where: { userId: muted.id } });
    });

    test('a visit moved to another day is reminded again for the new day', async () => {
        const first = visitOn(8);
        const row = await bookedVisit(first);
        await run({ now: new Date(twoWorkingDaysBefore(first).getTime() + HOUR) });
        expect(await remindersOf(fx.applicant.id, row.applicationNumber)).toHaveLength(1);

        const moved = visitOn(11);
        const stored = (await world.rowOf(row.id)).formData;
        await world.raw.application.update({
            where: { id: row.id },
            data: { scheduledDate: moved, formData: { ...stored, auditSchedule: { ...stored.auditSchedule, scheduledDate: moved.toISOString(), rescheduledAt: first.toISOString() } } },
        });
        await run({ now: new Date(twoWorkingDaysBefore(moved).getTime() + HOUR) });
        const told = await remindersOf(fx.applicant.id, row.applicationNumber);
        expect(told).toHaveLength(2);
        expect(told.map((notice) => notice.message).join(' ')).toContain(thaiDate(moved));
    });

    test('a visit booked on its reminder day is not reminded: the booking notice has just told them', async () => {
        const visitAt = visitOn(9);
        const remindFrom = twoWorkingDaysBefore(visitAt);
        const row = await bookedVisit(visitAt, { bookedAt: new Date(remindFrom.getTime() + 30 * 60 * 1000) });
        await run({ now: new Date(remindFrom.getTime() + HOUR) });
        expect(await remindersOf(fx.applicant.id, row.applicationNumber)).toHaveLength(0);
    });

    test('with no place typed, the site the filing names is told', async () => {
        const visitAt = visitOn(10);
        const row = await bookedVisit(visitAt, { place: '' });
        await run({ now: new Date(twoWorkingDaysBefore(visitAt).getTime() + HOUR) });
        const [told] = await remindersOf(fx.applicant.id, row.applicationNumber);
        expect(told.message).toContain('ที่ แปลงทดสอบผู้จัดคิว 99 หมู่ 1 ทดสอบ เมือง เชียงใหม่ กรุณา');
    });

    test('a reminder that reached nobody leaves no record, and the next run sends it', async () => {
        const lonely = await world.healthUser('lonely', fx.orgA);
        const visitAt = visitOn(12);
        const row = await world.application('AUDIT_CONFIRMED', {
            milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitAt,
            entityId: null, submitterId: lonely.id, healthId: lonely.canonicalId,
            formData: { auditSchedule: { scheduledDate: visitAt.toISOString(), location: 'แปลงเดี่ยว', scheduledAt: new Date(Date.now() - DAY).toISOString() } },
        });
        await world.raw.user.update({ where: { id: lonely.id }, data: { status: 'SUSPENDED' } });
        const now = new Date(twoWorkingDaysBefore(visitAt).getTime() + HOUR);
        await run({ now });
        expect((await world.rowOf(row.id)).formData.visitReminder).toBeUndefined();

        await world.raw.user.update({ where: { id: lonely.id }, data: { status: 'ACTIVE' } });
        await run({ now: new Date(now.getTime() + HOUR) });
        expect(await remindersOf(lonely.id, row.applicationNumber)).toHaveLength(1);
    });

    test('a reminder whose notice throws leaves no record, and the next run sends it', async () => {
        const visitAt = visitOn(13);
        const row = await bookedVisit(visitAt);
        const now = new Date(twoWorkingDaysBefore(visitAt).getTime() + HOUR);

        mockNotice.throwFor = row.id;
        await run({ now });
        expect(mockNotice.throwFor).toBeNull();
        expect((await world.rowOf(row.id)).formData.visitReminder).toBeUndefined();

        await run({ now: new Date(now.getTime() + HOUR) });
        expect(await remindersOf(fx.applicant.id, row.applicationNumber)).toHaveLength(1);
        expect(await remindersOf(fx.holderMember.id, row.applicationNumber)).toHaveLength(1);
    });
});
