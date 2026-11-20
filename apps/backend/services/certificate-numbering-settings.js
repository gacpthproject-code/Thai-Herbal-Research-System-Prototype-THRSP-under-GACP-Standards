'use strict';

// certificate.number.year-start is absent until release day, when the operator sets
// DTAM's real next number (order 135); until then each year continues past its counter.

const { parseNumberFormat } = require('@gacp/validation/certificate-number');

const CERT_NUMBER_FORMAT_KEY = 'certificate.number.format';
const CERT_NUMBER_YEAR_START_KEY = 'certificate.number.year-start';
const CERT_NUMBER_NEW_YEAR_RULE_KEY = 'certificate.number.new-year-rule';
const CERTIFICATE_NUMBERING_KEYS = [CERT_NUMBER_FORMAT_KEY, CERT_NUMBER_YEAR_START_KEY, CERT_NUMBER_NEW_YEAR_RULE_KEY];

// The receipt_sequences row the running number lives in. The name predates the DTAM series;
// it stays so staging and demo continue from the counters they hold (order 135).
const CERTIFICATE_SEQUENCE_BUCKET = 'TH-GACP';

const NEW_YEAR_RULES = new Set(['RESTART']);
const MAX_NUMBER = 999999999;

const fromJson = (raw) => {
    if (typeof raw !== 'string') { return raw; }
    try { return JSON.parse(raw); } catch { return null; }
};
const isPositiveNumber = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_NUMBER;
const isBuddhistYear = (y) => Number.isInteger(y) && y >= 2500 && y <= 2599;

function parseYearStart(raw) {
    const value = fromJson(raw);
    if (!value || !isBuddhistYear(value.year) || !isPositiveNumber(value.start)) { return null; }
    return { year: value.year, start: value.start };
}

function parseNewYearRule(raw) {
    const value = fromJson(raw);
    if (!value || !NEW_YEAR_RULES.has(value.rule) || !isPositiveNumber(value.firstNumber)) { return null; }
    return { rule: value.rule, firstNumber: value.firstNumber };
}

function refuseSetting(key) {
    const err = new Error(
        'ไม่สามารถออกใบรับรองได้ เนื่องจากค่าตั้งเลขใบรับรองไม่ครบหรืออ่านไม่ได้ '
        + 'ระบบไม่ได้บันทึกการเปลี่ยนแปลงใด ๆ กรุณาแจ้งผู้ดูแลระบบให้ตั้งค่าเลขใบรับรอง',
    );
    err.code = 'CERTIFICATE_NUMBERING_SETTING_INVALID';
    err.statusCode = 503;
    err.settingKey = key;
    return err;
}

async function readCertificateNumbering(db) {
    const rows = await db.systemConfig.findMany({ where: { key: { in: CERTIFICATE_NUMBERING_KEYS } }, select: { key: true, value: true } });
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const format = parseNumberFormat(stored.get(CERT_NUMBER_FORMAT_KEY));
    if (!format) { throw refuseSetting(CERT_NUMBER_FORMAT_KEY); }
    const newYearRule = parseNewYearRule(stored.get(CERT_NUMBER_NEW_YEAR_RULE_KEY));
    if (!newYearRule) { throw refuseSetting(CERT_NUMBER_NEW_YEAR_RULE_KEY); }
    const yearStart = stored.has(CERT_NUMBER_YEAR_START_KEY) ? parseYearStart(stored.get(CERT_NUMBER_YEAR_START_KEY)) : null;
    if (stored.has(CERT_NUMBER_YEAR_START_KEY) && !yearStart) { throw refuseSetting(CERT_NUMBER_YEAR_START_KEY); }
    return { format, yearStart, newYearRule };
}

function firstNumberOfYear(numbering, year) {
    return numbering.yearStart && numbering.yearStart.year === year
        ? numbering.yearStart.start
        : numbering.newYearRule.firstNumber;
}

function chooseNumber({ counterNext, firstNumber, blocked }) {
    let number = Math.max(counterNext, firstNumber);
    const skipped = [];
    while (blocked.has(number)) { skipped.push(number); number += 1; }
    return { number, skipped };
}

module.exports = {
    CERT_NUMBER_FORMAT_KEY,
    CERT_NUMBER_YEAR_START_KEY,
    CERT_NUMBER_NEW_YEAR_RULE_KEY,
    CERTIFICATE_NUMBERING_KEYS,
    CERTIFICATE_SEQUENCE_BUCKET,
    parseYearStart,
    parseNewYearRule,
    readCertificateNumbering,
    firstNumberOfYear,
    chooseNumber,
};
