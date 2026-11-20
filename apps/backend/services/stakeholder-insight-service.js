'use strict';

/**
 * Stakeholder insight — สัญญา C05F680149 ต้นแบบที่ 3 (text mining + สรุปอัตโนมัติ)
 *
 * Reads the free text the platform holds (survey TEXT/TEXTAREA answers and expert
 * interview transcripts + key insights of one organization), or, when there is none or
 * the reader asks for it, the published-statement corpus in data/research. Then, all on
 * this server and with no external model:
 *   - keywords: Thai word segmentation (Intl.Segmenter), single words and adjacent pairs,
 *     ranked by how many texts use them, weighted by how specific they are
 *   - themes: each text joins every need theme whose lexicon it contains
 *   - summary: TextRank over sentence-sized chunks picks the sentences most similar to
 *     the rest; each theme keeps its best-ranked sentence as the example
 *
 * Withdrawn answers and withdrawn interviews never reach the analysis.
 */

const { prisma } = require('./prisma-database');
const { contentWords } = require('../utils/thai-keywords');
const { REDACTED_TEXT } = require('./survey-service');
const { NEED_THEMES, STAKEHOLDER_GROUPS } = require('../data/research/stakeholder-need-themes');
const { CORPUS_READ_ON, CORPUS_SOURCES, CORPUS_EXCERPTS } = require('../data/research/stakeholder-needs-corpus');

const BASIS = Object.freeze({ SYSTEM: 'SYSTEM', CORPUS: 'CORPUS' });

const FREE_TEXT_TYPES = ['TEXT', 'TEXTAREA'];
const SENTENCE_MIN_CHARS = 120;
const DAMPING = 0.85;
const ITERATIONS = 40;

function httpError(statusCode, code, message) {
    return Object.assign(new Error(message), { statusCode, code });
}

/**
 * Thai marks a pause with a space, not a full stop, so a "sentence" here is a run of
 * space-separated phrases at least SENTENCE_MIN_CHARS long, cut only where a Thai phrase
 * begins (a space before a Latin word such as GAP is not a pause). A line break or Latin sentence
 * punctuation always ends one. Each sentence is a slice of the original text, so a quoted
 * sentence is always found verbatim in what the respondent wrote.
 */
function splitSentences(text) {
    const source = String(text || '');
    const tokens = [...source.matchAll(/\S+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
    const forcedBreakBefore = (i) => i > 0
        && (/\n/.test(source.slice(tokens[i - 1].end, tokens[i].start)) || /[.!?]$/.test(source.slice(tokens[i - 1].start, tokens[i - 1].end)));
    const spans = [];
    let open = null;
    tokens.forEach((token, i) => {
        if (open && forcedBreakBefore(i)) { spans.push({ ...open, closedByBreak: true }); open = null; }
        open = open ? { ...open, end: token.end } : { start: token.start, end: token.end, joinable: !forcedBreakBefore(i) };
        const next = tokens[i + 1];
        const nextOpensThaiPhrase = !next || /^[\u0E00-\u0E7F]/.test(source.slice(next.start, next.end));
        if (open.end - open.start >= SENTENCE_MIN_CHARS && nextOpensThaiPhrase) { spans.push(open); open = null; }
    });
    if (open) { spans.push(open); }
    const merged = [];
    spans.forEach((span) => {
        const previous = merged[merged.length - 1];
        if (previous && !previous.closedByBreak && span.joinable && span.end - span.start < SENTENCE_MIN_CHARS / 2) {
            previous.end = span.end;
            previous.closedByBreak = span.closedByBreak;
        } else {
            merged.push({ ...span });
        }
    });
    return merged.map((span) => source.slice(span.start, span.end));
}

/** Single content words and adjacent pairs of them, the terms keywords are counted over. */
function termsOf(text) {
    const words = contentWords(text);
    const pairs = words.slice(1).map((word, i) => `${words[i]}${word}`);
    return { words: new Set(words), pairs: new Set(pairs) };
}

function rankKeywords(documents, top = 15) {
    const total = documents.length;
    const df = new Map();
    const kind = new Map();
    for (const document of documents) {
        const { words, pairs } = termsOf(document.text);
        for (const term of words) { df.set(term, (df.get(term) || 0) + 1); kind.set(term, 'word'); }
        for (const term of pairs) { df.set(term, (df.get(term) || 0) + 1); kind.set(term, 'pair'); }
    }
    const scored = [...df.entries()]
        .filter(([term, count]) => count >= 2 || kind.get(term) === 'word')
        .map(([term, count]) => ({ term, documents: count, score: count * Math.log(1 + total / count) }))
        .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term, 'th'));
    const pool = scored.slice(0, top * 2);
    const kept = pool.filter((candidate) => !pool.some((other) => other.term !== candidate.term
        && other.term.includes(candidate.term) && candidate.documents - other.documents <= 1)).slice(0, top);
    return kept.map(({ term, documents: count }) => ({ term, documents: count }));
}

