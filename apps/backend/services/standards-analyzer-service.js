'use strict';

/**
 * Standards Analyzer Service — สัญญา C05F680149 ต้นแบบที่ 1
 * "ระบบวิเคราะห์มาตรฐาน GACP (3 ระบบ)": WHO (1.1) · ไทย (1.2) · ASEAN (1.3)
 *
 * One registry drives both screens (data/standards/gacp-requirement-comparison.js):
 *   - getComparison(): every topic side by side across the three standards, each cell
 *     cited to the clause it came from, with the gap a Thai-certified farm must close
 *     to meet WHO or ASEAN.
 *   - analyzeApplication(): one application against one standard, topic by topic,
 *     MET / NOT_MET / NEEDS_REVIEW from the application's real signals (the precedence is
 *     documented in .claude/skills/gacp-standards-requirements/SKILL.md).
 *
 * The engine never invents compliance. Errors carry .statusCode/.code at the throw site.
 */

const logger = require('../shared/logger');
const { normalizeRole, CANONICAL_ROLES } = require('../shared/canonical-rbac');
const { neutralizeCsvFormula } = require('../shared/csv-utils');
const { SOURCES, LEVEL, BASELINE_CODE, STANDARDS, TOPICS } = require('../data/standards/gacp-requirement-comparison');
const { ASEAN_COMPARISON } = require('../data/standards/asean-gacp-comparison');
const { getCanonicalSlotId } = require('../routes/api/applications/validation-slot-utils');
const { growsOnlyWithoutSoil } = require('@gacp/validation/growing-medium');

const STATUS = Object.freeze({
    MET: 'MET',
    NOT_MET: 'NOT_MET',
    NEEDS_REVIEW: 'NEEDS_REVIEW',
});

/**
 * How a WHO or ASEAN clause stands against the Thai baseline. ADD counts only what the
 * other standard words as binding (extraRequired); a should-level difference is RECOMMENDS.
 */
const GAP = Object.freeze({
    THAI_COVERS: 'THAI_COVERS',
    ADD: 'ADD',
    RECOMMENDS: 'RECOMMENDS',
    NOT_IN_STANDARD: 'NOT_IN_STANDARD',
});

// Workflow states that mean the onsite auditor has already verified the farm.
const ONSITE_VERIFIED_STATES = new Set(['AUDIT_PASSED', 'APPROVED', 'CERTIFIED']);

const STANDARD_BY_CODE = new Map(STANDARDS.map((standard) => [standard.code, standard]));

function httpError(statusCode, code, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    return err;
}

/**
 * `application_documents.documentType` is the canonical slot id as of the day the row was
 * written, so a renamed slot has two spellings in the wild. Both sides of the compare go
 * through the one canonicaliser; the raw string is kept so the evidence line names the row
 * that is really on file.
 */
function indexDocuments(documentTypes) {
    const index = new Map();
    (documentTypes || []).forEach((raw) => {
        const named = String(raw || '').toUpperCase();
        if (!named) { return; }
        const canonical = getCanonicalSlotId(named).toUpperCase();
        index.set(canonical, [...(index.get(canonical) || []), named]);
    });
    return index;
}

function uploadedFor(slots, index) {
    return [...new Set((slots || []).flatMap((slot) => index.get(getCanonicalSlotId(slot).toUpperCase()) || []))];
}

/**
 * Resolve a dot path against canonical formData. `plots[].x` means "any array
 * element at `plots` has a non-empty x". Returns the first non-empty hit or undefined.
 */
