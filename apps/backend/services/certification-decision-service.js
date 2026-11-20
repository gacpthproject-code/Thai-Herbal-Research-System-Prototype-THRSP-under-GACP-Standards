'use strict';

/**
 * การตัดสินให้การรับรองของ certificate_approver (คำสั่ง 29 และ 56(2))
 *
 *   อนุมัติ               AUDIT_PASSED → APPROVED → ออกใบ → CERTIFIED ในธุรกรรมเดียว
 *   ไม่ให้การรับรอง       AUDIT_PASSED | AUDIT_NOT_PASSED → REJECTED พร้อมหนังสือแจ้งคำสั่งถึงทุกคู่กรณี
 *   ส่งกลับให้แก้ไข       AUDIT_NOT_PASSED → CAR_PENDING ผ่านตัวเปิดรอบแก้ไขตัวเดียว (onsite-correction.js)
 *
 * ทางที่แฟ้มหนึ่งเสนอมาจากขาของผู้อนุมัติใน ROLE_TRANSITIONS (shared/certification-decision-actions.js)
 * ทุกทางต้องผ่านด่านเดียวกันก่อนเขียนอะไร:
 *   - แฟ้มเสนอทางนั้น (OUTCOME_NOT_OFFERED เช่น อนุมัติแฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน)
 *   - ผู้กดเปิดแฟ้มตัดสินแล้ว (formData.decisionFileViews[ผู้กด] ประทับโดย POST decision-file/opened
 *     เมื่อหน้าแฟ้มแสดงผล · ล้างทุกครั้งที่คำขอเข้าหรือออกจากคิวตัดสิน)
 *   - ผู้กดไม่ใช่ผู้ตรวจแปลงหรือผู้ตรวจเอกสารของคำขอนี้ (certification-decision-separation.js
 *     ผ่าน buildTransitionUpdate; ไฟล์นี้โหลดรายชื่อผู้บันทึกผลตรวจเอกสารรายฉบับมาให้)
 *
 * หลังธุรกรรม commit: ปิดแจ้งเตือน "มีคำขอรอตัดสิน" ของผู้อนุมัติทุกคน และแจ้งผู้ยื่นกับสมาชิกผู้ถือ
 * ที่มีสิทธิ์ยื่น (คำสั่ง 32) เมื่อการตัดสินไม่ได้ส่งหนังสือถึงทุกคนอยู่แล้ว · ไม่ throw และส่งซ้ำได้
 *
 * เหตุผลที่ผู้อนุมัติพิมพ์ (อนุมัติ) และบันทึกเพิ่มเติม (ไม่ให้การรับรอง) เป็นข้อมูลภายใน: อยู่ใน
 * แถวบันทึกตรวจสอบของการเปลี่ยนสถานะเท่านั้น · ข้อพิจารณาของการไม่ให้การรับรองเป็นของผู้ยื่น
 * (พ.ร.บ.วิธีปฏิบัติราชการทางปกครอง ม.37) จึงอยู่ในหนังสือและในบันทึกการตัดสิน
 */

const crypto = require('crypto');
const { prisma: defaultPrisma } = require('./prisma-database');
const { withoutTenantScope } = require('./tenant-context');
const { createNotification } = require('./notification-service');
const { applicationPartyUserIds } = require('./notification/application-parties');
const { mintTerminalDecisionLetters } = require('./decision-letter-service');
const { requestOnsiteCorrection, tellPartiesOfCorrection } = require('./onsite-correction');
const workflowTransitionService = require('./workflow-transition-service');
const certificateService = require('./certificate-service');
const { writeApplicationStatus } = require('./application-status-writer');
const { lockApplicationRow } = require('./checkout/application-row-lock');
const { statusTransitionAuditHook } = require('../middleware/audit-logger');
const { withVisibility } = require('../shared/application-visibility');
const { DECISION_QUEUE_STATES } = require('../shared/decision-states');
const { offeredDecisionActions } = require('../shared/certification-decision-actions');
const { Prisma } = require('@prisma/client');
const { ERROR_CODES } = require('../shared/error-codes');
const { ONSITE_AUDIT } = require('../config/business-rules');
const { appealSetupInForce } = require('../shared/appeal-setup');
const logger = require('../shared/logger');
const {
    CERTIFICATION_REFUSAL_REASONS, statedReason,
} = require('../shared/certification-decision-reasons');

