const fs = require('fs');
const path = require('path');
const { authenticateAny } = require('./auth-middleware');
const storageService = require('../services/storage-service');
const { prisma } = require('../services/prisma-database');
const { normalizeRole, isProviderRole, CANONICAL_ROLES } = require('../shared/canonical-rbac');
const logger = require('../shared/logger');
const { classifyUploadsPath } = require('./uploads-classification');
const { holderScopeForUser, holderReadWhere } = require('../services/holder-access');
const { isApplicationVisibleTo } = require('./require-visible-application');

/**
 * C1 (RD-UPLOADS traversal) — decode + normalize the `/uploads`-relative
 * request path so classification and object-ACL lookups run on the SAME
 * collapsed path that `send`/express.static ultimately resolves. `send@0.19.2`
 * normalizes AFTER these gates classify, so a request whose RAW URI is
 * `/uploads/lab-results/../car/CAR-<ms>-<n>.jpg` (or the `%2f..%2f` / `%2e%2e` encoded
 * variants an nginx literal proxy_pass forwards un-normalized) would
 * classify as public `lab-results/` here yet stream the CAR file downstream.
 *
 * Only an origin-form target that starts with `/uploads/` is read. Express also routes an
 * absolute-form target (`GET http://host/uploads/x HTTP/1.1`) into the mount and express.static
 * serves it, but its originalUrl starts with the scheme, so string-stripping the prefix left
 * `http:/host/uploads/x` to be classified public: security review of 1b554df0c (M2) measured the
 * bytes of a receipt, an ID card and a draft served that way. Such a target is malformed here.
 *
 * Returns `{ malformed, traversal, rel, normalized }`. Callers reject on
 * `malformed || traversal` BEFORE static and classify off `normalized`.
 */
const UPLOADS_PREFIX = '/uploads/';

function decodeUploadsRel(originalUrl) {
    const raw = String(originalUrl || '').split('?')[0];
    if (!raw.startsWith(UPLOADS_PREFIX)) {
        return { malformed: true, traversal: false, rel: '', normalized: '' };
    }
    let decoded;
    try {
        decoded = decodeURIComponent(raw);
    } catch (_decodeErr) {
        return { malformed: true, traversal: false, rel: '', normalized: '' };
    }
    const rel = decoded.slice(UPLOADS_PREFIX.length);
    // Split on BOTH separators: a decoded `%2f` is a real path separator and a
    // stray backslash must not sneak a segment past the check on any platform.
    const segments = rel.split(/[\\/]+/);
    const hasDotSegment = segments.some((s) => s === '..' || s === '.');
    // posix.normalize collapses any residual `a/../b` → `b`; a normalized path
    // that still escapes the mount root (`..` prefix or absolute) is traversal.
    const normalized = path.posix.normalize(rel);
    const escapes = normalized.startsWith('..') || normalized.startsWith('/');
    return { malformed: false, traversal: hasDotSegment || escapes, rel, normalized };
}

// Shared 400 for a malformed / traversal `/uploads` request. Never serves bytes.
function rejectBadUploadPath(res) {
    return res.status(400).json({ success: false, error: 'Bad Request', code: 'INVALID_PATH' });
}

const NOTHING_THERE = new Set(['ENOENT', 'ENOTDIR']);

/** express.static follows links. */
async function leavesItsPublicFolder(rel) {
    try {
        const root = storageService.BASE_UPLOAD_DIR;
        const file = path.join(root, rel);
        if ((await fs.promises.lstat(file)).isSymbolicLink()) { return true; }
        const folder = path.join(await fs.promises.realpath(root), rel.split('/')[0]);
        const fromFolder = path.relative(folder, await fs.promises.realpath(file));
        return fromFolder.split(path.sep)[0] === '..' || path.isAbsolute(fromFolder);
    } catch (err) {
        return !NOTHING_THERE.has(err.code);
    }
}

/**
 * Uses `req.originalUrl` (the full path, mount-independent) so the prefix test is
 * unambiguous; decodeUploadsRel refuses any target that is not origin form.
 */
