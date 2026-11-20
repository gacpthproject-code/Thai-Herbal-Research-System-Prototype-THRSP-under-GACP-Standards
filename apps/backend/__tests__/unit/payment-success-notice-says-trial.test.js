'use strict';

const mockParties = jest.fn(async () => ({ recipients: ['u1'], delivered: 1 }));

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        application: {
            findUnique: jest.fn(async () => ({ applicationNumber: 'APP-2569-TRIAL', organizationId: null })),
        },
    },
}));
jest.mock('../../services/notification/application-parties', () => ({
    notifyApplicationParties: (...args) => mockParties(...args),
}));

const { notifyPaymentSuccess } = require('../../services/notification/domain-helpers');
const { PAYMENT_MODES, TRIAL_RECEIPT_NOTICE } = require('../../shared/payment-mode');

const savedEnv = { ...process.env };
afterEach(() => {
    process.env = { ...savedEnv };
    mockParties.mockClear();
});

/** The notice for a settlement in `paymentMode`, while the gateway holds `secretKey` (the key of the day). */
async function noticeFor(paymentMode, secretKey, milestone) {
    process.env.PAYMENT_ADAPTER = 'stripe';
    process.env.STRIPE_SECRET_KEY = secretKey;
    await notifyPaymentSuccess('app-1', milestone, { checkoutOrderId: 'ord-1', paymentMode });
    expect(mockParties).toHaveBeenCalledTimes(1);
    return mockParties.mock.calls[0][1].message;
}

describe('the payment-settled notice tells the applicant the receipt is a trial document when the settlement was in test mode', () => {
    it.each(['M1', 'M2'])('%s settled in test mode ends with the trial sentence, whatever key is live now', async (milestone) => {
        const message = await noticeFor(PAYMENT_MODES.TRIAL, 'sk_live_stub', milestone);
        expect(message).toContain('APP-2569-TRIAL');
        expect(message.endsWith(` ${TRIAL_RECEIPT_NOTICE}`)).toBe(true);
    });

    it.each(['M1', 'M2'])('%s settled live says nothing about a trial, whatever key is live now', async (milestone) => {
        const message = await noticeFor(PAYMENT_MODES.LIVE, 'sk_test_stub', milestone);
        expect(message).toContain('APP-2569-TRIAL');
        expect(message).not.toContain('ทดลอง');
    });
});
