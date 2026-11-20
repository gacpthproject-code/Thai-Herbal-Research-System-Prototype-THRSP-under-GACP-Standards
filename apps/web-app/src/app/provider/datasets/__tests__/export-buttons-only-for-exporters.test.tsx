/**
 * /provider/datasets: export buttons only for the role the export doors accept
 * (criteria G10). The catalog says canExport; the page must not offer a button
 * that answers 403, and must offer the deletion lists the research data store
 * deletes by (withdrawn survey answers, deleted harvest batches).
 */

import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockApiGet = jest.fn<(url: string) => Promise<unknown>>();
const mockGetBlob = jest.fn<(url: string) => Promise<Blob | null>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: (url: string) => mockApiGet(url), getBlob: (url: string) => mockGetBlob(url) },
}));

jest.mock('../../components/provider-layout', () => {
    const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    Passthrough.displayName = 'MockProviderLayout';
    return { __esModule: true, default: Passthrough };
});

import DatasetsPage from '../page';

const DOMAINS = [
    {
        key: 'harvest-batches', thaiName: 'รุ่นเก็บเกี่ยว', description: 'd', fieldCount: 18, formats: ['csv', 'jsonl'],
        available: false, unavailableCode: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE',
        lists: [{ key: 'harvest-batches/deleted', thaiName: 'รายการรุ่นเก็บเกี่ยวที่ถูกลบ' }],
    },
    {
        key: 'survey-responses', thaiName: 'คำตอบแบบสำรวจ', description: 'd', fieldCount: 9, formats: ['csv', 'jsonl'],
        available: true, unavailableCode: null,
        lists: [{ key: 'survey-responses/withdrawn', thaiName: 'รายการคำตอบที่ถอนความยินยอมแล้ว' }],
    },
];

describe('/provider/datasets export buttons', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        jest.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    async function mount(canExport: boolean) {
        mockApiGet.mockResolvedValue({ success: true, data: { canExport, domains: DOMAINS } });
        await act(async () => {
            root = createRoot(container);
            root.render(<DatasetsPage />);
        });
        for (let i = 0; i < 10; i += 1) {
            await act(async () => { await Promise.resolve(); });
        }
    }

    const buttonTexts = () => [...container.querySelectorAll('button')].map(b => b.textContent?.trim());

    it('a role that may not export sees the catalog and the dictionary, and no export button at all', async () => {
        await mount(false);
        expect(mockApiGet).toHaveBeenCalledWith('/api/datasets');
        expect(container.textContent).toContain('คำตอบแบบสำรวจ');
        expect(container.querySelector('a[href="/api/datasets/dictionary"]')).not.toBeNull();
        expect(buttonTexts()).toEqual([]);
        expect(container.querySelector('[data-testid="dataset-export-restricted"]')?.textContent).toContain('เฉพาะผู้ดูแลระบบของกรม');
    });

    it('the exporter gets the bundle, the open domain, both deletion lists, and the reason a farm domain is closed', async () => {
        await mount(true);
        expect(container.querySelector('[data-testid="dataset-bundle"]')).not.toBeNull();
        const farm = container.querySelector('[data-testid="dataset-harvest-batches"]')!;
        expect(farm.textContent).toContain('นโยบายความเป็นส่วนตัว');
        expect(farm.textContent).toContain('คณะกรรมการจริยธรรมการวิจัย');
        expect(farm.textContent).toContain('รายการรุ่นเก็บเกี่ยวที่ถูกลบ');
        expect([...farm.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['CSV', 'JSONL']);
        const survey = container.querySelector('[data-testid="dataset-survey-responses"]')!;
        expect(survey.textContent).toContain('รายการคำตอบที่ถอนความยินยอมแล้ว');
        expect([...survey.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['CSV', 'JSONL', 'CSV', 'JSONL']);
    });

    it('each button downloads from its own door', async () => {
        mockGetBlob.mockResolvedValue(new Blob(['x']));
        Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() });
        const saved: string[] = [];
        const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            saved.push(this.download);
        });
        await mount(true);
        const survey = container.querySelector('[data-testid="dataset-survey-responses"]')!;
        const [csv, , , withdrawnJsonl] = [...survey.querySelectorAll('button')];
        await act(async () => { csv.click(); });
        await act(async () => { withdrawnJsonl.click(); });
        const bundle = container.querySelector('[data-testid="dataset-bundle"] button')!;
        await act(async () => { (bundle as HTMLButtonElement).click(); });
        expect(mockGetBlob.mock.calls.map(c => c[0])).toEqual([
            '/api/datasets/survey-responses/export?format=csv',
            '/api/datasets/survey-responses/withdrawn?format=jsonl',
            '/api/datasets/bundle',
        ]);
        expect(saved).toEqual(['gacp-dataset-survey-responses.csv', 'gacp-dataset-survey-responses-withdrawn.jsonl', 'gacp-research-dataset.zip']);
        click.mockRestore();
    });

    it('a failed download says so and how to proceed', async () => {
        mockGetBlob.mockResolvedValue(null);
        await mount(true);
        const bundle = container.querySelector('[data-testid="dataset-bundle"] button')!;
        await act(async () => { (bundle as HTMLButtonElement).click(); });
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('ดาวน์โหลดไม่สำเร็จ');
    });
});
