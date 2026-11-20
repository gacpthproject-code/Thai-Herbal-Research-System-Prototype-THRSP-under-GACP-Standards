'use strict';

/**
 * Survey Service — สัญญา C05F680149 ต้นแบบที่ 2 "ระบบสำรวจความต้องการ (1 ชุด)"
 * (2.1 แบบสอบถามดิจิทัล 4 ภาค · 2.2 ระบบบันทึกการสัมภาษณ์ผู้เชี่ยวชาญ)
 * + ต้นแบบที่ 3.1 text-mining เบื้องต้นบนคำตอบปลายเปิด.
 *
 * ERP document semantics (mirrors quotation-service):
 *   - SurveyTemplate: master document; status machine DRAFT→ACTIVE→CLOSED with
 *     frozen enum + per-transition Set guard + typed err.code + idempotent
 *     no-op on same-state repeats.
 *   - SurveyResponse: POSTED document — created in one $transaction with its
 *     answer lines and the research consent it was given under (order 34(5)).
 *     Answers are never edited; the only later write is PDPA anonymisation
 *     (account erasure or consent withdrawal, anonymiseResponsesOfUser).
 *   - PII invariant: free-text answers / transcripts / key insights pass
 *     maskThaiIdsInText before persist; actor linkage is User.id (UUID) only.
 *   - Tenancy: models are in TENANT_SCOPED_MODELS — organizationId auto-injects
 *     from request context (ADR-014); this service never sets it manually.
 * Errors carry .statusCode/.code at the throw site (sendServiceError-safe).
 */

const crypto = require('crypto');
const { z } = require('zod');
const { prisma } = require('./prisma-database');
const logger = require('../shared/logger');
const { maskThaiIdsInText } = require('../utils/field-encryption');
const { toArabicDigits } = require('../shared/thai-digits');
const { neutralizeCsvFormula } = require('../shared/csv-utils');
const { extractThaiKeywords } = require('../utils/thai-keywords');
const { RESEARCH_CONSENT_NOTICE } = require('../shared/research-consent-notice');
const { getZonedParts } = require('../utils/working-days');
const { SMALL_COUNT_THRESHOLD, suppressSmallCells } = require('../shared/small-cell-suppression');
const { withDeletedRows } = require('./soft-delete-context');
const { tryGetSecret } = require('../config/secrets');
const { CANONICAL_ROLES, ROLE_AFFILIATIONS, normalizeRole, roleAffiliation } = require('../shared/canonical-rbac');

const TEMPLATE_STATUS = Object.freeze({
    DRAFT: 'DRAFT',
    ACTIVE: 'ACTIVE',
    CLOSED: 'CLOSED',
});

const { REGIONS, TARGET_GROUPS, QUESTION_TYPES } = require('../shared/survey-vocabulary');
const CHOICE_TYPES = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE']);

/**
 * National IDs typed in Arabic or Thai digits, masked before they are stored
 * (notice research-survey-notice-th-v3 promises it). maskThaiIdsInText reads
 * Arabic digits only, so the text is read through toArabicDigits; text with no
 * ID keeps its Thai digits.
 */
function maskTypedIds(text) {
    const arabic = toArabicDigits(text);
    const masked = maskThaiIdsInText(arabic);
    return masked === arabic ? text : masked;
}

function httpError(statusCode, code, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    return err;
}

/** What replaces a respondent's own words once they erase their account or withdraw consent. */
const REDACTED_TEXT = '[ลบตามคำขอของเจ้าของข้อมูล]';
const FREE_TEXT_TYPES = ['TEXT', 'TEXTAREA'];

/**
 * Who may answer a template of each target group through the respondent door.
 * A group with no rule (EXPERT, OPERATOR) is answered by nobody there: experts
 * are interviewed (createInterview) and no role stands for "operator".
 */
const RESPONDENT_RULES = Object.freeze({
    FARMER: (actor) => normalizeRole(actor.role) === CANONICAL_ROLES.HEALTH,
    DTAM_STAFF: (actor, template) => roleAffiliation(actor.role) === ROLE_AFFILIATIONS.CERTIFICATION_BODY
        && Boolean(actor.organizationId) && actor.organizationId === template.organizationId,
});

