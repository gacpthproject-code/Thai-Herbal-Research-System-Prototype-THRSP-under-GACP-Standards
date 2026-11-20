/**
 * Routes: /api/provider/work/*
 *
 * BPMN-aligned work queue for provider staff (ADR-016 Phase 1A).
 *
 *   GET  /my                  — items assigned to me + items I'm eligible to claim
 *   GET  /queue               — queue for my candidate group (filterable)
 *   POST /:id/claim           — claim an open item
 *   POST /:id/unclaim         — release an item back to the queue
 *   POST /:id/done            — mark item DONE. The application's status never moves
 *                              here: each step has its own screen that names the person
 *                              and runs the step's side effects.
 */

'use strict';

const express = require('express');
const {
    prisma,
    authenticateProvider,
    logger,
    normalizeRole,
} = require('./handlers/shared');
const workActivityService = require('../../../services/work-activity-service');
const { countWorkingDaysBetween } = require('../../../utils/working-days');
const { respondError } = require('../../../shared/api-response');
const { CANONICAL_ROLES } = require('../../../shared/canonical-rbac');
const userGroupsHelper = require('../../../shared/user-groups');
const {
    organizationScope, answerNoOrganization, roleRowScope, DENY_ALL,
} = require('../../../shared/application-visibility');

const router = express.Router();

router.use(authenticateProvider);

function getActorRole(req) {
    return normalizeRole(req.user?.canonicalRole || req.user?.role);
}

/** Roles that work only what the dispatcher assigned them, never a shared pool. */
const ASSIGNED_WORK_ROLES = new Set([CANONICAL_ROLES.DOCUMENT_REVIEWER, CANONICAL_ROLES.FIELD_INSPECTOR]);

/**
 * The work items this caller may see or touch, as a WorkActivity where fragment:
 * its own organization (order 17; only the platform admin crosses) and, for the
 * document reviewer and the field inspector, only the applications assigned to it.
 * DENY_ALL when the caller has no organization.
 */
function workScope(req) {
    const organizationWhere = organizationScope(req.user);
    if (organizationWhere === DENY_ALL) { return DENY_ALL; }
    const role = getActorRole(req);
    const assigned = ASSIGNED_WORK_ROLES.has(role) ? { application: roleRowScope(role, req.user?.id) } : {};
    return { ...(organizationWhere || {}), ...assigned };
}

function shapeActivity(row) {
    return {
        id: row.id,
        applicationId: row.applicationId,
        applicationNumber: row.application?.applicationNumber || null,
        applicationStatus: row.application?.status || null,
        applicantName:
            [row.application?.applicant?.firstName, row.application?.applicant?.lastName]
                .filter(Boolean)
                .join(' ')
                .trim() || null,
        workType: row.workType,
        candidateGroup: row.candidateGroup,
        state: row.state,
        assignedUserId: row.assignedUserId,
        assignedUserName:
            [row.assignedUser?.firstName, row.assignedUser?.lastName]
                .filter(Boolean)
                .join(' ')
                .trim() || null,
        triggeredAtStage: row.triggeredAtStage,
        dueAt: row.dueAt,
        warningAt: row.warningAt,
        claimedAt: row.claimedAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        cancelledAt: row.cancelledAt,
        cancelReason: row.cancelReason,
        note: row.note,
        createdAt: row.createdAt,
        isOverdue: row.dueAt ? new Date(row.dueAt) < new Date() && !['DONE', 'CANCELLED'].includes(row.state) : false,
        // Bangkok working days to the due date (negative once past it), so a screen never shows
        // hours (order 27; operator 2026-10-09: "เหลือ 3 วันทำการ" / "เลยกำหนด 2 วันทำการ").
        workingDaysLeft: row.dueAt && !['DONE', 'CANCELLED'].includes(row.state)
            ? countWorkingDaysBetween(new Date(), new Date(row.dueAt))
            : null,
    };
}

router.get('/my', async (req, res) => {
    try {
        const userRole = getActorRole(req);
        if (!userRole) {
            return res.status(403).json({ success: false, error: 'No role on token' });
        }

        const workTypes = req.query.workType
            ? String(req.query.workType).split(',').map((s) => s.trim()).filter(Boolean)
            : null;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

        const scope = workScope(req);
        if (scope === DENY_ALL) { return answerNoOrganization(res); }
        const rows = await workActivityService.listMyTodo({
            prisma,
            userId: req.user.id,
            userRole,
            workTypes,
            scope,
            limit,
        });

        return res.json({
            success: true,
            data: rows.map(shapeActivity),
            counts: {
                total: rows.length,
                claimed: rows.filter((r) => r.assignedUserId === req.user.id).length,
                unclaimed: rows.filter((r) => !r.assignedUserId).length,
                overdue: rows.filter(
                    (r) => r.dueAt && new Date(r.dueAt) < new Date(),
                ).length,
            },
        });
    } catch (e) {
        return respondError(res, req, e, { label: '[provider/work] list my', message: 'Failed to load work items' });
    }
});

