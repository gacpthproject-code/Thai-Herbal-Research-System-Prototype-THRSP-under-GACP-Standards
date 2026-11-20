'use strict';

/**
 * ไม่มีค่าช่วงรอหลังเตือนครั้งที่ 3 ที่มีผล → ตัวปิดไม่ปิดอะไรเลย และต้องแจ้งเจ้าหน้าที่แพลตฟอร์ม
 * ไม่ใช่แค่เขียน log (security re-review 2026-10-07): log หายไปกับ process คำขอค้างไม่มีใครรู้
 */

const mockAlert = jest.fn();
jest.mock('../../services/notification/domain-helpers', () => ({
    notifyAdminPaymentClosureHalted: (...a) => mockAlert(...a),
}));
jest.mock('../../services/billing/closure-grace', () => ({
    closureGraceDaysAt: () => undefined,
    graceElapsed: () => false,
}));
const mockListUnpaid = jest.fn();
jest.mock('../../services/billing/unpaid-milestones', () => ({
    GATE_MILESTONE: { PENDING_DOC_FEE: 'M1', PENDING_AUDIT_FEE: 'M2' },
    listUnpaidMilestones: (...a) => mockListUnpaid(...a),
}));

const { runPaymentClosureSweep } = require('../../jobs/payment-closure-job');

test('ไม่มีช่วงรอที่มีผล → throw ไม่สแกน และแจ้งเจ้าหน้าที่หนึ่งครั้งพร้อมสาเหตุ', async () => {
    await expect(runPaymentClosureSweep(new Date('2026-12-01T00:00:00Z'))).rejects.toThrow(/PAYMENT_CLOSURE_GRACE_AFTER_FINAL_REMINDER/);
    expect(mockListUnpaid).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockAlert.mock.calls[0][0]).toMatchObject({ cause: expect.stringContaining('PAYMENT_CLOSURE_GRACE_AFTER_FINAL_REMINDER') });
});
