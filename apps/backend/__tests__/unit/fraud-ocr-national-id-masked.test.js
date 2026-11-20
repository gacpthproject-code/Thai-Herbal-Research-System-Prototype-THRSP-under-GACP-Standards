'use strict';

/**
 * The ID-card OCR check reaches staff through GET /api/fraud-detection/applications/:id/documents
 * and POST .../documents/:id/verify. The national id it read leaves the server masked,
 * first digit + last 4 (operator order 10), never in full.
 */

const { createFraudDocumentVerificationMethods } = require('../../services/fraud-detection/document-verification-methods');

const NATIONAL_ID = '1103700012345';

test('the OCR check answers the national id masked', async () => {
    const methods = createFraudDocumentVerificationMethods({
        prisma: {}, logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        fs: require('fs'), path: require('path'), crypto: require('crypto'), calculateDistance: () => 0,
    });
    methods._getTesseract = () => ({
        createWorker: async () => ({
            recognize: async () => ({ data: { text: `บัตรประชาชน นาย ทดสอบ ใจดี 1-1037-00012-34-5`, confidence: 90 } }),
            terminate: async () => {},
        }),
    });

    const check = await methods._validateIdCardOCR({ fileUrl: 'ids/card.jpg' });

    expect(JSON.stringify(check)).not.toContain(NATIONAL_ID);
    expect(JSON.stringify(check)).not.toContain('1-1037-00012-34-5');
    expect(check.details.idNumber).toBe('1-XXXX-XXXX-X-2345');
});
