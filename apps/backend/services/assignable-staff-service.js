'use strict';

/**
 * The person a door is about to put on an application (document reviewer, field
 * inspector): an active provider account holding one of the roles that door accepts,
 * in the application's OWN organization (order 17). The organization is the
 * application's, never the caller's: a system_admin_platform crosses organizations to
 * act, but the person it assigns must still belong to the filing's organization.
 * An application with no organization has no assignable staff (unknown = deny).
 *
 * Every assigning door asks this one question, so "exists, active, right role, same
 * organization" cannot drift between doors again.
 */

const { prisma } = require('./prisma-database');
const { normalizeRole } = require('../shared/canonical-rbac');
const { lookup } = require('../shared/error-codes');

function refuseNotAssignable() {
    const row = lookup('STAFF_NOT_ASSIGNABLE');
    const err = new Error(row.messageTh);
    err.code = row.code;
    err.statusCode = row.httpStatus;
    err.messageTh = row.messageTh;
    return err;
}

/**
 * @param {object} args
 * @param {string} args.userId          the staff id the request carried
 * @param {string[]} args.roles         canonical roles this door accepts
 * @param {string|null} args.organizationId the application's organization
 * @param {object} [args.client]        prisma client or transaction handle
 * @returns {Promise<{id:string, providerId:string|null, firstName:string|null, lastName:string|null, role:string, organizationId:string}>}
 */
async function assertAssignableStaff({ userId, roles, organizationId, client = prisma }) {
    if (!userId || !organizationId) {throw refuseNotAssignable();}
    const user = await client.user.findFirst({
        where: {
            id: String(userId), organizationId, isDeleted: false, status: 'ACTIVE', accountType: 'PROVIDER',
        },
        select: { id: true, providerId: true, firstName: true, lastName: true, role: true, organizationId: true },
    });
    if (!user || !roles.includes(normalizeRole(user.role))) {throw refuseNotAssignable();}
    return user;
}

module.exports = { assertAssignableStaff };
