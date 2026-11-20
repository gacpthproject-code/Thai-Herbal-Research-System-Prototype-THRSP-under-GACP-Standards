'use strict';

const { CANONICAL_ROLES, normalizeRole } = require('./canonical-rbac');
const { lookup } = require('./error-codes');

/**
 * Only the field inspector the dispatcher put on an application (application.auditorId)
 * records its on-site result (operator 2026-10-06, order 27). Every door an inspector can
 * decide through asks this, so being able to see a filing never stands in for being its
 * inspector.
 *
 * @returns {boolean} true when the caller is a field inspector who is not the assigned one
 *   and the refusal has been written to `res`
 */
function refuseUnlessAssignedInspector(res, application, user) {
    if (normalizeRole(user?.canonicalRole || user?.role) !== CANONICAL_ROLES.FIELD_INSPECTOR) { return false; }
    if (application?.auditorId && application.auditorId === user?.id) { return false; }
    const row = lookup('NOT_THE_ASSIGNED_INSPECTOR');
    res.status(row.httpStatus).json({
        success: false, code: row.code, error: row.code, message: row.messageTh, messageTh: row.messageTh,
    });
    return true;
}

module.exports = { refuseUnlessAssignedInspector };