function jaccard(a, b) {
    if (a.size === 0 || b.size === 0) { return 0; }
    let shared = 0;
    for (const item of a) { if (b.has(item)) { shared += 1; } }
    return shared / (a.size + b.size - shared);
}

/** TextRank: a sentence matters when it resembles many sentences that matter. */
function rankSentences(sentences) {
    const bags = sentences.map((sentence) => new Set(contentWords(sentence.text)));
    const n = sentences.length;
    const weights = bags.map((a, i) => bags.map((b, j) => (i === j ? 0 : jaccard(a, b))));
    const outSum = weights.map((row) => row.reduce((sum, w) => sum + w, 0));
    let score = new Array(n).fill(1 / Math.max(n, 1));
    for (let round = 0; round < ITERATIONS; round += 1) {
        score = score.map((_, i) => (1 - DAMPING) / n + DAMPING * weights.reduce(
            (sum, row, j) => (outSum[j] > 0 ? sum + (row[i] / outSum[j]) * score[j] : sum), 0,
        ));
    }
    return sentences.map((sentence, i) => ({ ...sentence, score: score[i] }))
        .sort((a, b) => b.score - a.score);
}

/** The best-ranked sentences, at most one per text, none close to one already chosen. */
function pickDiverse(ranked, count) {
    const chosen = [];
    for (const sentence of ranked) {
        const bag = new Set(contentWords(sentence.text));
        if (chosen.some((c) => c.documentId === sentence.documentId || jaccard(c.bag, bag) > 0.4)) { continue; }
        chosen.push({ ...sentence, bag });
        if (chosen.length === count) { break; }
    }
    return chosen.map(({ bag: _bag, ...sentence }) => sentence);
}

function themeHits(text) {
    const lower = text.toLowerCase();
    return NEED_THEMES
        .map((theme) => ({ theme, terms: theme.terms.filter((term) => lower.includes(term.toLowerCase())) }))
        .filter((hit) => hit.terms.length > 0);
}

/**
 * The analysis itself. Pure: documents in, insight out.
 * @param {Array<{id: string, group: string, text: string, label?: string}>} documents
 */
function analyzeTexts(documents) {
    const usable = documents.filter((document) => typeof document.text === 'string' && document.text.trim() !== '');
    const total = usable.length;

    const sentences = usable.flatMap((document) => splitSentences(document.text)
        .map((text) => ({ documentId: document.id, group: document.group, text })));
    const ranked = rankSentences(sentences);
    const rankOf = new Map(ranked.map((sentence, i) => [sentence, i]));

    const themes = NEED_THEMES.map((theme) => {
        const termCounts = new Map();
        const documentIds = [];
        for (const document of usable) {
            const hit = themeHits(document.text).find((h) => h.theme.id === theme.id);
            if (!hit) { continue; }
            documentIds.push(document.id);
            hit.terms.forEach((term) => termCounts.set(term, (termCounts.get(term) || 0) + 1));
        }
        const example = ranked.find((sentence) => themeHits(sentence.text).some((h) => h.theme.id === theme.id));
        return {
            id: theme.id,
            label: theme.label,
            need: theme.need,
            lexicon: theme.terms,
            documents: documentIds.length,
            share: total === 0 ? 0 : Math.round((documentIds.length / total) * 100),
            groups: [...new Set(usable.filter((d) => documentIds.includes(d.id)).map((d) => d.group))],
            terms: [...termCounts.entries()].map(([term, count]) => ({ term, documents: count }))
                .sort((a, b) => b.documents - a.documents),
            example: example ? { text: example.text, documentId: example.documentId, rank: rankOf.get(example) + 1 } : null,
        };
    }).sort((a, b) => b.documents - a.documents || a.label.localeCompare(b.label, 'th'));

    const groupCounts = new Map();
    usable.forEach((document) => groupCounts.set(document.group, (groupCounts.get(document.group) || 0) + 1));
    const groups = [...groupCounts.entries()]
        .map(([group, count]) => ({ group, label: STAKEHOLDER_GROUPS[group] || group, documents: count }))
        .sort((a, b) => b.documents - a.documents);

    const found = themes.filter((theme) => theme.documents > 0);
    const lines = total === 0 ? [] : [
        `วิเคราะห์ ${total} ข้อความ จาก ${groups.length} กลุ่ม (${groups.map((g) => `${g.label} ${g.documents}`).join(' · ')})`,
        ...found.slice(0, 3).map((theme, i) => `ประเด็นที่พบมากอันดับ ${i + 1}: ${theme.label} พบใน ${theme.documents} จาก ${total} ข้อความ `
            + `(${theme.groups.length} กลุ่ม) สื่อถึงความต้องการ: ${theme.need}`),
        found.length < themes.length
            ? `ประเด็นที่ไม่พบในข้อความชุดนี้: ${themes.filter((t) => t.documents === 0).map((t) => t.label).join(' · ')}`
            : 'พบครบทุกประเด็นในคลังคำ',
    ];

    return {
        documentCount: total,
        sentenceCount: sentences.length,
        groups,
        keywords: rankKeywords(usable),
        themes,
        summary: { lines, keySentences: pickDiverse(ranked, 4) },
    };
}

