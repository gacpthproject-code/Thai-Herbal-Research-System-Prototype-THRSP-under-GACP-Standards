"""Fits the 6.3 disease model on the train split and exports it for the server.

Reads <cacheDir>/manifest.json and <cacheDir>/features.json (written by
extract-features.js), picks hyper-parameters by 5-fold cross-validation on the
train split only, fits a gradient-boosted tree ensemble, and writes every tree
to services/image-assessment/model/disease-trees.json, plus a few reference
probabilities for the JavaScript inference test. The test split is not
used to choose anything; evaluate-disease-model.js measures it through the server's code.
It also records an unseen-crop check: each source folder (one crop's photos of one class)
is left out of training in turn and the model's recall on it is written to the model.

Usage: python3 scripts/image-model/train_disease_model.py <cacheDir>
"""

import json
import os
import sys

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import KFold, cross_val_score

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, '..', '..', 'services', 'image-assessment', 'model', 'disease-trees.json')
GRID = [
    {'max_iter': 100, 'max_leaf_nodes': 15},
    {'max_iter': 100, 'max_leaf_nodes': 31},
    {'max_iter': 200, 'max_leaf_nodes': 15},
]
REFERENCE_PATH = os.path.join(HERE, '..', '..', '__tests__', 'fixtures', 'disease-trees-sklearn-reference.json')
SEED = 0
REFERENCE_PER_CLASS = 2


def export_tree(predictor):
    nodes = predictor.nodes
    return [
        [int(n['feature_idx']), float(n['num_threshold']), int(n['left']), int(n['right']), float(n['value'])]
        if not n['is_leaf'] else [-1, 0.0, 0, 0, float(n['value'])]
        for n in nodes
    ]


def leave_one_source_out(images, features, classes, params):
    """Recall on one source folder (one crop's photos of one class) when that folder is left out
    of training entirely: how the model does on a plant it has never seen with that disease."""
    rows = []
    for label in classes:
        sources = sorted({i['sourceClass'] for i in images if i['label'] == label})
        if len(sources) < 2:
            continue
        for source in sources:
            fit = [i for i in images if i['sourceClass'] != source]
            held = [i for i in images if i['sourceClass'] == source]
            model = HistGradientBoostingClassifier(random_state=SEED, early_stopping=False, **params).fit(
                np.array([features[i['sha256']] for i in fit]), [classes.index(i['label']) for i in fit])
            predicted = model.predict(np.array([features[i['sha256']] for i in held]))
            correct = int(np.sum(predicted == classes.index(label)))
            rows.append({'label': label, 'heldOutSource': source, 'images': len(held), 'correct': correct})
            print(f'held out {source}: {correct}/{len(held)}')
    return {
        'sources': rows,
        'images': sum(r['images'] for r in rows),
        'correct': sum(r['correct'] for r in rows),
        'recall': round(sum(r['correct'] for r in rows) / sum(r['images'] for r in rows), 4),
    }


def main():
    cache_dir = sys.argv[1]
    with open(os.path.join(cache_dir, 'manifest.json')) as fh:
        manifest = json.load(fh)
    with open(os.path.join(cache_dir, 'features.json')) as fh:
        features = json.load(fh)
    with open(os.path.join(HERE, 'plantvillage-mapping.json')) as fh:
        classes = list(json.load(fh)['classes'].keys())

    train = [i for i in manifest['images'] if i['split'] == 'train']
    X = np.array([features[i['sha256']] for i in train])
    y = np.array([classes.index(i['label']) for i in train])

    folds = KFold(5, shuffle=True, random_state=SEED)
    scored = []
    for params in GRID:
        model = HistGradientBoostingClassifier(random_state=SEED, early_stopping=False, **params)
        score = float(cross_val_score(model, X, y, cv=folds).mean())
        scored.append({**params, 'cvAccuracy': round(score, 4)})
        print(f'cv {params}: {score * 100:.1f}%')
    best = max(scored, key=lambda s: s['cvAccuracy'])
    params = {k: v for k, v in best.items() if k != 'cvAccuracy'}

    model = HistGradientBoostingClassifier(random_state=SEED, early_stopping=False, **params).fit(X, y)
    exported = {
        'name': 'disease-trees-v1',
        'classes': classes,
        'featureLength': int(X.shape[1]),
        'baseline': [float(v) for v in np.ravel(model._baseline_prediction)],
        'trees': [[export_tree(p) for p in iteration] for iteration in model._predictors],
        'training': {
            'library': f'scikit-learn {sklearn.__version__} HistGradientBoostingClassifier',
            'params': params,
            'crossValidation': scored,
            'trainImages': int(len(train)),
            'unseenCropCheck': leave_one_source_out(manifest['images'], features, classes, params),
        },
    }
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, 'w') as fh:
        json.dump(exported, fh, separators=(',', ':'))
    picks = [i for c in range(len(classes)) for i in np.flatnonzero(y == c)[:REFERENCE_PER_CLASS]]
    with open(REFERENCE_PATH, 'w') as fh:
        json.dump({
            'note': 'scikit-learn predict_proba for train-split feature vectors; the JavaScript inference must reproduce it',
            'samples': [{'label': classes[y[i]], 'vector': X[i].tolist(), 'proba': p.tolist()}
                        for i, p in zip(picks, model.predict_proba(X[picks]))],
        }, fh)
    print(f'chose {params}; wrote {MODEL_PATH}')


if __name__ == '__main__':
    main()
