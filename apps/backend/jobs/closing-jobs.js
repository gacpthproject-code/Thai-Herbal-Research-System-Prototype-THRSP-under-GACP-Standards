'use strict';

const CLOSING_JOBS = Object.freeze({
    async revisionDeadlineChecker() {
        await require('../services/special-holiday-service').refreshSpecialHolidays();
        return require('./revision-deadline-checker').checkExpiredDeadlines();
    },
    correctionDeadlineSweep: () => require('./correction-deadline-sweep').runCorrectionDeadlineSweep(),
    paymentClosureSweep: () => require('./payment-closure-job').runPaymentClosureSweep(),
    carStagedFilesSweep: () => require('../services/car-staged-files-sweep').runCarStagedFilesSweep(),
});

module.exports = { CLOSING_JOBS };
