/**
 * ประตูของขั้นหนึ่ง ต้องถามสิ่งที่ขั้นนั้นเก็บ
 *
 * `isStepComplete(state, 3)` ตรวจ `farmData.farmName`, `farmData.address` และ
 * `plots.length > 0` · แต่หน้าจอขั้น 3 เขียน `siteName` กับ `siteAddress` และ **ไม่เคย
 * แตะ `plots` เลยสักครั้ง** ⇒ ขั้น 3 ทำให้ครบไม่ได้ไม่ว่าจะกรอกอย่างไร ปุ่มถัดไปดับถาวร
 * และยามเส้นทางเด้งทุกคนที่พยายามไปขั้น 4
 *
 * เป็นข้อผิดพลาดชนิดเดียวกับที่โค้ดตัวเองเตือนไว้ที่ขั้น 4: "การเรียกร้องสิ่งที่ขั้นนั้น
 * ไม่ได้เก็บอีกแล้ว คือ v1 hard-lock เป๊ะ ๆ" — มีคนเห็นชนิดนี้แล้วแก้ให้ขั้น 4 แต่ขั้น 3
 * ยังค้างอยู่
 *
 * เจอตอนเดินจริง 2026-09-06 หลังจากปลด route ที่บังขั้น 3 ออก
 */
import { describe, expect, it } from '@jest/globals';
import { step3CanProceed } from '../steps/step3-site-land-config';
import { isStepComplete } from '../hooks/use-application-flow-store';
import type { WizardState } from '../hooks/use-application-flow-store';
import { wizardNavFor } from '../wizard-navigation';

/** สิ่งที่ผู้ยื่นกรอกครบตามที่หน้าจอขั้น 3 ถาม (ช่องที่มีดอกจัน + คำถามที่ต้องเลือก) */
const filled = {
    siteName: 'แปลงสมุนไพรบ้านทดสอบ',
    siteAddress: '99/9 หมู่ 3',
    // กทล.๑ ส่วนที่ ๒ ข้อ ๑ — the certificate names these, so step 3 is not complete without them
    subDistrict: 'หนองหาร',
    district: 'สันทราย',
    province: 'เชียงใหม่',
    postalCode: '50210',
    landOwnership: 'OWNED',
    landDocumentDetail: { type: 'โฉนด', number: '12345', volume: '', page: '', issuedBy: '' },
    areaTypes: ['OUTDOOR'],
    areaSqm: '1600',
    // order 143(4): กทล.1 ข้อ ๒ asks the position and the planting volume (ต้น/รอบ, รอบ/ปี)
    coordinates: '18.7883, 98.9853',
    plantsPerCycle: '500',
    cyclesPerYear: '2',
    // order 65(2): the person on site, name and a Thai phone; here the applicant themself
    siteContactName: 'สมชาย ใจดี',
    sitePhone: '081-234-5678',
    siteContactIsApplicant: true,
} as unknown as Record<string, unknown>;

const stateWith = (farmData: Record<string, unknown>) => ({
    farmData, plots: [], requestType: 'NEW', applicantType: 'INDIVIDUAL', certScope: 'PLANTING',
} as unknown as WizardState);

describe('พิกัดและปริมาณการปลูก (คำสั่ง 143(4))', () => {
    it.each([['coordinates'], ['plantsPerCycle'], ['cyclesPerYear']])('ขาด %s แล้วปุ่มถัดไปกดไม่ได้', (key) => {
        const missing = { ...filled };
        delete missing[key];
        expect(step3CanProceed(missing)).toBe(false);
        expect(wizardNavFor(3, stateWith(missing)).nextDisabled).toBe(true);
    });

    it.each([
        ['พิกัดที่ไม่ใช่ตัวเลขสองค่า', { coordinates: 'หน้าวัด' }],
        ['พิกัดครึ่งเดียว', { coordinates: '18.7883' }],
        ['จำนวนต้นเป็นศูนย์', { plantsPerCycle: '0' }],
        ['จำนวนต้นไม่ใช่จำนวนเต็ม', { plantsPerCycle: '12.5' }],
        ['จำนวนรอบเป็นลบ', { cyclesPerYear: '-1' }],
    ])('%s ไม่ผ่าน', (_name, patch) => {
        expect(step3CanProceed({ ...filled, ...patch })).toBe(false);
    });
});

describe('ปริมาณการปลูกถามเฉพาะคำขอรับรองการปลูก (รอบ 2, M3)', () => {
    it('คำขอ PROCESSING ไม่ถูกถามจำนวนต้นและจำนวนรอบ', () => {
        const noVolume = { ...filled, plantsPerCycle: '', cyclesPerYear: '' };
        expect(step3CanProceed(noVolume, { certScope: 'PROCESSING' })).toBe(true);
        expect(step3CanProceed(noVolume, { certScope: 'PLANTING' })).toBe(false);
        expect(step3CanProceed(noVolume)).toBe(false);
    });
});

