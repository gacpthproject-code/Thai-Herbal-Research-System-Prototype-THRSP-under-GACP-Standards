'use strict';

/**
 * ต้นแบบที่ 6 โมดูล 6.3 — the trained disease model as the inspector sees it.
 * The reference fixture holds scikit-learn's own probabilities for feature
 * vectors of real labelled photos; the server must reproduce them exactly and
 * must report the accuracy it measured on held-out photos, never a guess.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { DISEASE_CLASSES, MODEL_CARD, classifyDisease } = require('../../services/image-assessment/disease-classifier');
const { featureVector } = require('../../services/image-assessment/image-feature-extractor');
const reference = require('../fixtures/disease-trees-sklearn-reference.json');

const MODEL_FILE = path.join(__dirname, '../../services/image-assessment/model/disease-trees.json');

describe('the shipped model and its measured card', () => {
    test('the card measured this exact model file, so a retrained model cannot ship with old numbers', () => {
        const sha = crypto.createHash('sha256').update(fs.readFileSync(MODEL_FILE)).digest('hex');
        expect(MODEL_CARD.modelSha256).toBe(sha);
    });

    test('the extractor produces vectors of the length the model was trained on', () => {
        const side = 16;
        const pixels = Buffer.alloc(side * side * 3, 120);
        expect(featureVector(pixels, 3, side)).toHaveLength(reference.samples[0].vector.length);
    });

    test('the card holds a real held-out measurement: counts add up and accuracy = correct / total', () => {
        const { test } = MODEL_CARD;
        const diagonal = Object.keys(test.confusionMatrix).reduce((n, c) => n + test.confusionMatrix[c][c], 0);
        const all = Object.values(test.confusionMatrix).reduce((n, row) => n + Object.values(row).reduce((a, b) => a + b, 0), 0);
        expect(all).toBe(test.total);
        expect(diagonal).toBe(test.correct);
        expect(test.accuracy).toBeCloseTo(test.correct / test.total, 4);
        expect(test.calibration.reduce((n, b) => n + b.count, 0)).toBe(test.total);
    });
});

describe('classifyDisease', () => {
    test.each(reference.samples.map((s, i) => [i, s]))('reproduces scikit-learn probabilities for reference photo %i', (_, sample) => {
        const result = classifyDisease({ vector: sample.vector });
        const byClass = Object.fromEntries(result.predictions.map((p) => [p.disease, p.confidence]));
        const modelClasses = Object.keys(MODEL_CARD.imagesPerClass);
        modelClasses.forEach((c, k) => expect(Math.abs(byClass[c] - sample.proba[k])).toBeLessThan(1e-9));
    });

    test('scores only the classes it was trained on and names root rot and wilt as not assessed', () => {
        const result = classifyDisease({ vector: reference.samples[0].vector });
        const scored = result.predictions.map((p) => p.disease);
        expect(scored).not.toContain('ROOT_ROT');
        expect(scored).not.toContain('WILT');
        expect(result.notAssessed.map((n) => n.disease)).toEqual(['ROOT_ROT', 'WILT']);
        expect([...scored, 'ROOT_ROT', 'WILT'].sort()).toEqual([...DISEASE_CLASSES].sort());
        expect(result.predictions.reduce((a, p) => a + p.confidence, 0)).toBeCloseTo(1, 9);
    });

    test('every answer carries the measured numbers for the class it names, and stays advice', () => {
        const sample = reference.samples.find((s) => s.label === 'POWDERY_MILDEW');
        const result = classifyDisease({ vector: sample.vector });
        const top = result.top.disease;
        expect(result.measured.testAccuracy).toBe(MODEL_CARD.test.accuracy);
        expect(result.measured.testImages).toBe(MODEL_CARD.test.total);
        expect(result.measured.topPrecision).toBe(MODEL_CARD.test.perClass[top].precision);
        expect(result.measured.topRecall).toBe(MODEL_CARD.test.perClass[top].recall);
        const bin = result.measured.atThisConfidence;
        expect(result.top.confidence).toBeGreaterThanOrEqual(bin.confidenceFrom);
        expect(result.top.confidence).toBeLessThanOrEqual(bin.confidenceTo);
        expect(result.measured.domainNote).toMatch(/Not field photos/);
        expect(result.needsExpertConfirmation).toBe(true);
    });

    test('a vector of the wrong length is refused as 400, not scored', () => {
        expect(() => classifyDisease({ vector: [0.1, 0.2] })).toThrow(expect.objectContaining({ statusCode: 400, code: 'IMAGE_FEATURES_INVALID' }));
        expect(() => classifyDisease(null)).toThrow(expect.objectContaining({ statusCode: 400 }));
    });
});
