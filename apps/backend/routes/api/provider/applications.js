const express = require('express');
const { authenticateProvider } = require('../../../middleware/auth-middleware');
const {
    resolveRawStatusesForStates,
    resolveStateFromApplication,
} = require('../../../services/workflow-transition-service');
const { providerRouteHandlers } = require('./route-registry');
const { applicationFormFieldsPatch } = require('./handlers/application-form-fields-handler');
const { withVisibility, FINANCE_ROLES } = require('../../../shared/application-visibility');
const { respondError } = require('../../../shared/api-response');
const { normalizeRole, CANONICAL_ROLES } = require('../../../shared/canonical-rbac');
const { maskFormDataNationalIds } = require('../../../utils/formdata-pii');
// The dispatcher and the field inspector read no contact of the applicant (orders 29 and 56(3)).
const { withholdsContactFrom, formDataWithoutContact, siteContactOf } = require('../../../shared/applicant-contact');
const { lookup: lookupErrorCode } = require('../../../shared/error-codes');
const logger = require('../../../shared/logger');
const { presentHolder } = require('../../../services/entity-service');
const { filingPlantName, plantDisplayNamesByRef } = require('../../../services/plant-species-service');
const { readFilingSite } = require('../../../services/application-service/application-farm-materialization');
const { AREA_TYPE_LABEL_TH } = require('../../../validation/canonical-application-validator');
// Batch 14 (2026-05-16): provider-side application reads now go through the
// service layer. The route still owns the search-term + status-filter
// composition (those depend on the resolveProviderRawStatuses helper) and
// hands the assembled `where` to the service; the service applies the
// pagination + projection that match the legacy contract.
const applicationService = require('../../../services/application-service');
// X2-FIX-D M-20 (DR-SOW-1): per-app owner gate for SOW + checklist
// writes. The role-only authenticateProvider check admitted any provider
// to create SOW/checklist rows against applications they weren't
// assigned to. Used as a route-level middleware so the underlying
// controllers (sow-controller, audit-checklist-controller) stay generic.
const { prisma: ownerGatePrisma } = require('../../../services/prisma-database');
const { assertCallerIsAssignedToApplication } = require('../../../shared/application-owner-gate');
const { loadDocumentSlots } = require('../../../services/application-document-slots');

async function requireApplicationOwner(req, res, next) {
    try {
        const { applicationId } = req.params;
        if (!applicationId) {
            return res.status(400).json({ success: false, error: 'applicationId is required' });
        }
        const application = await ownerGatePrisma.application.findUnique({
            where: { id: applicationId },
            select: {
                id: true,
                reviewerId: true,
                auditorId: true,
                formData: true,
            },
        });
        const ownerCheck = assertCallerIsAssignedToApplication(application, req.user);
        if (!ownerCheck.ok) {
            return res.status(ownerCheck.status).json(ownerCheck.body);
        }
        return next();
    } catch (error) {
        logger.error('[provider applications] requireApplicationOwner failed', { message: error.message });
        return res.status(500).json({ success: false, error: 'Failed to verify application assignment' });
    }
}

const router = express.Router();

const DEFAULT_PROVIDER_WORKFLOW_STATES = [
    'SUBMITTED',
    'PENDING_DOC_FEE',
    'DOC_FEE_PAID',
    'ASSIGNED_FOR_REVIEW',
    'REVISION_REQUESTED',
    'DOC_APPROVED',
    'PENDING_AUDIT_FEE',
    'AUDIT_FEE_PAID',
    'AUDIT_CONFIRMED',
    'CAR_PENDING',
    'CAR_REVIEWING',
    'AUDIT_PASSED',
    'AUDIT_NOT_PASSED',
    'APPROVED',
    'CERTIFIED',
    'REJECTED',
    'CANCELLED',
];

