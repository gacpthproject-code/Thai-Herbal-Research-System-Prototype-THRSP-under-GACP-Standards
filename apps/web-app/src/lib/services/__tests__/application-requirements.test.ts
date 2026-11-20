/**
 * The browser must not invent an answer the server did not give.
 */

import { fetchApplicationRequirements, missingRequiredSlots, refusedFields, submitGateRefusalTh } from '../application-requirements';
import type { RequirementsPayload } from '../application-requirements';

const mockGet = jest.fn();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));

const PAYLOAD: RequirementsPayload = {
    dims: {
        holderType: 'COMMUNITY_ENTERPRISE', requestType: 'NEW', plantCode: 'cannabis',
        landTenure: 'RENTED', areaTypes: ['OUTDOOR', 'INDOOR'],
        certScope: 'PLANTING', purposes: [],
    },
    slots: [
        { slotId: 'land_rights', labelTH: 'เอกสารสิทธิ์ที่ดิน', description: null, sourceHint: null, required: true, requiredReason: 'ALWAYS', satisfied: true, fileUrl: '/uploads/a.pdf', fileName: 'a.pdf', uploadedAt: null },
        { slotId: 'landlord_consent', labelTH: 'หนังสือยินยอมจากเจ้าของที่ดิน', description: null, sourceHint: null, required: true, requiredReason: 'RENTED', satisfied: false, fileUrl: null, fileName: null, uploadedAt: null },
        { slotId: 'water_test', labelTH: 'ผลตรวจน้ำ', description: null, sourceHint: null, required: false, requiredReason: null, satisfied: false, fileUrl: null, fileName: null, uploadedAt: null },
    ],
    missingRequired: ['landlord_consent'],
    blockingIssues: [],
    complete: false,
};

beforeEach(() => jest.clearAllMocks());

describe('fetchApplicationRequirements', () => {
    it('returns the server payload unwrapped from the envelope', async () => {
        mockGet.mockResolvedValue({ success: true, data: PAYLOAD });
        await expect(fetchApplicationRequirements('app-1')).resolves.toEqual(PAYLOAD);
        expect(mockGet).toHaveBeenCalledWith('/applications/app-1/requirements');
    });

    it('escapes the id it is given rather than pasting it into the path', async () => {
        mockGet.mockResolvedValue({ success: true, data: PAYLOAD });
        await fetchApplicationRequirements('a b/../c');
        expect(mockGet).toHaveBeenCalledWith('/applications/a%20b%2F..%2Fc/requirements');
    });

    it('throws on refusal instead of reporting an empty, complete filing', async () => {
        mockGet.mockResolvedValue({ success: false, error: 'ระบบขัดข้อง' });
        await expect(fetchApplicationRequirements('app-1')).rejects.toThrow('ระบบขัดข้อง');
    });

    it('throws when the envelope carries no payload at all', async () => {
        mockGet.mockResolvedValue({ success: true });
        await expect(fetchApplicationRequirements('app-1')).rejects.toThrow(/[ก-๙]/);
    });
});

describe('missingRequiredSlots', () => {
    it('lists the required slots with nothing behind them, and never an optional one', () => {
        expect(missingRequiredSlots(PAYLOAD).map((slot) => slot.slotId)).toEqual(['landlord_consent']);
    });
});

/**
 * Review layer 2 (C1/C2/C7). The gate authors its refusal in Thai; the browser envelope
 * throws `message` away. Everything below is about the sentence surviving that trip —
 * because when it did not, the red box on the submit screen read the enum
 * "APPLICATION_NOT_JUDGEABLE" at a farmer who had picked ขมิ้นชัน.
 */
