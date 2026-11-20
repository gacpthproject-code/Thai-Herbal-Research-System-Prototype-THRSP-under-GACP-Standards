'use strict';

/**
 * payment-terms v1.2, as published on 4 ตุลาคม 2569 (operator 2026-10-03: "ใช้ 1.2" → "ทำได้เลย"),
 * stays provable after v1.3 replaced it on 7 ตุลาคม 2569.
 *
 * Applicants accepted this text and orders carry its version stamp, so the
 * file stays byte for byte what they saw, and the claims it made about the
 * fee service and the finance documents stay true of it. The rollout itself
 * (a v1.1 grant refused under the v1.2 deploy, v1.1 orders still settling) is
 * replayed in __tests__/integration/payment-terms-rollout-real-postgres.test.js.
 * What is current now: payment-terms-v1-3-is-the-current-terms.test.js.
 */

const fs = require('fs');
const path = require('path');

const LEGAL_DIR = path.resolve(__dirname, '../../../../docs/legal');
const V12 = path.join(LEGAL_DIR, 'payment-terms-th-v1.2.md');
const V11 = path.join(LEGAL_DIR, 'payment-terms-th-v1.1.md');

const read = (file) => fs.readFileSync(file, 'utf8');
/** What the applicant accepts: maintainer notes (HTML comments) are not part of it. */
const applicantFacing = (doc) => doc.replace(/<!--[\s\S]*?-->/g, '');

describe('payment-terms v1.2 as published', () => {
    it('is the exact text its acceptors agreed to (sha256 of the file as published)', () => {
        const digest = require('crypto').createHash('sha256').update(fs.readFileSync(V12)).digest('hex');
        expect(digest).toBe('ea9fecb6551301b39d692066939674b6131e68c7b12065b3d2968483500bcdb1');
    });

    it('the published file exists under its final name and no draft file is left beside it', () => {
        expect(fs.existsSync(V12)).toBe(true);
        const drafts = fs.readdirSync(LEGAL_DIR).filter((f) => /payment-terms-th-v1\.2-DRAFT/.test(f));
        expect(drafts).toEqual([]);
    });

    it('its title is the final one and it carries the version string the runtime stamped on its acceptances', () => {
        const doc = read(V12);
        expect(doc.split('\n')[0]).toBe('# เงื่อนไขการชำระค่าบริการและการคืนเงิน (ฉบับที่ 1.2)');
        expect(doc).toContain('`payment-terms-th-v1.2`');
    });

    it('states its effective date the way v1.1 states its own', () => {
        const text = applicantFacing(read(V12));
        expect(text).toContain('**สถานะ: ใช้แทนฉบับที่ 1.1 ตั้งแต่วันที่ 4 ตุลาคม 2569**');
        expect(text).toMatch(/ผู้ที่เคยกดยอมรับฉบับก่อนหน้า[\s\S]{0,80}กดยอมรับฉบับนี้อีกหนึ่งครั้งก่อนชำระเงินครั้งถัดไป/);
    });

    it('the published text carries no ⟨…⟩ placeholder, no TODO and no ร่าง (operator filled §7.3/§11.1 on 2026-10-03)', () => {
        const text = applicantFacing(read(V12));
        expect(text).not.toMatch(/⟨[^⟩]*⟩/);
        expect(text).not.toMatch(/TODO/i);
        expect(text).not.toContain('ร่าง');
    });

    it('carries no draft marker and no source appendix', () => {
        const doc = read(V12);
        expect(doc).not.toMatch(/ร่าง/);
        expect(applicantFacing(doc)).not.toMatch(/DRAFT/);
        expect(doc).not.toContain('ภาคผนวก ที่มาของแต่ละข้อ');
        expect(doc).not.toContain('ยังไม่ประกาศใช้');
    });
});

describe('payment-terms v1.2 says what the finance documents say', () => {
    const text = applicantFacing(read(V12));
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

describe('v1.1 is superseded, not rewritten (applicants accepted that text)', () => {
    const doc = read(V11);

    it('is marked SUPERSEDED by v1.2 the way v1 was marked by v1.1', () => {
        expect(doc).toContain('**สถานะปัจจุบัน: SUPERSEDED 4 ตุลาคม 2569 ให้ใช้ `payment-terms-th-v1.2` แทน**');
        expect(doc).toMatch(/เก็บไว้เพื่อการตรวจสอบย้อนหลัง ห้ามแก้ข้อความ/);
    });

    it('keeps the text its acceptors agreed to', () => {
        expect(doc).toContain('`payment-terms-th-v1.1`');
        expect(doc).toContain('**สถานะ: ใช้แทนฉบับที่ 1 ตั้งแต่วันที่ 28 สิงหาคม 2569**');
        expect(doc).toContain('5,885');
        expect(doc).toContain('29,425');
    });
});
