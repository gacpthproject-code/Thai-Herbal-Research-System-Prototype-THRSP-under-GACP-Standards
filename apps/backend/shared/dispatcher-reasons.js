'use strict';

/**
 * The fixed reasons the dispatcher states for an assignment out of the ordinary (operator order
 * 56(1), 2026-10-09), each list closed with "อื่น ๆ (โปรดระบุ)" and the dispatcher's own words (the
 * order 44 pattern, shared/certification-decision-reasons.js). The reason is recorded with the
 * assignment and in the audit log, where the DTAM admin of the organization reads it. The lists are
 * served by GET /api/provider/scheduler/reasons, so the web keeps no copy.
 *
 *   OVER_CAP              assigning an officer past the workload cap (2.1); the memo's recommended list
 *   LATE_VISIT            booking a visit after the date the company must inspect by (1.3)
 *   CORRECTION_REASSIGN   moving the field inspector while the applicant corrects an on-site defect,
 *                         which the same inspector would otherwise review (order 60(a), order 29)
 *
 * The late-visit and correction lists say whose side each delay counts against (order 65(1)): the
 * applicant, the inspection body, or force majeure; "อื่น ๆ" is not yet assigned. The applicant reads
 * the recorded reason in Thai on the application page, and a move for conflict of interest flags the
 * file the certificate approver decides on. There is no workload-balancing reason during a
 * correction: the same inspector reviews the evidence (60(a)).
 */

const {
    OTHER_REASON_CODE, OTHER_REASON_LABEL, reasonOptions, statedReason,
} = require('./certification-decision-reasons');

/** Whose side a delay counts against (order 65(1)). */
const RESPONSIBLE_SIDES = Object.freeze({
    APPLICANT: 'ผู้ยื่น',
    INSPECTION_BODY: 'หน่วยตรวจ',
    FORCE_MAJEURE: 'เหตุสุดวิสัย',
    UNASSIGNED: 'ยังไม่จัดฝ่าย',
});

/** A list of { CODE: { label, side } }: its labels as the shared reason helpers read them, and its sides. */
function sidedList(entries) {
    const all = { ...entries, [OTHER_REASON_CODE]: { label: OTHER_REASON_LABEL, side: 'UNASSIGNED' } };
    return Object.freeze({
        labels: Object.freeze(Object.fromEntries(Object.entries(all).map(([code, entry]) => [code, entry.label]))),
        sides: Object.freeze(Object.fromEntries(Object.entries(all).map(([code, entry]) => [code, entry.side]))),
    });
}

const OVER_CAP_REASONS = Object.freeze({
    NO_OTHER_OFFICER_AVAILABLE: 'ไม่มีผู้ตรวจคนอื่นว่าง',
    CONTINUES_THIS_APPLICATION: 'งานต่อเนื่องจากคำขอเดิม เช่น ลงพื้นที่ซ้ำ',
    NEAR_A_VISIT_THAT_DAY: 'แปลงอยู่ใกล้นัดเดิมในวันเดียวกัน',
    [OTHER_REASON_CODE]: OTHER_REASON_LABEL,
});

const LATE_VISIT = sidedList({
    APPLICANT_ASKED_LATER: { label: 'ผู้ยื่นขอนัดวันที่ช้ากว่ากำหนด', side: 'APPLICANT' },
    SITE_NOT_READY: { label: 'ผู้ยื่นแจ้งว่าสถานที่ปลูกยังไม่พร้อมให้ตรวจ', side: 'APPLICANT' },
    CONTACT_UNREACHABLE: { label: 'ติดต่อผู้ยื่นหรือผู้ติดต่อหน้างานไม่ได้เพื่อยืนยันวันนัด', side: 'APPLICANT' },
    NO_INSPECTOR_AVAILABLE: { label: 'ไม่มีผู้ตรวจพื้นที่ว่างก่อนกำหนด', side: 'INSPECTION_BODY' },
    ACCESS_BLOCKED: { label: 'เข้าพื้นที่ไม่ได้ด้วยเหตุสุดวิสัย เช่น ภัยธรรมชาติ', side: 'FORCE_MAJEURE' },
});

const CORRECTION_REASSIGN = sidedList({
    INSPECTOR_UNAVAILABLE: {
        label: 'ผู้ตรวจพื้นที่คนเดิมปฏิบัติงานต่อไม่ได้ เช่น ลาออก ย้ายหน่วยงาน หรือลาป่วยเป็นเวลานาน', side: 'INSPECTION_BODY',
    },
    CONFLICT_OF_INTEREST: { label: 'พบว่าผู้ตรวจพื้นที่คนเดิมมีส่วนได้เสียกับผู้ยื่นหรือสถานที่ปลูก', side: 'INSPECTION_BODY' },
    APPLICANT_OBJECTION_UPHELD: {
        label: 'ผู้ยื่นคัดค้านผู้ตรวจพื้นที่โดยมีเหตุผล และหน่วยตรวจรับฟังแล้วเห็นว่ามีเหตุ', side: 'INSPECTION_BODY',
    },
    INSPECTOR_SAFETY: { label: 'ผู้ตรวจพื้นที่ถูกข่มขู่หรือคุกคาม หรือมีเหตุด้านความปลอดภัย', side: 'FORCE_MAJEURE' },
});

