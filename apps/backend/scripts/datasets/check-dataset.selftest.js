#!/usr/bin/env node
'use strict';

/**
 * Negative controls for check-dataset.js. Collects one real observation (the
 * same scratch stack and real doors as the checker), requires every check to
 * pass on it, then breaks one fact at a time and requires the check that owns
 * that fact to fail. A control that stays green means the check can no longer
 * see the defect it exists for.
 *
 *   node apps/backend/scripts/datasets/check-dataset.selftest.js [--database-url URL] [--write-evidence]
 */

const fs = require('fs');
const path = require('path');

const { collect, finish, summary } = require('./check-dataset');
const { judge, RECIPIENT } = require('./lib/judges');
const { REPO } = require('./lib/lab');

const text = (buf) => buf.toString('utf8');

function withFile(obs, round, name, edit) {
    const files = new Map(obs.rounds[round]);
    files.set(name, Buffer.from(edit(text(files.get(name))), 'utf8'));
    return { ...obs, rounds: { ...obs.rounds, [round]: files } };
}

function editJsonl(obs, round, name, editRows) {
    return withFile(obs, round, name, (t) => {
        const rows = t.split('\n').filter(Boolean).map((l) => JSON.parse(l));
        return `${editRows(rows).map((r) => JSON.stringify(r)).join('\n')}\n`;
    });
}

function withBundleManifest(obs, label, edit) {
    return { ...obs, bundles: { ...obs.bundles, [label]: { ...obs.bundles[label], manifest: edit(JSON.parse(JSON.stringify(obs.bundles[label].manifest))) } } };
}

const otherPseudonym = (rows, field, row) => rows.find((r) => r[field] !== row[field])[field];

/** Phone and ID shapes K6 must see in any cell (K15/K16 M2), each tried alone in one survey answer. */
const LEAKED_SHAPES = [
    ['(081) 234-5678', 'เบอร์มือถือมีวงเล็บรอบรหัส'],
    ['(02) 123-4567', 'เบอร์บ้านมีวงเล็บรอบรหัสพื้นที่'],
    ['081.234.5678', 'เบอร์คั่นด้วยจุด'],
    ['081/234/5678', 'เบอร์คั่นด้วยทับ'],
    ['66812345678', 'เบอร์ขึ้นต้น 66 ไม่มีเครื่องหมายบวก'],
    ['+66 (0) 81 234 5678', 'เบอร์ +66 มี (0)'],
    ['๐๘๑-๒๓๔-๕๖๗๘', 'เบอร์ตัวเลขไทย'],
    ['๑๑๐๐๐๐๐๐๐๐๐๐๘', 'เลขบัตรตัวเลขไทย'],
    ['1 1000 00000 00 8', 'เลขบัตรคั่นด้วยช่องว่าง'],
    ['0-XXXX-XXXX-X-8089-999-0000', 'เบอร์ที่สองติดท้ายเลขบัตรที่ปิดแล้ว'],
    // K16 security review F1/F2
    ['081 - 234 - 5678', 'เบอร์คั่นด้วยเว้นวรรค ขีด เว้นวรรค'],
    ['081  234  5678', 'เบอร์คั่นด้วยเว้นวรรคสองช่อง'],
    ['081–234–5678', 'เบอร์คั่นด้วยขีดยาว'],
    ['081,234,5678', 'เบอร์คั่นด้วยจุลภาค'],
    ['(+66) 81-234-5678', 'เบอร์ (+66)'],
    ['0-XXXX-XXXX-X-8089 - 999 - 0000', 'เบอร์ที่สองติดท้ายเลขบัตรที่ปิดแล้ว คั่นหลายตัว'],
    ['3-1150-77156-[เบอร์โทร]-5678', 'เลขบัตรที่เบอร์กลืนท้ายจนเหลือ 10 หลัก'],
    // K16 re-check R1/R2
    ['081-234-5-XXXX-XXXX-X-4567', 'หัวเบอร์มือถือติดหน้าเลขบัตรที่ปิดแล้ว'],
    ['1-XXXX-XXXX-X-[เบอร์โทร]-5678', 'เลขบัตรที่ปิดแล้วถูกเบอร์ตัดท้าย'],
    // K16 second re-check R2b/R3
    ['[เบอร์โทร]-XXXX-XXXX-X-8098 4823789', 'เลขบัตรที่ปิดแล้วถูกเบอร์กินหัว'],
    ['FAX-02-123-4567', 'เบอร์หลัง FAX-'],
    // K16 third re-check R2c
    ['0-XXXX-XXXX-X-0087 [เบอร์โทร] 4243013', 'เศษเบอร์ที่สามติดท้ายเบอร์ที่ปิดแล้ว'],
];

