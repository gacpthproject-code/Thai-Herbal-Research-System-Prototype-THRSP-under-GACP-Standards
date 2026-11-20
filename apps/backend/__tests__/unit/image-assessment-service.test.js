'use strict';

/**
 * Image Assessment Service — สัญญา C05F680149 ต้นแบบที่ 6 (3 โมดูล):
 *   6.1 ตรวจสอบรูปภาพ (คุณภาพ/ความสมบูรณ์ของภาพ)
 *   6.2 ให้คะแนนคุณภาพ 1-100 (delegated to quality-scoring-service)
 *   6.3 ตรวจจับโรคพืช 7 โรค (delegated to disease-classifier)
 *
 * The orchestrator ties feature extraction → image inspection + disease
 * classification, and exposes the module catalog + eval harness. It never
 * decides certification.
 */

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const mockExtract = jest.fn();
jest.mock('../../services/image-assessment/image-feature-extractor', () => ({
    extractImageFeatures: (...a) => mockExtract(...a),
}));

const svc = require('../../services/image-assessment/image-assessment-service');
const reference = require('../fixtures/disease-trees-sklearn-reference.json');

beforeEach(() => jest.clearAllMocks());

describe('inspectImageQuality (6.1) — pure', () => {
    test('good photo passes; small/dark photo fails with issues', () => {
        const good = svc.inspectImageQuality({ width: 1600, height: 1200, brightness: 130 });
        expect(good.passed).toBe(true);
        expect(good.resolutionOk).toBe(true);
        expect(good.exposureOk).toBe(true);
        expect(good.score).toBeGreaterThan(0);

        const bad = svc.inspectImageQuality({ width: 320, height: 240, brightness: 10 });
        expect(bad.passed).toBe(false);
        expect(bad.issues.length).toBeGreaterThan(0);
    });

    test('overexposed photo flags exposure', () => {
        const r = svc.inspectImageQuality({ width: 1600, height: 1200, brightness: 245 });
        expect(r.exposureOk).toBe(false);
        expect(r.issues.join(' ')).toMatch(/สว่าง|exposure|แสง/i);
    });
});

describe('assessPlantCondition (6.1 — completeness + harvest maturity, baseline)', () => {
    test('vigorous green leaf → high completeness, IMMATURE, advisory', () => {
        const r = svc.assessPlantCondition({ colorMeans: { r: 60, g: 155, b: 55 }, darkSpotRatio: 0.01, whiteCoverageRatio: 0.01, yellowRatio: 0.02 });
        expect(r.completenessScore).toBeGreaterThan(50);
        expect(r.maturityStage).toBe('IMMATURE');
        expect(r.isBaseline).toBe(true);
        expect(r.needsExpertConfirmation).toBe(true);
    });

    test('yellowing leaf → MATURE; heavy yellow/brown → OVER_MATURE', () => {
        expect(svc.assessPlantCondition({ colorMeans: { r: 150, g: 150, b: 90 }, yellowRatio: 0.12 }).maturityStage).toBe('MATURE');
        expect(svc.assessPlantCondition({ colorMeans: { r: 160, g: 150, b: 80 }, yellowRatio: 0.4 }).maturityStage).toBe('OVER_MATURE');
    });

    test('heavy lesion coverage lowers completeness', () => {
        const damaged = svc.assessPlantCondition({ colorMeans: { r: 70, g: 120, b: 60 }, darkSpotRatio: 0.4, whiteCoverageRatio: 0.2, yellowRatio: 0.1 });
        const clean = svc.assessPlantCondition({ colorMeans: { r: 70, g: 120, b: 60 }, darkSpotRatio: 0, whiteCoverageRatio: 0, yellowRatio: 0 });
        expect(damaged.completenessScore).toBeLessThan(clean.completenessScore);
    });
});

