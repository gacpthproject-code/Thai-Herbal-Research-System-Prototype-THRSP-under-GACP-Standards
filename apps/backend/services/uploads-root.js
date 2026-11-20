'use strict';

const path = require('path');

// This file lives in <backend>/services, so ONE '../' reaches
// <backend>/public/uploads. The old '../../' over-shot to <backend>/../public/uploads
// (/app/apps/public/uploads) — an ephemeral path neither served by express.static
// nor backed by the volume → uploaded docs 404'd + were lost on restart
// (blank document preview, 2026-06-25).
const BASE_UPLOAD_DIR = path.join(__dirname, '../public/uploads');

/**
 * Resolve a stored file path and prove it lives under BASE_UPLOAD_DIR.
 *
 * Deletion paths read the path back out of a JSON record rather than deriving
 * it, so a poisoned record turns `fs.unlink()` into arbitrary deletion. This is
 * the one place that answers "is this path ours?", next to the root it checks
 * against, so no caller re-derives the root and gets it subtly wrong.
 *
 * Rejects: relative paths, absolute paths elsewhere on disk, `..` traversal,
 * and sibling directories that merely share the prefix (`/uploads-evil`).
 *
 * @param {unknown} filePath candidate path from a stored record
 * @returns {string|null} the resolved absolute path, or null if it is not ours
 */
function resolveWithinUploads(filePath) {
    const raw = typeof filePath === 'string' ? filePath.trim() : '';
    if (!raw) {
        return null;
    }
    const root = path.resolve(BASE_UPLOAD_DIR);
    const resolved = path.resolve(raw);
    // The separator suffix is what stops `<root>-evil/x` matching as a child;
    // `..` segments are already normalised away by path.resolve above.
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        return null;
    }
    return resolved;
}

module.exports = { BASE_UPLOAD_DIR, resolveWithinUploads };
