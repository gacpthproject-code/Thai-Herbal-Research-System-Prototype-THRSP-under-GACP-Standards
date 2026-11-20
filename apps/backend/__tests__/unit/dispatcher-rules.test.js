/**
 * กำหนดเวลาของคิวผู้จัดคิวนับวันทำการเวลากรุงเทพฯ และเป็นค่ามีวันที่กำกับ (คำสั่ง 27, operator 2026-10-06)
 *
 * 13 ต.ค. 2569 (อังคาร) เป็นวันหยุดราชการ (วันคล้ายวันสวรรคต ร.9) จึงใช้เป็นวันกลางทาง
 */

'use strict';

const {
    entryInForceAt, queueTimeLimitsAt, officerWorkloadCapsAt, schedulingDueAt, waitingUrgency,
    urgencyOf, dailyVisitCapOn, visitReminderDayFor,
} = require('../../services/dispatcher-rules');

const bangkok = (iso) => new Date(`${iso}+07:00`);

describe('ค่ามีวันที่กำกับ: รายการที่มีผล ณ เวลาหนึ่ง', () => {
    const register = [
        { effectiveFrom: '2026-10-06', value: 'a' },
        { effectiveFrom: '2026-11-01', value: 'b' },
    ];

    test('ใช้รายการล่าสุดที่วันมีผล (เที่ยงคืนกรุงเทพฯ) มาถึงแล้ว', () => {
        expect(entryInForceAt(register, bangkok('2026-10-31T23:59:59')).value).toBe('a');
        expect(entryInForceAt(register, bangkok('2026-11-01T00:00:00')).value).toBe('b');
    });

    test('ก่อนวันมีผลของรายการแรก ไม่มีค่า', () => {
        expect(entryInForceAt(register, bangkok('2026-10-05T23:59:59'))).toBeNull();
    });
});

describe('กำหนดเวลาของงานจัดคิว', () => {
    test('เข้าคิววันจันทร์ ข้ามวันหยุดวันอังคาร ครบกำหนดสิ้นวันพุธ', () => {
        const { dueAt, warningAt } = schedulingDueAt(bangkok('2026-10-12T10:00:00'), {
            register: [{ effectiveFrom: '2026-10-06', dueWorkingDays: 1, urgentAfterWorkingDays: 2, criticalAfterWorkingDays: 4 }],
        });
        expect(dueAt.toISOString()).toBe(bangkok('2026-10-14T23:59:59.999').toISOString());
        expect(warningAt.toISOString()).toBe(bangkok('2026-10-14T00:00:00').toISOString());
    });

    test('ไม่มีกฎที่มีผล = งานไม่มีกำหนดเวลา (ไม่เดาค่า)', () => {
        expect(schedulingDueAt(bangkok('2026-10-12T10:00:00'), { register: [] })).toEqual({ dueAt: null, warningAt: null });
    });

    test('ค่าที่ใช้จริงมีผลตั้งแต่วันมีคำสั่ง และนับเป็นวันทำการ', () => {
        const rule = queueTimeLimitsAt(bangkok('2026-10-09T09:00:00'));
        expect(Number.isInteger(rule.dueWorkingDays)).toBe(true);
        expect(rule.urgentAfterWorkingDays).toBeLessThan(rule.criticalAfterWorkingDays);
    });
});

describe('ระดับความเร่งด่วนของคำขอที่รอในคิว', () => {
    const register = [{ effectiveFrom: '2026-10-06', dueWorkingDays: 1, urgentAfterWorkingDays: 2, criticalAfterWorkingDays: 4 }];

    test('ศุกร์ถึงพุธข้ามเสาร์-อาทิตย์และวันหยุด = รอ 2 วันทำการ (นับวันปฏิทินจะได้ 5 วัน)', () => {
        const urgency = waitingUrgency(bangkok('2026-10-09T10:00:00'), bangkok('2026-10-14T10:00:00'), { register });
        expect(urgency).toEqual({ workingDaysWaiting: 2, severity: 'WARNING' });
    });

    test('ถึงเกณฑ์วิกฤตเมื่อรอครบจำนวนวันทำการที่กำหนด', () => {
        const urgency = waitingUrgency(bangkok('2026-10-09T10:00:00'), bangkok('2026-10-16T10:00:00'), { register });
        expect(urgency).toEqual({ workingDaysWaiting: 4, severity: 'CRITICAL' });
    });

    test('รอยังไม่ถึงเกณฑ์ = ปกติ', () => {
        const urgency = waitingUrgency(bangkok('2026-10-12T10:00:00'), bangkok('2026-10-12T16:00:00'), { register });
        expect(urgency).toEqual({ workingDaysWaiting: 0, severity: 'INFO' });
    });
});

describe('จำนวนงานสูงสุดต่อผู้ตรวจ', () => {
    test('มาจากค่ามีวันที่กำกับ ไม่ใช่ตัวแปรสภาพแวดล้อม', () => {
        const before = process.env.AUDITOR_MAX_CONCURRENT_AUDITS;
        process.env.AUDITOR_MAX_CONCURRENT_AUDITS = '9';
        try {
            const caps = officerWorkloadCapsAt(bangkok('2026-10-09T09:00:00'));
            expect(caps.documentReviewer.openApplications).toBe(5);
            expect(caps.fieldInspector).toEqual({ visits: 5, withinWorkingDays: 5 });
        } finally {
            if (before === undefined) { delete process.env.AUDITOR_MAX_CONCURRENT_AUDITS; } else { process.env.AUDITOR_MAX_CONCURRENT_AUDITS = before; }
        }
    });
});

