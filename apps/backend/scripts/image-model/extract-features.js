'use strict';

/**
 * Computes the model feature vector for every image in <cacheDir>/manifest.json
 * with the server's own extractor and writes <cacheDir>/features.json
 * ({ sha256: vector }). Images already in features.json are skipped.
 *
 * Usage: node scripts/image-model/extract-features.js <cacheDir>
 */

const fs = require('fs');
const path = require('path');

const { extractImageFeatures } = require('../../services/image-assessment/image-feature-extractor');

async function main() {
    const cacheDir = process.argv[2];
    if (!cacheDir) { throw new Error('usage: extract-features.js <cacheDir>'); }
    const manifest = JSON.parse(fs.readFileSync(path.join(cacheDir, 'manifest.json'), 'utf8'));
    const cachePath = path.join(cacheDir, 'features.json');
    const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
    let added = 0;
    for (const image of manifest.images) {
        if (!cache[image.sha256]) {
            cache[image.sha256] = (await extractImageFeatures(path.join(cacheDir, image.path))).vector;
            added += 1;
        }
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    console.log(`features: ${manifest.images.length} images, ${added} newly extracted`);
}

main().catch((error) => { console.error(error); process.exit(1); });