router.get('/queue', async (req, res) => {
    try {
        const userRole = getActorRole(req);
        if (!userRole) {
            return res.status(403).json({ success: false, error: 'No role on token' });
        }

        // Phase 1C: any user can query a queue for any group they belong
        // to (or admins for any group). Default = first group (which is
        // the legacy User.role for users without explicit memberships).
        const groupParam = String(req.query.group || '').trim().toLowerCase();
        const myGroups = await userGroupsHelper.getUserGroups(prisma, req.user.id);
        const isAdmin = myGroups.includes(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM);
        let targetGroup;
        if (groupParam) {
            if (!isAdmin && !myGroups.includes(groupParam)) {
                return res.status(403).json({
                    success: false,
                    error: `You are not a member of the ${groupParam} group`,
                });
            }
            targetGroup = groupParam;
        } else {
            // Default to the user's primary role hint, falling back to
            // first group if userRole is undefined.
            targetGroup = userRole || myGroups[0];
        }
        if (!targetGroup) {
            return res.json({ success: true, data: [], meta: { group: null, count: 0 } });
        }

        const workTypes = req.query.workType
            ? String(req.query.workType).split(',').map((s) => s.trim()).filter(Boolean)
            : null;
        const states = req.query.state
            ? String(req.query.state).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
            : null;
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

        const scope = workScope(req);
        if (scope === DENY_ALL) { return answerNoOrganization(res); }
        const rows = await workActivityService.listForGroup({
            prisma,
            role: targetGroup,
            workTypes,
            states,
            scope,
            limit,
        });

        return res.json({
            success: true,
            data: rows.map(shapeActivity),
            meta: { group: targetGroup, count: rows.length },
        });
    } catch (e) {
        return respondError(res, req, e, { label: '[provider/work] queue', message: 'Failed to load work queue' });
    }
});

// Detail: /:id MUST come AFTER static-path GETs (/my, /queue) so Express
// doesn't intercept those as `:id = "my"` etc.
router.get('/:id', async (req, res) => {
    try {
        const userRole = getActorRole(req);
        if (!userRole) {
            return res.status(403).json({ success: false, error: 'No role on token' });
        }
        const scope = workScope(req);
        if (scope === DENY_ALL) { return answerNoOrganization(res); }
        const row = await prisma.workActivity.findFirst({
            where: { AND: [{ id: req.params.id }, scope] },
            include: {
                application: {
                    select: {
                        id: true,
                        applicationNumber: true,
                        status: true,
                        applicant: { select: { firstName: true, lastName: true } },
                    },
                },
                assignedUser: { select: { id: true, firstName: true, lastName: true } },
                completer: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!row) {
            return res.status(404).json({ success: false, error: 'Activity not found' });
        }
        // Phase 1C: visibility = admin (via group OR legacy role) OR
        // assignee OR member of the candidate group.
        const isAssignee = row.assignedUserId === req.user.id;
        const inGroup = await userGroupsHelper.userInGroup(
            prisma,
            req.user.id,
            row.candidateGroup,
        );
        if (!isAssignee && !inGroup) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        // No applicant email or phone here: staff reach the applicant through in-app
        // notification (order 18).
        return res.json({
            success: true,
            data: {
                ...shapeActivity(row),
                completedByName:
                    [row.completer?.firstName, row.completer?.lastName]
                        .filter(Boolean)
                        .join(' ')
                        .trim() || null,
            },
        });
    } catch (e) {
        return respondError(res, req, e, { label: '[provider/work] detail', message: 'Failed to load work item' });
    }
});

router.post('/:id/claim', async (req, res) => {
    try {
        const scope = workScope(req);
        if (scope === DENY_ALL) { return answerNoOrganization(res); }
        const userRole = getActorRole(req);
        const updated = await workActivityService.claim({
            prisma,
            activityId: req.params.id,
            userId: req.user.id,
            userRole,
            scope,
        });
        return res.json({ success: true, data: shapeActivity(updated) });
    } catch (e) {
        logger.warn('[provider/work] claim failed:', e.message);
        return res.status(400).json({ success: false, error: e.message });
    }
});

router.post('/:id/unclaim', async (req, res) => {
    try {
        const scope = workScope(req);
        if (scope === DENY_ALL) { return answerNoOrganization(res); }
        const userRole = getActorRole(req);
        const updated = await workActivityService.unclaim({
            prisma,
            activityId: req.params.id,
            userId: req.user.id,
            userRole,
            scope,
        });
        return res.json({ success: true, data: shapeActivity(updated) });
    } catch (e) {
        logger.warn('[provider/work] unclaim failed:', e.message);
        return res.status(400).json({ success: false, error: e.message });
    }
});

router.post('/:id/done', async (req, res) => {
    try {
        const scope = workScope(req);
        if (scope === DENY_ALL) { return answerNoOrganization(res); }
        const note = req.body?.note ? String(req.body.note).slice(0, 1000) : null;
        const updated = await workActivityService.markDone({
            prisma,
            activityId: req.params.id,
            userId: req.user.id,
            userRole: getActorRole(req),
            note,
            scope,
        });
        return res.json({ success: true, data: { activity: shapeActivity(updated) } });
    } catch (e) {
        logger.warn('[provider/work] markDone failed:', e.message);
        return res.status(400).json({ success: false, error: e.message });
    }
});

module.exports = router;
