'use strict';

/**
 * The closed set of HarvestBatch.status values (prisma/schema/harvest.prisma `status`).
 * The create door, the farmer update path and the research data dictionary all read it here.
 */
const HARVEST_BATCH_STATUSES = Object.freeze(['RECEIVED', 'DRYING', 'PROCESSED', 'PACKED', 'SOLD']);

module.exports = { HARVEST_BATCH_STATUSES };
