'use strict';

/**
 * Dataset Export Service — สัญญา C05F680149 ภาคผนวก 4 ข้อ 3
 * ชุดข้อมูลดิบ (API/CSV) + คู่มือการใช้ชุดข้อมูล สำหรับคลังข้อมูลวิจัยของโครงการ
 *
 * Everything a file holds is decided by data/datasets/dataset-domains.js: the
 * SELECT, the publishing rule of each cell, and the research basis the domain
 * leaves under. This module reads the registry and applies it; the data
 * dictionary is generated from the same registry, so the two cannot drift.
 *
 * Determinism: rows leave in [createdAt, id] order through keyset (cursor)
 * pages, so two exports of the same data under the same key are byte-identical
 * and a page boundary inside a run of equal createdAt neither repeats nor
 * drops a row.
 *
 * Memory: a file is built whole in memory before it is sent (one domain, or
 * the whole bundle). That is fine at pilot scale; the data dictionary states
 * the limit.
 */

const crypto = require('crypto');
const { prisma } = require('./prisma-database');
const { withDeletedRows } = require('./soft-delete-context');
const { tryGetSecret } = require('../config/secrets');
const logger = require('../shared/logger');
const { neutralizeCsvFormula } = require('../shared/csv-utils');
const { buildInfo } = require('../shared/build-info');
const { zipStore } = require('../shared/zip-store');
const { maskThaiIdsInText } = require('../utils/field-encryption');
const { toArabicDigits } = require('../shared/thai-digits');
const { getZonedParts, localWallClock } = require('../utils/working-days');
const { SMALL_COUNT_THRESHOLD, suppressSmallCells } = require('../shared/small-cell-suppression');
const researchUseBases = require('../data/datasets/research-use-bases');
const { PUBLIC_PSEUDONYM_KEYS } = require('../data/datasets/public-pseudonym-keys');
const {
    RESEARCH_BASIS, PUBLISH, ACCEPTED_RESEARCH_CONSENT_VERSIONS, DATASET_DOMAINS, DATASET_LISTS, WITHDRAWN_DELETION_DUTY,
} = require('../data/datasets/dataset-domains');

const PAGE_SIZE = 1000;
const FORMATS = Object.freeze(['csv', 'jsonl']);
const ORDER = Object.freeze([{ createdAt: 'asc' }, { id: 'asc' }]);
const RECIPIENT = 'คลังข้อมูลวิจัยของโครงการ';

function httpError({ statusCode, code, message }) {
    return Object.assign(new Error(message), { statusCode, code });
}

// Domain separation: the raw key is never used directly, so a dataset
// pseudonym can never equal a digest made with the same bytes elsewhere.
const PSEUDONYM_KEY_CONTEXT = 'gacp:dataset-pseudonym:v1';
const MIN_KEY_BYTES = 32;
const FINGERPRINT_CONTEXT = 'gacp:dataset-pseudonym-key-fingerprint:v1';

function derivedKey(secret) {
    return crypto.createHmac('sha256', secret).update(PSEUDONYM_KEY_CONTEXT).digest();
}

/** value → 32 hex chars, keyed by `secret`; null stays null. */
function pseudonymiserFor(secret) {
    const key = derivedKey(secret);
    return (value) => (value === null || value === undefined
        ? null
        : crypto.createHmac('sha256', key).update(String(value)).digest('hex').slice(0, 32));
}

/**
 * Names the key a file was made with without revealing it: the recipient sees
 * the fingerprint change when the key is rotated (order 49 Q4).
 */
function keyFingerprint(secret) {
    return crypto.createHmac('sha256', derivedKey(secret)).update(FINGERPRINT_CONTEXT).digest('hex').slice(0, 16);
}

/**
 * Read per export, never cached: a rotated key takes effect on the next
 * export. Never logged. Refused in every environment: no key, a key anyone can
 * read (PUBLIC_PSEUDONYM_KEYS), a key under 32 bytes once trimmed, and the
 * HMAC_KEY value.
 */
