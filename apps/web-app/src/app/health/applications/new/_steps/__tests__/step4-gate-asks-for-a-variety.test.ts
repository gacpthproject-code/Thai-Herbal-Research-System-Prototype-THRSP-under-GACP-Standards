/**
 * ขั้น 4 ถามสายพันธุ์ (กทล.1 ข้อ ๓) และไม่ปล่อยผ่านจนกว่าจะมีอย่างน้อยหนึ่งชื่อ (คำสั่ง 143(4))
 *
 * ก่อนหน้านี้ประตูของขั้น 4 ถามแค่วัตถุประสงค์ ผู้ยื่นจึงข้ามตารางสายพันธุ์ทั้งตารางได้
 * และเซิร์ฟเวอร์ก็รับ ประตูยื่นปฏิเสธด้วยกฎเดียวกันนี้ (varieties.name)
 */
import { describe, expect, it } from '@jest/globals';
import { isStepComplete } from '../hooks/use-application-flow-store';
import type { WizardState } from '../hooks/use-application-flow-store';
import { wizardNavFor } from '../wizard-navigation';

const named = { kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' };
const blank = { kind: null, name: '', origin: null, source: '', quantity: '', unit: '' };

const stateWith = (varieties: unknown[]) => ({
    plantId: 'cannabis', certificationPurposes: ['EXPORT'], varieties,
} as unknown as WizardState);

describe('ขั้น 4 ต้องมีสายพันธุ์อย่างน้อยหนึ่งชื่อ', () => {
    it('วัตถุประสงค์ครบแต่ไม่มีสายพันธุ์ ปุ่มถัดไปกดไม่ได้', () => {
        expect(isStepComplete(stateWith([]), 4)).toBe(false);
        expect(wizardNavFor(4, stateWith([])).nextDisabled).toBe(true);
    });

    it('แถวที่กรอกค้างไว้โดยไม่มีชื่อ ยังไม่นับเป็นสายพันธุ์', () => {
        expect(isStepComplete(stateWith([{ ...named, name: '  ' }]), 4)).toBe(false);
    });

    it('มีชื่อหนึ่งรายการ ผ่าน แม้มีแถวว่างที่ผู้ยื่นลบไม่ได้ติดมาด้วย', () => {
        expect(isStepComplete(stateWith([named]), 4)).toBe(true);
        expect(isStepComplete(stateWith([named, blank]), 4)).toBe(true);
        expect(wizardNavFor(4, stateWith([named])).nextDisabled).toBe(false);
    });

    it('มีสายพันธุ์แต่ไม่มีวัตถุประสงค์ ยังไม่ผ่านเหมือนเดิม', () => {
        const state = { ...stateWith([named]), certificationPurposes: [] } as unknown as WizardState;
        expect(isStepComplete(state, 4)).toBe(false);
    });
});

describe('ใบแทนไม่ถูกถามสายพันธุ์ ส่วนต่ออายุยังถูกถาม (คำสั่ง 147)', () => {
    const asKind = (requestType: string) => ({ ...stateWith([]), requestType } as unknown as WizardState);

    it('ใบแทนที่ไม่มีสายพันธุ์ ผ่าน', () => {
        expect(isStepComplete(asKind('REPLACEMENT'), 4)).toBe(true);
        expect(wizardNavFor(4, asKind('REPLACEMENT')).nextDisabled).toBe(false);
    });

    it('ต่ออายุที่ไม่มีสายพันธุ์ ยังไม่ผ่าน', () => {
        expect(isStepComplete(asKind('RENEWAL'), 4)).toBe(false);
        expect(wizardNavFor(4, asKind('RENEWAL')).nextDisabled).toBe(true);
    });
});
