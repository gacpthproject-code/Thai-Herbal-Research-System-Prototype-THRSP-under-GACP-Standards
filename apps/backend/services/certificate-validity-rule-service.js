'use strict';

/**
 * อายุใบรับรองเป็นข้อมูลที่มีวันมีผล (operator 2026-10-06: "1 ปีไปก่อน อาจเปลี่ยน",
 * redesign phase 0). One register, certificate_validity_rules: from effectiveFrom on, a newly
 * issued certificate lasts `months`. Issuance asks for the rule in force at its own issue
 * instant; the public door asks for the rule in force now. A certificate already issued keeps
 * the validityMonths and expiryDate stored on its row, so a later rule never moves it.
 *
 * A new term is a new row with a later effectiveFrom (migration or SQL by the operator), never
 * an edit: the row that was in force is the record of why an issued certificate expires when
 * it does. No rule in force means no certificate: issuance refuses before any write rather than
 * invent a term.
 *
 * The term is the scheme owner's decision, not a figure from a department document: neither
 * แบบ กทล.1 nor the Thailand Cannabis GACP requirements state one (searched 2026-09-11), and
 * ISO/IEC 17065:2012 §7.7.1(e) requires a certificate to state its term without fixing it.
 * Each certificate counts from the day its own cultivation type passed (one certificate per
 * type, operator 2026-09-11), so two certificates of one application can expire on different days.
 */

const { addLocalMonths } = require('../utils/working-days');

function refuseNoRule(at) {
    const err = new Error(
        'ไม่สามารถออกใบรับรองได้ เนื่องจากยังไม่มีกฎอายุใบรับรองที่มีผล ณ วันออก '
        + 'ระบบไม่ได้บันทึกการเปลี่ยนแปลงใด ๆ กรุณาแจ้งผู้ดูแลระบบให้เพิ่มกฎอายุใบรับรอง',
    );
    err.code = 'CERTIFICATE_VALIDITY_RULE_MISSING';
    err.statusCode = 503;
    err.at = at.toISOString();
    return err;
}

/**
 * The rule in force at `at`: the latest effectiveFrom that is not after it.
 *
 * @param {Date} at
 * @param {{ client: object }} ctx  Prisma client or transaction
 * @returns {Promise<{ id: string, months: number, effectiveFrom: Date }>}
 * @throws {Error} code CERTIFICATE_VALIDITY_RULE_MISSING, statusCode 503
 */
async function validityRuleAt(at, { client }) {
    const rule = await client.certificateValidityRule.findFirst({
        where: { effectiveFrom: { lte: at } },
        orderBy: { effectiveFrom: 'desc' },
        select: { id: true, months: true, effectiveFrom: true },
    });
    if (!rule) {
        throw refuseNoRule(at);
    }
    return rule;
}

/**
 * The term a certificate issued at `issuedDate` gets: the rule's months, and the same Bangkok
 * wall-clock time that many calendar months later.
 *
 * @param {Date} issuedDate
 * @param {{ client: object }} ctx
 * @returns {Promise<{ validityMonths: number, expiryDate: Date }>}
 */
async function certificateTermAt(issuedDate, { client }) {
    const { months } = await validityRuleAt(issuedDate, { client });
    return { validityMonths: months, expiryDate: addLocalMonths(issuedDate, months) };
}

module.exports = { validityRuleAt, certificateTermAt };
