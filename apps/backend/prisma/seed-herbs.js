/**
 * Seed Herb Knowledge DB — สัญญา C05F680149 ต้นแบบที่ 5 "ฐานข้อมูลสมุนไพรไทย 6 ฐานข้อมูล".
 *
 * Upserts the 6 HerbSpecies rows and loads the cited entries in
 * scripts/herb-content/cited/entries.json. Every entry's `source` is
 * "<document> · <url> · เข้าถึง <date>", so the screen can link to it.
 *
 * A source declared `kind: "NEWS"` in entries.json is a news report, a
 * secondary source nobody has compared with ราชกิจจานุเบกษา yet. Every LEGAL
 * entry from one gets NEWS_LABEL appended to its content, so the API and the
 * screen carry the caveat with the text (order 154: never claim more than is
 * true).
 *
 * Idempotent: per herb, a run replaces the rows this file wrote before (same
 * title, a source with a URL) and removes the retired uncited SEED_STARTER rows.
 * Entries an admin added under other titles, and AI_DRAFT imports, are kept.
 *
 * Run: node prisma/seed-herbs.js            (dry run: prints what it would write)
 *      node prisma/seed-herbs.js --apply    (writes)
 */

const { PrismaClient } = require('@prisma/client');
const cited = require('../scripts/herb-content/cited/entries.json');

const NEWS_LABEL = 'แหล่งข่าว ยังไม่ได้ตรวจกับราชกิจจานุเบกษา';

// 6 ฐานตามเอกสารแนบ A3 (สัญญาหน้า 51/81) · ชื่อวิทยาศาสตร์ตามตำรามาตรฐานยาสมุนไพรไทย 2021
const SPECIES = [
    { code: 'CANNABIS', nameTH: 'กัญชา', nameEN: 'Cannabis', scientificName: 'Cannabis sativa L.', familyName: 'Cannabaceae', isPrimary: true, isControlled: true, sortOrder: 1, description: 'สมุนไพรหลักของโครงการ ส่วนที่ใช้คือช่อดอกเพศเมียและใบ ช่อดอกเป็นสมุนไพรควบคุม' },
    { code: 'TURMERIC', nameTH: 'ขมิ้นชัน', nameEN: 'Turmeric', scientificName: 'Curcuma longa L.', familyName: 'Zingiberaceae', isPrimary: false, isControlled: false, sortOrder: 2, description: 'ส่วนที่ใช้คือเหง้าแห้ง สารสำคัญกลุ่ม curcuminoids' },
    { code: 'GINGER', nameTH: 'ขิง', nameEN: 'Ginger', scientificName: 'Zingiber officinale Roscoe', familyName: 'Zingiberaceae', isPrimary: false, isControlled: false, sortOrder: 3, description: 'ส่วนที่ใช้คือเหง้าแห้ง สารสำคัญกลุ่ม gingerols และ shogaols' },
    { code: 'BLACK_GALINGALE', nameTH: 'กระชายดำ', nameEN: 'Black Galingale', scientificName: 'Kaempferia parviflora Wall. ex Baker', familyName: 'Zingiberaceae', isPrimary: false, isControlled: false, sortOrder: 4, description: 'ส่วนที่ใช้คือเหง้าแห้ง เนื้อในสีม่วง' },
    { code: 'PLAI', nameTH: 'ไพล', nameEN: 'Plai', scientificName: 'Zingiber montanum (J.Koenig) Link ex A.Dietr.', familyName: 'Zingiberaceae', isPrimary: false, isControlled: false, sortOrder: 5, description: 'ส่วนที่ใช้คือเหง้าแห้ง มีน้ำมันหอมระเหย' },
    { code: 'KRATOM', nameTH: 'กระท่อม', nameEN: 'Kratom', scientificName: 'Mitragyna speciosa (Korth.) Havil.', familyName: 'Rubiaceae', isPrimary: false, isControlled: true, sortOrder: 6, description: 'ส่วนที่ใช้คือใบแห้ง อัลคาลอยด์หลักคือ mitragynine อยู่ภายใต้ พ.ร.บ.พืชกระท่อม พ.ศ. 2565' },
];

const RETIRED_SOURCE = 'SEED_STARTER';

function sourceOf(sourceId) {
    const source = cited.sources[sourceId];
    if (!source) { throw new Error(`entries.json names an unknown source: ${sourceId}`); }
    return source;
}

function contentOf(entry, source) {
    return entry.category === 'LEGAL' && source.kind === 'NEWS' ? `${entry.content} (${NEWS_LABEL})` : entry.content;
}

function citedRows(code) {
    return (cited.herbs[code] || []).map((entry, index) => {
        const source = sourceOf(entry.source);
        return {
            herbCode: code,
            category: entry.category,
            title: entry.title,
            content: contentOf(entry, source),
            valueNumber: entry.valueNumber ?? null,
            unit: entry.unit ?? null,
            source: `${source.title} · ${source.url} · เข้าถึง ${cited.accessed}`,
            sortOrder: index + 1,
        };
    });
}

async function seedHerbs(prisma, { apply = false, log = console.log } = {}) {
    const summary = [];
    for (const species of SPECIES) {
        const rows = citedRows(species.code);
        const titles = rows.map((r) => r.title);
        if (apply) {
            await prisma.$transaction([
                prisma.herbSpecies.upsert({ where: { code: species.code }, update: species, create: species }),
                prisma.herbKnowledgeEntry.deleteMany({
                    where: {
                        herbCode: species.code,
                        OR: [{ source: RETIRED_SOURCE }, { title: { in: titles }, source: { contains: '://' } }],
                    },
                }),
                prisma.herbKnowledgeEntry.createMany({ data: rows }),
            ]);
        }
        summary.push({ code: species.code, citedEntries: rows.length });
        log(`  ${species.code} (${species.nameTH}): ${rows.length} cited entries${apply ? '' : ' (dry run)'}`);
    }
    return summary;
}

if (require.main === module) {
    const apply = process.argv.includes('--apply');
    const prisma = new PrismaClient();
    console.log(apply ? 'Seeding Herb Knowledge DB...' : 'Dry run (add --apply to write):');
    seedHerbs(prisma, { apply })
        .catch((e) => { console.error('Seed error:', e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}

module.exports = { seedHerbs, SPECIES, citedRows, NEWS_LABEL };
