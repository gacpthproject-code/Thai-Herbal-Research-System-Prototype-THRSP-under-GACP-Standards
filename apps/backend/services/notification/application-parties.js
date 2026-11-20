/**
 * ผู้รับแจ้งเตือนฝั่งผู้ยื่นของคำขอหนึ่งใบ (คำสั่ง 32, operator 2026-10-07):
 * ผู้ยื่น ∪ สมาชิกบริษัทผู้ถือที่มีสิทธิ์ SUBMIT_APPLICATION ตัดคนซ้ำ
 *
 * ผู้ยื่นได้รับเฉพาะเมื่อยังเป็นสมาชิก ACTIVE ของบริษัทผู้ถือที่ยังไม่ถูกลบ (หรือคำขอไม่มีผู้ถือ): คนที่ถูกถอดออก
 * จากบริษัทต้องไม่ได้บันทึก เงินคืน วันนัด หรือเลขใบรับรองของบริษัทอีก (security review M1) ·
 * ทุกผู้รับต้องเป็นบัญชีที่ยังถือ session ได้ (shared/account-status.js: ไม่ถูกลบ ไม่ถูกระงับ)
 * แจ้งเตือนที่พิมพ์ยอดเงินหรือเลขเอกสารการเงิน ผู้รับที่ไม่มี VIEW_FINANCIAL ได้ฉบับที่ไม่มีของเหล่านั้น (มติ 41, WITHOUT_MONEY)
 *
 * ทุกแจ้งเตือนที่ผู้ยื่นต้องรู้ (ชำระสำเร็จ ส่งแก้ CAR นัดตรวจ ผลตรวจ ออกใบ ยกเลิก)
 * ผ่านโมดูลนี้ เพื่อให้ผู้ถือไม่หลุดจากเรื่องของตัวเองเมื่อผู้ยื่นเดิมออกจากบริษัท
 *
 * แถวแจ้งเตือนเป็นของผู้รับ จึงเขียนนอก tenant ของผู้กระทำ (withoutTenantScope)
 * ให้ createNotification ประทับองค์กรของผู้รับเอง
 */

'use strict';

const logger = require('../../shared/logger');
const { withoutTenantScope } = require('../tenant-context');
const { canAccountHoldSession } = require('../../shared/account-status');

const SUBMIT_APPLICATION = 'SUBMIT_APPLICATION';
const VIEW_FINANCIAL = 'VIEW_FINANCIAL';
const ACCOUNT = { select: { status: true, isDeleted: true, role: true } };

/**
 * แจ้งเตือนที่พิมพ์ยอดเงินหรือเลขเอกสารการเงิน → ฉบับที่ไม่มีของเหล่านั้น สำหรับผู้รับที่ไม่มีสิทธิ์
 * VIEW_FINANCIAL บนบริษัทผู้ถือ (มติ 41) · `keep` = ช่องของ payload ที่ฉบับนั้นยังพาไปได้ ·
 * invoiceId คือรหัสภายใน (UUID) ไม่ใช่เลขใบแจ้งหนี้ คงไว้ให้ตัวกันซ้ำของ fanout แยกการคืนเงินของใบแจ้งหนี้อีกใบ
 * ในคำขอเดียวกันออกจากใบแรก (N4)
 */
const WITHOUT_MONEY = Object.freeze({
    REFUND_PROVIDER_CANCELLED: { type: 'REFUND_PROVIDER_CANCELLED_NO_AMOUNT', keep: ['applicationNumber', 'invoiceId', 'reasonCode', 'reasonText', 'paymentMode', 'priority'] },
    REFUND_DUPLICATE_CHARGE: { type: 'REFUND_DUPLICATE_CHARGE_NO_AMOUNT', keep: ['applicationNumber', 'invoiceId', 'paymentMode', 'priority'] },
});

/** แจ้งเตือนที่ผู้รับหนึ่งคนได้: ตามที่ส่ง หรือฉบับไม่มียอดเมื่อผู้รับไม่มี VIEW_FINANCIAL (ทั้งสองทางส่งใช้ตัวนี้) */
function noticeForParty(seesMoney, type, fields) {
    const withoutMoney = WITHOUT_MONEY[type];
    if (seesMoney || !withoutMoney) { return { type, fields }; }
    return { type: withoutMoney.type, fields: Object.fromEntries(withoutMoney.keep.filter((k) => k in fields).map((k) => [k, fields[k]])) };
}

function defaultDb() {
    return require('../prisma-database').prisma;
}

/** userId → สิทธิ์ที่มีผลบนบริษัทผู้ถือ ของสมาชิก ACTIVE ที่ยังถือ session ได้ */
async function holderMembers(db, entityId) {
    const members = new Map();
    if (!entityId) { return members; }
    const memberships = await db.entityMembership.findMany({
        where: { entityId, status: 'ACTIVE', entity: { isDeleted: false } },
        select: { id: true, userId: true, role: true, permissions: true, user: ACCOUNT },
    });
    const { getEffectiveEntityPermissions } = require('../entity-effective-permissions-service');
    for (const m of memberships) {
        if (!canAccountHoldSession(m.user)) { continue; }
        const { effective } = await getEffectiveEntityPermissions({
            membershipId: m.id, role: m.role, basePermissions: m.permissions, prisma: db,
        });
        members.set(m.userId, effective);
    }
    return members;
}

/**
 * @param {string} applicationId
 * @param {{ db?: object }} [opts]
 * @returns {Promise<Map<string, { seesMoney: boolean }>>} ผู้ยื่นก่อน ตามด้วยสมาชิกผู้ถือ ไม่ซ้ำ ·
 *   seesMoney = มี VIEW_FINANCIAL บนผู้ถือ (คำขอที่ไม่มีผู้ถือ: ผู้ยื่นเห็นเงินของตัวเอง)
 */
