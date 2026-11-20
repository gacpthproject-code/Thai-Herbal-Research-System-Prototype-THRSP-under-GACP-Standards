'use strict';

/** Closed survey vocabularies: the submit/create validators and the research data dictionary read them here. */
const REGIONS = Object.freeze(['NORTH', 'CENTRAL', 'NORTHEAST', 'SOUTH']); // 4 ภาคตามสัญญา
const TARGET_GROUPS = Object.freeze(['FARMER', 'EXPERT', 'DTAM_STAFF', 'OPERATOR']);
const QUESTION_TYPES = Object.freeze(['TEXT', 'TEXTAREA', 'RATING_5', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'NUMBER']);

module.exports = { REGIONS, TARGET_GROUPS, QUESTION_TYPES };