describe('สิ่งที่หน้าเฝ้าระวังงานค้างนับ (คำสั่ง 56(1) 1.2)', () => {
    test('ขั้นที่เจ้าหน้าที่ถือ นับจากวันที่คำขอเข้าขั้นนั้น', () => {
        const entered = bangkok('2026-10-09T10:00:00');
        const now = bangkok('2026-10-15T10:00:00');
        expect(urgencyOf({ status: 'DOC_FEE_PAID', stageEnteredAt: entered, visitAt: null }, now))
            .toEqual({ clock: 'STAGE_ENTRY', ...waitingUrgency(entered, now) });
    });

    test('แฟ้มทุกแบบที่รอผู้อนุมัติตัดสิน (DECISION_QUEUE_STATES) นับจากวันที่เข้าคิว รวมแฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน', () => {
        const { DECISION_QUEUE_STATES } = require('../../shared/decision-states');
        const entered = bangkok('2026-09-01T10:00:00');
        const now = bangkok('2026-10-15T10:00:00');
        for (const status of DECISION_QUEUE_STATES) {
            expect([status, urgencyOf({ status, stageEnteredAt: entered, visitAt: null }, now)])
                .toEqual([status, { clock: 'STAGE_ENTRY', ...waitingUrgency(entered, now) }]);
        }
        expect(urgencyOf({ status: 'AUDIT_NOT_PASSED', stageEnteredAt: entered, visitAt: null }, now).severity).toBe('CRITICAL');
    });

    test('ขั้นที่รอผู้ยื่นไม่อยู่ในหน้าเฝ้าระวัง', () => {
        const long = bangkok('2026-09-01T10:00:00');
        for (const status of ['SUBMITTED', 'PENDING_DOC_FEE', 'REVISION_REQUESTED', 'PENDING_AUDIT_FEE', 'CAR_PENDING']) {
            expect(urgencyOf({ status, stageEnteredAt: long, visitAt: null }, bangkok('2026-10-15T10:00:00'))).toBeNull();
        }
    });

    test('นัดตรวจพื้นที่ปกติจนสิ้นวันนัด เลยวันนัดโดยไม่มีผลจึงเตือน และวิกฤตเมื่อเลยครบเกณฑ์วันทำการ', () => {
        const visitAt = bangkok('2026-10-15T09:00:00');
        const at = (iso) => urgencyOf({ status: 'AUDIT_CONFIRMED', stageEnteredAt: bangkok('2026-09-01T10:00:00'), visitAt }, bangkok(iso));
        expect(at('2026-10-15T23:59:59').severity).toBe('INFO');
        expect(at('2026-10-16T08:00:00')).toEqual({ clock: 'VISIT_DAY', workingDaysWaiting: 1, severity: 'WARNING' });
        // พฤหัส 15 → พุธ 21 = 4 วันทำการ (ศุกร์ 16 จันทร์ 19 อังคาร 20 พุธ 21)
        expect(at('2026-10-21T08:00:00')).toEqual({ clock: 'VISIT_DAY', workingDaysWaiting: 4, severity: 'CRITICAL' });
    });
});

describe('จำนวนนัดตรวจพื้นที่ต่อผู้ตรวจต่อวัน (คำสั่ง 56(1) 2.3)', () => {
    test('ใช้ค่าที่มีผลในวันนัดตามเวลากรุงเทพฯ', () => {
        const register = [{ effectiveFrom: '2026-05-16', visitsPerDay: 2 }, { effectiveFrom: '2026-11-02', visitsPerDay: 3 }];
        expect(dailyVisitCapOn(bangkok('2026-11-01T23:30:00'), { register })).toBe(2);
        expect(dailyVisitCapOn(bangkok('2026-11-02T08:00:00'), { register })).toBe(3);
        expect(dailyVisitCapOn(bangkok('2026-10-15T09:00:00'))).toBe(2);
    });

    test('ไม่มีค่าที่มีผล = ไม่มีเพดาน ไม่เดาค่า', () => {
        expect(dailyVisitCapOn(bangkok('2026-05-15T09:00:00'), { register: [{ effectiveFrom: '2026-05-16', visitsPerDay: 2 }] })).toBeNull();
    });
});

describe('วันแจ้งเตือนก่อนนัดตรวจพื้นที่ (คำสั่ง 56(1) 3.3)', () => {
    test('สองวันทำการก่อนวันนัด ตั้งแต่เริ่มวันนั้นตามเวลากรุงเทพฯ ข้ามเสาร์-อาทิตย์', () => {
        // นัดจันทร์ 19 ต.ค. 2569 → ศุกร์ 16 (1) พฤหัส 15 (2)
        expect(visitReminderDayFor(bangkok('2026-10-19T09:00:00'), bangkok('2026-10-09T10:00:00')).toISOString())
            .toBe(bangkok('2026-10-15T00:00:00').toISOString());
    });

    test('ข้ามวันหยุดราชการ', () => {
        // นัดพุธ 14 ต.ค. 2569 → อังคาร 13 เป็นวันหยุด → จันทร์ 12 (1) ศุกร์ 9 (2)
        expect(visitReminderDayFor(bangkok('2026-10-14T13:00:00'), bangkok('2026-10-09T10:00:00')).toISOString())
            .toBe(bangkok('2026-10-09T00:00:00').toISOString());
    });
});
