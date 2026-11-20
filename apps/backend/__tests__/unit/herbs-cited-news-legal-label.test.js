'use strict';

/**
 * Legal entries whose source is a news report (ไทยพีบีเอส, ฐานเศรษฐกิจ) are
 * secondary sources: nobody on this project has compared them with the text
 * in ราชกิจจานุเบกษา yet (order 154: never claim more than is true). Every
 * such entry must say so in its content, which is what the API serves and
 * the screen prints. The source map declares which sources are news, and the
 * seed appends the label from that declaration.
 */

const cited = require('../../scripts/herb-content/cited/entries.json');
const { citedRows, SPECIES, NEWS_LABEL } = require('../../prisma/seed-herbs');

// Matches a source's url and a seeded row's source line ("<title> · <url> · เข้าถึง <date>").
const NEWS_HOST = /https:\/\/(www\.)?(thaipbs\.or\.th|thansettakij\.com)\//;

describe('LEGAL entries cited to news carry the "not yet checked against the gazette" label', () => {
    test('every source on a news site is declared kind NEWS, and no non-news source is', () => {
        for (const [id, source] of Object.entries(cited.sources)) {
            expect({ id, kind: source.kind ?? null }).toEqual({ id, kind: NEWS_HOST.test(source.url) ? 'NEWS' : null });
        }
    });

    test('every LEGAL row from a NEWS source ends with the label; no other row carries it', () => {
        expect(NEWS_LABEL).toBe('แหล่งข่าว ยังไม่ได้ตรวจกับราชกิจจานุเบกษา');
        const rows = SPECIES.flatMap((s) => citedRows(s.code));
        const newsLegal = rows.filter((r) => r.category === 'LEGAL' && NEWS_HOST.test(r.source));
        expect(newsLegal.length).toBeGreaterThanOrEqual(10);
        for (const row of newsLegal) {
            expect(row.content.endsWith(` (${NEWS_LABEL})`)).toBe(true);
        }
        for (const row of rows.filter((r) => !newsLegal.includes(r))) {
            expect(row.content).not.toContain(NEWS_LABEL);
        }
    });

    test('a NEWS source is only ever used for LEGAL entries', () => {
        for (const [code, entries] of Object.entries(cited.herbs)) {
            for (const entry of entries) {
                if (cited.sources[entry.source].kind === 'NEWS') {
                    expect({ code, title: entry.title, category: entry.category }).toEqual({ code, title: entry.title, category: 'LEGAL' });
                }
            }
        }
    });
});