function _mayAnswer(actor, template) {
    const rule = RESPONDENT_RULES[template.targetGroup];
    return Boolean(actor?.id && rule && rule(actor, template));
}

const RESPONDENT_MARKER_CONTEXT = 'gacp:survey-respondent:v1';

/**
 * The current marker key first, then every retired one. Its own secret, so
 * rotating HMAC_KEY or DATASET_PSEUDONYM_KEY never lets an account answer
 * again or hides its old markers from erasure. Read per call, never cached.
 */
function _respondentKeys() {
    const current = tryGetSecret('SURVEY_RESPONDENT_KEY');
    if (!current) {
        throw httpError(503, 'SURVEY_RESPONDENT_KEY_UNAVAILABLE', 'No key for survey respondent markers; set SURVEY_RESPONDENT_KEY');
    }
    const shared = ['HMAC_KEY', 'DATASET_PSEUDONYM_KEY'].map(name => (tryGetSecret(name) || '').trim()).filter(Boolean);
    if (shared.includes(current.trim())) {
        throw httpError(503, 'SURVEY_RESPONDENT_KEY_REUSES_SHARED_KEY',
            'SURVEY_RESPONDENT_KEY must not reuse the HMAC_KEY or DATASET_PSEUDONYM_KEY value');
    }
    const retired = (tryGetSecret('SURVEY_RESPONDENT_KEYS_RETIRED') || '')
        .split(',').map(k => k.trim()).filter(Boolean);
    return [current, ...retired];
}

/**
 * Keyed HMAC of (templateId, User.id) under each key, current first: one
 * response per account per template. It stays on a withdrawn response, where
 * respondentUserId is gone, so the same account cannot answer again; without
 * the key it cannot be turned back into the account, and it differs per
 * template so it joins nothing across surveys.
 */
function _respondentMarkers(templateId, userId, keys = _respondentKeys()) {
    return keys.map((secret) => {
        const key = crypto.createHmac('sha256', secret).update(RESPONDENT_MARKER_CONTEXT).digest();
        return crypto.createHmac('sha256', key).update(`${templateId}:${userId}`).digest('hex');
    });
}

// ── Zod schemas ─────────────────────────────────────────────────────

const questionSchema = z.object({
    questionText: z.string().trim().min(1),
    questionType: z.enum(QUESTION_TYPES).default('TEXT'),
    section: z.string().trim().max(200).optional(),
    choices: z.array(z.string().trim().min(1)).min(2).optional(),
    isRequired: z.boolean().default(true),
}).refine(
    (q) => !CHOICE_TYPES.has(q.questionType) || Array.isArray(q.choices),
    { message: 'choice questions require a choices array' },
);

const createTemplateSchema = z.object({
    code: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(5000).optional(),
    targetGroup: z.enum(TARGET_GROUPS).default('FARMER'),
    questions: z.array(questionSchema).min(1).max(100),
});

const submitResponseSchema = z.object({
    researchConsent: z.unknown().optional(),
    region: z.enum(REGIONS),
    province: z.string().trim().max(100).optional(),
    answers: z.array(z.object({
        questionId: z.string().trim().min(1),
        value: z.union([z.string(), z.number(), z.array(z.string())]),
    })).min(1).max(200),
});

/** A date that must be given: z.coerce.date() alone turns null into 1970-01-01. */
const requiredDate = z.union([z.string().trim().min(1), z.date()]).pipe(z.coerce.date());

const createInterviewSchema = z.object({
    title: z.string().trim().min(1).max(500),
    intervieweeName: z.string().trim().min(1).max(300),
    intervieweeOrg: z.string().trim().max(300).optional(),
    intervieweeRole: z.string().trim().max(300).optional(),
    interviewDate: requiredDate,
    mode: z.enum(['ONSITE', 'ONLINE']).default('ONSITE'),
    transcript: z.string().trim().min(1),
    keyInsights: z.array(z.string().trim().min(1)).max(50).optional(),
    intervieweeConsentGiven: z.unknown().optional(),
    intervieweeConsentDate: z.unknown().optional(),
});

