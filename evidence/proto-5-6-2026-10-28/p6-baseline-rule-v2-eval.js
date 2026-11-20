const fs = require('fs'); const path = require('path');
const B = '/home/ubuntu/work/wt-proto56/apps/backend/services/image-assessment/';
const { extractImageFeatures } = require(B + 'image-feature-extractor');
const { classifyDisease, DISEASE_CLASSES } = require(B + 'disease-classifier');
const { evaluateClassifier } = require(B + 'classifier-evaluator');
(async () => {
  const dir = process.argv[2];
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  const samples = [];
  for (const img of m.images.filter((i) => i.split === 'test')) {
    const r = await classifyDisease(await extractImageFeatures(path.join(dir, img.path)));
    samples.push({ actual: img.label, predicted: r.top.disease });
  }
  const e = evaluateClassifier(samples, DISEASE_CLASSES);
  fs.writeFileSync(process.argv[3], JSON.stringify({ classifier: 'feature-rule-v2 (hand-written rules, origin/main ac977e18e)', ...e }, null, 2));
  console.log('rule baseline test accuracy', (e.accuracy * 100).toFixed(1) + '%', e.correct + '/' + e.total);
  for (const c of DISEASE_CLASSES) console.log(' ', c, 'recall', (e.perClass[c].recall * 100).toFixed(1) + '%', 'n=' + e.perClass[c].support);
})();