const DECISION_REASON_MAX_LENGTH = 1000;
const CONSIDERATION_MIN_LENGTH = 20;
const CONSIDERATION_MAX_LENGTH = 1000;

const OUTCOMES = Object.freeze({
    APPROVED: 'APPROVED', REFUSED: 'REFUSED', RETURNED: 'RETURNED', CORRECTION_REQUESTED: 'CORRECTION_REQUESTED',
});

function refusal(code) {
    const row = ERROR_CODES[code];
    const error = new Error(row.messageTh);
    return Object.assign(error, { code: row.code, statusCode: row.httpStatus, status: row.httpStatus, messageTh: row.messageTh });
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** The link every "a file waits for you" notice carries (certification-decision-notify.js). */
const decisionFileLink = (applicationId) => `/provider/certification-decisions/${applicationId}`;

/**
 * Stamp "approver X opened this file at T" on a file in the decision queue of the approver's
 * organisation. One atomic jsonb merge, so two approvers opening the same file at once both
 * keep their stamp.
 *
 * @returns {Promise<number>} 1 when stamped, 0 when no such file waits in that queue
 */
function markDecisionFileViewed({ prisma = defaultPrisma, applicationRef, organizationId, approverId, at = new Date() }) {
    return prisma.$executeRaw`
        UPDATE applications
        SET "formData" = jsonb_set(
            COALESCE("formData", '{}'::jsonb),
            '{decisionFileViews}',
            COALESCE("formData"->'decisionFileViews', '{}'::jsonb) || jsonb_build_object(${String(approverId)}::text, ${at.toISOString()}::text)
        )
        WHERE (id = ${applicationRef} OR "applicationNumber" = ${applicationRef})
          AND "organizationId" = ${organizationId} AND "isDeleted" = false
          AND status IN (${Prisma.join([...DECISION_QUEUE_STATES])})`;
}

/**
 * The application as the decision needs it, with every person who recorded a document verdict.
 * The row lock comes first (lock order application → order → invoice): the status and the
 * opened-file marker are read under it, so a decision committed meanwhile is the one seen.
 */
async function loadDecidable(tx, { applicationRef, actor, action }) {
    const visible = await tx.application.findFirst({
        where: withVisibility(
            { OR: [{ id: applicationRef }, { applicationNumber: applicationRef }], isDeleted: false },
            actor,
        ),
        select: { id: true },
    });
    if (!visible || !(await lockApplicationRow(tx, visible.id))) { throw refusal('NOT_IN_DECISION_QUEUE'); }
    const application = await tx.application.findUnique({
        where: { id: visible.id },
        select: {
            id: true, applicationNumber: true, status: true, formData: true, workflowHistory: true,
            auditorId: true, reviewerId: true, organizationId: true, healthId: true, scheduledDate: true,
            entity: { select: { displayName: true, isDeleted: true } },
        },
    });
    if (!DECISION_QUEUE_STATES.has(application.status)) { throw refusal('CERTIFICATION_NOT_DECIDABLE'); }
    if (!offeredDecisionActions(application.status).includes(action)) { throw refusal('OUTCOME_NOT_OFFERED'); }
    if (!obj(obj(application.formData).decisionFileViews)[actor.id]) { throw refusal('DECISION_FILE_NOT_OPENED'); }
    const reviews = await tx.applicationDocumentReview.findMany({
        where: { applicationId: application.id },
        select: { reviewerId: true },
        distinct: ['reviewerId'],
    });
    return { ...application, documentReviewerIds: reviews.map((r) => r.reviewerId) };
}

function decisionRecord(outcome, actor, extra = {}) {
    return { outcome, decidedAt: new Date().toISOString(), decidedBy: actor.id, ...extra };
}

/** One status write through the canonical writer, carrying the decision record in formData. */
async function writeDecision(tx, { application, toState, actor, comment, reasonCode, record, auditMetadata }) {
    const actorRole = actor.canonicalRole || actor.role;
    const transition = workflowTransitionService.buildTransitionUpdate({
        application, toState, actorId: actor.id, actorRole, comment, reasonCode,
    });
    const { status: toStatus, formData, ...extras } = transition.updateData;
    return writeApplicationStatus({
        prisma: tx,
        applicationId: application.id,
        fromStatus: application.status,
        toStatus,
        actorId: actor.id,
        actorRole,
        reason: reasonCode,
        additionalData: { ...extras, formData: { ...formData, ...(record ? { certificationDecision: record } : {}) } },
        autoIssueCertificate: false,
        onAudit: statusTransitionAuditHook({ tx, metadata: { reasonCode, ...auditMetadata } }),
    });
}

/**
 * อนุมัติ: AUDIT_PASSED → APPROVED, ออกใบ, APPROVED → CERTIFIED — commit หรือถอยพร้อมกัน
 *
 * @param {{ applicationRef: string, actor: object, reason: string, prisma?: object }} args
 * @returns {Promise<{ id: string, applicationNumber: string, status: string, certificateNumber: string }>}
 */
async function approveCertification({ applicationRef, actor, reason, prisma = defaultPrisma }) {
    const note = typeof reason === 'string' ? reason.trim() : '';
    if (!note || note.length > DECISION_REASON_MAX_LENGTH) { throw refusal('CERTIFICATION_DECISION_REASON_REQUIRED'); }

    const result = await prisma.$transaction(async (tx) => {
        const application = await loadDecidable(tx, { applicationRef, actor, action: 'APPROVE' });
        const approved = await writeDecision(tx, {
            application, toState: 'APPROVED', actor,
            comment: 'ตัดสินให้การรับรอง', reasonCode: 'AUDITOR_FINAL_APPROVED',
            record: decisionRecord(OUTCOMES.APPROVED, actor),
            auditMetadata: { decisionReason: note },
        });
        // generateCertificate re-asks the onsite-evidence gate and is the one issuer.
        const certificate = await certificateService.generateCertificate(
            application.id, actor.id, { skipInitialAssets: true, prisma: tx },
        );
        const certified = await writeDecision(tx, {
            application: { ...approved, documentReviewerIds: application.documentReviewerIds },
            toState: 'CERTIFIED', actor,
            comment: `ออกใบรับรองเลขที่ ${certificate.certificateNumber}`, reasonCode: 'CERTIFICATE_ISSUED',
            auditMetadata: { certificateNumber: certificate.certificateNumber },
        });
        return {
            id: certified.id, applicationNumber: certified.applicationNumber,
            status: certified.status, certificateNumber: certificate.certificateNumber,
        };
    }, { timeout: ONSITE_AUDIT.DECISION_TX_TIMEOUT_MS, maxWait: ONSITE_AUDIT.DECISION_TX_MAX_WAIT_MS });

    await markApproverNoticesRead(result.id);
    await notifyCertificateIssued(result.id);
    return result;
}

/** The approver's consideration, as the order prints it; null when it is not 20 to 1,000 characters. */
function statedConsideration(text) {
    const stated = typeof text === 'string' ? text.trim() : '';
    return stated.length >= CONSIDERATION_MIN_LENGTH && stated.length <= CONSIDERATION_MAX_LENGTH ? stated : null;
}

/** The inspector's latest recorded result: what the facts of an order state about the visit. */
function inspectorResultOf(formData) {
    const decision = obj(obj(formData).auditDecision);
    return {
        verdict: decision.decision || null,
        decidedAt: decision.decidedAt || null,
        findings: (Array.isArray(decision.findings) ? decision.findings : [])
            .map((finding) => ({ nonConformity: String(finding?.nonConformity || '').trim(), correctiveAction: String(finding?.correctiveAction || '').trim() }))
            .filter((finding) => finding.nonConformity),
    };
}

/** The facts of an order not to certify (spec 5.5 item 2), from what the file holds. */
async function orderFacts(tx, application) {
    const { readFilingSite } = require('./application-service/application-farm-materialization');
    const site = readFilingSite(application.formData || {});
    const holder = application.entity && !application.entity.isDeleted ? application.entity : null;
    const inspected = inspectorResultOf(application.formData);
    return {
        holderName: holder?.displayName || null,
        siteName: site.farmName || null,
        siteAddress: [site.address, site.subDistrict, site.district, site.province].filter(Boolean).join(' ') || null,
        visitedAt: application.scheduledDate || null,
        inspectorVerdict: inspected.verdict,
        inspectorDecidedAt: inspected.decidedAt,
        findings: inspected.findings.map((finding) => finding.nonConformity),
        correctionRounds: await tx.correctionRound.count({ where: { applicationId: application.id, stage: 'FIELD_AUDIT' } }),
    };
}

/**
 * ไม่ให้การรับรอง: AUDIT_PASSED | AUDIT_NOT_PASSED → REJECTED · เหตุจากรายการตายตัว หรือ OTHER พร้อม
 * เหตุที่พิมพ์ (reasonText) · ข้อพิจารณา (consideration) ผู้ยื่นได้อ่านในหนังสือ · บันทึกเพิ่มเติม (note)
 * เป็นข้อมูลภายใน · หนังสือแจ้งคำสั่งถึงผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่นทุกคนในธุรกรรมเดียวกัน
 *
 * @param {{ applicationRef: string, actor: object, reasonCode: string, reasonText?: string, consideration: string, note?: string, prisma?: object }} args
 */
async function refuseCertification({ applicationRef, actor, reasonCode, reasonText, consideration, note, prisma = defaultPrisma }) {
    const stated = statedReason(CERTIFICATION_REFUSAL_REASONS, reasonCode, reasonText);
    if (stated.refused === 'OTHER_TEXT_REQUIRED') { throw refusal('DECISION_REASON_TEXT_REQUIRED'); }
    if (stated.refused) { throw refusal('CERTIFICATION_REFUSAL_REASON_REQUIRED'); }
    const considered = statedConsideration(consideration);
    if (!considered) { throw refusal('DECISION_CONSIDERATION_REQUIRED'); }
    const { label } = stated;
    const internalNote = typeof note === 'string' ? note.trim().slice(0, DECISION_REASON_MAX_LENGTH) : '';

    return prisma.$transaction(async (tx) => {
        const appeal = await appealSetupInForce({ db: tx });
        if (!appeal) { throw refusal('REFUSAL_AWAITS_APPEAL_SETUP'); }
        const application = await loadDecidable(tx, { applicationRef, actor, action: 'REFUSE' });
        const refusalId = crypto.randomUUID();
        const refused = await writeDecision(tx, {
            application, toState: 'REJECTED', actor,
            comment: `ไม่ให้การรับรอง: ${label}`, reasonCode: 'CERTIFICATION_REFUSED',
            record: decisionRecord(OUTCOMES.REFUSED, actor, {
                reasonCode, ...(stated.text ? { reasonText: stated.text } : {}),
                fromStatus: application.status, consideration: considered, refusalId, appeal,
            }),
            auditMetadata: { refusalReasonCode: reasonCode, refusalId, ...(internalNote ? { decisionNote: internalNote } : {}) },
        });
        // The order reaches every party, committed with the decision: no letter, no refusal.
        await mintTerminalDecisionLetters({
            tx,
            recipientUserIds: await applicationPartyUserIds(application.id, { db: tx }),
            applicationId: application.id,
            order: {
                applicationNumber: application.applicationNumber,
                stage: application.status,
                reason: label,
                consideration: considered,
                facts: await orderFacts(tx, application),
                appeal,
                refusalId,
            },
        });
        return { id: refused.id, applicationNumber: refused.applicationNumber, status: refused.status };
    }).then(async (result) => {
        await markApproverNoticesRead(result.id);
        return result;
    });
}

/**
 * ส่งกลับให้แก้ไขข้อบกพร่อง: AUDIT_NOT_PASSED → CAR_PENDING · ข้อบกพร่องที่ยังต้องแก้เลือกจากที่ผู้ตรวจ
 * พื้นที่บันทึก (findingIndexes นับจาก 1 ไม่ส่ง = ทุกข้อ แก้ถ้อยคำไม่ได้) · คำสั่งเพิ่มเติม (note) ผู้ยื่นได้อ่าน
 * ในหนังสือสั่งแก้ไข · ผู้ตรวจพื้นที่คนเดิมยังเป็นผู้พิจารณาหลักฐาน (คำสั่ง 29)
 *
 * @param {{ applicationRef: string, actor: object, findingIndexes?: number[], note?: string, prisma?: object }} args
 */
async function requestCertificationCorrection({ applicationRef, actor, findingIndexes, note, prisma = defaultPrisma }) {
    const instruction = typeof note === 'string' ? note.trim().slice(0, DECISION_REASON_MAX_LENGTH) : '';
    const result = await prisma.$transaction(async (tx) => {
        const application = await loadDecidable(tx, { applicationRef, actor, action: 'REQUEST_CORRECTION' });
        const { findings: recorded } = inspectorResultOf(application.formData);
        const picked = findingIndexes === undefined || findingIndexes === null
            ? recorded.map((_finding, index) => index + 1)
            : findingIndexes;
        const valid = Array.isArray(picked) && picked.length > 0
            && picked.every((n) => Number.isInteger(n) && n >= 1 && n <= recorded.length)
            && new Set(picked).size === picked.length;
        if (!valid) { throw refusal('CORRECTION_FINDINGS_REQUIRED'); }
        const findings = [...picked].sort((a, b) => a - b).map((n) => recorded[n - 1]);
        const at = new Date();
        const actorRole = actor.canonicalRole || actor.role;
        const transition = workflowTransitionService.buildTransitionUpdate({
            application, toState: 'CAR_PENDING', actorId: actor.id, actorRole,
            comment: 'ส่งกลับให้แก้ไขข้อบกพร่อง', reasonCode: 'CERTIFICATION_CORRECTION_REQUESTED',
        });
        const { status: _toStatus, formData, ...extras } = transition.updateData;
        const record = decisionRecord(OUTCOMES.CORRECTION_REQUESTED, actor, {
            fromStatus: application.status, findingIndexes: [...picked].sort((a, b) => a - b), ...(instruction ? { note: instruction } : {}),
        });
        const opened = await requestOnsiteCorrection(tx, {
            application, fromStatus: application.status, actorId: actor.id, actorRole,
            reason: 'CERTIFICATION_CORRECTION_REQUESTED',
            additionalData: { ...extras, formData: { ...formData, certificationDecision: record } },
            findings, instruction: instruction || null, at,
            onAudit: statusTransitionAuditHook({ tx, metadata: { reasonCode: 'CERTIFICATION_CORRECTION_REQUESTED', findingIndexes: record.findingIndexes } }),
        });
        return {
            id: opened.application.id, applicationNumber: opened.application.applicationNumber,
            status: opened.application.status, carDueAt: opened.carDueAt.toISOString(), findings,
        };
    });

    await markApproverNoticesRead(result.id);
    await tellPartiesOfCorrection({
        applicationId: result.id, applicationNumber: result.applicationNumber, decision: OUTCOMES.CORRECTION_REQUESTED,
        findings: result.findings, note: instruction || null, logger,
    });
    const { findings: _told, ...answer } = result;
    return answer;
}

/** Every approver's "a file waits for you" notice for this application, marked read. Never throws. */
async function markApproverNoticesRead(applicationId) {
    try {
        await withoutTenantScope(() => defaultPrisma.notification.updateMany({
            where: {
                isRead: false,
                AND: [
                    { metadata: { path: ['applicationId'], equals: applicationId } },
                    { metadata: { path: ['actionUrl'], equals: decisionFileLink(applicationId) } },
                ],
            },
            data: { isRead: true, readAt: new Date() },
        }));
    } catch (err) {
        logger.warn('[certification-decision] approver notices not marked read (non-fatal)', { applicationId, error: err?.message });
    }
}

/**
 * Tell the applicant and the holder's submitters, once per person per event (noticeKey).
 * Never throws: the decision is committed and the status is the truth.
 *
 * @returns {Promise<number>} how many people were told now
 */
async function tellApplicationParties(applicationId, { notice, eventKey, type, title, message, actionUrl, data = {}, skipUserIds = [] }) {
    const noticeKey = `${notice}:${applicationId}:${eventKey}`;
    try {
        return await withoutTenantScope(async () => {
            let told = 0;
            for (const userId of await applicationPartyUserIds(applicationId)) {
                if (skipUserIds.includes(userId)) { continue; }
                const already = await defaultPrisma.notification.findFirst({
                    where: { userId, metadata: { path: ['noticeKey'], equals: noticeKey } },
                    select: { id: true },
                });
                if (already) { continue; }
                const row = await createNotification({
                    userId, type, title, message, priority: 'HIGH', actionUrl,
                    data: { ...data, notice, noticeKey, applicationId },
                });
                if (row) { told += 1; }
            }
            return told;
        });
    } catch (err) {
        logger.warn('[certification-decision] party notice failed (non-fatal)', { applicationId, notice, error: err?.message });
        return 0;
    }
}

/**
 * The approver sent an AUDIT_PASSED file back to its field inspector (F-A8b-08): the inspector
 * is told once per send-back, with the reason and a link to the job sheet. Never throws.
 */
async function tellInspectorOfReturn({ applicationId, applicationNumber, inspectorId, reason, returnedAt }) {
    if (!inspectorId) { return null; }
    const stamp = returnedAt instanceof Date ? returnedAt.toISOString() : String(returnedAt || '');
    const noticeKey = `APPROVER_RETURNED:${applicationId}:${stamp}`;
    try {
        return await withoutTenantScope(async () => {
            const already = await defaultPrisma.notification.findFirst({
                where: { userId: inspectorId, metadata: { path: ['noticeKey'], equals: noticeKey } },
                select: { id: true },
            });
            if (already) { return null; }
            return createNotification({
                userId: inspectorId,
                type: 'WARNING',
                title: 'ผู้อนุมัติส่งคำขอกลับให้ทบทวน',
                message: `คำขอ ${applicationNumber} ถูกส่งกลับให้ทบทวนผลการตรวจพื้นที่ เหตุผล: ${reason}`,
                priority: 'HIGH',
                actionUrl: `/provider/audits/${applicationId}`,
                data: { applicationId, applicationNumber, notice: 'APPROVER_RETURNED', noticeKey },
            });
        });
    } catch (err) {
        logger.warn('[certification-decision] inspector return notice failed (non-fatal)', { applicationId, error: err?.message });
        return null;
    }
}

async function notifyCertificateIssued(applicationId) {
    const certificate = await withoutTenantScope(() => defaultPrisma.certificate.findFirst({
        where: { applicationId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        select: { id: true, certificateNumber: true, application: { select: { applicationNumber: true, status: true } } },
    }));
    if (!certificate || certificate.application?.status !== 'CERTIFIED') { return 0; }
    const number = certificate.application.applicationNumber || applicationId;
    return tellApplicationParties(applicationId, {
        notice: 'CERTIFICATE_ISSUED',
        eventKey: certificate.certificateNumber,
        type: 'SUCCESS',
        title: 'ได้รับการรับรอง GACP แล้ว',
        message: `คำขอเลขที่ ${number} ได้รับการรับรอง GACP แล้ว ใบรับรองเลขที่ ${certificate.certificateNumber} ดาวน์โหลดได้ที่เมนูใบรับรอง`,
        actionUrl: `/health/certificates/${certificate.id}`,
        data: { applicationNumber: number, certificateId: certificate.id, certificateNumber: certificate.certificateNumber },
    });
}

module.exports = {
    tellInspectorOfReturn,
    OUTCOMES,
    decisionFileLink,
    markDecisionFileViewed,
    approveCertification,
    refuseCertification,
    requestCertificationCorrection,
    markApproverNoticesRead,
    tellApplicationParties,
    notifyCertificateIssued,
    decisionRecord,
};
