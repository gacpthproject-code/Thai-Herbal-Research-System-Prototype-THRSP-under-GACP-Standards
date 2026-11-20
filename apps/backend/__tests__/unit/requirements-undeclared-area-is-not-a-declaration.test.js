'use strict';

/**
 * A draft that has not reached the site step has said nothing about its land. The
 * applications.areaType column is NOT NULL and the draft door fills it with
 * AREA_TYPE_UNDECLARED (shared/application-scope.js); that word is the column's "nothing
 * ticked yet", not a declaration the engine failed to read.
 *
 * Staging walk ccc4f707d (F13): the requirements engine read it as one, answered
 * AREA_TYPE_UNREADABLE with no slots, and step 2 showed no holder papers until the
 * applicant had filled step 3. The holder's papers do not depend on the land.
 */

const mockRulesAt = jest.fn();
const mockPlantCodes = jest.fn();
jest.mock('../../services/requirement-rule-service', () => ({
    rulesAt: (...args) => mockRulesAt(...args),
    plantCodesWithRulesAt: (...args) => mockPlantCodes(...args),
    RULE_DIMENSIONS: {
        landTenure: ['OWNED', 'STATE_PERMITTED', 'RENTED'],
        areaType: ['OUTDOOR', 'GREENHOUSE', 'INDOOR'],
        certScope: ['PLANTING', 'PROCESSING'],
    },
}));
jest.mock('../../services/prisma-database', () => ({ prisma: {} }));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const { deriveDimensions } = require('../../services/application-requirements-service');
const { AREA_TYPE_UNDECLARED } = require('../../shared/application-scope');

const freshDraft = (areaType) => ({
    id: 'draft-1',
    areaType,
    entity: { type: 'INDIVIDUAL' },
    formData: { plantId: 'turmeric', requestType: 'NEW', locationType: null, cultivationMethods: [], plots: [] },
});

describe('a draft before the site step', () => {
    it('has an unstated area, not an unreadable one', () => {
        const dims = deriveDimensions(freshDraft(AREA_TYPE_UNDECLARED));
        expect(dims.areaTypes).toEqual([]);
        expect(dims.areaDeclarationUnreadable).toBe(false);
    });

    it('still refuses a word that is neither the sentinel nor in the register', () => {
        const dims = deriveDimensions(freshDraft('UNDERWATER'));
        expect(dims.areaTypes).toEqual([]);
        expect(dims.areaDeclarationUnreadable).toBe(true);
    });

    it('still reads a real answer in the column', () => {
        expect(deriveDimensions(freshDraft('OUTDOOR')).areaTypes).toEqual(['OUTDOOR']);
    });
});
