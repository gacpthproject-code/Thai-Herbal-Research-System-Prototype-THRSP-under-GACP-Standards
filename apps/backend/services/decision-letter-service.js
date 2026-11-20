'use strict';

/**
 * Decision-letter service — R2 M2 (operator decision D-8, 2026-08-03;
 * evidence/R2-special-reopen/decisions-final.md).
 *
 * D-8 verbatim: "นาฬิกา 5 วันทำการเริ่มที่ transaction บันทึกผล+ออกจดหมาย
 * (atomic — ออกจดหมายไม่ได้ = transition ไม่สำเร็จ)".
 *
 * Contract:
 *   - MUST be called with the SAME transaction client `tx` as the status
 *     write (createOfficialLetter enforces the tx handle) — commit/rollback
 *     is shared.
 *   - NEVER swallows errors. Unresolvable recipient, incomplete letter
 *     content, or a failed row write all throw → the caller's transaction
 *     fails → the decision is NOT recorded and the correction clock does
 *     not start. Do not wrap calls in catch-and-continue.
 *   - Letter copy comes from shared/correction-letter-template.js (SSOT,
 *     Law 3.5/3.6); this service adds no wording.
 *   - R2 M3 (FINAL ข้อ 2): every mint also APPENDS one CorrectionRound row
 *     (per-stage round ledger) through the same tx — roundNo counted here,
 *     stamped into the letter as mandatory element 5. Append-only: no code
 *     path may update or delete a round row (FINAL ข้อ 4).
 *   - Best-effort side channels (plain in-app notice, email, SMS) stay with
 *     the existing post-commit pipelines — deliberately NOT fired here.
 *
 * R2 M3b extends the SAME service with the terminal branch
 * (mintTerminalDecisionLetters): a refusal is an administrative order, not a
 * correction round, so it carries the separate terminal template and writes NO
 * round row.
 */

const { findUserByHealthIdSecurely } = require('./user-lookup-service');
const { createOfficialLetter } = require('./notification-service');
const {
    buildCorrectionLetter,
    CORRECTION_LETTER_STAGE,
} = require('../shared/correction-letter-template');
const { buildTerminalDecisionLetter } = require('../shared/terminal-letter-template');
const { roundStageForLetterStage } = require('../shared/correction-round-stage');
const { ERROR_CODES } = require('../shared/error-codes');

/**
 * Resolve the correction letter's recipient, or fail the caller's decision transaction: the
 * letter row requires a real user AND a tenant. No recipient means no letter, which under D-8
 * means no transition.
 *
 * @param {string} healthId Applicant identifier carried on the application.
 * @param {string} applicationId Only for the error message.
 * @returns {Promise<{ id: string, organizationId: string }>}
 */
async function resolveLetterRecipient(healthId, applicationId) {
    const recipient = await findUserByHealthIdSecurely(healthId, {
        select: { id: true, organizationId: true },
    });
    if (!recipient?.id || !recipient.organizationId) {
        throw new Error(
            `[DecisionLetter] cannot resolve letter recipient for application ${applicationId} — D-8: no letter, no transition`,
        );
    }
    return recipient;
}

/**
 * Mint the official correction letter inside the caller's decision
 * transaction.
 *
 * @param {object} args
 * @param {object} args.tx Prisma transaction client of the decision write.
 * @param {string} args.healthId Applicant's healthId (recipient lookup).
 * @param {string} args.applicationId
 * @param {string} args.applicationNumber
 * @param {string} args.stage One of CORRECTION_LETTER_STAGE.
 * @param {Array<string>} [args.items] Structured issue list of the surface.
 * @param {string} [args.message] Decision comment/notes (fallback item).
 * @param {Date|string} args.dueAt Resubmission deadline (computed by the
 *   caller with the canonical Thai-holiday engine).
 * @returns {Promise<object>} The created Notification (letter) row.
 */
