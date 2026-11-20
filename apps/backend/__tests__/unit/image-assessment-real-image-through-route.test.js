'use strict';

/**
 * One real image through the whole line: HTTP door → multer → magic-byte gate
 * → sharp feature extraction → disease-trees model → JSON answer. Nothing in
 * the line is mocked except the token check.
 *
 * The image is drawn in the test (fixtures/synthetic-leaf.js), and the
 * 139-value feature vector plus the model's probabilities for it are pinned in
 * fixtures/synthetic-leaf-through-route.json. Reordering or rescaling a
 * feature, or retraining the model without re-evaluating, changes those
 * numbers; the length check in disease-classifier.test.js cannot see a swap.
 */

const express = require('express');
const request = require('supertest');

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

jest.mock('../../middleware/auth-middleware', () => ({
    authenticateProvider: (req, res, next) => {
        req.user = { id: 'inspector-1', role: 'field_inspector' };
        next();
    },
    requireRole: (allowed) => (req, res, next) => (allowed.includes(req.user.role) ? next() : res.status(403).end()),
}));

const router = require('../../routes/api/audit/image-assessment');
const { extractImageFeatures } = require('../../services/image-assessment/image-feature-extractor');
const { MODEL_CLASSES } = require('../../services/image-assessment/disease-trees');
const { syntheticLeafPng, WIDTH, HEIGHT } = require('../fixtures/synthetic-leaf');
const pinned = require('../fixtures/synthetic-leaf-through-route.json');

function makeApp() {
    const app = express();
    app.use('/api/image-assessment', router);
    return app;
}

describe('a real PNG through POST /assess with the real extractor and model', () => {
    let png;
    beforeAll(async () => { png = await syntheticLeafPng(); });

    test('the extractor still produces the pinned feature vector for the pinned image', async () => {
        const features = await extractImageFeatures(png);
        expect(features.format).toBe('png');
        expect(features.width).toBe(WIDTH);
        expect(features.vector).toHaveLength(pinned.vector.length);
        features.vector.forEach((value, i) => expect(value).toBeCloseTo(pinned.vector[i], 9));
    });

    test('the door answers with the model\'s pinned probabilities, the photo-quality verdict, and no raw vector', async () => {
        const res = await request(makeApp())
            .post('/api/image-assessment/assess')
            .field('herbCode', 'TURMERIC')
            .attach('image', png, 'leaf.png');

        expect(res.status).toBe(200);
        const { data } = res.body;
        expect(data.herbCode).toBe('TURMERIC');
        expect(data.imageInspection).toMatchObject({ passed: true, resolution: `${WIDTH}x${HEIGHT}` });
        expect(data.features).not.toHaveProperty('vector');

        expect(data.disease.predictions.map((p) => p.disease)).toEqual(pinned.predictions.map((p) => p.disease));
        data.disease.predictions.forEach((p, i) => expect(p.confidence).toBeCloseTo(pinned.predictions[i].confidence, 9));
        expect(data.disease.predictions.reduce((sum, p) => sum + p.confidence, 0)).toBeCloseTo(1, 9);
        expect(MODEL_CLASSES).toContain(data.disease.top.disease);
        expect(data.disease.notAssessed.map((n) => n.disease)).toEqual(['ROOT_ROT', 'WILT']);
        expect(data.disease.measured.testImages).toBe(418);
        expect(data.disease.needsExpertConfirmation).toBe(true);
    });
});
