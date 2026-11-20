'use strict';

/**
 * พักใช้ / คืนสภาพ / เพิกถอนใบรับรอง — งานของ certificate_approver (คำสั่ง 29 และ 34(4),
 * operator 2026-10-07) ผู้ดูแลฝั่งกรมไม่มีประตูนี้แล้ว
 *
 * พักใช้และเพิกถอนต้องมีเหตุจากรายการตายตัว (shared/certification-decision-reasons.js) หรือ
 * OTHER พร้อมเหตุที่พิมพ์ (reasonText) · ข้อความของเหตุคือสิ่งที่พิมพ์ลง suspendedReason /
 * revokedReason และที่ผู้ถือเห็น ·
 * บันทึกเพิ่มเติมของเจ้าหน้าที่อยู่ในบันทึกตรวจสอบเท่านั้น
 *
 * ใบที่ถูกพักใช้หรือเพิกถอน: หน้าตรวจสอบและหน้าสแกนล็อตอ่านสถานะใบปัจจุบัน ล็อตที่ผลิตไว้ก่อน
 * จึงไม่ขึ้นเครื่องหมายรับรอง (คำสั่ง 25(4))
 *
 * กำแพงองค์กร: ใบขององค์กรอื่น = ไม่พบ (404) เหมือนกับไม่มีใบ · ไม่มีบทบาทใดข้ามองค์กร
 * (ประตู interoperability ก็เป็นของผู้อนุมัติขององค์กรเจ้าของใบเท่านั้น)
 */

const { prisma: defaultPrisma } = require('./prisma-database');
const { withoutTenantScope } = require('./tenant-context');
const certificateService = require('./certificate-service');
const { tellApplicationParties } = require('./certification-decision-service');
const { findCertificateByNumber } = require('./certificate-number-display');
const { ERROR_CODES } = require('../shared/error-codes');
const {
    CERTIFICATE_SUSPENSION_REASONS, CERTIFICATE_REVOCATION_REASONS, statedReason,
} = require('../shared/certification-decision-reasons');

const NOTE_MAX_LENGTH = 1000;

function refusal(code) {
    const row = ERROR_CODES[code];
    const error = new Error(row.messageTh);
    return Object.assign(error, { code: row.code, statusCode: row.httpStatus, status: row.httpStatus, messageTh: row.messageTh });
}

const cleanNote = (note) => (typeof note === 'string' ? note.trim().slice(0, NOTE_MAX_LENGTH) : '');

/** The stated reason's label, or the refusal that names what is missing. */
function requireStatedReason(reasons, reasonCode, reasonText) {
    const stated = statedReason(reasons, reasonCode, reasonText);
    if (stated.refused === 'OTHER_TEXT_REQUIRED') { throw refusal('DECISION_REASON_TEXT_REQUIRED'); }
    if (stated.refused) { throw refusal('CERTIFICATE_ACTION_REASON_REQUIRED'); }
    return stated;
}

/** The certificate by id or number inside the caller's organisation, or a 404 refusal. */
async function findOwnCertificate({ certificateRef, actor }) {
    const key = String(certificateRef || '').trim();
    if (!key) { throw refusal('CERTIFICATE_NOT_FOUND'); }
    const select = { id: true, certificateNumber: true, organizationId: true, applicationId: true, status: true };
    const cert = await withoutTenantScope(async () => (
        await findCertificateByNumber(defaultPrisma, key, { where: { isDeleted: false }, select })
        || defaultPrisma.certificate.findFirst({ where: { id: key, isDeleted: false }, select })
    ));
    if (!cert || !actor?.organizationId || cert.organizationId !== actor.organizationId) {
        throw refusal('CERTIFICATE_NOT_FOUND');
    }
    return cert;
}

function tellHolder(cert, { notice, eventKey, title, message }) {
    if (!cert.applicationId) { return Promise.resolve(0); }
    return tellApplicationParties(cert.applicationId, {
        notice, eventKey, type: 'WARNING', title, message,
        actionUrl: `/health/certificates/${cert.id}`,
        data: { certificateId: cert.id, certificateNumber: cert.certificateNumber },
    });
}

