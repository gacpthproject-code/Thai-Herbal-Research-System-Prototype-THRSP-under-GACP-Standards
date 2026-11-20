'use strict';

/**
 * SINGLE SOURCE of the `/uploads` sensitivity classification, so the static gate, the
 * signed-URL mint and the no-public-financial-pdfs probe can never drift apart about what
 * "sensitive" means. No dependencies on purpose: the probe loads this file without a
 * database or a secret.
 */
const FOLDERS = Object.freeze([
    ['lab-results/', 'public'],
    ['application-drafts/', 'draft'],
    ['car/', 'car'],
    ['audits/', 'audit'],
    ['gacp-pdfs/', 'generated'],
    ['gacp-certificates/', 'generated'],
]);

/**
 * @param {string} rel `/uploads`-relative path, already decoded + normalized.
 * @returns {{kind: 'public'|'root'|'draft'|'car'|'audit'|'generated'|'unknown', sensitive: boolean}}
 */
function classifyUploadsPath(rel) {
    const value = String(rel || '');
    const folder = FOLDERS.find(([prefix]) => value.startsWith(prefix));
    let kind = 'unknown';
    if (folder) { kind = folder[1]; }
    else if (value.length > 0 && !value.includes('/')) { kind = 'root'; }
    return { kind, sensitive: kind !== 'public' };
}

module.exports = { classifyUploadsPath };
