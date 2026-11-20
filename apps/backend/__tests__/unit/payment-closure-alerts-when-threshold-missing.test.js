'use strict';

/**
 * ไม่มีค่า PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS → ตัวปิดไม่ปิดอะไรเลย และต้องแจ้งเจ้าหน้าที่แพลตฟอร์ม
 * เหมือนกรณีไม่มีช่วงรอหลังเตือนครั้งที่ 3 (security veto 2026-10-07): log หายไปกับ process
 */

const mockAlert = jest.fn();
jest.mock('../../services/notification/domain-helpers', () => ({
    notifyAdminPaymentClosureHalted: (...a) => mockAlert(...a),
}));
jest.mock('../../config/business-rules', () => ({ PAYMENT: {} }));
jest.mock('../../services/billing/closure-grace', () => ({
    closureGraceDaysAt: () => 7,
    graceElapsed: () => true,
}));
const mockListUnpaid = jest.fn();
jest.mock('../../services/billing/unpaid-milestones', () => ({
    GATE_MILESTONE: { PENDING_DOC_FEE: 'M1', PENDING_AUDIT_FEE: 'M2' },
    listUnpaidMilestones: (...a) => mockListUnpaid(...a),
}));

const { runPaymentClosureSweep } = require('../../jobs/payment-closure-job');

beforeEach(() => { jest.clearAllMocks(); });

test('ไม่มีจำนวนวันก่อนปิด → throw ไม่สแกน และแจ้งเจ้าหน้าที่หนึ่งครั้งพร้อมสาเหตุ', async () => {
    await expect(runPaymentClosureSweep(new Date('2026-12-01T00:00:00Z'))).rejects.toThrow(/PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS/);
    expect(mockListUnpaid).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockAlert.mock.calls[0][0]).toMatchObject({ cause: expect.stringContaining('PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS') });
});

test('dry run ไม่แจ้งเจ้าหน้าที่ (ไม่เขียนอะไร) แต่ยังไม่สแกน', async () => {
    await expect(runPaymentClosureSweep(new Date('2026-12-01T00:00:00Z'), { dryRun: true })).rejects.toThrow(/PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS/);
    expect(mockListUnpaid).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
});
