'use strict';

/**
 * The file a certificate approver reads before deciding — READ ONLY.
 *
 * Until now the approver decided on a row: number, name, status, date. The evidence the
 * decision rests on (the filing, the onsite checklist answers, the photographs and where
 * and when they were taken, the inspector's own words, the correction history) sat behind
 * doors the approver is deliberately not given — the inspector's job sheet and the onsite
 * API, whose WRITE routes must stay closed to this role (ISO/IEC 17065 §7.6: the decider
 * is not the evaluator). So the decision was made blind, and the first sign that the
 * evidence was missing was an English 500 at the moment of pressing อนุมัติ.
 *
 * This assembles exactly what the decision needs, and nothing that writes, from the same
 * services the inspector's screens use — it re-derives nothing:
 *   - documents       the requirement engine's slots joined with the officer's verdicts
 *   - onsite.checklist  the canonical template joined with the recorded answers
 *   - onsite.photos   reviewPhotoProvenance (hash, GPS, capture time, near-duplicate flags)
 *   - onsite.gps      the check-in position measured against the farm
 *   - onsite.evidenceGate  the SAME gate generateCertificate will ask, answered now
 *   - inspectorSummary / carHistory   what was written, and every round of correction
 *   - approverReturns                 every earlier send-back by an approver (who, when, why)
 *   - revisionHistory                 every document round the reviewer sent back (what, why, by when)
 *
 * The caller proves the file is the approver's to read (in the decision queue, or decided by
 * an approver) and that the caller is a certificate approver; this module writes nothing.
 */

const { loadDocumentSlots } = require('./application-document-slots');
const { revisionRoundsOf } = require('./application-document-review-service');
const onsite = require('./audit-onsite-service');
const { resolveCurrentOnsiteAuditId } = require('./onsite-audit-resolver');
const { assertOnsiteEvidenceForPass } = require('./onsite-evidence-gate');
const { onsiteEvidenceRefusal } = require('./audit-decision-error-response');
const { readFilingSite } = require('./application-service/application-farm-materialization');
const { filingPlantName } = require('./plant-species-service');
const { HOLDER_WORDS_TH } = require('./application-requirements-service');
const { AREA_TYPE_LABEL_TH } = require('../validation/canonical-application-validator');
const { optionLabel } = require('../shared/certification-purposes');
const {
    CERTIFICATION_REFUSAL_REASONS, reasonOptions, recordedReasonLabel,
} = require('../shared/certification-decision-reasons');
const { impartialityFlagsOf } = require('../shared/dispatcher-reasons');
const { offeredDecisionActions } = require('../shared/certification-decision-actions');
const { appealSetupInForce } = require('../shared/appeal-setup');
const { ERROR_CODES } = require('../shared/error-codes');

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

function composeName(person) {
    const name = `${String(person?.firstName || '')} ${String(person?.lastName || '')}`.trim();
    return name || null;
}

/** Latest-round verdict per slot, from every review row of the application. */
function latestVerdictBySlot(reviews) {
    const bySlot = new Map();
    for (const r of arr(reviews)) {
        const held = bySlot.get(r.slotId);
        if (!held || Number(r.round) >= Number(held.round)) { bySlot.set(r.slotId, r); }
    }
    return bySlot;
}

async function loadDocuments({ prisma, application }) {
    const [slots, reviews] = await Promise.all([
        loadDocumentSlots({ prisma, application }),
        prisma.applicationDocumentReview.findMany({
            where: { applicationId: application.id },
            orderBy: { createdAt: 'asc' },
        }),
    ]);
    const verdicts = latestVerdictBySlot(reviews);
    const labels = new Map(slots.map((s) => [s.slotId, s.labelTH]));
    return {
        documents: slots.map((slot) => {
            const review = verdicts.get(slot.slotId) || null;
            return {
                ...slot,
                verdict: review ? review.verdict : null,
                reviewReason: review ? review.reason || null : null,
            };
        }),
        revisionHistory: revisionRoundsOf(reviews, { labelOf: (id) => labels.get(id) }),
    };
}

/** Every time an approver sent this file back to its field inspector, oldest first (F-A8b-08). */
async function loadApproverReturns({ prisma, application }) {
    const events = arr(application.workflowHistory).filter((e) => e && e.reasonCode === 'AUDITOR_REJECTED');
    if (events.length === 0) { return []; }
    const actorIds = [...new Set(events.map((e) => e.actorId).filter(Boolean))];
    const people = actorIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
        : [];
    const nameOf = new Map(people.map((p) => [p.id, composeName(p)]));
    return events
        .map((e) => ({
            returnedAt: e.timestamp || null,
            returnedBy: { id: e.actorId || null, name: nameOf.get(e.actorId) || null },
            reason: e.comment || null,
        }))
        .sort((a, b) => Date.parse(a.returnedAt || 0) - Date.parse(b.returnedAt || 0));
}

