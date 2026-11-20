'use strict';

const PAYMENT_MODES = Object.freeze({ TRIAL: 'TRIAL', LIVE: 'LIVE' });

const TRIAL_COPY = Object.freeze({
    notice: 'ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง',
    documentMark: 'เอกสารทดลอง',
    documentMarkDetail: 'ไม่ใช่เอกสารทางภาษี ยังไม่มีการเก็บเงินจริง',
});

const TRIAL_RECEIPT_NOTICE = 'ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง ใบเสร็จรับเงิน/ใบกำกับภาษีเป็นเอกสารทดลอง ไม่ใช่เอกสารทางภาษี';
const TRIAL_REFUND_NOTICE = 'ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง จึงไม่มีการคืนเงินจริง ใบลดหนี้เป็นเอกสารทดลอง ไม่ใช่เอกสารทางภาษี';
const TRIAL_REFUND_SMS = 'ช่วงทดลองระบบ ไม่มีการเก็บและคืนเงินจริง';

/**
 * The copy is served in both modes: a screen on live keys still stamps a document whose
 * settlement was recorded in test mode (settledPaymentMode).
 */
function describePaymentMode(mode) {
    return { mode, ...TRIAL_COPY };
}

/** The mode of a Stripe PaymentIntent. An intent that does not say it is live (the mock rail) moved no real money. */
function paymentModeOfIntent(paymentIntent) {
    return paymentIntent?.livemode === true ? PAYMENT_MODES.LIVE : PAYMENT_MODES.TRIAL;
}

function metadataObject(metadata) {
    if (typeof metadata === 'string') {
        try { return metadataObject(JSON.parse(metadata)); } catch { return {}; }
    }
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

/**
 * The mode the settlement that paid this invoice ran in, as recorded in metadata.livemode;
 * null while no money has reached it. A paid row without the record was paid before the
 * record existed, when every settlement was test mode.
 */
function settledPaymentMode(invoice) {
    if (!invoice?.paidAt) { return null; }
    return metadataObject(invoice.metadata).livemode === true ? PAYMENT_MODES.LIVE : PAYMENT_MODES.TRIAL;
}

module.exports = {
    PAYMENT_MODES,
    TRIAL_COPY,
    TRIAL_RECEIPT_NOTICE,
    TRIAL_REFUND_NOTICE,
    TRIAL_REFUND_SMS,
    describePaymentMode,
    paymentModeOfIntent,
    metadataObject,
    settledPaymentMode,
};