function resolveProviderRawStatuses(filters = []) {
    return resolveRawStatusesForStates(filters.length > 0 ? filters : DEFAULT_PROVIDER_WORKFLOW_STATES);
}

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);
const isMissingApplicationCommentsTableError = (error) => {
    const message = String(error?.message || '');
    return error?.code === 'P2021' && message.includes('application_comments');
};

function resolveApplicantName(application) {
    const firstName = String(application?.applicant?.firstName || '').trim();
    const lastName = String(application?.applicant?.lastName || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || '-';
}

function resolvePlantType(application) {
    const formData = asObject(application?.formData);
    const productionData = asObject(formData.productionData);
    const cultivationDetails = asObject(formData.cultivationDetails);
    return String(
        formData.plantName
        || formData.plantId
        || cultivationDetails.plantId
        || productionData.plantSpecies
        || '-',
    ).trim() || '-';
}

function resolveLatestReviewComment(application) {
    const history = asArray(application?.workflowHistory);
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const item = asObject(history[index]);
        const note = String(item.comment || item.reason || item.notes || '').trim();
        if (note) {
            return note;
        }
    }
    return null;
}

function userName(user) {
    if (!user) {
        return null;
    }
    const name = [user.firstName, user.lastName].map((v) => String(v || '').trim()).filter(Boolean).join(' ').trim();
    return name || null;
}

/**
 * C3 ("งานนี้พาสไปที่ใคร") — resolve the doc-review assignment so the UI can show
 * WHO the job was assigned to, BY WHOM, and WHEN. The data already exists but was
 * never surfaced. Source of truth = the canonical `Application.reviewerId` column;
 * the richer who/when metadata (assignedBy user id + assignedAt) lives in
 * `formData.PROVIDERAssignment` (written atomically by the scheduler assign +
 * reassign handlers). We resolve the reviewerId + assignedBy user ids to display
 * names with a single batched User lookup (User carries no organizationId, so a
 * by-id read is tenant-neutral — matches provider-user-service lookups). Returns
 * `null` when no reviewer is assigned yet (the UI renders "ยังไม่ได้มอบหมาย").
 */
async function resolveAssignment(application, prismaClient) {
    const formData = asObject(application?.formData);
    const providerAssignment = asObject(formData.PROVIDERAssignment);
    // Canonical column wins; fall back to the legacy JSON path for older rows.
    const reviewerId = application?.reviewerId || providerAssignment.reviewerId || null;
    if (!reviewerId) {
        return null;
    }
    const assignedById = providerAssignment.assignedBy || null;
    const assignedAt = providerAssignment.assignedAt || null;

    const idsToResolve = [...new Set([reviewerId, assignedById].filter(Boolean))];
    let usersById = new Map();
    try {
        const users = await prismaClient.user.findMany({
            where: { id: { in: idsToResolve } },
            select: { id: true, firstName: true, lastName: true },
        });
        usersById = new Map(users.map((u) => [u.id, u]));
    } catch (error) {
        // Non-fatal: fall back to the name stored on the assignment row so the
        // header still renders (golden rule #3 — log the cause, don't swallow blind).
        logger.warn('[Provider Application Detail] assignment name resolution failed', { message: error?.message });
    }

    const reviewerName = userName(usersById.get(reviewerId))
        || (String(providerAssignment.reviewerName || '').trim() || null);
    const assignedByName = assignedById ? userName(usersById.get(assignedById)) : null;

    return {
        reviewerId,
        reviewerName,
        assignedById,
        assignedByName,
        assignedAt,
    };
}

