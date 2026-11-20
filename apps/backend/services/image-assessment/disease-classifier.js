'use strict';

/**
 * Disease Classifier — สัญญา C05F680149 ต้นแบบที่ 6 โมดูล 6.3 "ตรวจจับโรคพืช 7 โรค".
 *
 * A gradient-boosted tree ensemble trained by scripts/image-model on labelled
 * public leaf photos (PlantVillage). It scores the classes it was trained on;
 * ROOT_ROT and WILT have no labelled photos in that set, so the model returns
 * no score for them and says so. Every answer carries the accuracy the model
 * measured on held-out photos (model/disease-trees.card.json, written by
 * evaluate-disease-model.js) and is advice for the inspector, who decides.
 */

const { MODEL_NAME, MODEL_CLASSES, predictProbabilities } = require('./disease-trees');
const card = require('./model/disease-trees.card.json');

// 7 โรคตามเอกสารแนบ A3 (สัญญาหน้า 51/81) + HEALTHY (ไม่พบโรค)
const DISEASE_CLASSES = Object.freeze([
    'HEALTHY',
    'LEAF_BLIGHT',      // ใบไหม้
    'POWDERY_MILDEW',   // ราแป้ง
    'LEAF_SPOT',        // ใบจุด
    'ROOT_ROT',         // โคนเน่า
    'WILT',             // ยอดเหี่ยว
    'PEST',             // แมลงศัตรูพืช
    'VIRUS',            // ไวรัส
]);

const NOT_ASSESSED = Object.freeze(
    DISEASE_CLASSES.filter((d) => !MODEL_CLASSES.includes(d)).map((disease) => ({ disease, reason: card.notCovered[disease] })),
);

function calibrationBinFor(confidence) {
    return card.test.calibration.find((b) => confidence >= b.confidenceFrom && (confidence < b.confidenceTo || b.confidenceTo === 1));
}

/** @param {{vector:number[]}} features — from image-feature-extractor */
function classifyDisease(features) {
    const probabilities = predictProbabilities(features?.vector);
    const predictions = MODEL_CLASSES
        .map((disease, k) => ({ disease, confidence: probabilities[k] }))
        .sort((a, b) => b.confidence - a.confidence);
    const top = predictions[0];
    return {
        provider: MODEL_NAME,
        predictions,
        top,
        notAssessed: NOT_ASSESSED,
        measured: {
            testAccuracy: card.test.accuracy,
            testImages: card.test.total,
            topPrecision: card.test.perClass[top.disease].precision,
            topRecall: card.test.perClass[top.disease].recall,
            atThisConfidence: calibrationBinFor(top.confidence),
            dataset: card.dataset,
            domainNote: card.domainNote,
        },
        needsExpertConfirmation: true,
    };
}

module.exports = {
    DISEASE_CLASSES,
    MODEL_CARD: card,
    classifyDisease,
};
