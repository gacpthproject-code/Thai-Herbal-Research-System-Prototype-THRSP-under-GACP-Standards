'use strict';

/**
 * The synthetic research sample: who exists, and what they write.
 *
 * Accounts, organizations, companies, farms, the plant species and planting
 * cycles are inserted directly: they are the stage, and none of their columns
 * is exported. Every exported row is written through the door the screens
 * call, by an account allowed to call it: survey templates and answers,
 * cultivation activities, harvest batches (with their QR integrity record),
 * public QR scans, consent withdrawal and farm deletion.
 *
 * Two rows are the exception, and say so: a consent given under an older
 * notice and an answer given before consent existed. The current door refuses
 * to create either (409 and 403), yet the export must leave both out, so the
 * sample writes a v3 answer through the door and rewinds its consent before
 * anything is exported.
 *
 * Fixed seed: every value below is literal or drawn from mulberry32(SEED), and
 * the scratch database fixes row ids and creation times (lab.js), so the same
 * code writes the same sample byte for byte.
 */

const crypto = require('crypto');
const { PUBLIC_PSEUDONYM_KEYS } = require('../../../data/datasets/public-pseudonym-keys');

const SEED = 20261009;
/** Published on purpose: anyone can regenerate docs/data/sample. A real export refuses it. */
const SAMPLE_KEY = PUBLIC_PSEUDONYM_KEYS.SAMPLE;
const CLOCK_START = '2026-09-15T02:00:00.000Z';
const ROW_EPOCH = '2026-09-15 01:00:00';
const ACCEPTED_NOTICE = 'research-survey-notice-th-v3';

