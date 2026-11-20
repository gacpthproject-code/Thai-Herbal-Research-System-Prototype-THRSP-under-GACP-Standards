'use strict';

/**
 * K1-K13 of the Track B dataset criteria as pure functions of one observation
 * (what the checker collected through the real doors, see check-dataset.js).
 * Each returns the list of problems; an empty list is a pass. The selftest
 * breaks one fact of a real observation at a time and expects its K to fail.
 *
 * Expectations here never come from the export code: pseudonyms and the key
 * fingerprint are recomputed from the documented construction, row counts come
 * from SQL, and consent outcomes come from the sample plan.
 */

const crypto = require('crypto');

const RECIPIENT = 'คลังข้อมูลวิจัยของโครงการ';
const BANNED_RECIPIENT = /บพข/;
// order 56(4.2): the store deletes what the withdrawn list names within 90 days, copies and backups too
const DELETION_DUTY_FACTS = ['ภายใน 90 วัน', 'สำเนา', 'ข้อมูลสำรอง'];
const PSEUDONYM_SHAPE = /^[0-9a-f]{32}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const FORMULA_LEAD = /^[=+\-@]/;
const FREE_TEXT_RULES = new Set(['freeText', 'freeTextList']);

/** ๐-๙ read as 0-9, so a number typed in Thai digits is judged like any other. */
const arabicDigits = (text) => text.replace(/[\u0E50-\u0E59]/g, (d) => String(d.charCodeAt(0) - 0x0E50));
// what people put between the digits of one number: space, tab . / - , en and em dash, no-break and thin space
const SEP = String.raw`[ \t./\-,\u2013\u2014\u00A0\u2009]`;
/** Every run of digits with brackets or up to three separators between them, as its bare digits. */
const numberRuns = (text) => [...text.matchAll(new RegExp(String.raw`\+?\(?\d(?:(?:${SEP}|[()]){0,3}\d)*`, 'g'))].map((m) => m[0].replace(/\D/g, ''));
// a Thai phone: 0 + 8 or 9 digits, or 66 (optionally +, optionally (0)) + 8 or 9 digits
const isPhoneDigits = (digits) => /^0\d{8,9}$/.test(digits) || /^660?\d{8,9}$/.test(digits);
const PHONE_SHAPES = [
    new RegExp(String.raw`(?<![\d+])\(?0\d(?:\)?${SEP}{0,3}\d){7,8}(?!\d)`),
    new RegExp(String.raw`(?<![\d+])\(?\+?66\)?${SEP}{0,3}(?:\(0\)${SEP}{0,3})?\d(?:\)?${SEP}{0,3}\d){7,8}(?!\d)`),
];
const PATTERNS = [
    ['เลขบัตร 13 หลัก', (cell) => new RegExp(String.raw`(?<!\d)\d(?:${SEP}*\d){12}(?!\d)`).test(cell)],
    ['อีเมล', (cell) => /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(cell)],
    ['เบอร์โทรไทย', (cell) => PHONE_SHAPES.some((re) => re.test(cell)) || numberRuns(cell).some(isPhoneDigits)],
    ['ตัวเลขต่อท้ายเลขบัตรที่ปิดแล้ว', (cell) => new RegExp(String.raw`\d-XXXX-XXXX-X-\d{4}${SEP}*\d`).test(cell)],
    ['ตัวเลขติดหน้าเลขบัตรที่ปิดแล้ว', (cell) => new RegExp(String.raw`\d${SEP}*\d-XXXX-XXXX-X-\d{4}`).test(cell)],
    ['เลขบัตรที่ปิดแล้วถูกตัดท้าย', (cell) => /\d-XXXX-XXXX-X-(?!\d{4}(?!\d))/.test(cell)],
    ['เลขบัตรที่ปิดแล้วถูกตัดหัว', (cell) => /(?<!\d)-XXXX-XXXX-X-/.test(cell)],
    ['ตัวเลขติดเบอร์โทรที่ปิดแล้ว', (cell) => new RegExp(String.raw`\[เบอร์โทร\]${SEP}*\d|\d${SEP}*\[เบอร์โทร\]`).test(cell.replace(/\d-XXXX-XXXX-X-\d{4}/g, '[เลขบัตร]'))],
    ['IPv4', (cell) => /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/.test(cell)],
    ['UUID', (cell) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(cell)],
];