const interviewConsentSchema = z.object({
    intervieweeConsentGiven: z.literal(true),
    intervieweeConsentDate: requiredDate.refine(date => date.getTime() <= Date.now(), 'consent date is in the future'),
});

// ── Template master data ────────────────────────────────────────────

async function createTemplate(payload, { actor } = {}) {
    const parsed = createTemplateSchema.safeParse(payload);
    if (!parsed.success) {
        throw httpError(400, 'SURVEY_TEMPLATE_INVALID',
            `Invalid survey template: ${parsed.error.issues.map(i => i.message).join('; ')}`);
    }
    const { questions, ...template } = parsed.data;

    try {
        return await prisma.$transaction(async (tx) => {
            const created = await tx.surveyTemplate.create({
                data: {
                    ...template,
                    status: TEMPLATE_STATUS.DRAFT,
                    createdBy: actor?.id || null,
                },
            });
            await tx.surveyQuestion.createMany({
                data: questions.map((q, i) => ({
                    templateId: created.id,
                    sortOrder: i + 1,
                    section: q.section || null,
                    questionText: q.questionText,
                    questionType: q.questionType,
                    choices: q.choices || null,
                    isRequired: q.isRequired,
                })),
            });
            logger.info(`[Survey] template created: ${created.id} (${template.code}, ${questions.length} questions)`);
            return created;
        });
    } catch (error) {
        // @@unique([organizationId, code]) → duplicate code must be a 409, not a
        // 500 on client input (PR-666 review).
        if (error.code === 'P2002') {
            throw httpError(409, 'SURVEY_TEMPLATE_CODE_EXISTS',
                `A survey template with code "${template.code}" already exists`);
        }
        throw error;
    }
}

async function _getTemplateOr404(templateId, { includeQuestions = false, scope = null } = {}) {
    const template = await prisma.surveyTemplate.findFirst({
        where: { id: templateId, isDeleted: false, ...(scope || {}) },
        ...(includeQuestions ? { include: { questions: { orderBy: { sortOrder: 'asc' } } } } : {}),
    });
    if (!template) {
        throw httpError(404, 'SURVEY_NOT_FOUND', 'Survey template not found');
    }
    return template;
}

/** DRAFT → ACTIVE (idempotent when already ACTIVE) */
async function activateTemplate(templateId) {
    const template = await _getTemplateOr404(templateId);
    if (template.status === TEMPLATE_STATUS.ACTIVE) { return template; } // idempotent no-op
    const acceptable = new Set([TEMPLATE_STATUS.DRAFT]);
    if (!acceptable.has(template.status)) {
        throw httpError(409, 'INVALID_SURVEY_TEMPLATE_STATUS',
            `Cannot activate a ${template.status} template`);
    }
    return prisma.surveyTemplate.update({
        where: { id: templateId },
        data: { status: TEMPLATE_STATUS.ACTIVE, activatedAt: new Date() },
    });
}

/** ACTIVE → CLOSED (idempotent when already CLOSED) */
async function closeTemplate(templateId) {
    const template = await _getTemplateOr404(templateId);
    if (template.status === TEMPLATE_STATUS.CLOSED) { return template; } // idempotent no-op
    const acceptable = new Set([TEMPLATE_STATUS.ACTIVE]);
    if (!acceptable.has(template.status)) {
        throw httpError(409, 'INVALID_SURVEY_TEMPLATE_STATUS',
            `Cannot close a ${template.status} template`);
    }
    return prisma.surveyTemplate.update({
        where: { id: templateId },
        data: { status: TEMPLATE_STATUS.CLOSED, closedAt: new Date() },
    });
}