function currentKey() {
    const secret = tryGetSecret('DATASET_PSEUDONYM_KEY');
    if (!secret) {
        throw httpError({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_UNAVAILABLE', message: 'No key for dataset pseudonyms; set DATASET_PSEUDONYM_KEY' });
    }
    if (Object.values(PUBLIC_PSEUDONYM_KEYS).includes(secret.trim())) {
        throw httpError({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_PUBLIC', message: 'DATASET_PSEUDONYM_KEY is a published key (the sample or the test fallback)' });
    }
    if (Buffer.byteLength(secret.trim(), 'utf8') < MIN_KEY_BYTES) {
        throw httpError({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_TOO_SHORT', message: `DATASET_PSEUDONYM_KEY must hold at least ${MIN_KEY_BYTES} bytes` });
    }
    if (secret.trim() === (tryGetSecret('HMAC_KEY') || '').trim()) {
        throw httpError({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_REUSES_HMAC_KEY', message: 'DATASET_PSEUDONYM_KEY must not reuse the HMAC_KEY value' });
    }
    return { pseudonym: pseudonymiserFor(secret), fingerprint: keyFingerprint(secret) };
}

/** 'YYYY-MM-DD' naming a Bangkok calendar day that exists (no 2025-02-30). */
function isCalendarDay(value) {
    const start = localWallClock(value, '00:00');
    return !Number.isNaN(start.getTime()) && getZonedParts(start).isoDate === value;
}

const isFilled = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * The research ethics committee approval a farm ruling carries (order 56(4.3),
 * PDPC s.24(1) research notice): committee, reference number and an approval
 * day no later than the day the ruling takes effect. Null when any part is
 * missing, which counts as no approval on file.
 */
function ethicsApprovalOf(entry) {
    const approval = entry.ethicsApproval;
    const onFile = Boolean(approval) && isFilled(approval.committee) && isFilled(approval.reference)
        && isCalendarDay(approval.approvedOn) && approval.approvedOn <= entry.effectiveFrom;
    return onFile ? { committee: approval.committee, reference: approval.reference, approvedOn: approval.approvedOn } : null;
}

/** An entry opens the basis only when it says so and its ethics approval is on file. */
const opensBasis = (entry) => entry.inForce === true && ethicsApprovalOf(entry) !== null;

/**
 * The ruling a basis rests on at `at`: the latest dated entry that has come
 * into force (Bangkok day boundaries). Only farm-operation data needs one, and
 * that entry opens it only with its ethics approval on file.
 * @returns {{ inForce: boolean, entry: object|null }}
 */
function researchBasisAt(basis, at = new Date()) {
    if (basis !== RESEARCH_BASIS.FARM_OPERATION) { return { inForce: true, entry: null }; }
    let latest = null;
    for (const entry of researchUseBases.RESEARCH_USE_BASES[basis] || []) {
        const from = localWallClock(entry.effectiveFrom, '00:00').getTime();
        if (from <= at.getTime() && (!latest || from >= latest.from)) { latest = { from, entry }; }
    }
    return { inForce: Boolean(latest && opensBasis(latest.entry)), entry: latest ? latest.entry : null };
}

/**
 * When a basis first came into force, up to `at` (Bangkok day boundaries);
 * null while it never has. A row gone before then never left the system, and
 * an entry without its ethics approval never let one leave.
 */
function inForceSince(basis, at = new Date()) {
    if (basis !== RESEARCH_BASIS.FARM_OPERATION) { return new Date(0); }
    const starts = (researchUseBases.RESEARCH_USE_BASES[basis] || [])
        .filter(opensBasis)
        .map(entry => localWallClock(entry.effectiveFrom, '00:00').getTime())
        .filter(from => from <= at.getTime());
    return starts.length ? new Date(Math.min(...starts)) : null;
}

function basisRefusal(domain, at) {
    return researchBasisAt(domain.basis, at).inForce
        ? null
        : httpError({ statusCode: 403, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE', message: `${domain.key} is farm-operation data; no research-use ruling with its research ethics approval on file is in force (data/datasets/research-use-bases.js)` });
}

function findDomain(key) {
    const domain = DATASET_DOMAINS.find(d => d.key === key);
    if (!domain) { throw httpError({ statusCode: 404, code: 'DATASET_NOT_FOUND', message: `Unknown dataset domain: ${key}` }); }
    return domain;
}

function assertFormat(format) {
    if (!FORMATS.includes(format)) { throw httpError({ statusCode: 400, code: 'INVALID_FORMAT', message: 'format must be csv or jsonl' }); }
}

const prismaName = (model) => model.charAt(0).toLowerCase() + model.slice(1);

/** Catalog for GET /api/datasets — no DB round-trip. */
function listDomains({ at = new Date() } = {}) {
    return DATASET_DOMAINS.map((domain) => {
        const refusal = basisRefusal(domain, at);
        return {
            key: domain.key,
            thaiName: domain.thaiName,
            description: domain.description,
            basis: domain.basis,
            fieldCount: domain.fields.length,
            formats: [...FORMATS],
            available: !refusal,
            unavailableCode: refusal ? refusal.code : null,
            lists: DATASET_LISTS.filter(l => l.domain === domain.key).map(l => ({ key: l.key, thaiName: l.thaiName })),
        };
    });
}

// ── reading ────────────────────────────────────────────────────────────────

const pathOf = (field) => (field.from || field.field).split('.');

function selectFor(fields) {
    const select = { id: true, createdAt: true };
    for (const field of fields) {
        let node = select;
        const path = pathOf(field);
        path.forEach((part, i) => {
            if (i === path.length - 1) { node[part] = true; return; }
            node[part] = node[part] && node[part].select ? node[part] : { select: {} };
            node = node[part].select;
        });
    }
    return select;
}

function valueAt(record, field) {
    return pathOf(field).reduce((node, part) => (node == null ? null : node[part]), record) ?? null;
}

/** Every row matching `where`, in [createdAt, id] order, through keyset pages. */
async function readAll(model, where, select, pageSize = PAGE_SIZE) {
    const rows = [];
    let cursor = null;
    for (;;) {
        const page = await prisma[prismaName(model)].findMany({
            where, select, orderBy: [...ORDER], take: pageSize,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        rows.push(...page);
        if (page.length < pageSize) { return rows; }
        cursor = page[page.length - 1].id;
    }
}

// ── publishing ─────────────────────────────────────────────────────────────

const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Bounded parts (RFC 5321 lengths) keep the scan linear: unbounded ones cost
// time quadratic in a long answer without @ (60,000 characters took 30 s).
const EMAIL_IN_TEXT = /[^\s@<>()[\]"',;:]{1,64}@[^\s@<>()[\]"',;:]{1,255}\.[^\s@<>()[\]"',;:]{1,63}/g;
// What may stand between two digits of one number: the separator class of the
// national-ID mask (utils/field-encryption THAI_ID_RUN_IN_TEXT) plus a tab.
const SEPARATOR = String.raw`[ \t.\-/,\u2013\u2014\u00A0\u2009]`;
const GLUE = new RegExp(String.raw`\d|${SEPARATOR}`);
// What a mask leaves in the text: a masked national ID, or a phone already replaced. Text masked
// twice can leave two masked IDs sharing a digit, so either end of one may come up short.
const MASKED = /\d?-XXXX-XXXX-X-\d{0,4}|\[เบอร์โทร\]/g;
// Between two digits of a Thai phone number: up to three separators, after a closing bracket or not.
const PHONE_GAP = String.raw`\)?${SEPARATOR}{0,3}`;
// 0X… / (0X) … nationally, 66, +66 or (+66), with an optional (0), internationally: 9 or 10 digits
// in all. Never into a masked national ID: not starting in its tail ("X-0008 081…"), not taking its
// first digit ("…584 / 0-XXXX…"); and never ending on a lone digit, which is the start of the next number.
const PHONE_IN_TEXT = new RegExp(String.raw`(?<![\d+])(?<!\d-XXXX-XXXX-X-)`
    + String.raw`(?:\(?\+?66\)?${SEPARATOR}{0,3}(?:\(0\)${SEPARATOR}{0,3})?\(?\d(?:${PHONE_GAP}\d){7,8}|\(?0${SEPARATOR}{0,3}\d(?:${PHONE_GAP}\d){7,8})`
    + String.raw`(?<!\D\d)(?!\d|-XXXX-XXXX-X-)`, 'g');

/** One side of a masked number: the digits glued to it become [ตัวเลข], separators on the far side stay. */
function sweptSide(block, side) {
    if (!/\d/.test(block)) { return block; }
    if (side === 'before') { return `${block.slice(0, block.search(/\d/))}[ตัวเลข]`; }
    const last = block.length - [...block].reverse().join('').search(/\d/);
    return `[ตัวเลข]${block.slice(last)}`;
}

/**
 * The national-ID mask, here or at write time, takes 13 digits wherever they
 * stand in a longer run, e.g. across a mobile and a landline in a row
 * ("081-234-5678 / 02-123-4567" → "081-234-5-XXXX-XXXX-X-4567"), and the phone
 * pattern then reads the rest of the run from wherever it can start
 * ("…0087 0929995 - 066 4243013" → "…0087 [เบอร์โทร] 4243013"). The digits left
 * glued before or after a masked ID or phone, separators only between, are
 * what remains of those numbers. One pass over the text.
 */
function sweepAroundMasks(text) {
    const masks = [...text.matchAll(MASKED)];
    let out = '';
    let from = 0;
    masks.forEach((mask, k) => {
        const limit = k + 1 < masks.length ? masks[k + 1].index : text.length;
        const end = mask.index + mask[0].length;
        let start = mask.index;
        while (start > from && GLUE.test(text[start - 1])) { start -= 1; }
        let stop = end;
        while (stop < limit && GLUE.test(text[stop])) { stop += 1; }
        out += text.slice(from, start) + sweptSide(text.slice(start, mask.index), 'before') + mask[0] + sweptSide(text.slice(end, stop), 'after');
        from = stop;
    });
    return out + text.slice(from);
}

/**
 * Free text typed by a person (order 49 Q5): identifiers that point at a
 * person or a record are replaced before the text leaves. Thai digits (๐-๙)
 * are read as 0-9 first, so a number typed with them is caught like any other
 * and leaves in Arabic digits. National IDs go first and keep the masked form
 * of order 10: a phone pattern run first could start inside an ID written in
 * groups and leave most of it. Phones go next, then what the two masks left of
 * longer numbers (sweepAroundMasks).
 */
function redactFreeText(text) {
    if (typeof text !== 'string' || text === '') { return text ?? null; }
    const plain = toArabicDigits(text).replace(UUID_IN_TEXT, '[รหัส]').replace(EMAIL_IN_TEXT, '[อีเมล]');
    return sweepAroundMasks(maskThaiIdsInText(plain).replace(PHONE_IN_TEXT, '[เบอร์โทร]'));
}

/**
 * The template a recorded request path was served by, e.g. /api/trace/lot/:lotId;
 * null for a path no template covers. The path itself names a real lot,
 * batch or QR code, so it never leaves.
 */
function routeTemplateOf(path, templates) {
    if (typeof path !== 'string') { return null; }
    const segments = path.split(/[?#]/)[0].split('/').filter(Boolean);
    if (segments[0] !== 'api') { return null; }
    const normalized = ['api', ...segments.slice(segments[1] === 'v1' ? 2 : 1)];
    return templates.find((template) => {
        const parts = template.split('/').filter(Boolean);
        return parts.length === normalized.length
            && parts.every((part, i) => part.startsWith(':') || part === normalized[i]);
    }) ?? null;
}

const bangkokDate = (value) => (value ? getZonedParts(new Date(value)).isoDate : null);

/** name → count, keys in code-point order so a tie hides the same cell on every export. */
function tally(names) {
    const counts = {};
    for (const name of [...names].sort()) { counts[name] = (counts[name] || 0) + 1; }
    return counts;
}

/**
 * Where each survey respondent may be placed in the file (order 49 Q5),
 * counted from the very rows being published, so the file and its counts are
 * one snapshot. Per template, a region with fewer than SMALL_COUNT_THRESHOLD
 * respondents is blanked, and the next-smallest regions with it until the
 * blank regions hold the threshold together (suppressSmallCells, the rule of
 * the survey aggregates). Inside a region still shown, the same for provinces;
 * respondents who gave no province already stand in that blank group.
 * @returns {Map<string, { region: string|null, province: string|null }>} by response id
 */
function publishedGeography(records) {
    const templates = new Map();
    for (const [id, response] of new Map(records.map(r => [r.responseId, r.response]))) {
        if (!templates.has(response.templateId)) { templates.set(response.templateId, []); }
        templates.get(response.templateId).push({ id, region: response.region, province: response.province || null });
    }
    const placed = new Map();
    for (const people of templates.values()) {
        const blankRegions = suppressSmallCells(tally(people.map(p => p.region))).hidden;
        for (const region of new Set(people.map(p => p.region))) {
            const here = people.filter(p => p.region === region);
            if (blankRegions.has(region)) {
                for (const p of here) { placed.set(p.id, { region: null, province: null }); }
                continue;
            }
            const named = here.filter(p => p.province !== null);
            const blankProvinces = suppressSmallCells(tally(named.map(p => p.province)), { blank: here.length - named.length }).hidden;
            for (const p of here) { placed.set(p.id, { region, province: blankProvinces.has(p.province) ? null : p.province }); }
        }
    }
    return placed;
}

const GEOGRAPHY = new Set([PUBLISH.REGION, PUBLISH.PROVINCE]);

async function publishedRows(domain, scope, pseudonym, pageSize) {
    const where = { ...domain.where, ...(scope || {}) };
    const records = await readAll(domain.model, where, selectFor(domain.fields), pageSize);
    const geography = domain.fields.some(f => GEOGRAPHY.has(f.publish)) ? publishedGeography(records) : null;
    const publishers = {
        [PUBLISH.PSEUDONYM]: (v) => pseudonym(v),
        [PUBLISH.ROUTE_TEMPLATE]: (v, f) => routeTemplateOf(v, f.values),
        [PUBLISH.BANGKOK_DATE]: (v) => bangkokDate(v),
        [PUBLISH.FREE_TEXT]: (v) => redactFreeText(v),
        [PUBLISH.FREE_TEXT_LIST]: (v) => (v === null ? null : JSON.stringify(Array.isArray(v) ? v.map(redactFreeText) : v)),
        [PUBLISH.REGION]: (v, f, record) => geography.get(record.responseId).region,
        [PUBLISH.PROVINCE]: (v, f, record) => redactFreeText(geography.get(record.responseId).province),
    };
    return records.map((record) => {
        const row = {};
        for (const field of domain.fields) {
            const value = valueAt(record, field);
            const publish = publishers[field.publish];
            row[field.field] = publish ? publish(value, field, record) : (value instanceof Date ? value.toISOString() : value);
        }
        return row;
    });
}

/**
 * Deletion lists (order 49 Q8). Each reader answers the published row and
 * `goneBy`, the latest moment its source row can have left the export: the
 * deletion date the system keeps, else the row's last write (soft-deleting a
 * batch is its last write), else `at`.
 */
const LIST_READERS = {
    'cultivation-logs/deleted': async (scope, pseudonym, at) => {
        const rows = await withDeletedRows(async () => readAll('CultivationLog',
            { OR: [{ cycle: { isDeleted: true } }, { cycle: { farm: { isDeleted: true } } }], ...(scope || {}) },
            { id: true, createdAt: true, cycle: { select: { deletedAt: true, farm: { select: { isDeleted: true, deletedAt: true } } } } }));
        return rows.map((r) => {
            const deletedAt = r.cycle.farm.isDeleted ? r.cycle.farm.deletedAt : r.cycle.deletedAt;
            return { row: { id: pseudonym(r.id), deletedOn: bangkokDate(deletedAt) }, goneBy: deletedAt || at };
        });
    },
    'survey-responses/withdrawn': async (scope, pseudonym) => {
        const rows = await readAll('SurveyResponse',
            { researchConsentAt: { not: null }, researchConsentWithdrawnAt: { not: null }, ...(scope || {}) },
            { id: true, createdAt: true, researchConsentWithdrawnAt: true });
        return rows.map(r => ({ row: { responseId: pseudonym(r.id), withdrawnOn: bangkokDate(r.researchConsentWithdrawnAt) }, goneBy: r.researchConsentWithdrawnAt }));
    },
    'harvest-batches/deleted': async (scope, pseudonym, at) => {
        const rows = await withDeletedRows(async () => readAll('HarvestBatch',
            { OR: [{ isDeleted: true }, { farm: { isDeleted: true } }, { cycle: { isDeleted: true } }], ...(scope || {}) },
            {
                id: true, createdAt: true, updatedAt: true, isDeleted: true,
                farm: { select: { isDeleted: true, deletedAt: true } }, cycle: { select: { isDeleted: true, deletedAt: true } },
            }));
        return rows.map((r) => {
            const deletedAt = (r.farm.isDeleted && r.farm.deletedAt) || (r.cycle?.isDeleted && r.cycle.deletedAt) || null;
            const farmOrCycleGoneUndated = !deletedAt && (r.farm.isDeleted || r.cycle?.isDeleted);
            const goneBy = deletedAt || (r.isDeleted && !farmOrCycleGoneUndated ? r.updatedAt : at);
            return { row: { id: pseudonym(r.id), deletedOn: bangkokDate(deletedAt) }, goneBy };
        });
    },
};

/**
 * One deletion list: only rows that can have been delivered, i.e. gone on or
 * after the day the domain's basis first came into force (K15/K16 L5). While
 * a farm basis has never been in force the list is empty and nothing is read.
 */
async function listRows(list, scope, pseudonym, at) {
    const since = inForceSince(findDomain(list.domain).basis, at);
    if (!since) { return []; }
    const read = await LIST_READERS[list.key](scope, pseudonym, at);
    return read.filter(r => r.goneBy >= since).map(r => r.row);
}

function findList(key) {
    const list = DATASET_LISTS.find(l => l.key === key);
    if (!list) { throw httpError({ statusCode: 404, code: 'DATASET_LIST_NOT_FOUND', message: `Unknown dataset list: ${key}` }); }
    return list;
}

// ── rendering ──────────────────────────────────────────────────────────────

function toCsv(fields, rows) {
    const cell = (value) => `"${neutralizeCsvFormula(String(value ?? '')).replace(/"/g, '""')}"`;
    const lines = [fields.map(f => cell(f.field)).join(',')];
    for (const row of rows) { lines.push(fields.map(f => cell(row[f.field])).join(',')); }
    // BOM so Thai text opens correctly in Excel
    return `\uFEFF${lines.join('\n')}\n`;
}

function toJsonl(rows) {
    return rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
}

const render = (fields, rows, format) => (format === 'csv' ? toCsv(fields, rows) : toJsonl(rows));

// ── doors ──────────────────────────────────────────────────────────────────

/**
 * One domain as CSV or JSONL, with what its audit row records. `scope` is the
 * caller's organization (shared/application-visibility.organizationScope),
 * applied here as well as by the tenant extension so the export holds with
 * that switch off.
 * @returns {Promise<{ body: string, rows: number, keyFingerprint: string }>}
 */
async function exportDomain(domainKey, format, { scope = null, pageSize = PAGE_SIZE, at = new Date() } = {}) {
    const domain = findDomain(domainKey);
    assertFormat(format);
    const refusal = basisRefusal(domain, at);
    if (refusal) { throw refusal; }
    const { pseudonym, fingerprint } = currentKey();
    const rows = await publishedRows(domain, scope, pseudonym, pageSize);
    logger.info(`[Dataset] export ${domain.key}: ${rows.length} rows as ${format}`);
    return { body: render(domain.fields, rows, format), rows: rows.length, keyFingerprint: fingerprint };
}

/**
 * A deletion list (withdrawn survey responses, deleted harvest batches) under
 * the same pseudonyms the domain was exported with, so the research data
 * store can delete what this system can no longer recall. Never gated by the
 * research basis: deleting is always allowed.
 * @returns {Promise<{ body: string, rows: number, keyFingerprint: string }>}
 */
async function exportList(listKey, format, { scope = null, at = new Date() } = {}) {
    const list = findList(listKey);
    assertFormat(format);
    const { pseudonym, fingerprint } = currentKey();
    const rows = await listRows(list, scope, pseudonym, at);
    logger.info(`[Dataset] list ${list.key}: ${rows.length} rows as ${format}`);
    return { body: render(list.fields, rows, format), rows: rows.length, keyFingerprint: fingerprint };
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function bangkokTimestamp(at) {
    return `${new Date(at.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19)}+07:00`;
}

/**
 * The full set (criteria item 3): every domain whose basis is in force, both
 * deletion lists, the data dictionary and manifest.json, as one ZIP so the
 * manifest describes exactly the bytes delivered with it.
 */
async function exportBundle({ scope = null, at = new Date() } = {}) {
    const { pseudonym, fingerprint } = currentKey();
    const files = [];
    const notExported = [];
    const add = (path, kind, key, format, rows, text) => files.push({ path, kind, key, format, rows, data: Buffer.from(text, 'utf8') });

    for (const domain of DATASET_DOMAINS) {
        const refusal = basisRefusal(domain, at);
        if (refusal) { notExported.push({ key: domain.key, code: refusal.code }); continue; }
        const rows = await publishedRows(domain, scope, pseudonym, PAGE_SIZE);
        for (const format of FORMATS) { add(`${domain.key}.${format}`, 'domain', domain.key, format, rows.length, render(domain.fields, rows, format)); }
    }
    for (const list of DATASET_LISTS) {
        const rows = await listRows(list, scope, pseudonym, at);
        for (const format of FORMATS) { add(`${list.key.replace('/', '-')}.${format}`, 'list', list.key, format, rows.length, render(list.fields, rows, format)); }
    }
    add('data-dictionary.md', 'dictionary', null, 'md', null, generateDataDictionaryMarkdown({ at }));

    const manifest = {
        dataset: 'GACP raw research dataset (สัญญา C05F680149 ภาคผนวก 4 ข้อ 3)',
        recipient: RECIPIENT,
        recipientCustodian: null,
        exportedAt: bangkokTimestamp(at),
        codeRevision: buildInfo().revision,
        pseudonymKeyFingerprint: fingerprint,
        acceptedConsentVersions: [...ACCEPTED_RESEARCH_CONSENT_VERSIONS],
        deletionDuty: WITHDRAWN_DELETION_DUTY,
        researchBasis: Object.fromEntries(Object.values(RESEARCH_BASIS).map((basis) => {
            const { inForce, entry } = researchBasisAt(basis, at);
            return [basis, {
                inForce,
                effectiveFrom: entry ? entry.effectiveFrom : null,
                privacyNoticeVersion: entry ? entry.privacyNoticeVersion || null : null,
                ethicsApproval: entry ? ethicsApprovalOf(entry) : null,
            }];
        })),
        files: files.map(({ path, kind, key, format, rows, data }) => ({ path, kind, key, format, rows, bytes: data.length, sha256: sha256(data) })),
        notExported,
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const entries = [...files.map(f => ({ name: f.path, data: f.data })), { name: 'manifest.json', data: manifestBytes }];
    logger.info(`[Dataset] bundle: ${files.length} files, ${notExported.length} domains not exported`);
    return { zip: zipStore(entries), manifest, manifestSha256: sha256(manifestBytes) };
}

// ── data dictionary ────────────────────────────────────────────────────────

const BASIS_TEXT = {
    [RESEARCH_BASIS.FARM_OPERATION]: 'ข้อมูลการทำงานของผู้ปลูก ส่งออกได้เฉพาะเมื่อมีมติที่มีผลใน `apps/backend/data/datasets/research-use-bases.js` หลังข้อความแจ้งการใช้ข้อมูลเพื่อการวิจัยในนโยบายความเป็นส่วนตัวได้รับอนุมัติและมีผล และมตินั้นระบุหนังสืออนุมัติของคณะกรรมการจริยธรรมการวิจัย (ชื่อคณะกรรมการ เลขที่ และวันที่อนุมัติซึ่งไม่หลังวันมีผล) ถ้าไม่มีหนังสือ ส่งออกไม่ได้แม้ถึงวันมีผลแล้ว',
    [RESEARCH_BASIS.RESEARCH_CONSENT]: 'ส่งออกรายแถว เฉพาะคำตอบที่ผู้ตอบยินยอมเพื่อการวิจัยตามข้อความรุ่นที่ยอมรับและยังไม่ถอน',
    [RESEARCH_BASIS.SURVEY_STRUCTURE]: 'ข้อความที่เจ้าหน้าที่เขียน ไม่มีข้อมูลส่วนบุคคล ส่งออกได้เสมอ',
};

const PUBLISH_TEXT = {
    [PUBLISH.PSEUDONYM]: 'รหัสแฝง',
    [PUBLISH.ROUTE_TEMPLATE]: 'แม่แบบเส้นทาง',
    [PUBLISH.BANGKOK_DATE]: 'วันที่เวลาไทย',
    [PUBLISH.FREE_TEXT]: 'ข้อความอิสระ ปิดเบอร์โทร อีเมล เลขบัตร รหัส',
    [PUBLISH.REGION]: `ค่าว่างเมื่อภาคนั้นมีผู้ตอบน้อยกว่า ${SMALL_COUNT_THRESHOLD} คน รวมถึงภาคที่เล็กถัดไปจนภาคที่เป็นค่าว่างรวมกันได้อย่างน้อย ${SMALL_COUNT_THRESHOLD} คน`,
    [PUBLISH.PROVINCE]: `ค่าว่างเมื่อจังหวัดนั้นมีผู้ตอบน้อยกว่า ${SMALL_COUNT_THRESHOLD} คน รวมถึงจังหวัดที่เล็กถัดไปในภาคเดียวกันจนกลุ่มค่าว่างของภาครวมกันได้อย่างน้อย ${SMALL_COUNT_THRESHOLD} คน และเมื่อภาคเป็นค่าว่าง`,
    [PUBLISH.FREE_TEXT_LIST]: 'JSON array ของข้อความอิสระ แต่ละรายการปิดแบบเดียวกับข้อความอิสระ',
};

const cellText = (text) => String(text ?? '').replace(/\|/g, '\\|');

function basisStatusLine(basis, at) {
    if (basis !== RESEARCH_BASIS.FARM_OPERATION) { return 'ส่งออกได้'; }
    const { inForce, entry } = researchBasisAt(basis, at);
    if (!inForce) { return 'ยังส่งออกไม่ได้ (ประตูส่งออกตอบ 403 `DATASET_RESEARCH_BASIS_NOT_IN_FORCE`)'; }
    const approval = ethicsApprovalOf(entry);
    return `ส่งออกได้ ตามมติที่มีผลตั้งแต่ ${entry.effectiveFrom} (ข้อความแจ้งรุ่น ${entry.privacyNoticeVersion} · `
        + `หนังสืออนุมัติของ${approval.committee} เลขที่ ${approval.reference} ลงวันที่ ${approval.approvedOn})`;
}

/**
 * คู่มือการใช้ชุดข้อมูล (Data Dictionary) — generated from the SAME registry
 * the exports use. Carries no generation date, so regenerating an unchanged
 * registry gives the same bytes (criterion K2).
 */
function generateDataDictionaryMarkdown({ at = new Date() } = {}) {
    const L = [];
    L.push('# คู่มือการใช้ชุดข้อมูลดิบ (Data Dictionary) สัญญา C05F680149');
    L.push('');
    L.push('> สร้างอัตโนมัติจาก `apps/backend/data/datasets/dataset-domains.js` ด้วย `node apps/backend/scripts/generate-data-dictionary.js` ห้ามแก้ไฟล์นี้ด้วยมือ');
    L.push('');
    L.push(`ชุดข้อมูลดิบตามภาคผนวก 4 ข้อ 3 สำหรับส่งเข้า${RECIPIENT} เป็นข้อมูลปฏิบัติการที่ยังไม่ผ่านการวิเคราะห์ (นิยามภาคผนวก 1 ข้อ 11)`);
    L.push('ทุกไฟล์เป็นข้อมูลแฝงตัวตน ไม่มีชื่อ เลขบัตรประชาชน อีเมล เบอร์โทร หรือรหัสบัญชีผู้ใช้ และทุกช่องรหัสเป็นรหัสแฝง');
    L.push(`ชุดข้อมูลนี้มี ${DATASET_DOMAINS.length} โดเมน และรายการลบ ${DATASET_LISTS.length} รายการ`);
    L.push('');
    L.push('## รูปแบบการส่งมอบ');
    L.push('');
    L.push('- ชุดเต็ม: `GET /api/datasets/bundle` ได้ไฟล์ ZIP หนึ่งไฟล์ มีไฟล์ CSV และ JSONL ของทุกโดเมนที่ส่งออกได้ รายการลบทั้งสอง คู่มือนี้ และ `manifest.json`');
    L.push('- รายโดเมน: `GET /api/datasets/{domain}/export?format=csv|jsonl`');
    L.push(`- รายการลบ: ${DATASET_LISTS.map(l => `\`GET /api/datasets/${l.key}?format=csv|jsonl\``).join(' ')}`);
    L.push('- แคตตาล็อก `GET /api/datasets` และคู่มือ `GET /api/datasets/dictionary` เปิดได้ทุกบทบาทเจ้าหน้าที่ ส่วนการส่งออกทุกแบบเป็นของ `system_admin_dtam` ในองค์กรของตัวเองเท่านั้น และบันทึก audit ทุกครั้ง');
    L.push('- CSV เป็น UTF-8 มี BOM (เปิดใน Excel ได้ภาษาไทยถูก) ทุกช่องอยู่ในเครื่องหมายคำพูด ค่าที่ขึ้นต้นด้วย `=` `+` `-` `@` ถูกนำหน้าด้วย `\'` กันสูตร JSONL เป็น JSON หนึ่งแถวต่อหนึ่งบรรทัด คอลัมน์ชุดเดียวกันลำดับเดียวกับหัว CSV');
    L.push('- แถวเรียงตาม [เวลาสร้างรายการ, รหัสจริง] จึงส่งออกซ้ำจากข้อมูลเดิมด้วยกุญแจเดิมได้ไฟล์เดิมทุกไบต์');
    L.push('- ทุกช่องเวลาออกเป็นวันที่ YYYY-MM-DD ตามปฏิทินเวลาไทย ไม่มีเวลาของวัน เพราะเวลาของวันจับคู่กับเวลาใช้งานหรือเวลาสแกนของคนได้ ค่าว่าง = ไม่ได้บันทึก หรือถูกปิดตามที่ระบุในช่องนั้น boolean = true/false');
    L.push('');
    L.push('## ฐานการใช้ข้อมูลเพื่อการวิจัย');
    L.push('');
    for (const basis of Object.values(RESEARCH_BASIS)) {
        L.push(`- \`${basis}\`: ${BASIS_TEXT[basis]} สถานะตามโค้ดนี้: ${basisStatusLine(basis, at)}`);
    }
    L.push('');
    L.push('## รหัสแฝง');
    L.push('');
    L.push('- รหัสแฝง = HMAC-SHA256 ของรหัสจริงด้วยกุญแจเฉพาะของชุดข้อมูลนี้ (`DATASET_PSEUDONYM_KEY` แยกจากกุญแจอื่นของระบบ) ตัดเหลือ 32 ตัวอักษรฐานสิบหก');
    L.push('- รหัสจริงเดียวกันได้รหัสแฝงเดียวกันทุกโดเมนและทุกครั้งที่ส่งออกด้วยกุญแจเดียวกัน จึงเชื่อมตารางได้ตามคอลัมน์ "เชื่อมกับ" แต่ย้อนกลับเป็นรหัสจริงไม่ได้หากไม่มีกุญแจ');
    L.push('- `manifest.json` ระบุลายนิ้วมือของกุญแจ (`pseudonymKeyFingerprint` ไม่ใช่ตัวกุญแจ) ใช้กุญแจเดียวตลอดโครงการ เปลี่ยนเฉพาะเมื่อกุญแจรั่ว เมื่อลายนิ้วมือเปลี่ยน ผู้รับต้องลบชุดเก่าทั้งหมดแล้วรับชุดเต็มใหม่ และห้ามใช้รายการลบข้ามรุ่นกุญแจ');
    L.push('');
    L.push('## ความยินยอมและรายการลบ');
    L.push('');
    L.push(`- คำตอบแบบสำรวจส่งออกเฉพาะที่ยินยอมตามข้อความรุ่น ${ACCEPTED_RESEARCH_CONSENT_VERSIONS.map(v => `\`${v}\``).join(', ')} และยังไม่ถอน คำตอบที่ยินยอมกับข้อความรุ่นอื่นไม่ส่งออก`);
    L.push('- การลบบัญชีตามสิทธิ์ PDPA นับเป็นการถอนความยินยอม (ข้อความยินยอมเก็บรหัสบัญชีไว้เพื่อลบหรือถอนคำตอบตามคำขอของผู้ตอบ) คำตอบของบัญชีที่ถูกลบจึงไม่ถูกส่งออกอีกและอยู่ในรายการคำตอบที่ถอน');
    L.push('- ข้อมูลที่ส่งไปแล้วระบบนี้เรียกคืนเองไม่ได้ ผู้รับต้องรับรายการลบทุกครั้งที่รับชุดใหม่ แล้วลบแถวที่มีรหัสแฝงตรงกันออกจากคลังทั้งหมด');
    L.push(`- ${WITHDRAWN_DELETION_DUTY}`);
    L.push('- รายการลบของข้อมูลฟาร์มมีเฉพาะแถวที่อาจส่งออกไปแล้ว คือถูกลบในหรือหลังวันที่ฐานการใช้ข้อมูลฟาร์มเริ่มมีผลครั้งแรก ระหว่างที่ฐานนั้นยังไม่เคยมีผล รายการเป็นไฟล์ว่าง แถวที่ไม่เคยออกจากระบบจึงไม่ถูกเปิดเผยแม้เป็นรหัสแฝง');
    L.push('');
    L.push('## ข้อความอิสระ');
    L.push('');
    L.push('- ช่องที่ระบุว่าเป็นข้อความอิสระ: ตัวเลขไทย (๐-๙) ถูกอ่านเป็นเลขอารบิกก่อนตรวจและออกเป็นเลขอารบิก อีเมลเปลี่ยนเป็น `[อีเมล]` รหัสรูปแบบ UUID เปลี่ยนเป็น `[รหัส]` และเลขบัตร 13 หลักเหลือหลักแรกกับ 4 หลักท้าย (`1-XXXX-XXXX-X-0008`)');
    L.push('- เบอร์โทรไทยเปลี่ยนเป็น `[เบอร์โทร]` ทั้งเบอร์มือถือและเบอร์บ้าน ขึ้นต้นด้วย 0, 66, +66 หรือ (+66) คั่นช่วงละไม่เกินสามตัวด้วยช่องว่าง - . / , หรือขีดยาว หรือมีวงเล็บรอบรหัสพื้นที่ เช่น `(02) 123-4567` ตัวเลขอื่นที่หน้าตาเหมือนเบอร์โทร (เช่นวันที่ติดกับเวลา) อาจถูกปิดด้วย');
    L.push('- เลขบัตรถูกปิดก่อนเบอร์โทร ตัวเลขที่ยังติดอยู่หน้าหรือท้ายเลขบัตรหรือเบอร์โทรที่ปิดแล้ว โดยมีแค่ตัวคั่นขวาง (เศษของเบอร์โทรที่พิมพ์ติดกันจนอ่านเป็นเลข 13 หลัก) เปลี่ยนเป็น `[ตัวเลข]` ตัวเลขที่ติดกับเบอร์โทรจริง ๆ เช่น "โทร 081-234-5678, 2 ครั้ง" จึงถูกปิดไปด้วย');
    L.push('- ไม่ตรวจชื่อคนที่พิมพ์เอง ผู้ใช้ชุดข้อมูลต้องไม่พยายามระบุตัวบุคคลจากข้อความ');
    L.push('');

    for (const domain of DATASET_DOMAINS) {
        L.push(`## ${domain.thaiName} (\`${domain.key}\`)`);
        L.push('');
        L.push(domain.description);
        L.push('');
        L.push(`- หนึ่งแถว = ${domain.rowMeaning}`);
        L.push(`- ตารางต้นทาง: ${(domain.sourceModels || [domain.model]).map(m => `\`${m}\``).join(', ')}`);
        L.push(`- ฐานการใช้ข้อมูล: \`${domain.basis}\` (${basisStatusLine(domain.basis, at)})`);
        const lists = DATASET_LISTS.filter(l => l.domain === domain.key);
        if (lists.length) { L.push(`- รายการลบ: ${lists.map(l => `\`${l.key}\``).join(', ')}`); }
        L.push('');
        L.push('| คอลัมน์ | ความหมาย | หน่วยนับ | ค่าที่เป็นไปได้ | เชื่อมกับ | การปกปิด | รายละเอียด |');
        L.push('|---|---|---|---|---|---|---|');
        for (const f of domain.fields) {
            const values = f.values ? f.values.map(v => `\`${v}\``).join(', ') : (f.publish === PUBLISH.FREE_TEXT ? 'ข้อความตามที่ผู้บันทึกส่ง ระบบไม่จำกัดค่า' : '');
            L.push(`| \`${f.field}\` | ${cellText(f.thaiName)} | ${cellText(f.unit ?? '')} | ${cellText(values)} | ${f.joins ? `\`${f.joins}\`` : ''} | ${PUBLISH_TEXT[f.publish] || ''} | ${cellText(f.description)} |`);
        }
        L.push('');
    }

    L.push('## รายการลบ');
    L.push('');
    for (const list of DATASET_LISTS) {
        L.push(`### ${list.thaiName} (\`${list.key}\`)`);
        L.push('');
        L.push(list.description);
        L.push('');
        L.push('| คอลัมน์ | ความหมาย | หน่วยนับ | รายละเอียด |');
        L.push('|---|---|---|---|');
        for (const f of list.fields) {
            L.push(`| \`${f.field}\` | ${cellText(f.thaiName)} | ${cellText(f.unit ?? '')} | ${cellText(f.description)} |`);
        }
        L.push('');
    }

    L.push('## ไม่ได้ส่งออกอะไร และเพราะอะไร');
    L.push('');
    L.push('ทุกคอลัมน์ของตารางต้นทางอยู่ในตารางโดเมนข้างบน หรืออยู่ในรายการนี้พร้อมเหตุผล ตัวตรวจ `apps/backend/scripts/datasets/check-dataset.js` (K4) ไม่ผ่านเมื่อมีคอลัมน์ใหม่ที่ยังไม่ถูกตัดสิน');
    L.push('');
    L.push('| โดเมน | คอลัมน์ต้นทาง | เหตุผลที่ไม่ส่งออก |');
    L.push('|---|---|---|');
    for (const domain of DATASET_DOMAINS) {
        for (const w of domain.withheld) { L.push(`| \`${domain.key}\` | \`${w.column}\` | ${cellText(w.reason)} |`); }
    }
    L.push('');
    L.push('ตารางที่ไม่ส่งออกทั้งตาราง: ข้อมูลผู้ใช้และบริษัท (ชื่อ เลขบัตร ที่อยู่ ติดต่อ) ฟาร์มและแปลง (ชื่อ ที่อยู่ พิกัด) คำขอใบรับรอง เอกสารแนบ รูปภาพ การเงิน และบทสัมภาษณ์ผู้เชี่ยวชาญ');
    L.push('');
    L.push('## manifest.json');
    L.push('');
    L.push('- `exportedAt` เวลาส่งออก (เวลาไทย) · `codeRevision` sha ของโค้ดที่ส่งออก (ค่าว่างเมื่อรันนอก image ที่ build) · `pseudonymKeyFingerprint` ลายนิ้วมือกุญแจ · `acceptedConsentVersions` รุ่นข้อความยินยอมที่ยอมรับ · `deletionDuty` หน้าที่ลบรายการถอนของผู้รับ (ประโยคเดียวกับหัวข้อความยินยอมและรายการลบ) · `researchBasis` สถานะฐานการใช้ข้อมูลแต่ละแบบ พร้อมวันมีผล รุ่นข้อความแจ้ง และหนังสืออนุมัติของคณะกรรมการจริยธรรมการวิจัย (`ethicsApproval` มี `committee` `reference` `approvedOn` เป็นค่าว่างเมื่อไม่มีหนังสือครบ)');
    L.push('- `files` ต่อไฟล์: `path`, `kind` (domain/list/dictionary), `key`, `format`, `rows` (จำนวนแถวข้อมูล ไม่นับหัว CSV), `bytes`, `sha256` · `notExported` โดเมนที่ไม่ได้ส่งออกพร้อมรหัสเหตุผล');
    L.push(`- \`recipient\` = ${RECIPIENT} · \`recipientCustodian\` ว่างไว้จนกว่า operator ระบุผู้ดูแลคลัง`);
    L.push('');
    L.push('## ขีดจำกัด');
    L.push('');
    L.push('- ไฟล์ทั้งไฟล์ (หรือทั้งชุด) ถูกสร้างในหน่วยความจำก่อนส่ง พอสำหรับขนาด pilot ก่อนข้อมูลโตระดับหลายแสนแถวต่อโดเมนต้องเปลี่ยนเป็นส่งแบบ stream');
    L.push('- การอ่านแต่ละโดเมนไม่ได้อยู่ใน snapshot เดียวกัน ถ้ามีการเขียนระหว่างสร้างชุดเต็ม ไฟล์ต่างโดเมนอาจต่างเวลากันไม่กี่วินาที manifest บอกจำนวนแถวและ sha256 ของสิ่งที่ส่งจริง');
    return `${L.join('\n')}\n`;
}

module.exports = {
    PAGE_SIZE,
    pseudonymiserFor,
    keyFingerprint,
    researchBasisAt,
    redactFreeText,
    routeTemplateOf,
    listDomains,
    exportDomain,
    exportList,
    exportBundle,
    generateDataDictionaryMarkdown,
};
