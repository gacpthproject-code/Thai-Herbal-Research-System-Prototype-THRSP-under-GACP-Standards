'use strict';

/**
 * The order not to certify (TERMINAL_DECISION official letter): template SSOT.
 *
 * R2 M3b made a refusal a letter of its own kind (an administrative order, not a correction
 * round). Order 56(2) asks it to state the facts, the rule, the consideration and how to appeal
 * (APA ss.37, 40, 44); spec 5.5 lists the parts:
 *
 *   1. the title, and the issuer sentence of order 56(0)
 *   2. the facts: holder, site, the visit and the field inspector's recorded result, the findings,
 *      the correction rounds already run
 *   3. the reason from the fixed list (order 44, or the approver's own words for OTHER) and the
 *      rule it rests on
 *   4. the consideration the approver wrote for the applicant (s.37), apart from the internal note
 *   5. the order
 *   6. how to appeal: the right, the time limit and the channel from the appeal setting
 *      (shared/appeal-setup.js, order 118(1)); without it there is no order.
 *   7. the right to file a new application
 *
 * No official's name, position or signature is printed (order 83(3)). Nothing is owed after the
 * order, so it carries no deadline. A part that cannot be stated refuses the letter (throw), and
 * with it the refusal (D-8, enforced at services/decision-letter-service.js).
 */

const { STATUS_PRESENTATION } = require('./status-machine-contract');
const { formatThaiDateFull } = require('../utils/thai-format');
const { parseAppealSetup } = require('./appeal-setup');

const TERMINAL_DECISION_LETTER_TYPE = 'TERMINAL_DECISION';

const TERMINAL_DECISION_RULE =
    'การพิจารณาอาศัยมาตรฐานการปฏิบัติทางการเกษตรและการเก็บเกี่ยวที่ดีสำหรับพืชสมุนไพร (มาตรฐาน GACP) และรายการตรวจประเมินที่ใช้ตรวจคำขอนี้';

const INSPECTOR_VERDICT_TH = Object.freeze({ PASS: 'ผ่าน', FAIL: 'ไม่ผ่าน' });

const present = (value) => String(value || '').trim();

function factLines(facts) {
    const lines = [];
    if (present(facts.holderName)) { lines.push(`ผู้ขอรับการรับรอง: ${present(facts.holderName)}`); }
    const site = [present(facts.siteName), present(facts.siteAddress)].filter(Boolean).join(' ');
    if (site) { lines.push(`สถานที่ปลูก: ${site}`); }
    if (facts.visitedAt) { lines.push(`ผู้ตรวจพื้นที่ลงพื้นที่ตรวจประเมินเมื่อวันที่ ${formatThaiDateFull(facts.visitedAt)}`); }
    const verdict = INSPECTOR_VERDICT_TH[facts.inspectorVerdict];
    if (verdict) {
        const when = facts.inspectorDecidedAt ? ` เมื่อวันที่ ${formatThaiDateFull(facts.inspectorDecidedAt)}` : '';
        lines.push(`ผู้ตรวจพื้นที่บันทึกผลว่า ${verdict}${when}`);
    }
    const findings = (Array.isArray(facts.findings) ? facts.findings : []).map(present).filter(Boolean);
    if (findings.length) {
        lines.push('ข้อบกพร่องที่พบ', ...findings.map((finding, index) => `${index + 1}. ${finding}`));
    }
    if (Number.isInteger(facts.correctionRounds) && facts.correctionRounds > 0) {
        lines.push(`มีการแก้ไขข้อบกพร่องจากการตรวจพื้นที่มาแล้ว ${facts.correctionRounds} รอบ`);
    }
    return lines;
}