async function listTemplates({ status, scope = null } = {}) {
    return prisma.surveyTemplate.findMany({
        where: { isDeleted: false, ...(status ? { status } : {}), ...(scope || {}) },
        include: { questions: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { createdAt: 'desc' },
    });
}

/** ACTIVE templates this actor may answer, each marked with whether the actor already did. */
async function listActiveTemplates({ actor } = {}) {
    const templates = await prisma.surveyTemplate.findMany({
        where: {
            isDeleted: false,
            status: TEMPLATE_STATUS.ACTIVE,
            targetGroup: { in: Object.keys(RESPONDENT_RULES) },
        },
        include: { questions: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { createdAt: 'desc' },
    });
    const answerable = templates.filter(t => _mayAnswer(actor, t));
    if (answerable.length === 0) { return []; }
    const keys = _respondentKeys();
    const markers = new Map(answerable.flatMap(t => _respondentMarkers(t.id, actor.id, keys).map(m => [m, t.id])));
    const answered = await prisma.surveyResponse.findMany({
        where: { respondentMarker: { in: [...markers.keys()] } },
        select: { respondentMarker: true },
    });
    const answeredIds = new Set(answered.map(r => markers.get(r.respondentMarker)));
    return answerable.map(t => ({ ...t, alreadyAnswered: answeredIds.has(t.id) }));
}

async function getTemplate(templateId, { scope = null } = {}) {
    return _getTemplateOr404(templateId, { includeQuestions: true, scope });
}

// ── Response posting (immutable document) ───────────────────────────

function _validateAnswerValue(question, value) {
    switch (question.questionType) {
        case 'RATING_5': {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 1 || n > 5) {
                throw httpError(400, 'INVALID_ANSWER',
                    `Question ${question.id}: rating must be 1-5`);
            }
            return { valueText: null, valueNumber: n };
        }
        case 'NUMBER': {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                throw httpError(400, 'INVALID_ANSWER',
                    `Question ${question.id}: value must be a number`);
            }
            return { valueText: null, valueNumber: n };
        }
        case 'SINGLE_CHOICE': {
            const choices = Array.isArray(question.choices) ? question.choices : [];
            if (typeof value !== 'string' || !choices.includes(value)) {
                throw httpError(400, 'INVALID_ANSWER',
                    `Question ${question.id}: value must be one of the defined choices`);
            }
            return { valueText: value, valueNumber: null };
        }
        case 'MULTI_CHOICE': {
            const choices = Array.isArray(question.choices) ? question.choices : [];
            const values = [...new Set(Array.isArray(value) ? value : [value])];
            if (values.length === 0 || !values.every(v => typeof v === 'string' && choices.includes(v))) {
                throw httpError(400, 'INVALID_ANSWER',
                    `Question ${question.id}: all values must be defined choices`);
            }
            return { valueText: JSON.stringify(values), valueNumber: null };
        }
        case 'TEXT':
        case 'TEXTAREA':
        default: {
            const text = String(value ?? '').trim();
            if (text === '') {
                throw httpError(400, 'INVALID_ANSWER', `Question ${question.id}: empty text answer`);
            }
            // PII invariant: free text can contain typed national ids — mask at write
            return { valueText: maskTypedIds(text), valueNumber: null };
        }
    }
}

/**
 * The respondent must accept the research notice they were shown (order 34(5)).
 * No acceptance → 403; acceptance of a superseded notice → 409 so the page
 * reloads the current wording instead of storing consent to text nobody saw.
 */
function _assertResearchConsent(consent) {
    if (!consent || consent.accepted !== true) {
        throw Object.assign(new Error('Research consent is required before answering this survey'), {
            statusCode: 403, code: 'RESEARCH_CONSENT_REQUIRED',
        });
    }
    if (consent.version !== RESEARCH_CONSENT_NOTICE.version) {
        throw Object.assign(new Error('The research notice has changed; read the current notice and consent again'), {
            statusCode: 409, code: 'RESEARCH_CONSENT_VERSION_STALE',
        });
    }
}

