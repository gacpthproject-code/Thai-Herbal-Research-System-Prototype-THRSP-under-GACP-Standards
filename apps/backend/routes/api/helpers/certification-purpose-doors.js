'use strict';

const { assessPurposes, purposeRefusalBody } = require('../../../shared/certification-purposes');

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function respondPurposeInvalid(res, verdict) {
    return res.status(400).json(purposeRefusalBody(verdict));
}

/**
 * What a DRAFT SAVE claims about purposes, judged only where the client actually said
 * something. An empty list is an unfinished wizard and is left alone (the submit door asks
 * for a choice); a non-empty list or a legacy single word must be in the vocabulary.
 *
 * @returns {{ unknown: string[] } | null} null when nothing the client sent is refused
 */
function refusedDraftPurposeClaim(payloadInput) {
    const payload = asObject(payloadInput);
    const claimed = asObject(payload.formData);
    const claims = [
        payload.certificationPurposes, claimed.certificationPurposes,
        payload.purpose, payload.certificationPurpose, claimed.certificationPurpose,
    ];
    for (const claim of claims) {
        if (claim === undefined || claim === null || claim === '') { continue; }
        const list = Array.isArray(claim) ? claim : [claim];
        if (list.length === 0) { continue; }
        const verdict = assessPurposes(list);
        if (!verdict.ok) { return { unknown: verdict.unknown }; }
    }
    return null;
}

module.exports = { respondPurposeInvalid, refusedDraftPurposeClaim };
