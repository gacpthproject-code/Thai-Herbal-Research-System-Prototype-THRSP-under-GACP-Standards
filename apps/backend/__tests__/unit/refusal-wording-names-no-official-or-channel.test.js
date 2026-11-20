'use strict';

const { buildTerminalDecisionLetter } = require('../../shared/terminal-letter-template');
const { CERTIFICATE_ISSUER_TH } = require('../../services/certificate/public-facts');
const { getTemplateForType } = require('../../services/notification-fanout-service');

const { TEST_APPEAL_SETUP } = require('../../test-support/appeal-setup');

const APPEAL_LINES = [
    'สิทธิ์อุทธรณ์',
    `ท่านมีสิทธิ์อุทธรณ์คำสั่งนี้ภายใน ${TEST_APPEAL_SETUP.timeLimitDays} วันนับแต่วันที่ได้รับแจ้งคำสั่ง`,
    `ช่องทางการอุทธรณ์: ${TEST_APPEAL_SETUP.channel}`,
];
const NAMES_AN_OFFICIAL_BODY_DEADLINE_OR_CHANNEL =
    /ผู้อนุมัติ|อธิบดี|ผู้อำนวยการ|รัฐมนตรี|เลขาธิการ|คณะกรรมการ|ศาล|กรม|กระทรวง|โทร|อีเมล|@|https?:\/\/|www\.|ภายใน\s*\d+\s*วัน/;

const ORDER = {
    applicationNumber: 'APP-ORDER91-1',
    stage: 'AUDIT_NOT_PASSED',
    reason: 'แปลงปลูกไม่เป็นไปตามมาตรฐานที่ยื่นขอ',
    consideration: 'ข้อบกพร่องทั้งสองข้อกระทบความปลอดภัยของผลผลิตโดยตรง และยังไม่มีหลักฐานการแก้ไข',
    refusalId: 'refusal-order91-1',
    appeal: TEST_APPEAL_SETUP,
    facts: {
        holderName: 'บริษัท ทดสอบคำสั่ง จำกัด',
        siteName: 'แปลงทดสอบ',
        siteAddress: 'ตำบลทดสอบ อำเภอทดสอบ',
        visitedAt: new Date('2026-10-01T03:00:00Z'),
        inspectorVerdict: 'FAIL',
        inspectorDecidedAt: new Date('2026-10-01T05:00:00Z'),
        findings: ['ไม่มีบันทึกการใช้ปุ๋ย', 'ที่เก็บผลผลิตไม่มีการป้องกันสัตว์'],
        correctionRounds: 0,
    },
};

describe('order 91 with order 118(1): refusal wording names no deciding official, and the appeal part is the setting DTAM answered, nothing more', () => {
    it('the refusal letter states the appeal setting and names no official, body, deadline or channel of its own', () => {
        const lines = buildTerminalDecisionLetter(ORDER).message.split('\n');
        expect(lines.filter((line) => line.includes('อุทธรณ์'))).toEqual(APPEAL_LINES);
        const named = lines
            .filter((line) => line !== CERTIFICATE_ISSUER_TH && !APPEAL_LINES.includes(line))
            .filter((line) => NAMES_AN_OFFICIAL_BODY_DEADLINE_OR_CHANNEL.test(line));
        expect(named).toEqual([]);
    });

    it('the notice of a failed visit tells the applicant the result will be announced without naming who decides', () => {
        const notice = getTemplateForType('INSPECTION_RESULT_RECORDED', { applicationNumber: 'APP-ORDER91-1', findings: ['ไม่มีบันทึกการใช้ปุ๋ย'] });
        const texts = [notice.subjectTH, notice.bodyTHText, notice.bodyTHHtml, notice.smsTH];
        expect(texts.filter((text) => NAMES_AN_OFFICIAL_BODY_DEADLINE_OR_CHANNEL.test(text))).toEqual([]);
        expect(notice.bodyTHText).toContain('แจ้งผลให้ทราบ');
    });
});
