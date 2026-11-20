import { filingFactsOf } from '../provider-application-detail-config';

const LABEL = 'วัสดุปลูกในอาคารระบบปิด (ข้อมูลเพิ่มเติม ไม่อยู่ในแบบ กทล.1)';

function factsFor(farmData: Record<string, unknown>) {
    return filingFactsOf({
        id: 'app-1', applicationNumber: 'APP-2569-TEST', status: 'SUBMITTED',
        createdAt: '2026-11-04T00:00:00.000Z', updatedAt: '2026-11-04T00:00:00.000Z',
        formData: { plantId: 'cannabis', farmData },
    });
}

const rowOf = (farmData: Record<string, unknown>) => factsFor(farmData).rows.find(([label]) => label === LABEL);

describe('the growing-medium row on the staff detail page', () => {
    it('shows ไม่ใช้ดิน for a soilless indoor site', () => {
        expect(rowOf({ areaTypes: ['INDOOR'], growingMedium: 'SOILLESS' })).toEqual([LABEL, 'ไม่ใช้ดิน']);
    });

    it('shows ปลูกในดิน for a mixed site that grows in soil', () => {
        expect(rowOf({ areaTypes: ['OUTDOOR', 'INDOOR'], growingMedium: 'SOIL' })).toEqual([LABEL, 'ปลูกในดิน']);
    });

    it('has no row when อาคารระบบปิด is not ticked or nothing was answered', () => {
        expect(rowOf({ areaTypes: ['OUTDOOR'], growingMedium: 'SOIL' })).toBeUndefined();
        expect(rowOf({ areaTypes: ['INDOOR'] })).toBeUndefined();
    });
});
