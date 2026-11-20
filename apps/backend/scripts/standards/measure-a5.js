'use strict';

/**
 * usage: node apps/backend/scripts/standards/measure-a5.js [--out <file.json>] [--quiet]
 *        without --out the JSON goes to the OS temp dir
 * exit:  0 accuracy >= 95% · 1 below 95% · 2 the answer key is incomplete or malformed, or --out has no path
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeRecord } = require('../../services/standards-analyzer-service');
const comparison = require('../../data/standards/gacp-requirement-comparison');

const KEY_DIR = path.join(__dirname, '..', '..', 'data', 'standards', 'a5-answer-key');
const DEFAULT_OUT = path.join(os.tmpdir(), 'a5-accuracy.json');
const TARGET_PERCENT = 95;
const VERDICTS = Object.freeze(['MET', 'NOT_MET', 'NEEDS_REVIEW']);
const REVIEW_STATUS = 'ยังไม่ผ่านผู้เชี่ยวชาญ';

function loadAnswerKey(dir = KEY_DIR) {
    const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    return { cases: read('cases.json').cases, key: read('labels.json') };
}

function expectedCells(cases, comparison) {
    return cases.flatMap((c) => comparison.STANDARDS.flatMap((standard) => comparison.TOPICS
        .filter((topic) => topic.clauses[standard.code].level !== comparison.LEVEL.ABSENT)
        .map((topic) => ({ caseId: c.id, standard: standard.code, topic: topic.id }))));
}

function validateAnswerKey({ cases, key }, comparison) {
    const problems = [];
    if (key.status !== REVIEW_STATUS) { problems.push(`labels.json status must be "${REVIEW_STATUS}", got "${key.status}"`); }
    if (!key.labelledBy || !key.labelledOn) { problems.push('labels.json must say who labelled it and when'); }
    const wanted = expectedCells(cases, comparison);
    const wantedIds = new Set(wanted.map((cell) => `${cell.caseId}/${cell.standard}/${cell.topic}`));
    wanted.forEach(({ caseId, standard, topic }) => {
        const label = key.labels?.[caseId]?.[standard]?.[topic];
        const id = `${caseId}/${standard}/${topic}`;
        if (!label) { problems.push(`${id}: no label`); return; }
        if (!VERDICTS.includes(label.verdict)) { problems.push(`${id}: verdict "${label.verdict}" is not one of ${VERDICTS.join('/')}`); }
        if (!String(label.clause || '').trim()) { problems.push(`${id}: no clause`); }
        if (!String(label.reason || '').trim()) { problems.push(`${id}: no reason`); }
    });
    Object.entries(key.labels || {}).forEach(([caseId, byStandard]) => Object.entries(byStandard).forEach(([standard, byTopic]) => {
        Object.keys(byTopic).forEach((topic) => {
            const id = `${caseId}/${standard}/${topic}`;
            if (!wantedIds.has(id)) { problems.push(`${id}: labelled, but no such case or the standard has no clause for it`); }
        });
    }));
    return problems;
}

function realAnalyzer() {
    return (application, standardCode) => analyzeRecord(standardCode, {
        status: application.status,
        formData: application.formData,
        documents: application.documentTypes.map((documentType) => ({ documentType })),
    }).requirements.map((r) => ({ topic: r.id, verdict: r.status, evidence: r.evidence }));
}

function tally() { return { agree: 0, total: 0 }; }
function add(bucket, key, agreed) {
    bucket[key] = bucket[key] || tally();
    bucket[key].total += 1;
    if (agreed) { bucket[key].agree += 1; }
}

/** @param {(application: object, standardCode: string) => Array<{ topic: string, verdict: string, evidence?: string }>} analyze */
function measure({ cases, key }, analyze, comparison) {
    const overall = tally();
    const byStandard = {};
    const byTopic = {};
    const byCase = {};
    const confusion = Object.fromEntries(VERDICTS.map((v) => [v, Object.fromEntries([...VERDICTS, 'MISSING'].map((a) => [a, 0]))]));
    const disagreements = [];
    const unlabelled = [];
    const unambiguous = tally();

    cases.forEach((c) => comparison.STANDARDS.forEach(({ code }) => {
        const labels = key.labels[c.id][code];
        const outputs = new Map(analyze(c.application, code).map((o) => [o.topic, o]));
        Object.entries(labels).forEach(([topic, label]) => {
            const output = outputs.get(topic);
            const actual = output ? output.verdict : 'MISSING';
            const agreed = actual === label.verdict;
            overall.total += 1;
            if (agreed) { overall.agree += 1; }
            add(byStandard, code, agreed);
            add(byTopic, topic, agreed);
            add(byCase, c.id, agreed);
            if (!label.ambiguous) {
                unambiguous.total += 1;
                if (agreed) { unambiguous.agree += 1; }
            }
            confusion[label.verdict][actual] += 1;
            if (!agreed) {
                disagreements.push({
                    case: c.id, standard: code, topic, expected: label.verdict, actual,
                    clause: label.clause, reason: label.reason, ambiguous: Boolean(label.ambiguous),
                    analyzerEvidence: output ? output.evidence || null : null,
                });
            }
        });
        outputs.forEach((output, topic) => {
            if (!(topic in labels)) {
                overall.total += 1;
                add(byStandard, code, false);
                add(byTopic, topic, false);
                add(byCase, c.id, false);
                unlabelled.push({ case: c.id, standard: code, topic, actual: output.verdict });
            }
        });
    }));

    return {
        target: `>= ${TARGET_PERCENT}%`,
        overall: { ...overall, percent: percentOf(overall), meetsTarget: overall.agree * 100 >= TARGET_PERCENT * overall.total },
        unambiguousOnly: { ...unambiguous, percent: percentOf(unambiguous) },
        byStandard: withPercent(byStandard),
        byTopic: withPercent(byTopic),
        byCase: withPercent(byCase),
        confusion,
        disagreements,
        unlabelled,
    };
}

