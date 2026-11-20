'use strict';

/**
 * The staff application list names the plant from the register, once per distinct plant.
 *
 * Staging walk ccc4f707d (F5): the list column showed the wizard slugs (turmeric, ginger,
 * kratom, plai, black_galangal) because the row carried only `plantType`, the filing's own
 * reference. The register (plant_species) is the one place the Thai name lives, and
 * filingPlantName already reads it for one filing; a list of forty rows must not ask forty
 * times for six plants.
 */

const { plantDisplayNamesByRef } = require('../../services/plant-species-service');

function fakeClient(rows) {
    const calls = [];
    return {
        calls,
        plantSpecies: {
            findUnique: async ({ where }) => {
                calls.push(where.code);
                return rows[where.code] || null;
            },
        },
    };
}

const REGISTER = {
    TUR: { code: 'TUR', nameTH: 'ขมิ้นชัน', nameEN: 'Turmeric', isActive: true, isDeleted: false },
    GIN: { code: 'GIN', nameTH: 'ขิง', nameEN: 'Ginger', isActive: true, isDeleted: false },
};

describe('plantDisplayNamesByRef', () => {
    it('maps each filing reference to the register name, asking the register once per plant', async () => {
        const client = fakeClient(REGISTER);
        const names = await plantDisplayNamesByRef(['turmeric', 'ginger', 'turmeric', 'TUR'], { client });
        expect(names.get('turmeric')).toBe('ขมิ้นชัน');
        expect(names.get('ginger')).toBe('ขิง');
        expect(names.get('TUR')).toBe('ขมิ้นชัน');
        expect(client.calls).toEqual(['TUR', 'GIN']);
    });

    it('leaves an unknown, blank or retired reference without a name instead of inventing one', async () => {
        const client = fakeClient({ ...REGISTER, OLD: { code: 'OLD', nameTH: 'เลิกใช้', isActive: false, isDeleted: false } });
        const names = await plantDisplayNamesByRef(['durian', '', null, 'old'], { client });
        expect(names.get('durian')).toBeUndefined();
        expect(names.get('old')).toBeUndefined();
        expect(names.size).toBe(0);
    });
});
