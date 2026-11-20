'use strict';

const LEGAL_DOCUMENT_CHANGE = Object.freeze({ MATERIAL: 'MATERIAL', WORDING: 'WORDING' });

const LEGAL_DOCUMENT_HISTORY = Object.freeze({
    PRIVACY_POLICY: Object.freeze([
        Object.freeze({ version: '1.4', effectiveDate: '2026-10-28', change: LEGAL_DOCUMENT_CHANGE.MATERIAL }),
    ]),
    TERMS_OF_SERVICE: Object.freeze([
        Object.freeze({ version: '1.1', effectiveDate: '2026-10-03', change: LEGAL_DOCUMENT_CHANGE.MATERIAL }),
    ]),
});

const LEGAL_DOCUMENT_STANDING = Object.freeze({
    CURRENT: 'CURRENT',
    WORDING_NOTICE: 'WORDING_NOTICE',
    MUST_ACKNOWLEDGE: 'MUST_ACKNOWLEDGE',
});

function lastMaterialIndex(history) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].change === LEGAL_DOCUMENT_CHANGE.MATERIAL) { return i; }
    }
    return 0;
}

function standingIn(history, recordedVersion) {
    const recorded = history.findIndex((entry) => entry.version === recordedVersion);
    if (recorded === -1) { return LEGAL_DOCUMENT_STANDING.MUST_ACKNOWLEDGE; }
    if (recorded < lastMaterialIndex(history)) { return LEGAL_DOCUMENT_STANDING.MUST_ACKNOWLEDGE; }
    if (recorded < history.length - 1) { return LEGAL_DOCUMENT_STANDING.WORDING_NOTICE; }
    return LEGAL_DOCUMENT_STANDING.CURRENT;
}

function currentEditionOf(doc) {
    const history = LEGAL_DOCUMENT_HISTORY[doc];
    return history[history.length - 1];
}

function requiredEditionOf(doc) {
    const history = LEGAL_DOCUMENT_HISTORY[doc];
    return history[lastMaterialIndex(history)];
}

function standingOf(doc, recordedVersion) {
    return standingIn(LEGAL_DOCUMENT_HISTORY[doc], recordedVersion);
}

module.exports = {
    LEGAL_DOCUMENT_CHANGE,
    LEGAL_DOCUMENT_HISTORY,
    LEGAL_DOCUMENT_STANDING,
    currentEditionOf,
    requiredEditionOf,
    standingIn,
    standingOf,
};