describe('assessImage (orchestrator)', () => {
    test('extracts features → returns imageInspection (6.1) + plantCondition (6.1) + disease (6.3) + features', async () => {
        const sample = reference.samples.find((x) => x.label === 'VIRUS');
        mockExtract.mockResolvedValue({
            width: 1600, height: 1200, brightness: 120,
            colorMeans: { r: 70, g: 150, b: 60 }, darkSpotRatio: 0.02, whiteCoverageRatio: 0.01, yellowRatio: 0.02,
            vector: sample.vector,
        });
        const result = await svc.assessImage('/tmp/leaf.jpg', { herbCode: 'CANNABIS' });

        expect(mockExtract).toHaveBeenCalledWith('/tmp/leaf.jpg');
        expect(result.imageInspection.passed).toBe(true);
        expect(result.plantCondition.maturityStage).toBeTruthy();
        expect(typeof result.plantCondition.completenessScore).toBe('number');
        expect(result.disease.predictions).toHaveLength(6);
        expect(result.disease.notAssessed.map((n) => n.disease)).toEqual(['ROOT_ROT', 'WILT']);
        expect(result.disease.measured.testImages).toBeGreaterThan(0);
        expect(result.disease.needsExpertConfirmation).toBe(true);
        expect(result.features.width).toBe(1600);
        expect(result.features).not.toHaveProperty('vector');
        expect(result.herbCode).toBe('CANNABIS');
    });

    test('extractor failure → 422 IMAGE_UNREADABLE (not a 500)', async () => {
        mockExtract.mockRejectedValue(new Error('bad image'));
        await expect(svc.assessImage('/tmp/broken.jpg', {}))
            .rejects.toMatchObject({ statusCode: 422, code: 'IMAGE_UNREADABLE' });
    });
});

describe('scoreProductQuality (6.2 wrapper)', () => {
    test('delegates to quality scorer and attaches a certificate', () => {
        const r = svc.scoreProductQuality(
            { COLOR: 90, SIZE: 85, MOISTURE: 95, CONTAMINATION: 80, ACTIVE_COMPOUND: 88 },
            { herbCode: 'TURMERIC', batchNumber: 'B1' },
        );
        expect(r.score).toBeGreaterThan(0);
        expect(r.certificate.herbCode).toBe('TURMERIC');
        expect(r.certificate.kind).toBe('PRODUCT_QUALITY_ASSESSMENT');
    });
});

describe('getCatalog (acceptance surface)', () => {
    test('lists the 7 diseases (+HEALTHY), 5 quality dimensions, and the disease model with its measured test', () => {
        const cat = svc.getCatalog();
        expect(cat.diseases).toContain('LEAF_BLIGHT');
        expect(cat.diseases).toContain('VIRUS');
        expect(cat.diseases.filter(d => d !== 'HEALTHY')).toHaveLength(7);
        expect(cat.qualityDimensions).toHaveLength(5);
        expect(cat.diseaseModel.name).toBe('disease-trees-v1');
        expect(cat.diseaseModel.test.total).toBeGreaterThan(0);
        expect(Object.keys(cat.diseaseModel.notCovered)).toEqual(['ROOT_ROT', 'WILT']);
        const unseen = cat.diseaseModel.unseenCropCheck;
        expect(unseen.images).toBeGreaterThan(0);
        expect(unseen.recall).toBeCloseTo(unseen.correct / unseen.images, 4);
        expect(cat.accuracyTarget).toBe(0.85);
    });

    test('neither the catalog nor the card says the contract target is met: 89.5% was measured on PlantVillage leaves, not on the six herbs', () => {
        const cat = svc.getCatalog();
        expect(cat.diseaseModel.test).not.toHaveProperty('meetsTarget');
        expect(require('../../services/image-assessment/model/disease-trees.card.json').test).not.toHaveProperty('meetsTarget');
    });
});

describe('evaluateModel (KPI harness)', () => {
    test('delegates to the evaluator over the disease class space', () => {
        const r = svc.evaluateModel([
            { actual: 'HEALTHY', predicted: 'HEALTHY' },
            { actual: 'VIRUS', predicted: 'VIRUS' },
        ]);
        expect(r.accuracy).toBe(1);
        expect(r.meetsTarget).toBe(true);
        expect(r.classes).toContain('LEAF_SPOT');
    });
});
