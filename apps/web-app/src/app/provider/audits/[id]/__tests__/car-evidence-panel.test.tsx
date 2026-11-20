import * as React from 'react';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/components/feature/document-viewer-modal', () => ({
    DocumentViewerModal: ({ file }: { file: { url: string; name: string } | null }) => (
        file ? <div data-testid="viewer">{file.name}|{file.url}</div> : null
    ),
}));

import { CarEvidencePanel, carEvidenceOfRound } from '../car-evidence-panel';

const ASKED = '2026-10-21T08:00:00.000Z';
const OLD = { originalName: 'round1.pdf', path: '/uploads/car/CAR-1.pdf', size: 10, uploadedAt: '2026-10-10T08:00:00.000Z' };
const NEW = { originalName: 'car_evidence.pdf', path: '/uploads/car/CAR-2.pdf', size: 20, uploadedAt: '2026-10-21T09:00:00.000Z' };

describe('F-A8-05 carEvidenceOfRound', () => {
    it('counts only files sent after this round was requested', () => {
        const round = carEvidenceOfRound({ carRequestedAt: ASKED, carDocuments: [OLD, NEW], carNotes: 'แก้แล้ว' });
        expect(round.files.map((f) => f.name)).toEqual(['car_evidence.pdf']);
        expect(round.submitted).toBe(true);
        expect(round.notes).toBe('แก้แล้ว');
    });

    it('is not submitted when every file predates the request', () => {
        expect(carEvidenceOfRound({ carRequestedAt: ASKED, carDocuments: [OLD] }).submitted).toBe(false);
    });

    it('is not submitted when the round was requested and no file came', () => {
        expect(carEvidenceOfRound({ carRequestedAt: ASKED }).submitted).toBe(false);
    });

    it('asks for nothing when no correction round was ever requested (a pass the approver sent back)', () => {
        const round = carEvidenceOfRound({});
        expect(round.requested).toBe(false);
    });
});

describe('F-A8-05 CarEvidencePanel', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    const render = async (formData: Record<string, unknown>, onViewerClosed = jest.fn()) => {
        await act(async () => { root.render(<CarEvidencePanel applicationId="app-1" round={carEvidenceOfRound(formData)} onViewerClosed={onViewerClosed} />); });
    };

    it('lists the evidence and opens it through the evidence door that records the opening', async () => {
        await render({ carRequestedAt: ASKED, carDocuments: [OLD, NEW] });
        expect(container.textContent).toContain('car_evidence.pdf');
        expect(container.textContent).not.toContain('round1.pdf');
        const open = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('car_evidence.pdf'));
        await act(async () => { open!.click(); });
        expect(container.querySelector('[data-testid="viewer"]')?.textContent)
            .toBe('car_evidence.pdf|/api/provider/auditor/applications/app-1/car-evidence/CAR-2.pdf');
    });

    it('groups the files by the defect each answers and says which are not opened yet', async () => {
        const a = { ...NEW, id: 'CAR-a.pdf', originalName: 'ป้าย.jpg', findingNo: 1 };
        const b = { ...NEW, id: 'CAR-b.pdf', originalName: 'สมุด.pdf', findingNo: 2 };
        const formData = {
            carRequestedAt: ASKED, carDocuments: [a, b],
            carRequest: { items: [{ nonConformity: 'ป้ายไม่ครบ' }, { nonConformity: 'ไม่มีบันทึก' }, { nonConformity: 'อื่น' }] },
            carEvidenceViews: { 'CAR-a.pdf': { 'inspector-1': ASKED } },
        };
        expect(carEvidenceOfRound(formData).allOpened).toBe(false);
        await render(formData);
        const group = (n: number) => container.querySelector(`[data-testid="car-evidence-defect-${n}"]`)!;
        expect(group(1).textContent).toContain('ป้าย.jpg');
        expect(group(1).textContent).toContain('เปิดดูแล้ว');
        expect(group(2).textContent).toContain('สมุด.pdf');
        expect(group(2).textContent).toContain('ยังไม่ได้เปิดดู');
        expect(group(3).textContent).toContain('ผู้ยื่นไม่ได้ส่งไฟล์สำหรับข้อนี้');
        expect(container.querySelector('[data-testid="car-evidence-progress"]')?.textContent).toBe('เปิดดูแล้ว 1 จาก 2 ไฟล์');
        expect(carEvidenceOfRound({ ...formData, carEvidenceViews: { 'CAR-a.pdf': { i: ASKED }, 'CAR-b.pdf': { i: ASKED } } }).allOpened).toBe(true);
    });

    it('never hides a file whose defect is missing from the round: it shows under its own heading', async () => {
        await render({ carRequestedAt: ASKED, carDocuments: [{ ...NEW, id: 'CAR-x.pdf', originalName: 'หลง.pdf', findingNo: 4 }], carRequest: { items: [{ nonConformity: 'ก' }] } });
        expect(container.querySelector('[data-testid="car-evidence-defect-0"]')?.textContent).toContain('หลง.pdf');
        expect(container.querySelector('[data-testid="car-evidence-defect-0"]')?.textContent).toContain('ไฟล์ที่ไม่ตรงกับข้อบกพร่องในรอบนี้');
    });

    it('says plainly that no evidence was sent', async () => {
        await render({ carRequestedAt: ASKED, carDocuments: [OLD] });
        expect(container.querySelector('[role="status"]')?.textContent).toContain('ผู้ยื่นยังไม่ได้ส่งหลักฐานการแก้ไขในรอบนี้');
    });
});
