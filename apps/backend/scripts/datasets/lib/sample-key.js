'use strict';

/**
 * Preloaded (`node -r`) only into the backend the dataset checker boots to
 * write and export the synthetic sample: lets the published sample key
 * through the export, which refuses it everywhere else
 * (data/datasets/public-pseudonym-keys.js). A real backend never loads this file.
 */

const Module = require('module');
const path = require('path');

if (process.env.NODE_ENV !== 'development') {
    throw new Error('sample-key.js accepts the published sample key; it loads only into the checker\'s development backend');
}

const file = require.resolve(path.join(__dirname, '../../../data/datasets/public-pseudonym-keys.js'));
const { PUBLIC_PSEUDONYM_KEYS } = require(file);
const mod = new Module(file);
mod.filename = file;
mod.loaded = true;
mod.exports = { PUBLIC_PSEUDONYM_KEYS: Object.freeze({ TEST_FALLBACK: PUBLIC_PSEUDONYM_KEYS.TEST_FALLBACK }) };
require.cache[file] = mod;
