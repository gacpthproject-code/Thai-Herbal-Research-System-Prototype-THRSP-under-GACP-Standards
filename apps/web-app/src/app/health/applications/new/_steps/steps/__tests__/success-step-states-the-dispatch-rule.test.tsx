/**
 * The last wizard screen says what happens next from the dispatcher's dated rule, not from a
 * remembered "ประมาณ 7-14 วันทำการ" (the dispatcher-defaults memo, operator order 56(1)), and it
 * never says a person checks the payment: payment is settled by the payment provider, no person
 * checks it (order 9). The number is the rule in force as GET /api/dispatch-due serves it (Jev review
 * of 00ca573, web finding 2): a later-dated rule changes the screen on its own date. Without an
 * answer the screen says what is true under any rule.
 */

import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(30_000);

const mockStatus = { current: 'DOC_FEE_PAID' };
const mockDispatchDue: { current: unknown } = { current: { success: true, data: { dueWorkingDays: 2, effectiveFrom: '2026-10-06T00:00:00.000Z' } } };

jest.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: jest.fn(async (path: string) => (path === '/dispatch-due'
      ? mockDispatchDue.current
      : { success: true, data: { status: mockStatus.current, applicationNumber: 'APP-1' } })),
  },
}));

jest.mock('../../hooks/use-application-flow-store', () => ({
  useApplicationFlowStore: () => ({
    state: { applicationId: 'app-1', applicationNumber: 'APP-1', applicantData: {}, farmData: {} },
    resetWizard: jest.fn(),
  }),
}));

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { StepSuccess } from '../success-step';

async function flushAsync(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('the success screen states the dispatcher rule', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) { act(() => root!.unmount()); }
    container?.remove();
    container = null;
    root = null;
  });

  async function mount(status: string): Promise<string> {
    mockStatus.current = status;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(<StepSuccess />); });
    await flushAsync();
    return container.textContent ?? '';
  }

  it('paid: the document reviewer is assigned within the working days of the rule the server serves', async () => {
    mockDispatchDue.current = { success: true, data: { dueWorkingDays: 2, effectiveFrom: '2026-10-06T00:00:00.000Z' } };
    const text = await mount('DOC_FEE_PAID');
    expect(text).toContain('ผู้จัดคิวมอบหมายผู้ตรวจเอกสารภายใน 2 วันทำการ หลังได้รับชำระงวดที่ 1');
    expect(text).not.toContain('7-14');
  });

  it('paid, the rule cannot be read: the screen says what is true under any rule and names no number', async () => {
    mockDispatchDue.current = { success: false, status: 503 };
    const text = await mount('DOC_FEE_PAID');
    expect(text).toContain('ผู้จัดคิวจะมอบหมายผู้ตรวจเอกสารหลังได้รับชำระงวดที่ 1');
    expect(text).not.toMatch(/ภายใน \d+ วันทำการ/);
  });

  it('names no retired system name, no gacpth.com address and no old phone, and speaks to the applicant as คุณ (orders 51, 56(0), 62)', async () => {
    const text = await mount('DOC_FEE_PAID');
    expect(text).not.toContain('ระบบรับรองมาตรฐาน GACP สมุนไพร');
    expect(text).not.toContain('gacpth.com');
    expect(text).not.toContain('5647889');
    expect(text).not.toContain('ท่าน');
    expect(text).toContain('คุณติดตามสถานะคำขอได้ที่เมนู "คำขอของฉัน"');
    expect(text).toContain('หากมีข้อสงสัย สอบถามได้ที่เมนู "ช่วยเหลือ"');
  });

  it('not paid yet: the check starts once the first instalment is paid, and no person is said to check the payment', async () => {
    const text = await mount('PENDING_DOC_FEE');
    expect(text).toContain('เริ่มหลังชำระงวดที่ 1');
    expect(text).not.toContain('การชำระเงินได้รับการตรวจสอบ');
    expect(text).not.toContain('7-14');
  });
});
