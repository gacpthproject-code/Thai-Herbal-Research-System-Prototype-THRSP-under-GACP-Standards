'use strict';

/**
 * payment-terms v1.3 is the document in force (operator 2026-10-06: "งั้นก็ต้องแก้เอกสารให้ตรง",
 * refund ruling "เคส 1, 2 อันนี้ยกเลิกแล้วไม่คืน · 3 ต้องหาวิธีแก้เคส และเงินคืนไม่ได้",
 * amended "ข้อ 2 คืนเงินได้ แต่ต้องอธิบายเคสให้เคลียร์").
 *
 * v1.2 §7.2 refunded an applicant who cancelled before review, refunded a
 * system-error cancellation, and promised "เงินคืนหรือการเยียวยา" when the
 * company or the state cancelled, with no list of what counts. v1.3 replaces it
 * for NEW acceptances; an applicant who accepted v1.2 is asked to accept v1.3
 * before their next payment (gate: services/billing/payment-terms-gate.js
 * compares the grant to ConsentVersions.PAYMENT_TERMS). v1.2 stays provable in
 * payment-terms-v1-2-as-published.test.js.
 */

const fs = require('fs');
const path = require('path');

const LEGAL_DIR = path.resolve(__dirname, '../../../../docs/legal');
const V13 = path.join(LEGAL_DIR, 'payment-terms-th-v1.3.md');
const ENV_TEMPLATES = [
    path.resolve(__dirname, '../../.env.example'),
    path.resolve(__dirname, '../../.env.production.example'),
];
const ENV_KEY = 'CONSENT_VERSION_PAYMENT_TERMS';

const read = (file) => fs.readFileSync(file, 'utf8');
/** What the applicant accepts: maintainer notes (HTML comments) are not part of it. */
const applicantFacing = (doc) => doc.replace(/<!--[\s\S]*?-->/g, '');

function publishedPaymentTermsVersion() {
    const had = Object.prototype.hasOwnProperty.call(process.env, ENV_KEY);
    const saved = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
    let versions;
    jest.isolateModules(() => {
        jest.doMock('../../services/prisma-database', () => ({ prisma: {} }));
        versions = require('../../middleware/consent-manager').ConsentVersions;
    });
    if (had) { process.env[ENV_KEY] = saved; }
    return versions.PAYMENT_TERMS;
}

describe('payment-terms v1.3 is published', () => {
    it('the runtime stamps payment-terms-th-v1.3 when no override is set', () => {
        expect(publishedPaymentTermsVersion()).toBe('payment-terms-th-v1.3');
    });

    it('the published file exists under its final name and no draft file is left beside it', () => {
        expect(fs.existsSync(V13)).toBe(true);
        const drafts = fs.readdirSync(LEGAL_DIR).filter((f) => /payment-terms-th-v1\.3-DRAFT/.test(f));
        expect(drafts).toEqual([]);
    });

    it('its title is the final one and it carries the version string the runtime stamps', () => {
        const doc = read(V13);
        expect(doc.split('\n')[0]).toBe('# เงื่อนไขการชำระค่าบริการและการคืนเงิน (ฉบับที่ 1.3)');
        expect(doc).toContain('`payment-terms-th-v1.3`');
    });

    it('states its effective date the way v1.1 states its own', () => {
        const text = applicantFacing(read(V13));
        expect(text).toContain('**สถานะ: ใช้แทนฉบับที่ 1.2 ตั้งแต่วันที่ 7 ตุลาคม 2569**');
        expect(text).toMatch(/ผู้ที่เคยกดยอมรับฉบับก่อนหน้า[\s\S]{0,80}กดยอมรับฉบับนี้อีกหนึ่งครั้งก่อนชำระเงินครั้งถัดไป/);
    });

    it('the published text carries no ⟨…⟩ placeholder, no TODO and no ร่าง', () => {
        const text = applicantFacing(read(V13));
        expect(text).not.toMatch(/⟨[^⟩]*⟩/);
        expect(text).not.toMatch(/TODO/i);
        expect(text).not.toContain('ร่าง');
    });

    it('carries no draft marker and no source appendix', () => {
        const doc = read(V13);
        expect(doc).not.toMatch(/ร่าง/);
        expect(applicantFacing(doc)).not.toMatch(/DRAFT/);
        expect(doc).not.toContain('ภาคผนวก ที่มาของแต่ละข้อ');
        expect(doc).not.toContain('ยังไม่ประกาศใช้');
    });
});