/** The audit this file's evidence rests on: the pin the decision stamped, else the current one. */
async function resolveAuditId({ prisma, application }) {
    const pin = obj(application.formData).onsiteAuditId;
    if (pin) {
        const live = await prisma.auditChecklist.findFirst({
            where: { id: pin, isDeleted: false, applicationId: application.id },
            select: { id: true },
        });
        if (live) { return live.id; }
    }
    return resolveCurrentOnsiteAuditId(prisma, application.id);
}

async function loadChecklist({ prisma, auditId }) {
    const answers = await prisma.farmAuditChecklistItem.findMany({
        where: { auditId },
        orderBy: { recordedAt: 'asc' },
    });
    const byCode = new Map(arr(answers).map((a) => [a.itemCode, a]));
    return onsite.CHECKLIST_TEMPLATE_2026.map((item) => {
        const a = byCode.get(item.itemCode) || null;
        return {
            itemCode: item.itemCode,
            section: item.section,
            prompt: item.prompt,
            isCritical: item.isCritical === true,
            response: a ? a.response : null,
            notes: a ? a.notes || null : null,
        };
    });
}

async function loadPhotos({ prisma, auditId }) {
    const review = await onsite.reviewPhotoProvenance({ auditId, prisma });
    const stored = await prisma.farmAuditPhoto.findMany({
        where: { auditId },
        select: { id: true, attachmentId: true, caption: true },
    });
    const byPhoto = new Map(arr(stored).map((p) => [p.id, p]));
    const attachmentIds = arr(stored).map((p) => p.attachmentId).filter(Boolean);
    const attachments = attachmentIds.length
        ? await prisma.attachment.findMany({
            where: { id: { in: attachmentIds }, isDeleted: false },
            select: { id: true, fileUrl: true, fileName: true },
        })
        : [];
    const urlByAttachment = new Map(arr(attachments).map((a) => [a.id, a]));
    return {
        photos: review.photos.map((p) => {
            const row = byPhoto.get(p.photoId) || {};
            const att = urlByAttachment.get(row.attachmentId) || null;
            return { ...p, caption: row.caption || null, fileUrl: att ? att.fileUrl : null, fileName: att ? att.fileName : null };
        }),
        nearDuplicatePairs: review.nearDuplicatePairs,
        notRecorded: review.notRecorded,
        needsAttention: review.needsAttention,
        toleranceMeters: review.toleranceMeters,
    };
}

/** The check-in position, measured against the farm — null check-in means nobody recorded one. */
async function loadGps({ prisma, auditId }) {
    if (typeof prisma.gpsVerificationLog?.findFirst !== 'function') { return { checkIn: null }; }
    const start = await prisma.gpsVerificationLog.findFirst({
        where: { entityType: 'AUDIT_INSPECTION_START', entityId: auditId },
        orderBy: { verifiedAt: 'asc' },
    });
    if (!start) { return { checkIn: null }; }
    const verdict = await onsite.verifyGpsAgainstFarm({
        auditId, gpsLat: start.reportedLatitude, gpsLng: start.reportedLongitude, prisma,
    });
    return {
        checkIn: {
            latitude: start.reportedLatitude,
            longitude: start.reportedLongitude,
            accuracy: start.gpsAccuracy ?? null,
            at: start.verifiedAt,
        },
        ...verdict,
    };
}

/** Would generateCertificate accept this evidence? Answered now, so the approver is not the first to find out. */
async function loadEvidenceGate({ prisma, application }) {
    try {
        const out = await assertOnsiteEvidenceForPass({ prisma, application });
        return { sufficient: true, photoCount: out.photoCount, itemCount: out.itemCount };
    } catch (error) {
        const refusal = onsiteEvidenceRefusal(error);
        if (!refusal) { throw error; }
        return { sufficient: false, code: refusal.body.code, messageTh: refusal.body.messageTh };
    }
}

function buildInspectorSummary(application, auditSubmittedAt) {
    const formData = obj(application.formData);
    const decision = obj(formData.auditDecision);
    return {
        inspectorName: composeName(application.auditor),
        decision: decision.decision || application.auditResult || formData.auditResult || null,
        notes: decision.notes || application.auditNotes || formData.auditNotes || null,
        reasonCode: decision.reasonCode || null,
        decidedAt: decision.decidedAt || auditSubmittedAt || formData.auditedAt || null,
        findings: arr(decision.findings).map((f) => ({
            nonConformity: f.nonConformity || '',
            correctiveAction: f.correctiveAction || '',
            category: f.category || null,
        })),
    };
}

