'use strict';

/**
 * A new on-site correction round is written in one place, in the decision's transaction: the
 * status with its due date, the correction letter, and the RevisionDeadline row the hourly checker
 * closes the application on. A letter or a deadline that cannot be written fails the decision (D-8);
 * before, the doors seeded the deadline after their commit, and a failure there left CAR_PENDING
 * with no clock.
 */

const { writeApplicationStatus } = require('./application-status-writer');
const { computeCarDueDate } = require('./car-deadline-service');

const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function findingLines(findings) {
    return asArray(findings)
        .map((finding) => [finding?.nonConformity, finding?.correctiveAction].map((part) => String(part || '').trim()).filter(Boolean).join(' แนวทางแก้ไข: '))
        .filter(Boolean);
}

/**
 * @param {object} tx the caller's transaction
 * @param {object} args
 * @param {{ id: string, applicationNumber: string, healthId: string }} args.application
 * @param {string} args.fromStatus the status the caller decided on
 * @param {string} args.actorId
 * @param {string} args.actorRole
 * @param {string} args.reason the transition's reason code
 * @param {object} [args.additionalData] the caller's own columns, formData and history for this write
 * @param {Array<{nonConformity: string, correctiveAction: string}>} [args.findings] what the letter lists
 * @param {string|null} [args.note] the decision's own words, listed when no finding is
 * @param {string|null} [args.instruction] the decider's instruction to the applicant, printed beside the findings
 * @param {Function} [args.onAudit] the caller's in-transaction audit hook
 * @param {Date} [args.at] the decision time the window counts from
 * @returns {Promise<{ application: object, carDueAt: Date }>}
 */
async function requestOnsiteCorrection(tx, {
    application, fromStatus, actorId, actorRole, reason, additionalData = {}, findings = [], note = null, instruction = null, onAudit, at = new Date(),
}) {
    const carDueAt = computeCarDueDate(at);
    const requestedAt = at.toISOString();
    const dueAt = carDueAt.toISOString();
    const message = String(note || '').trim() || null;
    const written = await writeApplicationStatus({
        prisma: tx,
        applicationId: application.id,
        fromStatus,
        toStatus: 'CAR_PENDING',
        actorId,
        actorRole,
        reason,
        assertTransition: true,
        ...(onAudit ? { onAudit } : {}),
        additionalData: {
            ...additionalData,
            formData: {
                ...asObject(additionalData.formData),
                carRequestedAt: requestedAt,
                car_requested_at: requestedAt,
                carDueAt: dueAt,
                car_due_at: dueAt,
                carRequest: {
                    message, requestedAt, dueAt, requestedBy: actorId, requestedByRole: actorRole || null,
                    items: asArray(findings).map((finding) => ({
                        nonConformity: String(finding?.nonConformity || '').trim(),
                        correctiveAction: String(finding?.correctiveAction || '').trim(),
                    })),
                },
                carStagedFiles: [],
            },
        },
    });

    const { mintCorrectionLetter, CORRECTION_LETTER_STAGE } = require('./decision-letter-service');
    await mintCorrectionLetter({
        tx,
        healthId: application.healthId,
        applicationId: application.id,
        applicationNumber: application.applicationNumber,
        stage: CORRECTION_LETTER_STAGE.FIELD_AUDIT_CAR,
        items: findingLines(findings),
        message,
        instruction,
        dueAt: carDueAt,
    });

    await tx.revisionDeadline.upsert({
        where: { applicationId: application.id },
        update: { revisionDue: carDueAt, status: 'PENDING', revisionCount: { increment: 1 }, updatedBy: actorId || null },
        create: {
            applicationId: application.id, organizationId: written.organizationId, revisionDue: carDueAt,
            status: 'PENDING', revisionCount: 1, createdBy: actorId || null,
        },
    });

    return { application: written, carDueAt };
}

/**
 * After the commit, tell the applicant and the holder (order 32) what to correct. Best effort: the
 * round is committed and its letter is the order.
 */
async function tellPartiesOfCorrection({ applicationId, applicationNumber, decision, findings, note = null, logger }) {
    const { fanoutToApplicationParties } = require('./notification/application-parties');
    try {
        await fanoutToApplicationParties(applicationId, {
            type: 'AUDIT_RESULT_CAR',
            payload: { applicationNumber, decision, summary: note || '', criticalFindings: findingLines(findings) },
        });
    } catch (error) {
        logger?.warn?.('[onsite-correction] party notice failed (non-fatal)', { message: error.message });
    }
}

module.exports = { requestOnsiteCorrection, tellPartiesOfCorrection, findingLines };