router.get('/', authenticateProvider, async (req, res) => {
    try {
        const page = Number.parseInt(String(req.query.page || '1'), 10);
        const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10)));
        const offset = Math.max(0, (Number.isFinite(page) ? page : 1) - 1) * limit;
        const statusFilters = String(req.query.status || '')
            .split(',')
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);
        const search = String(req.query.q || '').trim();

        const hasExplicitStatusFilter = statusFilters.length > 0 && !statusFilters.includes('ALL');
        const resolvedRawStatuses = statusFilters.includes('ALL')
            ? []
            : resolveProviderRawStatuses(hasExplicitStatusFilter ? statusFilters : []);

        const baseWhere = {
            isDeleted: false,
        };

        if (resolvedRawStatuses.length > 0) {
            baseWhere.status = resolvedRawStatuses.length === 1
                ? resolvedRawStatuses[0]
                : { in: resolvedRawStatuses };
        }

        if (search) {
            baseWhere.OR = [
                { applicationNumber: { contains: search, mode: 'insensitive' } },
                { healthId: { contains: search } },
                {
                    applicant: {
                        OR: [
                            { firstName: { contains: search, mode: 'insensitive' } },
                            { lastName: { contains: search, mode: 'insensitive' } },
                        ],
                    },
                },
            ];
        }

        // Wave A Phase 20 — auditors see only their assigned applications
        // in the list view. No-op for admin / scheduler / etc.
        const where = withVisibility(baseWhere, req.user);

        const { rows, total } = await applicationService.listProviderApplicationsPage({
            where,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
            select: {
                id: true,
                applicationNumber: true,
                status: true,
                serviceType: true,
                certificationPurpose: true,
                certificationPurposes: true,
                createdAt: true,
                rejectCount: true,
                healthId: true,
                reviewerId: true,   // C3: assignee column for the list rows
                formData: true,
                applicant: { select: { firstName: true, lastName: true } },
                entity: { select: { type: true, displayName: true, identitySource: true } },
            },
        });

        // C3: resolve the assigned-by display names in ONE batched lookup across the
        // page (the list shows "มอบหมายโดย ..." on the reviewer queue + scheduler
        // coordinator rows). reviewerName is already stored on the assignment row.
        const assignedByIds = [...new Set(
            rows
                .map((app) => asObject(asObject(app.formData).PROVIDERAssignment).assignedBy)
                .filter(Boolean),
        )];
        let assignedByNameById = new Map();
        if (assignedByIds.length > 0) {
            try {
                const assigners = await ownerGatePrisma.user.findMany({
                    where: { id: { in: assignedByIds } },
                    select: { id: true, firstName: true, lastName: true },
                });
                assignedByNameById = new Map(assigners.map((u) => [u.id, userName(u)]));
            } catch (error) {
                logger.warn('[provider/applications] list assigned-by name resolution failed', { message: error?.message });
            }
        }

        const plantNames = await plantDisplayNamesByRef(rows.map(resolvePlantType), { client: ownerGatePrisma });
        const applications = rows.map((application) => {
            const workflowState = resolveStateFromApplication(application);
            const providerAssignment = asObject(asObject(application.formData).PROVIDERAssignment);
            const reviewerId = application.reviewerId || providerAssignment.reviewerId || null;
            const assignment = reviewerId
                ? {
                    reviewerId,
                    reviewerName: String(providerAssignment.reviewerName || '').trim() || null,
                    assignedById: providerAssignment.assignedBy || null,
                    assignedByName: assignedByNameById.get(providerAssignment.assignedBy) || null,
                    assignedAt: providerAssignment.assignedAt || null,
                }
                : null;
            return {
                id: application.id,
                applicationNumber: application.applicationNumber,
                applicantName: resolveApplicantName(application),
                holder: application.entity
                    ? { type: application.entity.type, displayName: application.entity.displayName, identitySource: application.entity.identitySource }
                    : null,
                plantType: resolvePlantType(application),
                plantName: plantNames.get(resolvePlantType(application)) || null,
                serviceType: application.serviceType || null,
                certificationPurpose: application.certificationPurpose || null,
                certificationPurposes: Array.isArray(application.certificationPurposes) ? application.certificationPurposes : [],
                status: workflowState,
                legacyStatus: application.status,
                workflowState,
                assignment,
                submittedAt: asObject(application.formData).submittedAt || null,
                submissionCount: Number(application.rejectCount || 0) + 1,
            };
        });

        return res.json({
            success: true,
            data: {
                applications,
                pagination: {
                    page: Number.isFinite(page) ? page : 1,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                },
            },
        });
    } catch (error) {
        // C4-07 (audit 2026-06-10): log the cause server-side; stop echoing raw
        // error.message to the client (info-leak — could surface DB/internal detail).
        logger.error('[provider/applications] list failed:', error?.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to load provider applications',
        });
    }
});

