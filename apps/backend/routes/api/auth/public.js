/**
 * Public Certificate Verification Routes (V2)
 * No authentication required - for public QR code scanning
 * Uses Prisma for data access
 */

const express = require('express');
const router = express.Router();
// Public verify routes go through certificate-service so that lookup logic
// (no isDeleted filter, revocation visibility) stays in one place. Route-
// level Prisma access removed — see docs/tech-debt/prisma-bypass-routes.md.
const certificateService = require('../../../services/certificate-service');
// F-G4-57: the one derivation of the public "why is this not valid" answer —
// the machine code and the English sentence come out of the same call, so the
// two can never disagree on the wire.
const {
    publicReasonFor,
    isSupersededByRenewal,
    PUBLIC_VERIFY_LOOKUP_FAILURES,
} = require('./public-verify-reason');
const logger = require('../../../shared/logger');
const { publicCertificateFacts } = require('../../../services/certificate/public-facts');

// Per-IP limit on every public lookup-by-number door lives in one place:
// middleware/public-verify-limiter. Numbers are sequential ({n}/{BE}),
// so the protection against walking the register is that limiter plus the
// minimal response below (no farm facts unless active, no person's name).
const { publicVerifyLimiter } = require('../../../middleware/public-verify-limiter');

// Order 68(1): no person's name is published, masked or not. A company, partnership or
// community-enterprise holder is a business name in a public register and stays; any other holder shape is a person
// or unknown.
const COMPANY_HOLDER_TYPES = new Set(require('../../../shared/holder-registry').ORGANISATION_TYPES);

function companyHolderName(cert) {
    return COMPANY_HOLDER_TYPES.has(cert.holderType) ? cert.holderDisplayName : null;
}

// The ONE derivation of a live certificate's public state, shared by every
// verify door. A certificate the main door reports as not active (status not
// 'active', or past expiryDate) has its facts withheld on every door, so the
// archived-revision door can never be the more generous one.
//   isExpired — expiryDate is set and already passed
//   isActive  — status 'active' and not expired
//   status    — the public status word: 'expired' wins over the stored status
function liveCertificateState(certificate) {
    const isExpired = Boolean(certificate.expiryDate && new Date(certificate.expiryDate) < new Date());
    const stored = certificate.status.toLowerCase();
    return {
        isExpired,
        isActive: stored === 'active' && !isExpired,
        status: isExpired ? 'expired' : stored,
    };
}

/**
 * @route GET /verify/:certificateNumber
 * @desc Public certificate verification (JSON)
 * @access Public
 */
