/** One slot of GET /api/provider/applications/:id/documents (services/application-document-slots.js). */
export interface ApplicationDocumentSlot {
    slotId: string;
    labelTH: string;
    required: boolean;
    satisfied: boolean;
    fileUrl: string | null;
    fileName: string | null;
}

export interface JobSheetAttachment {
    key: string;
    label: string;
    url: string | null;
}

/** The job sheet's attachment rows, one per requirement slot (F-A8b-05). */
export function attachmentsOfSlots(slots: readonly ApplicationDocumentSlot[]): JobSheetAttachment[] {
    return slots.map((slot) => ({ key: slot.slotId, label: slot.labelTH, url: slot.fileUrl }));
}
