'use strict';

/**
 * What STORAGE_PROVIDER says about this box: the ONE reading of it.
 *
 * Three readers ask three different questions of the same variable, so the answers
 * live in one table instead of three string comparisons:
 *
 *   value, trimmed and lower-cased | files go to | S3 keys required | recognised
 *   -------------------------------+-------------+------------------+-----------
 *   unset, empty or blank          | local disk  | yes              | yes
 *   local                          | local disk  | no               | yes
 *   minio, or its alias s3         | MinIO / S3  | yes              | yes
 *   anything else                  | local disk  | yes              | NO
 *
 *   services/storage-service.js  asks where a file goes.
 *   config/secrets.js            asks whether S3_ACCESS_KEY / S3_SECRET_KEY are required.
 *       They are, unless the box says `local` in so many words. Staging does (order 60(b)):
 *       its files stay on its own uploads volume, so it never opens a MinIO client and holds
 *       no key for one. Requiring the keys there left two ways past the production boot gate,
 *       forwarding the shared MinIO's root credentials into the container or waiving the
 *       whole gate with ALLOW_PENDING_SECRETS. Unset is not enough:
 *       docker-compose.production.yml and docker-compose.bluegreen.yml give the container
 *       `minio` when the host leaves it unset (STORAGE_PROVIDER=${STORAGE_PROVIDER:-minio}),
 *       while scripts/deploy-prod.sh checks the HOST environment, so a gate that read
 *       "unset" as "local" passes and the container then refuses to boot (security
 *       re-review B-L1). A word nobody recognises fails closed the same way.
 *   config/env-validator.js      asks whether the word is one the code knows. A typo
 *       (mini0), another provider's name (aws) or an invisible character inside the word
 *       would mean "local disk" without a sound (B-L2), so production refuses to boot on
 *       it and every other NODE_ENV logs a warning.
 *
 * Lives in config/ because that is where deploy configuration is read
 * (scripts/probes/ratchet.sh counts process.env reads in services/ and routes/).
 *
 * @module config/storage-provider
 */

/** A Map, not an object: `constructor` and `__proto__` must not look recognised. */
const RECOGNISED = new Map([
    ['local', Object.freeze({ backend: 'local', s3KeysRequired: false })],
    ['minio', Object.freeze({ backend: 'minio', s3KeysRequired: true })],
    ['s3', Object.freeze({ backend: 'minio', s3KeysRequired: true })],
]);

const UNSET = Object.freeze({ backend: 'local', s3KeysRequired: true });

const VALID_STORAGE_PROVIDERS = Object.freeze([...RECOGNISED.keys()]);

/**
 * @typedef {object} StorageProviderReading
 * @property {string}  backend        where storage-service writes: 'local', 'minio', or, for a
 *                                    word nobody recognises, that word as written (never object storage)
 * @property {boolean} s3KeysRequired whether production needs S3_ACCESS_KEY and S3_SECRET_KEY
 * @property {boolean} valid          false only for a word that is not local, minio or s3
 */

/**
 * @param {object} [env=process.env]
 * @returns {StorageProviderReading}
 */
function readStorageProvider(env = process.env) {
    const word = String(env.STORAGE_PROVIDER ?? '').trim().toLowerCase();
    if (word === '') {
        return { ...UNSET, valid: true };
    }
    const known = RECOGNISED.get(word);
    if (known) {
        return { ...known, valid: true };
    }
    return { backend: word, s3KeysRequired: true, valid: false };
}

/**
 * @param {object} [env=process.env]
 * @returns {string}
 */
function resolveStorageProvider(env = process.env) {
    return readStorageProvider(env).backend;
}

module.exports = { readStorageProvider, resolveStorageProvider, VALID_STORAGE_PROVIDERS };
