'use strict';

const { getZonedParts } = require('../utils/working-days');
const logger = require('./logger');

const APPEAL_SETUP_KEY = 'appeal.setup';

const CHANNEL_MAX_LENGTH = 500;
const SOURCE_REF_MAX_LENGTH = 200;
const TIME_LIMIT_DAYS_MAX = 365;

const text = (value, max) => {
    const stated = typeof value === 'string' ? value.trim() : '';
    return stated && stated.length <= max ? stated : null;
};

function isCalendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { return false; }
    const [year, month, day] = value.split('-').map(Number);
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    return daysInMonth !== undefined && day >= 1 && day <= daysInMonth;
}

const fromJson = (raw) => {
    if (typeof raw !== 'string') { return raw; }
    try { return JSON.parse(raw); } catch { return null; }
};

function parseAppealSetup(raw) {
    const value = fromJson(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) { return null; }
    const channel = text(value.channel, CHANNEL_MAX_LENGTH);
    const sourceRef = text(value.sourceRef, SOURCE_REF_MAX_LENGTH);
    const { effectiveFrom, timeLimitDays } = value;
    if (!channel || !sourceRef || !isCalendarDate(effectiveFrom)) { return null; }
    if (!Number.isInteger(timeLimitDays) || timeLimitDays < 1 || timeLimitDays > TIME_LIMIT_DAYS_MAX) { return null; }
    return { effectiveFrom, channel, timeLimitDays, sourceRef };
}

function parseWithdrawal(value) {
    if (!value || value.withdrawn !== true || !isCalendarDate(value.effectiveFrom)) { return null; }
    const sourceRef = text(value.sourceRef, SOURCE_REF_MAX_LENGTH);
    return sourceRef ? { effectiveFrom: value.effectiveFrom, withdrawn: true, sourceRef } : null;
}

function parseAppealHistory(raw) {
    const value = fromJson(raw);
    if (!Array.isArray(value) || value.length === 0) { return null; }
    const entries = value.map((entry) => parseWithdrawal(entry) || parseAppealSetup(entry));
    if (entries.some((entry) => !entry)) { return null; }
    entries.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    if (entries.some((entry, i) => i > 0 && entry.effectiveFrom === entries[i - 1].effectiveFrom)) { return null; }
    return entries;
}

async function appealSetupInForce({ db, at = new Date() }) {
    let row;
    try {
        row = await db.systemConfig.findUnique({ where: { key: APPEAL_SETUP_KEY } });
    } catch (error) {
        logger.warn(`[appeal-setup] could not read ${APPEAL_SETUP_KEY}, refusal held: ${error?.message}`);
        return null;
    }
    const history = parseAppealHistory(row?.value);
    if (!history) { return null; }
    const today = getZonedParts(at).isoDate;
    const current = history.filter((entry) => entry.effectiveFrom <= today).pop();
    return current && !current.withdrawn ? current : null;
}

module.exports = {
    APPEAL_SETUP_KEY, parseAppealSetup, parseAppealHistory, appealSetupInForce,
};
