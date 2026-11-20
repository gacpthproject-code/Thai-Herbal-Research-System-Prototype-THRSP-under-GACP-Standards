/**
 * Routes: /api/provider/admin/user-groups/*
 *
 * Admin-only management of UserGroupMembership rows (ADR-016 Phase 1C).
 *
 *   GET    /:userId         — list a user's group memberships
 *   POST   /:userId         — add a user to a group  body: { groupCode }
 *   DELETE /:userId/:groupCode — remove a user from a group
 *
 * The migration backfills one row per user from their existing User.role,
 * so most users already have their primary group. These endpoints exist
 * to add SECONDARY memberships (a group code is a role word, so each one
 * is a secondary role and goes through the two-sided rule, orders 13, 34(2)).
 *
 * Removing a user's only membership is allowed but discouraged — they
 * would fall back to User.role-driven access. Removing the membership
 * that matches User.role effectively does nothing (the legacy fallback
 * still grants access until User.role changes too).
 */

'use strict';

const express = require('express');
const {
    authenticateProvider,
} = require('./handlers/shared');
const {
    CANONICAL_ROLES, normalizeRole, assertSameSideChange, isStaffAccount,
} = require('../../../shared/canonical-rbac');
const { respondError } = require('../../../shared/api-response');
const { getActiveAdminUserGuard } = require('../../../services/provider-user-service');
const { ERROR_CODES } = require('../../../shared/error-codes');
const { refuseCrossSide } = require('../helpers/cross-side-refusal');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../shared/application-visibility');
const userGroups = require('../../../shared/user-groups');
// Batch 14 (2026-05-16): user-group membership and role-group lookups go
// through user-group-service.js so this route does not reach into the Prisma
// client directly. The route stays in charge of validation (groupCode
// normalization, admin-only middleware); the service owns the persistence.
const userGroupService = require('../../../services/user-group-service');

const router = express.Router();
router.use(authenticateProvider);

function requireAdmin(req, res, next) {
    const role = normalizeRole(req.user?.canonicalRole || req.user?.role);
    if (role !== CANONICAL_ROLES.SYSTEM_ADMIN_DTAM) {
        return res.status(403).json({ success: false, error: 'Admin only' });
    }
    if (organizationScope(req.user) === DENY_ALL) {
        return answerNoOrganization(res);
    }
    return next();
}
router.use(requireAdmin);

/**
 * The account a group door acts on: a staff account of the admin's own organization
 * (order 17). An applicant account, or one of another organization, reads as absent (404),
 * like on the staff directory: a group is a staff role, never an applicant's (review L4).
 */
async function staffTarget(req) {
    const user = await getActiveAdminUserGuard(req.params.userId, { organizationId: req.user?.organizationId });
    return isStaffAccount(user) ? user : null;
}

router.get('/:userId', async (req, res) => {
    try {
        const user = await staffTarget(req);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const memberships = await userGroupService.listMembershipsForUser(user.id);
        return res.json({
            success: true,
            data: memberships.map((m) => ({
                userId: m.userId,
                groupCode: m.group.code,
                titleTH: m.group.titleTH,
                titleEN: m.group.titleEN,
                isActive: m.isActive && m.group.isActive,
                assignedAt: m.assignedAt,
                assignedBy: m.assignedBy,
            })),
        });
    } catch (e) {
        return respondError(res, req, e, { label: '[admin/user-groups] list', message: 'Failed to list user groups' });
    }
});

router.post('/:userId', async (req, res) => {
    try {
        const groupCode = normalizeRole(String(req.body?.groupCode || '').trim());
        if (!groupCode) {
            return res.status(400).json({ success: false, error: 'groupCode required' });
        }

        // A group is a role (the codes are role words), so adding one is a role assignment:
        // the account and the group must both be on the admin's side (orders 13, 34(2)),
        // and no admin gives one to itself (review L4).
        if (String(req.params.userId) === String(req.user?.id)) {
            const row = ERROR_CODES.SELF_ROLE_CHANGE_FORBIDDEN;
            return res.status(row.httpStatus).json({ success: false, code: row.code, error: row.messageTh, message: row.messageEn });
        }
        const user = await staffTarget(req);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        assertSameSideChange({
            actorRole: req.user?.canonicalRole || req.user?.role,
            target: user,
            requestedRole: groupCode,
        });

        const group = await userGroupService.findRoleGroupByCode(groupCode, { activeOnly: true });
        if (!group) {
            return res.status(404).json({ success: false, error: `Group ${groupCode} not found` });
        }

        const created = await userGroupService.upsertMembership({
            userId: user.id,
            groupId: group.id,
            organizationId: user.organizationId,
            assignedBy: req.user.id,
            actorRole: normalizeRole(req.user?.canonicalRole || req.user?.role),
        });

        // Bust the in-memory cache so subsequent reads see the new
        // group-id mapping if a brand-new group was just activated.
        userGroups.clearCache();

        return res.json({
            success: true,
            data: {
                userId: created.userId,
                groupCode: group.code,
                isActive: created.isActive,
            },
        });
    } catch (e) {
        if (await refuseCrossSide(req, res, e)) {
            return undefined;
        }
        return respondError(res, req, e, { label: '[admin/user-groups] add', message: 'Failed to add user to group' });
    }
});

router.delete('/:userId/:groupCode', async (req, res) => {
    try {
        const groupCode = normalizeRole(req.params.groupCode);
        if (!groupCode) {
            return res.status(400).json({ success: false, error: 'Invalid groupCode' });
        }
        // Removing a group changes the account only, so only the account's side is checked:
        // the DTAM admin can still clear a company group off its own staff.
        const user = await staffTarget(req);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        assertSameSideChange({ actorRole: req.user?.canonicalRole || req.user?.role, target: user });
        const group = await userGroupService.findRoleGroupByCode(groupCode);
        if (!group) {
            return res.status(404).json({ success: false, error: 'Group not found' });
        }
        await userGroupService.deleteMembership({
            userId: user.id,
            groupId: group.id,
            removedBy: req.user?.id || null,
            actorRole: normalizeRole(req.user?.canonicalRole || req.user?.role),
            organizationId: user.organizationId,
        });
        return res.json({ success: true });
    } catch (e) {
        if (await refuseCrossSide(req, res, e)) {
            return undefined;
        }
        return respondError(res, req, e, { label: '[admin/user-groups] delete', message: 'Failed to remove user from group' });
    }
});

module.exports = router;
