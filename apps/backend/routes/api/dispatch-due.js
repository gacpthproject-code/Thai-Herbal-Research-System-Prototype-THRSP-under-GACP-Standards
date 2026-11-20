/**
 * GET /api/dispatch-due — the working days the dispatcher has to assign a document reviewer after the
 * first payment, as the dated DISPATCHER.QUEUE_TIME_LIMITS rule in force now says (order 56(1) 1.1),
 * public. The applicant's success screen states it from this answer and keeps no number of its own,
 * so a later-dated rule changes the screen on its own date. No rule in force is answered 503
 * DISPATCH_RULE_MISSING, never a guessed number.
 */

const express = require('express');
const { ERROR_CODES } = require('../../shared/error-codes');
const { queueTimeLimitsAt } = require('../../services/dispatcher-rules');

const router = express.Router();

router.get('/', (req, res) => {
    const rule = queueTimeLimitsAt(new Date());
    if (!rule) {
        const spec = ERROR_CODES.DISPATCH_RULE_MISSING;
        return res.status(spec.httpStatus).json({ success: false, code: spec.code, error: spec.messageTh });
    }
    return res.json({ success: true, data: { dueWorkingDays: rule.dueWorkingDays, effectiveFrom: rule.effectiveFrom } });
});

module.exports = router;