const LATE_VISIT_REASONS = LATE_VISIT.labels;
const CORRECTION_REASSIGN_REASONS = CORRECTION_REASSIGN.labels;

const SIDED_LISTS = Object.freeze({ lateVisit: LATE_VISIT, correctionReassign: CORRECTION_REASSIGN });

/** The side a reason of `list` ('lateVisit' or 'correctionReassign') counts against; null for an unknown code. */
function responsibleSideOf(list, code) {
    return SIDED_LISTS[list]?.sides[code] ?? null;
}

/** A sided list as the web shows it: { code, label, side, sideLabel }[]. */
function sidedOptions(list) {
    return reasonOptions(SIDED_LISTS[list].labels).map((option) => {
        const side = responsibleSideOf(list, option.code);
        return { ...option, side, sideLabel: RESPONSIBLE_SIDES[side] };
    });
}

/** Every list as the web shows it. */
function dispatcherReasonOptions() {
    return {
        overCap: reasonOptions(OVER_CAP_REASONS),
        lateVisit: sidedOptions('lateVisit'),
        correctionReassign: sidedOptions('correctionReassign'),
    };
}

/** What the applicant is told a recorded reason is about. */
const RECORDED_REASON_KINDS = Object.freeze({
    LATE_VISIT: 'นัดตรวจพื้นที่หลังวันที่ต้องตรวจภายใน',
    INSPECTOR_CHANGED: 'เปลี่ยนผู้ตรวจพื้นที่ระหว่างแก้ไขข้อบกพร่อง',
});

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** A stored { reasonCode, reasonText, side? } of `list` as the applicant reads it, or null. */
function recordedReason(kind, list, record, recordedAt) {
    const code = record?.reasonCode;
    const labels = SIDED_LISTS[list].labels;
    if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(labels, code)) { return null; }
    const label = code === OTHER_REASON_CODE ? (typeof record.reasonText === 'string' ? record.reasonText.trim() : '') : labels[code];
    if (!label) { return null; }
    const side = RESPONSIBLE_SIDES[record.side] ? record.side : responsibleSideOf(list, code);
    return {
        kind, kindLabel: RECORDED_REASON_KINDS[kind], reasonCode: code, label, side, sideLabel: RESPONSIBLE_SIDES[side], recordedAt: recordedAt || null,
    };
}

/**
 * The reasons recorded on a filing that the applicant reads on the application page (order 65(1)):
 * the late booking of the visit as it stands, and every move of the field inspector during a
 * correction, oldest first.
 */
function recordedReasonsOf(formData) {
    const filing = asObject(formData) || {};
    const schedule = asObject(filing.auditSchedule) || {};
    const late = recordedReason('LATE_VISIT', 'lateVisit', asObject(asObject(schedule.statedReasons)?.lateVisit),
        schedule.rescheduledAt || schedule.scheduledAt);
    const moves = (Array.isArray(filing._reassignmentHistory) ? filing._reassignmentHistory : [])
        .map((move) => (asObject(move) && move.reasonCode ? recordedReason('INSPECTOR_CHANGED', 'correctionReassign', move, move.reassignedAt) : null));
    return [late, ...moves].filter(Boolean);
}

/**
 * The flags the certificate approver reads on the decision file: every move of the field inspector
 * during a correction for conflict of interest, since the earlier result came from that inspector.
 */
function impartialityFlagsOf(formData) {
    const filing = asObject(formData) || {};
    return (Array.isArray(filing._reassignmentHistory) ? filing._reassignmentHistory : [])
        .filter((move) => asObject(move) && move.reasonCode === 'CONFLICT_OF_INTEREST')
        .map((move) => ({
            reasonCode: move.reasonCode, label: CORRECTION_REASSIGN_REASONS.CONFLICT_OF_INTEREST, recordedAt: move.reassignedAt || null,
        }));
}

module.exports = {
    RESPONSIBLE_SIDES,
    OVER_CAP_REASONS,
    LATE_VISIT_REASONS,
    CORRECTION_REASSIGN_REASONS,
    responsibleSideOf,
    dispatcherReasonOptions,
    recordedReasonsOf,
    impartialityFlagsOf,
    statedReason,
};
