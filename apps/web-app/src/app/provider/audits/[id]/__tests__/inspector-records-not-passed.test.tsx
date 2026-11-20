/**
 * Order 56(2): the field inspector records "ไม่ผ่าน" with its findings and the certificate approver
 * decides; the inspector never closes the application. Both inspector screens offer the same results
 * (ผ่าน · ข้อบกพร่องเล็กน้อย · ข้อบกพร่องสำคัญ · ไม่ผ่าน), and the job sheet's "ปฏิเสธคำขอ" is gone.
 */

import * as React from 'react';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), forward: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/provider/audits/test-id',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({ id: 'test-id' }),
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));

import { AuditDecisionModal, type CARFinding } from '../audit-decision-modal';
import { STATUS_LABELS } from '@/lib/constants/workflow-states';
import { applicantStatus } from '@/lib/health-dashboard-stage';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', ...parts), 'utf8');
const jobSheet = read('page.tsx');
const fieldScreen = read('inspect', 'client-view.tsx');

const COMPLETE: CARFinding = { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ย', correctiveAction: 'จัดทำสมุดบันทึก', category: '' };

describe('the job sheet "ไม่ผ่าน" dialog', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });
    afterEach(() => {
        if (root) { act(() => { root?.unmount(); }); root = null; }
        container?.remove();
        container = null;
    });

    async function mount(findings: CARFinding[]) {
        await act(async () => {
            root = createRoot(container!);
            root.render(
                <AuditDecisionModal
                    opened
                    decision="FAIL"
                    decisionNotes=""
                    evidenceFiles={[]}
                    findings={findings}
                    isCompressing={false}
                    isSubmitting={false}
                    onClose={() => {}}
                    onDecisionNotesChange={() => {}}
                    onEvidenceUpload={() => {}}
                    onRemoveEvidence={() => {}}
                    onFindingsChange={() => {}}
                    formatBytes={(b: number) => `${b}B`}
                    onSubmit={() => {}}
                />,
            );
        });
        await act(async () => { await Promise.resolve(); });
        return document.body;
    }
    const confirm = (body: HTMLElement) => [...body.querySelectorAll('button')].find((b) => b.textContent?.includes('ยืนยันบันทึกผลไม่ผ่าน'));

    it('says the result goes to the approver and does not close the application', async () => {
        const body = await mount([]);
        expect(body.textContent).toContain('บันทึกผลไม่ผ่าน');
        expect(body.textContent).toContain('ผลนี้จะส่งให้ผู้อนุมัติพิจารณา คุณไม่ได้ปิดคำขอ');
    });

    it('cannot be confirmed until one finding names what was found and how to correct it', async () => {
        const body = await mount([{ ...COMPLETE, correctiveAction: '' }]);
        expect(confirm(body)?.hasAttribute('disabled')).toBe(true);
    });

    it('is confirmed with one complete finding', async () => {
        const body = await mount([COMPLETE]);
        expect(confirm(body)?.hasAttribute('disabled')).toBe(false);
    });

    it('marks what was found and how to correct it as required, and the summary as optional', async () => {
        const body = await mount([COMPLETE]);
        const heads = [...body.querySelectorAll('.field-block > div:first-child')].map((d) => d.textContent?.replace(/\s+/g, ''));
        expect(heads).toEqual(expect.arrayContaining(['ข้อที่พบจำเป็น', 'แนวทางแก้ไขจำเป็น', 'บันทึกสรุปไม่บังคับ']));
    });
});

describe('the two inspector screens offer one set of results', () => {
    it('the job sheet has no "ปฏิเสธคำขอ" and offers "ไม่ผ่าน" only at a visit', () => {
        expect(jobSheet).not.toContain('ปฏิเสธคำขอ');
        expect(jobSheet).not.toContain('setDecision("REJECT")');
        expect(jobSheet).toMatch(/workflowState !== "CAR_REVIEWING" && \(\s*<Button[\s\S]{0,120}?setDecision\("FAIL"\)/);
        expect(jobSheet).toContain('การพิจารณาหลักฐานบนโต๊ะให้ผลได้แค่ ผ่าน สั่งแก้ไขเพิ่ม หรือขอลงพื้นที่ซ้ำ');
    });

    it('the field screen offers minor and major findings and sends the job sheet\'s findings shape', () => {
        for (const value of ['PASS', 'MINOR', 'MAJOR', 'FAIL']) {
            expect(fieldScreen).toContain(`value: '${value}'`);
        }
        expect(fieldScreen).not.toContain('criticalFindings');
        expect(fieldScreen).toMatch(/findings: findings/);
    });
});

describe('the words on screen', () => {
    it('a file that did not pass waits for the decision, for staff and for the applicant', () => {
        expect(STATUS_LABELS.AUDIT_NOT_PASSED).toBe('ไม่ผ่านตรวจ รอตัดสิน');
        expect(applicantStatus('AUDIT_NOT_PASSED').stage).toBe('PENDING_DECISION');
    });

    it('a refused application reads "ไม่ได้รับการรับรอง" on every page (order 78(2))', () => {
        expect(STATUS_LABELS.REJECTED).toBe('ไม่ได้รับการรับรอง');
        expect(applicantStatus('REJECTED').label).toBe('ไม่ได้รับการรับรอง');
    });
});
