/**
 * The applicant's screen may not be more permissive than the door.
 *
 * Every rule here mirrors assertRevisionSlotsRefreshed. The mirror does not
 * enforce anything — the server refuses regardless — it means an applicant
 * learns "you still have one paper to replace" from a disabled button and a
 * highlighted row, instead of from a 409 after pressing it.
 *
 * If the two ever disagree, the SERVER is right and this is the bug.
 */

import {
    isReplaced, submitState, daysLeftLabel, REVISION_COPY_TH,
    type RequestedDocument,
} from '../revision-state';

const ASKED = '2026-09-05T10:00:00.000Z';

const doc = (over: Partial<RequestedDocument> = {}): RequestedDocument => ({
    slotId: 'land_rights',
    labelTH: 'สำเนาเอกสารสิทธิ์ที่ดิน',
    reason: 'สำเนาโฉนดอ่านเลขที่ไม่ออก',
    dueDate: '2026-09-12T00:00:00.000Z',
    requestedAt: ASKED,
    uploadedAt: null,
    ...over,
});

describe('has the paper actually been replaced', () => {
    test('a newer upload counts', () => {
        expect(isReplaced(doc({ uploadedAt: '2026-09-06T10:00:00.000Z' }))).toBe(true);
    });

    test('the file that was already there does not — it was attached when the officer refused it', () => {
        expect(isReplaced(doc({ uploadedAt: '2026-09-01T10:00:00.000Z' }))).toBe(false);
    });

    test('no file at all does not', () => {
        expect(isReplaced(doc({ uploadedAt: null }))).toBe(false);
    });

    test('the exact instant of the request does not — it cannot have been a response', () => {
        expect(isReplaced(doc({ uploadedAt: ASKED }))).toBe(false);
    });

    test('an unreadable date is treated as not replaced, never as replaced', () => {
        expect(isReplaced(doc({ uploadedAt: 'ไม่ใช่วันที่' }))).toBe(false);
    });
});

describe('may the filing be sent back', () => {
    test('every paper replaced → yes', () => {
        const s = submitState([
            doc({ slotId: 'land_rights', uploadedAt: '2026-09-06T00:00:00.000Z' }),
            doc({ slotId: 'sop_manual', uploadedAt: '2026-09-07T00:00:00.000Z' }),
        ]);
        expect(s.canSubmit).toBe(true);
        expect(s.blockedReason).toBeNull();
    });

    test('one outstanding paper disables it and NAMES the row', () => {
        const s = submitState([
            doc({ slotId: 'land_rights', uploadedAt: '2026-09-06T00:00:00.000Z' }),
            doc({ slotId: 'sop_manual', uploadedAt: null }),
        ]);
        expect(s.canSubmit).toBe(false);
        expect(s.outstandingSlotIds).toEqual(['sop_manual']);
        expect(s.blockedReason).toBe(REVISION_COPY_TH.blocked);
    });

    test('every outstanding paper is named, not just the first', () => {
        const s = submitState([doc({ slotId: 'a' }), doc({ slotId: 'b' }), doc({ slotId: 'c' })]);
        expect(s.outstandingSlotIds).toEqual(['a', 'b', 'c']);
    });

    test('an empty list does NOT enable the button', () => {
        // Reaching this screen with nothing outstanding means something is wrong.
        // Sending the officer a filing with no note of what changed spends their
        // reading rather than the applicant's.
        expect(submitState([]).canSubmit).toBe(false);
    });
});

describe('the countdown is the server\'s count, in the unit the window is written in', () => {
    const working = (n: number) => ({ workingDaysLeft: n, calendarDaysLeft: null });
    const calendar = (n: number) => ({ workingDaysLeft: null, calendarDaysLeft: n });

    test('a document revision reads as working days left', () => {
        expect(daysLeftLabel(working(6))).toEqual({ text: 'เหลือ 6 วันทำการ', overdue: false });
    });

    test('on-site evidence (CAR, thirty calendar days) reads as days, never working days', () => {
        expect(daysLeftLabel(calendar(30))).toEqual({ text: 'เหลือ 30 วัน', overdue: false });
        expect(daysLeftLabel(calendar(-2))).toEqual({ text: 'เลยกำหนด 2 วัน', overdue: true });
    });

    test('zero is due today, never "0 days left"', () => {
        expect(daysLeftLabel(working(0))).toEqual({ text: 'ครบกำหนดวันนี้', overdue: false });
        expect(daysLeftLabel(calendar(0))).toEqual({ text: 'ครบกำหนดวันนี้', overdue: false });
    });

    test('a negative count is overdue, shown, not hidden', () => {
        expect(daysLeftLabel(working(-1))).toEqual({ text: 'เลยกำหนด 1 วันทำการ', overdue: true });
    });

    test('no count is nothing, never zero', () => {
        expect(daysLeftLabel({ workingDaysLeft: null, calendarDaysLeft: null })).toBeNull();
    });
});
