/**
 * Planting entry is open to everyone (operator order 2026-10-07). Inside the
 * planting pages, the create-cycle button is disabled with an explanation when
 * the user has no usable certificate, and stays honest while the certificate
 * state is loading or errored (the server decides).
 */
import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('next/navigation', () => {
  const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => router,
    usePathname: () => '/health/planting',
    useSearchParams: () => searchParams,
  };
});

const mockApiGet = jest.fn<(url: string) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => ({
  apiClient: { get: (url: string) => mockApiGet(url) },
  api: { get: (url: string) => mockApiGet(url) },
}));

jest.mock('@/lib/services/planting-service', () => ({
  plantingService: {
    getMyCycles: () => Promise.resolve({ success: true, data: [] }),
    getFarms: () => Promise.resolve({ success: true, data: [] }),
    getPlantSpecies: () => Promise.resolve({ success: true, data: [] }),
    getMyCertificates: () => Promise.resolve({ success: true, data: [] }),
    getPlots: () => Promise.resolve({ success: true, data: [] }),
  },
}));

import PlantingLayout from '../layout';
import HealthPlantingDashboardPage from '../client-view';
import NewPlantingCyclePage from '../new/client-view';

const NO_CERT_TEXT = 'สร้างรอบปลูกได้เมื่อได้รับใบรับรอง GACP';
const PAGE_MARKER = 'LAYOUT-CHILD-MARKER';

function pending(): Promise<unknown> {
  return new Promise(() => undefined);
}

function certs(data: unknown[]) {
  mockApiGet.mockImplementation((url: string) =>
    url === '/api/certificates/my' ? Promise.resolve({ success: true, data }) : pending(),
  );
}

describe('planting — create cycle needs a usable certificate', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

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

  function mount(ui: React.ReactElement) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container!);
      root.render(ui);
    });
  }

  async function flush() {
    await act(async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
  }

  const createLabels = ['เริ่มรอบการปลูกใหม่', 'สร้างรอบการปลูกครั้งแรก'];

  function createControls() {
    return Array.from(container!.querySelectorAll('a, button')).filter((el) =>
      createLabels.some((l) => (el.textContent ?? '').includes(l)),
    );
  }

  function statusLink() {
    return Array.from(container!.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/health/status' && a.textContent === 'ดูสถานะคำขอ',
    );
  }

  it('layout is a pass-through: planting renders without any certificate', async () => {
    certs([]);
    mount(
      <PlantingLayout>
        <div>{PAGE_MARKER}</div>
      </PlantingLayout>,
    );
    await flush();
    expect(container!.textContent).toContain(PAGE_MARKER);
    expect(container!.textContent).not.toContain('เมนูนี้ยังใช้งานไม่ได้');
  });

  it('no certificate: list page still renders, create buttons are disabled with the message and a status link', async () => {
    certs([]);
    mount(<HealthPlantingDashboardPage />);
    await flush();
    expect(container!.textContent).toContain('การปลูกของฉัน');
    const controls = createControls();
    expect(controls.length).toBeGreaterThan(0);
    for (const el of controls) {
      expect(el.tagName).toBe('BUTTON');
      expect(el.getAttribute('aria-disabled')).toBe('true');
      const reason = document.getElementById(el.getAttribute('aria-describedby') || '');
      expect(reason?.textContent).toContain(NO_CERT_TEXT);
    }
    expect(container!.textContent).toContain(NO_CERT_TEXT);
    expect(statusLink()).toBeDefined();
  });

  it('an expired certificate counts as no certificate', async () => {
    certs([{ status: 'active', expiryDate: '2020-01-01T00:00:00.000Z' }]);
    mount(<HealthPlantingDashboardPage />);
    await flush();
    expect(container!.textContent).toContain(NO_CERT_TEXT);
  });

  it('active certificate: create buttons are links to /health/planting/new, no message', async () => {
    certs([{ status: 'active', expiryDate: '2099-01-01T00:00:00.000Z' }]);
    mount(<HealthPlantingDashboardPage />);
    await flush();
    const controls = createControls();
    expect(controls.length).toBeGreaterThan(0);
    for (const el of controls) {
      expect(el.tagName).toBe('A');
      expect(el.getAttribute('href')).toBe('/health/planting/new');
    }
    expect(container!.textContent).not.toContain(NO_CERT_TEXT);
  });

  it('while the certificate state is loading, never claims the user lacks a certificate', async () => {
    mockApiGet.mockImplementation(() => pending());
    mount(<HealthPlantingDashboardPage />);
    await flush();
    expect(container!.textContent).not.toContain(NO_CERT_TEXT);
    for (const el of createControls()) expect(el.tagName).toBe('A');
  });

  it('on a certificate fetch error, never claims the user lacks a certificate', async () => {
    mockApiGet.mockImplementation((url: string) =>
      url === '/api/certificates/my' ? Promise.reject(new Error('down')) : pending(),
    );
    mount(<HealthPlantingDashboardPage />);
    await flush();
    expect(container!.textContent).not.toContain(NO_CERT_TEXT);
    for (const el of createControls()) expect(el.tagName).toBe('A');
  });

  it('direct visit to /new without a certificate shows the explanation instead of the form', async () => {
    certs([]);
    mount(<NewPlantingCyclePage />);
    await flush();
    expect(container!.textContent).toContain(NO_CERT_TEXT);
    expect(statusLink()).toBeDefined();
    expect(container!.querySelector('form')).toBeNull();
    expect(container!.querySelector('input')).toBeNull();
  });

  it('direct visit to /new with an active certificate does not show the explanation', async () => {
    certs([{ status: 'active', expiryDate: '2099-01-01T00:00:00.000Z' }]);
    mount(<NewPlantingCyclePage />);
    await flush();
    expect(container!.textContent).not.toContain(NO_CERT_TEXT);
  });
});
