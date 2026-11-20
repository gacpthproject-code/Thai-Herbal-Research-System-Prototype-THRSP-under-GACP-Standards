const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Client: MinioClient } = require('minio');
const { v4: uuidv4 } = require('uuid');
const logger = require('../shared/logger');
const { getSecret } = require('../config/secrets');
const { resolveStorageProvider } = require('../config/storage-provider');
const { multipartLimits } = require('../shared/multipart-limits');

const { BASE_UPLOAD_DIR, resolveWithinUploads } = require('./uploads-root');

const STORAGE_PROVIDER = resolveStorageProvider();
const CLOUD_STORAGE_ENABLED = STORAGE_PROVIDER === 'minio';

const STORAGE_CONFIG = {
    endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || '',
    region: process.env.S3_REGION || 'ap-southeast-1',
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
    bucket: process.env.S3_BUCKET || 'gacp-uploads',
};

const BUCKETS = {
    uploads: STORAGE_CONFIG.bucket,
};

let minioClient = null;
let warnedMissingCloudCredentials = false;

function normalizeUrlBase(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function encodeObjectKey(key) {
    return String(key || '')
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

function parseEndpoint(endpointValue) {
    const raw = String(endpointValue || '').trim();
    const withScheme = raw.includes('://') ? raw : `http://${raw}`;
    const parsed = new URL(withScheme);
    const useSSL = parsed.protocol === 'https:';
    const port = parsed.port ? Number(parsed.port) : (useSSL ? 443 : 80);

    return {
        endPoint: parsed.hostname,
        port,
        useSSL,
        canonicalBaseUrl: `${parsed.protocol}//${parsed.host}`,
    };
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function normalizeObjectKey(key) {
    return String(key || '')
        .replace(/^\/+/, '')
        .replace(/\\/g, '/');
}

function hasCloudCredentials() {
    return Boolean(STORAGE_CONFIG.accessKeyId && STORAGE_CONFIG.secretAccessKey);
}

function canUseCloudStorage() {
    if (!CLOUD_STORAGE_ENABLED) {
        return false;
    }

    if (!hasCloudCredentials()) {
        if (!warnedMissingCloudCredentials) {
            logger.warn('[Storage] STORAGE_PROVIDER=minio but credentials are missing. Falling back to local storage.');
            warnedMissingCloudCredentials = true;
        }
        return false;
    }

    return true;
}

// Correctness guard (audit BE-#8): when cloud storage is the configured backend
// AND we're in production, a "silent" downgrade to pod-local disk is dangerous —
// the file lands on one replica's ephemeral disk, invisible to other pods and
// gone on recycle (official certs/invoices would vanish). In that situation the
// storage layer must FAIL LOUDLY instead of pretending the write succeeded.
// Dev/test keep the convenient local fallback. Ops can force-allow the fallback
// in prod via STORAGE_ALLOW_LOCAL_FALLBACK=true (documented escape hatch).
function cloudStorageRequired() {
    if (String(process.env.STORAGE_ALLOW_LOCAL_FALLBACK || '').toLowerCase() === 'true') {
        return false;
    }
    return CLOUD_STORAGE_ENABLED && process.env.NODE_ENV === 'production';
}

function getMinioClient() {
    if (!canUseCloudStorage()) {
        return null;
    }

    if (!minioClient) {
        const endpointConfig = parseEndpoint(STORAGE_CONFIG.endpoint);
        minioClient = new MinioClient({
            endPoint: endpointConfig.endPoint,
            port: endpointConfig.port,
            useSSL: endpointConfig.useSSL,
            accessKey: STORAGE_CONFIG.accessKeyId,
            secretKey: STORAGE_CONFIG.secretAccessKey,
            region: STORAGE_CONFIG.region,
        });
    }

    return minioClient;
}

function getObjectPublicBaseUrl() {
    const explicitPublicEndpoint = normalizeUrlBase(STORAGE_CONFIG.publicEndpoint);
    if (explicitPublicEndpoint) {
        return explicitPublicEndpoint;
    }

    const endpointConfig = parseEndpoint(STORAGE_CONFIG.endpoint);
    return normalizeUrlBase(endpointConfig.canonicalBaseUrl);
}

function buildObjectUrl(bucket, key) {
    const base = getObjectPublicBaseUrl();
    return `${base}/${bucket}/${encodeObjectKey(key)}`;
}

// Bug #23 (carpet-bomb-inversion audit 2026-07-06) — the uploaded mimetype is
// client-supplied and spoofable, and the ORIGINAL filename extension is fully
// attacker-controlled. Accepting on mimetype alone + keeping originalname's
// extension let {Content-Type: image/png, filename: evil.html} be stored as
// <uuid>.html (a latent stored-XSS vector past the Batch-1 attachment/nosniff
// neutralisation). We map each safe mimetype to (a) the extensions we accept as
// INPUT and (b) a single CANONICAL extension we STORE — the stored name never
// trusts originalname's extension.
const MIMETYPE_INPUT_EXTENSIONS = Object.freeze({
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/jpg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'application/pdf': ['.pdf'],
});

const MIMETYPE_CANONICAL_EXTENSION = Object.freeze({
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
});

// The set of INPUT extensions accepted for a given list of allowed mimetypes.
function allowedExtensionsForMimetypes(allowedMimeTypes) {
    const set = new Set();
    for (const mt of allowedMimeTypes || []) {
        for (const ext of (MIMETYPE_INPUT_EXTENSIONS[String(mt).toLowerCase()] || [])) {
            set.add(ext);
        }
    }
    return set;
}

// The canonical, safe stored extension for an ACCEPTED file — derived from the
// mimetype, NOT the attacker-controlled originalname. Unknown mimetype → '' so a
// dangerous extension can never be appended (fail-closed on the stored name).
function safeStoredExtension(mimetype) {
    return MIMETYPE_CANONICAL_EXTENSION[String(mimetype || '').toLowerCase()] || '';
}

// A file is acceptable only when BOTH its mimetype is allow-listed (and known to
// our canonical map) AND its original extension is one we accept for that set —
// a mimetype/extension mismatch (or a disallowed/dangerous extension) is rejected.
function isUploadAllowed(file, allowedMimeTypes) {
    const mimetype = String(file?.mimetype || '').toLowerCase();
    const ext = path.extname(file?.originalname || '').toLowerCase();
    const mimetypeOk = (allowedMimeTypes || []).includes(file?.mimetype)
        && Boolean(MIMETYPE_CANONICAL_EXTENSION[mimetype]);
    const extOk = allowedExtensionsForMimetypes(allowedMimeTypes).has(ext);
    return mimetypeOk && extOk;
}

function storedFileName(mimetype) {
    return `${Date.now()}-${uuidv4()}${safeStoredExtension(mimetype)}`;
}

function getStorage(folder = '') {
    return multer.diskStorage({
        destination: (_req, _file, cb) => {
            const finalPath = path.join(BASE_UPLOAD_DIR, folder);
            ensureDir(finalPath);
            cb(null, finalPath);
        },
        filename: (_req, file, cb) => cb(null, storedFileName(file.mimetype)),
    });
}

function createUploader(
    folder = '',
    allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'],
    maxFileSizeMB = 20, // ← เพิ่มจาก 5MB → 20MB ให้ตรงกับ frontend MAX_UPLOAD_SIZE_BYTES
) {
    return multer({
        storage: getStorage(folder),
        // SECU-02: every caller mounts this as .single(), and the richest form it
        // receives (POST /farms, 17 fields) fits in 30 text fields.
        limits: multipartLimits({ fileSize: maxFileSizeMB * 1024 * 1024, files: 1, fields: 30 }),
        fileFilter: (req, file, cb) => {
            // Bug #23: validate mimetype AND extension (mimetype alone is spoofable).
            const displayName = decodeMultipartFilename(file.originalname);
            if (isUploadAllowed(file, allowedMimeTypes)) {
                logger.info(`[Upload] Accepted: ${displayName} (${file.mimetype})`);
                cb(null, true);
                return;
            }

            const errorMsg = `ประเภทไฟล์ ${file.mimetype} ไม่รองรับ (${displayName}). อนุญาต: ${allowedMimeTypes.join(', ')}`;
            logger.warn(`[Upload] Rejected: ${errorMsg}`);
            // Drill fast-follow (2026-07-06): reject WITHOUT throwing. `cb(new Error)`
            // makes multer call next(err); the real routes mount this uploader as
            // INLINE middleware with no 4-arg error handler in between, so the error
            // fell through to Express's default handler → HTTP 500 ("Internal server
            // error") for a spoofed/dangerous file. Instead stash the reason on req
            // and reject with (null, false): req.file stays undefined so each route's
            // own `if (!req.file) return 400` guard fires (500 → 400 on all callers),
            // and the draft route surfaces this specific Thai reason + UPLOAD_REJECTED.
            req.uploadRejectionReason = errorMsg;
            req.uploadRejectionCode = 'UPLOAD_REJECTED';
            cb(null, false);
        },
    });
}

function uploadFailed(cause, where) {
    const err = new Error(`Storage upload failed: ${cause.message}`);
    err.code = 'STORAGE_UPLOAD_FAILED';
    err.statusCode = 500;
    err.cause = cause;
    return Object.assign(err, where);
}

// localFallbackOnPutFailure: only uploadBuffer may land bytes locally after a failed put (its url
// names the backend that holds them); the mint presigns MinIO for every audits/ key, so
// putUploadsObject never may.
async function storeBytes({ bucket, key, buffer, contentType, localPath, localFallbackOnPutFailure = false }) {
    if (canUseCloudStorage()) {
        try {
            await getMinioClient().putObject(bucket, key, buffer, buffer.length, { 'Content-Type': contentType });
            logger.info(`[Storage] Uploaded to MinIO: minio://${bucket}/${key}`);
            return 'minio';
        } catch (error) {
            if (!localFallbackOnPutFailure || cloudStorageRequired()) {
                logger.error('[Storage] MinIO upload failed', { errMessage: error.message, code: error.code, bucket, key });
                throw uploadFailed(error, { bucket, key });
            }
            logger.error('[Storage] MinIO upload failed, falling back to local storage:', error.message);
        }
    } else if (cloudStorageRequired()) {
        const err = new Error(
            '[Storage] Cloud storage is required in production but unavailable '
            + '(check STORAGE_PROVIDER + S3_ACCESS_KEY/S3_SECRET_KEY). '
            + 'Set STORAGE_ALLOW_LOCAL_FALLBACK=true only if local disk is acceptable.',
        );
        err.code = 'STORAGE_CLOUD_UNAVAILABLE';
        throw err;
    }

    try {
        ensureDir(path.dirname(localPath));
        fs.writeFileSync(localPath, buffer);
    } catch (error) {
        logger.error('[Storage] local write failed', { errMessage: error.message, code: error.code, localPath });
        throw uploadFailed(error, { localPath });
    }
    logger.info(`[Storage] Saved locally: ${localPath}`);
    return 'local';
}

async function uploadBuffer(bucket, key, buffer, contentType = 'application/octet-stream') {
    const normalizedKey = normalizeObjectKey(key);
    const localPath = path.join(BASE_UPLOAD_DIR, bucket, normalizedKey.replace(/\//g, '-'));
    const storage = await storeBytes({ bucket, key: normalizedKey, buffer, contentType, localPath, localFallbackOnPutFailure: true });
    const url = storage === 'minio'
        ? buildObjectUrl(bucket, normalizedKey)
        : `/uploads/${bucket}/${path.basename(localPath)}`;
    return { bucket, key: normalizedKey, url, storage };
}

// Each top folder under /uploads is a reader population (middleware/uploads-access.js), so a key is
// judged by its first segment, never by where it resolves: `audits/../slips/x` stays inside the
// root and would still land an inspection photo in the applicant's folder.
const UPLOADS_WRITE_FOLDERS = new Set(['audits']);

function resolveUploadsObjectKey(objectKey, caller) {
    const normalizedKey = normalizeObjectKey(objectKey);
    const segments = normalizedKey.split('/');
    const wellFormed = segments.length >= 2 && segments.every((s) => s !== '' && s !== '.' && s !== '..');
    if (!wellFormed || !UPLOADS_WRITE_FOLDERS.has(segments[0])) {
        const err = new Error(`[Storage] ${caller} accepts only audits/<segment>/... keys, got ${JSON.stringify(normalizedKey)}`);
        err.code = 'STORAGE_BAD_KEY';
        throw err;
    }
    return { normalizedKey, localPath: path.join(BASE_UPLOAD_DIR, ...segments) };
}

// The returned url `/uploads/<key>` is what createSignedObjectUrl(key) and the /uploads mount
// resolve in both backends (MinIO: the object in the uploads bucket; local: the path under
// BASE_UPLOAD_DIR). uploadBuffer flattens the key under a bucket folder, so its urls serve nothing.
async function putUploadsObject(objectKey, buffer, contentType = 'application/octet-stream') {
    const { normalizedKey, localPath } = resolveUploadsObjectKey(objectKey, 'putUploadsObject');
    const storage = await storeBytes({ bucket: BUCKETS.uploads, key: normalizedKey, buffer, contentType, localPath });
    return { key: normalizedKey, url: `/uploads/${normalizedKey}`, storage };
}

async function deleteUploadsObject(objectKey) {
    const { normalizedKey, localPath } = resolveUploadsObjectKey(objectKey, 'deleteUploadsObject');
    if (canUseCloudStorage()) {
        try {
            await getMinioClient().removeObject(BUCKETS.uploads, normalizedKey);
        } catch (error) {
            logger.error('[Storage] Failed to delete object from MinIO:', error.message);
        }
    }
    fs.rmSync(localPath, { force: true });
}

async function getSignedDownloadUrl(bucket, key, expiresIn = 3600) {
    const normalizedKey = normalizeObjectKey(key);

    if (canUseCloudStorage()) {
        try {
            const client = getMinioClient();
            return await client.presignedGetObject(bucket, normalizedKey, expiresIn);
        } catch (error) {
            logger.error('[Storage] Failed to create MinIO signed URL, falling back to local path:', error.message);
        }
    }

    return `/uploads/${bucket}/${encodeObjectKey(normalizedKey.replace(/\//g, '-'))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// W1-2 — short-lived SIGNED URLs for the private `/uploads` mount.
//
// The problem this solves: `middleware/uploads-access.js` (correctly) requires a
// session for every PDPA-sensitive `/uploads` path, but a browser
// `<img src="/uploads/x.png">` or a download link cannot send an Authorization
// header — it sends cookies only. Every private uploaded file therefore rendered
// broken, even for its own owner. The fix is the standard mechanism, not a
// weaker gate: an authenticated endpoint proves entitlement ONCE and mints a URL
// carrying a time-limited signature; the static route then accepts EITHER that
// signature OR a session.
//
// This lives here, next to the provider split, so ONE mechanism covers both
// backends:
//   - `local`  → HMAC-SHA256 over (object key, expiry, entitled-subject digest).
//   - `minio`  → the provider's own presigned GET (S3 SigV4), which is the same
//                idea implemented by the object store.
// A caller never has to know which backend is live.
//
// The URL is a BEARER credential for exactly one object, exactly once the
// entitlement check at mint time has passed — the same contract as an S3
// presigned GET. Its defence is a SHORT life, an object-scoped signature, and
// access-log redaction (shared/log-redact.js).
// ─────────────────────────────────────────────────────────────────────────────

/** Default signature lifetime: long enough to render a page, short enough that a leaked URL dies fast. */
const SIGNED_URL_DEFAULT_TTL_SECONDS = 300; // 5 minutes
/** Hard ceiling. Minutes, never hours — a caller cannot ask for more than this. */
const SIGNED_URL_MAX_TTL_SECONDS = 600; // 10 minutes
const SIGNED_URL_MIN_TTL_SECONDS = 1;

// Domain separation: the raw secret (UPLOADS_URL_SIGNING_SECRET, aliasing
// HMAC_KEY) is NEVER used directly, so a URL signature can never be replayed
// into another HMAC_KEY consumer's domain and vice versa.
const SIGNED_URL_KEY_CONTEXT = 'gacp:uploads-signed-url:v1';
const SIGNED_URL_SUBJECT_CONTEXT = 'gacp:uploads-signed-url-subject:v1';

let _signingKey = null;

/**
 * Resolve the derived URL-signing key.
 *
 * FAILS LOUD when nothing resolves — signing with a constant would make every
 * signature forgeable, which is worse than a broken image. Never logged.
 */
function getUrlSigningKey() {
    if (_signingKey) {
        return _signingKey;
    }
    const raw = getSecret('UPLOADS_URL_SIGNING_SECRET');
    if (!raw) {
        const err = new Error(
            '[Storage] No signing key available for /uploads signed URLs. '
            + 'Set UPLOADS_URL_SIGNING_SECRET (or HMAC_KEY).',
        );
        err.code = 'SIGNED_URL_KEY_UNAVAILABLE';
        throw err;
    }
    _signingKey = crypto.createHmac('sha256', raw).update(SIGNED_URL_KEY_CONTEXT).digest();
    return _signingKey;
}

function clampSignedUrlTtl(requested) {
    const asNumber = Number(requested);
    if (!Number.isFinite(asNumber) || asNumber <= 0) {
        return SIGNED_URL_DEFAULT_TTL_SECONDS;
    }
    return Math.max(SIGNED_URL_MIN_TTL_SECONDS, Math.min(Math.floor(asNumber), SIGNED_URL_MAX_TTL_SECONDS));
}

/**
 * Opaque, stable digest of the entitled subject (the minting user's id).
 *
 * The RAW subject must never travel in the URL — that would put a user id in
 * every access log and page source. The digest is still covered by the
 * signature, so it cannot be swapped, and it gives an auditor a way to tie a
 * served byte-range back to the identity the mint was authorised for.
 */
function signedUrlSubjectDigest(subject) {
    const value = String(subject || '');
    if (!value) {
        return '';
    }
    return crypto
        .createHmac('sha256', getUrlSigningKey())
        .update(`${SIGNED_URL_SUBJECT_CONTEXT}|${value}`)
        .digest('hex')
        .slice(0, 16);
}

// The exact bytes that are signed. `\n` separated with a version tag so a future
// scheme change cannot be confused with this one, and so no field can be shifted
// into another (the key can contain no newline — normalizeObjectKey guarantees a
// URL path segment set).
function signedUrlPayload(normalizedKey, exp, subjectDigest) {
    return ['v1', normalizedKey, String(exp), String(subjectDigest || '')].join('\n');
}

function computeSignedUrlSignature(normalizedKey, exp, subjectDigest) {
    return crypto
        .createHmac('sha256', getUrlSigningKey())
        .update(signedUrlPayload(normalizedKey, exp, subjectDigest))
        .digest('base64url');
}

/**
 * Split an `/uploads`-relative key into (bucket, key) for the cloud backend.
 * Only a KNOWN bucket name may be consumed as the bucket.
 */
function splitBucketKey(normalizedKey) {
    const [first, ...rest] = normalizedKey.split('/');
    const knownBuckets = new Set(Object.values(BUCKETS));
    if (rest.length > 0 && knownBuckets.has(first)) {
        return { bucket: first, key: rest.join('/') };
    }
    return { bucket: BUCKETS.uploads, key: normalizedKey };
}

/**
 * Mint a short-lived signed URL for ONE object.
 *
 * The caller (routes/api/files/files.js) is responsible for proving the subject
 * is entitled to the object BEFORE calling this — this function is the
 * mechanism, not the policy.
 *
 * @param {string} objectKey `/uploads`-relative key, e.g. `car/abc.pdf`
 * @param {{subject?: string, expiresInSeconds?: number}} options
 * @returns {Promise<{url: string, expiresAt: string, provider: 'local'|'minio'}>}
 */
async function createSignedObjectUrl(objectKey, options = {}) {
    const normalizedKey = normalizeObjectKey(objectKey);
    if (!normalizedKey) {
        const err = new Error('[Storage] createSignedObjectUrl requires an object key');
        err.code = 'SIGNED_URL_BAD_KEY';
        throw err;
    }
    const ttl = clampSignedUrlTtl(options.expiresInSeconds);

    if (canUseCloudStorage()) {
        const { bucket, key } = splitBucketKey(normalizedKey);
        try {
            const client = getMinioClient();
            const url = await client.presignedGetObject(bucket, key, ttl);
            return {
                url,
                expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
                provider: 'minio',
            };
        } catch (error) {
            // Never log the URL or the error's request signature — message only.
            logger.error('[Storage] MinIO presigned GET failed:', error.message);
            if (cloudStorageRequired()) {
                const err = new Error(`Signed URL generation failed (cloud required): ${error.message}`);
                err.code = 'SIGNED_URL_FAILED';
                throw err;
            }
            // Dev/test with the documented local fallback: fall through to HMAC.
        }
    }

    const exp = Math.floor(Date.now() / 1000) + ttl;
    const sub = signedUrlSubjectDigest(options.subject);
    const sig = computeSignedUrlSignature(normalizedKey, exp, sub);
    const query = new URLSearchParams({ exp: String(exp), sub, sig }).toString();

    return {
        url: `/uploads/${encodeObjectKey(normalizedKey)}?${query}`,
        expiresAt: new Date(exp * 1000).toISOString(),
        provider: 'local',
    };
}

/**
 * Verify a `/uploads` request's signature against the object it is asking for.
 *
 * Fail-closed on every ambiguity. The signature is checked BEFORE the expiry so
 * a forged URL can never learn anything from the reason string beyond
 * "rejected"; the reason exists for our own tests and logs, and is never sent to
 * a client.
 *
 * @param {string} objectKey the `/uploads`-relative path being requested,
 *   already decoded + normalized by the caller (uploads-access.js does this).
 * @param {Record<string, unknown>} query the request query params.
 * @returns {{valid: true} | {valid: false, reason: string}}
 */
function verifySignedObjectRequest(objectKey, query = {}) {
    const sig = String(query?.sig || '');
    const expRaw = String(query?.exp || '');
    const sub = String(query?.sub || '');

    if (!sig || !expRaw) {
        return { valid: false, reason: 'MISSING_SIGNATURE' };
    }
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= 0) {
        return { valid: false, reason: 'BAD_SIGNATURE' };
    }

    const normalizedKey = normalizeObjectKey(objectKey);
    if (!normalizedKey) {
        return { valid: false, reason: 'BAD_SIGNATURE' };
    }

    let expected;
    try {
        expected = computeSignedUrlSignature(normalizedKey, exp, sub);
    } catch (error) {
        // No key → we cannot prove anything → deny. (The session path still works.)
        logger.error('[Storage] Cannot verify signed URL:', error.code || error.message);
        return { valid: false, reason: 'SIGNING_KEY_UNAVAILABLE' };
    }

    const provided = Buffer.from(sig, 'utf8');
    const computed = Buffer.from(expected, 'utf8');
    if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
        return { valid: false, reason: 'BAD_SIGNATURE' };
    }

    if (exp * 1000 <= Date.now()) {
        return { valid: false, reason: 'EXPIRED' };
    }

    return { valid: true };
}

async function deleteObject(bucket, key) {
    const normalizedKey = normalizeObjectKey(key);

    if (canUseCloudStorage()) {
        try {
            const client = getMinioClient();
            await client.removeObject(bucket, normalizedKey);
            logger.info(`[Storage] Deleted from MinIO: minio://${bucket}/${normalizedKey}`);
            return;
        } catch (error) {
            logger.error('[Storage] Failed to delete object from MinIO:', error.message);
        }
    }

    const localPath = path.join(BASE_UPLOAD_DIR, bucket, normalizedKey.replace(/\//g, '-'));
    try {
        fs.unlinkSync(localPath);
    } catch {
        // Ignore missing local file.
    }
}

async function initializeStorage() {
    if (!canUseCloudStorage()) {
        Object.values(BUCKETS).forEach((bucket) => ensureDir(path.join(BASE_UPLOAD_DIR, bucket)));
        logger.info('[Storage] Local storage directories ensured.');
        return;
    }

    try {
        const client = getMinioClient();
        const uniqueBuckets = [...new Set(Object.values(BUCKETS))];

        for (const bucket of uniqueBuckets) {
            const exists = await client.bucketExists(bucket);
            if (exists) {
                logger.info(`[Storage] Bucket exists: ${bucket}`);
                continue;
            }

            await client.makeBucket(bucket, STORAGE_CONFIG.region);
            logger.info(`[Storage] Created bucket: ${bucket}`);
        }

        logger.info('[Storage] MinIO initialization complete.');
    } catch (error) {
        logger.error('[Storage] MinIO initialization failed:', error.message);
        logger.warn('[Storage] Continuing with local storage fallback.');
    }
}

async function getFileUrl(bucket, key) {
    return getSignedDownloadUrl(bucket, key);
}

// multer/busboy decode multipart `filename` params as latin1 by default, so an
// uploaded Thai (UTF-8) filename arrives as mojibake. Re-interpret the latin1
// bytes as UTF-8 — but only when safe: a string already holding real Unicode
// (any char > U+00FF) is genuine and returned untouched (never double-decoded),
// and a decode that yields the U+FFFD replacement char is rejected.
function decodeMultipartFilename(name) {
    const raw = String(name || '');
    if (!raw) {
        return raw;
    }
    for (let i = 0; i < raw.length; i++) {
        if (raw.charCodeAt(i) > 0xFF) {
            return raw;
        }
    }
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    return decoded.includes('�') ? raw : decoded;
}

module.exports = {
    createUploader,
    decodeMultipartFilename,
    BASE_UPLOAD_DIR,
    resolveWithinUploads,
    // Bug #23 — extension allow-list + canonical-extension helpers (exported so the
    // security contract is unit-testable and reusable by other upload surfaces).
    isUploadAllowed,
    safeStoredExtension,
    storedFileName,
    allowedExtensionsForMimetypes,
    getStorage,
    uploadBuffer,
    putUploadsObject,
    deleteUploadsObject,
    getSignedDownloadUrl,
    // W1-2 — short-lived signed URLs for the private /uploads mount. ONE
    // mechanism, both providers (local HMAC / MinIO native presign).
    createSignedObjectUrl,
    verifySignedObjectRequest,
    SIGNED_URL_DEFAULT_TTL_SECONDS,
    SIGNED_URL_MAX_TTL_SECONDS,
    deleteObject,
    initializeStorage,
    getFileUrl,
    BUCKETS,
    STORAGE_PROVIDER,
    isCloudStorageEnabled: () => CLOUD_STORAGE_ENABLED,
};
