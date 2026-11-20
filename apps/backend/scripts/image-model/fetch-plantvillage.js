'use strict';

/**
 * Downloads the labelled PlantVillage subset named in plantvillage-mapping.json
 * into <cacheDir>, outside the repository, and writes <cacheDir>/manifest.json
 * (one row per image: class, source folder, file, sha256, split).
 * Idempotent: a file already on disk with its recorded hash is not fetched again.
 *
 * Usage: node scripts/image-model/fetch-plantvillage.js <cacheDir>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const mapping = require('./plantvillage-mapping.json');

const API = 'https://api.github.com/repos/spMohanty/PlantVillage-Dataset/contents/raw/color';
const TEST_SHARE = 3; // of 10 buckets

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function splitOf(sourceClass, file) {
    const bucket = parseInt(sha256(`${sourceClass}/${file}`).slice(0, 8), 16) % 10;
    return bucket < TEST_SHARE ? 'test' : 'train';
}

async function getJson(url) {
    const headers = { 'User-Agent': 'gacp-proto6-eval', Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) { headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`; }
    const res = await fetch(url, { headers });
    if (!res.ok) { throw new Error(`${res.status} listing ${url}`); }
    return res.json();
}

async function getBytes(url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await fetch(url);
        if (res.ok) { return Buffer.from(await res.arrayBuffer()); }
        if (attempt === 3) { throw new Error(`${res.status} fetching ${url}`); }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    return null;
}

function pickEvenly(names, count) {
    const sorted = [...names].sort();
    if (sorted.length <= count) { return sorted; }
    const stride = sorted.length / count;
    return Array.from({ length: count }, (_, i) => sorted[Math.floor(i * stride)]);
}

async function main() {
    const cacheDir = process.argv[2];
    if (!cacheDir) { throw new Error('usage: fetch-plantvillage.js <cacheDir>'); }
    fs.mkdirSync(cacheDir, { recursive: true });

    const rows = [];
    for (const [label, sources] of Object.entries(mapping.classes)) {
        const perSource = Math.ceil(mapping.imagesPerClass / sources.length);
        for (const sourceClass of sources) {
            const listing = await getJson(`${API}/${encodeURIComponent(sourceClass)}`);
            const files = pickEvenly(listing.filter((e) => e.type === 'file').map((e) => e.name), perSource);
            const dir = path.join(cacheDir, label);
            fs.mkdirSync(dir, { recursive: true });
            for (const file of files) {
                const local = path.join(dir, `${sourceClass.replace(/[^A-Za-z0-9_.-]/g, '_')}__${file}`);
                let bytes = fs.existsSync(local) ? fs.readFileSync(local) : null;
                if (!bytes) {
                    bytes = await getBytes(`${mapping.rawBase}/${encodeURIComponent(sourceClass)}/${encodeURIComponent(file)}`);
                    fs.writeFileSync(local, bytes);
                }
                rows.push({
                    label, sourceClass, file, path: path.relative(cacheDir, local),
                    sha256: sha256(bytes), split: splitOf(sourceClass, file),
                });
            }
            console.log(`${label} <- ${sourceClass}: ${files.length} of ${listing.length}`);
        }
    }

    const manifest = {
        dataset: mapping.dataset, repository: mapping.repository, licenceNote: mapping.licenceNote,
        domainNote: mapping.domainNote, fetchedAt: new Date().toISOString(), images: rows,
    };
    fs.writeFileSync(path.join(cacheDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const count = (split) => rows.filter((r) => r.split === split).length;
    console.log(`manifest: ${rows.length} images (train ${count('train')}, test ${count('test')})`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