async function mintCorrectionLetter({
    tx,
    healthId,
    applicationId,
    applicationNumber,
    stage,
    items,
    message,
    instruction,
    dueAt,
}) {
    // A deadline already behind us is an order the applicant cannot meet (a stale
    // formData.revisionDueAt carried into a new round). No letter, so no transition.
    const due = new Date(dueAt || NaN);
    if (!Number.isNaN(due.getTime()) && due.getTime() <= Date.now()) {
        const row = ERROR_CODES.CORRECTION_DUE_DATE_PASSED;
        throw Object.assign(new Error(row.messageTh), { code: row.code, statusCode: row.httpStatus, status: row.httpStatus });
    }

    // Recipient must resolve to a real user WITH a tenant — the letter row
    // requires both. Failing here fails the decision (D-8).
    const recipient = await resolveLetterRecipient(healthId, applicationId);

    // R2 M3 (FINAL ข้อ 2: "นับเลขครั้งต่อ stage — reset ทุกรอบ วนไม่จำกัด
    // ครั้ง"): per-stage round number = prior rounds of this (application,
    // stage) + 1, counted INSIDE the decision transaction. No cap — the
    // 3-strike rule was revoked (decisions-final.md D-2). The count and the
    // append below run through the SAME tx as the status write + letter, so
    // the round can never exist without its decision or vice versa.
    const roundStage = roundStageForLetterStage(stage);
    const priorRounds = await tx.correctionRound.count({
        where: { applicationId, stage: roundStage },
    });
    const roundNo = priorRounds + 1;

    const letter = buildCorrectionLetter({ applicationNumber, stage, items, message, instruction, dueAt, roundNo });

    const letterRow = await createOfficialLetter({
        tx,
        userId: recipient.id,
        organizationId: recipient.organizationId,
        type: 'WARNING',
        priority: 'HIGH',
        title: letter.title,
        message: letter.message,
        metadata: { ...letter.metadata, applicationId },
    });

    // Append-only round ledger (FINAL ข้อ 4: record ใหม่มีเลขครั้ง ของเก่าคง
    // อยู่) — one row per decision, NEVER updated or deleted. organizationId
    // mirrors the letter row's tenant (M1 idiom: tx clients bypass the tenant
    // extension, so the tenant is stamped explicitly from the resolved
    // recipient). Two concurrent decisions that computed the same roundNo hit
    // the (applicationId, stage, roundNo) unique key; Postgres aborts the
    // transaction on the violation, so an in-tx retry is impossible BY DESIGN
    // — fail loudly, the whole decision rolls back, the caller re-issues it.
    try {
        await tx.correctionRound.create({
            data: {
                applicationId,
                stage: roundStage,
                roundNo,
                decidedAt: new Date(),
                dueAt: new Date(letter.metadata.dueAt),
                letterId: letterRow.id,
                organizationId: recipient.organizationId,
            },
        });
    } catch (error) {
        if (error?.code === 'P2002') {
            throw new Error(
                `[DecisionLetter] correction round ${roundNo} (${roundStage}) already recorded for application ${applicationId} — concurrent decision detected, transaction refused (retry the decision)`,
            );
        }
        throw error;
    }

    return letterRow;
}

/**
 * Mint the order not to certify inside the caller's refusal transaction: one official letter per
 * party (the applicant and every holder member who may file, orders 29 and 32), each carrying the
 * same refusalId. Same D-8 contract as the correction mint: the SAME `tx` as the status write, no
 * error swallowed, no wording of its own. A terminal order is not a correction round, so no round
 * row; nothing is owed after it, so no deadline.
 *
 * @param {object} args
 * @param {object} args.tx Prisma transaction client of the refusal.
 * @param {string[]} args.recipientUserIds the parties, from applicationPartyUserIds.
 * @param {string} args.applicationId
 * @param {object} args.order what shared/terminal-letter-template.js builds the letter from.
 * @returns {Promise<object[]>} The created Notification (letter) rows.
 */
async function mintTerminalDecisionLetters({ tx, recipientUserIds, applicationId, order }) {
    const letter = buildTerminalDecisionLetter(order);
    const ids = [...new Set(Array.isArray(recipientUserIds) ? recipientUserIds : [])];
    const users = ids.length
        ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, organizationId: true } })
        : [];
    const tenantOf = new Map(users.filter((u) => u.organizationId).map((u) => [u.id, u.organizationId]));
    if (ids.length === 0 || ids.some((id) => !tenantOf.has(id))) {
        throw new Error(
            `[DecisionLetter] cannot resolve every letter recipient for application ${applicationId} — D-8: no letter, no transition`,
        );
    }
    const rows = [];
    for (const userId of ids) {
        rows.push(await createOfficialLetter({
            tx,
            userId,
            organizationId: tenantOf.get(userId),
            type: 'ERROR',
            priority: 'HIGH',
            title: letter.title,
            message: letter.message,
            metadata: { ...letter.metadata, applicationId },
        }));
    }
    return rows;
}

module.exports = {
    mintCorrectionLetter,
    mintTerminalDecisionLetters,
    CORRECTION_LETTER_STAGE,
};