const withLabelledDoor = (doors, label, change) => doors.map((d) => (d.label === label ? { ...d, ...change } : d));
const withDoor = (doors, who, path, change) => doors.map((d) => (d.who === who && d.path === path ? { ...d, ...change } : d));
const UNAPPROVED = 'มติไม่มีหนังสืออนุมัติจริยธรรม';

const CONTROLS = [
    ['K1', 'แคตตาล็อกขาดหนึ่งโดเมน', (o) => {
        const json = JSON.parse(JSON.stringify(o.catalog.adminA.json));
        json.data.domains.shift();
        return { ...o, catalog: { ...o.catalog, adminA: { ...o.catalog.adminA, json } } };
    }],
    ['K2', 'คู่มือที่ประตูส่งต่างจากที่ commit', (o) => ({ ...o, texts: { ...o.texts, dictionaryDoor: `${o.texts.dictionaryDoor}\nเพิ่ม` } })],
    ['K3', 'หัว CSV สลับสองคอลัมน์', (o) => withFile(o, 'B2', 'cultivation-logs.csv', (t) => t.replace('"id","createdAt"', '"createdAt","id"'))],
    ['K4', 'ตารางต้นทางมีคอลัมน์ใหม่ที่ยังไม่ตัดสิน', (o) => {
        const models = new Map(o.models);
        const m = models.get('CultivationLog');
        models.set('CultivationLog', { ...m, fields: [...m.fields, { name: 'farmerNickname', kind: 'scalar', type: 'String' }] });
        return { ...o, models };
    }],
    ['K5', 'JSONL หายไปหนึ่งแถว', (o) => editJsonl(o, 'B2', 'harvest-batches.jsonl', (rows) => rows.slice(1))],
    ['K6', 'ชื่อฟาร์มจริงหลุดในช่องข้อความ', (o) => withFile(o, 'B2', 'cultivation-logs.csv', (t) => t.replace('รดน้ำโคนต้น', 'ไร่สังเคราะห์f1'))],
    ['K6', 'อีเมลหลุดในคำตอบ', (o) => editJsonl(o, 'B2', 'survey-responses.jsonl', (rows) => rows.map((r, i) => (i === 0 ? { ...r, valueText: 'ติดต่อ leak@example.org' } : r)))],
    ...LEAKED_SHAPES.map(([shape, what]) => ['K6', `${what} หลุดในคำตอบ`,
        (o) => editJsonl(o, 'B2', 'survey-responses.jsonl', (rows) => rows.map((r, i) => (i === 0 ? { ...r, valueText: `ติดต่อ ${shape}` } : r)))]),
    ['K7', 'รหัสแฝงสั้นไปหนึ่งตัว', (o) => editJsonl(o, 'B2', 'trace-scans.jsonl', (rows) => rows.map((r, i) => (i === 0 ? { ...r, id: r.id.slice(1) } : r)))],
    ['K7', 'บันทึกกิจกรรมชี้รอบปลูกผิดรอบ', (o) => editJsonl(o, 'B2', 'cultivation-logs.jsonl', (rows) => rows.map((r, i) => (i === 0 ? { ...r, cycleId: otherPseudonym(rows, 'cycleId', r) } : r)))],
    ['K7', 'ลายนิ้วมือกุญแจใน manifest ไม่ตรงกุญแจ', (o) => withBundleManifest(o, 'B1', (m) => ({ ...m, pseudonymKeyFingerprint: '0000000000000000' }))],
    ['K8', 'คำตอบที่ถอนแล้วยังถูกส่งออก', (o) => {
        const rounds = { ...o.rounds, B2: new Map(o.rounds.B2) };
        rounds.B2.set('survey-responses.jsonl', o.rounds.A.get('survey-responses.jsonl'));
        return { ...o, rounds };
    }],
    ['K8', 'บันทึกกิจกรรมของฟาร์มที่ถูกลบยังถูกส่งออก', (o) => {
        const rounds = { ...o.rounds, B2: new Map(o.rounds.B2) };
        rounds.B2.set('cultivation-logs.jsonl', o.rounds.A.get('cultivation-logs.jsonl'));
        return { ...o, rounds };
    }],
    ['K8', 'รายการถอนว่างทั้งที่มีผู้ถอน', (o) => withFile(o, 'B2', 'survey-responses-withdrawn.jsonl', () => '')],
    ['K8', 'จังหวัดที่มีผู้ตอบคนเดียว (อุดรธานี) แสดงชื่อ', (o) => editJsonl(o, 'B2', 'survey-responses.jsonl', (rows) => {
        const lone = rows.find((r) => r.region === 'NORTHEAST' && r.province === null).responseId;
        return rows.map((r) => (r.responseId === lone ? { ...r, province: 'อุดรธานี' } : r));
    })],
    ['K8', 'ขอนแก่นแสดงชื่อทั้งที่กลุ่มค่าว่างของภาคจะเหลือคนเดียว', (o) => editJsonl(o, 'B2', 'survey-responses.jsonl', (rows) => rows.map((r) => (r.region === 'NORTHEAST' ? { ...r, province: 'ขอนแก่น' } : r)))],
    ['K8', 'ภาคที่มีผู้ตอบน้อยกว่า 5 คนแสดงชื่อภาค', (o) => editJsonl(o, 'B2', 'survey-responses.jsonl', (rows) => {
        const small = rows.find((r) => r.region === null).responseId;
        return rows.map((r) => (r.responseId === small ? { ...r, region: 'SOUTH' } : r));
    })],
    ['K8', 'รายการลบของข้อมูลฟาร์มมีแถวทั้งที่ไม่เคยมีฐานการใช้ข้อมูล', (o) => ({
        ...o, otherKey: { ...o.otherKey, manifest: { ...o.otherKey.manifest, files: o.otherKey.manifest.files.map((f) => (f.key === 'harvest-batches/deleted' ? { ...f, rows: 1 } : f)) } },
    })],
    ['K9', 'บทบาทอื่นส่งออกได้', (o) => ({ ...o, doors: o.doors.map((d, i) => (i === o.doors.findIndex((x) => x.want.code === 'DATASET_EXPORT_FORBIDDEN') ? { ...d, status: 200, code: null } : d)) })],
    ['K9', 'การส่งออกหนึ่งครั้งไม่มีแถว audit', (o) => ({ ...o, audit: { ...o.audit, rows: o.audit.rows - 1 } })],
    ['K9', 'แถว audit บอก sha256 ไม่ตรงไฟล์ที่ส่ง', (o) => ({ ...o, audit: { ...o.audit, list: o.audit.list.map((a, i) => (i === 0 ? { metadata: { ...a.metadata, sha256: 'sha256-AAAA' } } : a)) } })],
    ['K9', 'ส่งออกได้ทั้งที่บันทึก audit ไม่ได้', (o) => ({ ...o, unaudited: o.unaudited.map((u, i) => (i === 0 ? { ...u, status: 200, code: null, leaked: true } : u)) })],
    ['K9', 'คำตอบของประตูส่งออกไม่มี Cache-Control: no-store', (o) => ({ ...o, exportResponses: o.exportResponses.map((r, i) => (i === 0 ? { ...r, cacheControl: null } : r)) })],
    ['K9', 'ข้อมูลฟาร์มส่งออกได้ทั้งที่มติไม่มีหนังสืออนุมัติจริยธรรม', (o) => ({ ...o, doors: withDoor(o.doors, UNAPPROVED, 'cultivation-logs', { status: 200, code: null }) })],
    ['K9', 'แคตตาล็อกเปิดข้อมูลฟาร์มทั้งที่มติไม่มีหนังสืออนุมัติจริยธรรม', (o) => ({ ...o, doors: withDoor(o.doors, UNAPPROVED, 'แคตตาล็อก: โดเมนข้อมูลฟาร์มปิด', { status: 0 }) })],
    ['K9', 'ชุดเต็มไม่บอกว่าไม่ส่งข้อมูลฟาร์มทั้งที่มติไม่มีหนังสืออนุมัติจริยธรรม', (o) => ({ ...o, doors: withDoor(o.doors, UNAPPROVED, 'ชุดเต็ม: โดเมนข้อมูลฟาร์มใน notExported', { status: 0 }) })],
    ['K9', 'ชุดเต็มมีไฟล์ข้อมูลฟาร์มทั้งที่มติไม่มีหนังสืออนุมัติจริยธรรม', (o) => ({ ...o, doors: withDoor(o.doors, UNAPPROVED, 'ชุดเต็ม: ไฟล์ข้อมูลฟาร์มใน ZIP', { status: 6 }) })],
    ['K9', 'backend ของกรณีไม่มีหนังสืออนุมัติไม่ได้โหลดมติเลย (ประตูปิดด้วยเหตุผลผิด)', (o) => ({ ...o, doors: withDoor(o.doors, UNAPPROVED, 'manifest: มติที่ถึงวันมีผลแต่ไม่มีหนังสืออนุมัติ', { status: 0 }) })],
    ['K10', 'CSV ไม่มี BOM', (o) => withFile(o, 'B2', 'survey-responses.csv', (t) => t.replace(/^\uFEFF/, ''))],
    ['K10', 'ค่าที่ขึ้นต้นด้วย = ไม่ถูกกันสูตร', (o) => withFile(o, 'B2', 'cultivation-logs.csv', (t) => t.replace('"\'=HYPERLINK', '"=HYPERLINK'))],
    ['K10', 'วันที่ของข้อมูลฟาร์มมีเวลาของวัน', (o) => editJsonl(o, 'B2', 'cultivation-logs.jsonl', (rows) => rows.map((r, i) => (i === 0 ? { ...r, createdAt: '2026-09-15T02:01:00.000Z' } : r)))],
    ['K11', 'ส่งออกรอบสองได้ไบต์ต่างจากรอบแรก', (o) => withFile(o, 'B2', 'trace-scans.csv', (t) => `${t}\n`)],
    ['K11', 'sha256 ใน manifest ไม่ตรงไฟล์', (o) => withBundleManifest(o, 'B2', (m) => ({ ...m, files: m.files.map((f, i) => (i === 0 ? { ...f, sha256: '0'.repeat(64) } : f)) }))],
    ['K12', 'ค่ากุญแจหลุดใน log', (o) => ({ ...o, logs: [...o.logs, { label: 'injected', text: `boot key=${o.keys.sample}` }] })],
    ['K12', 'ไม่มีกุญแจแต่ประตูยังส่งออก', (o) => ({ ...o, keyDoors: o.keyDoors.map((d, i) => (i === 0 ? { ...d, status: 200, code: null } : d)) })],
    ['K12', 'กุญแจชุดตัวอย่างที่เปิดเผยส่งออกได้', (o) => ({ ...o, keyDoors: withLabelledDoor(o.keyDoors, 'กุญแจชุดตัวอย่างที่เปิดเผย', { status: 200, code: null }) })],
    ['K12', 'กุญแจสั้นกว่า 32 ไบต์ส่งออกได้', (o) => ({ ...o, keyDoors: withLabelledDoor(o.keyDoors, 'กุญแจสั้นกว่า 32 ไบต์', { status: 200, code: null }) })],
    ['K13', 'คู่มือเขียนว่าส่งให้ บพข.', (o) => ({ ...o, texts: { ...o.texts, recipientSurfaces: { ...o.texts.recipientSurfaces, 'docs/data/data-dictionary.md': `${o.texts.dictionary}\nส่งให้ บพข.` } } })],
    ['K13', 'หน้าเว็บไม่ระบุผู้รับ', (o) => {
        const key = 'apps/web-app/src/app/provider/datasets/page.tsx';
        return { ...o, texts: { ...o.texts, recipientSurfaces: { ...o.texts.recipientSurfaces, [key]: o.texts.recipientSurfaces[key].split(RECIPIENT).join('ผู้รับ') } } };
    }],
    ['K13', 'manifest ไม่บอกหน้าที่ลบรายการถอนภายใน 90 วัน', (o) => withBundleManifest(o, 'B2', (m) => ({ ...m, deletionDuty: undefined }))],
    ['K13', 'ขั้นตอนส่งมอบไม่มีประโยคหน้าที่ลบเดียวกับ manifest', (o) => ({ ...o, texts: { ...o.texts, readme: o.texts.readme.split(o.bundles.B2.manifest.deletionDuty).join('') } })],
];