router.get('/queue', ...providerRouteHandlers.applicationsQueue);
router.post('/:id/assign', ...providerRouteHandlers.applicationsAssign);
router.post(
    '/:id/workflow-transitions',
    ...providerRouteHandlers.applicationsWorkflowTransitions,
);
router.post(
    '/:id/revision-expirations',
    ...providerRouteHandlers.applicationsRevisionExpirations,
);
// Reviewer in-place scalar/enum field edit (V1). Auth + RBAC (assigned
// reviewer / ADMIN) + state gate live inside the handler; arrays/tables stay
// read-only. Mounted before the catch-all `/:id` GET so it isn't shadowed.
router.patch('/:id/form-fields', ...applicationFormFieldsPatch);
router.get('/:id/audit-timelines', ...providerRouteHandlers.applicationsAuditTimelines);

// ── Wave-3 ERP primitive: per-record CHATTER ────────────────────────────────
// POST /:id/comments — provider staff post a comment or an internal-only note
// on an application they can SEE. Visibility reuses the SAME withVisibility
// scoping as the GET /:id detail read (auditors see only assigned cases;
// cross-tenant → 404). `internalOnly` is a server-trusted staff flag: any
// provider staff may set it and it ONLY controls applicant visibility (the
// applicant-side reads filter internalOnly:false — see
// __tests__/unit/applicant-comments-internal-only-guard.test.js), so an
// internal note posted here NEVER reaches the applicant.
router.post('/:id/comments', authenticateProvider, async (req, res) => {
    try {
        const idOrNumber = String(req.params.id || '').trim();
        const content = String(req.body?.content ?? '').trim();
        if (!content || content.length > 5000) {
            // Reuse the generic VALIDATION_ERROR (400) — no new error code needed.
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'ต้องระบุเนื้อหาความคิดเห็น (1–5000 ตัวอักษร)',
            });
        }
        const internalOnly = req.body?.internalOnly === true;

        // Mirror the detail read's visibility filter so a reviewer can only
        // comment on an application they can view. Fail-closed → 404.
        const visible = await applicationService.findVisibleApplicationIdSlice({
            where: withVisibility(
                {
                    OR: [{ id: idOrNumber }, { applicationNumber: idOrNumber }],
                    isDeleted: false,
                },
                req.user,
            ),
        });
        if (!visible) {
            return res.status(404).json({
                success: false,
                error: 'Application not found',
            });
        }

        const role = req.user.canonicalRole || req.user.role || 'PROVIDER';
        let created;
        try {
            created = await applicationService.createApplicationCommentIfAvailable({
                applicationId: visible.id,
                authorId: req.user.id,
                role,
                content,
                internalOnly,
            });
        } catch (error) {
            // Legacy schema without the application_comments table → same
            // graceful path the detail read uses (don't 500).
            if (isMissingApplicationCommentsTableError(error)) {
                logger.warn('[provider/applications] comment create skipped — application_comments table missing', {
                    applicationId: visible.id,
                });
                return res.status(404).json({
                    success: false,
                    error: 'Comments are not available on this deployment',
                });
            }
            throw error;
        }
        if (!created) {
            // Model unavailable on the client (legacy) or org could not be
            // resolved — treat as "not available" rather than a 500.
            logger.warn('[provider/applications] comment not persisted (model unavailable or org missing)', {
                applicationId: visible.id,
            });
            return res.status(404).json({
                success: false,
                error: 'Comments are not available on this deployment',
            });
        }

        // Best-effort audit (golden rule #3: log the cause, never block the write).
        try {
            const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../../middleware/audit-logger');
            const { getRequestIp } = require('../../../utils/client-ip');
            await auditLogger.log({
                category: AuditCategory.APPLICATION,
                action: 'APPLICATION_COMMENT_ADDED',
                severity: AuditSeverity.INFO,
                actorId: req.user.id || 'SYSTEM',
                actorRole: role,
                actorType: 'PROVIDER',
                resourceType: ResourceType.APPLICATION,
                resourceId: visible.id,
                organizationId: req.user.organizationId || null,
                ipAddress: getRequestIp(req),
                userAgent: req.get('user-agent'),
                metadata: { internalOnly },
            });
        } catch (auditError) {
            logger.warn('[provider/applications] APPLICATION_COMMENT_ADDED audit failed', {
                message: auditError?.message,
            });
        }

        return res.json({
            success: true,
            data: {
                id: created.id,
                createdAt: created.createdAt,
                authorId: created.authorId,
                role: created.role,
                content: created.content,
                internalOnly: created.internalOnly === true,
            },
        });
    } catch (error) {
        logger.error('[provider/applications] failed to add comment', {
            message: error?.message,
            stack: error?.stack,
        });
        return res.status(500).json({
            success: false,
            error: 'Failed to add comment',
        });
    }
});

