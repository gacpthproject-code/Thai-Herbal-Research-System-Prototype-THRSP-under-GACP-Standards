'use strict';

/**
 * Image Feature Extractor — สัญญา C05F680149 ต้นแบบที่ 6.
 * Extracts REAL image features with `sharp` (already a dependency — no new ML
 * runtime): resolution, brightness, colour means, and lesion ratios
 * (dark-spot / white-coverage / yellowing) from a downsampled pixel buffer.
 * These features feed both image inspection (6.1) and the disease classifier
 * (6.3). Pure pixel math lives in `deriveLesionRatios` (unit-testable without
 * sharp).
 */

let sharpLib = null;
function getSharp() {
    if (!sharpLib) {
        // Lazy require: keeps the module importable in environments without the
        // native binary (tests mock this module); real routes have sharp.
        sharpLib = require('sharp');
    }
    return sharpLib;
}

const SAMPLE_SIZE = 64; // downsample edge for cheap per-pixel analysis

function isBrownPixel(r, g, b, lum) {
    return r >= 80 && r <= 200 && g >= 40 && g <= 150 && r > g + 12 && g > b && b < 110 && lum >= 45;
}

/**
 * Pure: classify each RGB pixel and return coverage ratios + colour means.
 * @param {Buffer|Uint8Array} data — interleaved pixels
 * @param {number} channels — 3 (RGB) or 4 (RGBA)
 * @param {number} [side] — grid width (rows are `side` px wide) for the spot
 *   fragmentation texture metric; defaults to round(sqrt(pixelCount)).
 *
 * Two features added for ต้นแบบ-6 classifier v2 (2026-07-11): `brownRatio`
 * (brown necrotic tissue — separates blight/leaf-spot from black rot/pest) and
 * `spotFragmentation` (dark-region edge density normalised by dark area — HIGH
 * for many discrete lesions like leaf-spot/pest chewing, LOW for one contiguous
 * necrotic patch like blight). These are what let the classifier tell the
 * dark-based diseases apart, which brightness+darkRatio alone cannot.
 */
function deriveLesionRatios(data, channels, side) {
    const step = channels >= 3 ? channels : 3;
    const pixelCount = Math.floor(data.length / step);
    if (pixelCount === 0) {
        return { colorMeans: { r: 0, g: 0, b: 0 }, brightness: 0, darkSpotRatio: 0, whiteCoverageRatio: 0, yellowRatio: 0, brownRatio: 0, spotFragmentation: 0 };
    }
    const gridSide = Number.isInteger(side) && side > 0 ? side : Math.round(Math.sqrt(pixelCount));

    let sumR = 0, sumG = 0, sumB = 0;
    let dark = 0, white = 0, yellow = 0, brown = 0, lesion = 0;
    const isLesion = new Uint8Array(pixelCount); // dark OR brown necrotic tissue

    for (let i = 0; i < pixelCount; i++) {
        const o = i * step;
        const r = data[o], g = data[o + 1], b = data[o + 2];
        sumR += r; sumG += g; sumB += b;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        let les = false;
        if (lum < 60) { dark += 1; les = true; }             // dark necrotic lesion
        if (r > 190 && g > 190 && b > 190) { white += 1; }   // white powdery coverage
        if (r > 150 && g > 150 && b < 110) { yellow += 1; }  // yellowing (viral/nutrient)
        // brown necrosis: warm mid-tone, r>g>b, not too dark/bright
        if (isBrownPixel(r, g, b, lum)) { brown += 1; les = true; }
        if (les) { lesion += 1; isLesion[i] = 1; }
    }

    // spot fragmentation: dark↔/brown↔healthy transitions scanning rows+cols,
    // normalised by lesion area. One big necrotic patch (blight/rot) → few
    // transitions per lesion pixel (LOW); many small discrete lesions
    // (leaf-spot/pest) → many (HIGH). Counts BROWN lesions too, so brown spots
    // register (v1's dark-only frag missed leaf-spot entirely). Bounded [0,~4].
    let transitions = 0;
    if (gridSide > 1 && gridSide * gridSide <= pixelCount) {
        for (let y = 0; y < gridSide; y++) {
            for (let x = 1; x < gridSide; x++) {
                if (isLesion[y * gridSide + x] !== isLesion[y * gridSide + x - 1]) { transitions += 1; }
            }
        }
        for (let x = 0; x < gridSide; x++) {
            for (let y = 1; y < gridSide; y++) {
                if (isLesion[y * gridSide + x] !== isLesion[(y - 1) * gridSide + x]) { transitions += 1; }
            }
        }
    }
    const spotFragmentation = lesion > 0 ? Math.min(4, transitions / lesion) : 0;

    return {
        colorMeans: {
            r: Math.round(sumR / pixelCount),
            g: Math.round(sumG / pixelCount),
            b: Math.round(sumB / pixelCount),
        },
        brightness: Math.round((sumR + sumG + sumB) / (pixelCount * 3)),
        darkSpotRatio: dark / pixelCount,
        whiteCoverageRatio: white / pixelCount,
        yellowRatio: yellow / pixelCount,
        brownRatio: brown / pixelCount,
        spotFragmentation,
    };
}

const HUE_BINS = 12;
const SAT_BINS = 3;
const VAL_BINS = 3;
const GRADIENT_BINS = 8;
const GRADIENT_CEILING = 160;
const VECTOR_SIZE = 128;
const LBP_OFFSETS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

