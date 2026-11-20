'use strict';

/**
 * Inference for model/disease-trees.json, the tree ensemble exported by
 * scripts/image-model/train_disease_model.py. Same arithmetic as
 * scikit-learn's HistGradientBoostingClassifier.predict_proba.
 */

const model = require('./model/disease-trees.json');

function treeValue(nodes, vector) {
    let node = nodes[0];
    while (node[0] !== -1) {
        node = nodes[vector[node[0]] <= node[1] ? node[2] : node[3]];
    }
    return node[4];
}

/** @returns {number[]} probabilities in model.classes order */
function predictProbabilities(vector) {
    if (!Array.isArray(vector) || vector.length !== model.featureLength) {
        const err = new Error(`Expected a feature vector of length ${model.featureLength}`);
        err.statusCode = 400;
        err.code = 'IMAGE_FEATURES_INVALID';
        throw err;
    }
    const raw = [...model.baseline];
    for (const iteration of model.trees) {
        iteration.forEach((nodes, k) => { raw[k] += treeValue(nodes, vector); });
    }
    const top = Math.max(...raw);
    const exp = raw.map((r) => Math.exp(r - top));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map((e) => e / sum);
}

module.exports = { MODEL_NAME: model.name, MODEL_CLASSES: Object.freeze([...model.classes]), predictProbabilities };