router.get('/:id', authenticateProvider, async (req, res) => {
    try {
        const idOrNumber = String(req.params.id || '').trim();
        if (!idOrNumber) {
            return res.status(400).json({
                success: false,
                error: 'Application id is required',
            });
        }

        // Wave A Phase 19 (G4 partial) — auditors only see applications
        // they're assigned to, even when going directly to the detail
        // endpoint. Other provider roles fall through unchanged.
        const where = withVisibility(
            {
                OR: [{ id: idOrNumber }, { applicationNumber: idOrNumber }],
                isDeleted: false,
            },
            req.user,
        );
        // Finance reads billing data only (operator 2026-10-06): no formData, no applicant
        // contact, no workflow history or staff comments. Both finance roles get this one shape.
        if (FINANCE_ROLES.has(normalizeRole(req.user?.canonicalRole || req.user?.role))) {
            const billing = await applicationService.findProviderApplicationDetail({
                where,
                select: {
                    id: true,
                    applicationNumber: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    phase1Status: true,
                    phase2Status: true,
                    formData: true,
                    entity: { select: { id: true, type: true, displayName: true, identitySource: true } },
                },
            });
            if (!billing) {
                return res.status(404).json({ success: false, error: 'Application not found' });
            }
            return res.json({
                success: true,
                data: {
                    id: billing.id,
                    applicationNumber: billing.applicationNumber,
                    status: billing.status,
                    createdAt: billing.createdAt,
                    updatedAt: billing.updatedAt,
                    submittedAt: asObject(billing.formData).submittedAt || null,
                    phase1Status: billing.phase1Status || null,
                    phase2Status: billing.phase2Status || null,
                    holder: billing.entity
                        ? {
                            entityId: billing.entity.id,
                            type: billing.entity.type,
                            displayName: billing.entity.displayName,
                            identitySource: billing.entity.identitySource,
                        }
                        : null,
                },
            });
        }

        const contactWithheld = withholdsContactFrom(req.user);
        const baseSelect = {
            id: true,
            applicationNumber: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            rejectCount: true,
            areaType: true,
            reviewerId: true,   // C3: canonical assignee (doc reviewer) column
            auditorId: true,    // C3: canonical assignee (auditor) column
            formData: true,
            workflowHistory: true,
            phase1Status: true,
            phase2Status: true,
            applicant: {
                select: contactWithheld
                    ? { firstName: true, lastName: true }
                    : { firstName: true, lastName: true, email: true, phoneNumber: true },
            },
            entity: true,
        };
        // ApplicationComment columns are (id, createdAt, applicationId,
        // authorId, role, content, internalOnly, isDeleted, ...). The legacy
        // response shape downstream callers depend on uses (auditorId,
        // commentText, type) — see
        // apps/web-app/src/app/health/applications/[id]/application-detail-page-helpers.ts.
        // Earlier code selected `auditorId/commentText/type/attachments/
        // resolvedAt` as if they were columns, which 500'd every detail
        // request because Prisma rejects the select. Read the real columns,
        // then post-shape into the legacy keys so the frontend keeps working.
        let application;
        try {
            application = await applicationService.findProviderApplicationDetail({
                where,
                select: {
                    ...baseSelect,
                    comments: {
                        where: { isDeleted: false },
                        orderBy: { createdAt: 'desc' },
                        select: {
                            id: true,
                            createdAt: true,
                            authorId: true,
                            content: true,
                            role: true,
                            internalOnly: true,   // Wave-3 chatter: FE marks internal notes
                        },
                    },
                },
            });
        } catch (error) {
            if (!isMissingApplicationCommentsTableError(error)) {
                throw error;
            }
            logger.warn('[Provider Application Detail] application_comments table missing; fallback without comments');
            application = await applicationService.findProviderApplicationDetail({
                where,
                select: baseSelect,
            });
            if (application) {
                application.comments = [];
            }
        }
        if (application?.comments) {
            application.comments = application.comments.map((c) => ({
                id: c.id,
                createdAt: c.createdAt,
                auditorId: c.authorId,        // legacy alias for frontend
                authorId: c.authorId,          // canonical field
                commentText: c.content,        // legacy alias for frontend
                content: c.content,            // canonical field
                type: c.role,                  // legacy alias for frontend
                role: c.role,                  // canonical field
                internalOnly: c.internalOnly === true,  // Wave-3 chatter marker
                attachments: [],               // not stored in current schema
                resolvedAt: null,              // not stored in current schema
            }));
        }

        if (!application) {
            return res.status(404).json({
                success: false,
                error: 'Application not found',
            });
        }

        const profile = contactWithheld
            ? { firstName: application.applicant?.firstName || '', lastName: application.applicant?.lastName || '' }
            : {
                firstName: application.applicant?.firstName || '',
                lastName: application.applicant?.lastName || '',
                email: application.applicant?.email || '',
                phone: application.applicant?.phoneNumber || '',
            };
        const filing = contactWithheld ? formDataWithoutContact(asObject(application.formData)) : asObject(application.formData);

        // C3: surface "งานนี้พาสไปที่ใคร" — assigned reviewer + who assigned + when.
        const assignment = await resolveAssignment(application, ownerGatePrisma);
        // Every national ID in the filing and its history leaves the server masked, first digit and
        // last four (order 10): the applicant's, a president's or director's, and a staff id stamped
        // into the history.

        return res.json({
            success: true,
            data: {
                id: application.id,
                applicationNumber: application.applicationNumber,
                status: application.status,
                createdAt: application.createdAt,
                updatedAt: application.updatedAt,
                submittedAt: filing.submittedAt || null,
                rejectCount: application.rejectCount || 0,
                reviewComment: resolveLatestReviewComment(application),
                phase1Status: application.phase1Status || null,
                phase2Status: application.phase2Status || null,
                assignment,
                formData: maskFormDataNationalIds(filing),
                workflowHistory: maskFormDataNationalIds(asArray(application.workflowHistory)),
                comments: application.comments || [],
                health: profile,
                Applicant: profile,
                holder: staffHolderView(application.entity, contactWithheld),
                scope: await filingScopeOf(application),
            },
        });
    } catch (error) {
        // Golden rule #3: log the real cause before the generic 500. This detail
        // endpoint has prior prisma-select-mismatch history (see the comment above the
        // handler) — a swallowed throw here left no server trace to debug a prod 500.
        logger.error('[Provider Application Detail] failed to load', {
            message: error?.message,
            stack: error?.stack,
        });
        return res.status(500).json({
            success: false,
            error: 'Failed to load application details',
        });
    }
});

