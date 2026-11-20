'use strict';

/**
 * Pseudonym keys anyone can read (K15/K16 L4): the synthetic sample's key,
 * published so anyone can regenerate docs/data/sample, and the test-run
 * fallback of config/secrets.js. Whoever holds a real id (a batch id on a
 * public QR page, say) can recompute its pseudonym under either key, so
 * dataset-export-service refuses both in every environment.
 *
 * Only the dataset checker's scratch backend accepts the sample key, through
 * the preload scripts/datasets/lib/sample-key.js.
 */
const PUBLIC_PSEUDONYM_KEYS = Object.freeze({
    SAMPLE: 'synthetic-sample-pseudonym-key-public-not-a-secret-2026',
    TEST_FALLBACK: 'test-only-dataset-pseudonym-key-32-bytes-okay',
});

module.exports = { PUBLIC_PSEUDONYM_KEYS };
