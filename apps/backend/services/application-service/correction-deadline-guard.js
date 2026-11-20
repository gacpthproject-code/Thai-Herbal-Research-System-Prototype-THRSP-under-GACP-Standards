'use strict';

/**
 * The deadline a correction waits on, read on the clock of the state the applicant answers from:
 * a document revision (REVISION_REQUESTED, order 28) on the revision clock, the evidence of a
 * defect found on site (CAR_PENDING, order 56(2a)) on the CAR clock. Every filing door asks this
 * one reader, so a clock an earlier round left on the filing cannot judge a later state.
 *
 * Past the deadline, the deadline closes the filing, not the applicant whose late filing found
 * it: the system is the actor, as it is when the sweep or the hourly cron closes the same filing.
 *
 * @module services/application-service/correction-deadline-guard
 */

const { writeApplicationStatus } = require('../application-status-writer');
const { buildWorkflowEvent } = require('../../shared/workflow-event-builder');
const { correctionDueAtOf } = require('../correction-windows');
const { lookup } = require('../../shared/error-codes');

const OPEN_DEADLINE_ROW = Object.freeze(['PENDING', 'EXTENDED']);

const EXPIRY_BY_STATE = Object.freeze({
    REVISION_REQUESTED: Object.freeze({
        code: 'REVISION_DEADLINE_EXCEEDED',
        action: 'REVISION_DEADLINE_EXPIRED',
        actorId: 'system:revision-deadline',
        marks: (ts) => ({ expiredAt: ts, expiredReason: 'REVISION_OVERDUE' }),
    }),
    CAR_PENDING: Object.freeze({
        code: 'CAR_DEADLINE_EXCEEDED',
        action: 'CAR_DEADLINE_EXPIRED',
        actorId: 'system:car-deadline',
        marks: (ts) => ({ canceledExpiredAt: ts, cancelReason: 'CAR_OVERDUE', carOverdueDetectedOnSubmitAt: ts }),
    }),
});

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

async function resolveCorrectionDueAt(application, prisma, state = String(application.status || '').toUpperCase()) {
    const stamped = correctionDueAtOf(state, application.formData);
    if (stamped) { return stamped; }
    const row = await prisma.revisionDeadline.findUnique({
        where: { applicationId: application.id },
        select: { revisionDue: true, status: true },
    });
    if (!row || !OPEN_DEADLINE_ROW.includes(row.status) || !row.revisionDue) { return null; }
    const due = new Date(row.revisionDue);
    return Number.isFinite(due.getTime()) ? due : null;
}

/**
 * Refuse a correction filed after its deadline. Within the deadline, or with none set, nothing is
 * written. Past it, the filing is EXPIRED and the refusal every door answers is returned.
 *
 * @param {object} application the row (id, status, formData, workflowHistory)
 * @param {{ prisma: object, fromStatus?: string }} opts the client that opens the expiry transaction, and the
 *   state the applicant answers from when the caller resolved it (workflowState first); defaults to application.status
 * @returns {Promise<{ expired: false, dueAt: Date|null } | { expired: true, dueAt: Date, refusal: { httpStatus: number, body: object } }>}
 */
async function assertCorrectionNotExpired(application, { prisma, fromStatus } = {}) {
    if (!prisma) { throw new TypeError('assertCorrectionNotExpired: prisma required'); }
    if (!application || !application.id) { throw new TypeError('assertCorrectionNotExpired: application with id required'); }
    const status = String(fromStatus || application.status || '').toUpperCase();
    const expiry = EXPIRY_BY_STATE[status];
    if (!expiry) { throw new TypeError(`assertCorrectionNotExpired: ${status || 'no status'} waits on no correction deadline`); }

    const dueAt = await resolveCorrectionDueAt(application, prisma, status);
    const now = new Date();
    if (!(dueAt && now > dueAt)) { return { expired: false, dueAt: dueAt || null }; }

    const ts = now.toISOString();
    await prisma.$transaction(async (tx) => {
        await writeApplicationStatus({
            prisma: tx,
            applicationId: application.id,
            fromStatus: application.status,
            toStatus: 'EXPIRED',
            actorId: expiry.actorId,
            actorRole: 'system',
            reason: expiry.action,
            additionalData: {
                formData: {
                    ...asObject(application.formData),
                    workflowState: 'EXPIRED',
                    workflowStateUpdatedAt: ts,
                    ...expiry.marks(ts),
                },
                workflowHistory: [
                    ...(Array.isArray(application.workflowHistory) ? application.workflowHistory : []),
                    buildWorkflowEvent({
                        action: expiry.action, fromState: status, toState: 'EXPIRED', actorId: expiry.actorId, actorRole: 'system',
                    }),
                ],
            },
        });
        await tx.revisionDeadline.updateMany({
            where: { applicationId: application.id, status: { in: [...OPEN_DEADLINE_ROW] } },
            data: { status: 'FAILED', updatedBy: 'system' },
        });
    });

    const row = lookup(expiry.code);
    return {
        expired: true,
        dueAt,
        refusal: {
            httpStatus: row.httpStatus,
            body: { success: false, error: expiry.code, code: expiry.code, message: row.messageEn, messageTh: row.messageTh },
        },
    };
}

module.exports = { assertCorrectionNotExpired, resolveCorrectionDueAt, EXPIRY_BY_STATE };
