'use strict';
/**
 * Order 105(3), round 2 finding 2: the refund notices said nothing about the trial. A refund
 * of money collected in test mode now ends with the trial sentence, worded like the
 * payment-settled notice; the mode is the invoice's own settlement record, not the key of
 * the day. The party without VIEW_FINANCIAL (order 41) is told the same.
 */
jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const { getTemplateForType } = require('../../services/notification-fanout-service');
const { WITHOUT_MONEY } = require('../../services/notification/application-parties');
const { PAYMENT_MODES, TRIAL_REFUND_NOTICE, TRIAL_REFUND_SMS, TRIAL_RECEIPT_NOTICE } = require('../../shared/payment-mode');

const PAYLOAD = {
    applicationNumber: 'GACP-2569-000123',
    invoiceNumber: 'TAX-PRD-2026-000001',
    creditNoteNumber: 'CN-PRD-2026-000001',
    amount: 5885,
    reasonCode: 'COMPANY_CANNOT_INSPECT',
};

test('the refund sentence is worded like the receipt sentence: the same opening, and it names the credit note as the trial document', () => {
    expect(TRIAL_RECEIPT_NOTICE.startsWith('ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง')).toBe(true);
    expect(TRIAL_REFUND_NOTICE.startsWith('ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง')).toBe(true);
    expect(TRIAL_REFUND_NOTICE).toContain('ไม่มีการคืนเงินจริง');
    expect(TRIAL_REFUND_NOTICE).toContain('ใบลดหนี้เป็นเอกสารทดลอง ไม่ใช่เอกสารทางภาษี');
    expect(TRIAL_REFUND_NOTICE).not.toContain('—');
});

describe.each([
    'REFUND_PROVIDER_CANCELLED',
    'REFUND_DUPLICATE_CHARGE',
    'REFUND_PROVIDER_CANCELLED_NO_AMOUNT',
    'REFUND_DUPLICATE_CHARGE_NO_AMOUNT',
])('%s', (type) => {
    it('money collected in test mode: the notice ends with the trial sentence, in the bell, the mail and the SMS', () => {
        const notice = getTemplateForType(type, { ...PAYLOAD, paymentMode: PAYMENT_MODES.TRIAL });
        expect(notice.bodyTHText.endsWith(` ${TRIAL_REFUND_NOTICE}`)).toBe(true);
        expect(notice.bodyTHHtml).toContain(TRIAL_REFUND_NOTICE);
        expect(notice.smsTH.endsWith(` ${TRIAL_REFUND_SMS}`)).toBe(true);
    });

    it.each([
        ['settled live', PAYMENT_MODES.LIVE],
        ['no mode given', undefined],
    ])('%s: nothing about a trial', (_label, paymentMode) => {
        const notice = getTemplateForType(type, { ...PAYLOAD, paymentMode });
        for (const text of [notice.bodyTHText, notice.bodyTHHtml, notice.smsTH, notice.subjectTH]) {
            expect(text).not.toContain('ทดลอง');
        }
    });
});

test('the no-amount notice keeps the mode, so the party who is not shown the figures is still told it was a trial', () => {
    expect(WITHOUT_MONEY.REFUND_PROVIDER_CANCELLED.keep).toContain('paymentMode');
    expect(WITHOUT_MONEY.REFUND_DUPLICATE_CHARGE.keep).toContain('paymentMode');
});