/** The organization's free text: survey answers not withdrawn, interviews not withdrawn. */
async function collectSystemDocuments({ scope = null } = {}) {
    const answers = await prisma.surveyAnswer.findMany({
        where: {
            ...(scope || {}),
            valueText: { not: null },
            NOT: { valueText: REDACTED_TEXT },
            question: { questionType: { in: FREE_TEXT_TYPES } },
            response: { researchConsentWithdrawnAt: null, template: { isDeleted: false } },
        },
        select: {
            id: true,
            valueText: true,
            question: { select: { questionText: true } },
            response: { select: { template: { select: { title: true, targetGroup: true } } } },
        },
    });
    const interviews = await prisma.expertInterview.findMany({
        where: { ...(scope || {}), isDeleted: false, intervieweeConsentWithdrawnAt: null },
        select: { id: true, title: true, transcript: true, keyInsights: true },
    });
    return [
        ...answers.map((answer) => ({
            id: `answer:${answer.id}`,
            group: answer.response.template.targetGroup || 'FARMER',
            label: `${answer.response.template.title} · ${answer.question.questionText}`,
            text: answer.valueText,
        })),
        ...interviews.map((interview) => ({
            id: `interview:${interview.id}`,
            group: 'EXPERT',
            label: `สัมภาษณ์: ${interview.title}`,
            text: [interview.transcript, ...(Array.isArray(interview.keyInsights) ? interview.keyInsights : [])].join('\n'),
        })),
    ];
}

function corpusDocuments() {
    return CORPUS_EXCERPTS.map((excerpt) => {
        const source = CORPUS_SOURCES[excerpt.sourceId];
        return {
            id: excerpt.id,
            group: excerpt.group,
            label: `${excerpt.speaker} · ${source.publisher}`,
            text: excerpt.text,
            source: { title: source.title, publisher: source.publisher, published: source.published, url: source.url },
        };
    });
}

/**
 * @param {{ basis?: 'SYSTEM'|'CORPUS'|null, scope?: object|null }} options
 *   basis omitted → the organization's own text when it has any, else the corpus.
 */
async function getStakeholderInsights({ basis = null, scope = null } = {}) {
    if (basis !== null && !Object.values(BASIS).includes(basis)) {
        throw httpError(400, 'INSIGHT_BASIS_INVALID', `basis must be one of ${Object.values(BASIS).join(', ')}`);
    }
    const systemDocuments = await collectSystemDocuments({ scope });
    const chosen = basis || (systemDocuments.length > 0 ? BASIS.SYSTEM : BASIS.CORPUS);
    const documents = chosen === BASIS.SYSTEM ? systemDocuments : corpusDocuments();
    const analysis = analyzeTexts(documents);
    const byId = new Map(documents.map((document) => [document.id, document]));
    const describe = (sentence) => {
        const document = byId.get(sentence.documentId);
        return { ...sentence, label: document.label, source: document.source || null };
    };
    return {
        basis: chosen,
        available: { system: systemDocuments.length, corpus: CORPUS_EXCERPTS.length },
        corpus: { readOn: CORPUS_READ_ON, sources: Object.values(CORPUS_SOURCES) },
        method: {
            runsOn: 'เซิร์ฟเวอร์ของแพลตฟอร์ม ไม่ส่งข้อความออกนอกระบบ และไม่ใช้โมเดลภาษาขนาดใหญ่',
            keywords: 'ตัดคำภาษาไทยด้วย Intl.Segmenter นับคำเดี่ยวและคำคู่ที่อยู่ติดกัน ตามจำนวนข้อความที่ใช้คำนั้น',
            themes: 'จัดข้อความเข้าประเด็นด้วยการจับคำตรงตัวจากคลังคำของแต่ละประเด็น ไม่ได้ตีความความหมาย ข้อความหนึ่งเข้าได้หลายประเด็น',
            summary: 'สรุปแบบคัดประโยค (TextRank) เลือกประโยคที่คล้ายกับประโยคอื่นมากที่สุด ไม่ได้แต่งประโยคใหม่',
        },
        ...analysis,
        themes: analysis.themes.map((theme) => ({ ...theme, example: theme.example ? describe(theme.example) : null })),
        summary: { ...analysis.summary, keySentences: analysis.summary.keySentences.map(describe) },
        documents: documents.map(({ id, group, label, source }) => ({ id, group, label, source: source || null })),
    };
}

module.exports = {
    BASIS,
    analyzeTexts,
    splitSentences,
    getStakeholderInsights,
};
