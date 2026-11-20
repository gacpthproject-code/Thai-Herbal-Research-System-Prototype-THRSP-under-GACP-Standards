'use strict';

/**
 * The activity types the planting-cycle activity door accepts
 * (POST /api/planting-cycles/:id/activities). The door and the research data
 * dictionary both read them here.
 */
const CULTIVATION_ACTIVITY_TYPES = Object.freeze([
    'IRRIGATION',
    'FERTILIZER',
    'PEST_CONTROL',
    'WEED_CONTROL',
    'INSPECTION',
    'INCIDENT',
    'OTHER',
]);

module.exports = { CULTIVATION_ACTIVITY_TYPES };