describe('submitGateRefusalTh — a refusal the farmer can act on, never a machine code', () => {
    const NOT_JUDGEABLE_META = {
        messageTh: 'ขณะนี้ยังไม่มีประกาศข้อกำหนดเอกสารสำหรับพืชที่คุณเลือก',
        blockingIssues: [{
            code: 'PLANT_LAW_NOT_FILED',
            messageTH: 'ขณะนี้ยังไม่มีประกาศข้อกำหนดเอกสารสำหรับพืชที่คุณเลือก กรุณาเลือกพืชที่ระบบเปิดรับ',
            detail: { plantCode: 'turmeric', openPlantCodes: ['cannabis'] },
        }],
    };

    it('prefers the blocking issue, which names WHICH thing cannot be judged', () => {
        expect(submitGateRefusalTh('APPLICATION_NOT_JUDGEABLE', NOT_JUDGEABLE_META))
            .toBe(NOT_JUDGEABLE_META.blockingIssues[0].messageTH);
    });

    it('falls back to the gate’s own sentence when no issue is spelled out', () => {
        expect(submitGateRefusalTh('APPLICATION_NOT_JUDGEABLE', { messageTh: 'อ่านคำขอนี้ไม่ได้' }))
            .toBe('อ่านคำขอนี้ไม่ได้');
    });

    it('still says something Thai when the backend sends no copy at all', () => {
        ['APPLICATION_NOT_JUDGEABLE', 'APPLICATION_INCOMPLETE'].forEach((code) => {
            const copy = submitGateRefusalTh(code, undefined);
            expect(copy).toMatch(/[ก-๙]/);
            // The one thing it may never be: the code itself.
            expect(copy).not.toContain(code);
        });
    });

    it('the area refusal is answered too — it was the code the contract forgot', () => {
        const copy = submitGateRefusalTh('APPLICATION_NOT_JUDGEABLE', {
            blockingIssues: [{
                code: 'AREA_TYPE_UNREADABLE',
                messageTH: 'คำขอนี้ระบุลักษณะพื้นที่ปลูกด้วยค่าที่ระบบอ่านไม่ออก',
                detail: { areaTypes: [], accepted: ['OUTDOOR', 'INDOOR', 'GREENHOUSE'] },
            }],
        });
        expect(copy).toBe('คำขอนี้ระบุลักษณะพื้นที่ปลูกด้วยค่าที่ระบบอ่านไม่ออก');
    });

    it('keeps its hands off anything that is not a submit-gate refusal', () => {
        // null, so the caller's own handling still runs — mislabelling a version
        // conflict as a document refusal would be its own bug.
        expect(submitGateRefusalTh('DRAFT_VERSION_CONFLICT', { messageTh: 'x' })).toBeNull();
        expect(submitGateRefusalTh(undefined, null)).toBeNull();
        expect(submitGateRefusalTh('', null)).toBeNull();
    });

    it('ignores a blocking issue carrying no words and moves to the next source', () => {
        expect(submitGateRefusalTh('APPLICATION_INCOMPLETE', {
            blockingIssues: [{ code: 'PLANT_NOT_DECLARED', messageTH: '   ', detail: {} }],
            messageTh: 'ยังกรอกไม่ครบ',
        })).toBe('ยังกรอกไม่ครบ');
    });
});

describe('APPLICATION_INCOMPLETE names its fields (round 2, I2)', () => {
    const FIELDS = { 3: [{ path: 'coordinates', message: 'กรุณากรอกพิกัดที่ตั้งเป็นละติจูด, ลองจิจูด เช่น 18.7883, 98.9853', code: 'required' }] };

    it('prefers the field list over the gate\'s generic sentence when both arrive', () => {
        const said = submitGateRefusalTh('APPLICATION_INCOMPLETE', { messageTh: 'กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ', errorsByStep: FIELDS });
        expect(said).toContain('พิกัดที่ตั้ง');
    });

    it('keeps the generic sentence for a refusal that names no field', () => {
        expect(submitGateRefusalTh('APPLICATION_INCOMPLETE', { messageTh: 'กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ', errorsByStep: {} }))
            .toBe('กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ');
    });

    it('lists the fields with their keys, and nothing for a refusal without them', () => {
        expect(refusedFields({ errorsByStep: FIELDS })).toEqual([{ key: '3', message: FIELDS[3][0].message }]);
        expect(refusedFields({ messageTh: 'x' })).toEqual([]);
        expect(refusedFields(undefined)).toEqual([]);
    });
});

describe('the renewal change declaration refusal', () => {
    it('422 RENEWAL_CHANGE_DECLARATION_REQUIRED says what to answer, in Thai', () => {
        const line = submitGateRefusalTh('RENEWAL_CHANGE_DECLARATION_REQUIRED');
        expect(line).toContain('คำรับรองการเปลี่ยนแปลง');
        expect(line).not.toContain('RENEWAL_CHANGE_DECLARATION_REQUIRED');
    });
});