function gateSensitiveUploads(req, res, next) {
    const info = decodeUploadsRel(req.originalUrl);
    // C1: malformed encoding or ANY path-traversal segment can never map to a
    // legitimate asset — reject BEFORE express.static (which would decode +
    // normalize and serve the escaped target). This is the first chokepoint;
    // gateUploadsObjectAccess repeats it defensively.
    if (info.malformed || info.traversal) {
        return rejectBadUploadPath(res);
    }
    // Classify off the NORMALIZED path so an encoded/relative form resolves to
    // the same target the static handler will serve.
    const rel = info.normalized;
    const { sensitive } = classifyUploadsPath(rel);
    if (sensitive) {
        // W1-2 — accept EITHER credential, never neither.
        //
        // A browser <img src="/uploads/x.png"> cannot send an Authorization
        // header, so a session-only gate made every private upload unrenderable
        // even for its owner. A signature is minted ONLY by
        // routes/api/files/files.js, which first proves the caller is entitled to
        // this exact object using authorizeUploadsObject() below — the same ACL
        // this file enforces for a session. The signature is bound to THIS object
        // key and expires in minutes, so it grants strictly less than the session
        // that minted it. Classification above is untouched.
        const signature = storageService.verifySignedObjectRequest(rel, req.query || {});
        if (signature.valid) {
            // Marks the request as already object-authorized at mint time, so
            // gateUploadsObjectAccess does not re-run an ACL that needs a req.user.
            req.uploadsSignedAccess = true;
            return next();
        }
        return authenticateAny(req, res, next);
    }
    return leavesItsPublicFolder(rel).then((leaves) => (leaves
        ? res.status(404).json({ success: false, error: 'NOT_FOUND' })
        : next()));
}

async function gateUploadsObjectAccess(req, res, next) {
    const info = decodeUploadsRel(req.originalUrl);
    // C1 defense-in-depth: reject malformed / traversal even though
    // gateSensitiveUploads already did — the two gates must never disagree on
    // the resolved path (that disagreement IS the send-normalizes-after-classify
    // bug). Do NOT serve.
    if (info.malformed || info.traversal) {
        return rejectBadUploadPath(res);
    }
    const rel = info.normalized;

    // W1-2 — a valid signature already proved this exact object was authorized
    // for the minting subject (routes/api/files/files.js runs
    // authorizeUploadsObject before signing). There is no req.user to re-check
    // against here, and re-running the ACL would 401 every legitimate signed
    // request. The path guards above still ran.
    if (req.uploadsSignedAccess || !classifyUploadsPath(rel).sensitive) {
        return next();
    }
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_TOKEN' });
    }
    const decision = await authorizeUploadsObject(req.user, rel);
    if (decision.allowed) {
        return next();
    }
    // An infrastructure failure is reported as one (and logged inside
    // authorizeUploadsObject) instead of being disguised as "no such file"; it
    // still does not serve the bytes.
    if (decision.reason === 'LOOKUP_FAILED') {
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
    return res.status(404).json({ success: false, error: 'NOT_FOUND' });
}

/**
 * W1-2 — root-level files (`/uploads/<file>`) are ID-card images and avatars.
 *
 * ONLY the avatar has an owner record: uploadAvatar writes the served path into
 * `User.privacySettings.avatar`
 * (controllers/auth-controller/auth-session-security-handlers.js:121-134).
 */
async function resolveRootFileOwner(user, rel) {
    const uid = String(user?.id || user?.userId || '').trim();
    if (!uid) { return { allowed: false, reason: 'NO_SESSION' }; }
    const fileUrl = `/uploads/${rel}`;
    const row = await prisma.user.findUnique({
        where: { id: uid },
        select: { privacySettings: true },
    });
    const avatar = row?.privacySettings?.avatar;
    if (avatar && String(avatar) === fileUrl) {
        return { allowed: true, reason: 'OWN_AVATAR' };
    }
    return { allowed: false, reason: 'NOT_OWNER' };
}

