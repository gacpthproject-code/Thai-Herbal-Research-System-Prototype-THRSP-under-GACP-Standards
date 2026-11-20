/**
 * แก้ไขเอกสารตามที่เจ้าหน้าที่ขอ — the screen's rules, apart from its markup.
 *
 * ── WHAT THIS SCREEN IS FOR ───────────────────────────────────────────────────
 * An applicant whose filing came back used to be told "แก้ไข" and left to work
 * out which of nine papers was the problem. This page lists ONLY the papers the
 * officer actually asked for, each with the officer's own reason and a due date,
 * and enables "ส่งกลับให้เจ้าหน้าที่ตรวจ" only when every one has been replaced.
 *
 * The replacement test mirrors the server (assertRevisionSlotsRefreshed): NEWER
 * than the request, not merely present — the paper was already attached when the
 * officer refused it.
 */

export interface RequestedDocument {
    slotId: string;
    /** The ministry's own name for the paper — never the slot id on screen. */
    labelTH: string;
    reason: string | null;
    dueDate: string | null;
    /** Sent for a document revision: the window is working days (order 28). */
    workingDaysLeft: number | null;
    /** Sent for on-site evidence: the window is calendar days (order 56(2a)). */
    calendarDaysLeft: number | null;
    requestedAt: string;
    /** When the applicant's newest file for this slot was uploaded, if any. */
    uploadedAt: string | null;
}

export const REVISION_COPY_TH = Object.freeze({
    title: 'แก้ไขเอกสารตามที่เจ้าหน้าที่ขอ',
    intro: 'เจ้าหน้าที่ขอเอกสารเพิ่มเฉพาะรายการด้านล่าง รายการอื่นที่รับไปแล้วไม่ต้องส่งใหม่',
    reasonLabel: 'เหตุผลจากเจ้าหน้าที่',
    dueLabel: 'กำหนดส่ง',
    replaceCta: 'อัปโหลดฉบับใหม่',
    replaced: 'อัปโหลดฉบับใหม่แล้ว',
    stillNeeded: 'ยังไม่ได้อัปโหลดฉบับใหม่',
    submit: 'ส่งกลับให้เจ้าหน้าที่ตรวจ',
    blocked: 'ยังมีเอกสารที่ยังไม่ได้อัปโหลดฉบับใหม่',
    nothingRequested: 'ไม่มีรายการที่เจ้าหน้าที่ขอเพิ่มสำหรับคำขอนี้',
    reviewsUnavailable: 'ระบบอ่านรายการที่เจ้าหน้าที่ขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    refusedTitle: 'ส่งกลับไม่ได้ ข้อมูลในคำขอยังขาด',
    refusedIntro: 'กรอกข้อมูลต่อไปนี้ในคำขอเดิมให้ครบ แล้วกดส่งกลับให้เจ้าหน้าที่ตรวจอีกครั้ง',
    answersTitle: 'ข้อมูลในคำขอที่ต้องแก้ไข',
    answersIntro: 'เจ้าหน้าที่ส่งคำขอกลับเพราะข้อมูลต่อไปนี้ แก้ไขในคำขอเดิมแล้วกดส่งคำขอใหม่ในขั้นตอนสุดท้าย ไม่มีค่าบริการเพิ่ม',
    editAnswersCta: 'แก้ไขข้อมูลในคำขอ',
});

/**
 * Has this paper actually been replaced since it was asked for?
 *
 * Strictly newer. A file uploaded at the same instant as the request cannot have
 * been a response to it, and treating it as one lets a filing through on a
 * coincidence — the same line the server draws.
 */
export function isReplaced(doc: RequestedDocument): boolean {
    if (!doc.uploadedAt) { return false; }
    const uploaded = new Date(doc.uploadedAt).getTime();
    const asked = new Date(doc.requestedAt).getTime();
    if (Number.isNaN(uploaded) || Number.isNaN(asked)) { return false; }
    return uploaded > asked;
}

export interface RevisionSubmitState {
    canSubmit: boolean;
    outstandingSlotIds: string[];
    blockedReason: string | null;
}

/**
 * May the applicant send the filing back?
 *
 * Mirrors the door: every requested paper replaced, and at least one request to
 * answer. An empty list does NOT enable the button — reaching this screen with
 * nothing outstanding means something is wrong, and sending the officer a filing
 * with no note of what changed wastes their reading rather than the applicant's.
 */
export function submitState(docs: RequestedDocument[]): RevisionSubmitState {
    const rows = Array.isArray(docs) ? docs : [];
    const outstandingSlotIds = rows.filter((d) => !isReplaced(d)).map((d) => d.slotId);
    return {
        canSubmit: rows.length > 0 && outstandingSlotIds.length === 0,
        outstandingSlotIds,
        blockedReason: outstandingSlotIds.length > 0 ? REVISION_COPY_TH.blocked : null,
    };
}

/**
 * The server counts the time left in the unit the window is written in (working days for a
 * document revision, calendar days for on-site evidence) and owns the holiday calendar
 * (utils/working-days.js), so the page says the count it was sent and never counts days itself.
 */
export function daysLeftLabel(doc: Pick<RequestedDocument, 'workingDaysLeft' | 'calendarDaysLeft'>): { text: string; overdue: boolean } | null {
    const counted = typeof doc.workingDaysLeft === 'number' ? { days: doc.workingDaysLeft, unit: 'วันทำการ' }
        : typeof doc.calendarDaysLeft === 'number' ? { days: doc.calendarDaysLeft, unit: 'วัน' }
        : null;
    if (!counted || !Number.isFinite(counted.days)) { return null; }
    if (counted.days < 0) { return { text: `เลยกำหนด ${Math.abs(counted.days)} ${counted.unit}`, overdue: true }; }
    if (counted.days === 0) { return { text: 'ครบกำหนดวันนี้', overdue: false }; }
    return { text: `เหลือ ${counted.days} ${counted.unit}`, overdue: false };
}
