import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ApiClient } from '../api-client';

const realFetch = globalThis.fetch;
type FetchMock = jest.Mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>;

const HOLDER_INCOMPLETE_TH = 'ไม่สามารถออกใบรับรองได้ เนื่องจากข้อมูลผู้ถือใบรับรองไม่ครบถ้วน (ขาด รหัสทะเบียนวิสาหกิจชุมชน (สวช.01), '
    + 'คำนำหน้าชื่อประธานวิสาหกิจชุมชน, ชื่อประธานวิสาหกิจชุมชน, นามสกุลประธานวิสาหกิจชุมชน, '
    + 'เลขประจำตัวประชาชนประธานวิสาหกิจชุมชน, สัญชาติประธานวิสาหกิจชุมชน, เลขรหัสประจำบ้าน, ที่อยู่, โทรศัพท์) '
    + 'ระบบไม่ได้บันทึกการเปลี่ยนแปลงใด ๆ แจ้งผู้ยื่นให้กรอกข้อมูลผู้ถือใบรับรองให้ครบ แล้วจึงออกใบรับรอง';

function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: false, status,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response;
}

describe('a long Thai refusal through the envelope', () => {
    let client: ApiClient;
    let fetchMock: FetchMock;
    beforeEach(() => {
        client = new ApiClient();
        fetchMock = jest.fn() as FetchMock;
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    });
    afterEach(() => { (globalThis as { fetch: typeof fetch }).fetch = realFetch; });

    it('reaches the screen whole', async () => {
        expect(HOLDER_INCOMPLETE_TH.length).toBeGreaterThan(300);
        fetchMock.mockResolvedValueOnce(jsonResponse(422, {
            success: false, code: 'CERTIFICATE_HOLDER_INCOMPLETE', error: HOLDER_INCOMPLETE_TH, messageTh: HOLDER_INCOMPLETE_TH,
        }));
        const res = await client.post('/provider/auditor/applications/app-1/final-approvals', { reason: 'หลักฐานครบ' });
        expect(res.success).toBe(false);
        expect(res.error).toBe(HOLDER_INCOMPLETE_TH);
    });

    it('a long message with no Thai is still treated as a leak', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(500, { success: false, error: 'x'.repeat(301) }));
        const res = await client.post('/provider/auditor/applications/app-1/final-approvals', { reason: 'หลักฐานครบ' });
        expect(res.error).toBe('เกิดข้อผิดพลาดภายในระบบ (HTTP 500)');
    });
});
