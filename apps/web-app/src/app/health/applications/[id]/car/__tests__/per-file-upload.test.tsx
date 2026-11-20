import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpload = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRemove = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('@/lib/api/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('@/lib/services/car-file-upload', () => ({
  CAR_MAX_FILES: 20,
  refuseBeforeUpload: async (file: File) => (file.name.endsWith('.gif') ? 'ระบบรับเฉพาะไฟล์ PDF หรือรูปภาพ JPG และ PNG' : null),
  uploadCarFile: (...args: unknown[]) => mockUpload(...args),
  sendCarRound: (...args: unknown[]) => mockSend(...args),
  removeCarFile: (...args: unknown[]) => mockRemove(...args),
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'app-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), forward: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import CARUploadPage from '../client-view';

const ROUND = {
  id: 'app-1', applicationNumber: 'A-1', status: 'CAR_PENDING',
  carRound: {
    defects: [
      { no: 1, nonConformity: 'ป้ายแปลงไม่ครบ', correctiveAction: 'ติดป้าย' },
      { no: 2, nonConformity: 'ไม่มีบันทึกปุ๋ย', correctiveAction: 'จัดทำบันทึก' },
    ],
    stagedFiles: [] as Array<Record<string, unknown>>,
  },
};
const flush = async () => { for (let i = 0; i < 6; i += 1) { await Promise.resolve(); } };

describe('CAR evidence, one file per request', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  async function mount(round: unknown = ROUND) {
    mockGet.mockResolvedValueOnce({ success: true, data: round });
    await act(async () => { root = createRoot(container); root.render(<CARUploadPage />); });
    await act(flush);
  }

  async function pick(defectNo: number, ...names: string[]) {
    const input = container.querySelector(`[data-testid="car-file-input-${defectNo}"]`) as HTMLInputElement;
    const files = names.map((name) => new File(['%PDF-'], name, { type: 'application/pdf' }));
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await flush(); });
    await act(flush);
  }

  const rows = () => Array.from(container.querySelectorAll('[data-testid="car-file-row"]'));
  const sendButton = () => container.querySelector('[data-testid="car-send"]') as HTMLButtonElement;
  const button = (scope: Element, label: string) =>
    Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

  it('uploads each file under its defect, retries only the failed one, and sends the mapping once all are uploaded', async () => {
    let n = 0;
    mockUpload.mockImplementation(async (arg) => {
      const { file, findingNo } = arg as { file: File; findingNo: number };
      n += 1;
      if (file.name === 'b.pdf' && n === 2) {
        return { file: null, error: 'การเชื่อมต่อขาดระหว่างอัปโหลด กด "ลองใหม่" เพื่อส่งเฉพาะไฟล์นี้' };
      }
      return { file: { id: `id-${file.name}`, findingNo, originalName: file.name, size: 5 }, error: null };
    });
    await mount();
    await pick(1, 'a.pdf');
    await pick(2, 'b.pdf', 'c.pdf');

    expect(rows().map((r) => r.getAttribute('data-state'))).toEqual(['uploaded', 'failed', 'uploaded']);
    expect(container.textContent).toContain('การเชื่อมต่อขาดระหว่างอัปโหลด');
    expect(sendButton().disabled).toBe(true);
    expect(container.querySelector('[data-testid="car-send-blocker"]')?.textContent).toMatch(/ไม่สำเร็จ/);

    await act(async () => { button(rows()[1]!, 'ลองใหม่').click(); await flush(); });
    await act(flush);
    expect(mockUpload.mock.calls.map((call) => (call[0] as { file: File }).file.name)).toEqual(['a.pdf', 'b.pdf', 'c.pdf', 'b.pdf']);
    expect(rows().every((r) => r.getAttribute('data-state') === 'uploaded')).toBe(true);
    expect(sendButton().disabled).toBe(false);

    mockSend.mockResolvedValueOnce({ success: true });
    await act(async () => { sendButton().click(); await flush(); });
    expect(mockSend).toHaveBeenCalledWith('app-1', [
      { id: 'id-a.pdf', findingNo: 1 }, { id: 'id-b.pdf', findingNo: 2 }, { id: 'id-c.pdf', findingNo: 2 },
    ], '');
  });

  it('shows files staged earlier as uploaded, and a type the door refuses as a Thai error that only removal clears', async () => {
    await mount({ ...ROUND, carRound: { ...ROUND.carRound, stagedFiles: [{ id: 'CAR-9.pdf', findingNo: 2, originalName: 'เดิม.pdf', size: 9 }] } });
    expect(rows().map((r) => [r.textContent?.includes('เดิม.pdf'), r.getAttribute('data-state')])).toEqual([[true, 'uploaded']]);
    await pick(1, 'ภาพ.gif');
    const refused = rows().find((r) => r.textContent?.includes('ภาพ.gif'))!;
    expect(refused.getAttribute('data-state')).toBe('failed');
    expect(refused.textContent).toContain('PDF หรือรูปภาพ JPG และ PNG');
    expect(button(refused, 'ลองใหม่')).toBeUndefined();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(sendButton().disabled).toBe(true);
  });

  it('tells under each unsent file the Bangkok Buddhist-era date and time the server says it will be deleted, and nothing when the server gives none', async () => {
    mockUpload.mockResolvedValue({ file: { id: 'id-new', findingNo: 1, originalName: 'ใหม่.pdf', size: 5, deletesAt: '2026-11-03T07:05:00.000Z' }, error: null });
    await mount({
      ...ROUND,
      carRound: {
        ...ROUND.carRound,
        stagedFiles: [
          { id: 'CAR-1.pdf', findingNo: 1, originalName: 'กำหนดส่ง.pdf', size: 9, deletesAt: '2026-10-29T16:59:59.999Z' },
          { id: 'CAR-2.pdf', findingNo: 2, originalName: 'เจ็ดวัน.pdf', size: 9, deletesAt: '2026-10-28T08:00:00.000Z' },
          { id: 'CAR-3.pdf', findingNo: 2, originalName: 'ไม่มีวัน.pdf', size: 9, deletesAt: null },
        ],
      },
    });
    await pick(1, 'ใหม่.pdf');
    const deletion = (name: string) => rows().find((r) => r.textContent?.includes(name))
      ?.querySelector('[data-testid="car-file-deletes-at"]')?.textContent ?? null;
    expect(deletion('กำหนดส่ง.pdf')).toBe('ยังไม่ได้ส่ง หากไม่กดส่งหลักฐาน ระบบจะลบไฟล์นี้หลัง 29 ต.ค. 2569 เวลา 23:59 น.');
    expect(deletion('เจ็ดวัน.pdf')).toBe('ยังไม่ได้ส่ง หากไม่กดส่งหลักฐาน ระบบจะลบไฟล์นี้หลัง 28 ต.ค. 2569 เวลา 15:00 น.');
    expect(deletion('ใหม่.pdf')).toBe('ยังไม่ได้ส่ง หากไม่กดส่งหลักฐาน ระบบจะลบไฟล์นี้หลัง 03 พ.ย. 2569 เวลา 14:05 น.');
    expect(deletion('ไม่มีวัน.pdf')).toBeNull();
  });

  it('keeps one row when the server answers a second upload with a file it already holds, so the round never sends one id twice', async () => {
    mockUpload.mockResolvedValue({ file: { id: 'id-same', findingNo: 1, originalName: 'a.pdf', size: 5 }, error: null });
    await mount();
    await pick(1, 'a.pdf');
    await pick(1, 'a.pdf');
    expect(rows().map((r) => r.getAttribute('data-state'))).toEqual(['uploaded']);
    mockSend.mockResolvedValueOnce({ success: true });
    await act(async () => { sendButton().click(); await flush(); });
    expect(mockSend).toHaveBeenCalledWith('app-1', [{ id: 'id-same', findingNo: 1 }], '');
  });

  it('shows the Thai sentence the server sent when the round is refused', async () => {
    mockUpload.mockResolvedValue({ file: { id: 'id-a', findingNo: 1, originalName: 'a.pdf', size: 5 }, error: null });
    await mount();
    await pick(1, 'a.pdf');
    const said = 'เกินกำหนดเวลาส่งหลักฐานการแก้ไข คำขอถูกยกเลิกแล้ว';
    mockSend.mockResolvedValueOnce({ success: false, error: 'ส่งไม่สำเร็จ', meta: { messageTh: said } });
    await act(async () => { sendButton().click(); await flush(); });
    expect(container.querySelector('[data-testid="car-upload-error"]')?.textContent).toContain(said);
  });

  it('names every field an incomplete-filing refusal lists and links to where the applicant fills them (F-A8c-06)', async () => {
    mockUpload.mockResolvedValue({ file: { id: 'id-a', findingNo: 1, originalName: 'a.pdf', size: 5 }, error: null });
    await mount();
    await pick(1, 'a.pdf');
    mockSend.mockResolvedValueOnce({
      success: false, error: 'APPLICATION_INCOMPLETE', code: 'APPLICATION_INCOMPLETE', status: 422,
      meta: {
        messageTh: 'กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ',
        errorsByStep: {
          '2': [{ path: 'plantId', message: 'กรุณาเลือกพืชที่ขอรับรอง', code: 'required' }],
          '5': [{ path: 'farmName', message: 'ชื่อแปลงปลูก จำเป็น', code: 'required' }],
        },
      },
    });
    await act(async () => { sendButton().click(); await flush(); });
    const refused = container.querySelector('[data-testid="car-refused-fields"]');
    expect(Array.from(refused?.querySelectorAll('li') ?? []).map((li) => li.textContent)).toEqual([
      'กรุณาเลือกพืชที่ขอรับรอง', 'ชื่อแปลงปลูก จำเป็น',
    ]);
    expect(refused?.querySelector('a')?.getAttribute('href')).toBe('/health/applications/app-1/edit');
    expect(container.querySelector('[data-testid="car-upload-error"]')).toBeNull();
  });
});
