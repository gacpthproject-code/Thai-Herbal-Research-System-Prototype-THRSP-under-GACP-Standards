/**
 * The 422 a filing door answers (services/application-filing-gates.js) carries both the gate's
 * generic sentence (messageTh) and the per-field Thai list (errorsByStep). Through the
 * envelope, both land in `.meta`; what the applicant reads must be the field, not the sentence
 * (round 2, I2).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ApiClient } from '../api-client';
import { refusedFields, submitGateRefusalTh } from '@/lib/services/application-requirements';

const realFetch = globalThis.fetch;
type FetchMock = jest.Mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>;

/** The body judgeFiling sends for a กทล.1 filing missing its position and its variety. */
const FILING_REFUSAL = {
    success: false,
    error: 'APPLICATION_INCOMPLETE',
    code: 'APPLICATION_INCOMPLETE',
    message: 'กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ',
    messageTh: 'กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ',
    errorsByStep: {
        3: [{ path: 'coordinates', message: 'กรุณากรอกพิกัดที่ตั้งเป็นละติจูด, ลองจิจูด เช่น 18.7883, 98.9853', code: 'required' }],
        varieties: [{ path: 'name', message: 'กรุณาระบุชื่อสายพันธุ์อย่างน้อยหนึ่งรายการ', code: 'required' }],
    },
    missingFields: ['step3.coordinates', 'varieties.name'],
};

function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: false, status,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response;
}

describe('a filing refusal through the envelope', () => {
    let client: ApiClient;
    let fetchMock: FetchMock;
    beforeEach(() => {
        client = new ApiClient();
        fetchMock = jest.fn() as FetchMock;
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    });
    afterEach(() => { (globalThis as { fetch: typeof fetch }).fetch = realFetch; });

    it('names the field the 422 names, not the generic sentence', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(422, FILING_REFUSAL));
        const res = await client.post('/applications/submit', { applicationId: 'app-1' });
        expect(res.success).toBe(false);
        const said = submitGateRefusalTh(res.code, res.meta);
        expect(said).toContain('พิกัดที่ตั้ง');
        expect(said).toContain('ชื่อสายพันธุ์');
        expect(said).not.toBe('กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ');
    });

    it('lists each field with the key that says where it is fixed', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(422, FILING_REFUSAL));
        const res = await client.post('/applications/submit', { applicationId: 'app-1' });
        expect(refusedFields(res.meta)).toEqual([
            { key: '3', message: 'กรุณากรอกพิกัดที่ตั้งเป็นละติจูด, ลองจิจูด เช่น 18.7883, 98.9853' },
            { key: 'varieties', message: 'กรุณาระบุชื่อสายพันธุ์อย่างน้อยหนึ่งรายการ' },
        ]);
    });
});
