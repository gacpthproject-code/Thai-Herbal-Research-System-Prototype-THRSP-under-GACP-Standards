'use strict';

/** ๐-๙ → 0-9 (U+0E50..U+0E59), one character for one, so a number typed in Thai digits reads like any other. */
function toArabicDigits(text) {
    return text.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50));
}

module.exports = { toArabicDigits };
