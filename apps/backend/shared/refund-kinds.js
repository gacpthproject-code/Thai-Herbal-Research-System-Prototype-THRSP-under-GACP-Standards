'use strict';

/**
 * The refunds the platform records (order 22, operator 2026-10-06, payment
 * terms v1.3 §7). The company returns the money outside the system; finance
 * records it here and the credit note is issued.
 *
 *   DUPLICATE           the applicant was charged twice or too much (§7.3).
 *                       Only the excess is credited. The milestone stays paid
 *                       and the application does not move.
 *   PROVIDER_CANCELLED  the company or the state cancelled the service (§7.2)
 *                       before the paid milestone's service started (§7.2.3). The
 *                       whole milestone is credited, it counts as unpaid, and
 *                       the application closes as CANCELLED.
 *
 * An applicant who cancels, and a cancellation caused by a system error, get no
 * refund kind: the first is not refunded, the second is repaired by restoring
 * the case (operator 2026-10-06).
 */
const { addWorkingDays } = require('../utils/working-days');

const REFUND_KINDS = Object.freeze({
    DUPLICATE: 'DUPLICATE',
    PROVIDER_CANCELLED: 'PROVIDER_CANCELLED',
});

/**
 * Every payment-terms version a checkout order can carry
 * (checkout_orders.paymentTermsVersion is stamped from ConsentVersions.PAYMENT_TERMS),
 * with the working days reason (ง) of §7.2.1 gives the company to inspect after the
 * milestone-2 payment (operator 2026-10-06). null: that version set no window.
 * '1.0.0' is the stamp orders carried before v1.1 shipped its own default (F-G4-64).
 * A payment keeps the rule of the version it was made under. A stamp this table
 * does not know (a misspelled CONSENT_VERSION_PAYMENT_TERMS, say) is refused rather
 * than read as "no window".
 */
const PAYMENT_TERMS_VERSIONS = Object.freeze({
    '1.0.0': Object.freeze({ companyInspectWorkingDays: null }),
    'payment-terms-th-v1.1': Object.freeze({ companyInspectWorkingDays: null }),
    'payment-terms-th-v1.2': Object.freeze({ companyInspectWorkingDays: null }),
    'payment-terms-th-v1.3': Object.freeze({ companyInspectWorkingDays: 60 }),
});

/** The newest version, whose window the reason list shows. */
const CURRENT_TERMS = Object.values(PAYMENT_TERMS_VERSIONS).at(-1);

function termsOf(termsVersion) {
    const terms = Object.prototype.hasOwnProperty.call(PAYMENT_TERMS_VERSIONS, termsVersion)
        ? PAYMENT_TERMS_VERSIONS[termsVersion]
        : null;
    if (!terms) {
        throw Object.assign(
            new Error(`Payment terms version ${JSON.stringify(termsVersion)} is not in shared/refund-kinds.js PAYMENT_TERMS_VERSIONS`),
            { code: 'REFUND_TERMS_VERSION_UNKNOWN', statusCode: 409 },
        );
    }
    return terms;
}

/**
 * The last day (end of the Bangkok working day) by which the company must have
 * inspected, for a milestone-2 payment settled at `paidAt` under `termsVersion`.
 * Null when that version set no window or the payment date is unknown.
 */
function companyInspectionDeadline(paidAt, termsVersion) {
    const workingDays = termsOf(termsVersion).companyInspectWorkingDays;
    if (!workingDays || !paidAt) {
        return null;
    }
    return addWorkingDays(paidAt, workingDays);
}

function cannotInspectReason(workingDays) {
    const window = workingDays ? `ภายใน ${workingDays} วันทำการ นับจากวันที่ชำระเงินงวดที่ 2 ` : ' ';
    return `บริษัทไม่สามารถตรวจประเมินแปลงได้${window}ด้วยเหตุฝ่ายบริษัท เช่น ไม่มีผู้ตรวจที่จะไปตรวจได้`;
}

/**
 * Why the company or the state cancelled. Closed list: the officer picks one
 * and adds a note. The reason is printed on the credit note and told to the
 * applicant; the note stays on the internal refund record.
 * apps/web-app/src/constants/refund-kinds.ts mirrors it.
 */
const PROVIDER_CANCELLATION_REASONS = Object.freeze({
    DEPARTMENT_STOPPED_CERTIFYING: 'กรมการแพทย์แผนไทยและการแพทย์ทางเลือก หรือหน่วยงานของรัฐที่มีอำนาจ ยุติหรือระงับการรับรอง GACP สำหรับชนิดพืชสมุนไพรหรือรูปแบบการปลูกที่ขอรับรอง',
    BARRED_BY_LAW_OR_ORDER: 'มีกฎหมาย ระเบียบ ประกาศ หรือคำสั่งของหน่วยงานของรัฐ ที่ห้ามหรือทำให้บริษัทไม่อาจให้บริการตามคำขอต่อได้',
    COMPANY_STOPPED_SERVICE: 'บริษัทยุติการให้บริการ ทั้งหมด หรือเฉพาะชนิดพืชสมุนไพรหรือรูปแบบการปลูกที่ขอรับรอง',
    COMPANY_CANNOT_INSPECT: cannotInspectReason(CURRENT_TERMS.companyInspectWorkingDays),
});

/**
 * The milestones each reason may cancel: reason (ง) is about the field inspection, which the
 * milestone-2 payment pays for. apps/web-app/src/constants/refund-kinds.ts mirrors it.
 */
const PROVIDER_CANCELLATION_REASON_MILESTONES = Object.freeze({
    DEPARTMENT_STOPPED_CERTIFYING: Object.freeze(['M1', 'M2']),
    BARRED_BY_LAW_OR_ORDER: Object.freeze(['M1', 'M2']),
    COMPANY_STOPPED_SERVICE: Object.freeze(['M1', 'M2']),
    COMPANY_CANNOT_INSPECT: Object.freeze(['M2']),
});

/**
 * The reason as printed on the credit note and told to the applicant, for a
 * payment made under `termsVersion`: reason (ง) states that version's window,
 * and none when it set none.
 */
function providerCancellationReasonText(reasonCode, termsVersion) {
    if (reasonCode === 'COMPANY_CANNOT_INSPECT') {
        return cannotInspectReason(termsOf(termsVersion).companyInspectWorkingDays);
    }
    return PROVIDER_CANCELLATION_REASONS[reasonCode];
}

/** Payment terms v1.3 §7.4: the company transfers the refund within 15 working days. */
const REFUND_TRANSFER_WORKING_DAYS = 15;

/** Payment terms v1.3 §11.1: where the applicant sends refund account details. */
const REFUND_CONTACT_EMAIL = 'support@gacpth.com';

module.exports = {
    REFUND_KINDS,
    PROVIDER_CANCELLATION_REASONS,
    PROVIDER_CANCELLATION_REASON_MILESTONES,
    PAYMENT_TERMS_VERSIONS,
    companyInspectionDeadline,
    providerCancellationReasonText,
    REFUND_TRANSFER_WORKING_DAYS,
    REFUND_CONTACT_EMAIL,
};
