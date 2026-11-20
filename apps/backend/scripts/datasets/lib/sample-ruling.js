'use strict';

/**
 * Preloaded (`node -r`) only into backends the dataset checker boots on a
 * scratch database: puts a synthetic farm-operation ruling in force, with a
 * synthetic research ethics approval, so the three farm domains can be
 * exported and checked. DATASET_SAMPLE_RULING=without-ethics-approval drops
 * the approval from the same ruling, which every export must refuse (order
 * 56(4.3)). A real backend never loads this file; its rulings come only from
 * data/datasets/research-use-bases.js.
 */

const Module = require('module');
const path = require('path');

if (process.env.NODE_ENV !== 'development') {
    throw new Error('sample-ruling.js puts a synthetic ruling in force; it loads only into the checker\'s development backend');
}

const VARIANTS = new Set([undefined, 'without-ethics-approval']);
if (!VARIANTS.has(process.env.DATASET_SAMPLE_RULING)) {
    throw new Error(`sample-ruling.js: unknown DATASET_SAMPLE_RULING ${process.env.DATASET_SAMPLE_RULING}`);
}

const SYNTHETIC_ETHICS_APPROVAL = Object.freeze({
    committee: 'คณะกรรมการสังเคราะห์ของชุดตัวอย่าง ไม่ใช่คณะกรรมการจริง',
    reference: 'SAMPLE-ONLY-0001',
    approvedOn: '2025-12-15',
});

const file = require.resolve(path.join(__dirname, '../../../data/datasets/research-use-bases.js'));
const mod = new Module(file);
mod.filename = file;
mod.loaded = true;
mod.exports = {
    RESEARCH_USE_BASES: Object.freeze({
        FARM_OPERATION: Object.freeze([Object.freeze({
            effectiveFrom: '2026-01-01',
            inForce: true,
            privacyNoticeVersion: 'synthetic-sample-only',
            ...(process.env.DATASET_SAMPLE_RULING === 'without-ethics-approval' ? {} : { ethicsApproval: SYNTHETIC_ETHICS_APPROVAL }),
            ruling: 'ชุดตัวอย่างสังเคราะห์เท่านั้น ไม่ใช่มติของ operator',
        })]),
    }),
};
require.cache[file] = mod;
