'use strict';

const certificateNumber = require('@gacp/validation/certificate-number');
const logger = require('../shared/logger');

/**
 * Rows from before 2026-10-05 store `GACP-TH-{ปี}-{รหัส}` and their paper printed
 * `GACP-DTAM-{ปี}-{รหัส}`; every other number is already its printed form.
 */
function buildDtamCertNumberDisplay(number) {
    if (typeof number !== 'string' || !number) {
        return String(number || '-');
    }
    const m = number.match(/^GACP-TH-(\d{4})-([A-Z0-9]+)$/i);
    if (!m) {return number;}
    return `GACP-DTAM-${m[1]}-${m[2].toUpperCase()}`;
}

/**
 * Finds a certificate by its number in any form it was issued or typed. `{n}/{year}` rows and
 * the `TH-GACP {n}/{year}` rows before them share one counter (order 135), so the prefix is
 * spelling, not identity. A legacy GACP-TH-… number resolves exactly.
 */
function certificateNumberWhere(typed) {
    const parts = certificateNumber.parseCertificateNumber(typed);
    if (!parts) { return { certificateNumber: certificateNumber.toCanonicalCertificateNumber(typed) }; }
    const bare = `${parts.n}/${parts.year}`;
    return { OR: [{ certificateNumber: bare }, { certificateNumber: { endsWith: ` ${bare}` } }] };
}

/**
 * The one certificate a typed number names, or null. Two rows spelling one (number, year)
 * differently are a register fault, not a match: both are refused rather than one chosen.
 * `where` narrows the match (tenant, isDeleted); `select` or `include` shapes the row.
 */
async function findCertificateByNumber(client, typed, { where = {}, select, include } = {}) {
    if (typeof typed !== 'string' || !typed.trim()) { return null; }
    const rows = await client.certificate.findMany({
        where: { AND: [certificateNumberWhere(typed), where] },
        take: 2,
        ...(select ? { select } : {}),
        ...(include ? { include } : {}),
    });
    if (rows.length > 1) {
        logger.warn(`[certificate-number] ${typed.trim()} names ${rows.length} certificates; refused until the register holds one`);
        return null;
    }
    return rows[0] || null;
}

module.exports = { ...certificateNumber, buildDtamCertNumberDisplay, certificateNumberWhere, findCertificateByNumber };
