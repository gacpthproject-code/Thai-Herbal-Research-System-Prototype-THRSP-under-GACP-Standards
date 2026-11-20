'use strict';

/**
 * Evaluates the Prisma `where` shapes the certificate lookup doors send, so a test fake can
 * answer from rows instead of from which client method was called. Scalars, `in`, `notIn`,
 * `not`, the range operators, `endsWith`, `startsWith`, `contains` (with `mode: 'insensitive'`), `AND`, `OR`, `NOT`, and
 * a nested relation object on a row that carries that relation.
 */
function whereMatches(where, row) {
    if (!where) { return true; }
    return Object.entries(where).every(([key, cond]) => {
        if (key === 'AND') { return [].concat(cond).every((c) => whereMatches(c, row)); }
        if (key === 'OR') { return [].concat(cond).some((c) => whereMatches(c, row)); }
        if (key === 'NOT') { return ![].concat(cond).some((c) => whereMatches(c, row)); }
        return fieldMatches(cond, row[key]);
    });
}

function fieldMatches(cond, value) {
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) { return value === cond; }
    if (Array.isArray(value) || (value && typeof value === 'object' && !isFilter(cond))) {
        return value != null && !Array.isArray(value) && whereMatches(cond, value);
    }
    const text = (s) => (cond.mode === 'insensitive' ? String(s).toLowerCase() : String(s));
    return Object.entries(cond).every(([op, arg]) => {
        switch (op) {
            case 'equals': return value === arg;
            case 'not': return value !== arg;
            case 'gte': return value >= arg;
            case 'gt': return value > arg;
            case 'lte': return value <= arg;
            case 'lt': return value < arg;
            case 'in': return arg.includes(value);
            case 'notIn': return !arg.includes(value);
            case 'endsWith': return typeof value === 'string' && text(value).endsWith(text(arg));
            case 'startsWith': return typeof value === 'string' && text(value).startsWith(text(arg));
            case 'contains': return typeof value === 'string' && text(value).includes(text(arg));
            case 'mode': return true;
            default: throw new Error(`fake-certificate-where: unsupported operator ${op}`);
        }
    });
}

const OPERATORS = new Set(['equals', 'not', 'gte', 'gt', 'lte', 'lt', 'in', 'notIn', 'endsWith', 'startsWith', 'contains', 'mode']);
const isFilter = (cond) => Object.keys(cond).every((k) => OPERATORS.has(k));

/** A `certificate` delegate answering findUnique/findFirst/findMany from the given rows. */
function certificateTable(rows) {
    const matching = (args) => rows.filter((row) => whereMatches(args && args.where, row));
    return {
        findUnique: async (args) => matching(args)[0] || null,
        findFirst: async (args) => matching(args)[0] || null,
        findMany: async (args) => matching(args).slice(0, args && args.take ? args.take : undefined),
    };
}

module.exports = { whereMatches, certificateTable };
