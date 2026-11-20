'use strict';

/**
 * Tell the applicant and the holder why an admin closed their application (order 36,
 * operator 2026-10-07): in-app, the Thai label of the reason the admin picked from
 * shared/application-closure-reasons.js. The admin's free-text note is internal and never
 * leaves the audit record.
 *
 * Recipients: services/notification/application-parties.js applicationPartyUserIds, the
 * one list every applicant-side notice uses (order 32).
 *
 * Called by each closing door after its transaction commits. Idempotent: a recipient who
 * already holds this application's closure notice gets nothing new. Best-effort: a
 * notice is a courtesy, the application's status is the truth, so this never throws.
 */

const { prisma } = require('./prisma-database');
const { withoutTenantScope } = require('./tenant-context');
const { createNotification } = require('./notification-service');
const { applicationPartyUserIds } = require('./notification/application-parties');
const { APPLICATION_CLOSURE_REASONS, APPLICATION_CLOSURE_NEXT_STEPS, isApplicationClosureReason } = require('../shared/application-closure-reasons');
const logger = require('../shared/logger');

const CLOSURE_NOTICE = 'APPLICATION_CLOSED_BY_ADMIN';

function closureMessage(number, reasonCode) {
    const nextStep = APPLICATION_CLOSURE_NEXT_STEPS[reasonCode];
    const message = `เจ้าหน้าที่ยกเลิกคำขอเลขที่ ${number} ของคุณแล้ว เนื่องจาก${APPLICATION_CLOSURE_REASONS[reasonCode]}`;
    return nextStep ? `${message} ${nextStep}` : message;
}

async function tell(userId, application) {
    const already = await prisma.notification.findFirst({
        where: {
            userId,
            AND: [
                { metadata: { path: ['notice'], equals: CLOSURE_NOTICE } },
                { metadata: { path: ['applicationId'], equals: application.id } },
            ],
        },
        select: { id: true },
    });
    if (already) { return false; }
    const number = application.applicationNumber || application.id;
    // No tenant is bound here, so createNotification files the notice under the
    // recipient's own organization, not the closing admin's.
    const row = await createNotification({
        userId,
        type: 'WARNING',
        title: 'คำขอของคุณถูกยกเลิก',
        message: closureMessage(number, application.reasonCode),
        data: {
            notice: CLOSURE_NOTICE,
            applicationId: application.id,
            applicationNumber: application.applicationNumber || null,
            closureReasonCode: application.reasonCode,
        },
        priority: 'HIGH',
        actionUrl: `/health/applications/${application.id}`,
    });
    return Boolean(row);
}

/**
 * @param {{ applicationId: string }} args
 * @returns {Promise<number>} how many people were told now
 */
async function notifyApplicationClosedByAdmin({ applicationId } = {}) {
    try {
        return await withoutTenantScope(async () => {
            const row = await prisma.application.findUnique({
                where: { id: applicationId },
                select: { id: true, applicationNumber: true, status: true, formData: true },
            });
            const reasonCode = row?.formData?.adminClosure?.reasonCode;
            if (row?.status !== 'CANCELLED' || !isApplicationClosureReason(reasonCode)) { return 0; }
            const application = { ...row, reasonCode };
            let told = 0;
            for (const userId of await applicationPartyUserIds(application.id, { db: prisma })) {
                if (await tell(userId, application)) { told += 1; }
            }
            return told;
        });
    } catch (err) {
        logger.warn('[application-closure-notify] closure notice failed (non-fatal)', { applicationId, error: err?.message });
        return 0;
    }
}

module.exports = { notifyApplicationClosedByAdmin, CLOSURE_NOTICE };
