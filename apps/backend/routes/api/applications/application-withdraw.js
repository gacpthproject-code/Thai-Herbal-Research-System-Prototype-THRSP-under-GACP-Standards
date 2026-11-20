/**
 * ผู้ยื่นถอนคำขอเอง (operator คำสั่ง 32, 2026-10-07: มีปุ่ม "ถอนคำขอ" ก่อนเริ่มตรวจเอกสาร →
 * CANCELLED ไม่คืนเงิน)
 *
 *   POST /api/applications/:id/withdraw   body { reason }
 *
 * - ผู้กดต้องมีสิทธิ์ SUBMIT_APPLICATION บนผู้ถือ (ถอนคือการกระทำในนามผู้ถือ เหมือนการยื่น)
 * - ถอนได้เฉพาะก่อนผู้ตรวจเอกสารเริ่มงาน: PENDING_DOC_FEE หรือ DOC_FEE_PAID · หลังจากนั้นปล่อย
 *   ให้คำขอเดินตามกำหนด
 * - ไม่คืนเงิน (เงื่อนไขการชำระ ข้อ 7.1): ไม่มีการเขียนเงินใด ๆ
 * - QR ที่เปิดค้างไว้ถูกยกเลิกที่ gateway ก่อนเขียน CANCELLED · ถ้าเงินกำลังเข้า (succeeded/processing)
 *   หรือถาม gateway ไม่ได้ → 409 WITHDRAW_PAYMENT_IN_FLIGHT ไม่ปิดคำขอ (security review M2) ·
 *   คำสั่งชำระที่ค้างจ่ายถูกปลดในทรานแซกชันเดียวกับการปิด หลังล็อกแถวคำขอเป็นคำสั่งแรก (security veto V1/V2):
 *   คำสั่งชำระที่เพิ่งสร้างหรือเปลี่ยน intent ระหว่างนั้นต้องรอจน commit แล้วจึงถูกเห็น ปลดไม่สำเร็จ = 409
 * - เหตุผลบันทึกไว้กับคำขอ · closedReason = CANCELLED_BY_APPLICANT · แจ้งผู้ยื่นและผู้ถือ
 *
 * @module routes/api/applications/application-withdraw
 */

'use strict';

const express = require('express');
const { authenticateHealth } = require('../../../middleware/auth-middleware');
const { prisma } = require('../../../services/prisma-database');
const applicationService = require('../../../services/application-service');
const { holderScope, holderReadWhere, assertHolderCapability } = require('../../../services/holder-access');
const { writeApplicationStatus } = require('../../../services/application-status-writer');
const { retirePendingOrdersInTx, RETIRE_REASONS } = require('../../../services/checkout/retire-checkout-order');
const { lockApplicationRow } = require('../../../services/checkout/application-row-lock');
const { notifyApplicationParties } = require('../../../services/notification/application-parties');
const { releaseOpenIntents } = require('../../../services/checkout/release-open-intents');
const { GATE_MILESTONE } = require('../../../services/billing/unpaid-milestones');
const { entityPermissionDeniedBody } = require('../../../shared/entity-permission-denied');
const { buildWorkflowEvent } = require('../../../shared/workflow-event-builder');
const { lookup } = require('../../../shared/error-codes');
const { respondError } = require('../../../shared/api-response');
const logger = require('../../../shared/logger');

const router = express.Router();

/** Before the document reviewer starts: the applicant may still change their mind. */
const WITHDRAWABLE = new Set(['PENDING_DOC_FEE', 'DOC_FEE_PAID']);
const REASON_MIN = 5;

/**
 * The orders whose intent could still put money on this application. At a payment gate that is
 * every unsettled order of the milestone due there; once that milestone is paid only an order
 * still PENDING_PAYMENT. A retired (CANCELLED) duplicate-charge order keeps its succeeded intent
 * for ever and is settled business (refund of the excess, order 22), not money in flight.
 */
function ordersThatCanStillTakeMoney(status) {
    const due = GATE_MILESTONE[String(status).toUpperCase()];
    return due ? { milestone: due, status: { not: 'SETTLED' } } : { status: 'PENDING_PAYMENT' };
}

function refuse(res, code) {
    const row = lookup(code);
    return res.status(row.httpStatus).json({ success: false, code, error: code, messageTh: row.messageTh });
}