/**
 * @param {object} order
 * @param {string} order.applicationNumber
 * @param {string} order.stage the status the refusal was decided from (kept in metadata, never printed)
 * @param {string} order.reason the reason's label, or the typed reason for OTHER (part 3)
 * @param {string} order.consideration the approver's consideration for the applicant (part 4)
 * @param {object} order.facts holderName, siteName, siteAddress, visitedAt, inspectorVerdict,
 *   inspectorDecidedAt, findings (strings), correctionRounds (part 2)
 * @param {object} order.appeal the appeal setting in force (part 6)
 * @param {string} [order.refusalId] the order's id, the same on every party's letter
 * @returns {{ title: string, message: string, metadata: object }}
 * @throws when the stage is not a workflow state or a part is missing: no letter, no refusal (D-8)
 */
function buildTerminalDecisionLetter({ applicationNumber, stage, reason, consideration, facts, appeal, refusalId }) {
    // hasOwnProperty, not a bare lookup: "constructor" must not resolve to a prototype member.
    if (typeof stage !== 'string' || !Object.prototype.hasOwnProperty.call(STATUS_PRESENTATION, stage)) {
        throw new Error(`[TerminalDecisionLetter] unknown decision stage "${stage}" — letter refused (D-8: no letter, no transition)`);
    }
    const decisionReason = present(reason);
    if (!decisionReason) {
        throw new Error('[TerminalDecisionLetter] missing decision reason — a terminal order without its stated ground is refused (D-8: no letter, no transition)');
    }
    const stated = present(consideration);
    if (!stated) {
        throw new Error('[TerminalDecisionLetter] missing consideration — an order the applicant cannot read the consideration of is refused (APA s.37, D-8)');
    }
    if (!facts || typeof facts !== 'object') {
        throw new Error('[TerminalDecisionLetter] missing facts — an order without its facts is refused (APA s.37, D-8)');
    }
    const appealSetup = parseAppealSetup(appeal);
    if (!appealSetup) {
        throw new Error('[TerminalDecisionLetter] no appeal setting — an order that cannot say how to appeal is refused (order 118(1), APA s.40)');
    }
    const { CERTIFICATE_ISSUER_TH } = require('../services/certificate/public-facts');

    const title = `หนังสือแจ้งคำสั่งไม่ให้การรับรองมาตรฐาน GACP คำขอเลขที่ ${applicationNumber}`;
    const body = [
        'เรียน ผู้ยื่นคำขอ',
        '',
        `ตามที่ท่านได้ยื่นคำขอรับรองมาตรฐาน GACP คำขอเลขที่ ${applicationNumber} นั้น ได้พิจารณาแฟ้มคำขอแล้ว จึงแจ้งคำสั่งดังนี้`,
        CERTIFICATE_ISSUER_TH,
        '',
        'ข้อเท็จจริง',
        ...factLines(facts),
        '',
        'เหตุผลและหลักเกณฑ์ที่ใช้พิจารณา',
        decisionReason,
        TERMINAL_DECISION_RULE,
        '',
        'ข้อพิจารณา',
        stated,
        '',
        'คำสั่ง',
        `จึงมีคำสั่งไม่ให้การรับรองคำขอเลขที่ ${applicationNumber} และปิดคำขอนี้`,
        '',
        'สิทธิ์อุทธรณ์',
        `ท่านมีสิทธิ์อุทธรณ์คำสั่งนี้ภายใน ${appealSetup.timeLimitDays} วันนับแต่วันที่ได้รับแจ้งคำสั่ง`,
        `ช่องทางการอุทธรณ์: ${appealSetup.channel}`,
        '',
        'สิทธิ์ของผู้ยื่นคำขอ',
        'ท่านสามารถยื่นคำขอรับรองใหม่ได้ตามขั้นตอนปกติ โดยกรอกข้อมูลใหม่และชำระค่าบริการตามอัตราที่กำหนด',
    ].join('\n');

    return {
        title,
        message: body,
        metadata: {
            applicationNumber,
            stage,
            letterType: TERMINAL_DECISION_LETTER_TYPE,
            reason: decisionReason,
            appeal: appealSetup,
            ...(refusalId ? { refusalId } : {}),
        },
    };
}

module.exports = {
    TERMINAL_DECISION_LETTER_TYPE,
    buildTerminalDecisionLetter,
};
