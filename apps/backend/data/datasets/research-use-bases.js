'use strict';

/**
 * Dated rulings under which a class of operational data may leave for the
 * project research data store (operator orders 49 Q2 and 56(4.3)).
 *
 * Farm-operation data (cultivation logs, harvest batches, QR scans) is the
 * applicant's working record, collected to run the certification service. It
 * may be exported for research only after the privacy notice tells applicants
 * so (the operator approves that paragraph and its effective date, after a
 * legal review of the text) and after a research ethics committee has approved
 * the research (PDPC s.24(1) research notice). Until an entry here is in force
 * and names that approval, every farm-operation export refuses with
 * DATASET_RESEARCH_BASIS_NOT_IN_FORCE, even once its effectiveFrom has come.
 *
 * Append-only: a later ruling is a new entry with a later effectiveFrom (a
 * Bangkok calendar day), never an edit of an old one. An entry with
 * `inForce: false` ends the basis from its date on.
 *
 * Entry shape: {
 *   effectiveFrom: 'YYYY-MM-DD',
 *   inForce: boolean,
 *   privacyNoticeVersion: string,
 *   ethicsApproval: {            // required to open the basis
 *     committee: string,         // the committee's name, as on the approval letter
 *     reference: string,         // the approval's reference number
 *     approvedOn: 'YYYY-MM-DD',  // no later than effectiveFrom
 *   },
 *   ruling: string,
 * }
 */
const RESEARCH_USE_BASES = Object.freeze({
    FARM_OPERATION: Object.freeze([]),
});

module.exports = { RESEARCH_USE_BASES };
