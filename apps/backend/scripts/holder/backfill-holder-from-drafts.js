#!/usr/bin/env node
/**
 * Fill holder records from the identity drafts typed at step 2 (order 142, brief item 5).
 *
 * Before the holder record, step 2 asked every filing to type its holder's identity into
 * formData.applicantData. This moves what a DRAFT typed into the holder record of the entity
 * it is filed for, only where the two agree:
 *
 *   - the draft's registration number (national ID, company or community number) is the
 *     entity's own; a draft with none, or another one, is left to the applicant;
 *   - a holder field already filled with a different value is a conflict: the whole draft is
 *     left to the applicant, nothing is overwritten;
 *   - a name typed as one string (authorizedSignatory, presidentName) is never split into a
 *     title, a first and a last name: the applicant fills those on the holder page.
 *
 * Only DRAFT applications are read. Submitted applications, issued certificates and holders
 * whose identity a verified login filled are never written. Dry run unless --apply; the
 * report is the same either way. Idempotent: a second run finds nothing left to map.
 *
 * usage: node scripts/holder/backfill-holder-from-drafts.js [--apply] [--org=<organizationId>]
 */

'use strict';

const path = require('path');
const { HOLDER_TYPES, readHolder } = require('../../shared/holder-registry');

const text = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const digits = (v) => text(v).replace(/\D/g, '');
const first = (...vs) => vs.map(text).find((v) => v !== '') || '';
const personName = (p) => [p.firstName, p.lastName].map(text).filter(Boolean).join(' ');

/** The registration number a draft typed, read the way each era of step 2 spelled it. */
function typedRegistrationNo(type, a) {
    const column = HOLDER_TYPES[type].registration.column;
    if (column === 'thaiCitizenId') { return digits(first(a.idCard, a.nationalId)); }
    if (column === 'juristicId') { return digits(first(a.taxId, a.registrationNumber, a.juristicRegistrationNumber)); }
    return digits(first(a.communityRegistrationNo, a.communityRegNumber, a.communityRegistrationNumber));
}

/** Holder field path → value the draft typed for it. Single-string names are never split. */
function typedFields(type, a) {
    const def = HOLDER_TYPES[type];
    const out = {
        'contact.address': first(a.address, a.companyAddress, a.communityAddress),
        'contact.phone': first(a.phone, a.companyPhone, a.presidentPhone, a.contactPhone),
        'contact.email': first(a.email, a.contactEmail),
    };
    if (def.signatory === 'SELF') {
        out['person.title'] = first(a.prefix, a.title);
        out['person.firstName'] = first(a.firstName);
        out['person.lastName'] = first(a.lastName);
        out['person.nationality'] = first(a.nationality);
    } else {
        out['signatory.idCard'] = digits(first(a.presidentIdCard, a.directorIdCard, a.authorisedIdCard));
        out['signatory.nationality'] = first(a.nationality);
        if (def.houseCode) { out.houseCode = first(a.houseCode); }
    }
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== ''));
}

const at = (o, p) => p.split('.').reduce((v, k) => (v == null ? v : v[k]), o);

/**
 * Decide one draft. Pure: the entity row and the draft's applicantData in, an outcome out.
 * @returns {{ outcome: 'MAPPED'|'NOTHING_TO_MAP'|'NO_IDENTIFIER'|'IDENTIFIER_MISMATCH'|'CONFLICT'|'VERIFIED'|'UNKNOWN_TYPE',
 *   fields?: Record<string,string>, conflicts?: string[] }}
 */
