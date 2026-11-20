import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockApiGet = jest.fn<(url: string) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => ({
  apiClient: { get: (url: string) => mockApiGet(url) },
  api: { get: (url: string) => mockApiGet(url) },
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cycle-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/provider/tracking',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('../../components/provider-layout', () => {
  const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Passthrough.displayName = 'MockProviderLayout';
  return { __esModule: true, default: Passthrough };
});

import TrackingDetailView from '../[id]/client-view';

const CYCLE_DETAIL = {
  id: 'cycle-1',
  cycleName: 'รอบที่ 1/2569',
  status: 'GROWING',
  startDate: '2026-01-05',
  expectedHarvestDate: '2026-05-05',
  farm: { id: 'farm-1', farmName: 'ฟาร์มทดสอบ', district: 'เมือง', province: 'เชียงใหม่' },
  cyclePlots: [],
  plantSpecies: { id: 'sp-1', code: 'CANNABIS', nameTH: 'กัญชา', nameEN: 'Cannabis' },
  _count: { cultivationLogs: 4, batches: 2, lots: 2 },
};

describe('จอรายละเอียดรอบปลูกของเจ้าหน้าที่แสดงรุ่นที่บันทึกย้อนหลัง', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  function serve(detail: Record<string, unknown>) {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/plot-qrs')) {
        return Promise.resolve({ success: true, data: [] });
      }
      if (url.includes('/activities')) {
        return Promise.resolve({ success: true, data: [], meta: { pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } } });
      }
      return Promise.resolve({ success: true, data: detail });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container?.remove();
    container = null;
  });

  async function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container!);
      root!.render(<TrackingDetailView />);
    });
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  it('แสดงเลขรุ่น วันเก็บเกี่ยว ใบรับรองที่ผูก และป้ายบันทึกย้อนหลัง', async () => {
    serve({
      ...CYCLE_DETAIL,
      backdatedBatches: [{ batchNumber: 'HB-2569-0007', harvestDate: '2026-10-12T02:00:00.000Z', certificateNumber: 'TH-GACP 1/2569' }],
    });
    await mount();
    const section = container!.querySelector('[data-testid="backdated-harvest-batches"]');
    expect(section).toBeTruthy();
    const text = section!.textContent || '';
    expect(text).toContain('บันทึกย้อนหลัง');
    expect(text).toContain('HB-2569-0007');
    expect(text).toContain('TH-GACP 1/2569');
    expect(text).toContain('12 ต.ค. 2569');
  });

  it('ไม่มีรุ่นที่บันทึกย้อนหลัง ไม่มีส่วนนี้', async () => {
    serve({ ...CYCLE_DETAIL, backdatedBatches: [] });
    await mount();
    expect(container!.querySelector('[data-testid="backdated-harvest-batches"]')).toBeNull();
  });
});