describe('payment-terms v1.3 says what the finance documents say', () => {
    const text = applicantFacing(read(V13));
    // The one catalogue every finance document prints from (fix/fee-line-descriptions).
    const { SERVICE_CATALOGUE } = require('../../shared/instalment-service-names');
    const COVERAGE_LABEL = 'ครอบคลุม: ';
    const lines = text.split('\n');

    it('the §2 table names every row exactly as the catalogue does', () => {
        expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^\\| ${SERVICE_CATALOGUE.PHASE_1.name} \\|`)));
        expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^\\| ${SERVICE_CATALOGUE.PHASE_2.name} \\|`)));
        expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^\\| ${SERVICE_CATALOGUE.RENEWAL.name} \\(ชำระครั้งเดียว\\) \\|`)));
    });

    it('§2.5 prints each catalogue name and coverage exactly (the documents print "ครอบคลุม: " where the terms print the name)', () => {
        for (const key of ['PHASE_1', 'PHASE_2', 'RENEWAL']) {
            const { name, coverage } = SERVICE_CATALOGUE[key];
            expect(coverage.startsWith(COVERAGE_LABEL)).toBe(true);
            expect(lines).toContain(`- ${name}: ${coverage.slice(COVERAGE_LABEL.length)}`);
        }
    });

    it('§2.5 states what each line covers, and §2.6 states one fee', () => {
        expect(text).toMatch(/^2\.5 ค่าบริการแต่ละรายการครอบคลุมงานดังนี้/m);
        expect(text).toMatch(/^2\.6 ค่าบริการเป็นจำนวนเดียวที่บริษัทเรียกเก็บ ไม่แยกเป็นส่วนของหน่วยงานรัฐ/m);
    });

    it('no longer splits the price into a state part and a platform part', () => {
        expect(text).not.toContain('ค่าธรรมเนียมรัฐ');
        expect(text).not.toContain('ค่าบริการแพลตฟอร์ม');
    });

    it('prints the totals the fee service produces', () => {
        const { calculateApplicationFees, calculateRenewalFee } = require('../../modules/billing');
        const fees = calculateApplicationFees({ cultivationMethods: ['outdoor'] }, { scopeCount: 1 });
        const renewal = calculateRenewalFee({ cultivationMethods: ['outdoor'] }, { scopeCount: 1 });
        const thb = (n) => Number(n).toLocaleString('en-US');
        expect(text).toContain(`**${thb(fees.phase1.phaseTotal)} บาท**`);
        expect(text).toContain(`**${thb(fees.phase2.phaseTotal)} บาท**`);
        expect(text).toMatch(new RegExp(`${SERVICE_CATALOGUE.RENEWAL.name}[^\\n]*\\*\\*${thb(renewal.phaseTotal)} บาท\\*\\*`));
    });
});


describe('payment-terms v1.3 §7 states the 2026-10-06 refund ruling', () => {
    const text = applicantFacing(read(V13)).replace(/\*\*/g, '');
    const section = (n) => {
        const m = text.match(new RegExp(`^## ${n}\\. [\\s\\S]*?(?=^## )`, 'm'));
        if (!m) { throw new Error(`§${n} not found`); }
        return m[0];
    };
    const s7 = section(7);
    const clause = (n) => {
        const at = s7.search(new RegExp(`^${n.replace(/\./g, '\\.')} `, 'm'));
        if (at < 0) { throw new Error(`clause ${n} not found`); }
        return at;
    };
    const between = (from, to) => s7.slice(clause(from.trim()), clause(to.trim()));
    const items = (from, to) => between(from, to).split('\n').filter((l) => /^- \(/.test(l));
    const tableRows = s7.split('\n').filter((l) => /^\| /.test(l)).slice(1)
        .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

    it('opens with a summary table, one row per case, before the formal clauses', () => {
        expect(s7.indexOf('| กรณี | ผลต่อคำขอ | เงินคืน | สิ่งที่ท่านต้องทำ |')).toBeLessThan(s7.search(/^7\.1 /m));
        expect(tableRows.map((r) => r[0])).toEqual([
            'ขอยกเลิกคำขอเอง',
            'บริษัทหรือหน่วยงานของรัฐยกเลิกการให้บริการ',
            'คำขอถูกยกเลิกเพราะความผิดพลาดของระบบ',
            'ระบบเรียกเก็บเงินซ้ำหรือเกิน',
        ]);
        expect(tableRows.map((r) => r[2].startsWith('คืนเงิน'))).toEqual([false, true, false, true]);
    });

    it('every no-refund row says why in one line, and the company cancelling opens with an apology', () => {
        for (const row of tableRows.filter((r) => r[2].startsWith('ไม่คืนเงิน'))) {
            expect(row[2]).toMatch(/^ไม่คืนเงิน ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจาก\S/);
        }
        expect(tableRows[1][1].startsWith('บริษัทขออภัย')).toBe(true);
        expect(s7).toContain('กรณีอื่น เช่น ผลการตรวจไม่ผ่าน หรือคำขอถูกยกเลิกเพราะพ้นกำหนดแก้ไขหรือไม่ชำระค่าบริการ ค่าบริการที่ชำระแล้วไม่อยู่ในเงื่อนไขการคืนเงินตามข้อ 7.1');
    });

    it('the applicant cancelling, even before review, is not refunded, and the clause says why', () => {
        expect(s7).toContain('ค่าบริการที่ชำระแล้วไม่อยู่ในเงื่อนไขการคืนเงิน ยกเว้นสองกรณี');
        expect(s7).toContain('- (ก) ท่านขอยกเลิกคำขอเอง แม้จะยังไม่เริ่มดำเนินการตรวจของงวดที่ชำระแล้ว ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจาก');
        expect(text).not.toContain('บริษัทคืนค่าบริการของงวดนั้น');
        const cases71 = items('7.1 ', '7.2 ');
        expect(cases71).toHaveLength(4);
        for (const line of cases71) { expect(line).toContain('ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจาก'); }
    });

    it('a system-error cancellation is repaired at no cost, not refunded (§7.1 (ง), §10)', () => {
        expect(s7).toContain('บริษัทคืนสถานะคำขอให้ท่านดำเนินการต่อในคำขอเดิมโดยไม่มีค่าใช้จ่ายเพิ่มตามข้อ 10');
        const s10 = section(10);
        expect(s10).toContain('ไม่ต้องชำระค่าบริการของงวดที่ชำระแล้วอีก');
        expect(s10).toContain('ค่าบริการส่วนนี้ไม่อยู่ในเงื่อนไขการคืนเงิน เนื่องจากค่าบริการที่ชำระแล้วใช้ต่อในคำขอเดิมได้ทั้งหมด');
    });

    it('a company/state cancellation refunds, with an apology, only the instalments not yet started, for a closed list of reasons, and closes the application', () => {
        expect(s7).toContain('บริษัทขออภัยหากต้องยกเลิกการให้บริการแก่ท่าน ในกรณีนี้บริษัทคืนค่าบริการของงวดที่ชำระแล้วแต่ยังไม่ได้เริ่มดำเนินการตรวจ และปิดคำขอเป็นยกเลิก');
        expect(s7).toContain('เฉพาะเมื่อการยกเลิกเกิดจากเหตุใดเหตุหนึ่งตามข้อ 7.2.1 เท่านั้น');
        expect(s7).toContain('มีเพียงเหตุต่อไปนี้');
        expect(items('7.2.1 ', '7.2.2 ')).toHaveLength(4);
        // operator 2026-10-06: reason (ง) carries the one window, read from shared/refund-kinds.js
        const { PAYMENT_TERMS_VERSIONS } = require('../../shared/refund-kinds');
        const v13Window = { workingDays: PAYMENT_TERMS_VERSIONS['payment-terms-th-v1.3'].companyInspectWorkingDays };
        expect(between('7.2.1 ', '7.2.2 ').match(/\d+ วันทำการ/g)).toEqual([`${v13Window.workingDays} วันทำการ`]);
        expect(items('7.2.1 ', '7.2.2 ')[3]).toContain(`ภายใน ${v13Window.workingDays} วันทำการ นับจากวันที่ชำระเงินงวดที่ 2`);
        const excluded = items('7.2.2 ', '7.2.3 ');
        for (const own of ['เอกสารประกอบคำขอไม่ครบ', 'ไม่ผ่าน', 'พ้นกำหนดแก้ไข', 'ข้อ 6.3', 'ท่านขอยกเลิกคำขอเอง', 'ขอเลื่อนการตรวจ', 'เพิกถอน']) {
            expect(excluded.some((l) => l.includes(own))).toBe(true);
        }
        expect(s7).toContain('งวดที่เริ่มดำเนินการตรวจแล้วไม่อยู่ในเงื่อนไขการคืนเงิน');
        expect(s7).toContain('บริษัทเป็นฝ่ายเริ่มเรื่องคืนเงินให้โดยท่านไม่ต้องร้องขอ');
        expect(text).not.toContain('มีสิทธิ์ได้รับเงินคืนหรือการเยียวยา');
    });

    it('a duplicate or over-charge refunds only the excess, leaving the application and the instalment as they were', () => {
        expect(s7).toContain('คืนเงินเฉพาะส่วนที่เก็บซ้ำหรือเกิน รวมภาษีมูลค่าเพิ่มของส่วนนั้น');
        expect(s7).toContain('การคืนเงินนี้ไม่เปลี่ยนสถานะคำขอ และงวดนั้นยังถือว่าชำระแล้ว');
    });

    it('every refund is a credit note plus a bank transfer within 15 working days, and the only refund kinds are §7.2 and §7.3', () => {
        expect(s7).toMatch(/^7\.4 การคืนเงินตามข้อ 7\.2 และข้อ 7\.3 บริษัทออกใบลดหนี้ให้ท่าน/m);
        expect(s7).toContain('ภายใน 15 วันทำการ');
        expect(text).toContain('กรณีมีการคืนเงินตามข้อ 7.2 หรือข้อ 7.3 บริษัทออกใบลดหนี้ให้ท่านเพิ่มเติม');
    });

    it('opens with what changed from v1.2, names PromptPay only, and makes none of the retired claims', () => {
        expect(text).toContain('สิ่งที่เปลี่ยนจากฉบับที่ 1.2');
        expect(text).toContain('พร้อมเพย์ (สแกนคิวอาร์โค้ด)');
        expect(text).not.toMatch(/stripe|webhook/i);
        expect(text).not.toMatch(/บัตรเครดิต|บัตรเดบิต/);
        expect(text).not.toMatch(/ข้อมูล[^\n]{0,20}(อยู่|เก็บ)[^\n]{0,20}ในประเทศไทย/);
        expect(text).not.toMatch(/[–—]/);
    });
});

describe('the env templates describe v1.3 as the default', () => {
    it.each(ENV_TEMPLATES)('%s names the v1.3 document and keeps the override commented out', (file) => {
        const template = read(file);
        expect(template).toContain('docs/legal/payment-terms-th-v1.3.md');
        expect(template).not.toContain('docs/legal/payment-terms-th-v1.2.md');
        expect(template).not.toContain('docs/legal/payment-terms-th-v1.1.md');
        const lines = template.split('\n').filter((l) => /CONSENT_VERSION_PAYMENT_TERMS=/.test(l));
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) { expect(line.trimStart().startsWith('#')).toBe(true); }
    });
});
