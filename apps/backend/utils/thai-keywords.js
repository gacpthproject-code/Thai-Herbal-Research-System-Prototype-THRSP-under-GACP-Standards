'use strict';

/**
 * Thai keyword extraction — text-mining ระดับ pilot สำหรับ สัญญา C05F680149
 * ต้นแบบที่ 3.1 (วิเคราะห์ความต้องการเกษตรกรจากคำตอบปลายเปิด).
 *
 * Uses the Node stdlib `Intl.Segmenter('th', { granularity: 'word' })` — no new
 * dependency (Node ≥16 ships full ICU). Falls back to whitespace splitting when
 * Segmenter is unavailable so the stats endpoint never crashes.
 *
 * Deliberately simple: word segmentation → stopword filter → frequency count.
 * NOT sentiment analysis / clustering — those are reported honestly as future
 * work in the final report.
 */

// คำหยุดไทย/อังกฤษที่พบบ่อยในคำตอบแบบสอบถาม (บอกโครงประโยค ไม่ใช่สาระ)
const THAI_STOPWORDS = new Set([
    'และ', 'หรือ', 'แต่', 'ที่', 'ซึ่ง', 'อัน', 'ใน', 'บน', 'ของ', 'จาก', 'ถึง', 'ให้',
    'ได้', 'ไป', 'มา', 'มี', 'เป็น', 'คือ', 'อยู่', 'ไม่', 'ก็', 'ว่า', 'จะ', 'ยัง',
    'ต้อง', 'ควร', 'อยาก', 'ขึ้น', 'ลง', 'กับ', 'แล้ว', 'ด้วย', 'เพื่อ', 'เพราะ',
    'ครับ', 'ค่ะ', 'คะ', 'นะ', 'จ้า', 'ๆ', 'ฯ', 'เช่น', 'อื่น', 'บ้าง', 'มาก', 'น้อย',
    'ดี', 'การ', 'ความ', 'ผู้', 'คน', 'ทำ', 'ใช้', 'อีก', 'ทั้ง', 'ตาม', 'เมื่อ', 'ถ้า',
    'หาก', 'จึง', 'โดย', 'ต่อ', 'กว่า', 'แน่นอน',
    'นี้', 'นั้น', 'สามารถ', 'นอกจาก', 'ทาง', 'ทั้งนี้', 'ดังนั้น', 'ได้แก่', 'อย่าง', 'ต่างๆ', 'เป็นต้น',
    'ครั้ง', 'ละ', 'แต่ละ', 'ส่วน', 'เรื่อง', 'กล่าว', 'ระดับ', 'ตาม', 'เข้า', 'ออก', 'แค่', 'เพียง',
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are',
]);

const MIN_WORD_LENGTH = 2;

function segmentWords(text) {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
        const words = [];
        for (const segment of segmenter.segment(text)) {
            if (segment.isWordLike) { words.push(segment.segment); }
        }
        return words;
    }
    // Fallback: whitespace split (degraded but never crashes)
    return text.split(/\s+/);
}

/** The words of a text that carry meaning, in order: stopwords, numbers and punctuation dropped. */
function contentWords(text) {
    if (typeof text !== 'string' || text.trim() === '') { return []; }
    return segmentWords(text)
        .map((raw) => raw.trim().toLowerCase())
        .filter((word) => word.length >= MIN_WORD_LENGTH
            && !THAI_STOPWORDS.has(word)
            && !/^[\d\s\p{P}]+$/u.test(word));
}

/**
 * Document frequency: a word counts once per text however often that text
 * repeats it, so one respondent typing a name five times counts as one.
 *
 * @param {Array<string|null|undefined>} texts — one text per respondent
 * @param {{top?: number}} options
 * @returns {Array<{word: string, count: number}>} count = texts containing the word, desc
 */
function extractThaiKeywords(texts, { top = 15 } = {}) {
    const counts = new Map();
    for (const text of texts || []) {
        for (const word of new Set(contentWords(text))) {
            counts.set(word, (counts.get(word) || 0) + 1);
        }
    }
    return [...counts.entries()]
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'th'))
        .slice(0, top);
}

module.exports = { extractThaiKeywords, contentWords };
