'use strict';

/**
 * staging.gacpth.com runs the production contract (operator order 60(b), 2026-10-09).
 *
 * Until this change the staging overlay pinned NODE_ENV=staging, so a public host ran
 * every "not production" branch in the backend: the /api/e2e router mounted, error
 * details on two auth doors, a signing key / migration level / receipt allocator that
 * only warned at boot instead of refusing it. It now runs NODE_ENV=production like
 * demo, and GACP_DEPLOY_SLOT=staging alone tells it apart (config/auth-providers.js).
 *
 * The test 'every secret the production boot gate requires is forwarded into
 * backend-staging' is the one that would have caught the trap before a deploy. The
 * overlay has NO env_file: a variable reaches the container only when a `- NAME=`
 * line forwards it. A secret the production boot gate requires but the overlay does
 * not forward refuses the boot, and `restart: unless-stopped` turns that into a crash
 * loop. Measured on 2026-10-09 against the running staging container: the catalog
 * demanded S3_ACCESS_KEY and S3_SECRET_KEY, which the overlay never forwards because
 * staging stores files on its own volume (STORAGE_PROVIDER=local).
 *
 * No value is ever read here. Every forwarded name gets a long dummy, a literal line
 * keeps its literal (NODE_ENV, STORAGE_PROVIDER, ...), and the REAL catalog gate
 * decides. What this pins is structure — "the overlay forwards it" — not that the
 * host's env file holds a good value; that is the operator's, checked at boot.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const OVERLAY = 'docker-compose.staging.yml';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** The block of one service: from its key to the next key at the same indent. */
function serviceBlock(yml, service) {
    const start = yml.indexOf(`\n  ${service}:`);
    if (start === -1) { throw new Error(`${service} not found in ${OVERLAY}`); }
    const rest = yml.slice(start + 1);
    const next = rest.slice(2).search(/\n {2}[a-zA-Z][\w-]*:/);
    return next === -1 ? rest : rest.slice(0, next + 2);
}

/**
 * `- NAME=value` lines of the service's `environment:` list, as written. A YAML
 * comment after an unquoted value (`- STORAGE_PROVIDER=local   # why`) is not part
 * of the value, exactly as compose reads it.
 */
function environmentEntries(block) {
    const lines = block.split('\n');
    const start = lines.findIndex((l) => /^ {4}environment:\s*$/.test(l));
    if (start === -1) { throw new Error('no environment: list in the service block'); }
    const out = new Map();
    for (const line of lines.slice(start + 1)) {
        if (/^ {4}[a-zA-Z_][\w-]*:/.test(line)) { break; }
        const m = line.match(/^\s+-\s+([A-Z][A-Z0-9_]*)=(.*)$/);
        if (m) { out.set(m[1], m[2].replace(/\s+#.*$/, '').trim()); }
    }
    return out;
}

describe('staging overlay — the production contract', () => {
    const yml = read(OVERLAY);
    const backend = environmentEntries(serviceBlock(yml, 'backend-staging'));

    test('backend-staging runs NODE_ENV=production and keeps the slot marker', () => {
        expect(backend.get('NODE_ENV')).toBe('production');
        expect(backend.get('GACP_DEPLOY_SLOT')).toBe('staging');
    });

    test('backend-staging says STORAGE_PROVIDER=local out loud: only an explicit local lifts the S3 keys', () => {
        expect(backend.get('STORAGE_PROVIDER')).toBe('local');
    });

    test('no service in the overlay sets NODE_ENV to anything but production', () => {
        const values = [...yml.matchAll(/^\s+-\s+NODE_ENV=(\S+)/gm)].map((m) => m[1]);
        expect(values.length).toBeGreaterThan(0);
        expect([...new Set(values)]).toEqual(['production']);
    });

    test('every secret the production boot gate requires is forwarded into backend-staging', () => {
        const env = {};
        for (const [name, raw] of backend) {
            env[name] = raw.includes('${') ? 'x'.repeat(64) : raw;
        }
        const saved = process.env;
        process.env = env;
        jest.resetModules();
        try {
            const { validateSecretsForEnvironment } = require('../../config/secrets');
            const failures = validateSecretsForEnvironment('production').map((e) => `${e.name}:${e.reason}`);
            expect(failures).toEqual([]);
        } finally {
            process.env = saved;
            jest.resetModules();
        }
    });
});
