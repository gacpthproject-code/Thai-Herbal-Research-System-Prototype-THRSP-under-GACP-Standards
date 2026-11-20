'use strict';

/**
 * Measures model/disease-trees.json on the held-out test split, reading each
 * photo from disk through the server's extractor and tree inference, and writes
 * the measured numbers to model/disease-trees.card.json (what the screen shows).
 * Also checks that the JavaScript inference reproduces scikit-learn's
 * probabilities on the reference vectors train_disease_model.py recorded.
 *
 * Usage: node scripts/image-model/evaluate-disease-model.js <cacheDir> [report.json]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { extractImageFeatures } = require('../../services/image-assessment/image-feature-extractor');
const { MODEL_NAME, MODEL_CLASSES, predictProbabilities } = require('../../services/image-assessment/disease-trees');
const { evaluateClassifier } = require('../../services/image-assessment/classifier-evaluator');
const model = require('../../services/image-assessment/model/disease-trees.json');
const mapping = require('./plantvillage-mapping.json');
const reference = require('../../__tests__/fixtures/disease-trees-sklearn-reference.json');

const MODEL_PATH = path.join(__dirname, '../../services/image-assessment/model/disease-trees.json');
const CARD_PATH = path.join(__dirname, '../../services/image-assessment/model/disease-trees.card.json');
const CALIBRATION_EDGES = [0, 0.5, 0.7, 0.9, 1];

function checkAgainstSklearn() {
    let worst = 0;
    for (const sample of reference.samples) {
        predictProbabilities(sample.vector).forEach((p, k) => { worst = Math.max(worst, Math.abs(p - sample.proba[k])); });
    }
    if (worst > 1e-9) { throw new Error(`JavaScript inference differs from scikit-learn by ${worst}`); }
    return worst;
}

function calibration(predictions) {
    return CALIBRATION_EDGES.slice(0, -1).map((low, i) => {
        const high = CALIBRATION_EDGES[i + 1];
        const inBin = predictions.filter((p) => p.confidence >= low && (p.confidence < high || (high === 1 && p.confidence <= 1)));
        const correct = inBin.filter((p) => p.actual === p.predicted).length;
        return { confidenceFrom: low, confidenceTo: high, count: inBin.length, observedAccuracy: inBin.length ? Number((correct / inBin.length).toFixed(4)) : null };
    });
}

async function main() {
    const [cacheDir, reportPath] = process.argv.slice(2);
    if (!cacheDir) { throw new Error('usage: evaluate-disease-model.js <cacheDir> [report.json]'); }
    const maxDifference = checkAgainstSklearn();

    const manifest = JSON.parse(fs.readFileSync(path.join(cacheDir, 'manifest.json'), 'utf8'));
    const test = manifest.images.filter((i) => i.split === 'test');
    const predictions = [];
    for (const image of test) {
        const { vector } = await extractImageFeatures(path.join(cacheDir, image.path));
        const probabilities = predictProbabilities(vector);
        const k = probabilities.indexOf(Math.max(...probabilities));
        predictions.push({ file: image.path, sha256: image.sha256, actual: image.label, predicted: MODEL_CLASSES[k], confidence: probabilities[k] });
    }
    const evaluation = evaluateClassifier(predictions, [...MODEL_CLASSES], { target: 0.85 });
    const count = (split, label) => manifest.images.filter((i) => i.split === split && i.label === label).length;

    const card = {
        model: MODEL_NAME,
        modelSha256: crypto.createHash('sha256').update(fs.readFileSync(MODEL_PATH)).digest('hex'),
        evaluatedAt: new Date().toISOString(),
        dataset: manifest.dataset,
        repository: manifest.repository,
        licenceNote: mapping.licenceNote,
        domainNote: manifest.domainNote,
        notCovered: mapping.notCovered,
        training: model.training,
        imagesPerClass: Object.fromEntries(MODEL_CLASSES.map((c) => [c, { train: count('train', c), test: count('test', c) }])),
        javascriptMatchesSklearnWithin: maxDifference,
        test: {
            total: evaluation.total,
            correct: evaluation.correct,
            accuracy: Number(evaluation.accuracy.toFixed(4)),
            target: evaluation.target,
            perClass: evaluation.perClass,
            confusionMatrix: evaluation.confusionMatrix,
            calibration: calibration(predictions),
        },
    };
    fs.writeFileSync(CARD_PATH, `${JSON.stringify(card, null, 2)}\n`);
    if (reportPath) { fs.writeFileSync(reportPath, JSON.stringify({ card, predictions }, null, 2)); }

    console.log(`javascript vs scikit-learn max difference ${maxDifference}`);
    console.log(`test accuracy ${(evaluation.accuracy * 100).toFixed(1)}% (${evaluation.correct}/${evaluation.total})`);
    for (const c of MODEL_CLASSES) {
        const k = evaluation.perClass[c];
        console.log(`  ${c}: precision ${(k.precision * 100).toFixed(1)}% recall ${(k.recall * 100).toFixed(1)}% (n=${k.support})`);
    }
    for (const b of card.test.calibration) {
        console.log(`  confidence ${b.confidenceFrom}-${b.confidenceTo}: ${b.count} photos, ${b.observedAccuracy === null ? '-' : `${(b.observedAccuracy * 100).toFixed(1)}%`} correct`);
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
