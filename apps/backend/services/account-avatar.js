'use strict';

/**
 * Deletes an account's avatar file when the account is anonymized (operator order 96(3)).
 *
 * uploadAvatar (controllers/auth-controller/auth-session-security-handlers.js) stores the file
 * at the root of the uploads folder and writes its served path, `/uploads/<file>`, into
 * User.privacySettings.avatar. Only a path of that shape is deleted. The root also holds ID card
 * images and farm photos (routes/api/cultivation/farms.js, middleware/uploads-access.js), so the
 * path shape alone does not protect them: what does is that privacySettings.avatar is written
 * only by uploadAvatar, from the file name multer picked. No other copy exists: /uploads responses are
 * `Cache-Control: private, no-store` (middleware/uploads-security-headers.js), no nginx config
 * caches them, and no web page renders the avatar.
 */

const fs = require('fs');
const path = require('path');
const { BASE_UPLOAD_DIR, resolveWithinUploads } = require('./uploads-root');

const AVATAR_URL = /^\/uploads\/([^/\\]+)$/;

function avatarFilePath(avatarUrl) {
    const match = AVATAR_URL.exec(typeof avatarUrl === 'string' ? avatarUrl : '');
    if (!match) {return null;}
    const resolved = resolveWithinUploads(path.join(BASE_UPLOAD_DIR, match[1]));
    return resolved && path.dirname(resolved) === path.resolve(BASE_UPLOAD_DIR) ? resolved : null;
}

/**
 * @param {unknown} avatarUrl User.privacySettings.avatar
 * @returns {Promise<boolean>} whether a file was deleted; an already-missing file is not an error,
 *   so a retried anonymization converges.
 */
async function deleteAvatarFile(avatarUrl) {
    const file = avatarFilePath(avatarUrl);
    if (!file) {return false;}
    try {
        await fs.promises.unlink(file);
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') {return false;}
        throw err;
    }
}

module.exports = { deleteAvatarFile, avatarFilePath };
