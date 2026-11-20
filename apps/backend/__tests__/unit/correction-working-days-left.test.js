'use strict';

/**
 * The working days left to a correction deadline, as GET /applications/:id/requirements
 * sends them beside each requested paper (requirements.js includeReviews).
 *
 * Staging walk ccc4f707d (F7): the revision page counted calendar days in the browser and
 * disagreed with the dispatcher's working-day board by a day. The server owns the holiday
 * calendar (utils/working-days.js, the single source), so it sends the count.
 */

const { correctionWorkingDaysLeft, correctionDaysLeftOf } = require('../../services/correction-windows');

const MONDAY_0900_BANGKOK = new Date('2026-11-03T02:00:00.000Z');

describe('correctionWorkingDaysLeft', () => {
    const now = MONDAY_0900_BANGKOK;

    it('counts working days, not calendar days, to the end of the deadline day', () => {
        // To the end of Tuesday 2026-11-11: eight calendar days, six working days.
        expect(correctionWorkingDaysLeft(new Date('2026-11-11T16:59:59.999Z'), now)).toBe(6);
    });

    it('is zero on the deadline day and negative once it has passed', () => {
        expect(correctionWorkingDaysLeft(new Date('2026-11-03T16:59:59.999Z'), now)).toBe(0);
        expect(correctionWorkingDaysLeft(new Date('2026-10-30T16:59:59.999Z'), now)).toBeLessThan(0);
    });

    it('is null when there is no deadline', () => {
        expect(correctionWorkingDaysLeft(null, now)).toBeNull();
    });
});

describe('correctionDaysLeftOf: the count arrives in the unit the window is written in', () => {
    const now = MONDAY_0900_BANGKOK;

    it('a document revision (order 28) is counted in working days only', () => {
        expect(correctionDaysLeftOf('REVISION_REQUESTED', { revisionDueAt: '2026-11-11T16:59:59.999Z' }, now))
            .toEqual({ workingDaysLeft: 6, calendarDaysLeft: null });
    });

    it('on-site evidence (order 56(2a)) is counted in Bangkok calendar days only', () => {
        expect(correctionDaysLeftOf('CAR_PENDING', { carDueAt: '2026-12-03T16:59:59.999Z' }, now))
            .toEqual({ workingDaysLeft: null, calendarDaysLeft: 30 });
    });

    it('calendar days are Bangkok days: late Friday evening Bangkok is still Friday', () => {
        const fridayNight = new Date('2026-11-06T16:30:00.000Z');
        expect(correctionDaysLeftOf('CAR_PENDING', { carDueAt: '2026-11-09T16:59:59.999Z' }, fridayNight).calendarDaysLeft).toBe(3);
    });

    it('is negative once past and null in a status that owes no correction', () => {
        expect(correctionDaysLeftOf('CAR_PENDING', { carDueAt: '2026-10-30T16:59:59.999Z' }, now).calendarDaysLeft).toBe(-4);
        expect(correctionDaysLeftOf('SUBMITTED', { revisionDueAt: '2026-11-11T16:59:59.999Z', carDueAt: '2026-12-03T16:59:59.999Z' }, now))
            .toEqual({ workingDaysLeft: null, calendarDaysLeft: null });
    });
});