router.get('/verify/:certificateNumber', publicVerifyLimiter, async (req, res) => {
    try {
        const { certificateNumber } = req.params;
        const { code } = req.query;

        if (!certificateNumber) {
            return res.status(400).json({
                success: false,
                message: 'Certificate number is required',
            });
        }

        const certificate = await certificateService.findByCertificateNumber(certificateNumber);

        if (!certificate) {
            return res.json({
                success: true,
                verified: false,
                valid: false,
                data: {
                    status: 'invalid',
                    // The commonest answer a citizen ever gets. The English
                    // `reason` is unchanged; the `reasonCode` beside it is what
                    // lets the page say it in Thai instead of handing over an
                    // English sentence.
                    ...PUBLIC_VERIFY_LOOKUP_FAILURES.NOT_FOUND,
                },
            });
        }

        const liveState = liveCertificateState(certificate);
        const { isActive, status: liveStatus } = liveState;
        // F-G4-57: WHY this certificate is not valid, as a machine code next to
        // the English sentence the endpoint has always published.
        const { code: reasonCode, reason } = publicReasonFor(liveState, certificate.status);

        // BE-#4: content-integrity check. Recompute the documentHash from the
        // live row and compare to the stored one — surfaces VALID / TAMPERED /
        // UNSIGNED (legacy certs issued before hashing) to the public verifier.
        const integrity = certificateService.verifyDocumentIntegrity(certificate);

        // H1: the hash recompute alone cannot catch a re-signed forgery; verify
        // the RSA signature over the documentHash too. Both the cert NAME
        // (farmName/applicantName) and the hash are covered by the signature, so
        // surfacing the signature verdict is genuine tamper-evidence.
        const signature = await certificateService.verifyCertificateSignature(certificate);

        // Code verification (optional if provided in QR)
        // Note: Prisma schema might not have verificationCode? 
        // Based on GACPCertificateService, it generates it. 
        // We should check if it exists on the model.
        // Assuming it does for backward compat or we skip it if null.
        if (code && certificate.verificationCode && certificate.verificationCode !== code) {
            return res.json({
                success: true,
                verified: false,
                valid: false,
                data: {
                    status: 'invalid',
                    // A QR whose code does not match the document: same
                    // treatment as not-found — unchanged English, plus the
                    // machine code the Thai page needs.
                    ...PUBLIC_VERIFY_LOOKUP_FAILURES.CODE_MISMATCH,
                },
            });
        }

        // Certificate revision (ฉบับแก้ไขภายใต้เลขเดิม): a certificate past
        // revision 1 says so, with the Thai label of the reason CODE and the
        // list of archived revisions. The admin's free text (reasonText) is
        // never read here. Reported in the not-active branch too: a revised
        // certificate can later expire, and its history does not expire with it.
        const revision = (certificate.revisionNo || 1) > 1
            ? {
                no: certificate.revisionNo,
                revisedAt: certificate.revisedAt ? new Date(certificate.revisedAt).toISOString() : null,
                reasonLabel: certificateService.REVISION_REASON_LABELS_TH[certificate.revisionReason] || null,
                history: await certificateService.listRevisionSummaries(certificate.id),
            }
            : null;

        // F-G4-57: a certificate superseded by a renewal points at the document
        // that replaced it, so a citizen scanning an obsolete QR is sent to the
        // current one instead of being told only "not valid".
        const renewal = isSupersededByRenewal(certificate.status)
            ? await certificateService.renewalPointer(certificate)
            : null;

        // Return legacy-compatible structure
        return res.json({
            success: true,
            verified: isActive,
            valid: isActive, // Alias
            data: {
                // The stored number, so a lookup by the printed GACP-DTAM form still
                // answers with the register's own GACP-TH form.
                certificateNumber: certificate.certificateNumber || certificateNumber,
                status: liveStatus,
                // Surface WHY a certificate is not valid so the public QR page
                // can distinguish expired / suspended (ISO 17065 §7.11 —
                // temporary, reversible) / revoked (permanent) / renewed rather
                // than a bare "not valid". A suspended cert is intentionally NOT
                // active (isActive already excludes it), so its farm details
                // stay hidden until reinstated.
                //
                // `reason` keeps its exact English strings for the consumers
                // that already read them; `reasonCode` (F-G4-57) is the machine
                // value a Thai UI translates, so the citizen is not handed an
                // English sentence. Both come from the one derivation above.
                reason,
                reasonCode,
                // BE-#4: tamper-evidence for the verifier. 'TAMPERED' means the
                // stored row no longer matches the hash stamped at issuance.
                integrity: integrity.status,
                // H1: additive crypto-trust verdicts (existing verified/valid/
                // integrity semantics are unchanged).
                //   hashValid      — recomputed documentHash matches the stored one
                //   signatureValid — RSA signature verifies over documentHash;
                //                     NULL (not false) when the cert is unsigned
                //                     so legacy certs are NOT falsely flagged tampered
                //   sealed         — the cert carries a PKI signature at all
                hashValid: integrity.status === 'VALID',
                signatureValid: signature.signed ? signature.valid === true : null,
                sealed: signature.signed === true,
                publicKeyFingerprint: signature.publicKeyFingerprint || null,
                // Certificate revision: null at revision 1, else
                // { no, revisedAt, reasonLabel, history: [{ no, signedAt, supersededAt }] }.
                revision,
                renewal,
                // Scope and issuer come from the projection the lot door shares (order 68(1)).
                certificate: isActive ? {
                    farmName: certificate.farmName,
                    holderDisplayName: companyHolderName(certificate),
                    province: certificate.province,
                    issueDate: certificate.issuedDate,
                    expiryDate: certificate.expiryDate,
                    ...publicCertificateFacts(certificate),
                } : null,
                verifiedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        logger.error('[Public] Verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการตรวจสอบใบรับรอง',
        });
    }
});

// Certificate revision: the one answer for "no such archived revision" —
// unknown certificate number, a revision index that is not a positive integer,
// or no archived row at that index. One shape so an enumerator learns nothing
// from which of the three it hit. Catalogued as REVISION_NOT_FOUND (404).
function revisionNotFound(res) {
    return res.status(404).json({ success: false, error: 'REVISION_NOT_FOUND' });
}

/**
 * @route GET /verify/:certificateNumber/revisions/:n
 * @desc Public verification of an ARCHIVED revision n of a certificate
 *       (ฉบับแก้ไขภายใต้เลขเดิม): the document as it stood when revision n
 *       was signed, verified from its own archived proof columns and pinned
 *       key. Always `superseded: true` — the live document is /verify/:no.
 * @access Public (same rate limiter as /verify/:certificateNumber)
 */
router.get('/verify/:certificateNumber/revisions/:n', publicVerifyLimiter, async (req, res) => {
    try {
        const certificate = await certificateService.findByCertificateNumber(req.params.certificateNumber);
        // A revision index is a positive integer written in digits only;
        // '1.5', '-1', 'abc' and '0' are refused before any lookup.
        const n = /^\d+$/.test(req.params.n) ? Number.parseInt(req.params.n, 10) : NaN;
        if (!certificate || !Number.isInteger(n) || n < 1) {
            return revisionNotFound(res);
        }
        const out = await certificateService.verifyArchivedRevision(certificate.id, n);
        if (!out.found) {
            return revisionNotFound(res);
        }
        const { revision, integrity, signature } = out;
        // The archived proof columns verify the ARCHIVE; they know nothing of
        // the live row's status (certificateCanonicalJson omits status /
        // isDeleted / revokedAt on purpose, see isCertificateRevoked). So the
        // live state is read here, the same way the main door reads it, and
        // gates what this door may say:
        //   - a revocation marker on the live row → integrity REVOKED, as
        //     verifyDocumentIntegrity answers for the live row itself; a
        //     revoked number never carries a green verdict on any door;
        //   - a live row the main door reports as not active (revoked,
        //     suspended, expired) → snapshot null, as the main door answers
        //     certificate: null. district/subDistrict are the widest location
        //     facts on any public door and are never wider than the main one.
        const live = liveCertificateState(certificate);
        const revoked = certificateService.isCertificateRevoked(certificate);
        const disclose = live.isActive && !revoked;
        const snapshot = revision.snapshot || {};
        return res.json({
            success: true,
            data: {
                certificateNumber: certificate.certificateNumber,
                revisionNo: n,
                superseded: true,
                supersededAt: revision.supersededAt ? new Date(revision.supersededAt).toISOString() : null,
                // The LIVE certificate's public status word, the same value the
                // main door reports as data.status, so the revision page can
                // tell an archived revision of a certificate in force from one
                // whose number is no longer good.
                certificateStatus: revoked ? 'revoked' : live.status,
                integrity: revoked ? 'REVOKED' : integrity.status,
                signatureValid: signature.signed ? signature.valid === true : null,
                // The public facts of the archived document only, and only
                // while the live certificate is active; the address line and
                // reasonText stay in the archive.
                snapshot: disclose ? {
                    province: snapshot.province ?? null,
                    district: snapshot.district ?? null,
                    subDistrict: snapshot.subDistrict ?? null,
                    farmName: snapshot.farmName ?? null,
                } : null,
            },
        });
    } catch (error) {
        logger.error('[Public] Revision verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการตรวจสอบฉบับก่อนหน้า กรุณาลองใหม่อีกครั้ง',
        });
    }
});

module.exports = router;
