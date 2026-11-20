import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Step4VarietyPurpose from '../step4-variety-purpose';
import Step3SiteLand from '../step3-site-land';
import { STEP4_COPY_TH } from '../step4-variety-purpose-config';
import { STEP3_COPY_TH } from '../step3-site-land-config';
import { Step6Review } from '../step6-review';
import { DECLARATION_ROWS } from '../step6-review-state';
import { ApplicationNavigation } from '@/components/application-flow/application-navigation';
import { buttonVariants } from '@/components/ui/primitives/button';
import { getStepDescriptions } from '../../application-flow-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
});

function mount(node: React.ReactElement): HTMLElement {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(node));
    return host;
}

function groupNamed(container: HTMLElement, role: 'group' | 'radiogroup', name: string): HTMLElement {
    const groups = Array.from(container.querySelectorAll<HTMLElement>(`[role="${role}"]`));
    const match = groups.find((group) => {
        const labelledBy = group.getAttribute('aria-labelledby');
        const label = labelledBy ? document.getElementById(labelledBy)?.textContent : group.getAttribute('aria-label');
        return (label ?? '').includes(name);
    });
    if (!match) { throw new Error(`no ${role} named ${name}`); }
    return match;
}

function options(group: HTMLElement, role: 'checkbox' | 'radio') {
    return Array.from(group.querySelectorAll<HTMLElement>(`[role="${role}"]`)).map((el) => ({
        el,
        label: el.closest('label')?.textContent?.trim(),
        checked: el.getAttribute('aria-checked'),
    }));
}

const ROW = { kind: 'OTHER_PART', name: 'ขิงพันธุ์พื้นเมือง', origin: 'DOMESTIC', source: 'แปลงขยาย', quantity: '20', unit: 'กิโลกรัม' } as const;

function step4(onChange = jest.fn()) {
    return mount(
        <Step4VarietyPurpose
            plantId="ginger"
            objectives={['RESEARCH']}
            varieties={[ROW]}
            varietiesNote=""
            certScope="PLANTING"
            processing={{}}
            onChange={onChange}
        />,
    );
}

describe('step 4 purpose is a tick-box list', () => {
    it('exposes each purpose as a checkbox carrying its checked state', () => {
        const purpose = groupNamed(step4(), 'group', STEP4_COPY_TH.objectiveHeading);
        expect(options(purpose, 'checkbox').map(({ label, checked }) => [label, checked])).toEqual([
            ['ศึกษาวิจัย (ภ.ท. 09)', 'true'],
            ['ส่งออกเพื่อการค้า (ภ.ท. 10)', 'false'],
            ['แปรรูปหรือจำหน่ายเพื่อการค้า (ภ.ท. 11)', 'false'],
        ]);
    });

    it('ticking a box adds to the chosen purposes and keeps the ones already ticked', () => {
        const onChange = jest.fn();
        const purpose = groupNamed(step4(onChange), 'group', STEP4_COPY_TH.objectiveHeading);
        act(() => options(purpose, 'checkbox')[1].el.click());
        expect(onChange).toHaveBeenLastCalledWith('certificationPurposes', ['RESEARCH', 'EXPORT']);
        act(() => options(purpose, 'checkbox')[0].el.click());
        expect(onChange).toHaveBeenLastCalledWith('certificationPurposes', []);
    });

    it('offers no medical purpose', () => {
        const purpose = groupNamed(step4(), 'group', STEP4_COPY_TH.objectiveHeading);
        expect(options(purpose, 'checkbox').map((o) => o.label).join(' ')).not.toMatch(/การแพทย์/);
    });
});

