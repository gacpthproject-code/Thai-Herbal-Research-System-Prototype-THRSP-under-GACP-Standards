'use strict';

const { certificateProducedUnder } = require('./valid-on');

// H3: shared certificate gate. Single source of truth for "is this cert valid,
// and if not, what 410 body should the public trace surface return". Used by the
// generic resolver AND the dedicated batch/lot routes so the gate logic (incl.
// the LOWERCASE status casing fix — certs are stored 'active', not 'ACTIVE')
// lives in exactly one place.
//
//   gated === true ONLY when a cert EXISTS but is invalid (revoked/expired/etc).
//   A null cert (un-certified trace) is NOT gated → callers keep returning 200.
//
// minimalBody(type) returns the SAME shape the dedicated batch route's 410 body
// uses, so the generic resolver and the route stay byte-compatible.
function evaluateCertGate(cert) {
    const statusRaw = String(cert?.status || '').toUpperCase();
    const certExpired = !!cert?.expiryDate && new Date(cert.expiryDate) < new Date();
    const isValid = !!cert && statusRaw === 'ACTIVE' && !certExpired;
    const renewedSinceIssue = statusRaw === 'RENEWED';
    const gated = !!cert && !isValid && !renewedSinceIssue;
    const statusLower = statusRaw.toLowerCase() || 'invalid';
    return {
        gated,
        isValid,
        certExpired,
        status: statusLower,
        minimalBody(type) {
            return {
                success: false,
                type,
                verification: {
                    valid: false,
                    scannedAt: new Date().toISOString(),
                    reason: certExpired ? 'certificate_expired' : `certificate_${statusLower}`,
                },
                certificate: {
                    reference: cert.certificateNumber,
                    status: statusLower,
                    issuedDate: cert.issuedDate,
                    expiryDate: cert.expiryDate,
                },
                message: certExpired
                    ? 'ใบรับรองหมดอายุแล้ว / Certificate has expired'
                    : 'ใบรับรองไม่อยู่ในสถานะใช้งาน / Certificate is not active',
            };
        },
    };
}

async function judgeProducedCertificate(bound, harvestDate) {
    const boundGate = evaluateCertGate(bound);
    if (boundGate.gated) { return { gate: boundGate, certificate: bound }; }
    const producedUnder = bound ? await certificateProducedUnder(bound, harvestDate) : null;
    const certificate = producedUnder || bound;
    const gate = evaluateCertGate(certificate);
    if (gate.gated) { return { gate, certificate }; }
    return {
        gate: null,
        certificate,
        producedInForce: Boolean(producedUnder),
        isValid: Boolean(producedUnder) && gate.isValid,
    };
}

module.exports = { evaluateCertGate, judgeProducedCertificate };
