'use strict';

/**
 * The staging slot on the demo host (operator order 164(3), 2026-11-07).
 *
 * staging.gacpth.com now runs on the SAME machine as demo.gacpth.com, merged as
 *
 *   docker-compose.production.yml + docker-compose.staging.yml + docker-compose.staging-on-demo-host.yml
 *
 * next to demo's own model
 *
 *   docker-compose.production.yml + docker-compose.demo.yml
 *
 * Every separation claim the overlay's comments make (own containers, ports,
 * volumes, network, database; no secret with a built-in fallback) lives in YAML
 * that no backend unit test can see, and a regex over one file cannot see what
 * the MERGED model holds — the default that leaks in from the middle file is the
 * whole point (independent review of affc9ed79, MEDIUM-3). So this test parses
 * the three files and merges them the way Compose does, then asserts on the
 * result.
 *
 * Merge rules implemented (Compose spec "merge"): mappings merge key by key;
 * `ports` concatenate; `volumes` merge by container path; `environment`,
 * `networks`, `depends_on` merge by key (list form normalised to a map); any
 * other sequence is replaced; `!reset` removes the value; `!override` replaces
 * it whole. Cross-checked by hand against `docker compose config` on the files
 * of this commit (same containers, ports, volumes, networks, memory limits).
 *
 * YAML parser: js-yaml, resolved through eslint (a devDependency of the
 * backend) because the backend declares no YAML library of its own.
 *
 * No value is ever read from a real env file. Interpolation runs against a
 * small fake environment; a `${VAR:?}` with no value becomes a placeholder.
 */

const fs = require('fs');
const path = require('path');

const yaml = require(require.resolve('js-yaml', {
    paths: [path.dirname(require.resolve('eslint/package.json'))],
}));

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const SLOT_OFF_PROFILE = 'not-on-staging-slot';
const MEMORY_BUDGET_MIB = 4096;

// ---------------------------------------------------------------- YAML tags
class Reset { }
class Override { constructor(value) { this.value = value; } }
const tagTypes = [];
for (const kind of ['scalar', 'sequence', 'mapping']) {
    tagTypes.push(new yaml.Type('!reset', { kind, construct: () => new Reset() }));
    tagTypes.push(new yaml.Type('!override', {
        kind,
        construct: (d) => new Override(d === null || d === undefined ? (kind === 'mapping' ? {} : kind === 'sequence' ? [] : '') : d),
    }));
}
const SCHEMA = yaml.DEFAULT_SCHEMA.extend(tagTypes);
const load = (f) => yaml.load(read(f), { schema: SCHEMA, filename: f });

// ---------------------------------------------------------------- merge
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
    && !(v instanceof Reset) && !(v instanceof Override);

function listToMap(v, splitEq) {
    if (!Array.isArray(v)) { return v; }
    const out = {};
    for (const item of v) {
        if (splitEq) {
            const s = String(item);
            const i = s.indexOf('=');
            out[i === -1 ? s : s.slice(0, i)] = i === -1 ? null : s.slice(i + 1);
        } else {
            out[String(item)] = {};
        }
    }
    return out;
}

function volumeTarget(v) {
    if (isMap(v)) { return v.target; }
    const parts = String(v).split(':');
    return parts.length === 1 ? parts[0] : parts[1];
}

function normaliseService(svc) {
    const s = { ...svc };
    if (Array.isArray(s.environment)) { s.environment = listToMap(s.environment, true); }
    if (Array.isArray(s.networks)) { s.networks = listToMap(s.networks, false); }
    if (Array.isArray(s.depends_on)) { s.depends_on = listToMap(s.depends_on, false); }
    return s;
}

function deepMerge(base, over, keyPath) {
    const out = { ...(base || {}) };
    for (const [k, v] of Object.entries(over || {})) {
        const here = keyPath ? `${keyPath}.${k}` : k;
        if (v instanceof Reset) { delete out[k]; continue; }
        if (v instanceof Override) { out[k] = v.value; continue; }
        if (here === 'ports' && Array.isArray(v)) {
            out[k] = [...new Set([...(out[k] || []), ...v].map(String))];
            continue;
        }
        if (here === 'volumes' && Array.isArray(v)) {
            const byTarget = new Map((out[k] || []).map((x) => [volumeTarget(x), x]));
            for (const x of v) { byTarget.set(volumeTarget(x), x); }
            out[k] = [...byTarget.values()];
            continue;
        }
        if (isMap(v) && isMap(out[k])) { out[k] = deepMerge(out[k], v, here); continue; }
        out[k] = v;
    }
    return out;
}

function mergeCompose(files) {
    const model = { services: {}, networks: {}, volumes: {} };
    for (const f of files) {
        const doc = load(f);
        for (const [name, svc] of Object.entries(doc.services || {})) {
            const over = normaliseService(svc || {});
            model.services[name] = name in model.services
                ? deepMerge(model.services[name], over, '')
                : deepMerge({}, over, '');
        }
        for (const top of ['networks', 'volumes']) {
            for (const [name, def] of Object.entries(doc[top] || {})) {
                model[top][name] = deepMerge(model[top][name] || {}, def || {}, '');
            }
        }
    }
    return model;
}