async function submitResponse(templateId, payload, { actor } = {}) {
    const template = await _getTemplateOr404(templateId, { includeQuestions: true });
    if (template.status !== TEMPLATE_STATUS.ACTIVE) {
        throw httpError(409, 'SURVEY_NOT_ACTIVE', 'Survey is not accepting responses');
    }
    if (!actor?.id) {
        throw httpError(401, 'UNAUTHORIZED', 'No respondent identity');
    }
    if (!_mayAnswer(actor, template)) {
        throw httpError(403, 'SURVEY_NOT_FOR_RESPONDENT', 'This survey is not for your account');
    }

    const parsed = submitResponseSchema.safeParse(payload);
    if (!parsed.success) {
        throw httpError(400, 'SURVEY_RESPONSE_INVALID',
            `Invalid response: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    const { region, province, answers, researchConsent } = parsed.data;
    _assertResearchConsent(researchConsent);

    const questionById = new Map((template.questions || []).map(q => [q.id, q]));

    // Every answered question must belong to this template
    for (const answer of answers) {
        if (!questionById.has(answer.questionId)) {
            throw httpError(400, 'INVALID_QUESTION',
                `Question ${answer.questionId} does not belong to this survey`);
        }
    }

    // Reject duplicate questionIds: SurveyAnswer has @@unique([responseId,
    // questionId]) so a duplicate would throw Prisma P2002 mid-transaction and
    // surface as a 500 on client input (PR-666 review). Guard it as a 400.
    const seen = new Set();
    for (const answer of answers) {
        if (seen.has(answer.questionId)) {
            throw httpError(400, 'DUPLICATE_QUESTION',
                `Question ${answer.questionId} answered more than once`);
        }
        seen.add(answer.questionId);
    }

    // Every required question must be answered
    const answeredIds = new Set(answers.map(a => a.questionId));
    const missing = (template.questions || [])
        .filter(q => q.isRequired && !answeredIds.has(q.id))
        .map(q => q.id);
    if (missing.length > 0) {
        throw httpError(400, 'MISSING_REQUIRED_ANSWERS',
            `Required questions not answered: ${missing.join(', ')}`);
    }

    // Type-validate all lines BEFORE opening the transaction (all-or-nothing)
    const lines = answers.map(answer => ({
        questionId: answer.questionId,
        ..._validateAnswerValue(questionById.get(answer.questionId), answer.value),
    }));

    const now = new Date();
    const [respondentMarker, ...retiredMarkers] = _respondentMarkers(templateId, actor.id);
    return prisma.$transaction(async (tx) => {
        if (retiredMarkers.length > 0) {
            const answeredUnderRetiredKey = await tx.surveyResponse.findFirst({
                where: { templateId, respondentMarker: { in: retiredMarkers } },
                select: { id: true },
            });
            if (answeredUnderRetiredKey) {
                throw httpError(409, 'SURVEY_ALREADY_ANSWERED', 'This account has already answered this survey');
            }
        }
        let response;
        try {
            response = await tx.surveyResponse.create({
                data: {
                    templateId,
                    respondentUserId: actor.id,
                    respondentMarker,
                    respondentType: template.targetGroup,
                    region,
                    // province เป็น free-text (ผู้ตอบพิมพ์เองได้) → mask เลขบัตร 13 หลัก
                    // ที่จุด persist เหมือน answers/transcript/keyInsights กันหลุดเข้า
                    // research dataset export (PDPA invariant "PII columns absent").
                    province: province ? maskTypedIds(province) : null,
                    status: 'SUBMITTED',
                    submittedAt: now,
                    researchConsentVersion: RESEARCH_CONSENT_NOTICE.version,
                    researchConsentAt: now,
                },
                select: { id: true, templateId: true, status: true, submittedAt: true },
            });
        } catch (error) {
            // @@unique([templateId, respondentMarker]): the loser of a concurrent double submit lands here too
            if (error.code === 'P2002') {
                throw httpError(409, 'SURVEY_ALREADY_ANSWERED', 'This account has already answered this survey');
            }
            throw error;
        }
        await tx.surveyAnswer.createMany({
            data: lines.map((line) => ({ responseId: response.id, ...line })),
        });
        logger.info(`[Survey] response posted: ${response.id} (template ${templateId}, ${lines.length} answers, ${region})`);
        return response;
    });
}

// ── Analytics + export ──────────────────────────────────────────────

async function _getResponsesWithAnswers(templateId, where = {}) {
    return prisma.surveyResponse.findMany({
        where: { templateId, ...where },
        include: { answers: true },
        orderBy: { submittedAt: 'asc' },
    });
}

/** 12 → '10-19': a total that no longer subtracts back to a hidden cell. */
function _band(count) {
    const low = Math.floor(count / 10) * 10;
    return `${low}-${low + 9}`;
}

function _choiceCounts(question, answers) {
    const counts = {};
    for (const answer of answers) {
        let values = [answer.valueText];
        if (question.questionType === 'MULTI_CHOICE') {
            try { values = JSON.parse(answer.valueText); } catch { values = [answer.valueText]; }
        }
        for (const v of values) {
            if (v) { counts[v] = (counts[v] || 0) + 1; }
        }
    }
    return counts;
}

/** One document per respondent, so a keyword counts people, not how often one person typed it. */
function _textsByRespondent(responses, questionId) {
    const byRespondent = new Map();
    for (const response of responses) {
        const key = response.respondentUserId || `response:${response.id}`;
        for (const answer of response.answers) {
            if (answer.questionId !== questionId || !answer.valueText || answer.valueText === REDACTED_TEXT) { continue; }
            byRespondent.set(key, [...(byRespondent.get(key) || []), answer.valueText]);
        }
    }
    return [...byRespondent.values()].map(texts => texts.join('\n'));
}

/**
 * Per-question statistics. `aggregateOnly` is every reader except the
 * organization's system_admin_dtam (order 34(5)). Such a reader sees nothing
 * until the template is CLOSED: on a live survey, the change after one new
 * answer is that respondent's answer. Once closed, small cells and enough
 * of their smallest neighbours are dropped (suppressSmallCells), and when any
 * cell was dropped every total and every region count turns into a band, so
 * the regions no longer sum back to the exact total. Numeric averages need
 * SMALL_COUNT_THRESHOLD answers and min/max are never shown. Free-text
 * keywords are the admin's only: withdrawal redacts free text, so a keyword
 * shown at exactly the threshold would vanish and name the withdrawer's word.
 */
async function getTemplateStats(templateId, { scope = null, aggregateOnly = true } = {}) {
    const template = await _getTemplateOr404(templateId, { includeQuestions: true, scope });
    const header = { templateId, title: template.title, status: template.status, aggregateOnly };
    if (aggregateOnly && template.status !== TEMPLATE_STATUS.CLOSED) {
        return { ...header, statisticsAvailable: false };
    }
    const responses = await _getResponsesWithAnswers(templateId);

    const regionCounts = {};
    for (const response of responses) {
        regionCounts[response.region] = (regionCounts[response.region] || 0) + 1;
    }
    const regions = aggregateOnly ? suppressSmallCells(regionCounts) : { shown: regionCounts, hasSuppressedCells: false };
    let anySuppressed = regions.hasSuppressedCells;

    const questions = (template.questions || []).map((question) => {
        const answers = responses
            .flatMap(r => r.answers)
            .filter(a => a.questionId === question.id);
        const base = {
            questionId: question.id,
            questionText: question.questionText,
            questionType: question.questionType,
            count: answers.length,
        };

        if (question.questionType === 'RATING_5' || question.questionType === 'NUMBER') {
            const numbers = answers.map(a => a.valueNumber).filter(n => Number.isFinite(n));
            const shown = numbers.length > 0 && (!aggregateOnly || numbers.length >= SMALL_COUNT_THRESHOLD);
            const sum = numbers.reduce((acc, n) => acc + n, 0);
            return {
                ...base,
                average: shown ? Math.round((sum / numbers.length) * 100) / 100 : null,
                // the extremes are one respondent's own value each
                min: shown && !aggregateOnly ? Math.min(...numbers) : null,
                max: shown && !aggregateOnly ? Math.max(...numbers) : null,
            };
        }

        if (CHOICE_TYPES.has(question.questionType)) {
            const counts = _choiceCounts(question, answers);
            if (!aggregateOnly) {
                return { ...base, choiceCounts: counts, hasSuppressedCells: false };
            }
            const { shown, hasSuppressedCells } = suppressSmallCells(counts);
            anySuppressed = anySuppressed || hasSuppressedCells;
            return { ...base, choiceCounts: shown, hasSuppressedCells };
        }

        // TEXT/TEXTAREA → text-mining 3.1 (Thai keywords, counted per respondent)
        return {
            ...base,
            topKeywords: aggregateOnly ? null : extractThaiKeywords(_textsByRespondent(responses, question.id)),
        };
    });

    const banded = aggregateOnly && anySuppressed;
    return {
        ...header,
        statisticsAvailable: true,
        smallCountThreshold: aggregateOnly ? SMALL_COUNT_THRESHOLD : null,
        totalResponses: banded ? null : responses.length,
        totalResponsesBand: banded ? _band(responses.length) : null,
        regionBreakdown: banded ? null : regions.shown,
        regionBreakdownBand: banded
            ? Object.fromEntries(Object.entries(regions.shown).map(([region, count]) => [region, _band(count)]))
            : null,
        regionBreakdownHasSuppressedCells: regions.hasSuppressedCells,
        questions: questions.map(q => ({
            ...q,
            count: banded ? null : q.count,
            countBand: banded ? _band(q.count) : null,
        })),
    };
}

/** Raw answers, one row per response; withdrawn responses are left out. */
async function exportResponsesCsv(templateId, { scope = null } = {}) {
    const template = await _getTemplateOr404(templateId, { includeQuestions: true, scope });
    const responses = await _getResponsesWithAnswers(templateId, { researchConsentWithdrawnAt: null });
    const questions = template.questions || [];

    const cell = (value) => {
        const text = neutralizeCsvFormula(String(value ?? ''));
        return `"${text.replace(/"/g, '""')}"`;
    };

    const header = ['response_id', 'submitted_on', 'region', 'province',
        ...questions.map(q => q.questionText)];
    const rows = [header.map(cell).join(',')];

    for (const response of responses) {
        const answerByQuestion = new Map(response.answers.map(a => [a.questionId, a]));
        const row = [
            response.id,
            // the date only: a time of day can be matched to the respondent's own session
            response.submittedAt ? getZonedParts(new Date(response.submittedAt)).isoDate : '',
            response.region,
            response.province || '',
            ...questions.map((q) => {
                const answer = answerByQuestion.get(q.id);
                if (!answer) { return ''; }
                return answer.valueNumber ?? answer.valueText ?? '';
            }),
        ];
        rows.push(row.map(cell).join(','));
    }

    // BOM so Thai text opens correctly in Excel
    return `${'﻿'}${rows.join('\n')}`;
}