function sampleId(label) {
    const h = crypto.createHash('md5').update(`dataset-sample:${label}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const ORGS = [
    { tag: 'A', name: 'หน่วยงานตัวอย่างสังเคราะห์ก', code: 'SAMPLEDSA' },
    { tag: 'B', name: 'หน่วยงานตัวอย่างสังเคราะห์ข', code: 'SAMPLEDSB' },
];

/** Staff of organization A, one per provider role, plus the admin of B. */
const STAFF = [
    { key: 'adminA', org: 'A', role: 'system_admin_dtam' },
    { key: 'reviewerA', org: 'A', role: 'document_reviewer' },
    { key: 'dispatcherA', org: 'A', role: 'dispatcher' },
    { key: 'inspectorA', org: 'A', role: 'field_inspector' },
    { key: 'approverA', org: 'A', role: 'certificate_approver' },
    { key: 'financeDtamA', org: 'A', role: 'finance_officer_dtam' },
    { key: 'financePlatformA', org: 'A', role: 'finance_officer_platform' },
    { key: 'platformAdminA', org: 'A', role: 'system_admin_platform' },
    { key: 'adminB', org: 'B', role: 'system_admin_dtam' },
];

/**
 * consent: v3 = consents through the door · withdraw = consents, then
 * withdraws after the first export · v2 / none = historical rows (see above).
 * Respondents that reach the export, per region of template A (order 49 Q5):
 * NORTH 6, all เชียงใหม่ (region and province shown) · NORTHEAST 6, ขอนแก่น 5
 * and อุดรธานี 1 (the lone province would be a blank group of one, so ขอนแก่น
 * is blanked too) · CENTRAL 3 and SOUTH 3 then 2 after f9 withdraws (both
 * regions blank, together at least 5). The texts carry every phone and ID
 * shape the export must mask.
 */
const FARMERS = [
    { key: 'f1', org: 'A', province: 'เชียงใหม่', region: 'NORTH', consent: 'v3', farm: true, text: 'ติดต่อกลับที่ 081-234-5678 หรือ farm.owner@example.com ได้ครับ' },
    { key: 'f2', org: 'A', province: 'เชียงใหม่', region: 'NORTH', consent: 'v3', farm: true, text: 'ใส่เลขบัตร 1100000000008 ไว้ให้ตรวจสอบ' },
    { key: 'f3', org: 'A', province: 'เชียงใหม่', region: 'NORTH', consent: 'v3', text: '=SUM(A1:A9) อยากได้ตารางคำนวณ' },
    { key: 'f4', org: 'A', province: 'เชียงใหม่', region: 'NORTH', consent: 'v3', text: '+ขอให้เพิ่มรอบอบรม' },
    { key: 'f5', org: 'A', province: 'เชียงใหม่', region: 'NORTH', consent: 'v3', text: '-ลดเอกสารที่ต้องแนบ' },
    { key: 'f6', org: 'A', province: 'เชียงใหม่', region: 'NORTH', consent: 'none', text: 'ตอบก่อนมีข้อความยินยอม' },
    { key: 'f7', org: 'A', province: 'เชียงใหม่', region: 'NORTH', consent: 'v3', farm: true, deleteFarm: true, text: '@เจ้าหน้าที่ ขอบคุณครับ' },
    { key: 'f8', org: 'A', province: 'อุดรธานี', region: 'NORTHEAST', consent: 'v3', text: 'อยากได้คู่มือพกพา โทร ๐๘๑-๒๓๔-๕๖๗๘' },
    { key: 'f9', org: 'A', province: 'สงขลา', region: 'SOUTH', consent: 'withdraw', text: 'ภายหลังขอถอนความยินยอม' },
    { key: 'f10', org: 'A', province: 'ขอนแก่น', region: 'NORTHEAST', consent: 'v2', text: 'ยินยอมกับข้อความรุ่นเก่า' },
    { key: 'n1', org: 'A', province: 'ขอนแก่น', region: 'NORTHEAST', consent: 'v3', text: 'สำนักงานเกษตร (043) 123-456 หรือ 081  234  5678' },
    { key: 'n2', org: 'A', province: 'ขอนแก่น', region: 'NORTHEAST', consent: 'v3', text: 'โทร 081.234.5678 ลูกหลาน 0974332190  087 0929995 - 066 4243013' },
    { key: 'n3', org: 'A', province: 'ขอนแก่น', region: 'NORTHEAST', consent: 'v3', text: 'แฟกซ์ 081/234/5678 โทร 081–234–5678' },
    { key: 'n4', org: 'A', province: 'ขอนแก่น', region: 'NORTHEAST', consent: 'v3', text: 'ไลน์ 66812345678 หรือ 081,234,5678' },
    { key: 'n5', org: 'A', province: 'ขอนแก่น', region: 'NORTHEAST', consent: 'v3', text: 'บัตร ๑๑๐๐๐๐๐๐๐๐๐๐๘ ปลูก ๓ ไร่ โทร 081 - 234 - 5678' },
    { key: 'c1', org: 'A', province: 'สระบุรี', region: 'CENTRAL', consent: 'v3', text: '(02) 123-4567 ต่อ 12 หรือ 081-234-5678 / 02-123-4567' },
    { key: 'c2', org: 'A', province: 'สระบุรี', region: 'CENTRAL', consent: 'v3', text: '+66 (0) 81 234 5678 หรือ (+66) 81-234-5678' },
    { key: 'c3', org: 'A', province: 'สระบุรี', region: 'CENTRAL', consent: 'v3', text: 'โทร 081-234-5678 089 - 999 - 0000' },
    { key: 's1', org: 'A', province: 'สงขลา', region: 'SOUTH', consent: 'v3', text: 'นัดวันที่ 06/10/2569 เวลา 09.30 FAX-02-123-4567 สายใน (07) 1622584 / 0655724928 / 098 4823789' },
    { key: 's2', org: 'A', province: 'สงขลา', region: 'SOUTH', consent: 'v3', text: 'ปุ๋ยสูตร ๑๕-๑๕-๑๕ ผู้ช่วย ๓-๑๑๕๐-๗๗๑๕๖-๐๙-๓ ๐๘๑-๒๓๔-๕๖๗๘' },
    { key: 'b1', org: 'B', province: 'สงขลา', region: 'SOUTH', consent: 'v3', farm: true, text: 'คำตอบขององค์กรข' },
];

const QUESTIONS = [
    { questionText: 'ท่านปลูกสมุนไพรชนิดใดบ้าง', questionType: 'MULTI_CHOICE', choices: ['กัญชา', 'กระท่อม', 'ฟ้าทะลายโจร', 'ขมิ้นชัน'], section: 'การปลูก' },
    { questionText: 'ความพึงพอใจต่อขั้นตอนยื่นคำขอ', questionType: 'RATING_5', section: 'การรับรอง' },
    { questionText: 'พื้นที่ปลูกโดยประมาณ (ไร่)', questionType: 'NUMBER', section: 'การปลูก' },
    { questionText: 'ช่องทางที่ต้องการรับข่าวสาร', questionType: 'SINGLE_CHOICE', choices: ['แอปพลิเคชัน', 'ข้อความสั้น', 'จดหมาย', 'สายด่วน (02) 123-4567'], section: 'การสื่อสาร' },
    { questionText: 'ข้อเสนอแนะเพิ่มเติม', questionType: 'TEXTAREA', isRequired: false, section: 'ข้อเสนอแนะ' },
];

const ACTIVITIES = [
    { activityType: 'IRRIGATION', scope: 'CYCLE', day: '2026-08-01', quantity: 200, unit: 'ลิตร', method: 'รดน้ำโคนต้น', weather: 'SUNNY', temperature: 31.5, humidity: 62 },
    { activityType: 'FERTILIZER', scope: 'CYCLE', day: '2026-08-08', quantity: 25, unit: 'กก.', productName: 'ปุ๋ยอินทรีย์ ร้านโทร 081-234-5678 / 02-123-4567 อีเมล shop@example.co.th', method: 'หว่านรอบโคน ผู้รับจ้าง 3-1150-77156-09-3 081 - 234 - 5678', weather: 'CLOUDY', temperature: 29, humidity: 70 },
    { activityType: 'PEST_CONTROL', scope: 'CYCLE', day: '2026-08-15', quantity: 5, unit: 'ลิตร', productName: '=HYPERLINK("http://example.invalid") สารสกัดสะเดา', method: 'ฉีดพ่น อ้างอิง 0b0c2f7e-0000-4000-8000-000000000001', performedBy: 'นายทดสอบ สังเคราะห์', weather: 'RAINY', temperature: 27.5, humidity: 85, note: 'โทรหาเจ้าของ 089-999-0000' },
];

/**
 * Every national ID and phone typed into the texts above, as bare digits:
 * K6 fails when 6 digits in a row of any of them reach a file (a mask that
 * left most of an ID or a phone behind).
 */
const PLANTED_IDENTIFIERS = Object.freeze([
    '1100000000008', '3115077156093', '0812345678', '0899990000', '021234567', '043123456',
    '071622584', '0655724928', '0984823789', '0974332190', '0870929995', '0664243013',
]);

const BATCHES = [
    { day: '2026-09-01', freshWeight: 120.5, dryWeight: 30.25, moistureContent: 9.5, qualityGrade: 'A', notes: 'บันทึกภายใน ไม่ส่งออก' },
    { day: '2026-09-05', freshWeight: 80, qualityGrade: 'B' },
];

function fail(step, res) {
    const detail = res.json ? JSON.stringify(res.json).slice(0, 300) : res.bytes.toString('utf8').slice(0, 300);
    throw new Error(`sample step "${step}" answered ${res.status}: ${detail}`);
}

/** The stage: organizations, accounts, companies, farms, species and cycles. */
async function insertStage(prisma) {
    const people = {};
    for (const org of ORGS) {
        await prisma.organization.create({ data: { id: sampleId(`org-${org.tag}`), name: org.name, slug: org.code.toLowerCase(), code: org.code } });
    }
    const orgId = (tag) => sampleId(`org-${tag}`);
    let phone = 0;
    const user = async (key, org, role, accountType) => {
        phone += 1;
        const row = {
            id: sampleId(`user-${key}`), canonicalId: `sample-${key}`, password: 'not-a-login', role, accountType,
            authType: accountType === 'PROVIDER' ? 'PROVIDER_ID' : 'EMAIL_LEGACY',
            ...(accountType === 'PROVIDER' ? { providerId: `sample-${key}` } : { healthId: `sample-${key}` }),
            email: `sample-${key}@sample.invalid`, phoneNumber: `08${String(10000000 + phone * 7919).slice(-8)}`,
            firstName: `สังเคราะห์${key}`, lastName: 'ตัวอย่างระบบ', status: 'ACTIVE', organizationId: orgId(org),
        };
        await prisma.user.create({ data: row });
        people[key] = row;
    };
    for (const s of STAFF) { await user(s.key, s.org, s.role, 'PROVIDER'); }
    for (const f of FARMERS) { await user(f.key, f.org, 'health', 'HEALTH'); }

    await prisma.plantSpecies.create({ data: { id: sampleId('species-CAN'), code: 'CAN', nameTH: 'กัญชา' } });
    const farms = {};
    for (const f of FARMERS.filter((x) => x.farm)) {
        const entityId = sampleId(`entity-${f.key}`);
        await prisma.entity.create({ data: { id: entityId, type: 'JURISTIC', displayName: `บริษัท ไร่สังเคราะห์${f.key} จำกัด`, organizationId: orgId(f.org) } });
        await prisma.entityMembership.create({
            data: { id: sampleId(`member-${f.key}`), userId: people[f.key].id, entityId, role: 'OWNER', status: 'ACTIVE', organizationId: orgId(f.org) },
        });
        const farm = await prisma.farm.create({
            data: {
                id: sampleId(`farm-${f.key}`), ownerId: people[f.key].id, entityId, farmName: `ไร่สังเคราะห์${f.key}`,
                farmType: 'CULTIVATION', address: `เลขที่ ${f.key} ถนนสังเคราะห์`, province: f.province, district: 'เมือง',
                subDistrict: 'ในเมือง', postalCode: '10000', totalArea: 4, cultivationArea: 3, cultivationMethod: 'OUTDOOR', organizationId: orgId(f.org),
            },
        });
        const cycle = await prisma.plantingCycle.create({
            data: {
                id: sampleId(`cycle-${f.key}`), cycleName: `รอบสังเคราะห์${f.key}`, farmId: farm.id, plantSpeciesId: sampleId('species-CAN'),
                startDate: new Date('2026-06-01T00:00:00Z'), organizationId: orgId(f.org),
            },
        });
        farms[f.key] = { farmId: farm.id, cycleId: cycle.id };
    }
    return { people, farms, orgIds: { A: orgId('A'), B: orgId('B') } };
}

/** Every exported row, written through the doors the screens call. */
async function writeThroughDoors({ api, mint, stage }) {
    const rand = mulberry32(SEED);
    const tokens = Object.fromEntries(Object.entries(stage.people).map(([k, u]) => [k, mint(u)]));
    const templates = {};
    for (const [org, admin] of [['A', 'adminA'], ['B', 'adminB']]) {
        const created = await api('POST', '/api/surveys/templates', {
            token: tokens[admin],
            body: { code: `SAMPLE-NEEDS-${org}`, title: `แบบสำรวจความต้องการตัวอย่าง ${org}`, targetGroup: 'FARMER', questions: QUESTIONS },
        });
        if (created.status !== 201 && created.status !== 200) { fail(`create template ${org}`, created); }
        const templateId = created.json.data.id;
        const activated = await api('POST', `/api/surveys/templates/${templateId}/activate`, { token: tokens[admin] });
        if (activated.status !== 200) { fail(`activate template ${org}`, activated); }
        const full = await api('GET', `/api/surveys/templates/${templateId}`, { token: tokens[admin] });
        if (full.status !== 200) { fail(`read template ${org}`, full); }
        templates[org] = { id: templateId, questions: full.json.data.questions };
    }
    const notice = await api('GET', '/api/surveys/research-consent', { token: tokens.f1 });
    if (notice.status !== 200) { fail('read research notice', notice); }

    const responses = {};
    for (const f of FARMERS) {
        const { id, questions } = templates[f.org];
        const value = (q) => {
            if (q.questionType === 'MULTI_CHOICE') { return q.choices.filter((_, i) => i === 0 || rand() < 0.5); }
            if (q.questionType === 'SINGLE_CHOICE') { return q.choices[Math.floor(rand() * q.choices.length)]; }
            if (q.questionType === 'RATING_5') { return 1 + Math.floor(rand() * 5); }
            if (q.questionType === 'NUMBER') { return Math.round(rand() * 200) / 10; }
            return f.text;
        };
        const res = await api('POST', `/api/surveys/templates/${id}/responses`, {
            token: tokens[f.key],
            body: {
                region: f.region, province: f.province,
                answers: questions.map((q) => ({ questionId: q.id, value: value(q) })),
                researchConsent: { version: notice.json.data.version, accepted: true },
            },
        });
        if (res.status !== 201 && res.status !== 200) { fail(`answer as ${f.key}`, res); }
        responses[f.key] = res.json.data.id;
    }

    const batches = {};
    for (const f of FARMERS.filter((x) => x.farm)) {
        const { farmId, cycleId } = stage.farms[f.key];
        for (const a of ACTIVITIES) {
            const { day, ...body } = a;
            const res = await api('POST', `/api/planting-cycles/${cycleId}/activities`, {
                token: tokens[f.key], body: { ...body, activityDate: `${day}T01:30:00.000Z` },
            });
            if (res.status !== 201) { fail(`activity ${a.activityType} as ${f.key}`, res); }
        }
        batches[f.key] = [];
        for (const b of BATCHES) {
            const { day, ...body } = b;
            const res = await api('POST', '/api/harvest-batches', {
                token: tokens[f.key], body: { ...body, farmId, cycleId, plantCode: 'CAN', harvestDate: `${day}T00:00:00.000Z` },
            });
            if (res.status !== 201 && res.status !== 200) { fail(`harvest batch as ${f.key}`, res); }
            batches[f.key].push(res.json.data.id);
        }
        const scanned = await api('GET', `/api/trace/batch/${batches[f.key][0]}`);
        if (scanned.status !== 200) { fail(`public scan of ${f.key}`, scanned); }
    }
    return { tokens, templates, responses, batches };
}

/** The two consent histories the current door refuses to create (see the header). */
async function rewindHistoricalConsents({ prisma, written }) {
    for (const f of FARMERS.filter((x) => x.consent === 'v2' || x.consent === 'none')) {
        await prisma.surveyResponse.update({
            where: { id: written.responses[f.key] },
            data: f.consent === 'v2'
                ? { researchConsentVersion: 'research-survey-notice-th-v2' }
                : { researchConsentVersion: null, researchConsentAt: null },
        });
    }
}

/** After the first export: one respondent withdraws and one company deletes its farm. */
async function changeAfterFirstExport({ api, stage, written }) {
    for (const f of FARMERS.filter((x) => x.consent === 'withdraw')) {
        const res = await api('POST', '/api/surveys/research-consent/withdraw', { token: written.tokens[f.key] });
        if (res.status !== 200) { fail(`withdraw as ${f.key}`, res); }
    }
    for (const f of FARMERS.filter((x) => x.deleteFarm)) {
        const res = await api('DELETE', `/api/farms/${stage.farms[f.key].farmId}`, { token: written.tokens[f.key] });
        if (res.status !== 200) { fail(`delete farm as ${f.key}`, res); }
    }
}

module.exports = {
    SEED, SAMPLE_KEY, CLOCK_START, ROW_EPOCH, ACCEPTED_NOTICE, ORGS, STAFF, FARMERS, PLANTED_IDENTIFIERS,
    sampleId, insertStage, writeThroughDoors, rewindHistoricalConsents, changeAfterFirstExport,
};