async function loadCarHistory({ prisma, application }) {
    const formData = obj(application.formData);
    const rounds = await prisma.correctionRound.findMany({
        where: { applicationId: application.id, stage: 'FIELD_AUDIT' },
        orderBy: { roundNo: 'asc' },
    });
    return {
        rounds: arr(rounds).map((r) => ({ roundNo: r.roundNo, decidedAt: r.decidedAt, dueAt: r.dueAt })),
        decisions: arr(formData.auditDecisions)
            .filter((d) => d && d.decision && d.decision !== 'PASS')
            .map((d) => ({
                decision: d.decision,
                notes: d.notes || null,
                reasonCode: d.reasonCode || null,
                decidedAt: d.decidedAt || null,
                findings: arr(d.findings).map((f) => ({
                    nonConformity: f.nonConformity || '',
                    correctiveAction: f.correctiveAction || '',
                    category: f.category || null,
                })),
            })),
        applicantDocuments: arr(formData.carDocuments).map((d) => ({
            name: d.originalName || d.filename || null,
            path: d.path || null,
            uploadedAt: d.uploadedAt || null,
        })),
    };
}

function siteAddressOf(site) {
    const parts = [
        site.address,
        site.subDistrict ? `ต.${site.subDistrict}` : '',
        site.district ? `อ.${site.district}` : '',
        site.province ? `จ.${site.province}` : '',
        site.postalCode,
    ];
    return parts.filter(Boolean).join(' ');
}

async function buildApplicationSummary({ prisma, application }) {
    const site = readFilingSite(application.formData || {});
    const holder = application.entity && !application.entity.isDeleted ? application.entity : null;
    return {
        id: application.id,
        applicationNumber: application.applicationNumber,
        status: application.status,
        applicantName: composeName(application.applicant) || '-',
        submittedAt: application.formData?.submittedAt || null,
        updatedAt: application.updatedAt,
        scheduledDate: application.scheduledDate || null,
        farmName: site.farmName || null,
        farmAddress: siteAddressOf(site),
        farmLatitude: site.latitude,
        farmLongitude: site.longitude,
        holder: holder
            ? { name: holder.displayName || null, typeLabel: HOLDER_WORDS_TH[holder.type] || null }
            : null,
        scope: {
            cultivationTypes: application.areaType && AREA_TYPE_LABEL_TH[application.areaType]
                ? [AREA_TYPE_LABEL_TH[application.areaType]] : [],
            plantName: await filingPlantName(application.formData, { client: prisma }),
        },
        purposes: arr(application.certificationPurposes).map((code) => optionLabel(code) || code),
    };
}

/** The approver's recorded outcome, as the applicant may see it (no internal note, no officer id). */
function buildDecision(application) {
    const recorded = obj(obj(application.formData).certificationDecision);
    if (!recorded.outcome) { return null; }
    return {
        outcome: recorded.outcome,
        decidedAt: recorded.decidedAt || null,
        reasonLabel: recordedReasonLabel(CERTIFICATION_REFUSAL_REASONS, recorded),
        consideration: recorded.consideration || null,
    };
}

/**
 * @param {object} args
 * @param {object} args.prisma
 * @param {object} args.application  application row with `applicant`, `auditor`, `entity`
 */
async function buildDecisionFile({ prisma, application }) {
    const [{ documents, revisionHistory }, auditId, carHistory, summary, approverReturns] = await Promise.all([
        loadDocuments({ prisma, application }),
        resolveAuditId({ prisma, application }),
        loadCarHistory({ prisma, application }),
        buildApplicationSummary({ prisma, application }),
        loadApproverReturns({ prisma, application }),
    ]);
    const auditRow = auditId
        ? await prisma.auditChecklist.findFirst({ where: { id: auditId }, select: { submittedAt: true } })
        : null;
    const inspectorSummary = buildInspectorSummary(application, auditRow?.submittedAt || null);

    const evidenceGate = await loadEvidenceGate({ prisma, application });
    let onsiteBlock = {
        audit: null, checklist: [], photos: [], nearDuplicatePairs: [], notRecorded: null, needsAttention: 0,
        gps: { checkIn: null }, evidenceGate,
    };
    if (auditId) {
        const [checklist, photoBlock, gps] = await Promise.all([
            loadChecklist({ prisma, auditId }),
            loadPhotos({ prisma, auditId }),
            loadGps({ prisma, auditId }),
        ]);
        onsiteBlock = { audit: { id: auditId }, checklist, ...photoBlock, gps, evidenceGate };
    }

    const actions = offeredDecisionActions(application.status);
    const held = actions.includes('REFUSE') && !(await appealSetupInForce({ db: prisma }))
        ? ERROR_CODES.REFUSAL_AWAITS_APPEAL_SETUP
        : null;
    return {
        application: summary,
        decidable: actions.length > 0,
        actions,
        refusalHold: held ? { code: held.code, message: held.messageTh } : null,
        decision: buildDecision(application),
        refusalReasons: reasonOptions(CERTIFICATION_REFUSAL_REASONS),
        documents,
        revisionHistory,
        onsite: onsiteBlock,
        inspectorSummary,
        carHistory,
        approverReturns,
        // The field inspector was moved for conflict of interest during a correction: the earlier
        // result came from that inspector (order 65(1)).
        impartialityFlags: impartialityFlagsOf(application.formData),
    };
}

module.exports = { buildDecisionFile, buildApplicationSummary };
