'use strict';

const {
    CERT_NUMBER_FORMAT_KEY, CERT_NUMBER_NEW_YEAR_RULE_KEY,
} = require('../services/certificate-numbering-settings');

const SEEDED = [
    { key: CERT_NUMBER_FORMAT_KEY, value: '{n}/{year}' },
    { key: CERT_NUMBER_NEW_YEAR_RULE_KEY, value: '{"rule":"RESTART","firstNumber":1}' },
];

function certificateNumberingFake() {
    return {
        systemConfig: { findMany: jest.fn(async () => SEEDED) },
        receiptSequence: { upsert: jest.fn(async () => ({ counter: 1 })), update: jest.fn() },
        blockedCertificateNumber: { findMany: jest.fn(async () => []) },
    };
}

module.exports = { certificateNumberingFake };
