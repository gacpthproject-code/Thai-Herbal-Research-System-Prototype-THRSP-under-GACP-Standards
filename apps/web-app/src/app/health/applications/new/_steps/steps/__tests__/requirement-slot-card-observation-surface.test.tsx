/**
 * A document card with pre-check observations must not look like a card that passed.
 *
 * Staging walk ccc4f707d (F12): the card with "ข้อสังเกตจากการตรวจเบื้องต้น" sat on the same
 * green (bg-leaf-soft) as a clean card, because `attached` alone chose the surface. A pass is
 * never claimed by colour (order 154); an observation gets the caution edge on the neutral
 * card, calm, and distinct from both the clean card and a missing one.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { RequirementSlotCard } from '../requirement-slot-card';
import type { ApplicantPrecheck, RequirementSlot } from '@/lib/services/application-requirements';

const slot = (precheck: ApplicantPrecheck | null, patch: Partial<RequirementSlot> = {}): RequirementSlot => ({
    slotId: 'land_rights',
    labelTH: 'เอกสารสิทธิ์ที่ดิน',
    description: null,
    sourceHint: null,
    required: true,
    requiredReason: 'ALWAYS',
    satisfied: true,
    fileUrl: '/uploads/a.pdf',
    fileName: 'chanote.pdf',
    uploadedAt: null,
    precheck,
    ...patch,
});
const pc = (patch: Partial<ApplicantPrecheck>): ApplicantPrecheck => ({
    id: 'pc-1', status: 'DONE', flags: [], acknowledgedAt: null, ...patch,
});
const render = (s: RequirementSlot) => renderToStaticMarkup(
    <RequirementSlotCard slot={s} appId="app-1" onChanged={() => undefined} editable stepKey="identity" />,
);
const surface = (html: string) => html.match(/class="rounded-xl border-2 p-4[^"]*"/)?.[0] ?? '';

const FLAGGED = pc({ flags: [{ check: 'DOC_TYPE', result: 'NOT_FOUND', reasonTH: 'ไม่พบข้อความที่ตรงกับชนิดเอกสารที่คาด กรุณาตรวจว่าอัปโหลดถูกช่อง' }] });
const CLEAN = pc({ flags: [{ check: 'READABLE', result: 'PASS', reasonTH: 'อ่านเอกสารได้ชัดเจน' }] });

describe('the card surface says what the pre-check found', () => {
    it('an observation card wears the caution edge on the neutral card, not the pass green', () => {
        const s = surface(render(slot(FLAGGED)));
        expect(s).toContain('border-caution-edge');
        expect(s).toContain('bg-card');
        expect(s).not.toContain('bg-leaf-soft');
        expect(s).not.toContain('bg-caution-soft');
    });

    it('a clean card and an attached card without a pre-check keep the green', () => {
        expect(surface(render(slot(CLEAN)))).toContain('bg-leaf-soft');
        expect(surface(render(slot(null)))).toContain('bg-leaf-soft');
    });

    it('a card still being checked, or whose check failed, is neutral: nothing has been found yet', () => {
        expect(surface(render(slot(pc({ status: 'PENDING' }))))).not.toContain('bg-leaf-soft');
        expect(surface(render(slot(pc({ status: 'FAILED' }))))).not.toContain('bg-leaf-soft');
    });

    it('a missing required paper keeps its own caution fill, so the two amber cards still differ', () => {
        expect(surface(render(slot(null, { satisfied: false, fileUrl: null, fileName: null })))).toContain('bg-caution-soft');
    });
});