function pseudonymiser(secret) {
    const derived = crypto.createHmac('sha256', secret).update('gacp:dataset-pseudonym:v1').digest();
    return {
        of: (value) => crypto.createHmac('sha256', derived).update(String(value)).digest('hex').slice(0, 32),
        fingerprint: crypto.createHmac('sha256', derived).update('gacp:dataset-pseudonym-key-fingerprint:v1').digest('hex').slice(0, 16),
    };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** RFC 4180: quoted fields, doubled quotes, CRLF or LF row ends. */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') { quoted = false; } else { cell += ch; }
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ',') {
            row.push(cell); cell = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') { i += 1; }
            row.push(cell); rows.push(row); row = []; cell = '';
        } else {
            cell += ch;
        }
    }
    if (quoted) { throw new Error('unterminated quoted field'); }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

/** A file as rows of { field: value }, plus the problems found reading it. */
function readTable(name, buf, fields) {
    const text = buf.toString('utf8');
    const problems = [];
    if (name.endsWith('.csv')) {
        if (!text.startsWith('\uFEFF')) { problems.push(`${name}: ไม่ขึ้นต้นด้วย BOM`); }
        let rows;
        try { rows = parseCsv(text.replace(/^\uFEFF/, '')); } catch (err) { return { rows: [], header: [], problems: [`${name}: อ่าน CSV ไม่ได้ (${err.message})`] }; }
        const [header = [], ...data] = rows;
        data.forEach((r, i) => { if (r.length !== header.length) { problems.push(`${name}: แถว ${i + 2} มี ${r.length} ช่อง หัวมี ${header.length}`); } });
        return { header, rows: data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]]))), problems };
    }
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') { lines.pop(); }
    const rows = [];
    lines.forEach((line, i) => {
        try { rows.push(JSON.parse(line)); } catch { problems.push(`${name}: บรรทัด ${i + 1} ไม่ใช่ JSON`); }
    });
    return { header: rows.length ? Object.keys(rows[0]) : fields, rows, problems };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tableOf = (obs) => Object.fromEntries([...obs.registry.domains, ...obs.registry.lists].map((t) => [t.key, t]));
const fileKey = (name) => name.replace(/\.(csv|jsonl)$/, '').replace('-withdrawn', '/withdrawn').replace('-deleted', '/deleted');

/** Every data file the observation holds, labelled by where it came from. */
function allFiles(obs) {
    const out = [];
    for (const [round, files] of Object.entries(obs.rounds)) { for (const [name, buf] of files) { out.push({ where: `รอบ ${round}`, name, buf }); } }
    for (const [label, bundle] of Object.entries(obs.bundles)) {
        for (const [name, buf] of bundle.files) { out.push({ where: `ชุดเต็ม ${label}`, name, buf }); }
    }
    for (const [label, files] of Object.entries(obs.extraFiles)) { for (const [name, buf] of files) { out.push({ where: label, name, buf }); } }
    return out;
}

