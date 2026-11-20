const { holderReadWhere, resolveHolderOwnerOrCreator } = require('../holder-access');
const { ENTITY_PERMISSION_DENIED_EN } = require('../../shared/entity-permission-denied');

/**
 * The holder fragment for an applicant-side Application read (spec
 * 2026-09-30 §3.1), or null when the caller passed no scope. A null means
 * "not a health caller": health-only reads then fail closed without a query,
 * and the shared by-id read keeps its staff where. Only an object with a
 * readIds array counts as a scope, so a leftover positional filer id
 * (healthId / userId string) can never widen a read.
 * @param {{ holderScope?: { userId: string, readIds: string[] } }} [options]
 * @returns {object|null}
 */
// Every applicant read below carries the holder fragment alone (R2 Task 12
// removed the R1 filer pins). What the caller may DO with a row it can read is
// decided by the submit guard, the capability gates and §3.3 (deleteDraft).
function applicationHolderWhere(options) {
    const scope = options && typeof options === 'object' ? options.holderScope : null;
    if (!scope || typeof scope !== 'object' || !Array.isArray(scope.readIds)) {
        return null;
    }
    return holderReadWhere(scope, 'Application');
}

function createApplicationDraftQueryMethods({ prisma }) {
    return {
        /**
         * Get Current Draft for health account — the latest DRAFT within the
         * caller's holders (spec 2026-09-30 §3.1). `identityRef` is kept for the
         * call shape; the scope is `options.holderScope`.
         * @param {string} identityRef
         * @param {{ holderScope?: object }} [options]
         */
        async getDraft(identityRef, options = {}) {
            const holderWhere = applicationHolderWhere(options);
            if (!holderWhere) {
                return null;
            }

            // R2 Task 9: the fragment alone (buildHealthWhereClause is deleted).
            return prisma.application.findFirst({
                where: {
                    ...holderWhere,
                    status: 'DRAFT',
                    isDeleted: false,
                },
                orderBy: { createdAt: 'desc' },
            });
        },

        /**
         * Soft-delete a draft by id (spec 2026-09-30 §3.3, R2 Task 9).
         *
         * The draft is read within the caller's holder scope (a draft the caller
         * cannot see → null, nothing written). Deleting is destructive-grade: only
         * the draft's creator (`submitterId`) with an ACTIVE non-VIEWER membership
         * on its holder, or the holder's ACTIVE OWNER, may delete it
         * (resolveHolderOwnerOrCreator, the rule farm delete already applies).
         * Anyone else who can see it → 403 ENTITY_PERMISSION_DENIED, nothing written.
         * This replaces the strict filer pin (`strictApplicantPin`), which let a
         * holder OWNER delete nothing of a co-member's and let a filer delete a
         * draft after losing the holder.
         * @param {string} identityRef — kept for the call shape
         * @param {string} draftId
         * @param {{ holderScope?: object }} [options]
         * @returns {Promise<{ id: string }|null>}
         * @throws {Error} 403 ENTITY_PERMISSION_DENIED
         */
        async deleteDraft(identityRef, draftId, options = {}) {
            const normalizedDraftId = String(draftId || '').trim();
            if (!normalizedDraftId) {
                return null;
            }

            const holderWhere = applicationHolderWhere(options);
            if (!holderWhere) {
                return null;
            }

            const existingDraft = await prisma.application.findFirst({
                where: {
                    ...holderWhere,
                    id: normalizedDraftId,
                    status: 'DRAFT',
                    isDeleted: false,
                },
                select: { id: true, entityId: true, submitterId: true },
            });

            if (!existingDraft) {
                return null;
            }

            if (!(await resolveHolderOwnerOrCreator(existingDraft, options.holderScope.userId))) {
                // Only the draft creator or the holder OWNER may delete it (spec §3.3).
                const err = new Error(ENTITY_PERMISSION_DENIED_EN);
                err.statusCode = 403;
                err.code = 'ENTITY_PERMISSION_DENIED';
                throw err;
            }

            return prisma.application.update({
                where: { id: existingDraft.id },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                },
                select: { id: true },
            });
        },

        /**
         * Get All Applications for health account — every filing whose holder
         * is in the caller's scope (spec 2026-09-30 §3.1). `identityRef` is kept
         * for the call shape; the scope is `options.holderScope`.
         * @param {string} identityRef
         * @param {{ holderScope?: object, take?: number }} [options]
         */
        async getHealthApplications(identityRef, options = {}) {
            const holderWhere = applicationHolderWhere(options);
            if (!holderWhere) {
                return [];
            }

            const take = Number.isFinite(options.take) && Number(options.take) > 0
                ? Number(options.take)
                : undefined;

            return prisma.application.findMany({
                where: {
                    ...holderWhere, // R2 Task 9: the fragment alone (buildHealthWhereClause is deleted)
                    isDeleted: false,
                },
                orderBy: { createdAt: 'desc' },
                ...(take ? { take } : {}),
                include: {
                    certificates: {
                        where: {
                            isDeleted: false,
                            status: { in: ['active', 'ACTIVE'] },
                        },
                        select: {
                            id: true,
                        },
                        take: 1,
                    },
                },
            });
        },

        // Backward-compatible alias (to be removed after full migration)
        async getHealthUserApplications(identityRef, options = {}) {
            return this.getHealthApplications(identityRef, options);
        },

        /**
         * Get Application by ID. A health caller passes `options.holderScope`
         * and reads findFirst({ where: { id, ...fragment } }) (spec 2026-09-30
         * §3.1); a staff caller passes nothing and keeps where { id }.
         *
         * Note: application-service.js assembles the provider-query methods
         * after these, so the service's public `getById` is the provider one
         * (application-provider-query-methods.js); this one is reached only
         * through the factory.
         * @param {string} id
         * @param {string} [identityRef]
         * @param {{ holderScope?: object }} [options]
         */
        async getById(id, identityRef, options = {}) {
            const holderWhere = applicationHolderWhere(options);
            // R2 Task 9: the fragment alone (buildHealthWhereClause is deleted).
            const where = holderWhere ? { id, ...holderWhere } : { id };

            return prisma.application.findFirst({
                where,
                include: {
                    applicant: {
                        select: {
                            id: true,
                            healthId: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            phoneNumber: true,
                            province: true,
                        },
                    },
                },
            });
        },

        /**
         * Lean lookup for the payments flow. Returns just `{ id, status }` when
         * the application's holder is in the caller's scope and it is not
         * soft-deleted, otherwise null (no scope → null, no query). We
         * deliberately do NOT return applicant fields here — route-level callers
         * (notably finance/payments.js) only need the status to decide which
         * phase invoice to create, and shrinking the result surface keeps PII
         * from accidentally being logged or echoed back.
         * @param {string} applicationId
         * @param {{ holderScope?: object }} [options]
         */
        async findForPaymentOwnership(applicationId, options = {}) {
            const holderWhere = applicationHolderWhere(options);
            if (!applicationId || !holderWhere) {return null;}
            return prisma.application.findFirst({
                where: {
                    id: applicationId,
                    ...holderWhere,
                    isDeleted: false,
                },
                select: { id: true, status: true },
            });
        },

        /**
         * Applicant-side by-id lookup with the full record (formData, workflow
         * history), used by the revision, CAR and quotation doors. It carries the
         * holder fragment alone (spec 2026-09-30 §3.1): any ACTIVE member of the
         * holder reads it, and what the caller may DO with the row stays with the
         * submit guard (revision PUT, CAR) or the doors' own gates. No scope → null.
         * @param {string} applicationId
         * @param {{ holderScope?: object }} [options]
         */
        async findOwnedApplicationForApplicant(applicationId, options = {}) {
            const holderWhere = applicationHolderWhere(options);
            if (!applicationId || !holderWhere) {return null;}
            return prisma.application.findFirst({
                where: {
                    id: applicationId,
                    ...holderWhere,
                },
            });
        },
    };
}

module.exports = { createApplicationDraftQueryMethods, applicationHolderWhere };
