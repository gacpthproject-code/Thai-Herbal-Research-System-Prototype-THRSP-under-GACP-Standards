import { describe, expect, it } from '@jest/globals';

import { defectsOfRound, sendBlocker, type CarFileItem } from '../car-round';

const item = (state: CarFileItem['state'], refused = false): CarFileItem => ({
    key: Math.random().toString(36), findingNo: 1, name: 'a.pdf', size: 1, state, serverId: state === 'uploaded' ? 'id' : null, error: null, refused, deletesAt: null,
});

describe('sendBlocker: "ส่งหลักฐาน" only when every file is uploaded', () => {
    it('blocks an empty round', () => { expect(sendBlocker([])).toMatch(/อย่างน้อยหนึ่งไฟล์/); });
    it('blocks while any file waits or uploads', () => {
        expect(sendBlocker([item('uploaded'), item('waiting'), item('uploading')])).toMatch(/เหลืออีก 2 ไฟล์/);
    });
    it('blocks while any file failed, saying retry or remove', () => {
        expect(sendBlocker([item('uploaded'), item('failed', true)])).toMatch(/ลองใหม่.*ลบไฟล์นี้/);
    });
    it('lets the round go when every file is uploaded', () => { expect(sendBlocker([item('uploaded'), item('uploaded')])).toBeNull(); });
});

describe('defectsOfRound', () => {
    it('numbers the defects the server wrote when the round opened', () => {
        expect(defectsOfRound({ carRequest: { items: [{ nonConformity: 'ก', correctiveAction: 'ข' }, { nonConformity: 'ค' }] } }))
            .toEqual([{ no: 1, nonConformity: 'ก', correctiveAction: 'ข' }, { no: 2, nonConformity: 'ค', correctiveAction: '' }]);
    });
    it('gives one item, the officer note, when the round lists no finding', () => {
        expect(defectsOfRound({ carRequest: { message: 'แก้ป้ายแปลง', items: [] } })).toEqual([{ no: 1, nonConformity: 'แก้ป้ายแปลง', correctiveAction: '' }]);
    });
});