function mapLifecycleError(err) {
    if (err?.code === 'CERTIFICATE_NOT_SUSPENDABLE' || err?.code === 'CERTIFICATE_NOT_REINSTATABLE') {
        return refusal(err.code);
    }
    if (Number(err?.statusCode) === 409) { return refusal('CERTIFICATE_ALREADY_REVOKED'); }
    if (Number(err?.statusCode) === 404) { return refusal('CERTIFICATE_NOT_FOUND'); }
    return err;
}

async function suspendCertificate({ certificateRef, actor, reasonCode, reasonText, note }) {
    const { label } = requireStatedReason(CERTIFICATE_SUSPENSION_REASONS, reasonCode, reasonText);
    const cert = await findOwnCertificate({ certificateRef, actor });
    const updated = await certificateService.suspendCertificate(cert.id, {
        reason: label, suspendedBy: actor.id, actorRole: actor.canonicalRole || actor.role, auditExtra: { reasonCode, note: cleanNote(note) || null },
    }).catch((err) => { throw mapLifecycleError(err); });
    await tellHolder(cert, {
        notice: 'CERTIFICATE_SUSPENDED',
        eventKey: updated.suspendedAt.toISOString(),
        title: 'ใบรับรองถูกพักใช้',
        message: `ใบรับรองเลขที่ ${cert.certificateNumber} ถูกพักใช้ เนื่องจาก${label} ระหว่างพักใช้ ใบรับรองและล็อตผลผลิตจะไม่แสดงว่าได้รับการรับรอง`,
    });
    return updated;
}

async function reinstateCertificate({ certificateRef, actor, note }) {
    const cert = await findOwnCertificate({ certificateRef, actor });
    const updated = await certificateService.reinstateCertificate(cert.id, {
        reinstatedBy: actor.id, actorRole: actor.canonicalRole || actor.role, auditExtra: { note: cleanNote(note) || null },
    }).catch((err) => { throw mapLifecycleError(err); });
    await tellHolder(cert, {
        notice: 'CERTIFICATE_REINSTATED',
        eventKey: updated.reinstatedAt.toISOString(),
        title: 'ใบรับรองกลับมาใช้ได้',
        message: `ใบรับรองเลขที่ ${cert.certificateNumber} พ้นการพักใช้ และกลับมาใช้ได้ตามปกติแล้ว`,
    });
    return updated;
}

/**
 * @param {{ certificateRef: string, actor: object, reasonCode: string, reasonText?: string, note?: string }} args
 */
async function revokeCertificate({ certificateRef, actor, reasonCode, reasonText, note }) {
    const { label } = requireStatedReason(CERTIFICATE_REVOCATION_REASONS, reasonCode, reasonText);
    const cert = await findOwnCertificate({ certificateRef, actor });
    const updated = await certificateService.revokeCertificate(cert.id, {
        reason: label,
        actorId: actor.id,
        actorRole: actor.canonicalRole || actor.role,
        callerOrganizationId: actor.organizationId || null,
        auditExtra: { reasonCode, note: cleanNote(note) || null },
    }).catch((err) => { throw mapLifecycleError(err); });
    await tellHolder(cert, {
        notice: 'CERTIFICATE_REVOKED',
        eventKey: updated.revokedAt.toISOString(),
        title: 'ใบรับรองถูกเพิกถอน',
        message: `ใบรับรองเลขที่ ${cert.certificateNumber} ถูกเพิกถอน เนื่องจาก${label} ใบรับรองนี้ใช้ไม่ได้อีก หากต้องการขอการรับรอง กรุณายื่นคำขอใหม่`,
    });
    return updated;
}

/** The approver's certificates of its organisation, newest first, with the reason lists. */
async function listForApprover({ actor, take = 200 }) {
    if (!actor?.organizationId) { throw refusal('CERTIFICATE_NOT_FOUND'); }
    const rows = await withoutTenantScope(() => defaultPrisma.certificate.findMany({
        where: { organizationId: actor.organizationId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
            id: true, certificateNumber: true, status: true, farmName: true, cropType: true,
            issuedDate: true, expiryDate: true, suspendedAt: true, suspendedReason: true,
            revokedAt: true, revokedReason: true, applicationId: true,
            holderDisplayName: true,
        },
    }));
    return rows;
}

module.exports = {
    suspendCertificate,
    reinstateCertificate,
    revokeCertificate,
    listForApprover,
};