function planDraft(entity, applicantData) {
    const holder = readHolder(entity);
    if (!holder) { return { outcome: 'UNKNOWN_TYPE' }; }
    if (holder.verified) { return { outcome: 'VERIFIED' }; }
    const a = applicantData && typeof applicantData === 'object' ? applicantData : {};
    const typedNo = typedRegistrationNo(holder.type, a);
    if (!typedNo) { return { outcome: 'NO_IDENTIFIER' }; }
    if (typedNo !== digits(holder.registrationNo)) { return { outcome: 'IDENTIFIER_MISMATCH' }; }

    const fields = {};
    const conflicts = [];
    const typed = typedFields(holder.type, a);
    // A pre-existing individual holder carries its registration name in displayName and an
    // empty person: the typed first + last name must be that name, or the certificate line
    // would change to the draft's spelling.
    if (holder.person && !personName(holder.person) && holder.legalName) {
        const typedName = [typed['person.firstName'], typed['person.lastName']].filter(Boolean).join(' ');
        if (typedName && typedName !== holder.legalName) { conflicts.push('person.firstName', 'person.lastName'); }
    }
    for (const [p, value] of Object.entries(typed)) {
        const current = text(at(holder, p));
        if (current === '') { fields[p] = value; }
        else if (current !== value) { conflicts.push(p); }
    }
    if (conflicts.length > 0) { return { outcome: 'CONFLICT', conflicts }; }
    if (Object.keys(fields).length === 0) { return { outcome: 'NOTHING_TO_MAP' }; }
    return { outcome: 'MAPPED', fields };
}

/** payload.holder with the planned fields set. */
function mergedPayload(entity, fields) {
    const payload = entity.payload && typeof entity.payload === 'object' ? entity.payload : {};
    const holder = JSON.parse(JSON.stringify(payload.holder && typeof payload.holder === 'object' ? payload.holder : {}));
    for (const [p, value] of Object.entries(fields)) {
        const keys = p.split('.');
        let node = holder;
        for (const k of keys.slice(0, -1)) {
            node[k] = node[k] && typeof node[k] === 'object' ? node[k] : {};
            node = node[k];
        }
        node[keys[keys.length - 1]] = value;
    }
    return { ...payload, holder };
}

async function run({ apply, prisma, withoutTenantScope, organizationId = null, log = console.log }) {
    const counts = {
        drafts: 0, MAPPED: 0, NOTHING_TO_MAP: 0, NO_IDENTIFIER: 0, IDENTIFIER_MISMATCH: 0, CONFLICT: 0, VERIFIED: 0, UNKNOWN_TYPE: 0,
    };
    await withoutTenantScope(async () => {
        const drafts = await prisma.application.findMany({
            where: { status: 'DRAFT', isDeleted: false, entityId: { not: null }, ...(organizationId ? { organizationId } : {}) },
            select: { id: true, entityId: true, formData: true },
            orderBy: { createdAt: 'asc' },
        });
        for (const draft of drafts) {
            counts.drafts += 1;
            const entity = await prisma.entity.findUnique({ where: { id: draft.entityId } });
            const plan = planDraft(entity, draft.formData && draft.formData.applicantData);
            counts[plan.outcome] += 1;
            if (plan.outcome === 'CONFLICT') { log(JSON.stringify({ applicationId: draft.id, outcome: plan.outcome, fields: plan.conflicts })); }
            if (plan.outcome !== 'MAPPED' || !apply) { continue; }
            await prisma.entity.update({ where: { id: entity.id }, data: { payload: mergedPayload(entity, plan.fields) } });
        }
    });
    return counts;
}

module.exports = { planDraft, mergedPayload, run };

if (require.main === module) {
    const apply = process.argv.includes('--apply');
    const orgArg = process.argv.find((a) => a.startsWith('--org='));
    const { prisma } = require(path.resolve(__dirname, '../../services/prisma-database'));
    const { withoutTenantScope } = require(path.resolve(__dirname, '../../services/tenant-context'));
    run({ apply, prisma, withoutTenantScope, organizationId: orgArg ? orgArg.slice('--org='.length) : null })
        .then((counts) => {
            console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counts }));
            return prisma.$disconnect();
        })
        .catch((err) => { console.error(err); process.exitCode = 1; });
}
