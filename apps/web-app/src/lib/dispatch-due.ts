/**
 * How soon the dispatcher assigns a document reviewer after the first payment, as
 * GET /api/dispatch-due serves the dated DISPATCHER.QUEUE_TIME_LIMITS rule in force (order 56(1) 1.1).
 * The web keeps no copy of the number: a later-dated rule changes the screen on its own date. When
 * the answer cannot be read, the screen says what is true under any rule.
 */

export const DISPATCH_DUE_PATH = '/dispatch-due';

/** The working days in the served rule, or null for an answer that is not one. */
export function parseDispatchDue(data: unknown): number | null {
    if (!data || typeof data !== 'object') return null;
    const { dueWorkingDays } = data as Record<string, unknown>;
    return typeof dueWorkingDays === 'number' && Number.isInteger(dueWorkingDays) && dueWorkingDays > 0 ? dueWorkingDays : null;
}

/** "ผู้จัดคิวมอบหมายผู้ตรวจเอกสารภายใน 1 วันทำการ หลังได้รับชำระงวดที่ 1", or the same without a number. */
export function dispatchDueTh(workingDays: number | null): string {
    return workingDays
        ? `ผู้จัดคิวมอบหมายผู้ตรวจเอกสารภายใน ${workingDays} วันทำการ หลังได้รับชำระงวดที่ 1`
        : 'ผู้จัดคิวจะมอบหมายผู้ตรวจเอกสารหลังได้รับชำระงวดที่ 1';
}
