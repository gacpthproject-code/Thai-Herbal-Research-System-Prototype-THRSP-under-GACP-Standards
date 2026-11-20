'use strict';

const { resolveApplicationRequirements } = require('./application-requirements-service');

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * The filing's document slots as the requirement engine owes them, each with the
 * current file behind it. One list for every officer who reads the filed papers
 * (the decision file and the field inspector's job sheet), so no screen can show
 * "ไม่มีเอกสาร" for a paper the applicant filed (F-A8b-05).
 *
 * @returns {Promise<Array<{ slotId: string, labelTH: string, required: boolean, satisfied: boolean, fileUrl: string|null, fileName: string|null }>>}
 */
async function loadDocumentSlots({ prisma, application }) {
    const rows = await prisma.applicationDocument.findMany({
        where: { applicationId: application.id },
        select: {
            documentType: true, fileUrl: true, fileName: true,
            createdAt: true, currentForSlot: true, supersededAt: true,
        },
    });
    const requirements = await resolveApplicationRequirements(application, rows);
    return arr(requirements?.slots).map((slot) => ({
        slotId: slot.slotId,
        labelTH: slot.labelTH || slot.slotId,
        required: Boolean(slot.required),
        satisfied: Boolean(slot.satisfied),
        fileUrl: slot.fileUrl || null,
        fileName: slot.fileName || null,
    }));
}

module.exports = { loadDocumentSlots };
