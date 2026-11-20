/**
 * The staff detail page reads a filing the way the six-step wizard wrote it.
 *
 * Staging walk ccc4f707d (F2): on the reviewer's and the DTAM admin's detail page the plant
 * read "turmeric", the applicant type "INDIVIDUAL" (for a company holder), and farm location,
 * service type and the whole production plan read "-". The page read the previous wizard's
 * keys (farmData.farmName, formData.farmAddress, productionData.*) while the six-step wizard
 * stores siteName / siteAddress / areaSqm and never asks a production plan; the plant's Thai
 * name and the province already arrive in `scope` from the server.
 */
import { filingFactsOf, UNKNOWN_CHOICE_TH } from '../provider-application-detail-config';

const SIX_STEP = {
    id: 'app-1',
    applicationNumber: 'APP-2569-TEST',
    status: 'REVISION_REQUESTED',
    createdAt: '2026-10-30T11:40:00.000Z',
    updatedAt: '2026-10-30T11:40:00.000Z',
    scope: { plantName: 'ขมิ้นชัน', cultivationTypes: ['กลางแจ้ง'], province: 'นนทบุรี' },
    formData: {
        plantId: 'turmeric',
        requestType: 'NEW',
        certificationPurposes: ['RESEARCH', 'PROCESSING'],
        varieties: ['พันธุ์ตรัง 1'],
        farmData: {
            siteName: 'แปลงทดสอบ wc4', siteAddress: '99 หมู่ 1 ต.บางกระสอ', province: 'นนทบุรี',
            areaSqm: '1600', plantsPerCycle: '500', cyclesPerYear: '2', landOwnership: 'OWNED', areaTypes: ['OUTDOOR'],
        },
    },
};

describe('filingFactsOf (F2)', () => {
    const facts = filingFactsOf(SIX_STEP);

    it('names the plant from the register, never the wizard slug', () => {
        expect(facts.plantName).toBe('ขมิ้นชัน');
    });

    it('reads the site the six-step wizard stored', () => {
        expect(facts.farmName).toBe('แปลงทดสอบ wc4');
        expect(facts.farmAddress).toBe('99 หมู่ 1 ต.บางกระสอ');
        expect(facts.province).toBe('นนทบุรี');
        expect(facts.areaText).toBe('1,600 ตร.ม.');
    });

    it('says the request type in Thai from the server-owned requestType', () => {
        expect(facts.requestTypeTh).toBe('ขอใหม่');
    });

    it('states what the wizard asked about the growing, in the applicant\'s words', () => {
        expect(facts.rows).toEqual(expect.arrayContaining([
            ['ลักษณะพื้นที่', 'กลางแจ้ง'],
            ['จำนวนต้นต่อรอบ', '500'],
            ['รอบปลูกต่อปี', '2'],
            ['สิทธิในที่ดิน', 'เป็นเจ้าของที่ดินเอง'],
            ['พันธุ์', 'พันธุ์ตรัง 1'],
        ]));
        const purposes = facts.rows.find(([label]) => label === 'วัตถุประสงค์')?.[1] ?? '';
        expect(purposes).not.toMatch(/RESEARCH|PROCESSING/);
        expect(purposes.length).toBeGreaterThan(0);
    });

    it('still reads a filing from the previous wizard', () => {
        const legacy = filingFactsOf({
            ...SIX_STEP, scope: undefined,
            formData: { plantName: 'กัญชา', serviceType: 'RENEWAL', farmData: { farmName: 'ไร่เก่า', address: '1 ถนนเก่า', province: 'เชียงใหม่', totalAreaSize: '2', totalAreaUnit: 'rai' } },
        });
        expect(legacy.plantName).toBe('กัญชา');
        expect(legacy.farmName).toBe('ไร่เก่า');
        expect(legacy.farmAddress).toBe('1 ถนนเก่า');
        expect(legacy.requestTypeTh).toBe('ต่ออายุ');
    });

    it('says a fact was not recorded rather than "-" when neither wizard stated it', () => {
        const bare = filingFactsOf({ ...SIX_STEP, scope: undefined, formData: {} });
        expect(bare.farmName).toBe('ไม่มีบันทึก');
        expect(bare.rows.every(([, value]) => value !== '-')).toBe(true);
    });
});

describe('land-right codes on the staff page (review M1)', () => {
    const withLand = (landOwnership: unknown) => filingFactsOf({
        ...SIX_STEP,
        formData: { ...SIX_STEP.formData, farmData: { ...SIX_STEP.formData.farmData, landOwnership } },
    }).rows.find(([label]) => label === 'สิทธิในที่ดิน')?.[1];

    it('reads every wizard choice through the wizard\'s own labels', () => {
        expect(withLand('OWNED')).toBe('เป็นเจ้าของที่ดินเอง');
        expect(withLand('STATE_PERMITTED')).toBe('ได้รับอนุญาตจากหน่วยงานของรัฐ');
        expect(withLand('RENTED')).toBe('เช่าที่ดินจากผู้อื่น');
        expect(withLand('CONSENT')).toBe('ที่ดินญาติ / ได้รับยินยอมให้ใช้');
    });

    it('reads the older spellings the submit door accepts, which the staging walk showed as "OWN"', () => {
        expect(withLand('OWN')).toBe('เป็นเจ้าของที่ดินเอง');
        expect(withLand('RENT')).toBe('เช่าที่ดินจากผู้อื่น');
        expect(withLand('เช่า')).toBe('เช่าที่ดินจากผู้อื่น');
    });

    it('never prints an unknown code raw: a Thai fallback, and nothing when the row is empty', () => {
        expect(withLand('LEASEHOLD')).toBe(UNKNOWN_CHOICE_TH);
        expect(withLand('LEASEHOLD')).not.toMatch(/[A-Za-z]/);
        expect(withLand('')).toBeUndefined();
    });
});