async function applicationParties(applicationId, { db } = {}) {
    const client = db || defaultDb();
    return withoutTenantScope(async () => {
        const parties = new Map();
        const application = await client.application.findUnique({
            where: { id: applicationId },
            select: { entityId: true, applicant: { select: { id: true, ...ACCOUNT.select } } },
        });
        if (!application) { return parties; }
        const { applicant, entityId } = application;
        const members = await holderMembers(client, entityId);
        if (applicant && canAccountHoldSession(applicant)) {
            if (!entityId) {
                parties.set(applicant.id, { seesMoney: true });
            } else if (members.has(applicant.id)) {
                parties.set(applicant.id, { seesMoney: members.get(applicant.id).includes(VIEW_FINANCIAL) });
            }
        }
        for (const [userId, effective] of members) {
            if (effective.includes(SUBMIT_APPLICATION) && !parties.has(userId)) {
                parties.set(userId, { seesMoney: effective.includes(VIEW_FINANCIAL) });
            }
        }
        return parties;
    });
}

/**
 * @param {string} applicationId
 * @param {{ db?: object }} [opts] db = Prisma client or transaction client
 * @returns {Promise<string[]>} User.id ของผู้ยื่นก่อน ตามด้วยสมาชิกผู้ถือ ไม่ซ้ำ
 */
async function applicationPartyUserIds(applicationId, { db } = {}) {
    return [...(await applicationParties(applicationId, { db })).keys()];
}

/**
 * ส่งแจ้งเตือนในระบบถึงทุกฝ่ายของคำขอ ไม่ throw (แจ้งเตือนเป็นผลข้างเคียงหลังการตัดสินที่ commit แล้ว)
 *
 * @param {string} applicationId
 * @param {{ type: string, title?: string, message?: string, data?: object, priority?: string|number, actionUrl?: string }} notice
 *   ไม่ส่ง title/message = ใช้แม่แบบของ type ใน notification-service
 * @param {{ db?: object }} [opts] a caller's transaction: the parties are read and the notices written
 *   with it, so they commit or roll back with the caller's own writes
 * @returns {Promise<{ recipients: string[], delivered: number }>}
 */
async function notifyApplicationParties(applicationId, notice, { db } = {}) {
    const { sendNotification } = require('../notification-service');
    let parties = new Map();
    try {
        parties = await applicationParties(applicationId, { db });
    } catch (err) {
        logger.error(`[application-parties] recipient lookup failed for ${applicationId}: ${err?.message}`);
        return { recipients: [], delivered: 0, lookupFailed: true };
    }
    const recipients = [...parties.keys()];
    if (recipients.length === 0) {
        logger.warn(`[application-parties] no recipient for application ${applicationId} (${notice.type})`);
    }
    const priority = notice.priority !== undefined ? { priority: notice.priority } : {};
    const overrides = {
        ...(notice.title ? { title: notice.title } : {}),
        ...(notice.message ? { message: notice.message } : {}),
        ...priority,
        ...(notice.actionUrl ? { actionUrl: notice.actionUrl } : {}),
    };
    let delivered = 0;
    for (const [userId, { seesMoney }] of parties) {
        const party = noticeForParty(seesMoney, notice.type, notice.data || {});
        // The caller's wording belongs to the event it named; the amount-free variant speaks in its own.
        const wording = party.type === notice.type ? overrides : variantWording(party, priority);
        const row = await withoutTenantScope(() => sendNotification(
            userId, party.type, { applicationId, ...party.fields }, wording, { db },
        ));
        if (row) { delivered += 1; }
    }
    return { recipients, delivered };
}

function variantWording({ type, fields }, priority) {
    const { subjectTH, bodyTHText } = require('../notification-fanout-service').getTemplateForType(type, fields);
    return { title: subjectTH, message: bodyTHText, ...priority };
}

/**
 * ทางเดียวกันสำหรับแม่แบบของ notification-fanout-service (มีตัวกันซ้ำของมันเอง)
 * @param {string} applicationId
 * @param {{ type: string, payload?: object }} notice
 * @returns {Promise<{ recipients: string[], delivered: number, failed: number, lookupFailed: boolean }>}
 *   failed = ผู้รับที่แถวกระดิ่งไม่ถูกเขียนด้วยเหตุชั่วคราว (ผู้รับที่ปิดรับแจ้งเตือนถือว่าจบ ไม่อยู่ในนับใด)
 */
async function fanoutToApplicationParties(applicationId, { type, payload = {} }, { db } = {}) {
    const fanout = require('../notification-fanout-service');
    let parties = new Map();
    try {
        parties = await applicationParties(applicationId, { db });
    } catch (err) {
        logger.error(`[application-parties] recipient lookup failed for ${applicationId}: ${err?.message}`);
        return { recipients: [], delivered: 0, failed: 0, lookupFailed: true };
    }
    let delivered = 0;
    let failed = 0;
    for (const [userId, { seesMoney }] of parties) {
        const notice = noticeForParty(seesMoney, type, payload);
        try {
            const out = await withoutTenantScope(() => fanout.send({ userId, type: notice.type, payload: { applicationId, ...notice.fields } }));
            if (out?.inApp?.ok || out?.deduped) { delivered += 1; } else if (fanout.isOutcomeRetriable(out?.inApp)) { failed += 1; }
        } catch (err) {
            failed += 1;
            logger.warn(`[application-parties] fanout ${type} to ${userId} failed: ${err?.message}`);
        }
    }
    return { recipients: [...parties.keys()], delivered, failed, lookupFailed: false };
}

module.exports = {
    WITHOUT_MONEY,
    applicationPartyUserIds,
    notifyApplicationParties,
    fanoutToApplicationParties,
};