describe('one-of answers are radio lists', () => {
    it('seed vs propagule and domestic vs imported are radio groups with one checked', () => {
        const container = step4();
        const radioGroups = Array.from(container.querySelectorAll<HTMLElement>('[role="radiogroup"]'));
        expect(radioGroups.map((group) => options(group, 'radio').map(({ label, checked }) => [label, checked]))).toEqual([
            [['เมล็ดพันธุ์', 'false'], ['ส่วนขยายพันธุ์อื่น เช่น กิ่งพันธุ์ ต้นกล้า', 'true']],
            [['ในประเทศ', 'true'], ['นำเข้า', 'false']],
        ]);
        expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(0);
    });

    it('arrow keys move the choice and the focus to the next radio', async () => {
        const onChange = jest.fn();
        const container = step4(onChange);
        const [kind] = Array.from(container.querySelectorAll<HTMLElement>('[role="radiogroup"]'));
        const radios = options(kind, 'radio');
        act(() => radios[1].el.focus());
        await act(async () => {
            radios[1].el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(document.activeElement).toBe(radios[0].el);
        expect(onChange).toHaveBeenLastCalledWith('varieties', [{ ...ROW, kind: 'SEED' }]);
    });
});

describe('step 3 uses the same two shapes', () => {
    function step3() {
        return mount(
            <Step3SiteLand
                farmData={{ landOwnership: 'RENTED', areaTypes: ['OUTDOOR', 'INDOOR'] }}
                slots={[]}
                appId="app-1"
                onChange={() => undefined}
                onChanged={() => undefined}
            />,
        );
    }

    it('area type is a tick-box list', () => {
        const area = groupNamed(step3(), 'group', STEP3_COPY_TH.areaType);
        expect(options(area, 'checkbox').map(({ checked }) => checked)).toEqual(['true', 'false', 'true']);
    });

    it('land rights is a radio list with the rented option checked', () => {
        const land = groupNamed(step3(), 'radiogroup', STEP3_COPY_TH.landOwnership);
        const radios = options(land, 'radio');
        expect(radios).toHaveLength(4);
        expect(radios.filter((r) => r.checked === 'true').map((r) => r.label)).toHaveLength(1);
        expect(radios.map((r) => r.checked)).toEqual(['false', 'false', 'true', 'false']);
    });
});

describe('step 6 uses the same tick box and the same primary button', () => {
    function step6(ticked: Record<string, boolean> = {}) {
        return mount(
            <Step6Review
                requirements={{ dims: {} as never, slots: [], missingRequired: [], blockingIssues: [], complete: true }}
                katorlor1Html="<p>กทล ๑</p>"
                ticked={ticked}
                onTick={() => undefined}
                onSubmit={() => undefined}
                submitting={false}
                error={null}
                alreadyAccepted={false}
                feeSummary={null}
                statusKnown
                missingConsents={['TERMS_OF_SERVICE']}
                consentsAgreed={false}
                consentTicked={{}}
                onConsentTick={() => undefined}
            />,
        );
    }

    it('every ส่วนที่ ๔ statement and system consent is a brand tick box, the same control as the purpose list', () => {
        const purposeBox = step4().querySelector<HTMLElement>('[role="group"] [role="checkbox"]')!;
        act(() => root?.unmount());
        host?.remove();
        const firstTicked = { [DECLARATION_ROWS[0].id]: true };
        const review = step6(firstTicked);
        expect(review.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
        const boxes = Array.from(review.querySelectorAll<HTMLElement>('[role="checkbox"]'));
        expect(boxes).toHaveLength(DECLARATION_ROWS.length + 1);
        expect(boxes.map((box) => box.getAttribute('aria-checked'))).toEqual(
            ['true', ...Array(DECLARATION_ROWS.length).fill('false')],
        );
        for (const box of boxes) { expect(box.className).toBe(purposeBox.className); }
        expect(purposeBox.className).toContain('data-[state=checked]:bg-leaf-700');
    });

    it('ยื่นคำขอ wears the primary variant, the same one ถัดไป wears', () => {
        const ticked = Object.fromEntries(DECLARATION_ROWS.map((row) => [row.id, true]));
        const submit = step6(ticked).querySelector<HTMLButtonElement>('[data-testid="step6-submit"]')!;
        const base = new Set(buttonVariants({ variant: 'ghost', size: null }).split(' '));
        const primary = buttonVariants({ variant: 'primary', size: null }).split(' ').filter((c) => !base.has(c));
        expect(primary).toEqual(expect.arrayContaining(['bg-leaf-700', 'text-white']));
        expect(submit.textContent).toBe('ยื่นคำขอ');
        expect(submit.className.split(' ')).toEqual(expect.arrayContaining(primary));
        expect(submit.className).not.toMatch(/bg-leaf-600/);

        act(() => root?.unmount());
        host?.remove();
        const nav = mount(<ApplicationNavigation showBack={false} nextLabel="ถัดไป" onNext={() => undefined} />);
        const next = Array.from(nav.querySelectorAll('button')).find((b) => b.textContent?.includes('ถัดไป'))!;
        expect(next.className.split(' ')).toEqual(expect.arrayContaining(primary));
    });
});

describe('the review step speaks plainly', () => {
    it('tells the applicant to check everything before filing, and never says เซิร์ฟเวอร์', () => {
        expect(getStepDescriptions('th').review).toBe('ตรวจข้อมูลทั้งหมดก่อนยื่นคำขอ');
        expect(Object.values(getStepDescriptions('th')).join(' ')).not.toContain('เซิร์ฟเวอร์');
    });
});