const UNSCOPED = () => ({});

async function applicationOfDraftDocument(fileUrl, scope) {
    const document = await prisma.applicationDocument.findFirst({
        where: { AND: [scope('ApplicationDocument'), { fileUrl, application: { isDeleted: false } }] },
        select: { applicationId: true },
    });
    if (document) { return document.applicationId; }
    const application = await prisma.application.findFirst({
        where: {
            AND: [scope('Application'), {
                isDeleted: false,
                formData: { path: ['draftDocuments'], array_contains: [{ fileUrl }] },
            }],
        },
        select: { id: true },
    });
    return application?.id || null;
}

async function applicationOfCarDocument(fileUrl, scope) {
    const application = await prisma.application.findFirst({
        where: {
            AND: [scope('Application'), {
                isDeleted: false,
                formData: { path: ['carDocuments'], array_contains: [{ path: fileUrl }] },
            }],
        },
        select: { id: true },
    });
    return application?.id || null;
}

async function applicationOfAuditPhoto(fileUrl) {
    const attachment = await prisma.attachment.findFirst({
        where: { fileUrl, resModel: 'FarmAuditPhoto', isDeleted: false },
        select: { resId: true },
    });
    if (!attachment) { return null; }
    const checklist = await prisma.auditChecklist.findUnique({
        where: { id: attachment.resId },
        select: { applicationId: true },
    });
    return checklist?.applicationId || null;
}

const APPLICATION_FILES = Object.freeze({
    draft: { health: true, applicationOf: applicationOfDraftDocument },
    car: { health: true, applicationOf: applicationOfCarDocument },
    audit: { health: false, applicationOf: applicationOfAuditPhoto },
});

async function mayReadApplicationFile(user, folder, fileUrl) {
    const role = normalizeRole(user.canonicalRole || user.role);
    if (role === CANONICAL_ROLES.HEALTH) {
        if (!folder.health) { return false; }
        const scope = await holderScopeForUser(user.id || user.userId);
        return Boolean(await folder.applicationOf(fileUrl, (model) => holderReadWhere(scope, model)));
    }
    if (!isProviderRole(role)) { return false; }
    const applicationId = await folder.applicationOf(fileUrl, UNSCOPED);
    return Boolean(applicationId) && isApplicationVisibleTo(user, applicationId);
}

const NEVER_SERVED = Object.freeze({
    generated: 'SERVED_BY_DOCUMENT_DOORS',
    unknown: 'UNKNOWN_FOLDER',
});

/**
 * @param {object|null} user `req.user`
 * @param {string} rel `/uploads`-relative path, decoded + normalized
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function authorizeUploadsObject(user, rel) {
    const { kind, sensitive } = classifyUploadsPath(rel);
    if (!sensitive) {
        return { allowed: true, reason: 'PUBLIC' };
    }
    if (!user) {
        return { allowed: false, reason: 'NO_SESSION' };
    }
    if (NEVER_SERVED[kind]) {
        return { allowed: false, reason: NEVER_SERVED[kind] };
    }
    try {
        if (kind === 'root') {
            return await resolveRootFileOwner(user, rel);
        }
        const folder = APPLICATION_FILES[kind];
        if (folder && await mayReadApplicationFile(user, folder, `/uploads/${rel}`)) {
            return { allowed: true, reason: 'OBJECT_ACL' };
        }
        return { allowed: false, reason: 'OBJECT_ACL_DENIED' };
    } catch (err) {
        logger.error('[uploads-access] object ACL lookup failed:', err?.message);
        return { allowed: false, reason: 'LOOKUP_FAILED' };
    }
}

module.exports = {
    gateSensitiveUploads,
    gateUploadsObjectAccess,
    // W1-2 — shared with routes/api/files/files.js so the mint endpoint cannot
    // disagree with the static gate about paths or ACLs.
    decodeUploadsRel,
    classifyUploadsPath,
    authorizeUploadsObject,
};
