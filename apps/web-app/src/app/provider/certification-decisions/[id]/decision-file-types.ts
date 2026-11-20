/**
 * The payload of GET /api/provider/auditor/applications/:id/decision-file
 * (apps/backend/services/certification-decision-file-service.js). Read only.
 */

import type { RevisionRound } from '@/components/feature/revision-history';

/** One entry of a fixed reason list served by the backend (shared/certification-decision-reasons.js). */
export interface ReasonOption {
    code: string;
    label: string;
}

export interface DecisionFileDocument {
    slotId: string;
    labelTH: string;
    required: boolean;
    satisfied: boolean;
    fileUrl: string | null;
    fileName: string | null;
    verdict: string | null;
    reviewReason: string | null;
}

export interface DecisionFileChecklistItem {
    itemCode: string;
    section: string;
    prompt: string;
    isCritical: boolean;
    response: string | null;
    notes: string | null;
}

export interface DecisionFilePhoto {
    photoId: string;
    uploadedBy: string | null;
    uploadedAt: string | null;
    capturedAt: string | null;
    fileHash: string;
    gps: { latitude: number | null; longitude: number | null };
    place: { status: string; distanceMeters: number | null; toleranceMeters: number; beyondTolerance: boolean | null };
    time: { capturedAtSource: string; windowSource: string; status: string; offsetSeconds: number | null };
    appearance: { perceptualHash: string | null; algorithm: string | null };
    flags: string[];
    caption: string | null;
    fileUrl: string | null;
    fileName: string | null;
}

export interface DecisionFileGps {
    checkIn: { latitude: number; longitude: number; accuracy: number | null; at: string } | null;
    withinTolerance?: boolean;
    distanceMeters?: number | null;
    farmLatitude?: number | null;
    farmLongitude?: number | null;
    toleranceMeters?: number;
    unknownFarmLocation?: boolean;
}

export interface DecisionFileEvidenceGate {
    sufficient: boolean;
    photoCount?: number;
    itemCount?: number;
    code?: string;
    messageTh?: string;
}

export interface DecisionFileCarDecision {
    decision: string;
    notes: string | null;
    reasonCode: string | null;
    decidedAt: string | null;
    findings: DecisionFileFinding[];
}

export type DecisionAction = 'APPROVE' | 'REFUSE' | 'RETURN' | 'REQUEST_CORRECTION';

export interface DecisionFileFinding {
    nonConformity: string;
    correctiveAction: string;
    category: string | null;
}

export interface DecisionFile {
    application: {
        id: string;
        applicationNumber: string;
        status: string;
        applicantName: string;
        submittedAt: string | null;
        updatedAt: string | null;
        scheduledDate: string | null;
        farmName: string | null;
        farmAddress: string;
        farmLatitude: number | null;
        farmLongitude: number | null;
        holder: { name: string | null; typeLabel: string | null } | null;
        scope: { cultivationTypes: string[]; plantName: string | null };
        purposes: string[];
    };
    /** true while the file waits in the queue; a decided file is read only */
    decidable: boolean;
    /** the decisions this file offers, one button each; empty once decided */
    actions: DecisionAction[];
    refusalHold?: { code: string; message: string } | null;
    decision: {
        outcome: 'APPROVED' | 'REFUSED' | 'RETURNED' | 'CORRECTION_REQUESTED';
        decidedAt: string | null;
        reasonLabel: string | null;
        consideration?: string | null;
    } | null;
    refusalReasons: ReasonOption[];
    documents: DecisionFileDocument[];
    /** Every document round the reviewer sent back, oldest first. */
    revisionHistory?: RevisionRound[];
    onsite: {
        audit: { id: string } | null;
        checklist: DecisionFileChecklistItem[];
        photos: DecisionFilePhoto[];
        nearDuplicatePairs: Array<{ photoIds: string[]; distanceBits: number; sameFileHash: boolean; algorithm: string }>;
        notRecorded: { place: number; time: number; appearance: number } | null;
        needsAttention: number;
        toleranceMeters?: number;
        gps: DecisionFileGps;
        evidenceGate: DecisionFileEvidenceGate;
    };
    inspectorSummary: {
        inspectorName: string | null;
        decision: string | null;
        notes: string | null;
        reasonCode: string | null;
        decidedAt: string | null;
        findings: DecisionFileFinding[];
    };
    carHistory: {
        rounds: Array<{ roundNo: number; decidedAt: string | null; dueAt: string | null }>;
        decisions: DecisionFileCarDecision[];
        applicantDocuments: Array<{ name: string | null; path: string | null; uploadedAt: string | null }>;
    };
    /** The field inspector was moved during a correction for conflict of interest (order 65(1)). */
    impartialityFlags?: Array<{ reasonCode: string; label: string; recordedAt: string | null }>;
    /** Every earlier send-back by an approver, oldest first (F-A8b-08). */
    approverReturns?: DecisionFileApproverReturn[];
}

export interface DecisionFileApproverReturn {
    returnedAt: string | null;
    returnedBy: { id: string | null; name: string | null };
    reason: string | null;
}
