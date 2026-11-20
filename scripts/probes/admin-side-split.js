#!/usr/bin/env node
'use strict';

/**
 * admin-side-split — every runtime path that changes another account asks the two-sided rule
 * before it writes (orders 13 and 34(2); review M2 of fix/admin-role-split).
 *
 * What it reads: every runtime .js file under apps/backend (not tests, scripts, prisma, seeds),
 * parsed with espree from the eslint already installed. No file list to keep up to date.
 *
 * What it finds: each write to users, user_group_memberships or user_permission_grants
 * (Prisma model calls and raw SQL), the function it sits in, and every function that reaches
 * such a write through a call by name. A route handler (router.<verb> or router.route().<verb>)
 * that reaches a write is a door.
 *
 * What it requires:
 *   1. Every door, and every function that writes or calls a writer, makes a real call to
 *      assertSameSideChange that runs on every path (not inside an if, a callback or a catch)
 *      before its first write. A function with that call stops the search: its callers are
 *      covered. A function without it passes the duty to its callers; one that nothing calls
 *      fails.
 *   2. `target: null` (or no target) is allowed only where every write creates an account,
 *      and then the call must name the requested role.
 *   3. In a router that uses assertSameSideChange (an admin user router), every post, put,
 *      patch, delete and all route asks the rule itself or calls a function that does,
 *      even when the probe sees no write behind it.
 *   4. Writers that change only the caller's own account, or run with no actor, are listed in
 *      SELF_SERVICE with the reason; an entry that names nothing fails.
 *
 * Contract: exit 0 PASS · 1 FAIL · 2 BLOCKED (see _lib.sh). Usage:
 *   node scripts/probes/admin-side-split.js [--selftest | --list]
 *   ADMIN_SIDE_ROOT=<dir holding apps/backend> node scripts/probes/admin-side-split.js
 *   ADMIN_SIDE_PARSER_FROM=<dir> picks where eslint (and its espree) is resolved from.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const GUARD = 'assertSameSideChange';
const MODELS = new Set(['user', 'userGroupMembership', 'userPermissionGrant']);
const WRITE_METHODS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const CREATE_METHODS = new Set(['create', 'createMany', 'createManyAndReturn']);
const RAW_METHODS = new Set(['$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe']);
const RAW_WRITE = /\b(update|insert\s+into|delete\s+from)\s+"?(?:public"?\."?)?(users|user_group_memberships|user_permission_grants)\b/i;
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all']);
const MUTATING = new Set(['post', 'put', 'patch', 'delete', 'all']);
const SKIP_DIRS = new Set([
    'node_modules', '__tests__', 'tests', 'test-support', 'scripts', 'prisma', 'chaos-tests', 'e2e',
    'eslint-rules', 'storage', 'public', 'assets', 'data', 'keys', 'coverage',
]);
const SKIP_FILE = /(\.test\.js|\.spec\.js|^jest\..*\.js|^eslint\.config\.js|^playwright\.config\.js)$/;

/** Writers that change only the caller's own account or run with no actor: no side to check. */
const SELF_SERVICE = Object.freeze({
    'controllers/auth-controller/auth-session-security-handlers.js::uploadAvatar': 'the signed-in user\'s own avatar',
    'controllers/e2e-controller.js::goldenScenario': 'e2e router: not mounted in production, refuses without E2E_SECRET, makes applicant test accounts',
    'controllers/e2e-controller.js::reset': 'e2e router: not mounted in production, refuses without E2E_SECRET',
    'jobs/pdpa-retention-job.js::runPdpaRetentionSweepInternal': 'scheduled PDPA retention sweep, no actor',
    'services/auth/password-management.js::changePassword': 'the signed-in user\'s own password, with the current one',
    'services/identity-service.js::storePendingSecondFactor': 'the signed-in user\'s own second factor, first enrolment',
    'services/identity-service.js::enableSecondFactor': 'the signed-in user\'s own second factor, confirmed by their own code',
    'services/identity-service.js::moveSecondFactor': 'the signed-in user moves their own second factor to a new device, proven by a current code',
    'services/identity-service.js::consumeBackupCode': 'the signed-in user\'s own backup code, spent at sign-in or as re-bind proof',
    'services/identity-service.js::restoreBackupCode': 'gives back the same user\'s own backup code when a re-bind could not start',
    'services/holder-identity-service.js::upgradeHolderFromVerifiedLogin': 'the verified login updates the name of its own HEALTH account; operator approved 2026-11-07',
    'services/identity-service.js::touchLastLogin': 'login bookkeeping of the account signing in',
    'services/identity-service.js::disableMfa': 'the signed-in user turns off their own second factor',
    'services/notification-preferences-service.js::updatePrefs': 'the signed-in user\'s own notification preferences',
    'services/pdpa-erasure-service.js::_saveEnvelope': 'the data subject\'s own erasure request',
    'services/pdpa-erasure-service.js::executeErasure': 'the data subject\'s own erasure',
    'services/prisma-auth-service.js::register': 'self-registration of an applicant',
    'services/prisma-auth-service.js::login': 'login bookkeeping of the account signing in',
    'services/prisma-auth-service.js::updateProfile': 'the signed-in user\'s own profile fields (allowlist)',
    'services/provider-user-service.js::touchProviderLastLogin': 'staff login bookkeeping',
    'services/provider-user-service.js::registerFailedProviderLogin': 'staff login lockout counter',
    'services/provider-user-service.js::resetProviderLoginLock': 'staff login lock expiry',
});

