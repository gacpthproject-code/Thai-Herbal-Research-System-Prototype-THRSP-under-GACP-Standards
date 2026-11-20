'use strict';

const { closureGraceDaysAt, graceElapsed } = require('../../services/billing/closure-grace');
const { localWallClock } = require('../../utils/working-days');

const REGISTER = [
    { effectiveFrom: '2026-10-07', calendarDays: 7 },
    { effectiveFrom: '2027-01-01', calendarDays: 10 },
];

describe('closureGraceDaysAt — dated, Bangkok days', () => {
    test('before the first effectiveFrom no rule is in force', () => {
        expect(closureGraceDaysAt(new Date(localWallClock('2026-10-07', '00:00').getTime() - 1), REGISTER)).toBeNull();
    });
    test('from the first Bangkok midnight the first rule binds', () => {
        expect(closureGraceDaysAt(localWallClock('2026-10-07', '00:00'), REGISTER)).toBe(7);
    });
    test('a later entry replaces the earlier one only from its own day', () => {
        expect(closureGraceDaysAt(localWallClock('2026-12-31', '23:59'), REGISTER)).toBe(7);
        expect(closureGraceDaysAt(localWallClock('2027-01-01', '00:00'), REGISTER)).toBe(10);
    });
    test('the shipped register holds 7 days in force today', () => {
        expect(closureGraceDaysAt(localWallClock('2026-10-07', '12:00'))).toBe(7);
    });
});

describe('graceElapsed', () => {
    const sent = new Date('2026-11-01T02:00:00.000Z');
    test('6 days is not enough, 7 days is', () => {
        expect(graceElapsed(sent, 7, new Date(sent.getTime() + 6 * 86400e3))).toBe(false);
        expect(graceElapsed(sent, 7, new Date(sent.getTime() + 7 * 86400e3))).toBe(true);
    });
});