// ---------------------------------------------------------------- interpolation
/** ${VAR}, ${VAR:-default}, ${VAR-default}, ${VAR:?err}, ${VAR?err}, nested, $$ */
function interpolate(str, env) {
    if (typeof str !== 'string') { return str; }
    let out = '';
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '$' && str[i + 1] === '$') { out += '$'; i++; continue; }
        if (str[i] === '$' && str[i + 1] === '{') {
            let depth = 1;
            let j = i + 2;
            for (; j < str.length && depth > 0; j++) {
                if (str[j] === '{') { depth++; }
                if (str[j] === '}') { depth--; }
            }
            const body = str.slice(i + 2, j - 1);
            const m = body.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?])([\s\S]*))?$/);
            if (!m) { throw new Error(`bad interpolation ${body}`); }
            const [, name, op, rest] = m;
            const val = env[name];
            const unset = val === undefined;
            const empty = unset || val === '';
            if (!op) { out += unset ? '' : val; }
            else if (op === ':-') { out += empty ? interpolate(rest, env) : val; }
            else if (op === '-') { out += unset ? interpolate(rest, env) : val; }
            else if (op === ':?' || op === '?') {
                out += (op === ':?' ? empty : unset) ? `<required:${name}>` : val;
            }
            i = j - 1;
            continue;
        }
        out += str[i];
    }
    return out;
}

function interpolateDeep(v, env) {
    if (typeof v === 'string') { return interpolate(v, env); }
    if (Array.isArray(v)) { return v.map((x) => interpolateDeep(x, env)); }
    if (isMap(v)) {
        const o = {};
        for (const [k, x] of Object.entries(v)) { o[k] = interpolateDeep(x, env); }
        return o;
    }
    return v;
}

// ---------------------------------------------------------------- model helpers
// A hostile env file: DATABASE_URL aimed at demo's Supabase. The overlay must
// build its own URL so this value never reaches backend-staging.
const FAKE_ENV = {
    DATABASE_URL: 'postgresql://demo:pw@db.demo-supabase.example:6543/postgres',
};

const STAGING_FILES = [
    'docker-compose.production.yml',
    'docker-compose.staging.yml',
    'docker-compose.staging-on-demo-host.yml',
];
const DEMO_FILES = ['docker-compose.production.yml', 'docker-compose.demo.yml'];

const stagingRaw = mergeCompose(STAGING_FILES);
const demoRaw = mergeCompose(DEMO_FILES);
const staging = interpolateDeep(stagingRaw, FAKE_ENV);
const demo = interpolateDeep(demoRaw, FAKE_ENV);

const slotServices = Object.entries(staging.services)
    .filter(([, s]) => !(s.profiles || []).includes(SLOT_OFF_PROFILE));

function publishedPorts(svc) {
    return (svc.ports || []).map((p) => {
        if (isMap(p)) { return String(p.published); }
        const parts = String(p).split(':');
        // ip:host:container | host:container | container (not published)
        if (parts.length === 3) { return parts[1]; }
        if (parts.length === 2) { return parts[0]; }
        return null;
    }).filter(Boolean);
}

function namedVolumeKeys(svc) {
    return (svc.volumes || []).map((v) => {
        if (isMap(v)) { return v.type === 'volume' || !v.type ? v.source : null; }
        const src = String(v).split(':')[0];
        return /^[A-Za-z0-9][\w.-]*$/.test(src) ? src : null; // not a path
    }).filter(Boolean);
}

const volumeName = (model, key) => (model.volumes[key] && model.volumes[key].name) || key;
const networkName = (model, key) => (model.networks[key] && model.networks[key].name) || key;

function memMiB(v) {
    if (v === undefined || v === null) { return NaN; }
    if (typeof v === 'number') { return v / (1024 * 1024); }
    const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*([kmgKMG]?)[bB]?$/);
    if (!m) { return NaN; }
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'g') { return n * 1024; }
    if (unit === 'm') { return n; }
    if (unit === 'k') { return n / 1024; }
    return n / (1024 * 1024);
}

function demoAll(fn) {
    return new Set(Object.values(demo.services).flatMap(fn));
}

