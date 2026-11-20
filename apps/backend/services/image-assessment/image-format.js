'use strict';

/**
 * The upload door accepts JPEG and PNG only, decided by the first bytes of
 * the file. sharp would also decode SVG, GIF, TIFF, WebP and HEIF, and the
 * filename is whatever the client chose.
 */

const SIGNATURES = [
    { format: 'jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) },
    { format: 'png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
];

/** @returns {'jpeg'|'png'|null} the allowed format the bytes declare, or null */
function allowedImageFormat(buffer) {
    if (!Buffer.isBuffer(buffer)) { return null; }
    const match = SIGNATURES.find(({ bytes }) => buffer.length >= bytes.length && buffer.subarray(0, bytes.length).equals(bytes));
    return match ? match.format : null;
}

module.exports = { allowedImageFormat, ALLOWED_IMAGE_FORMATS: Object.freeze(SIGNATURES.map((s) => s.format)) };
