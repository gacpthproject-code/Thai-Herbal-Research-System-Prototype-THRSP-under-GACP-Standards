/**
 * Thai staff screens say what they mean in Thai (operator 2026-10-09: "SLA ทำเป็นชื่อไทยเต็มได้หรือไม่
 * กลัวคนใช้ไม่เข้าใจ"). No "SLA", "KPI", "Audit Log" or "Stage Activity" in any Thai string a staff
 * screen shows: กำหนดเวลาดำเนินการ, ตัวชี้วัด, บันทึกการตรวจสอบ, งานที่เกิดในแต่ละขั้นตอน.
 *
 * Scans the staff pages, the staff components and the Thai provider dictionary. A string counts as
 * Thai copy when it carries a Thai character; every string of the Thai dictionary counts. Comments,
 * identifiers and English fallbacks are not copy. The finance pages under provider/accounting and
 * the analytics landing belong to another change and are left out here.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const ROOTS = [
    'app/provider',
    'app/admin',
    'components/admin',
    'components/feature/notification-preferences.tsx',
    'lib/i18n/dictionaries/sections/th-provider.ts',
];
const EXCLUDED = [/\/__tests__\//, /^app\/provider\/accounting\//, /^app\/provider\/analytics\/page\.tsx$/];
const JARGON = /\bSLA\b|\bKPIs?\b|Audit Log|Stage Activity/;
const DICTIONARY_ENGLISH = /\b(?:PASS|ONLINE|ONSITE|Minor|Major|Workflow|Auditor)\b|X3\.5/;
const THAI = /[฀-๿]/;

function filesUnder(rel: string): string[] {
    const abs = path.join(SRC, rel);
    if (!fs.existsSync(abs)) { return []; }
    if (fs.statSync(abs).isFile()) { return [rel]; }
    return fs.readdirSync(abs).flatMap((name) => filesUnder(path.join(rel, name)));
}

function stripComments(source: string): string {
    return source
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function copyStrings(source: string): string[] {
    const code = stripComments(source);
    const literals = code.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
    const jsxText = Array.from(code.matchAll(/>([^<>{}]+)</g), (m) => m[1]);
    return [...literals, ...jsxText];
}

describe('Thai staff copy has no English jargon', () => {
    const files = ROOTS.flatMap(filesUnder)
        .filter((rel) => /\.(ts|tsx)$/.test(rel))
        .filter((rel) => !EXCLUDED.some((pattern) => pattern.test(rel.split(path.sep).join('/'))));

    test('the scan reaches the staff pages and the Thai dictionary', () => {
        expect(files.some((rel) => rel.endsWith('th-provider.ts'))).toBe(true);
        expect(files.filter((rel) => rel.startsWith('app/provider')).length).toBeGreaterThan(50);
    });

    test('no SLA / KPI / Audit Log / Stage Activity in Thai copy', () => {
        const offenders: string[] = [];
        for (const rel of files) {
            const source = fs.readFileSync(path.join(SRC, rel), 'utf8');
            const isThaiDictionary = rel.endsWith('th-provider.ts');
            for (const text of copyStrings(source)) {
                if (!JARGON.test(text)) { continue; }
                if (!isThaiDictionary && !THAI.test(text)) { continue; }
                offenders.push(`${rel}: ${text.trim().slice(0, 90)}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    test('the Thai provider dictionary holds no English UI word (order 12: the keys that held them were read by no screen)', () => {
        const dictionary = fs.readFileSync(path.join(SRC, 'lib/i18n/dictionaries/sections/th-provider.ts'), 'utf8');
        const english = copyStrings(dictionary).filter((text) => DICTIONARY_ENGLISH.test(text)).map((text) => text.trim());
        expect(english).toEqual([]);
    });
});
