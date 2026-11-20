'use strict';

/**
 * A deterministic 960x720 "leaf" photo drawn pixel by pixel: a green field
 * with brown lesions and a pale powdery patch. It is not a PlantVillage image
 * (those are never committed), so it can live in the repo and give the
 * extractor + model + route a real image to chew on in a test.
 *
 * Regenerate the pinned fixture when the extractor's feature order changes on
 * purpose:
 *   node -e "require('./__tests__/fixtures/synthetic-leaf').writeFixture()"
 */

const fs = require('fs');
const path = require('path');

const WIDTH = 960;
const HEIGHT = 720;
const FIXTURE_PATH = path.join(__dirname, 'synthetic-leaf-through-route.json');

function syntheticLeafPng() {
    const sharp = require('sharp');
    const raw = Buffer.alloc(WIDTH * HEIGHT * 3);
    const lesions = [[180, 160, 40], [520, 300, 55], [760, 560, 35], [300, 600, 48]];
    const powdery = [640, 140, 70];
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            let r = 62 + ((x * 7 + y * 3) % 20);
            let g = 150 + ((x * 5 + y * 11) % 30);
            let b = 48 + ((x + y) % 14);
            for (const [cx, cy, radius] of lesions) {
                if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) { r = 110; g = 70; b = 30; }
            }
            if ((x - powdery[0]) ** 2 + (y - powdery[1]) ** 2 <= powdery[2] ** 2) { r = 225; g = 228; b = 220; }
            const i = (y * WIDTH + x) * 3;
            raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
        }
    }
    return sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toBuffer();
}

async function writeFixture() {
    const { extractImageFeatures } = require('../../services/image-assessment/image-feature-extractor');
    const { classifyDisease } = require('../../services/image-assessment/disease-classifier');
    const features = await extractImageFeatures(await syntheticLeafPng());
    const { predictions } = classifyDisease(features);
    fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify({ width: WIDTH, height: HEIGHT, vector: features.vector, predictions }, null, 2)}\n`);
    console.log(`wrote ${FIXTURE_PATH}: top ${predictions[0].disease} ${predictions[0].confidence}`);
}

module.exports = { WIDTH, HEIGHT, FIXTURE_PATH, syntheticLeafPng, writeFixture };