// ── PDPA: erasure and consent withdrawal ────────────────────────────

/**
 * Cut every survey response of `userId` loose from the person: no account
 * link, no province, and the respondent's own words replaced. Ratings and
 * choices stay, so aggregate statistics do not move. Runs on the caller's
 * client so PDPA erasure does it inside its transaction.
 *
 * Both a withdrawal and an account erasure end the research consent:
 * researchConsentWithdrawnAt is stamped, so the rows leave every export and
 * the withdrawn list carries them under the pseudonym they left with. The
 * approved notice (research-survey-notice-th-v3) keeps the account link to
 * delete or withdraw answers on request, and erasing the account is such a
 * request.
 *
 * Withdrawal keeps respondentMarker, so the account cannot answer the same
 * template again. Erasure clears it, on earlier withdrawn rows too: the
 * account is gone, and nothing should still lead back to it.
 *
 * @param {object} client — prisma or a transaction client
 * @param {string} userId
 * @param {{ withdraw?: boolean }} options — true for a withdrawal (the
 *   account stays, and so does its marker); false for an account erasure
 * @returns {Promise<number>} how many linked responses were anonymised
 */
async function anonymiseResponsesOfUser(client, userId, { withdraw = false } = {}) {
    const responses = await client.surveyResponse.findMany({
        where: { respondentUserId: userId },
        select: { id: true },
    });
    const ids = responses.map(r => r.id);

    if (ids.length > 0) {
        await client.surveyAnswer.updateMany({
            where: { responseId: { in: ids }, question: { questionType: { in: FREE_TEXT_TYPES } } },
            data: { valueText: REDACTED_TEXT },
        });
        await client.surveyResponse.updateMany({
            where: { id: { in: ids } },
            data: { respondentUserId: null, province: null, researchConsentWithdrawnAt: new Date() },
        });
    }
    if (!withdraw) {
        const marked = await client.surveyResponse.findMany({
            where: { respondentMarker: { not: null } },
            select: { templateId: true },
            distinct: ['templateId'],
        });
        if (marked.length > 0) {
            const keys = _respondentKeys();
            await client.surveyResponse.updateMany({
                where: { respondentMarker: { in: marked.flatMap(r => _respondentMarkers(r.templateId, userId, keys)) } },
                data: { respondentMarker: null },
            });
        }
    }
    return ids.length;
}

