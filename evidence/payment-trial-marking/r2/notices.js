const path = require('path');
const backend = path.resolve(__dirname, '../../../apps/backend');
const { getTemplateForType } = require(path.join(backend, 'services/notification-fanout-service'));
const { WITHOUT_MONEY } = require(path.join(backend, 'services/notification/application-parties'));

/** The notice one party gets, as application-parties noticeForParty builds it from WITHOUT_MONEY. */
function noticeForParty(seesMoney, type, fields) {
    if (seesMoney) { return { type, fields }; }
    const w = WITHOUT_MONEY[type];
    return { type: w.type, fields: Object.fromEntries(w.keep.filter((k) => k in fields).map((k) => [k, fields[k]])) };
}
const { PAYMENT_MODES } = require(path.join(backend, 'shared/payment-mode'));

const PAYLOAD = {
    applicationNumber: 'GACP-2569-000123', invoiceId: 'inv-1', invoiceNumber: 'TAX-PRD-2026-000001',
    creditNoteNumber: 'CN-PRD-2026-000001', amount: 5885, reasonCode: 'COMPANY_CANNOT_INSPECT', priority: 'HIGH',
};
for (const type of ['REFUND_PROVIDER_CANCELLED', 'REFUND_DUPLICATE_CHARGE']) {
    for (const mode of [PAYMENT_MODES.TRIAL, PAYMENT_MODES.LIVE]) {
        for (const seesMoney of [true, false]) {
            const notice = noticeForParty(seesMoney, type, { ...PAYLOAD, paymentMode: mode });
            const t = getTemplateForType(notice.type, notice.fields);
            console.log(`## ${notice.type} · money collected in ${mode} · ${seesMoney ? 'party sees money' : 'party without VIEW_FINANCIAL'}`);
            console.log(`subject: ${t.subjectTH}`);
            console.log(`bell/mail: ${t.bodyTHText}`);
            console.log(`sms: ${t.smsTH}\n`);
        }
    }
}
