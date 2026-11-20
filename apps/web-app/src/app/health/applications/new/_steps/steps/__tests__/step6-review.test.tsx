/**
 * Task 11 — the one review page, rendered from the SERVER's answer.
 *
 * The page it replaces (review-step.tsx) assembled the filing from the wizard's zustand
 * store and its own copy of the document catalogue. When the two disagreed the browser
 * won, and the applicant believed the browser — so a filing could look complete on the
 * last screen and be refused at the door. Everything below renders from what the server
 * returned and nothing else.
 *
 * The declarations are the other half. กทล.๑ ส่วนที่ ๔ is six separate statements, and the
 * server takes exactly one boolean and stamps the time itself, so this page's only job is
 * to make sure a person actually read the six before that boolean is sent.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from '@jest/globals';

import { Step6Review } from '../step6-review';
import { DECLARATION_ROWS } from '../step6-review-state';
import type { RequirementSlot, RequirementsPayload } from '@/lib/services/application-requirements';

const slot = (slotId: string, patch: Partial<RequirementSlot> = {}): RequirementSlot => ({
    slotId, labelTH: `เอกสาร ${slotId}`, description: null, sourceHint: null,
    required: true, requiredReason: 'ALWAYS', satisfied: false,
    fileUrl: null, fileName: null, uploadedAt: null, ...patch,
});

const payload = (slots: RequirementSlot[], complete: boolean): RequirementsPayload => ({
    dims: {} as never,
    slots,
    missingRequired: slots.filter((s) => s.required && !s.satisfied).map((s) => s.slotId),
    blockingIssues: [],
    complete,
});

const KATORLOR1 = '<h1 data-from="server">แบบ กทล ๑</h1>';

function render(node: React.ReactElement) { return renderToStaticMarkup(node); }

const submitTag = (html: string) => html.match(/<button[^>]*data-testid="step6-submit"[^>]*>/)?.[0] ?? '';
const submitDisabled = (html: string) => /\sdisabled(=""|\s|>)/.test(submitTag(html));

const base = {
    katorlor1Html: KATORLOR1,
    ticked: {} as Record<string, boolean>,
    onTick: () => {},
    onSubmit: () => {},
    submitting: false,
    error: null,
    alreadyAccepted: false,
    feeSummary: null,
    statusKnown: true,
    // ให้ความยินยอมของแพลตฟอร์มไว้แล้ว — เทสชุดนี้ตรวจคำรับรอง ส่วนที่ ๔ ไม่ใช่ด่านความยินยอม
    // ซึ่งมีเทสของตัวเองอยู่ด้านล่างและใน step6-review-state.test.ts
    consentsAgreed: true as string[],
    consentTicked: {} as Record<string, boolean>,
    onConsentTick: () => {},
};

describe('what an incomplete filing is told', () => {
    const html = render(
        <Step6Review {...base} requirements={payload([slot('landlord_consent'), slot('sop_manual')], false)} />,
    );

    it('names every missing paper, in the ministry’s words', () => {
        expect(html).toContain('เอกสาร landlord_consent');
        expect(html).toContain('เอกสาร sop_manual');
    });

    it('says which step fixes each one — a refusal that does not say where to go is half a refusal', () => {
        expect(html).toContain('/health/applications/new/step/3');
        expect(html).toContain('/health/applications/new/step/5');
    });

    it('the button is disabled, and it is the real HTML attribute, not just a colour', () => {
        expect(submitDisabled(html)).toBe(true);
    });

    it('the missing list is announced, not just coloured', () => {
        expect(html).toMatch(/role="alert"|role="status"/);
    });
});

describe('what a complete filing is told', () => {
    const complete = payload([slot('sop_manual', { satisfied: true })], true);

    it('with the six boxes unticked the button is still disabled', () => {
        const html = render(<Step6Review {...base} requirements={complete} />);
        expect(submitDisabled(html)).toBe(true);
    });

    it('with all six ticked the button is live', () => {
        const ticked = Object.fromEntries(DECLARATION_ROWS.map((r) => [r.id, true]));
        const html = render(<Step6Review {...base} requirements={complete} ticked={ticked} />);
        expect(submitDisabled(html)).toBe(false);
    });

    it('a correction resubmit does not ask again — the server already recorded the acceptance', () => {
        const html = render(<Step6Review {...base} requirements={complete} alreadyAccepted />);
        expect(submitDisabled(html)).toBe(false);
    });

    it('a defect found on site: the button saves the answers and names the evidence page as the next stop, instead of filing here', () => {
        const html = render(<Step6Review {...base} requirements={complete} alreadyAccepted carEvidenceRound />);
        expect(html).toContain('บันทึกคำตอบ แล้วไปส่งหลักฐานการแก้ไข');
        expect(html).not.toContain('>ยื่นคำขอ<');
        expect(html).toMatch(/data-testid="step6-car-evidence-round"[^>]*>คำขอนี้รอหลักฐานการแก้ไขข้อบกพร่องจากการตรวจแปลง/);
        const plain = render(<Step6Review {...base} requirements={complete} alreadyAccepted />);
        expect(plain).not.toContain('step6-car-evidence-round');
    });
});

describe('ส่วนที่ ๔ on the screen', () => {
    const html = render(<Step6Review {...base} requirements={payload([], true)} />);

    it('shows all six statements, each with its own box', () => {
        for (const row of DECLARATION_ROWS) { expect(html).toContain(row.text); }
        const boxes = html.match(/role="checkbox"/g) ?? [];
        expect(boxes.length).toBeGreaterThanOrEqual(DECLARATION_ROWS.length);
    });

    it('prints the form’s own numbering, so the screen and the paper are the same document', () => {
        expect(html).toContain('(๑)');
        expect(html).toContain('(๕)');
    });
});

describe('the form itself', () => {
    it('renders the กทล.1 the SERVER assembled, not one the browser drew', () => {
        const html = render(<Step6Review {...base} requirements={payload([], true)} />);
        expect(html).toContain('data-from="server"');
    });

    it('says so plainly when the server could not assemble it, instead of showing a blank frame', () => {
        const html = render(<Step6Review {...base} katorlor1Html={null} requirements={payload([], true)} />);
        expect(html).not.toContain('data-from="server"');
        expect(html).toMatch(/[ก-๙]/);
    });
});

describe('what it refuses to invent', () => {
    it('with no server answer at all it says it is still waiting, and the button stays dead', () => {
        const html = render(<Step6Review {...base} requirements={null} />);
        expect(submitDisabled(html)).toBe(true);
        // The intent is "claims nothing about THIS filing" — not "avoids a word". The word
        // ครบถ้วน is in คำรับรอง (๔)'s legal text and must stay there verbatim.
        expect(html).toContain('ยังยื่นไม่ได้จนกว่าระบบจะตอบ');
        expect(html).not.toMatch(/เอกสารครบ(ถ้วน)?แล้ว|พร้อมยื่น/);
    });

    it('reads no fee it was not given — no zero baht appears out of nowhere', () => {
        const html = render(<Step6Review {...base} requirements={payload([], true)} />);
        expect(html).not.toContain('0.00');
    });

    it('shows the fee the server calculated when it is given one', () => {
        const html = render(
            <Step6Review {...base} requirements={payload([], true)}
                feeSummary={{ phase1Total: 5885, grandTotal: 35310 }} />,
        );
        expect(html).toContain('5,885');
        expect(html).toContain('35,310');
    });
});

describe('when the page does not know what state the filing is in', () => {
    // Found by pressing the real door 2026-09-05: the preview endpoint refuses an
    // application already in review ("not in previewable state", 400). The wrapper read
    // the status from that payload, so a failed read left the status empty — and an empty
    // status is neither "first submit" nor "resubmit", which made the hand-over rail skip
    // the submit door entirely and route to the payments page. The applicant would have
    // been told they filed when nothing was filed. A page that does not know must not
    // offer the button.
    const complete = payload([slot('sop_manual', { satisfied: true })], true);
    const ticked = Object.fromEntries(DECLARATION_ROWS.map((r) => [r.id, true]));

    it('the button stays dead even with a complete filing and every box ticked', () => {
        const html = render(
            <Step6Review {...base} requirements={complete} ticked={ticked} statusKnown={false} />,
        );
        expect(submitDisabled(html)).toBe(true);
    });

    it('says why, instead of leaving a dead button with no explanation', () => {
        const html = render(
            <Step6Review {...base} requirements={complete} ticked={ticked} statusKnown={false} />,
        );
        expect(html).toMatch(/role="status"|role="alert"/);
        expect(html).toContain('สถานะ');
    });
});

describe('ด่านความยินยอมของแพลตฟอร์มบนหน้าตรวจทาน', () => {
    const complete = payload([slot('sop_manual', true)], true);
    const allTicked = Object.fromEntries(DECLARATION_ROWS.map((r) => [r.id, true]));

    it('ยังขาดความยินยอม: แสดงให้ติ๊ก พร้อมลิงก์ฉบับเต็ม และปุ่มยื่นยังกดไม่ได้', () => {
        const html = render(
            <Step6Review
                {...base}
                requirements={complete}
                ticked={allTicked}
                missingConsents={['TERMS_OF_SERVICE', 'PRIVACY_POLICY']}
                consentsAgreed={false}
            />,
        );
        expect(html).toContain('นโยบายความเป็นส่วนตัวและข้อกำหนดการใช้บริการ');
        expect(html).toContain('href="/terms-of-service"');
        expect(html).toContain('href="/privacy-policy"');
        expect(html).not.toContain('/api/consent/document/');
        expect(html).toContain('รับทราบนโยบายความเป็นส่วนตัว');
        expect(submitDisabled(html)).toBe(true);
    });

    it('ยังอ่านสถานะไม่เสร็จ: บอกว่ากำลังตรวจสอบ ไม่ใช่เงียบแล้วปล่อยให้กด', () => {
        const html = render(
            <Step6Review {...base} requirements={complete} ticked={allTicked} missingConsents={undefined} consentsAgreed={undefined} />,
        );
        expect(html).toContain('กำลังตรวจสอบสถานะการรับทราบนโยบายและข้อกำหนด');
        expect(submitDisabled(html)).toBe(true);
    });

    it('ให้ความยินยอมครบแล้ว: ไม่ต้องถามซ้ำ', () => {
        const html = render(
            <Step6Review {...base} requirements={complete} ticked={allTicked} missingConsents={[]} consentsAgreed />,
        );
        expect(html).not.toContain('นโยบายความเป็นส่วนตัวและข้อกำหนดการใช้บริการ');
    });
});

describe('a renewal asks what changed since the certificate it renews', () => {
    const complete = payload([], true);
    const ticked = Object.fromEntries(DECLARATION_ROWS.map((r) => [r.id, true]));

    it('shows the two choices, and no textarea until a change is declared', () => {
        const html = render(
            <Step6Review {...base} requirements={complete} ticked={ticked}
                renewalChange={{ changed: null, details: '' }} onRenewalChange={() => {}} />,
        );
        expect(html).toContain('คำรับรองการเปลี่ยนแปลง');
        expect(html).toContain('ไม่มีการเปลี่ยนแปลงจากใบรับรองเดิม');
        expect(html).toContain('มีการเปลี่ยนแปลง');
        expect(html).not.toContain('<textarea');
        expect(submitDisabled(html)).toBe(true);
    });

    it('a declared change asks for the details and holds the button until they are written', () => {
        const short = render(
            <Step6Review {...base} requirements={complete} ticked={ticked}
                renewalChange={{ changed: true, details: 'สั้น' }} onRenewalChange={() => {}} />,
        );
        expect(short).toContain('<textarea');
        expect(submitDisabled(short)).toBe(true);

        const written = render(
            <Step6Review {...base} requirements={complete} ticked={ticked}
                renewalChange={{ changed: true, details: 'เพิ่มโรงเรือนอีกหนึ่งหลัง' }} onRenewalChange={() => {}} />,
        );
        expect(submitDisabled(written)).toBe(false);
    });

    it('says the renewal fee is due after the documents pass, not at filing', () => {
        const html = render(
            <Step6Review {...base} requirements={complete} ticked={ticked}
                feeSummary={{ phase1Total: 1000, grandTotal: 2000 }}
                renewalChange={{ changed: false, details: '' }} onRenewalChange={() => {}} />,
        );
        expect(html).not.toContain('งวดที่ 1 (ชำระเมื่อยื่น)');
        expect(html).toContain('ค่าบริการต่ออายุเรียกเก็บหลังเอกสารผ่าน');
    });

    it('a new filing is not asked', () => {
        const html = render(<Step6Review {...base} requirements={complete} ticked={ticked} />);
        expect(html).not.toContain('คำรับรองการเปลี่ยนแปลง');
    });
});

describe('a refused filing is told which field, and where (round 2, I2)', () => {
    const complete = payload([], true);
    const html = render(
        <Step6Review
            {...base} requirements={complete} error="กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ: กรุณากรอกพิกัดที่ตั้ง"
            refusedFields={[{ key: '3', message: 'กรุณากรอกพิกัดที่ตั้ง' }, { key: 'varieties', message: 'กรุณาระบุชื่อสายพันธุ์อย่างน้อยหนึ่งรายการ' }]}
        />,
    );

    it('lists each refused field with a link to the step that fixes it', () => {
        expect(html).toContain('กรุณากรอกพิกัดที่ตั้ง');
        expect(html).toContain('href="/health/applications/new/step/3"');
        expect(html).toContain('กรุณาระบุชื่อสายพันธุ์อย่างน้อยหนึ่งรายการ');
        expect(html).toContain('href="/health/applications/new/step/4"');
        expect(html).toContain('ไปแก้ที่ขั้น 3');
    });

    it('shows no field list when nothing was refused', () => {
        const plain = render(<Step6Review {...base} requirements={complete} />);
        expect(plain).not.toContain('ไปแก้ที่ขั้น');
    });
});