router.post('/:id/withdraw', authenticateHealth, async (req, res) => {
    try {
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < REASON_MIN) { return refuse(res, 'WITHDRAW_REASON_REQUIRED'); }

        const scope = await holderScope(req);
        const application = await applicationService.findOwnedApplicationForApplicant(req.params.id, { holderScope: scope });
        if (!application) {
            return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', error: 'APPLICATION_NOT_FOUND' });
        }
        try {
            await assertHolderCapability(req.user.id, application.entityId, 'SUBMIT_APPLICATION');
        } catch (denied) {
            return res.status(403).json(entityPermissionDeniedBody(denied.permission || 'SUBMIT_APPLICATION'));
        }
        if (!WITHDRAWABLE.has(String(application.status).toUpperCase())) { return refuse(res, 'WITHDRAW_NOT_ALLOWED'); }

        const openOrders = await prisma.checkoutOrder.findMany({
            where: {
                applicationId: application.id,
                ...ordersThatCanStillTakeMoney(application.status),
                stripePaymentIntentId: { not: null },
                ...holderReadWhere(scope, 'CheckoutOrder'),
            },
            select: { stripePaymentIntentId: true },
        });
        const checked = new Set(openOrders.map((o) => o.stripePaymentIntentId));
        const gate = await releaseOpenIntents([...checked]);
        if (!gate.released) {
            logger.warn(`[withdraw] ${application.applicationNumber} refused: intent ${gate.intentId} ${gate.cause} ${gate.message || ''}`);
            return refuse(res, 'WITHDRAW_PAYMENT_IN_FLIGHT');
        }

        const at = new Date().toISOString();
        const formData = application.formData && typeof application.formData === 'object' ? application.formData : {};
        const history = Array.isArray(application.workflowHistory) ? application.workflowHistory : [];
        try {
            await prisma.$transaction(async (tx) => {
                const locked = await lockApplicationRow(tx, application.id);
                if (!locked || locked.status !== application.status) {
                    throw Object.assign(new Error('the application moved while withdrawing'), { code: 'CONCURRENCY_CONFLICT' });
                }
                const retired = await retirePendingOrdersInTx(tx, {
                    where: { applicationId: application.id, ...holderReadWhere(scope, 'CheckoutOrder') },
                    releasedIntents: checked,
                    reason: RETIRE_REASONS.APPLICANT_WITHDRAWN,
                });
                if (!retired) {
                    throw Object.assign(new Error('a checkout was opened while withdrawing'), { code: 'WITHDRAW_PAYMENT_IN_FLIGHT' });
                }
                await writeApplicationStatus({
                    prisma: tx,
                    applicationId: application.id,
                    fromStatus: application.status,
                    toStatus: 'CANCELLED',
                    expectedVersion: application.version,
                    actorId: req.user.id,
                    actorRole: 'health',
                    reason: 'APPLICANT_WITHDRAWN',
                    assertTransition: true,
                    holderScope: scope,
                    additionalData: {
                        closedReason: 'CANCELLED_BY_APPLICANT',
                        formData: {
                            ...formData,
                            workflowState: 'CANCELLED',
                            workflowStateUpdatedAt: at,
                            withdrawal: { reason, at, by: req.user.id, refund: 'NONE' },
                        },
                        workflowHistory: [
                            ...history,
                            buildWorkflowEvent({
                                action: 'APPLICANT_WITHDRAWN', fromStatus: application.status, toStatus: 'CANCELLED',
                                actorId: req.user.id, actorRole: 'health', metadata: { reason },
                            }),
                        ],
                    },
                });
            });
        } catch (writeErr) {
            if (writeErr?.code === 'CONCURRENCY_CONFLICT') { return refuse(res, 'WITHDRAW_NOT_ALLOWED'); }
            if (writeErr?.code === 'WITHDRAW_PAYMENT_IN_FLIGHT') { return refuse(res, 'WITHDRAW_PAYMENT_IN_FLIGHT'); }
            throw writeErr;
        }

        await notifyApplicationParties(application.id, {
            type: 'INFO',
            title: 'ถอนคำขอแล้ว',
            message: `คำขอเลขที่ ${application.applicationNumber} ถูกถอนตามคำขอของผู้ยื่นและยกเลิกแล้ว ค่าบริการที่ชำระแล้วไม่คืน`,
            data: { applicationNumber: application.applicationNumber, action: 'APPLICANT_WITHDRAWN', reason },
        });

        return res.json({ success: true, data: { id: application.id, status: 'CANCELLED' } });
    } catch (error) {
        return respondError(res, req, error, { message: 'Failed to withdraw application' });
    }
});

module.exports = router;
