'use strict';

/**
 * CAR / corrective-action deadline helper (workflow audit 2026-06-11, HIGH). The on-site window is
 * dated data in config/business-rules.js CORRECTIVE_ACTION.ONSITE_WINDOW (order 56(2a)), separate
 * from the document revision window (services/correction-windows.js).
 */

const { onsiteCorrectionDueAt } = require('./correction-windows');

/**
 * The on-site corrective-action due date for a defect raised at `from`.
 * @param {Date} [from]
 * @returns {Date}
 */
function computeCarDueDate(from = new Date()) {
    return onsiteCorrectionDueAt(from);
}

module.exports = {
    computeCarDueDate,
};