// ---------------------------------------------------------------- tests
describe('staging slot on the demo host — merged compose model', () => {
    test('the slot starts the services the runbook expects', () => {
        expect(slotServices.map(([n]) => n).sort()).toEqual(
            ['backend-staging', 'frontend-staging', 'minio', 'nginx', 'postgres', 'redis'],
        );
        // A slot service carrying any profile would not start on `up -d`, and
        // the memory sum below would be counting a service that never runs.
        for (const [name, s] of slotServices) {
            expect({ name, profiles: s.profiles || [] }).toEqual({ name, profiles: [] });
        }
    });

    test('no container name is shared with demo', () => {
        const demoNames = demoAll((s) => (s.container_name ? [s.container_name] : []));
        for (const [name, s] of slotServices) {
            expect(s.container_name).toBeTruthy();
            expect({ name, container: s.container_name, clashesWithDemo: demoNames.has(s.container_name) })
                .toEqual({ name, container: s.container_name, clashesWithDemo: false });
        }
        // Every container name in the staging project, even switched-off ones.
        for (const [name, s] of Object.entries(staging.services)) {
            expect({ name, clashesWithDemo: demoNames.has(s.container_name) })
                .toEqual({ name, clashesWithDemo: false });
        }
    });

    test('no published host port is shared with demo', () => {
        const demoPorts = demoAll(publishedPorts);
        for (const [name, s] of slotServices) {
            for (const p of publishedPorts(s)) {
                expect({ name, port: p, clashesWithDemo: demoPorts.has(p) })
                    .toEqual({ name, port: p, clashesWithDemo: false });
            }
        }
        // Switched-off services publish nothing either.
        for (const [name, s] of Object.entries(staging.services)) {
            if (!(s.profiles || []).includes(SLOT_OFF_PROFILE)) { continue; }
            for (const p of publishedPorts(s)) {
                expect({ name, port: p, clashesWithDemo: demoPorts.has(p) })
                    .toEqual({ name, port: p, clashesWithDemo: false });
            }
        }
    });

    test('no volume name is shared with demo, every one is gacp-staging-*, none is external', () => {
        const demoVolumes = new Set(Object.keys(demo.volumes).map((k) => volumeName(demo, k)));
        for (const [key, def] of Object.entries(staging.volumes)) {
            const name = volumeName(staging, key);
            expect({ key, name, prefixed: name.startsWith('gacp-staging-') })
                .toEqual({ key, name, prefixed: true });
            expect({ key, external: Boolean(def.external) }).toEqual({ key, external: false });
            expect({ key, name, clashesWithDemo: demoVolumes.has(name) })
                .toEqual({ key, name, clashesWithDemo: false });
        }
        for (const [svc, s] of slotServices) {
            for (const key of namedVolumeKeys(s)) {
                expect({ svc, key, declared: key in staging.volumes }).toEqual({ svc, key, declared: true });
            }
        }
    });

    test('no network name is shared with demo, none is external, every one has a pinned subnet', () => {
        const demoNetworks = new Set(Object.keys(demo.networks).map((k) => networkName(demo, k)));
        const used = new Set(slotServices.flatMap(([, s]) => Object.keys(s.networks || {})));
        expect(used.size).toBeGreaterThan(0);
        const subnets = [];
        for (const key of used) {
            const def = staging.networks[key] || {};
            const name = networkName(staging, key);
            expect({ key, name, clashesWithDemo: demoNetworks.has(name) })
                .toEqual({ key, name, clashesWithDemo: false });
            expect({ key, external: Boolean(def.external) }).toEqual({ key, external: false });
            const cfg = ((def.ipam || {}).config || []).filter((c) => c && c.subnet);
            expect({ key, name, pinnedSubnet: cfg.length > 0 }).toEqual({ key, name, pinnedSubnet: true });
            subnets.push(...cfg.map((c) => c.subnet));
        }
        expect(new Set(subnets).size).toBe(subnets.length);
    });

    test('backend-staging DATABASE_URL points at this slot\'s postgres, whatever the env file says', () => {
        const url = staging.services['backend-staging'].environment.DATABASE_URL;
        const host = (String(url).match(/^postgres(?:ql)?:\/\/[^@]*@([^:/?]+)/) || [])[1];
        expect(host).toBe('postgres');
        // and `postgres` on this slot is the staging container
        expect(staging.services.postgres.container_name).toBe('gacp-staging-postgres');
    });

    test(`memory limits of the started slot services sum to at most ${MEMORY_BUDGET_MIB} MiB`, () => {
        let total = 0;
        for (const [name, s] of slotServices) {
            const lim = memMiB((((s.deploy || {}).resources || {}).limits || {}).memory);
            expect({ name, hasMemoryLimit: Number.isFinite(lim) }).toEqual({ name, hasMemoryLimit: true });
            total += lim;
        }
        expect(total).toBeLessThanOrEqual(MEMORY_BUDGET_MIB);
    });

    test('PARTNER_TRACE_API_KEY has no built-in default in the merged backend-staging env', () => {
        const raw = stagingRaw.services['backend-staging'].environment.PARTNER_TRACE_API_KEY;
        expect(typeof raw).toBe('string');
        expect(raw).toMatch(/^\$\{[A-Z_][A-Z0-9_]*:\?[^}]*\}$/);
        expect(raw).not.toMatch(/:-/);
    });
});
