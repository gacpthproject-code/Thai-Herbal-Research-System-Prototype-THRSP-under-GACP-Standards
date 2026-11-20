'use strict';

/**
 * CAR deadline helper (workflow audit 2026-06-11, HIGH). An on-site correction round starts the
 * corrective-action clock; services/onsite-correction.js seeds its RevisionDeadline row in the
 * decision's transaction (onsite-correction-has-one-opener.test.js). Since operator order 56(2a)
 * (2026-10-09) that clock is 30 calendar days, separate from the 5-working-day document revision
 * of order 28.
 */

const { computeCarDueDate } = require('../../services/car-deadline-service');
const { correctionWindowText } = require('../../services/correction-windows');

describe('car-deadline-service', () => {
    it('a corrective action decided on 15 Oct 2026 is due at the end of 14 Nov 2026, Bangkok: 30 calendar days', () => {
        // 10:00 Bangkok on Thu 15 Oct. Day 30 is Sat 14 Nov: calendar days do not move off a weekend.
        const due = computeCarDueDate(new Date('2026-10-15T03:00:00Z'));
        expect(due.toISOString()).toBe('2026-11-14T16:59:59.999Z');
    });

    it('the Bangkok day decides, not the time of day: 00:00 and 23:30 on 15 Oct are both due 14 Nov', () => {
        expect(computeCarDueDate(new Date('2026-10-14T17:00:00Z')).toISOString()).toBe('2026-11-14T16:59:59.999Z');
        expect(computeCarDueDate(new Date('2026-10-15T16:30:00Z')).toISOString()).toBe('2026-11-14T16:59:59.999Z');
    });

    it('the applicant is told the window the deadline was set with', () => {
        expect(correctionWindowText('CAR_PENDING', new Date('2026-10-15T03:00:00Z'))).toBe('ไม่ส่งหลักฐานการแก้ไขข้อบกพร่องภายใน 30 วัน');
        expect(correctionWindowText('REVISION_REQUESTED', new Date('2026-10-15T03:00:00Z'))).toBe('ไม่ส่งเอกสารแก้ไขภายใน 5 วันทำการ');
    });
});
