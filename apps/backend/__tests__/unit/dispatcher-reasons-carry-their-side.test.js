/**
 * Operator order 65(1), 2026-10-09 (research memo 2026-10-09-dispatcher-3-decisions.md, item 1): the
 * reasons for a late visit and for moving the field inspector during a correction keep the drafted
 * base, add the three reasons the memo found in practice, and each names the side its delay counts
 * against (ผู้ยื่น / หน่วยตรวจ / เหตุสุดวิสัย); "อื่น ๆ" is not yet assigned and needs words. There is
 * no workload-balancing reason during a correction: the same inspector reviews the evidence (60(a)).
 */

'use strict';

const {
    LATE_VISIT_REASONS, CORRECTION_REASSIGN_REASONS, RESPONSIBLE_SIDES, responsibleSideOf, dispatcherReasonOptions,
} = require('../../shared/dispatcher-reasons');
const { statedReason } = require('../../shared/certification-decision-reasons');

const ASSIGNED_SIDES = ['APPLICANT', 'INSPECTION_BODY', 'FORCE_MAJEURE'];

describe('the dispatcher\'s reason lists (order 65(1))', () => {
    test('a late visit can be put down to an applicant or site contact nobody could reach', () => {
        expect(Object.values(LATE_VISIT_REASONS)).toContain('ติดต่อผู้ยื่นหรือผู้ติดต่อหน้างานไม่ได้เพื่อยืนยันวันนัด');
    });

    test('an inspector change during a correction takes a justified objection or a threat to the inspector, and nothing for workload', () => {
        expect(Object.values(CORRECTION_REASSIGN_REASONS)).toEqual(expect.arrayContaining([
            'ผู้ยื่นคัดค้านผู้ตรวจพื้นที่โดยมีเหตุผล และหน่วยตรวจรับฟังแล้วเห็นว่ามีเหตุ',
            'ผู้ตรวจพื้นที่ถูกข่มขู่หรือคุกคาม หรือมีเหตุด้านความปลอดภัย',
        ]));
        expect(Object.keys(CORRECTION_REASSIGN_REASONS)).toEqual([
            'INSPECTOR_UNAVAILABLE', 'CONFLICT_OF_INTEREST', 'APPLICANT_OBJECTION_UPHELD', 'INSPECTOR_SAFETY', 'OTHER',
        ]);
        expect(Object.values(CORRECTION_REASSIGN_REASONS).join(' ')).not.toMatch(/ภาระงาน|เกลี่ย/);
    });

    test.each([['lateVisit', LATE_VISIT_REASONS], ['correctionReassign', CORRECTION_REASSIGN_REASONS]])('every %s reason names its side; อื่น ๆ is not yet assigned', (list, reasons) => {
        for (const code of Object.keys(reasons)) {
            const side = responsibleSideOf(list, code);
            if (code === 'OTHER') {
                expect([code, side]).toEqual([code, 'UNASSIGNED']);
            } else {
                expect([code, ASSIGNED_SIDES.includes(side)]).toEqual([code, true]);
            }
        }
        expect(statedReason(reasons, 'OTHER', '').refused).toBe('OTHER_TEXT_REQUIRED');
    });

    test('the sides of the memo: the applicant\'s requests and readiness are the applicant\'s, a free inspector is the body\'s, access lost to nature is force majeure', () => {
        expect({
            APPLICANT_ASKED_LATER: responsibleSideOf('lateVisit', 'APPLICANT_ASKED_LATER'),
            SITE_NOT_READY: responsibleSideOf('lateVisit', 'SITE_NOT_READY'),
            CONTACT_UNREACHABLE: responsibleSideOf('lateVisit', 'CONTACT_UNREACHABLE'),
            NO_INSPECTOR_AVAILABLE: responsibleSideOf('lateVisit', 'NO_INSPECTOR_AVAILABLE'),
            ACCESS_BLOCKED: responsibleSideOf('lateVisit', 'ACCESS_BLOCKED'),
        }).toEqual({
            APPLICANT_ASKED_LATER: 'APPLICANT', SITE_NOT_READY: 'APPLICANT', CONTACT_UNREACHABLE: 'APPLICANT',
            NO_INSPECTOR_AVAILABLE: 'INSPECTION_BODY', ACCESS_BLOCKED: 'FORCE_MAJEURE',
        });
        expect(RESPONSIBLE_SIDES).toEqual({
            APPLICANT: 'ผู้ยื่น', INSPECTION_BODY: 'หน่วยตรวจ', FORCE_MAJEURE: 'เหตุสุดวิสัย', UNASSIGNED: 'ยังไม่จัดฝ่าย',
        });
    });

    test('the lists the dispatcher picks from show each reason\'s side', () => {
        const { lateVisit, correctionReassign } = dispatcherReasonOptions();
        expect(lateVisit.find((o) => o.code === 'NO_INSPECTOR_AVAILABLE')).toMatchObject({ side: 'INSPECTION_BODY', sideLabel: 'หน่วยตรวจ' });
        expect(correctionReassign.find((o) => o.code === 'OTHER')).toMatchObject({ side: 'UNASSIGNED', sideLabel: 'ยังไม่จัดฝ่าย' });
    });
});
