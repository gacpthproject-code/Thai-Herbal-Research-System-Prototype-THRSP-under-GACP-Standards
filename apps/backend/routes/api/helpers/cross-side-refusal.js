'use strict';

const {
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
} = require('../../../middleware/audit-logger');
const { ERROR_CODES } = require('../../../shared/error-codes');
const logger = require('../../../shared/logger');

const CODE = 'CROSS_SIDE_USER_CHANGE_FORBIDDEN';

/**
 * Answers a refusal thrown by canonical-rbac assertSameSideChange: one audit row, then 403.
 * The row holds the actor id, the door and the roles and sides involved. It carries no name,
 * email, national ID, IP address or user agent. `error` repeats the code because the web
 * client reads the machine code from that field.
 *
 * @returns {Promise<boolean>} true when `error` was that refusal and the response is sent
 */
async function refuseCrossSide(req, res, error) {
    if (error?.code !== CODE || !error.refusal) {
        return false;
    }
    const { targetUserId, ...facts } = error.refusal;
    try {
        await auditLogger.log({
            category: AuditCategory.ADMIN,
            action: 'CROSS_SIDE_USER_CHANGE_REFUSED',
            severity: AuditSeverity.WARNING,
            actorId: req.user?.id || 'UNKNOWN',
            actorRole: facts.actorRole || 'UNKNOWN',
            actorType: 'ADMIN',
            resourceType: ResourceType.USER,
            resourceId: targetUserId || 'NEW_USER',
            result: 'FAILURE',
            errorCode: CODE,
            metadata: { door: `${req.method} ${req.baseUrl}${req.route?.path || ''}`, ...facts },
        });
    } catch (auditError) {
        logger.error('[cross-side] refusal audit row failed:', auditError?.message);
    }
    const { messageEn, messageTh } = ERROR_CODES[CODE];
    res.status(403).json({ success: false, code: CODE, error: CODE, message: messageEn, messageTh });
    return true;
}

module.exports = { refuseCrossSide };
