'use strict';

/**
 * ส่งกลับให้เจ้าหน้าที่ตรวจ: a revision answer replaces every paper the officer asked for in the
 * current round, whichever door files it. A round that asked for answers and no paper has nothing
 * to replace.
 *
 * @module services/application-service/requested-papers
 */

const { holderReadWhere } = require('../holder-access');
const { documentTypesOfSlot } = require('../application-document-sync');
const { assertRevisionSlotsRefreshed, nextRound, REVISION_INCOMPLETE } = require('../application-document-review-service');

/**
 * ApplicationDocument stores the slot twice (`slotId` and the derived `documentType`), and rows
 * written before `slotId` existed carry only the type: both spellings, one application.
 */
function buildRequestedSlotDocumentFilter(applicationId, slotIds) {
    const slots = Array.from(new Set((slotIds || []).filter(Boolean).map(String)));
    const types = Array.from(new Set(slots.flatMap((slotId) => documentTypesOfSlot(slotId))));
    return {
        applicationId,
        OR: [
            { slotId: { in: slots } },
            { documentType: { in: types } },
        ],
    };
}

/**
 * The refusal every door answers when a requested paper was not replaced since the request, or
 * null when every requested paper was, or none was requested.
 * @returns {Promise<{ httpStatus: number, body: object } | null>}
 */
async function refusalForPapersNotReplaced({ prisma, application, holderScope }) {
    const reviews = await prisma.applicationDocumentReview.findMany({
        where: { applicationId: application.id },
        orderBy: { createdAt: 'asc' },
    });
    const round = nextRound(reviews);
    const requestedRows = reviews.filter((r) => r.round === round && r.verdict === 'MORE_REQUESTED');
    if (requestedRows.length === 0) { return null; }

    const documents = await prisma.applicationDocument.findMany({
        where: {
            ...holderReadWhere(holderScope, 'ApplicationDocument'),
            AND: [buildRequestedSlotDocumentFilter(application.id, requestedRows.map((r) => r.slotId))],
        },
        select: { slotId: true, documentType: true, createdAt: true },
    });
    // Named in the review rows' vocabulary, whichever spelling the row carries.
    const canonicalSlotOf = (doc) => (doc.slotId
        || requestedRows.find((r) => documentTypesOfSlot(r.slotId).includes(doc.documentType))?.slotId
        || doc.documentType);
    try {
        assertRevisionSlotsRefreshed(
            requestedRows.map((r) => ({ slotId: r.slotId, createdAt: r.createdAt })),
            documents.map((d) => ({ slotId: canonicalSlotOf(d), uploadedAt: d.createdAt })),
        );
        return null;
    } catch (error) {
        if (!error || error.code !== REVISION_INCOMPLETE) { throw error; }
        return {
            httpStatus: 409,
            body: {
                success: false,
                error: REVISION_INCOMPLETE,
                code: REVISION_INCOMPLETE,
                message: error.message,
                messageTh: error.messageTh,
                slotIds: error.slotIds,
            },
        };
    }
}

module.exports = { buildRequestedSlotDocumentFilter, refusalForPapersNotReplaced };
