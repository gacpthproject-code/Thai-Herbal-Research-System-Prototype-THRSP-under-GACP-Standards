/**
 * slug ของวิซาร์ดคำขอ (`cannabis`) กับรหัสทะเบียนพืช (`CAN`) เป็นคนละคำศัพท์ และผูกกันที่สะพานเดียว
 * `apps/backend/config/plant-species-slugs.js` · เทสนี้ตรึงว่าสองฝั่งยังประกาศคู่เดียวกัน
 */
import fs from 'node:fs';
import path from 'node:path';
import { PLANT_MASTER_CODE } from '../../../applications/new/_steps/steps/plant-selection-config';

describe('คำศัพท์สองชุดต้องผูกกันที่เดียว', () => {
    it('slug ของวิซาร์ดทุกตัวมีรหัสทะเบียน และตรงกับสะพานฝั่งหลังบ้าน', () => {
        const bridge = fs.readFileSync(
            path.resolve(__dirname, '../../../../../../../backend/config/plant-species-slugs.js'),
            'utf8',
        );
        for (const [slug, code] of Object.entries(PLANT_MASTER_CODE)) {
            expect(bridge).toMatch(new RegExp(`${slug}:\\s*'${code}'`));
        }
    });

    it('กัญชาผูกกับรหัสที่ทะเบียนจริงใช้ ไม่ใช่กับ slug ของตัวเอง', () => {
        expect(PLANT_MASTER_CODE.cannabis).toBe('CAN');
        expect(PLANT_MASTER_CODE.cannabis).not.toBe('cannabis');
    });
});