function getFormSignal(formData, path) {
    if (!formData || typeof formData !== 'object') { return undefined; }
    const arrayMatch = path.match(/^([^[]+)\[\]\.(.+)$/);
    if (arrayMatch) {
        const list = formData[arrayMatch[1]];
        if (!Array.isArray(list)) { return undefined; }
        for (const item of list) {
            const hit = getFormSignal(item, arrayMatch[2]);
            if (hit !== undefined) { return hit; }
        }
        return undefined;
    }
    let node = formData;
    for (const segment of path.split('.')) {
        if (node === null || node === undefined || typeof node !== 'object') { return undefined; }
        node = node[segment];
    }
    return isEmptyValue(node) ? undefined : node;
}

const EMPTY_CHECK_MAX_DEPTH = 8;

function isEmptyValue(node, depth = 0) {
    if (node === undefined || node === null) { return true; }
    if (typeof node === 'string') { return node.trim() === ''; }
    if (typeof node !== 'object') { return false; }
    if (depth >= EMPTY_CHECK_MAX_DEPTH) { return false; }
    const members = Array.isArray(node) ? node : Object.values(node);
    return members.every((member) => isEmptyValue(member, depth + 1));
}

/** The topic as one standard states it: the clause, its level and where it was read. */
function requirementOf(topic, standardCode) {
    const clause = topic.clauses[standardCode];
    const source = SOURCES[clause.sourceId];
    return {
        id: topic.id,
        title: topic.title,
        ref: clause.ref,
        text: clause.text,
        level: clause.level,
        isRequired: clause.level === LEVEL.REQUIRED,
        source: { id: source.id, title: source.title, url: source.url },
    };
}

function hasSubmissionChannel(signals) {
    return [signals.docs, signals.docsSecondary, signals.form].some((list) => (list || []).length > 0);
}

/** Evaluate one topic of one standard against the application's signals. Pure. */
function evaluateTopic(topic, standardCode, context) {
    const base = requirementOf(topic, standardCode);
    const clause = topic.clauses[standardCode];
    const signals = topic.signals || {};
    const { documentTypes, formData, status } = context;
    const verdict = (verdictStatus, evidence, recommendation = null) => ({
        ...base, status: verdictStatus, evidence, recommendation,
    });
    const metUnlessExtraRequired = (evidence) => (clause.extraRequired
        ? verdict(
            STATUS.NEEDS_REVIEW,
            `${evidence} · ข้อนี้ของ ${STANDARD_BY_CODE.get(standardCode).name} มีสิ่งที่ต้องทำเพิ่มจากมาตรฐานไทย ซึ่งยังไม่มีหลักฐานในคำขอ: ${clause.extraRequired}`,
            signals.recommendation || null,
        )
        : verdict(STATUS.MET, evidence));

    // Order 159 soil follow-up 2: no fourth verdict; the expert decides with the other pending cells.
    if (signals.soillessIndoor && growsOnlyWithoutSoil(formData?.farmData)) {
        return verdict(STATUS.NEEDS_REVIEW, signals.soillessIndoor);
    }

    const index = indexDocuments(documentTypes);
    const primary = uploadedFor(signals.docs, index);
    if (primary.length > 0) {
        return metUnlessExtraRequired(`พบเอกสารหลักฐานในคำขอ: ${primary.join(', ')}`);
    }

    if (signals.certifiedStates && ONSITE_VERIFIED_STATES.has(status)) {
        return metUnlessExtraRequired(`ผ่านการตรวจประเมิน ณ แปลงแล้ว (สถานะคำขอ: ${status}) ผู้ตรวจยืนยันหัวข้อนี้ที่แปลงตามเกณฑ์ไทย`);
    }

    const secondary = uploadedFor(signals.docsSecondary, index);
    const formHits = (signals.form || []).filter((path) => getFormSignal(formData, path) !== undefined);
    if (secondary.length > 0 || formHits.length > 0) {
        const parts = [];
        if (secondary.length > 0) { parts.push(`เอกสารประกอบ: ${secondary.join(', ')}`); }
        if (formHits.length > 0) { parts.push(`ข้อมูลที่กรอกในคำขอ: ${formHits.join(', ')}`); }
        return verdict(
            STATUS.NEEDS_REVIEW,
            `พบหลักฐานบางส่วน (${parts.join(' · ')}) ยังต้องให้ผู้ตรวจยืนยัน`,
            signals.recommendation || null,
        );
    }

    if (signals.manual) {
        return verdict(STATUS.NEEDS_REVIEW, signals.manual, signals.recommendation || null);
    }

    if (!hasSubmissionChannel(signals)) {
        return verdict(
            STATUS.NEEDS_REVIEW,
            'หัวข้อนี้ยืนยันด้วยการตรวจประเมิน ณ แปลง แบบคำขอไม่มีช่องให้ยื่นหลักฐานเรื่องนี้ และคำขอยังไม่ถึงขั้นตอนตรวจประเมิน',
            signals.recommendation || null,
        );
    }

    return verdict(STATUS.NOT_MET, 'ยังไม่พบหลักฐานสำหรับหัวข้อนี้ในคำขอ ผู้ยื่นคำขอแนบเอกสารหรือกรอกข้อมูลเรื่องนี้เพิ่มได้', signals.recommendation || null);
}

function standardOr404(standardCode) {
    const code = String(standardCode || '').trim().toUpperCase();
    const standard = STANDARD_BY_CODE.get(code);
    if (!standard) {
        throw httpError(404, 'STANDARD_NOT_FOUND', `Unknown certification standard: ${code}`);
    }
    return standard;
}

function describeStandard(standard) {
    return {
        code: standard.code,
        name: standard.name,
        fullName: standard.fullName,
        scopeNote: standard.scopeNote,
        sources: standard.sourceIds.map((id) => SOURCES[id]),
    };
}

/**
 * Analyze one application against one standard.
 *
 * A HEALTH actor reads within its holder scope; without one, only the filer may read, and a
 * non-owner gets the same 404 as not-found so it cannot learn that an application id exists.
 */
async function analyzeApplication(applicationId, standardCode, { actor, holderScope = null, organizationWhere = null } = {}) {
    const standard = standardOr404(standardCode);

    const { prisma } = require('./prisma-database');
    const application = await prisma.application.findFirst({
        where: {
            id: applicationId,
            isDeleted: false,
            ...require('./holder-access').holderReadWhereIfScoped(holderScope, 'Application'),
            ...(organizationWhere || {}),
        },
        include: { documents: true },
    });
    if (!application) {
        throw httpError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
    }

    const actorRole = normalizeRole(actor?.canonicalRole || actor?.role);
    if (actorRole === CANONICAL_ROLES.HEALTH && !holderScope && application.healthId !== actor?.canonicalId) {
        throw httpError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
    }

    const result = analyzeRecord(standard.code, application);
    const { summary } = result;
    logger.info(
        `[StandardsAnalyzer] ${standard.code} × ${applicationId}: ` +
        `${summary.met} MET / ${summary.notMet} NOT_MET / ${summary.needsReview} NEEDS_REVIEW`,
    );
    return result;
}

function analyzeRecord(standardCode, application) {
    const standard = standardOr404(standardCode);
    const context = {
        documentTypes: (application.documents || [])
            .map((doc) => String(doc.documentType || '').toUpperCase())
            .filter(Boolean),
        formData: application.formData || {},
        status: application.status,
    };

    const requirements = TOPICS
        .filter((topic) => topic.clauses[standard.code].level !== LEVEL.ABSENT)
        .map((topic) => evaluateTopic(topic, standard.code, context));

    const count = (wanted) => requirements.filter((r) => r.status === wanted).length;
    const met = count(STATUS.MET);
    const required = requirements.filter((r) => r.isRequired);

    return {
        standard: describeStandard(standard),
        application: {
            id: application.id,
            applicationNumber: application.applicationNumber || null,
            status: application.status,
        },
        requirements,
        summary: {
            total: requirements.length,
            met,
            notMet: count(STATUS.NOT_MET),
            needsReview: count(STATUS.NEEDS_REVIEW),
            requiredTotal: required.length,
            requiredMet: required.filter((r) => r.status === STATUS.MET).length,
            readinessPct: requirements.length === 0 ? 0 : Math.round((met / requirements.length) * 100),
        },
        analyzedAt: new Date().toISOString(),
    };
}

/** How one WHO or ASEAN clause stands against the Thai baseline. */
function gapAgainstBaseline(clause) {
    if (clause.level === LEVEL.ABSENT) { return GAP.NOT_IN_STANDARD; }
    if (clause.extraRequired) { return GAP.ADD; }
    if (clause.extraRecommended) { return GAP.RECOMMENDS; }
    return GAP.THAI_COVERS;
}

/** The three standards side by side, topic by topic, with the gap per topic. */
function getComparison() {
    const topics = TOPICS.map((topic) => ({
        id: topic.id,
        title: topic.title,
        cells: STANDARDS.map((standard) => {
            const clause = topic.clauses[standard.code];
            return {
                standardCode: standard.code,
                level: clause.level,
                ref: clause.ref,
                text: clause.text,
                sourceId: clause.sourceId,
                gap: standard.code === BASELINE_CODE ? null : gapAgainstBaseline(clause),
                extraRequired: clause.extraRequired || null,
                extraRecommended: clause.extraRecommended || null,
            };
        }),
    }));
    const summary = Object.fromEntries(STANDARDS.filter((s) => s.code !== BASELINE_CODE).map((standard) => {
        const gaps = topics.map((topic) => topic.cells.find((cell) => cell.standardCode === standard.code).gap);
        return [standard.code, {
            topics: gaps.length,
            add: gaps.filter((gap) => gap === GAP.ADD).length,
            recommends: gaps.filter((gap) => gap === GAP.RECOMMENDS).length,
            thaiCovers: gaps.filter((gap) => gap === GAP.THAI_COVERS).length,
            notInStandard: gaps.filter((gap) => gap === GAP.NOT_IN_STANDARD).length,
        }];
    }));
    return {
        baseline: BASELINE_CODE,
        standards: STANDARDS.map(describeStandard),
        sources: Object.values(SOURCES),
        topics,
        summary,
    };
}

const LEVEL_TH = Object.freeze({ REQUIRED: 'ข้อกำหนด', RECOMMENDED: 'ข้อแนะนำ', ABSENT: 'ไม่มีข้อในเรื่องนี้' });
const GAP_TH = Object.freeze({
    THAI_COVERS: 'มาตรฐานไทยครอบคลุมแล้ว', ADD: 'ต้องทำเพิ่ม', RECOMMENDS: 'แนะนำให้ทำเพิ่ม', NOT_IN_STANDARD: 'มาตรฐานนี้ไม่กำหนด',
});

/** The comparison as a CSV a spreadsheet opens in Thai: one row per topic per standard. */
function comparisonCsv() {
    const comparison = getComparison();
    const header = [
        'หัวข้อ', 'มาตรฐาน', 'ระดับ', 'ข้อที่อ้าง', 'สาระของข้อกำหนด', 'เทียบกับมาตรฐานไทย',
        'สิ่งที่ต้องทำเพิ่ม', 'สิ่งที่แนะนำให้ทำเพิ่ม', 'แหล่งอ้างอิง', 'URL',
    ];
    const rows = comparison.topics.flatMap((topic) => topic.cells.map((cell) => {
        const source = SOURCES[cell.sourceId];
        return [
            topic.title,
            STANDARD_BY_CODE.get(cell.standardCode).name,
            LEVEL_TH[cell.level],
            cell.ref,
            cell.text,
            cell.gap ? GAP_TH[cell.gap] : 'ฐานเทียบ',
            cell.extraRequired || '',
            cell.extraRecommended || '',
            source.title,
            source.url,
        ];
    }));
    const quote = (value) => `"${neutralizeCsvFormula(String(value)).replace(/"/g, '""')}"`;
    return `\uFEFF${[header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;
}

/** ต้นแบบ 1.3 — ตารางเปรียบเทียบ 10 ประเทศอาเซียน (ฉบับร่าง ยังไม่ได้ตรวจกับแหล่งทางการรายแถว) */
function getAseanComparison() {
    return ASEAN_COMPARISON;
}

module.exports = {
    analyzeApplication,
    analyzeRecord,
    evaluateTopic,
    getComparison,
    comparisonCsv,
    getAseanComparison,
    STATUS,
    GAP,
};
