'use strict';

/**
 * Tell the certificate approvers that a file has reached their queue.
 *
 * A file that reaches AUDIT_PASSED waits for a certificate_approver (ISO/IEC 17065 §7.6,
 * F-CERT-SOD 2026-09-10). Nothing told them: the only way to learn there was something to
 * decide was to open /provider/certification-decisions and look. This puts one in-app
 * notification in the mailbox of every ACTIVE approver of the application's organisation,
 * pointing at the read-only file view.
 *
 * Called from the canonical status writer when a file enters the queue (AUDIT_PASSED, or
 * AUDIT_NOT_PASSED when the field inspector recorded that it did not pass, order 56(2)), so
 * every door that writes either notifies the same way. Best-effort by contract: a notification is a
 * courtesy and the queue page is the source of truth, so a failure here must never undo
 * the inspector's recorded decision.
 */

const { prisma } = require('./prisma-database');
const { withoutTenantScope } = require('./tenant-context');
const { CANONICAL_ROLES } = require('../shared/canonical-rbac');
const { createNotification } = require('./notification-service');

const CERTIFICATE_APPROVER_DB_ROLES = Object.freeze([CANONICAL_ROLES.CERTIFICATE_APPROVER]);

/** ACTIVE, non-deleted certificate approvers of one organisation. */
async function listCertificateApproverIds(organizationId) {
    if (!organizationId) { return []; }
    const rows = await withoutTenantScope(() => prisma.user.findMany({
        where: {
            role: { in: [...CERTIFICATE_APPROVER_DB_ROLES] },
            organizationId,
            status: 'ACTIVE',
            isDeleted: false,
        },
        select: { id: true },
    }));
    return rows.map((r) => r.id);
}

/** What the approvers read, by the inspector's result that put the file in their queue. */
const WAITING_FILE_NOTICE = Object.freeze({
    AUDIT_PASSED: Object.freeze({
        title: 'มีคำขอรอตัดสินให้การรับรอง',
        message: (number) => `คำขอ ${number} ผ่านการตรวจประเมินแปลงแล้ว รอคุณตัดสินให้การรับรอง เปิดดูแฟ้มทั้งหมดได้ที่หน้าตัดสินให้การรับรอง`,
    }),
    AUDIT_NOT_PASSED: Object.freeze({
        title: 'มีคำขอที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน รอคุณตัดสิน',
        message: (number) => `คำขอ ${number} ผู้ตรวจพื้นที่บันทึกผลว่าไม่ผ่าน รอคุณตัดสินว่าจะไม่ให้การรับรอง หรือให้ผู้ยื่นแก้ไขข้อบกพร่อง เปิดดูแฟ้มทั้งหมดได้ที่หน้าตัดสินให้การรับรอง`,
    }),
});

/**
 * @param {object} args
 * @param {string} args.applicationId
 * @param {string} args.applicationNumber
 * @param {string} args.organizationId
 * @param {'AUDIT_PASSED'|'AUDIT_NOT_PASSED'} args.status the queue state the file entered
 * @returns {Promise<number>} how many approvers were notified
 */
async function notifyCertificateApproversOfWaitingFile({ applicationId, applicationNumber, organizationId, status } = {}) {
    const notice = WAITING_FILE_NOTICE[status];
    if (!notice) { return 0; }
    const approverIds = await listCertificateApproverIds(organizationId);
    let notified = 0;
    for (const userId of approverIds) {
        const row = await createNotification({
            userId,
            type: 'INFO',
            title: notice.title,
            message: notice.message(applicationNumber || applicationId),
            data: { applicationId, applicationNumber: applicationNumber || null },
            actionUrl: `/provider/certification-decisions/${applicationId}`,
        });
        if (row) { notified += 1; }
    }
    return notified;
}

module.exports = {
    CERTIFICATE_APPROVER_DB_ROLES,
    listCertificateApproverIds,
    notifyCertificateApproversOfWaitingFile,
};
