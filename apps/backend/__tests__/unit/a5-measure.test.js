'use strict';

const comparison = require('../../data/standards/gacp-requirement-comparison');
const path = require('path');
const {
    loadAnswerKey, validateAnswerKey, expectedCells, measure, realAnalyzer, baselines, formatReport, DEFAULT_OUT,
} = require('../../scripts/standards/measure-a5');

const answerKey = loadAnswerKey();

const oracle = ({ key }) => {
    const byApplication = new Map(answerKey.cases.map((c) => [c.application, c.id]));
    return (application, code) => Object.entries(key.labels[byApplication.get(application)][code])
        .map(([topic, label]) => ({ topic, verdict: label.verdict }));
};

describe('KPI A5 measuring script', () => {
    test('the committed answer key is complete, labelled, and marked as not yet expert-reviewed', () => {
        expect(validateAnswerKey(answerKey, comparison)).toEqual([]);
        expect(answerKey.key.status).toBe('ยังไม่ผ่านผู้เชี่ยวชาญ');
        const verdicts = new Set(expectedCells(answerKey.cases, comparison)
            .map(({ caseId, standard, topic }) => answerKey.key.labels[caseId][standard][topic].verdict));
        expect([...verdicts].sort()).toEqual(['MET', 'NEEDS_REVIEW', 'NOT_MET']);
    });

    test('an analyzer that returns the key scores every cell and meets the target', () => {
        const result = measure(answerKey, oracle(answerKey), comparison);
        expect(result.overall.agree).toBe(result.overall.total);
        expect(result.overall.total).toBe(expectedCells(answerKey.cases, comparison).length);
        expect(result.overall.meetsTarget).toBe(true);
        expect(result.disagreements).toEqual([]);
    });

    test.each([
        ['always MET', () => (application, code) => realAnalyzer()(application, code).map((o) => ({ ...o, verdict: 'MET' }))],
        ['verdicts rotated', () => {
            const next = { MET: 'NOT_MET', NOT_MET: 'NEEDS_REVIEW', NEEDS_REVIEW: 'MET' };
            return (application, code) => realAnalyzer()(application, code).map((o) => ({ ...o, verdict: next[o.verdict] }));
        }],
    ])('a known-wrong analyzer (%s) scores lower than the real one', (_name, makeStub) => {
        const real = measure(answerKey, realAnalyzer(), comparison).overall;
        const wrong = measure(answerKey, makeStub(), comparison).overall;
        expect(wrong.total).toBe(real.total);
        expect(wrong.agree).toBeLessThan(real.agree);
    });

    test('a topic the analyzer drops counts as MISSING, one it invents counts against it', () => {
        const perfect = oracle(answerKey);
        const dropped = (application, code) => perfect(application, code).filter((o) => o.topic !== 'WATER');
        const invented = (application, code) => [...perfect(application, code), { topic: 'INVENTED', verdict: 'MET' }];
        const cells = expectedCells(answerKey.cases, comparison).length;

        const d = measure(answerKey, dropped, comparison);
        const waterCells = expectedCells(answerKey.cases, comparison).filter((c) => c.topic === 'WATER').length;
        expect(d.overall.agree).toBe(cells - waterCells);
        expect(d.disagreements.every((x) => x.topic === 'WATER' && x.actual === 'MISSING')).toBe(true);

        const i = measure(answerKey, invented, comparison);
        expect(i.overall.total).toBe(cells + answerKey.cases.length * comparison.STANDARDS.length);
        expect(i.unlabelled).toHaveLength(answerKey.cases.length * comparison.STANDARDS.length);
    });

    test('the always-NEEDS_REVIEW baseline is 541/884 and is the majority class of every standard', () => {
        const base = baselines(answerKey, comparison);
        expect(base.alwaysNeedsReview.overall).toMatchObject({ agree: 541, total: 884, percent: (541 / 884) * 100, meetsTarget: false });
        expect(base.alwaysNeedsReview.byStandard).toEqual({
            THAI_GACP: { agree: 153, total: 289, percent: (153 / 289) * 100 },
            WHO: { agree: 177, total: 306, percent: (177 / 306) * 100 },
            ASEAN: { agree: 211, total: 289, percent: (211 / 289) * 100 },
        });
        expect(base.majorityPerStandard.verdicts).toEqual({ THAI_GACP: 'NEEDS_REVIEW', WHO: 'NEEDS_REVIEW', ASEAN: 'NEEDS_REVIEW' });
        expect(base.majorityPerStandard.sameAsAlwaysNeedsReview).toBe(true);
        expect(base.majorityPerStandard.overall).toEqual(base.alwaysNeedsReview.overall);
    });

    test('the report prints the baseline unrounded, with the real analyzer\'s margin over it in cells', () => {
        const result = measure(answerKey, realAnalyzer(), comparison);
        const base = baselines(answerKey, comparison);
        const margin = result.overall.agree - base.alwaysNeedsReview.overall.agree;
        const report = formatReport(result, answerKey.key, answerKey.cases.length, base);
        expect(report).toContain(`เส้นฐาน ตอบ NEEDS_REVIEW ทุกช่อง: 541/884 = ${(541 / 884) * 100}% · ตัววิเคราะห์ตรงมากกว่า ${margin} ช่อง`);
        expect(report).toContain(`211/289 = ${(211 / 289) * 100}%`);
    });

    test('the overall baseline line names every standard where the analyzer is below its baseline', () => {
        const base = baselines(answerKey, comparison);
        const allMet = (_application, code) => comparison.TOPICS
            .filter((topic) => topic.clauses[code].level !== comparison.LEVEL.ABSENT)
            .map((topic) => ({ topic: topic.id, verdict: 'MET' }));
        const result = measure(answerKey, allMet, comparison);
        const overallLine = formatReport(result, answerKey.key, answerKey.cases.length, base)
            .split('\n').find((l) => l.startsWith('เส้นฐาน ตอบ NEEDS_REVIEW ทุกช่อง:'));
        comparison.STANDARDS.forEach(({ code }) => {
            const { agree, total } = result.byStandard[code];
            expect(overallLine).toContain(`แต่ ${code} ต่ำกว่าเส้นฐาน ${agree} กับ ${base.alwaysNeedsReview.byStandard[code].agree} จาก ${total} ช่อง`);
        });
    });

    test('a plain run writes its JSON outside the repository', () => {
        const repo = path.resolve(__dirname, '..', '..', '..', '..');
        expect(path.relative(repo, DEFAULT_OUT).startsWith('..')).toBe(true);
    });

    describe('the 95% line on a 20-cell key', () => {
        const tiny = {
            LEVEL: comparison.LEVEL,
            STANDARDS: [{ code: 'S' }],
            TOPICS: Array.from({ length: 20 }, (_, n) => ({ id: `T${n}`, clauses: { S: { level: 'REQUIRED' } } })),
        };
        const app = { status: 'SUBMITTED', documentTypes: [], formData: {} };
        const key = {
            status: 'ยังไม่ผ่านผู้เชี่ยวชาญ', labelledBy: 'test', labelledOn: '2026-11-04',
            labels: { K: { S: Object.fromEntries(tiny.TOPICS.map((t) => [t.id, { verdict: 'MET', clause: 'x', reason: 'y' }])) } },
        };
        const wrongOn = (n) => () => tiny.TOPICS.map((t, i) => ({ topic: t.id, verdict: i < n ? 'NOT_MET' : 'MET' }));

        test('19/20 = 95% meets the target', () => {
            const r = measure({ cases: [{ id: 'K', application: app }], key }, wrongOn(1), tiny).overall;
            expect(r).toMatchObject({ agree: 19, total: 20, percent: 95, meetsTarget: true });
        });

        test('18/20 = 90% does not', () => {
            const r = measure({ cases: [{ id: 'K', application: app }], key }, wrongOn(2), tiny).overall;
            expect(r).toMatchObject({ agree: 18, total: 20, percent: 90, meetsTarget: false });
        });

        test('the majority baseline follows each standard\'s most common verdict when it is not NEEDS_REVIEW', () => {
            const base = baselines({ cases: [{ id: 'K', application: app }], key }, tiny);
            expect(base.majorityPerStandard.verdicts).toEqual({ S: 'MET' });
            expect(base.majorityPerStandard.sameAsAlwaysNeedsReview).toBe(false);
            expect(base.majorityPerStandard.overall).toMatchObject({ agree: 20, total: 20 });
            expect(base.alwaysNeedsReview.overall).toMatchObject({ agree: 0, total: 20 });
        });

        test('a key without the review status, a clause, or a valid verdict is refused', () => {
            const broken = JSON.parse(JSON.stringify(key));
            broken.status = 'ผ่านผู้เชี่ยวชาญ';
            broken.labels.K.S.T0.clause = '';
            broken.labels.K.S.T1.verdict = 'PASS';
            delete broken.labels.K.S.T2;
            const problems = validateAnswerKey({ cases: [{ id: 'K', application: app }], key: broken }, tiny);
            expect(problems).toEqual(expect.arrayContaining([
                expect.stringContaining('status must be'),
                'K/S/T0: no clause',
                expect.stringContaining('K/S/T1: verdict "PASS"'),
                'K/S/T2: no label',
            ]));
        });
    });
});
