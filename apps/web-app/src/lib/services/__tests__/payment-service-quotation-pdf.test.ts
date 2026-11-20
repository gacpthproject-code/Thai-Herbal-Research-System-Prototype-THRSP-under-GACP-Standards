/**
 * Order 54: one quotation number is one document, so the browser asks the quotation PDF door for
 * the quotation, never for one instalment of it (the door used to pick an instalment from ?phase=).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { api } from '@/lib/api/api-client';
import { PaymentService } from '../payment-service';

jest.mock('@/lib/api/api-client', () => ({
    api: {
        get: jest.fn(),
        getBlob: jest.fn(),
    },
}));

const mockedGetBlob = api.getBlob as jest.MockedFunction<typeof api.getBlob>;

describe('PaymentService.viewQuotationPdf', () => {
    const originalCreate = window.URL.createObjectURL;
    const originalRevoke = window.URL.revokeObjectURL;

    beforeEach(() => {
        mockedGetBlob.mockReset();
        window.URL.createObjectURL = jest.fn(() => 'blob:quotation') as unknown as typeof window.URL.createObjectURL;
        window.URL.revokeObjectURL = jest.fn() as unknown as typeof window.URL.revokeObjectURL;
        jest.spyOn(window, 'open').mockImplementation(() => null);
    });

    afterEach(() => {
        window.URL.createObjectURL = originalCreate;
        window.URL.revokeObjectURL = originalRevoke;
        jest.restoreAllMocks();
    });

    it('asks for the whole quotation, with no instalment in the address', async () => {
        mockedGetBlob.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));

        await expect(PaymentService.viewQuotationPdf('app-1', 'PLATFORM')).resolves.toBe(true);

        expect(mockedGetBlob.mock.calls).toEqual([['/applications/app-1/quotations/PLATFORM/pdf']]);
    });
});
