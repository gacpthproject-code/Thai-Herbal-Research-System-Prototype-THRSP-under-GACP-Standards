'use strict';

const { createFraudDocumentVerificationMethods } = require('../../services/fraud-detection/document-verification-methods');

const epoch = (iso) => Date.parse(iso) / 1000;

function analyze(document, exifDate) {
    const methods = createFraudDocumentVerificationMethods({
        prisma: {},
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        fs: { readFile: async () => Buffer.from('jpeg') },
        path: require('path'),
        crypto: require('crypto'),
        calculateDistance: () => 0,
    });
    methods._getExifParser = () => ({
        create: () => ({ parse: () => ({ tags: { CreateDate: epoch(exifDate), Make: 'Cam', Model: 'X', GPSLatitude: 13.7, GPSLongitude: 100.5 } }) }),
    });
    return methods._analyzeMetadata({ fileUrl: 'uploads/doc.jpg', ...document });
}

const FILED = '2026-10-06T03:00:00.000Z';

describe('photo metadata dates', () => {
    test('a photo dated after its own upload is an anomaly', async () => {
        const r = await analyze({ createdAt: new Date('2026-10-01T03:00:00.000Z'), application: { formData: { submittedAt: FILED } } }, '2026-10-03T03:00:00.000Z');
        expect(r.passed).toBe(false);
        expect(r.details.anomalies).toContain('File created after it was uploaded');
    });

    test('a photo shot in Bangkok an hour before its same-day upload passes (EXIF has no zone)', async () => {
        const r = await analyze({ createdAt: new Date('2026-10-20T08:00:00.000Z'), application: { formData: { submittedAt: FILED } } }, '2026-10-20T14:00:00.000Z');
        expect(r.passed).toBe(true);
        expect(r.details.anomalies).toEqual([]);
    });

    test('a photo taken after the filing and uploaded with a revision passes', async () => {
        const r = await analyze({ createdAt: new Date('2026-10-20T03:00:00.000Z'), application: { formData: { submittedAt: FILED } } }, '2026-10-19T03:00:00.000Z');
        expect(r.passed).toBe(true);
        expect(r.details.anomalies).toEqual([]);
    });

    test('a photo more than a year older than the filing is a warning', async () => {
        const r = await analyze({ createdAt: new Date('2026-10-05T03:00:00.000Z'), application: { formData: { submittedAt: FILED } } }, '2025-09-01T03:00:00.000Z');
        expect(r.passed).toBe(true);
        expect(r.details.warnings).toContain('Photo taken more than 1 year before application');
    });
});