async function filingScopeOf(application) {
    const areaTypeLabel = AREA_TYPE_LABEL_TH[application.areaType];
    return {
        plantName: await filingPlantName(application.formData, { client: ownerGatePrisma }),
        cultivationTypes: areaTypeLabel ? [areaTypeLabel] : [],
        province: readFilingSite(asObject(application.formData)).province || null,
    };
}

/**
 * The holder record as staff read it (order 142): whom the certificate is for, whether the
 * identity is verified (an individual typed in after a password registration reads
 * "ยังไม่ยืนยันตัวตน"), and national IDs masked. The dispatcher and the field inspector get
 * no contact lines, the same rule as the applicant's own contact (orders 29, 56(3)).
 */
function staffHolderView(entity, contactWithheld) {
    const holder = presentHolder(entity);
    if (!holder) { return null; }
    const { lockedFields: _locked, ...view } = holder;
    return contactWithheld ? { ...view, contact: null } : view;
}

/**
 * The stages in which each role may read the person on site: the dispatcher while it books or moves
 * the visit (a second visit only where the inspector asked for one: its visibility), the field
 * inspector assigned to the visit through the corrective-action loop (orders 29 and 56(3)).
 */
const SITE_CONTACT_STAGES = Object.freeze({
    [CANONICAL_ROLES.DISPATCHER]: Object.freeze(['AUDIT_FEE_PAID', 'AUDIT_CONFIRMED', 'CAR_REVIEWING']),
    [CANONICAL_ROLES.FIELD_INSPECTOR]: Object.freeze(['AUDIT_CONFIRMED', 'CAR_PENDING', 'CAR_REVIEWING']),
});

