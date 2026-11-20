'use strict';

const { withVisibility, FINANCE_ROLES } = require('../shared/application-visibility');
const { normalizeRole } = require('../shared/canonical-rbac');
const { respondError } = require('../shared/api-response');

/**
 * True when `user` may read application `applicationId` through a per-application door:
 * the visibility filter admits it, and the caller is not finance. These doors carry
 * inspection data, and finance reads billing data only (order 14).
 *
 * @param {object} user req.user
 * @param {string} applicationId
 * @returns {Promise<boolean>}
 */
async function isApplicationVisibleTo(user, applicationId) {
    if (!applicationId || FINANCE_ROLES.has(normalizeRole(user?.canonicalRole || user?.role))) {
        return false;
    }
    // Required on use: route modules that load this at import time must not pull the whole
    // application service (and its logger) into suites that stub those.
    const applicationService = require('../services/application-service');
    const visible = await applicationService.findVisibleApplicationIdSlice({
        where: withVisibility({ id: applicationId, isDeleted: false }, user),
    });
    return Boolean(visible);
}

/**
 * 404 unless the caller may read `req.params.applicationId`. A read keyed by application id
 * inherits the application's row scope, so checklist, SOW, activity, onsite and fraud-scan
 * rows of an application the caller cannot see stay unseen too.
 */
async function requireVisibleApplication(req, res, next) {
    try {
        if (!await isApplicationVisibleTo(req.user, req.params.applicationId)) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }
        return next();
    } catch (error) {
        return respondError(res, req, error, {
            label: '[require-visible-application]',
            message: 'Failed to load application',
        });
    }
}

module.exports = { requireVisibleApplication, isApplicationVisibleTo };