/** Mutating routes of admin user routers that change no account. */
const NOT_ACCOUNT_ROUTES = Object.freeze({
    'routes/api/platform-admin/organizations.js': {
        'POST /': 'creates an organization row',
        'PATCH /:id': 'edits an organization row',
    },
});

function loadParser(from) {
    try {
        const eslintDir = path.dirname(require.resolve('eslint', { paths: [from] }));
        return require(require.resolve('espree', { paths: [eslintDir] }));
    } catch {
        return null;
    }
}

const propName = (member) => (member.computed
    ? (member.property.type === 'Literal' ? String(member.property.value) : null)
    : member.property.name);
const isFunction = (node) => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type);

function listFiles(backend, overlay) {
    const out = new Set(Object.keys(overlay));
    (function visit(dir) {
        for (const entry of fs.readdirSync(path.join(backend, dir), { withFileTypes: true })) {
            const rel = dir ? `${dir}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) { visit(rel); }
            } else if (entry.name.endsWith('.js') && !SKIP_FILE.test(entry.name)) {
                out.add(rel);
            }
        }
    }(''));
    return [...out].filter((rel) => overlay[rel] !== null).sort();
}

function parse(espree, src) {
    const options = { ecmaVersion: 'latest', range: true, loc: true };
    try {
        return espree.parse(src, { ...options, sourceType: 'script' });
    } catch {
        return espree.parse(src, { ...options, sourceType: 'module' });
    }
}

function walk(node, visit, parents = []) {
    if (!node || typeof node.type !== 'string') { return; }
    visit(node, parents);
    parents.push(node);
    for (const [key, value] of Object.entries(node)) {
        if (key === 'range' || key === 'loc') { continue; }
        if (Array.isArray(value)) { value.forEach((child) => walk(child, visit, parents)); }
        else if (value && typeof value.type === 'string') { walk(value, visit, parents); }
    }
    parents.pop();
}

/** A route registration: router.<verb>(path, ...handlers) or router.route(path).<verb>(...handlers). */
function routeOf(call) {
    if (call.callee.type !== 'MemberExpression') { return null; }
    const verb = propName(call.callee);
    if (!VERBS.has(verb)) { return null; }
    let object = call.callee.object;
    let pathNode = null;
    while (object && object.type === 'CallExpression' && object.callee.type === 'MemberExpression') {
        const name = propName(object.callee);
        if (name === 'route') { pathNode = object.arguments[0] || null; break; }
        if (!VERBS.has(name)) { return null; }
        object = object.callee.object;
    }
    let handlers;
    if (pathNode) {
        handlers = call.arguments;
    } else {
        const first = call.arguments[0];
        if (!object || object.type !== 'Identifier' || !first
            || !((first.type === 'Literal' && typeof first.value === 'string') || first.type === 'TemplateLiteral')
            || call.arguments.length < 2) { return null; }
        pathNode = first;
        handlers = call.arguments.slice(1);
    }
    const routePath = pathNode && pathNode.type === 'Literal' ? pathNode.value : '<dynamic>';
    return { verb, label: `${verb.toUpperCase()} ${routePath}`, handlers };
}

function functionName(fn, parent) {
    if (fn.id && fn.id.name) { return fn.id.name; }
    if (!parent) { return null; }
    if (parent.type === 'VariableDeclarator' && parent.init === fn && parent.id.type === 'Identifier') { return parent.id.name; }
    if ((parent.type === 'Property' || parent.type === 'MethodDefinition') && parent.value === fn) {
        return parent.key.type === 'Identifier' ? parent.key.name : (parent.key.type === 'Literal' ? String(parent.key.value) : null);
    }
    if (parent.type === 'AssignmentExpression' && parent.right === fn) {
        if (parent.left.type === 'Identifier') { return parent.left.name; }
        if (parent.left.type === 'MemberExpression') { return propName(parent.left); }
    }
    return null;
}

/** Ancestor types a guard call may sit in and still run on every path through its function. */
const STRAIGHT = new Set(['BlockStatement', 'ExpressionStatement', 'AwaitExpression', 'VariableDeclaration', 'VariableDeclarator', 'ChainExpression']);

function guardFacts(call, between) {
    const unconditional = between.every((node, i) => STRAIGHT.has(node.type)
        || (node.type === 'TryStatement' && between[i + 1] === node.block));
    const arg = call.arguments[0];
    if (!arg || arg.type !== 'ObjectExpression') {
        return { unconditional, objectArg: false, targetNull: true, namesRole: false };
    }
    const prop = (key) => arg.properties.find((p) => p.type === 'Property' && !p.computed
        && ((p.key.type === 'Identifier' && p.key.name === key) || (p.key.type === 'Literal' && p.key.value === key)));
    const target = prop('target');
    const role = prop('requestedRole');
    return {
        unconditional,
        objectArg: true,
        targetNull: !target || (target.value.type === 'Literal' && target.value.value === null),
        namesRole: Boolean(role) && !(role.value.type === 'Identifier' && role.value.name === 'undefined'),
    };
}

function analyzeFile(rel, src, espree) {
    const ast = parse(espree, src);
    const units = [];
    const routes = [];
    let usesGuard = false;
    let makesRouter = false;
    const routeFns = new Map();
    const routeRefs = [];

    walk(ast, (node) => {
        if (node.type === 'Identifier' && node.name === GUARD) { usesGuard = true; }
        if (node.type !== 'CallExpression') { return; }
        const callee = node.callee;
        if ((callee.type === 'Identifier' && callee.name === 'Router')
            || (callee.type === 'MemberExpression' && propName(callee) === 'Router')) { makesRouter = true; }
        const route = routeOf(node);
        if (!route) { return; }
        routes.push(route);
        for (const handler of route.handlers) {
            if (isFunction(handler)) { routeFns.set(handler, route.label); }
            else if (handler.type === 'Identifier') { routeRefs.push({ name: handler.name, label: route.label, sameFile: true }); }
            else if (handler.type === 'MemberExpression') { routeRefs.push({ name: propName(handler), label: route.label, sameFile: false }); }
        }
    });

    const stack = [];
    const newUnit = (fn, name, routeLabel) => {
        const unit = {
            file: rel, name, fn, routeLabels: routeLabel ? [routeLabel] : [], writes: [], calls: [], guards: [],
            line: fn.loc.start.line,
        };
        units.push(unit);
        return unit;
    };
    (function visit(node, parents) {
        if (!node || typeof node.type !== 'string') { return; }
        let pushed = false;
        if (isFunction(node)) {
            const parent = parents[parents.length - 1];
            const routeLabel = makesRouter ? routeFns.get(node) : undefined;
            const name = functionName(node, parent);
            if (name || routeLabel || stack.length === 0) {
                stack.push({ unit: newUnit(node, name, routeLabel), depth: parents.length });
                pushed = true;
            }
        }
        const current = stack[stack.length - 1];
        if (current && node.type === 'CallExpression') {
            const callee = node.callee;
            const name = callee.type === 'Identifier' ? callee.name : (callee.type === 'MemberExpression' ? propName(callee) : null);
            const model = callee.type === 'MemberExpression' && callee.object.type === 'MemberExpression' ? propName(callee.object) : null;
            const rawSql = RAW_METHODS.has(name) && node.arguments.length > 0
                && RAW_WRITE.test(src.slice(node.arguments[0].range[0], node.arguments[0].range[1]));
            if (name === GUARD) {
                current.unit.guards.push({ pos: node.range[0], ...guardFacts(node, parents.slice(current.depth + 1)) });
            } else if ((MODELS.has(model) && WRITE_METHODS.has(name)) || rawSql) {
                current.unit.writes.push({ pos: node.range[0], create: CREATE_METHODS.has(name) });
            } else if (name) {
                current.unit.calls.push({ name, pos: node.range[0] });
            }
        }
        parents.push(node);
        for (const [key, value] of Object.entries(node)) {
            if (key === 'range' || key === 'loc') { continue; }
            if (Array.isArray(value)) { value.forEach((child) => visit(child, parents)); }
            else if (value && typeof value.type === 'string') { visit(value, parents); }
        }
        parents.pop();
        if (pushed) { stack.pop(); }
    }(ast, []));

    return { rel, units, routes, routeRefs, usesGuard, makesRouter };
}

function analyze(files) {
    const units = files.flatMap((f) => f.units);
    const byName = new Map();
    for (const unit of units) {
        if (unit.name) { byName.set(unit.name, [...(byName.get(unit.name) || []), unit]); }
    }
    for (const file of files) {
        for (const ref of file.routeRefs) {
            for (const unit of byName.get(ref.name) || []) {
                if (!ref.sameFile || unit.file === file.rel) { unit.routeLabels.push(ref.label); }
            }
        }
    }
    const key = (unit) => `${unit.file}::${unit.name}`;
    const exempt = (unit) => Boolean(unit.name && SELF_SERVICE[key(unit)]);

    // Fixpoint: which functions write (directly or by calling a function that writes without
    // asking the rule), and which of those ask the rule before their first write.
    for (const unit of units) { Object.assign(unit, { effects: [], guarded: false, createOnly: true }); }
    let changed = true;
    let rounds = 0;
    while (changed && rounds < 50) {
        changed = false;
        rounds += 1;
        const bare = new Map();
        for (const unit of units) {
            if (unit.name && unit.effects.length > 0 && !unit.guarded && !exempt(unit)) {
                const known = bare.get(unit.name);
                bare.set(unit.name, (known === undefined ? true : known) && unit.createOnly);
            }
        }
        for (const unit of units) {
            const effects = [
                ...unit.writes,
                ...unit.calls.filter((c) => bare.has(c.name)).map((c) => ({ pos: c.pos, create: bare.get(c.name) })),
            ];
            const first = effects.reduce((min, e) => Math.min(min, e.pos), Infinity);
            const createOnly = effects.every((e) => e.create);
            const guarded = effects.length > 0 && unit.guards.some((g) => g.unconditional && g.objectArg && g.pos < first
                && (!g.targetNull || (createOnly && g.namesRole)));
            if (effects.length !== unit.effects.length || guarded !== unit.guarded || createOnly !== unit.createOnly) {
                changed = true;
            }
            Object.assign(unit, { effects, guarded, createOnly });
        }
    }

    const called = new Set(units.flatMap((u) => u.calls.map((c) => c.name)));
    const problems = [];
    const why = (unit) => {
        const first = unit.effects.reduce((min, e) => Math.min(min, e.pos), Infinity);
        if (unit.guards.length === 0) { return 'asks assertSameSideChange nowhere'; }
        if (unit.guards.every((g) => g.pos > first)) { return 'asks assertSameSideChange only after its first write'; }
        if (unit.guards.every((g) => !g.unconditional)) { return 'asks assertSameSideChange only on some paths (inside an if, a callback or a catch)'; }
        if (unit.guards.some((g) => g.targetNull) && !unit.createOnly) { return 'passes target: null where the write changes an existing account'; }
        if (unit.guards.some((g) => g.targetNull && !g.namesRole)) { return 'creates an account without naming the requested role to the rule'; }
        return 'has no assertSameSideChange call the probe can verify';
    };
    const where = (unit) => (unit.routeLabels.length ? unit.routeLabels.join(', ') : (unit.name || `function at line ${unit.line}`));
    const checked = [];
    for (const unit of units) {
        if (unit.effects.length === 0 || exempt(unit)) { continue; }
        if (unit.guarded) {
            checked.push({ door: unit.routeLabels.length > 0, text: `${unit.file}: ${where(unit)}` });
            continue;
        }
        if (unit.routeLabels.length) {
            problems.push(`${unit.file}: ${where(unit)} changes an account and ${why(unit)}`);
        } else if (!unit.name || !called.has(unit.name)) {
            problems.push(`${unit.file}: ${where(unit)} changes an account, nothing calls it through a checked path, and it ${why(unit)}`);
        }
    }

    const guardedNames = new Set(units.filter((u) => u.guarded).map((u) => u.name).filter(Boolean));
    let adminRoutes = 0;
    for (const file of files.filter((f) => f.usesGuard && f.makesRouter)) {
        for (const route of file.routes.filter((r) => MUTATING.has(r.verb))) {
            if (NOT_ACCOUNT_ROUTES[file.rel] && NOT_ACCOUNT_ROUTES[file.rel][route.label]) { continue; }
            const handlerUnits = units.filter((u) => u.file === file.rel && u.routeLabels.includes(route.label));
            const covered = handlerUnits.some((u) => u.guarded || u.calls.some((c) => guardedNames.has(c.name)));
            if (covered) { adminRoutes += 1; } else {
                problems.push(`${file.rel}: ${route.label} sits in an admin user router and asks no side check`);
            }
        }
    }

    for (const entry of Object.keys(SELF_SERVICE)) {
        if (!units.some((u) => u.name && key(u) === entry)) {
            problems.push(`SELF_SERVICE entry ${entry} names no function any more; remove it`);
        }
    }
    const doors = checked.filter((c) => c.door).length;
    if (doors === 0 || adminRoutes === 0) {
        problems.push('the scan found no checked door; it would pass vacuously');
    }
    return {
        problems, doors, guardedFns: checked.length - doors, adminRoutes, exempt: Object.keys(SELF_SERVICE).length,
        checked: checked.map((c) => `${c.door ? 'door    ' : 'function'} ${c.text}`).sort(),
    };
}

/** @param {Record<string, string|null>} overlay rel path → source (null removes the file) */
function scan(backend, overlay = {}, parserFrom = backend) {
    const espree = loadParser(parserFrom);
    if (!espree) { return { blocked: `espree not resolvable from ${parserFrom}` }; }
    const files = [];
    const problems = [];
    for (const rel of listFiles(backend, overlay)) {
        const src = rel in overlay ? overlay[rel] : fs.readFileSync(path.join(backend, rel), 'utf8');
        try {
            files.push(analyzeFile(rel, src, espree));
        } catch (error) {
            problems.push(`${rel}: cannot be parsed (${error.message}); a door could hide there`);
        }
    }
    const result = analyze(files);
    return { ...result, problems: [...problems, ...result.problems], scanned: files.length };
}

function report(result) {
    if (result.blocked) { return { code: 2, text: `BLOCKED: ${result.blocked}` }; }
    if (result.problems.length) {
        return { code: 1, text: [...result.problems, 'FAIL: account write(s) that do not ask the two-sided rule (orders 13, 34(2))'].join('\n') };
    }
    return {
        code: 0,
        text: `PASS: ${result.scanned} runtime files · ${result.doors} doors and ${result.guardedFns} service functions ask assertSameSideChange `
            + `before their first account write · ${result.adminRoutes} mutating routes of admin user routers covered · `
            + `${result.exempt} self-service writers listed (orders 13, 34(2))`,
    };
}

function selftest(backend, parserFrom) {
    const read = (rel) => fs.readFileSync(path.join(backend, rel), 'utf8');
    const swap = (rel, from, to) => {
        const src = read(rel);
        if (!src.includes(from)) { throw new Error(`selftest anchor missing in ${rel}: ${from.slice(0, 60)}`); }
        return { [rel]: src.replace(from, to) };
    };
    const append = (rel, text) => ({ [rel]: `${read(rel)}\n${text}\n` });
    const PROVIDER = 'routes/api/system/provider.js';
    const USERS = 'routes/api/admin/users.js';
    const DELETE_CHECK = 'assertSameSideChange({ actorRole: caller.canonicalRole, target: existing });';
    const cases = [
        ['control: the real tree', () => ({}), 0],
        ['FN1 directory DELETE checks only after the write', () => {
            const src = read(PROVIDER);
            const done = "res.json({ success: true, message: 'Provider account deleted successfully' });";
            if (!src.includes(DELETE_CHECK) || !src.includes(done)) { throw new Error('selftest anchor missing in FN1'); }
            return { [PROVIDER]: src.replace(DELETE_CHECK, '').replace(done, `${DELETE_CHECK}\n        ${done}`) };
        }, 1],
        ['FN2 directory DELETE check replaced by a comment naming it', () => swap(PROVIDER, DELETE_CHECK, '// side rule: see assertSameSideChange( in canonical-rbac'), 1],
        ['FN3 directory DELETE check called with target: null', () => swap(PROVIDER, DELETE_CHECK, 'assertSameSideChange({ actorRole: caller.canonicalRole, target: null });'), 1],
        ['FN4 a new router file, on no list, writes a role without the check', () => ({
            'routes/api/platform-admin/users.js': [
                "const router = require('express').Router();",
                "const { prisma } = require('../../../services/prisma-database');",
                "router.patch('/:id/role', async (req, res) => {",
                '    await prisma.user.update({ where: { id: req.params.id }, data: { role: req.body.role } });',
                '    res.json({});',
                '});',
                'module.exports = router;',
            ].join('\n'),
        }), 1],
        ['FN5 router.route().patch added to an admin user router', () => append(USERS, "router.route('/:id/promote').patch(async (req, res) => res.json({}));"), 1],
        ['control-red: router.patch added to an admin user router', () => append(USERS, "router.patch('/:id/promote', async (req, res) => res.json({}));"), 1],
        ['service mutation (disableUser) loses its check', () => swap('services/admin-user-service.js', '    assertSameSideChange({ actorRole, target: existing });\n\n    // P0-D: disabling', '\n    // P0-D: disabling'), 1],
        ['create door checks only when a role was sent', () => swap(PROVIDER, '        assertSameSideChange({ actorRole: callerRole, target: null, requestedRole });', '        if (requestedRole) { assertSameSideChange({ actorRole: callerRole, target: null, requestedRole }); }'), 1],
        ['a service writer that nothing checks', () => append('services/provider-user-service.js', 'async function setRoleDirectly(id, role) { return prisma.user.update({ where: { id }, data: { role } }); }\nmodule.exports.setRoleDirectly = setRoleDirectly;'), 1],
        ['a self-service entry that names nothing', () => swap('services/notification-preferences-service.js', 'async function updatePrefs(', 'async function updatePreferences('), 1],
    ];
    let bad = 0;
    for (const [label, build, expected] of cases) {
        let code;
        let first = '';
        try {
            const out = report(scan(backend, build(), parserFrom));
            code = out.code;
            first = out.text.split('\n')[0];
        } catch (error) {
            code = 'ERR';
            first = error.message;
        }
        const ok = code === expected;
        if (!ok) { bad += 1; }
        console.log(`--- selftest ${label} -> exit ${code} (expected ${expected})${ok ? '' : '   *** WRONG'}\n    ${first}`);
    }
    const blocked = report(scan(backend, {}, '/nonexistent')).code;
    console.log(`--- selftest no parser -> exit ${blocked} (expected 2)${blocked === 2 ? '' : '   *** WRONG'}`);
    if (blocked !== 2) { bad += 1; }
    const total = cases.length + 1;
    console.log(bad === 0 ? `selftest: ${total}/${total} cases ok` : `selftest: ${bad} of ${total} case(s) wrong`);
    return bad === 0 ? 0 : 1;
}

if (require.main === module) {
    const root = process.env.ADMIN_SIDE_ROOT || REPO;
    const backend = path.join(root, 'apps/backend');
    const parserFrom = process.env.ADMIN_SIDE_PARSER_FROM || path.join(REPO, 'apps/backend');
    if (!fs.existsSync(backend)) {
        console.log(`BLOCKED: no apps/backend under ${root}`);
        process.exit(2);
    }
    if (process.argv.includes('--selftest')) {
        process.exit(selftest(backend, parserFrom));
    }
    const result = scan(backend, {}, parserFrom);
    if (process.argv.includes('--list') && result.checked) {
        console.log(result.checked.join('\n'));
    }
    const out = report(result);
    console.log(out.text);
    process.exit(out.code);
}

module.exports = { scan, report, SELF_SERVICE, NOT_ACCOUNT_ROUTES };