const DOCUMENT_SLOT_READERS = new Set([CANONICAL_ROLES.FIELD_INSPECTOR, CANONICAL_ROLES.SYSTEM_ADMIN_DTAM]);

/**
 * GET /api/provider/applications/:id/documents
 * The filed papers by requirement slot, for the field inspector of the application (the
 * document reviewer reads them through its own door, /document-check, where it also writes
 * verdicts). Visibility decides what the inspector may open: a file not assigned to the
 * caller is 404, as on every per-application read (F-A8b-05).
 */
router.get('/:id/documents', authenticateProvider, async (req, res) => {
    const role = normalizeRole(req.user?.canonicalRole || req.user?.role);
    if (!DOCUMENT_SLOT_READERS.has(role)) {
        const row = lookupErrorCode('DOCUMENT_SLOTS_ROLE_FORBIDDEN');
        return res.status(row.httpStatus).json({ success: false, code: row.code, error: row.messageTh });
    }
    try {
        const idOrNumber = String(req.params.id || '').trim();
        const application = await applicationService.findProviderApplicationDetail({
            where: withVisibility({ OR: [{ id: idOrNumber }, { applicationNumber: idOrNumber }], isDeleted: false }, req.user),
            select: {
                id: true, applicationNumber: true, organizationId: true, status: true, formData: true,
                entityId: true, entity: { select: { type: true } },
            },
        });
        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }
        const slots = await loadDocumentSlots({ prisma: ownerGatePrisma, application });
        return res.json({ success: true, data: { applicationId: application.id, slots } });
    } catch (error) {
        return respondError(res, req, error, {
            label: '[provider/applications/:id/documents]',
            message: 'Failed to load the filed documents',
        });
    }
});

/**
 * GET /api/provider/applications/:id/site-contact
 * The name and phone of the person on site, the only contact the dispatcher and the field inspector
 * read. Every view writes an audit row in the application's organization; a view that cannot be
 * logged shows nothing.
 */
