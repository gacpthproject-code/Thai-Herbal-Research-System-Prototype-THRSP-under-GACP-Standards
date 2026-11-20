'use strict';

/**
 * One row of GET /applications/my (applications-helpers.mapHealthApplication), as the
 * applicant's list card reads it.
 *
 * The staging walk of ccc4f707d found the card reading "-" for every farm (F4) and a revision
 * countdown that disagreed with the dispatcher's by a day (F7). The row never carried the
 * site, and the deadline travelled as a timestamp the browser turned into calendar days by
 * hours, while the dispatcher's board counts working days on the server
 * (scheduler.js countWorkingDaysBetween). The server owns the holiday calendar
 * (utils/working-days.js is the single source), so the row carries the count.
 */

const { mapHealthApplication } = require('../../routes/api/helpers/applications-helpers');
const { countWorkingDaysBetween } = require('../../utils/working-days');
const { correctionDaysLeftOf } = require('../../services/correction-windows');

const base = {
    id: 'app-1',
    applicationNumber: 'APP-2569-TEST01',
    status: 'DRAFT',
    createdAt: new Date('2026-10-31T10:00:00.000Z'),
};

describe('GET /applications/my row: site and working days', () => {
    it('carries the site name the six-step wizard stores under farmData.siteName', () => {
        const row = mapHealthApplication({ ...base, formData: { farmData: { siteName: 'แปลงทดสอบ wc4', siteAddress: '99 หมู่ 1' } } });
        expect(row.farmName).toBe('แปลงทดสอบ wc4');
    });

    it('falls back to the previous wizard\'s farmName and sends null when neither is stated', () => {
        expect(mapHealthApplication({ ...base, formData: { farmData: { farmName: 'ไร่เก่า' } } }).farmName).toBe('ไร่เก่า');
        expect(mapHealthApplication({ ...base, formData: {} }).farmName).toBeNull();
    });

    it('counts the revision window in working days from the server\'s calendar', () => {
        // Monday 2026-11-03 09:00 Bangkok to the end of Tuesday 2026-11-11: eight calendar days, six working days.
        const now = new Date('2026-11-03T02:00:00.000Z');
        const revisionDueAt = '2026-11-11T16:59:59.999Z';
        const row = mapHealthApplication({ ...base, status: 'REVISION_REQUESTED', formData: { revisionDueAt } }, { now });
        expect(row.revisionDueAt).toBe(revisionDueAt);
        expect(row.revisionWorkingDaysLeft).toBe(countWorkingDaysBetween(now, new Date(revisionDueAt)));
        expect(row.revisionWorkingDaysLeft).toBe(6);
    });

    it('sends no working-day count when there is no revision deadline', () => {
        expect(mapHealthApplication({ ...base, formData: {} }).revisionWorkingDaysLeft).toBeNull();
    });

    it('sends the working-day count only while the filing waits in REVISION_REQUESTED (review M4)', () => {
        const now = new Date('2026-11-03T02:00:00.000Z');
        const stale = { revisionDueAt: '2026-11-11T16:59:59.999Z' };
        expect(mapHealthApplication({ ...base, status: 'SUBMITTED', formData: stale }, { now }).revisionWorkingDaysLeft).toBeNull();
        expect(mapHealthApplication({ ...base, status: 'ASSIGNED_FOR_REVIEW', formData: stale }, { now }).revisionWorkingDaysLeft).toBeNull();
        expect(mapHealthApplication({ ...base, status: 'CAR_PENDING', formData: { ...stale, carDueAt: '2026-12-03T16:59:59.999Z' } }, { now }).revisionWorkingDaysLeft).toBeNull();
    });

    it('counts the CAR window in Bangkok calendar days from the server, the count the CAR page reads', () => {
        const now = new Date('2026-11-03T16:30:00.000Z');
        const carDueAt = '2026-11-06T16:59:59.999Z';
        const row = mapHealthApplication({ ...base, status: 'CAR_PENDING', formData: { carDueAt } }, { now });
        expect(row.carDueAt).toBe(carDueAt);
        expect(row.carCalendarDaysLeft).toBe(correctionDaysLeftOf('CAR_PENDING', { carDueAt }, now).calendarDaysLeft);
        expect(row.carCalendarDaysLeft).toBe(3);
        expect(row.revisionWorkingDaysLeft).toBeNull();
    });

    it('sends the calendar-day count only while the filing waits in CAR_PENDING', () => {
        const now = new Date('2026-11-03T16:30:00.000Z');
        const formData = { carDueAt: '2026-11-06T16:59:59.999Z' };
        expect(mapHealthApplication({ ...base, status: 'CAR_REVIEWING', formData }, { now }).carCalendarDaysLeft).toBeNull();
        expect(mapHealthApplication({ ...base, status: 'CAR_PENDING', formData: {} }, { now }).carCalendarDaysLeft).toBeNull();
    });

    it('survives Array.prototype.map handing it the index as its second argument (review M3)', () => {
        const rows = [{ ...base, status: 'REVISION_REQUESTED', formData: { revisionDueAt: '2026-11-11T16:59:59.999Z' } }].map(mapHealthApplication);
        expect(typeof rows[0].revisionWorkingDaysLeft).toBe('number');
    });
});