function uniformLbpBin(grey, side, x, y) {
    const centre = grey[y * side + x];
    let bits = 0;
    let previous = grey[(y + LBP_OFFSETS[7][1]) * side + x + LBP_OFFSETS[7][0]] >= centre ? 1 : 0;
    let transitions = 0;
    for (const [dx, dy] of LBP_OFFSETS) {
        const bit = grey[(y + dy) * side + x + dx] >= centre ? 1 : 0;
        bits += bit;
        if (bit !== previous) { transitions += 1; }
        previous = bit;
    }
    return transitions <= 2 ? bits : 9;
}

function lesionComponents(isLesion, side) {
    const seen = new Uint8Array(isLesion.length);
    const sizes = [];
    const stack = [];
    for (let start = 0; start < isLesion.length; start++) {
        if (!isLesion[start] || seen[start]) { continue; }
        let size = 0;
        stack.push(start);
        seen[start] = 1;
        while (stack.length) {
            const i = stack.pop();
            size += 1;
            const x = i % side;
            for (const j of [i - side, i + side, x > 0 ? i - 1 : -1, x < side - 1 ? i + 1 : -1]) {
                if (j >= 0 && j < isLesion.length && isLesion[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
            }
        }
        sizes.push(size);
    }
    const area = isLesion.length;
    const small = sizes.filter((s) => s <= 4).length;
    const medium = sizes.filter((s) => s > 4 && s <= 64).length;
    const large = sizes.filter((s) => s > 64).reduce((a, b) => a + b, 0);
    return [Math.min(1, sizes.length / 200), Math.min(1, small / 200), Math.min(1, medium / 50), large / area];
}

function hsvBin(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta > 0) {
        if (max === r) { hue = ((g - b) / delta) % 6; } else if (max === g) { hue = (b - r) / delta + 2; } else { hue = (r - g) / delta + 4; }
        hue = (hue * 60 + 360) % 360;
    }
    const sat = max === 0 ? 0 : delta / max;
    const val = max / 255;
    const h = Math.min(HUE_BINS - 1, Math.floor(hue / (360 / HUE_BINS)));
    const s = Math.min(SAT_BINS - 1, Math.floor(sat * SAT_BINS));
    const v = Math.min(VAL_BINS - 1, Math.floor(val * VAL_BINS));
    return (h * SAT_BINS + s) * VAL_BINS + v;
}

/**
 * Pure: the fixed-length numeric vector the trained disease model reads.
 * HSV colour histogram (12×3×3) + grey-level gradient-magnitude histogram (8)
 * + the scalar lesion features, all scaled to roughly 0-1.
 */
function featureVector(data, channels, side) {
    const step = channels >= 3 ? channels : 3;
    const pixelCount = Math.floor(data.length / step);
    const colour = new Array(HUE_BINS * SAT_BINS * VAL_BINS).fill(0);
    const gradient = new Array(GRADIENT_BINS).fill(0);
    const grey = new Float64Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        const o = i * step;
        colour[hsvBin(data[o], data[o + 1], data[o + 2])] += 1;
        grey[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }
    const texture = new Array(10).fill(0);
    let gradientSamples = 0;
    for (let y = 1; y < side - 1; y++) {
        for (let x = 1; x < side - 1; x++) {
            const i = y * side + x;
            const magnitude = Math.abs(grey[i + 1] - grey[i - 1]) + Math.abs(grey[i + side] - grey[i - side]);
            gradient[Math.min(GRADIENT_BINS - 1, Math.floor((magnitude / GRADIENT_CEILING) * GRADIENT_BINS))] += 1;
            texture[uniformLbpBin(grey, side, x, y)] += 1;
            gradientSamples += 1;
        }
    }
    const lesion = deriveLesionRatios(data, channels, side);
    const isLesion = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        const o = i * step;
        isLesion[i] = grey[i] < 60 || isBrownPixel(data[o], data[o + 1], data[o + 2], grey[i]) ? 1 : 0;
    }
    return [
        ...colour.map((c) => (pixelCount ? c / pixelCount : 0)),
        ...gradient.map((c) => (gradientSamples ? c / gradientSamples : 0)),
        ...texture.map((c) => (gradientSamples ? c / gradientSamples : 0)),
        ...lesionComponents(isLesion, side),
        lesion.brightness / 255,
        lesion.colorMeans.r / 255,
        lesion.colorMeans.g / 255,
        lesion.colorMeans.b / 255,
        lesion.darkSpotRatio,
        lesion.whiteCoverageRatio,
        lesion.yellowRatio,
        lesion.brownRatio,
        lesion.spotFragmentation / 4,
    ];
}

/**
 * Extract features from an image path or buffer.
 * @param {string|Buffer} input
 */
async function extractImageFeatures(input) {
    const sharp = getSharp();
    const metadata = await sharp(input).metadata();

    // Downsample to a fixed small size (RGB) for cheap per-pixel analysis.
    const { data, info } = await sharp(input)
        .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const channels = info.channels || 3;
    const lesion = deriveLesionRatios(data, channels, SAMPLE_SIZE);
    const detail = await sharp(input)
        .resize(VECTOR_SIZE, VECTOR_SIZE, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || null,
        channels: metadata.channels || info.channels || 3,
        ...lesion,
        vector: featureVector(detail.data, detail.info.channels || 3, VECTOR_SIZE),
    };
}

module.exports = { extractImageFeatures, deriveLesionRatios, featureVector };