function constantAnalyzer(verdictFor, comparison) {
    return (_application, code) => comparison.TOPICS
        .filter((topic) => topic.clauses[code].level !== comparison.LEVEL.ABSENT)
        .map((topic) => ({ topic: topic.id, verdict: verdictFor(code) }));
}

function majorityVerdicts(key, comparison) {
    return Object.fromEntries(comparison.STANDARDS.map(({ code }) => {
        const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
        Object.values(key.labels).forEach((byStandard) => Object.values(byStandard[code])
            .forEach((label) => { counts[label.verdict] += 1; }));
        return [code, VERDICTS.reduce((best, v) => (counts[v] > counts[best] ? v : best))];
    }));
}

function baselines(answerKey, comparison) {
    const score = (analyze) => {
        const { overall, byStandard } = measure(answerKey, analyze, comparison);
        return { overall, byStandard };
    };
    const majority = majorityVerdicts(answerKey.key, comparison);
    return {
        alwaysNeedsReview: score(constantAnalyzer(() => 'NEEDS_REVIEW', comparison)),
        majorityPerStandard: {
            verdicts: majority,
            sameAsAlwaysNeedsReview: Object.values(majority).every((v) => v === 'NEEDS_REVIEW'),
            ...score(constantAnalyzer((code) => majority[code], comparison)),
        },
    };
}

function percentOf({ agree, total }) {
    return total === 0 ? null : (agree / total) * 100;
}

function withPercent(bucket) {
    return Object.fromEntries(Object.entries(bucket).map(([k, t]) => [k, { ...t, percent: percentOf(t) }]));
}

function line({ agree, total, percent }) {
    return `${agree}/${total} = ${percent === null ? 'n/a' : `${percent}%`}`;
}

function margin(real, base) {
    const cells = real.agree - base.agree;
    return cells >= 0 ? `ตัววิเคราะห์ตรงมากกว่า ${cells} ช่อง` : `ตัววิเคราะห์ตรงน้อยกว่า ${-cells} ช่อง`;
}

function belowBaseline(result, base) {
    return Object.entries(result.byStandard)
        .filter(([k, t]) => t.agree < base.byStandard[k].agree)
        .map(([k, t]) => `${k} ต่ำกว่าเส้นฐาน ${t.agree} กับ ${base.byStandard[k].agree} จาก ${t.total} ช่อง`);
}

