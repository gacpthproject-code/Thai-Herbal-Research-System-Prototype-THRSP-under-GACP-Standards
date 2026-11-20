/**
 * The success screen names whom the certificate is filed for from the holder record chosen at
 * step 1. It used to read applicantData.applicantType, which nothing writes since the holder
 * moved to step 1, so every individual and community enterprise filing ended on "ผู้ยื่นคำขอ -".
 */

import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockHolders = {
  current: [
    { id: 'ent-ind', type: 'INDIVIDUAL', displayName: 'สมหญิง ปลูกดี' },
    { id: 'ent-ce', type: 'COMMUNITY_ENTERPRISE', displayName: 'วิสาหกิจชุมชนสมุนไพรบ้านสวน' },
    { id: 'ent-pt', type: 'PARTNERSHIP', displayName: 'ห้างหุ้นส่วนจำกัด สองพี่น้อง' },
  ],
};
const mockHolderId = { current: 'ent-ind' };

jest.mock('@/lib/api/api-client', () => ({
  apiClient: {
    get: jest.fn(async () => ({ success: true, data: { status: 'SUBMITTED', applicationNumber: 'APP-1' } })),
  },
}));

jest.mock('@/lib/services/my-entities-provider', () => ({
  useMyEntities: () => ({ entities: mockHolders.current, isLoading: false, error: null, refresh: jest.fn() }),
}));

jest.mock('../../hooks/use-application-flow-store', () => ({
  useApplicationFlowStore: () => ({
    state: { applicationId: 'app-1', holderEntityId: mockHolderId.current, applicantData: {}, farmData: {} },
    resetWizard: jest.fn(),
  }),
}));

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { StepSuccess } from '../success-step';

describe('the success screen names the holder', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) { act(() => root!.unmount()); }
    container?.remove();
    container = null;
    root = null;
  });

  async function mount(holderId: string): Promise<string> {
    mockHolderId.current = holderId;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(<StepSuccess />); });
    for (let i = 0; i < 6; i += 1) { await act(async () => { await Promise.resolve(); }); }
    return container.textContent ?? '';
  }

  it.each([
    ['ent-ind', 'สมหญิง ปลูกดี'],
    ['ent-ce', 'วิสาหกิจชุมชนสมุนไพรบ้านสวน'],
    ['ent-pt', 'ห้างหุ้นส่วนจำกัด สองพี่น้อง'],
  ])('%s', async (holderId, name) => {
    const text = await mount(holderId);
    expect(text).toContain(`ผู้ยื่นคำขอ${name}`);
  });
});