describe('ใบแทนไม่ถูกถามส่วนที่ ๒ ส่วนต่ออายุและคำขอใหม่ยังถูกถาม (คำสั่ง 147)', () => {
    const sectionTwo = ['landOwnership', 'landDocumentDetail', 'coordinates', 'plantsPerCycle', 'cyclesPerYear'];
    const withoutSectionTwo = Object.fromEntries(Object.entries(filled).filter(([key]) => !sectionTwo.includes(key)));
    const asKind = (requestType: string) => ({ ...stateWith(withoutSectionTwo), requestType, certScope: null } as unknown as WizardState);

    it('ใบแทนที่ไม่มีช่องข้อ ๒ เลย ผ่านทั้งปุ่มถัดไปและยามเส้นทาง', () => {
        expect(step3CanProceed(withoutSectionTwo, { requestType: 'REPLACEMENT' })).toBe(true);
        expect(isStepComplete(asKind('REPLACEMENT'), 3)).toBe(true);
        expect(wizardNavFor(3, asKind('REPLACEMENT')).nextDisabled).toBe(false);
    });

    it('ต่ออายุและคำขอใหม่ยังต้องกรอก', () => {
        expect(step3CanProceed(withoutSectionTwo, { requestType: 'RENEWAL' })).toBe(false);
        expect(step3CanProceed({ ...filled, coordinates: '' }, { requestType: 'RENEWAL' })).toBe(false);
        expect(isStepComplete(asKind('RENEWAL'), 3)).toBe(false);
        expect(isStepComplete(asKind('NEW'), 3)).toBe(false);
    });
});

describe('ขั้น 3 ทำให้ครบได้ด้วยสิ่งที่ขั้น 3 ถาม', () => {
    it('กรอกครบตามที่หน้าจอถาม = ผ่าน แม้ไม่มีแถว plots สักแถว', () => {
        expect(step3CanProceed(filled)).toBe(true);
        expect(isStepComplete(stateWith(filled), 3)).toBe(true);
    });

    it('ยังไม่กรอกอะไร = ไม่ผ่าน', () => {
        expect(step3CanProceed({})).toBe(false);
    });

    it.each([['siteName'], ['siteAddress'], ['landOwnership'], ['areaSqm']])(
        'ขาด %s แล้วไม่ผ่าน',
        (key) => {
            const missing = { ...filled };
            delete missing[key];
            expect(step3CanProceed(missing)).toBe(false);
        },
    );

    // F-WALK-03: the certificate names จังหวัด/อำเภอ/ตำบล; without them a filing passes submit
    // and then cannot be certified. Step 3 must refuse to proceed until each is stated.
    it.each([['province'], ['district'], ['subDistrict']])(
        'ขาด %s (ที่ตั้งที่ใบรับรองต้องระบุ) แล้วไม่ผ่าน',
        (key) => {
            const missing = { ...filled };
            delete missing[key];
            expect(step3CanProceed(missing)).toBe(false);
        },
    );

    it('ไม่ติ๊กลักษณะพื้นที่เลย ไม่ผ่าน — สองข้อนี้ตัดสินว่าต้องแนบแบบแปลนหรือภาพถ่ายแปลง', () => {
        expect(step3CanProceed({ ...filled, areaTypes: [] })).toBe(false);
    });

    it('เอกสารสิทธิ์ต้องมีประเภทและเลขที่ ตามที่หน้าจอทำดอกจันไว้', () => {
        expect(step3CanProceed({ ...filled, landDocumentDetail: { type: 'โฉนด', number: '' } })).toBe(false);
        expect(step3CanProceed({ ...filled, landDocumentDetail: { type: '', number: '12345' } })).toBe(false);
    });

    it('เช่าที่ดินต้องระบุชื่อผู้ให้เช่า — หนังสือยินยอมต้องมีชื่อ', () => {
        const rented = { ...filled, landOwnership: 'RENTED' };
        expect(step3CanProceed(rented)).toBe(false);
        expect(step3CanProceed({ ...rented, landlordName: 'นายให้เช่า ที่ดิน' })).toBe(true);
    });

    it('ต้องติ๊กลักษณะพื้นที่อย่างน้อยหนึ่งข้อ — ไม่ติ๊กเลยไม่ใช่คำขอที่ยื่นได้', () => {
        // operator 2026-09-11: *"เราไม่มีอะไรติ๊กมาเลย ... มันไม่ถูกต้อง"*
        // ประตูยื่นปฏิเสธด้วย และข้อนี้กันไม่ให้จอปล่อยผ่านไปเจอ 422 ปลายทาง
        expect(step3CanProceed({ ...filled, areaTypes: [] })).toBe(false);
        expect(step3CanProceed({ ...filled, areaTypes: ['OUTDOOR'] })).toBe(true);
    });
});

describe('ผู้ติดต่อหน้างาน (คำสั่ง 65(2))', () => {
    it.each([['siteContactName'], ['sitePhone']])('ขาด %s แล้วไม่ผ่าน', (key) => {
        const missing = { ...filled };
        delete missing[key];
        expect(step3CanProceed(missing)).toBe(false);
    });

    it('เบอร์ที่ไม่ใช่รูปแบบเบอร์โทรไทย ไม่ผ่าน', () => {
        expect(step3CanProceed({ ...filled, sitePhone: '12345' })).toBe(false);
    });

    it('ผู้ติดต่อเป็นคนอื่น ต้องยืนยันว่าได้แจ้งผู้ติดต่อแล้วจึงผ่าน', () => {
        const other = { ...filled, siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '0865556666', siteContactIsApplicant: false };
        expect(step3CanProceed(other)).toBe(false);
        expect(step3CanProceed({ ...other, siteContactInformed: true })).toBe(true);
    });
});