function formatReport(result, key, caseCount, base) {
    const out = [];
    const always = base.alwaysNeedsReview;
    const majority = base.majorityPerStandard;
    out.push(`KPI A5 ความแม่นยำตัววิเคราะห์มาตรฐาน · ชุดคำตอบ: ${key.status} · ติดป้ายโดย ${key.labelledBy} · ${key.labelledOn}`);
    out.push(`ชุดทดสอบ ${caseCount} คำขอ · ${result.overall.total} ช่อง (คำขอ × มาตรฐาน × หัวข้อ)`);
    out.push(`overall: ${line(result.overall)} · เป้า ${result.target} · ${result.overall.meetsTarget ? 'ถึงเป้า' : 'ยังไม่ถึงเป้า'}`);
    out.push([`เส้นฐาน ตอบ NEEDS_REVIEW ทุกช่อง: ${line(always.overall)} · ${margin(result.overall, always.overall)}`,
        ...belowBaseline(result, always).map((s) => `แต่ ${s}`)].join(' · '));
    out.push(majority.sameAsAlwaysNeedsReview
        ? 'เส้นฐาน ตอบคำตอบที่พบบ่อยที่สุดของแต่ละมาตรฐาน: เท่ากับเส้นฐาน NEEDS_REVIEW ทุกช่อง เพราะทุกมาตรฐานมี NEEDS_REVIEW มากที่สุด'
        : `เส้นฐาน ตอบคำตอบที่พบบ่อยที่สุดของแต่ละมาตรฐาน (${Object.entries(majority.verdicts).map(([k, v]) => `${k} ${v}`).join(' · ')}): ${line(majority.overall)} · ${margin(result.overall, majority.overall)}`);
    out.push(`เฉพาะช่องที่ผู้ติดป้ายไม่ได้ทำเครื่องหมายว่ากำกวม: ${line(result.unambiguousOnly)}`);
    out.push('', 'ต่อมาตรฐาน (ตัววิเคราะห์ · เส้นฐาน NEEDS_REVIEW ทุกช่อง)');
    Object.entries(result.byStandard).forEach(([k, t]) => out.push(
        `  ${k.padEnd(12)} ${line(t)} · ${line(always.byStandard[k])} · ${margin(t, always.byStandard[k])}`,
    ));
    if (!majority.sameAsAlwaysNeedsReview) {
        out.push('', 'ต่อมาตรฐาน (เส้นฐาน คำตอบที่พบบ่อยที่สุด)');
        Object.entries(majority.byStandard).forEach(([k, t]) => out.push(`  ${k.padEnd(12)} ${majority.verdicts[k].padEnd(13)} ${line(t)}`));
    }
    out.push('', 'ต่อหัวข้อ');
    Object.entries(result.byTopic).forEach(([k, t]) => out.push(`  ${k.padEnd(20)} ${line(t)}`));
    out.push('', 'ตารางสับสน (แถว = คำตอบ, คอลัมน์ = ตัววิเคราะห์)');
    out.push(`  ${''.padEnd(13)}${[...VERDICTS, 'MISSING'].map((v) => v.padStart(13)).join('')}`);
    VERDICTS.forEach((v) => out.push(`  ${v.padEnd(13)}${[...VERDICTS, 'MISSING'].map((a) => String(result.confusion[v][a]).padStart(13)).join('')}`));
    out.push('', `ช่องที่ไม่ตรงกัน ${result.disagreements.length} ช่อง`);
    result.disagreements.forEach((d) => out.push(
        `  ${d.case} ${d.standard} ${d.topic}: คำตอบ ${d.expected} · ตัววิเคราะห์ ${d.actual}${d.ambiguous ? ' · กำกวม' : ''} · ${d.clause}`,
    ));
    if (result.unlabelled.length > 0) {
        out.push('', `หัวข้อที่ตัววิเคราะห์ตอบแต่ชุดคำตอบไม่มี ${result.unlabelled.length} ช่อง`);
        result.unlabelled.forEach((u) => out.push(`  ${u.case} ${u.standard} ${u.topic}: ${u.actual}`));
    }
    return out.join('\n');
}

function main(argv) {
    const outIndex = argv.indexOf('--out');
    const outPath = outIndex >= 0 ? argv[outIndex + 1] : DEFAULT_OUT;
    if (!outPath || outPath.startsWith('--')) {
        console.error('--out ต้องตามด้วยพาธของไฟล์ JSON');
        return 2;
    }
    const answerKey = loadAnswerKey();
    const problems = validateAnswerKey(answerKey, comparison);
    if (problems.length > 0) {
        console.error(`ชุดคำตอบไม่ครบหรือผิดรูป ${problems.length} จุด`);
        problems.slice(0, 50).forEach((p) => console.error(`  ${p}`));
        return 2;
    }
    const result = measure(answerKey, realAnalyzer(), comparison);
    const base = baselines(answerKey, comparison);
    const report = {
        kpi: 'A5',
        measuredAt: new Date().toISOString(),
        answerKey: {
            status: answerKey.key.status, labelledBy: answerKey.key.labelledBy, labelledOn: answerKey.key.labelledOn,
            cases: answerKey.cases.length,
        },
        ...result,
        baselines: base,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!argv.includes('--quiet')) { console.log(formatReport(result, answerKey.key, answerKey.cases.length, base)); }
    console.log(`\nJSON: ${outPath}`);
    return result.overall.meetsTarget ? 0 : 1;
}

if (require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}

module.exports = {
    loadAnswerKey, validateAnswerKey, expectedCells, measure, realAnalyzer, baselines, formatReport, DEFAULT_OUT, TARGET_PERCENT,
};
