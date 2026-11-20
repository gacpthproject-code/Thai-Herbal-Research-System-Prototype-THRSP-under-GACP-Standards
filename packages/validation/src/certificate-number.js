'use strict';

// CommonJS so the Node backend and the Next web app load the same file
// (see thai-id-checksum.js). A slash and a space cannot ride in a URL path
// segment, so URLs and the QR carry the slug: 61/2569 → 61-2569.

// What migration 20261022120000 seeds as certificate.number.format (order 134).
const DEFAULT_NUMBER_FORMAT = '{n}/{year}';
const FORMAT = /^(?:[A-Z][A-Z0-9-]* )?\{n\}\/\{year\}$/;
const NUMBERED = /^(?:([A-Z][A-Z0-9-]*?)[\s-]+)?(\d{1,9})\s*[/-]\s*(25\d{2})$/;
const LEGACY = /^GACP-(?:DTAM|TH)-(\d{4})-([A-Z0-9]+)$/;

function parseNumberFormat(raw) {
    return typeof raw === 'string' && FORMAT.test(raw) ? raw : null;
}

function formatCertificateNumber(format, sequence, buddhistYear) {
    return format.replace('{n}', String(Number(sequence))).replace('{year}', String(Number(buddhistYear)));
}

function parseCertificateNumber(input) {
    if (typeof input !== 'string') { return null; }
    const up = input.trim().toUpperCase();
    if (LEGACY.test(up)) { return null; }
    const m = up.match(NUMBERED);
    return m ? { prefix: m[1] || null, n: Number(m[2]), year: m[3] } : null;
}

function toCertificateSlug(certificateNumber) {
    if (typeof certificateNumber !== 'string') { return certificateNumber; }
    const parts = parseCertificateNumber(certificateNumber);
    if (!parts) { return certificateNumber; }
    return `${parts.prefix ? `${parts.prefix}-` : ''}${parts.n}-${parts.year}`;
}

function toCanonicalCertificateNumber(input) {
    if (typeof input !== 'string') { return input; }
    const legacy = input.trim().toUpperCase().match(LEGACY);
    if (legacy) { return `GACP-TH-${legacy[1]}-${legacy[2]}`; }
    const parts = parseCertificateNumber(input);
    if (!parts) { return input; }
    return `${parts.prefix ? `${parts.prefix} ` : ''}${parts.n}/${parts.year}`;
}

module.exports = {
    DEFAULT_NUMBER_FORMAT, parseNumberFormat, formatCertificateNumber, parseCertificateNumber,
    toCertificateSlug, toCanonicalCertificateNumber,
};
