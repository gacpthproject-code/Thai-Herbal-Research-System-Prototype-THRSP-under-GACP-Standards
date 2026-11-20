/**
 * GET /api/certificate-validity — the certificate term in force now, public.
 *
 * The web states the term from this answer and keeps no number of its own
 * (apps/web-app/src/lib/certificate-validity). Issuance reads the same register at its
 * own issue instant (services/certificate-validity-rule-service.js). No rule in force is
 * answered 503 CERTIFICATE_VALIDITY_RULE_MISSING, never a guessed term.
 */

const express = require('express');
const { prisma } = require('../../../services/prisma-database');
const { respondError } = require('../../../shared/api-response');
const { ERROR_CODES } = require('../../../shared/error-codes');
const { validityRuleAt } = require('../../../services/certificate-validity-rule-service');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const rule = await validityRuleAt(new Date(), { client: prisma });
        return res.json({
            success: true,
            data: { months: rule.months, effectiveFrom: rule.effectiveFrom.toISOString() },
        });
    } catch (error) {
        if (error.code === 'CERTIFICATE_VALIDITY_RULE_MISSING') {
            const spec = ERROR_CODES.CERTIFICATE_VALIDITY_RULE_MISSING;
            return res.status(spec.httpStatus).json({ success: false, error: spec.code, message: spec.messageTh });
        }
        return respondError(res, req, error);
    }
});

module.exports = router;
