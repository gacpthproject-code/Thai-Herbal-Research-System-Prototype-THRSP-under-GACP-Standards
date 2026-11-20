'use strict';
const path = require('path');

const backendDir = process.cwd();
const { prisma } = require(path.join(backendDir, 'services/prisma-database'));
const { resolveApplicationRequirements } = require(path.join(backendDir, 'services/application-requirements-service'));
const { PLANT_SLUG_TO_CODE } = require(path.join(backendDir, 'config/plant-species-slugs'));
const { PURPOSE_CODES } = require(path.join(backendDir, 'shared/certification-purposes'));

const subsets = (items) => items.reduce((all, item) => all.concat(all.map((set) => [...set, item])), [[]]);
const AREAS = subsets(['OUTDOOR', 'GREENHOUSE', 'INDOOR']).filter((set) => set.length > 0);
const PURPOSES = subsets(PURPOSE_CODES);
const REQUESTS = { NEW: { requestType: 'NEW' }, RENEWAL: { requestType: 'RENEWAL' }, REPLACEMENT: { replacementOf: 'enumerated' } };

(async () => {
    let shapes = 0;
    let blocked = 0;
    let largest = { slots: -1 };
    const bySize = {};
    for (const plantId of Object.keys(PLANT_SLUG_TO_CODE)) {
        for (const holderType of ['INDIVIDUAL', 'JURISTIC', 'COMMUNITY_ENTERPRISE']) {
            for (const [requestName, request] of Object.entries(REQUESTS)) {
                for (const landOwnership of ['OWNED', 'STATE', 'RENTED']) {
                    for (const areaTypes of AREAS) {
                        for (const certScope of ['PLANTING', 'PROCESSING']) {
                            for (const certificationPurposes of PURPOSES) {
                                const application = {
                                    id: 'enumerated', areaType: areaTypes[0],
                                    formData: { plantId, ...request, certScope, certificationPurposes, farmData: { areaTypes, landOwnership } },
                                };
                                const answer = await resolveApplicationRequirements(application, [], { holderType });
                                shapes += 1;
                                if (answer.blockingIssues.length > 0) { blocked += 1; continue; }
                                const slots = answer.slots.length;
                                bySize[slots] = (bySize[slots] || 0) + 1;
                                if (slots > largest.slots) {
                                    largest = {
                                        slots, required: answer.slots.filter((s) => s.required).length,
                                        shape: { plantId, holderType, request: requestName, landOwnership, areaTypes, certScope, certificationPurposes },
                                        slotIds: answer.slots.map((s) => `${s.slotId}${s.required ? '*' : ''}`),
                                    };
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    const rules = await prisma.requirementRule.count({ where: { effectiveTo: null } });
    require('fs').writeFileSync(process.argv[2], `${JSON.stringify({ openRules: rules, shapes, blocked, slotsPerFilingHistogram: bySize, largest }, null, 2)}\n`);
    await prisma.$disconnect();
})().catch(async (error) => {
    console.error('ENUMERATE FAILED', error.code || '', error.message);
    process.exit(1);
});