function dictionaryTables(md) {
    const tables = {};
    let key = null;
    for (const line of md.split('\n')) {
        if (line.startsWith('#')) {
            const heading = line.match(/^#{2,3} .*\(`([^`]+)`\)$/);
            key = heading ? heading[1] : null;
            if (key) { tables[key] = []; }
            continue;
        }
        const cell = line.match(/^\| `([^`]+)` \|/);
        if (key && cell && !/^[A-Z][A-Za-z]+\./.test(cell[1])) { tables[key].push(cell[1]); }
    }
    return tables;
}

const CHECKS = [
    {
        id: 'K1', title: 'แคตตาล็อกตรงทะเบียน คู่มือ และขั้นตอนส่งมอบ',
        run(obs) {
            const p = [];
            const keys = obs.registry.domains.map((d) => d.key);
            const catalog = obs.catalog.adminA?.json?.data?.domains || [];
            if (!same(catalog.map((d) => d.key), keys)) { p.push(`แคตตาล็อก ${JSON.stringify(catalog.map((d) => d.key))} ≠ ทะเบียน ${JSON.stringify(keys)}`); }
            for (const d of catalog) {
                const reg = obs.registry.domains.find((x) => x.key === d.key);
                if (reg && d.fieldCount !== reg.fields.length) { p.push(`${d.key}: แคตตาล็อกบอก ${d.fieldCount} คอลัมน์ ทะเบียนมี ${reg.fields.length}`); }
                const lists = obs.registry.lists.filter((l) => l.domain === d.key).map((l) => l.key);
                if (!same((d.lists || []).map((l) => l.key), lists)) { p.push(`${d.key}: รายการลบในแคตตาล็อกไม่ตรงทะเบียน`); }
            }
            const headings = Object.keys(dictionaryTables(obs.texts.dictionary)).filter((k) => keys.includes(k));
            if (!same(headings, keys)) { p.push(`หัวข้อโดเมนในคู่มือ ${JSON.stringify(headings)} ≠ ทะเบียน`); }
            const stated = obs.texts.dictionary.match(/มี (\d+) โดเมน และรายการลบ (\d+) รายการ/);
            if (!stated || Number(stated[1]) !== keys.length || Number(stated[2]) !== obs.registry.lists.length) {
                p.push(`คู่มือไม่ได้ระบุจำนวนโดเมน ${keys.length} และรายการลบ ${obs.registry.lists.length} ให้ตรง`);
            }
            const readme = obs.texts.readme.match(/<!-- dataset:domains -->([\s\S]*?)<!-- \/dataset:domains -->/);
            const readmeKeys = readme ? [...readme[1].matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]) : null;
            if (!readmeKeys || !same(readmeKeys, [...keys, ...obs.registry.lists.map((l) => l.key)])) {
                p.push('docs/data/README.md ตาราง dataset:domains ไม่ตรงทะเบียน (โดเมนแล้วตามด้วยรายการลบ)');
            }
            return p;
        },
    },
    {
        id: 'K2', title: 'คู่มือสร้างใหม่จากโค้ดแล้วตรงกับที่ commit และตรงกับที่ประตูส่ง',
        run(obs) {
            const p = [];
            if (obs.texts.dictionaryRegenerated !== obs.texts.dictionary) { p.push('สร้างคู่มือใหม่แล้วไม่ตรง docs/data/data-dictionary.md (รัน node apps/backend/scripts/generate-data-dictionary.js)'); }
            if (obs.texts.dictionaryDoor !== obs.texts.dictionary) { p.push('GET /api/datasets/dictionary ไม่ตรง docs/data/data-dictionary.md'); }
            if (/generated \d{4}-\d{2}-\d{2}/.test(obs.texts.dictionary)) { p.push('คู่มือมีบรรทัดวันที่สร้าง'); }
            return p;
        },
    },
    {
        id: 'K3', title: 'คอลัมน์ไฟล์ = คอลัมน์คู่มือ = ทะเบียน ลำดับเดียวกัน',
        run(obs) {
            const p = [];
            const tables = tableOf(obs);
            const dict = dictionaryTables(obs.texts.dictionary);
            for (const [key, t] of Object.entries(tables)) {
                if (!same(dict[key], t.fields.map((f) => f.field))) { p.push(`${key}: ตารางในคู่มือ ${JSON.stringify(dict[key])} ≠ ทะเบียน`); }
            }
            for (const f of allFiles(obs).filter((x) => /\.(csv|jsonl)$/.test(x.name))) {
                const t = tables[fileKey(f.name)];
                if (!t) { p.push(`${f.where} ${f.name}: ไม่มีในทะเบียน`); continue; }
                const want = t.fields.map((x) => x.field);
                const { header, rows } = readTable(f.name, f.buf, want);
                if (!same(header, want)) { p.push(`${f.where} ${f.name}: หัว ${JSON.stringify(header)} ≠ ${JSON.stringify(want)}`); }
                if (f.name.endsWith('.jsonl')) {
                    rows.forEach((r, i) => { if (!same(Object.keys(r), want)) { p.push(`${f.where} ${f.name} บรรทัด ${i + 1}: คีย์ไม่ตรงทะเบียน`); } });
                }
            }
            return p;
        },
    },
    {
        id: 'K4', title: 'ทุกคอลัมน์ของตารางต้นทางถูกตัดสินแล้ว',
        run(obs) {
            const p = [];
            for (const domain of obs.registry.domains) {
                const decided = new Set(domain.withheld.filter((w) => w.reason).map((w) => w.column));
                for (const field of domain.fields) {
                    const path = (field.from || field.field).split('.');
                    let model = obs.models.get(domain.model);
                    for (const part of path.slice(0, -1)) { model = obs.models.get(model.fields.find((x) => x.name === part).type); }
                    decided.add(`${model.name}.${path[path.length - 1]}`);
                }
                for (const name of domain.sourceModels || [domain.model]) {
                    for (const column of obs.models.get(name).fields.filter((x) => x.kind !== 'object')) {
                        if (!decided.has(`${name}.${column.name}`)) { p.push(`${domain.key}: ${name}.${column.name} ยังไม่ถูกตัดสิน`); }
                    }
                }
                for (const { column } of domain.withheld) {
                    const [name, col] = column.split('.');
                    if (!obs.models.get(name)?.fields.some((x) => x.name === col && x.kind !== 'object')) { p.push(`${domain.key}: ${column} ในรายการไม่ส่งออกไม่ใช่คอลัมน์จริง`); }
                }
            }
            return p;
        },
    },
    {
        id: 'K5', title: 'จำนวนแถว CSV = JSONL = SQL ทุกโดเมนและรายการลบ',
        run(obs) {
            const p = [];
            const tables = tableOf(obs);
            for (const [round, files] of Object.entries(obs.rounds)) {
                const counts = obs.truth.counts[round];
                for (const key of Object.keys(tables)) {
                    const name = key.replace('/', '-');
                    const csv = files.get(`${name}.csv`);
                    const jsonl = files.get(`${name}.jsonl`);
                    if (!csv || !jsonl) { p.push(`รอบ ${round}: ไม่มีไฟล์ ${name}`); continue; }
                    const fields = tables[key].fields.map((f) => f.field);
                    const c = readTable(`${name}.csv`, csv, fields).rows.length;
                    const j = readTable(`${name}.jsonl`, jsonl, fields).rows.length;
                    if (c !== j || j !== counts[key]) { p.push(`รอบ ${round} ${key}: CSV ${c} · JSONL ${j} · SQL ${counts[key]}`); }
                }
            }
            for (const [label, bundle] of Object.entries(obs.bundles)) {
                for (const f of bundle.manifest.files.filter((x) => x.kind !== 'dictionary')) {
                    if (f.rows !== obs.truth.counts.B2[f.key]) { p.push(`ชุดเต็ม ${label} ${f.path}: manifest บอก ${f.rows} แถว SQL ${obs.truth.counts.B2[f.key]}`); }
                }
            }
            return p;
        },
    },
    {
        id: 'K6', title: 'ไม่มีรหัสจริงหรือข้อมูลระบุตัวหลุด',
        run(obs) {
            const p = [];
            for (const f of allFiles(obs)) {
                const text = f.buf.toString('utf8');
                for (const value of obs.truth.realValues) {
                    if (text.includes(value)) { p.push(`${f.where} ${f.name}: พบค่าจริง ${value.slice(0, 6)}…`); }
                }
                if (!/\.(csv|jsonl)$/.test(f.name)) { continue; }
                const { rows } = readTable(f.name, f.buf, []);
                const plantedWindows = (obs.truth.planted || []).flatMap((digits) => Array.from({ length: digits.length - 5 }, (_, i) => digits.slice(i, i + 6)));
                for (const row of rows) {
                    for (const value of Object.values(row)) {
                        const cell = arabicDigits(value === null || value === undefined ? '' : String(value));
                        if (PSEUDONYM_SHAPE.test(cell)) { continue; }
                        for (const [label, found] of PATTERNS) { if (found(cell)) { p.push(`${f.where} ${f.name}: ช่องมีรูปแบบ${label}`); } }
                        if (numberRuns(cell).some((run) => plantedWindows.some((w) => run.includes(w)))) {
                            p.push(`${f.where} ${f.name}: เลขบัตรหรือเบอร์ที่ชุดตัวอย่างพิมพ์ไว้หลุดออกมาตั้งแต่ 6 หลักติดกัน`);
                        }
                    }
                }
            }
            return [...new Set(p)];
        },
    },
    {
        id: 'K7', title: 'รหัสแฝงใช้เชื่อมได้จริง กุญแจต่างกันได้รหัสต่างกัน ลายนิ้วมือตรงกุญแจ',
        run(obs) {
            const p = [];
            const key1 = pseudonymiser(obs.keys.sample);
            const reverse = new Map(obs.truth.ids.map((id) => [key1.of(id), id]));
            const tables = tableOf(obs);
            for (const [name, buf] of obs.rounds.B2) {
                const key = fileKey(name);
                if (!name.endsWith('.jsonl')) { continue; }
                const pseudonymFields = (tables[key].fields || []).filter((f) => f.publish === 'pseudonym' || key.includes('/'))
                    .map((f) => f.field).filter((f) => !/On$/.test(f));
                for (const row of readTable(name, buf, []).rows) {
                    for (const field of pseudonymFields) {
                        const v = row[field];
                        if (v === null) { continue; }
                        if (!PSEUDONYM_SHAPE.test(String(v))) { p.push(`${name}.${field}: ไม่ใช่รหัสแฝง 32 ตัว`); continue; }
                        if (!reverse.has(v)) { p.push(`${name}.${field}: รหัสแฝงไม่ตรงรหัสจริงใดเลยเมื่อคำนวณใหม่ด้วยกุญแจที่ใช้`); }
                    }
                }
            }
            for (const [domain, relations] of Object.entries(obs.truth.relations)) {
                const buf = obs.rounds.B2.get(`${domain}.jsonl`);
                const rows = buf ? readTable(`${domain}.jsonl`, buf, []).rows : [];
                if (rows.length !== Object.keys(relations.byRow).length) { p.push(`${domain}: ${rows.length} แถว ฐานมี ${Object.keys(relations.byRow).length}`); }
                for (const row of rows) {
                    const rowKey = relations.keyFields.map((f) => reverse.get(row[f])).join('|');
                    const truth = relations.byRow[rowKey];
                    if (!truth) { p.push(`${domain}: มีแถวที่ไม่ตรงแถวใดในฐาน`); continue; }
                    for (const [field, realId] of Object.entries(truth)) {
                        const got = row[field] === null ? null : reverse.get(row[field]);
                        if (got !== realId) { p.push(`${domain}.${field}: เชื่อมไปผิดแถว`); }
                    }
                }
            }
            if (obs.bundles.B1.manifest.pseudonymKeyFingerprint !== key1.fingerprint) { p.push('ลายนิ้วมือกุญแจใน manifest ไม่ตรงกุญแจที่ใช้'); }
            const key2 = pseudonymiser(obs.keys.other);
            if (obs.otherKey.manifest.pseudonymKeyFingerprint !== key2.fingerprint || key2.fingerprint === key1.fingerprint) {
                p.push('ลายนิ้วมือของกุญแจที่สองไม่ตรง หรือไม่ต่างจากกุญแจแรก');
            }
            const first = readTable('a.jsonl', obs.rounds.B2.get('survey-responses.jsonl'), []).rows.map((r) => r.responseId);
            const second = readTable('b.jsonl', obs.otherKey.files.get('survey-responses.jsonl'), []).rows.map((r) => r.responseId);
            const overlap = second.filter((v) => first.includes(v));
            if (second.length === 0 || overlap.length) { p.push(`กุญแจที่สองได้รหัสแฝงซ้ำกับกุญแจแรก ${overlap.length} ค่า (หรือไม่มีแถว)`); }
            const reverse2 = new Set(obs.truth.ids.map((id) => key2.of(id)));
            if (second.some((v) => !reverse2.has(v))) { p.push('รหัสแฝงจากกุญแจที่สองไม่ตรงการคำนวณใหม่'); }
            return [...new Set(p)];
        },
    },
    {
        id: 'K8', title: 'ความยินยอมถูกเคารพ ช่องภาคและจังหวัดเล็กถูกปิด และรายการลบมีเฉพาะที่ส่งออกไปก่อน',
        run(obs) {
            const p = [];
            const key1 = pseudonymiser(obs.keys.sample);
            const responses = (round) => new Set(readTable('s.jsonl', obs.rounds[round].get('survey-responses.jsonl'), []).rows.map((r) => r.responseId));
            for (const [round, expected] of Object.entries(obs.truth.consent.exported)) {
                const want = new Set(expected.map((id) => key1.of(id)));
                const got = responses(round);
                if (!same([...got].sort(), [...want].sort())) { p.push(`รอบ ${round}: ชุดคำตอบที่ส่งออก ${got.size} ชุด แผนบอก ${want.size} ชุด`); }
            }
            for (const id of obs.truth.consent.never) {
                for (const round of Object.keys(obs.rounds)) { if (responses(round).has(key1.of(id))) { p.push(`รอบ ${round}: คำตอบที่ไม่ยินยอมหรือยินยอมรุ่นเก่าถูกส่งออก`); } }
            }
            const withdrawn = readTable('w.jsonl', obs.rounds.B2.get('survey-responses-withdrawn.jsonl'), []).rows.map((r) => r.responseId);
            const exportedBefore = responses('A');
            const wantWithdrawn = obs.truth.consent.withdrawn.map((id) => key1.of(id));
            if (!same([...withdrawn].sort(), [...wantWithdrawn].sort()) || withdrawn.some((v) => !exportedBefore.has(v))) {
                p.push('รายการคำตอบที่ถอนไม่ตรงกับรหัสแฝงที่ส่งออกไปก่อนถอน');
            }
            for (const [domain, realIds] of Object.entries(obs.truth.deleted)) {
                const ids = (round) => new Set(readTable('x.jsonl', obs.rounds[round].get(`${domain}.jsonl`), []).rows.map((r) => r.id));
                const listed = readTable('d.jsonl', obs.rounds.B2.get(`${domain}-deleted.jsonl`), []).rows.map((r) => r.id);
                const want = realIds.map((id) => key1.of(id));
                if (want.length === 0) { p.push(`ชุดตัวอย่างไม่มีแถวที่ถูกลบใน ${domain} จึงยังไม่ได้ตรวจรายการลบ`); }
                if (!same([...listed].sort(), [...want].sort()) || listed.some((v) => !ids('A').has(v) || ids('B2').has(v))) {
                    p.push(`รายการลบของ ${domain} ไม่ตรงกับแถวที่ส่งออกไปก่อน หรือแถวที่ลบแล้วยังอยู่ในชุดใหม่`);
                }
            }
            for (const round of Object.keys(obs.rounds)) {
                for (const row of readTable('s.jsonl', obs.rounds[round].get('survey-responses.jsonl'), []).rows) {
                    const want = obs.truth.consent.placed[round][row.responseId] || { region: null, province: null };
                    if (row.region !== want.region || row.province !== want.province) {
                        p.push(`รอบ ${round}: ภาค/จังหวัด ${row.region}/${row.province} ควรเป็น ${want.region}/${want.province} (ช่องที่ปิดในระดับเดียวกันต้องรวมกันได้อย่างน้อย 5 คน)`);
                    }
                }
            }
            // a farm basis never in force: no farm row ever left, so its deletion lists name nothing (K15/K16 L5)
            for (const key of ['cultivation-logs/deleted', 'harvest-batches/deleted']) {
                const file = obs.otherKey.manifest.files.find((f) => f.key === key && f.format === 'jsonl');
                if (!obs.truth.deleted[key.split('/')[0]].length) { p.push(`ชุดตัวอย่างไม่มีแถวที่ถูกลบใน ${key} จึงยังไม่ได้ตรวจรายการลบตอนไม่มีฐาน`); }
                if (!file || file.rows !== 0) { p.push(`ไม่เคยมีฐานการใช้ข้อมูลฟาร์ม แต่ ${key} มี ${file ? file.rows : '?'} แถว`); }
            }
            return [...new Set(p)];
        },
    },
    {
        id: 'K9', title: 'ส่งออกได้เฉพาะ system_admin_dtam ในองค์กรของตัวเอง ข้อมูลฟาร์มไม่ออกเมื่อไม่มีมติหรือมติไม่มีหนังสืออนุมัติจริยธรรม ไม่มี audit ไม่ส่ง audit บอกสิ่งที่ส่ง และห้ามแคช',
        run(obs) {
            const p = [];
            for (const d of obs.doors) {
                if (d.status !== d.want.status || (d.want.code && d.code !== d.want.code)) {
                    p.push(`${d.who} ${d.path}: ได้ ${d.status} ${d.code || ''} ต้องได้ ${d.want.status} ${d.want.code || ''}`);
                }
                if (d.want.sameAs && (!d.bytes || !obs.rounds.B2.get(d.want.sameAs) || sha256(d.bytes) !== sha256(obs.rounds.B2.get(d.want.sameAs)))) {
                    p.push(`${d.who} ${d.path}: ไฟล์ไม่เท่ากับของผู้ดูแลที่ token มีองค์กร (${d.want.sameAs})`);
                }
            }
            for (const [name, buf] of obs.orgB.files) {
                const ids = readTable(name, buf, []).rows.map((r) => r.id || r.responseId || r.questionId);
                const foreign = ids.filter((v) => !obs.orgB.allowed.has(v));
                if (foreign.length || ids.length !== obs.orgB.counts[fileKey(name)]) { p.push(`ผู้ดูแลองค์กร B ได้ ${name} ${ids.length} แถว ต้องได้ ${obs.orgB.counts[fileKey(name)]} และไม่มีแถวขององค์กรอื่น (${foreign.length})`); }
            }
            if (obs.audit.rows !== obs.audit.exports) { p.push(`audit ${obs.audit.rows} แถว แต่ส่งออกสำเร็จ ${obs.audit.exports} ครั้ง`); }
            // every export that left names itself in its audit row: format, rows, sha256 of the bytes, key fingerprint (K15/K16 L3)
            const canonical = (value) => JSON.stringify(value, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
            const pool = obs.audit.list.map((a) => canonical(a.metadata));
            for (const s of obs.sent) {
                const at = pool.indexOf(canonical(s.want));
                if (at < 0) { p.push(`${s.path}: ไม่มีแถว audit ที่บอกจำนวนแถว sha256 และลายนิ้วมือกุญแจตรงกับที่ส่งออกไป`); } else { pool.splice(at, 1); }
            }
            for (const u of obs.unaudited) {
                if (u.status !== 503 || u.code !== 'DATASET_EXPORT_AUDIT_FAILED') { p.push(`${u.path}: บันทึก audit ไม่ได้แต่ได้ ${u.status} ${u.code || ''} ต้องได้ 503 DATASET_EXPORT_AUDIT_FAILED`); }
                if (u.leaked) { p.push(`${u.path}: บันทึก audit ไม่ได้แต่ข้อมูลออกไปแล้ว`); }
            }
            if (obs.unaudited.length === 0) { p.push('ยังไม่ได้ลองส่งออกขณะบันทึก audit ไม่ได้'); }
            for (const r of obs.exportResponses) { if (r.cacheControl !== 'no-store') { p.push(`${r.path} (${r.status}): ไม่มี Cache-Control: no-store`); } }
            return [...new Set(p)];
        },
    },
    {
        id: 'K10', title: 'รูปแบบไฟล์ถูกต้อง CSV ตรง JSONL ทุกช่อง กันสูตร และเวลาเหลือแค่วันที่',
        run(obs) {
            const p = [];
            const tables = tableOf(obs);
            const leads = new Set();
            for (const [round, files] of Object.entries(obs.rounds)) {
                for (const key of Object.keys(tables)) {
                    const name = key.replace('/', '-');
                    const fields = tables[key].fields;
                    const csv = readTable(`${name}.csv`, files.get(`${name}.csv`), []);
                    const jsonl = readTable(`${name}.jsonl`, files.get(`${name}.jsonl`), []);
                    p.push(...csv.problems.map((x) => `รอบ ${round} ${x}`), ...jsonl.problems.map((x) => `รอบ ${round} ${x}`));
                    jsonl.rows.forEach((row, i) => {
                        for (const f of fields) {
                            const v = row[f.field];
                            if (typeof v === 'string' && !FREE_TEXT_RULES.has(f.publish) && TIME_OF_DAY.test(v)) { p.push(`รอบ ${round} ${name}.${f.field}: มีเวลาของวัน ต้องเป็นวันที่อย่างเดียว`); }
                            const want = v === null || v === undefined ? '' : (typeof v === 'string' && FORMULA_LEAD.test(v) ? `'${v}` : String(v));
                            if (typeof v === 'string' && FORMULA_LEAD.test(v)) { leads.add(v[0]); }
                            if (csv.rows[i] && csv.rows[i][f.field] !== want) { p.push(`รอบ ${round} ${name} แถว ${i + 1} ${f.field}: CSV ไม่ตรง JSONL หรือไม่กันสูตร`); }
                            if (v !== null && /^YYYY-MM-DD/.test(f.unit || '') && !DAY.test(v)) { p.push(`รอบ ${round} ${name}.${f.field}: ไม่ใช่ YYYY-MM-DD`); }
                        }
                    });
                }
            }
            for (const lead of ['=', '+', '-', '@']) { if (!leads.has(lead)) { p.push(`ชุดตัวอย่างไม่มีค่าที่ขึ้นต้นด้วย ${lead} จึงยังไม่ได้ตรวจการกันสูตร`); } }
            return [...new Set(p)];
        },
    },
    {
        id: 'K11', title: 'ส่งออกซ้ำได้ไบต์เดิม และ manifest ตรงไฟล์',
        run(obs) {
            const p = [];
            for (const [name, buf] of obs.rounds.B1) {
                if (!obs.rounds.B2.has(name) || sha256(obs.rounds.B2.get(name)) !== sha256(buf)) { p.push(`${name}: สองรอบได้ไบต์ไม่เท่ากัน`); }
            }
            for (const [label, bundle] of Object.entries(obs.bundles)) {
                for (const f of bundle.manifest.files) {
                    const data = bundle.files.get(f.path);
                    if (!data || sha256(data) !== f.sha256 || data.length !== f.bytes) { p.push(`ชุดเต็ม ${label} ${f.path}: sha256 หรือขนาดไม่ตรง manifest`); }
                    const door = obs.rounds.B2.get(f.path);
                    if (door && sha256(door) !== f.sha256) { p.push(`ชุดเต็ม ${label} ${f.path}: ไม่ตรงไฟล์ที่ประตูรายโดเมนส่ง`); }
                }
                const named = new Set([...bundle.manifest.files.map((f) => f.path), 'manifest.json']);
                if (!same([...bundle.files.keys()].sort(), [...named].sort())) { p.push(`ชุดเต็ม ${label}: ไฟล์ใน ZIP ไม่ตรงรายการใน manifest`); }
            }
            const strip = (m) => JSON.stringify({ ...m, exportedAt: null });
            if (strip(obs.bundles.B1.manifest) !== strip(obs.bundles.B2.manifest)) { p.push('manifest สองรอบต่างกันนอกจากเวลาส่งออก'); }
            if (obs.bundles.B2.manifest.codeRevision !== obs.head) { p.push(`manifest.codeRevision ${obs.bundles.B2.manifest.codeRevision} ≠ HEAD ${obs.head}`); }
            for (const [name, buf] of obs.committedSample) {
                const fresh = obs.bundles.B2.files.get(name);
                if (name === 'manifest.json') {
                    const keep = (m) => JSON.stringify({ ...m, exportedAt: null, codeRevision: null });
                    if (!fresh || keep(JSON.parse(buf)) !== keep(JSON.parse(fresh))) { p.push('docs/data/sample/manifest.json ไม่ตรงกับที่สร้างใหม่ (นอกจากเวลาและ sha ของโค้ด)'); }
                } else if (!fresh || sha256(fresh) !== sha256(buf)) {
                    p.push(`docs/data/sample/${name} ไม่ตรงกับที่สร้างใหม่ไบต์ต่อไบต์ (รัน check-dataset.js --write-sample)`);
                }
            }
            return p;
        },
    },
    {
        id: 'K12', title: 'กุญแจปลอดภัย: ไม่มีกุญแจหรือกุญแจซ้ำ HMAC_KEY = 503 และค่ากุญแจไม่หลุด',
        run(obs) {
            const p = [];
            for (const d of obs.keyDoors) {
                if (d.status !== 503 || d.code !== d.want) { p.push(`${d.label} ${d.path}: ได้ ${d.status} ${d.code || ''} ต้องได้ 503 ${d.want}`); }
            }
            const secrets = [obs.keys.sample, obs.keys.other, obs.keys.hmac, obs.keys.short].filter(Boolean);
            const places = [...obs.logs.map((l) => ({ where: `log ${l.label}`, text: l.text })),
                ...allFiles(obs).map((f) => ({ where: `${f.where} ${f.name}`, text: f.buf.toString('utf8') })),
                { where: 'ผลตรวจ', text: obs.report || '' }];
            for (const { where, text } of places) {
                for (const s of secrets) { if (text.includes(s)) { p.push(`${where}: พบค่ากุญแจ`); } }
            }
            return [...new Set(p)];
        },
    },
    {
        id: 'K13', title: 'ผู้รับคือคลังข้อมูลวิจัยของโครงการทุกที่ ไม่มี บพข. และหน้าที่ลบรายการถอนภายใน 90 วันเป็นประโยคเดียวกันทุกที่',
        run(obs) {
            const p = [];
            for (const [where, text] of Object.entries(obs.texts.recipientSurfaces)) {
                if (BANNED_RECIPIENT.test(text)) { p.push(`${where}: พบ บพข.`); }
                if (!text.includes(RECIPIENT)) { p.push(`${where}: ไม่ได้ระบุผู้รับว่า ${RECIPIENT}`); }
            }
            for (const [label, bundle] of Object.entries(obs.bundles)) {
                if (bundle.manifest.recipient !== RECIPIENT) { p.push(`manifest ${label}: recipient = ${bundle.manifest.recipient}`); }
                const duty = bundle.manifest.deletionDuty;
                if (typeof duty !== 'string' || DELETION_DUTY_FACTS.some((fact) => !duty.includes(fact))) {
                    p.push(`manifest ${label}: ไม่บอกหน้าที่ลบรายการถอนภายใน 90 วัน รวมสำเนาและข้อมูลสำรอง`);
                    continue;
                }
                const surfaces = {
                    'docs/data/README.md': obs.texts.readme,
                    'docs/data/data-dictionary.md': obs.texts.dictionary,
                    [`ชุดเต็ม ${label} data-dictionary.md`]: (bundle.files.get('data-dictionary.md') || Buffer.alloc(0)).toString('utf8'),
                };
                for (const [where, text] of Object.entries(surfaces)) {
                    if (!text.includes(duty)) { p.push(`${where}: ไม่มีประโยคหน้าที่ลบเดียวกับ manifest`); }
                }
            }
            for (const f of allFiles(obs)) { if (BANNED_RECIPIENT.test(f.buf.toString('utf8'))) { p.push(`${f.where} ${f.name}: พบ บพข.`); } }
            return [...new Set(p)];
        },
    },
];

function judge(obs) {
    return CHECKS.map((c) => {
        try { return { id: c.id, title: c.title, problems: c.run(obs) }; } catch (err) { return { id: c.id, title: c.title, problems: [`ตรวจไม่ได้: ${err.message}`] }; }
    });
}

module.exports = { CHECKS, judge, pseudonymiser, parseCsv, readTable, sha256, RECIPIENT };