async function main() {
    const args = process.argv.slice(2);
    const at = args.indexOf('--database-url');
    const obs = await collect({ databaseUrl: at >= 0 ? args[at + 1] : undefined, log: (step) => process.stderr.write(`[check-dataset.selftest] ${step}\n`) });
    const baseline = judge(obs);
    const lines = [];
    const green = baseline.every((r) => r.problems.length === 0);
    lines.push(green ? 'PASS ข้อมูลจริงผ่านทุกเกณฑ์ก่อนทำลาย' : 'FAIL ข้อมูลจริงยังไม่ผ่านทุกเกณฑ์ จึงทดสอบการจับไม่ได้');
    let caught = 0;
    for (const [id, what, mutate] of CONTROLS) {
        let result;
        try { result = judge(mutate(obs)).find((r) => r.id === id); } catch (err) { result = { problems: [], error: err.message }; }
        const ok = result.problems.length > 0;
        caught += ok ? 1 : 0;
        lines.push(`${ok ? 'PASS' : 'FAIL'} ${id} จับได้: ${what}${ok ? ` (${result.problems[0].slice(0, 120)})` : result.error ? ` (ตั้งค่าไม่ได้: ${result.error})` : ' (ไม่จับ)'}`);
    }
    lines.push(`negative controls: ${caught}/${CONTROLS.length} ถูกจับ`);
    const { pass, text: report } = finish(obs, baseline, [...summary(obs), '', '## selftest (negative controls)', ...lines]);
    const ok = pass && green && caught === CONTROLS.length;
    const out = report.replace(/RESULT: (PASS|FAIL)$/, `RESULT: ${ok ? 'PASS' : 'FAIL'}`);
    console.log(out);
    if (args.includes('--write-evidence')) {
        const dir = path.join(REPO, 'evidence/dataset', obs.head.slice(0, 9));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'selftest.txt'), `${out}\n`, 'utf8');
    }
    process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(`[check-dataset.selftest] ${err.message}`); process.exit(2); });
