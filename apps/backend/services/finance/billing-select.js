'use strict';

/**
 * คอลัมน์ของคำขอ (Application) ที่ประตูการเงินส่งออกไปได้ — ชุดเดียวทั้งระบบ
 *
 * มติ F-SCOPE-01 (2026-09-07): "การเงินเห็นเฉพาะเรื่องเงิน" · security review 2026-09-27 (S1)
 * วัดได้ว่า invoice-service ดึง `application: { include: ... }` ซึ่งคืนทุก scalar
 * ของ Application ไปถึงหน้าจอการเงิน: formData (เลขบัตรประชาชน/เลขผู้เสียภาษีที่ถอดรหัสแล้ว),
 * workflowHistory (เลขประจำตัวเจ้าหน้าที่), auditNotes, labResults, IP
 *
 * ชุดนี้คือทุกอย่างที่หน้าบัญชีและใบเสร็จใช้จริง (เลขที่คำขอ + ชื่อผู้ถือใบ) บวกสถานะ/ประเภท
 * ที่ใช้จัดหมวดบิล · ห้ามเพิ่มคอลัมน์ข้อมูลส่วนบุคคลหรือข้อมูลงานตรวจ — ถ้าเอกสาร PDF ต้องใช้
 * ข้อมูลเต็ม ให้ดึงผ่านทางภายในที่ไม่ถูกส่งออกไปหาผู้เรียก (invoice-service.getForDocument)
 */
const { PAYER_ENTITY_SELECT, payerTaxBlock } = require('../../utils/applicant-resolver');
const { maskThaiId } = require('../../utils/field-encryption');
const { readsFullTaxIds } = require('./company-books-access');

const BILLING_APPLICATION_SELECT = Object.freeze({
    select: Object.freeze({
        id: true,
        applicationNumber: true,
        status: true,
        serviceType: true,
        areaType: true,
        entity: Object.freeze({ select: Object.freeze({ id: true, type: true, displayName: true }) }),
    }),
});

/**
 * The billing set plus what the payer block is computed from: the payer's holder record on
 * its entity (name, registration number, address). The application's formData is not read;
 * identity lives on the holder record only (order 142). INTERNAL: a row read with it goes
 * through toBillingWithPayer before it leaves the service, so the entity's tax columns and
 * holder payload never reach the caller.
 */
const BILLING_WITH_PAYER_SELECT = Object.freeze({
    select: Object.freeze({
        ...BILLING_APPLICATION_SELECT.select,
        entity: Object.freeze({ select: PAYER_ENTITY_SELECT }),
    }),
});

/**
 * The payer's tax-document block as a staff member reads it: the id in full for the
 * company finance officer, who keeps the books (order 57), and masked to its first digit
 * and last four for every other reader (orders 10, 34). An id the resolver did not print
 * ('-') stays '-'.
 *
 * @param {object | null} viewer req.user
 * @param {object} record what payerTaxBlock reads (formData + entity)
 */
function payerTaxBlockFor(viewer, record) {
    const block = payerTaxBlock(record);
    if (readsFullTaxIds(viewer) || !/\d/.test(block.idPrinted)) { return block; }
    return { ...block, idPrinted: maskThaiId(block.idPrinted) };
}

/**
 * A row read with BILLING_WITH_PAYER_SELECT → the billing application and the payer's
 * tax-document block (name + address, no contact; order 18, operator 2026-10-06), its id
 * as `viewer` may read it (payerTaxBlockFor).
 *
 * @param {object | null} application
 * @param {object | null} [applicant] the filer's User row (name fallback for a person with no entity)
 * @param {object | null} [viewer] req.user
 * @returns {{ application: object | null, payer: object | null }}
 */
function toBillingWithPayer(application, applicant = null, viewer = null) {
    if (!application) { return { application: null, payer: null }; }
    const { formData: _formData, entity, applicant: nested, ...billing } = application;
    return {
        application: {
            ...billing,
            ...(nested === undefined ? {} : { applicant: nested }),
            entity: entity ? { id: entity.id, type: entity.type, displayName: entity.displayName } : null,
        },
        payer: payerTaxBlockFor(viewer, { ...application, applicant: nested || applicant || {} }),
    };
}

module.exports = { BILLING_APPLICATION_SELECT, BILLING_WITH_PAYER_SELECT, toBillingWithPayer, payerTaxBlockFor };
