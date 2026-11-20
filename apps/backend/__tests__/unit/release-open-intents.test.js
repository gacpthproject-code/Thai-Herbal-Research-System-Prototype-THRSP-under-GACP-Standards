'use strict';

/**
 * Gateway truth before a close at a payment gate (security review 2026-10-07 M2/M3):
 * open intents are cancelled first; money moving or an unreachable gateway blocks the close.
 */

const mockGetPaymentIntent = jest.fn();
const mockCancelPaymentIntent = jest.fn();
jest.mock('../../services/payment/payment-adapter', () => ({
    getPaymentAdapter: () => ({ getPaymentIntent: mockGetPaymentIntent, cancelPaymentIntent: mockCancelPaymentIntent }),
}));
const { releaseOpenIntents } = require('../../services/checkout/release-open-intents');

beforeEach(() => jest.clearAllMocks());

test.each(['succeeded', 'processing', 'requires_capture'])('an intent %s blocks the close and nothing is cancelled', async (status) => {
    mockGetPaymentIntent.mockImplementation(async (id) => ({ id, status: id === 'pi_2' ? status : 'requires_payment_method' }));
    expect(await releaseOpenIntents(['pi_1', 'pi_2'])).toEqual({ released: false, intentId: 'pi_2', cause: 'IN_FLIGHT' });
    expect(mockCancelPaymentIntent).not.toHaveBeenCalledWith('pi_2');
});

test('open intents are cancelled; canceled or unknown ones are left alone', async () => {
    const statuses = { pi_open: 'requires_payment_method', pi_done: 'canceled' };
    mockGetPaymentIntent.mockImplementation(async (id) => (statuses[id] ? { id, status: statuses[id] } : null));
    expect(await releaseOpenIntents(['pi_open', 'pi_done', 'pi_gone', 'pi_open'])).toEqual({ released: true });
    expect(mockCancelPaymentIntent.mock.calls).toEqual([['pi_open']]);
});

test('fail-safe: the gateway cannot be asked → blocked', async () => {
    mockGetPaymentIntent.mockRejectedValue(new Error('unreachable'));
    expect(await releaseOpenIntents(['pi_1'])).toMatchObject({ released: false, intentId: 'pi_1', cause: 'GATEWAY_UNAVAILABLE' });
});

test('a refused cancel (paid in between) → blocked', async () => {
    mockGetPaymentIntent.mockResolvedValue({ status: 'requires_action' });
    mockCancelPaymentIntent.mockRejectedValue(new Error('has succeeded'));
    expect(await releaseOpenIntents(['pi_1'])).toMatchObject({ released: false, cause: 'CANCEL_REFUSED' });
});

test('no intent → released without asking the gateway', async () => {
    expect(await releaseOpenIntents([])).toEqual({ released: true });
    expect(mockGetPaymentIntent).not.toHaveBeenCalled();
});