/** The respondent withdraws research consent for every answer they gave. Idempotent. */
async function withdrawResearchConsent(userId) {
    if (!userId) {
        throw httpError(401, 'UNAUTHORIZED', 'No respondent identity');
    }
    const withdrawnResponses = await prisma.$transaction(tx => anonymiseResponsesOfUser(tx, userId, { withdraw: true }));
    logger.info(`[Survey] research consent withdrawn: ${withdrawnResponses} responses anonymised`);
    return { withdrawnResponses };
}

// ── Expert interviews (ต้นแบบ 2.2) ──────────────────────────────────

async function createInterview(payload, { actor } = {}) {
    const parsed = createInterviewSchema.safeParse(payload);
    if (!parsed.success) {
        throw httpError(400, 'INTERVIEW_INVALID',
            `Invalid interview record: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    const consent = interviewConsentSchema.safeParse(payload);
    if (!consent.success) {
        throw Object.assign(new Error('The interviewee must have consented, on a recorded date, before a transcript is saved'), {
            statusCode: 400, code: 'INTERVIEW_CONSENT_REQUIRED',
        });
    }
    const data = parsed.data;
    if (getZonedParts(consent.data.intervieweeConsentDate).isoDate > getZonedParts(data.interviewDate).isoDate) {
        throw Object.assign(new Error('Consent must be given on or before the interview date'), {
            statusCode: 400, code: 'INTERVIEW_CONSENT_AFTER_INTERVIEW',
        });
    }

    return prisma.expertInterview.create({
        data: {
            title: data.title,
            intervieweeName: data.intervieweeName,
            intervieweeOrg: data.intervieweeOrg || null,
            intervieweeRole: data.intervieweeRole || null,
            interviewDate: data.interviewDate,
            mode: data.mode,
            // Free text can contain typed national ids — mask before persist
            transcript: maskTypedIds(data.transcript),
            keyInsights: (data.keyInsights || []).map(s => maskTypedIds(s)),
            recordedBy: actor?.id || null,
            intervieweeConsentGiven: true,
            intervieweeConsentDate: consent.data.intervieweeConsentDate,
        },
    });
}

async function listInterviews({ scope = null } = {}) {
    return prisma.expertInterview.findMany({
        where: { isDeleted: false, ...(scope || {}) },
        orderBy: { interviewDate: 'desc' },
    });
}

/**
 * The interviewee withdrew consent: remove everything that names or quotes
 * them, the title included. The row stays (with its date and mode) as the
 * record that an interview took place and was withdrawn. A soft-deleted row
 * still holds the transcript, so it is anonymised too. Idempotent.
 */
async function anonymiseInterview(interviewId, { scope = null } = {}) {
    const interview = await withDeletedRows(async () => prisma.expertInterview.findFirst({
        where: { id: interviewId, ...(scope || {}) },
        select: { id: true, intervieweeConsentWithdrawnAt: true },
    }));
    if (!interview) {
        throw httpError(404, 'INTERVIEW_NOT_FOUND', 'Interview not found');
    }
    return prisma.expertInterview.update({
        where: { id: interview.id },
        data: {
            title: REDACTED_TEXT,
            intervieweeName: REDACTED_TEXT,
            intervieweeOrg: null,
            intervieweeRole: null,
            transcript: REDACTED_TEXT,
            keyInsights: [],
            intervieweeConsentWithdrawnAt: interview.intervieweeConsentWithdrawnAt || new Date(),
        },
    });
}

module.exports = {
    TEMPLATE_STATUS,
    REGIONS,
    TARGET_GROUPS,
    QUESTION_TYPES,
    SMALL_COUNT_THRESHOLD,
    REDACTED_TEXT,
    createTemplate,
    activateTemplate,
    closeTemplate,
    listTemplates,
    listActiveTemplates,
    getTemplate,
    submitResponse,
    getTemplateStats,
    exportResponsesCsv,
    anonymiseResponsesOfUser,
    withdrawResearchConsent,
    createInterview,
    listInterviews,
    anonymiseInterview,
};