router.get('/:id/site-contact', authenticateProvider, async (req, res) => {
    const role = normalizeRole(req.user?.canonicalRole || req.user?.role);
    const stages = SITE_CONTACT_STAGES[role];
    if (!stages) {
        const row = lookupErrorCode('SITE_CONTACT_ROLE_FORBIDDEN');
        return res.status(row.httpStatus).json({ success: false, code: row.code, error: row.messageTh });
    }
    try {
        const idOrNumber = String(req.params.id || '').trim();
        const application = await applicationService.findProviderApplicationDetail({
            where: withVisibility({
                OR: [{ id: idOrNumber }, { applicationNumber: idOrNumber }],
                isDeleted: false,
                status: { in: [...stages] },
            }, req.user),
            select: { id: true, applicationNumber: true, organizationId: true, formData: true },
        });
        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }
        const contact = siteContactOf(application.formData);
        const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../../middleware/audit-logger');
        const { getRequestIp } = require('../../../utils/client-ip');
        const logged = await auditLogger.log({
            category: AuditCategory.DATA_ACCESS,
            action: 'SITE_CONTACT_VIEWED',
            severity: AuditSeverity.INFO,
            actorId: req.user.id,
            actorRole: role,
            actorType: 'PROVIDER',
            resourceType: ResourceType.APPLICATION,
            resourceId: application.id,
            organizationId: application.organizationId,
            ipAddress: getRequestIp(req),
            userAgent: req.get('user-agent'),
            metadata: {
                applicationNumber: application.applicationNumber,
                nameGiven: Boolean(contact.siteContactName),
                phoneGiven: Boolean(contact.sitePhone),
            },
        });
        if (!logged) {
            const row = lookupErrorCode('SITE_CONTACT_VIEW_NOT_LOGGED');
            return res.status(row.httpStatus).json({ success: false, code: row.code, error: row.messageTh });
        }
        // A view is logged once; no browser or proxy keeps a copy to show again unlogged.
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, data: { applicationNumber: application.applicationNumber, ...contact } });
    } catch (error) {
        return respondError(res, req, error, {
            label: '[provider/applications] site-contact',
            message: 'Failed to load the site contact',
        });
    }
});

const { requireVisibleApplication } = require('../../../middleware/require-visible-application');

// Writes are gated to the assigned reviewer/auditor or admin (requireApplicationOwner).
const sowController = require('../../../controllers/sow-controller');
router.get('/:applicationId/sow', authenticateProvider, requireVisibleApplication, sowController.listByApplication);
router.post('/:applicationId/sow', authenticateProvider, requireApplicationOwner, sowController.create);

const auditChecklistController = require('../../../controllers/audit-checklist-controller');
router.get('/:applicationId/checklist', authenticateProvider, requireVisibleApplication, auditChecklistController.getByApplication);
router.post('/:applicationId/checklist', authenticateProvider, requireApplicationOwner, auditChecklistController.create);

// ADR-016 Phase 2 — work activities for an application (read-only timeline).
router.get('/:applicationId/activities', authenticateProvider, requireVisibleApplication, async (req, res) => {
    try {
        const rows = await applicationService.listWorkActivitiesForApplication(req.params.applicationId);
        const data = rows.map((r) => ({
            id: r.id,
            workType: r.workType,
            candidateGroup: r.candidateGroup,
            state: r.state,
            triggeredAtStage: r.triggeredAtStage,
            assignedUserId: r.assignedUserId,
            assignedUserName:
                [r.assignedUser?.firstName, r.assignedUser?.lastName].filter(Boolean).join(' ').trim() || null,
            completedByName:
                [r.completer?.firstName, r.completer?.lastName].filter(Boolean).join(' ').trim() || null,
            dueAt: r.dueAt,
            warningAt: r.warningAt,
            createdAt: r.createdAt,
            claimedAt: r.claimedAt,
            startedAt: r.startedAt,
            completedAt: r.completedAt,
            cancelledAt: r.cancelledAt,
            cancelReason: r.cancelReason,
            note: r.note,
            isOverdue:
                r.dueAt && new Date(r.dueAt) < new Date() && !['DONE', 'CANCELLED'].includes(r.state),
        }));
        return res.json({ success: true, data });
    } catch (error) {
        return respondError(res, req, error, {
            label: '[provider/applications] activities',
            message: 'Failed to load activities',
        });
    }
});

module.exports = router;
