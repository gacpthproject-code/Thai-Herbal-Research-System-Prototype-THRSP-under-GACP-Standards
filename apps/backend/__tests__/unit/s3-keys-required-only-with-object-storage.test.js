'use strict';

/**
 * The STORAGE_PROVIDER table in config/storage-provider.js, pinned through each door that reads it.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { validateEnvironment } = require('../../config/env-validator');

const OBJECT_STORAGE_KEYS = ['S3_ACCESS_KEY', 'S3_SECRET_KEY'];
const SERVER_JS = path.join(__dirname, '..', '..', 'server.js');
const CHECK_SECRETS_JS = path.join(__dirname, '..', '..', 'scripts', 'check-secrets.js');
const UNREACHABLE_DATABASE_URL = 'postgresql://u:p@127.0.0.1:1/none';
const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:1/1';

const ACCEPTED_PROVIDERS = [
    ['unset', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['local', 'local'],
    ['" LOCAL " (case and spaces)', ' LOCAL '],
    ['minio', 'minio'],
    ['MinIO', 'MinIO'],
    ['s3', 's3'],
    ['" S3 " (case and spaces)', ' S3 '],
    ['minio between no-break spaces (trim removes them)', '\u00A0minio\u00A0'],
];

const UNRECOGNISED_PROVIDERS = [
    ['a typo (mini0)', 'mini0'],
    ['another provider (aws)', 'aws'],
    ['two words', 'local minio'],
    ['a zero-width space after local', 'local\u200b'],
    ['a zero-width space before minio', '\u200bminio'],
    ['a zero-width space inside s3', 's\u200b3'],
    ['a no-break space inside local', 'loc\u00A0al'],
    ['the name of an inherited object property', 'constructor'],
    ['__proto__', '__proto__'],
];

/** Every other secret the production gate requires, valid; built from the catalog itself. */
function productionEnvWithoutS3Keys(extra = {}) {
    jest.resetModules();
    const { SECRETS_CATALOG } = require('../../config/secrets');
    const env = {};
    for (const [name, spec] of Object.entries(SECRETS_CATALOG)) {
        if (OBJECT_STORAGE_KEYS.includes(name)) { continue; }
        if (spec.required === 'always' || spec.required === 'production') {
            env[name] = 'x'.repeat(64);
        }
    }
    return { ...env, ...extra };
}

/** Run `body` with process.env replaced wholesale and a fresh module registry. */
function withProcessEnv(env, body) {
    const saved = process.env;
    process.env = { ...env };
    jest.resetModules();
    try {
        return body();
    } finally {
        process.env = saved;
        jest.resetModules();
    }
}

describe('S3 keys follow STORAGE_PROVIDER — the production secret gate', () => {
    test.each([
        ['local', 'local'],
        ['" LOCAL " (case and spaces)', ' LOCAL '],
        ['local between no-break spaces', '\u00A0local\u00A0'],
    ])('does not require the S3 keys when STORAGE_PROVIDER is explicitly %s', (_label, provider) => {
        withProcessEnv(productionEnvWithoutS3Keys({ STORAGE_PROVIDER: provider }), () => {
            const { validateSecretsForEnvironment } = require('../../config/secrets');
            expect(validateSecretsForEnvironment('production')).toEqual([]);
        });
    });

    test.each([
        ['unset', undefined],
        ['empty', ''],
        ['blank', '   '],
        ['minio', 'minio'],
        ['s3 (alias)', 's3'],
        ['" S3 " (case and spaces)', ' S3 '],
        ['MINIO', 'MINIO'],
        ...UNRECOGNISED_PROVIDERS,
    ])('requires both S3 keys when STORAGE_PROVIDER is %s: only an explicit local lifts them', (_label, provider) => {
        const env = productionEnvWithoutS3Keys(provider === undefined ? {} : { STORAGE_PROVIDER: provider });
        withProcessEnv(env, () => {
            const { validateSecretsForEnvironment } = require('../../config/secrets');
            const errors = validateSecretsForEnvironment('production');
            expect(errors.map((e) => [e.name, e.reason])).toEqual([
                ['S3_ACCESS_KEY', 'MISSING_OR_PENDING'],
                ['S3_SECRET_KEY', 'MISSING_OR_PENDING'],
            ]);
        });
    });

    test('the failure record names the switch that made the keys required, and the way out', () => {
        withProcessEnv(productionEnvWithoutS3Keys({ STORAGE_PROVIDER: 'minio' }), () => {
            const { validateSecretsForEnvironment } = require('../../config/secrets');
            for (const error of validateSecretsForEnvironment('production')) {
                expect(error.spec.requiredOnlyWhen).toMatch(/STORAGE_PROVIDER/);
            }
        });
        withProcessEnv(productionEnvWithoutS3Keys(), () => {
            const { validateSecretsForEnvironment } = require('../../config/secrets');
            for (const error of validateSecretsForEnvironment('production')) {
                expect(error.spec.requiredOnlyWhen).toMatch(/STORAGE_PROVIDER is not local/);
            }
        });
    });

    test('the MINIO_* aliases still satisfy an object-storage box', () => {
        const env = productionEnvWithoutS3Keys({
            STORAGE_PROVIDER: 'minio',
            MINIO_ACCESS_KEY: 'alias-access-key',
            MINIO_SECRET_KEY: 'alias-secret-key',
        });
        withProcessEnv(env, () => {
            const { validateSecretsForEnvironment } = require('../../config/secrets');
            expect(validateSecretsForEnvironment('production')).toEqual([]);
        });
    });

    test('an unset provider with both keys present passes', () => {
        const env = productionEnvWithoutS3Keys({ S3_ACCESS_KEY: 'access', S3_SECRET_KEY: 'secret' });
        withProcessEnv(env, () => {
            const { validateSecretsForEnvironment } = require('../../config/secrets');
            expect(validateSecretsForEnvironment('production')).toEqual([]);
        });
    });
});

describe('S3 keys follow STORAGE_PROVIDER — the boot guard (config/boot-secret-guard.js)', () => {
    function boot(env) {
        return withProcessEnv(env, () => {
            const guard = require('../../config/boot-secret-guard');
            const exit = jest.fn();
            const written = [];
            const result = guard.validateProductionSecretsAtBoot({
                env, exit, stderr: { write: (s) => { written.push(String(s)); return true; } },
            });
            return { result, exit, stderr: written.join('') };
        });
    }

    test('production + local storage + no S3 keys: boots', () => {
        const { result, exit } = boot(productionEnvWithoutS3Keys({ NODE_ENV: 'production', STORAGE_PROVIDER: 'local' }));
        expect(exit).not.toHaveBeenCalled();
        expect(result).toMatchObject({ ok: true, skipped: false, errors: [] });
    });

    test('production + object storage + no S3 keys: still refuses, naming both keys', () => {
        const { exit, stderr } = boot(productionEnvWithoutS3Keys({ NODE_ENV: 'production', STORAGE_PROVIDER: 'minio' }));
        expect(exit).toHaveBeenCalledWith(1);
        expect(stderr).toMatch(/S3_ACCESS_KEY/);
        expect(stderr).toMatch(/S3_SECRET_KEY/);
    });

    test.each([
        ['unset', {}],
        ['empty', { STORAGE_PROVIDER: '' }],
    ])('production + STORAGE_PROVIDER %s + no S3 keys: refuses, naming both keys', (_label, extra) => {
        const { exit, stderr } = boot(productionEnvWithoutS3Keys({ NODE_ENV: 'production', ...extra }));
        expect(exit).toHaveBeenCalledWith(1);
        expect(stderr).toMatch(/S3_ACCESS_KEY/);
        expect(stderr).toMatch(/S3_SECRET_KEY/);
    });

    test('the refusal tells the operator which switch made the keys required', () => {
        const { stderr } = boot(productionEnvWithoutS3Keys({ NODE_ENV: 'production', STORAGE_PROVIDER: 'minio' }));
        expect(stderr).toMatch(/Required because: STORAGE_PROVIDER/);
    });

    test('an unset provider is told the way out: set STORAGE_PROVIDER to local', () => {
        const { stderr } = boot(productionEnvWithoutS3Keys({ NODE_ENV: 'production' }));
        expect(stderr).toMatch(/Required because: STORAGE_PROVIDER is not local/);
    });
});

describe('S3 keys follow STORAGE_PROVIDER — getSecret at use time', () => {
    test('a local-storage production box gets null, not a throw', () => {
        withProcessEnv(productionEnvWithoutS3Keys({ NODE_ENV: 'production', STORAGE_PROVIDER: 'local' }), () => {
            const { getSecret } = require('../../config/secrets');
            expect(getSecret('S3_ACCESS_KEY')).toBeNull();
            expect(getSecret('S3_SECRET_KEY')).toBeNull();
        });
    });

    test.each([
        ['minio', { STORAGE_PROVIDER: 'minio' }],
        ['unset', {}],
    ])('a production box with STORAGE_PROVIDER %s still throws for a missing key', (_label, extra) => {
        withProcessEnv(productionEnvWithoutS3Keys({ NODE_ENV: 'production', ...extra }), () => {
            const { getSecret } = require('../../config/secrets');
            expect(() => getSecret('S3_ACCESS_KEY')).toThrow(/required in production/);
        });
    });
});

describe('S3 keys follow STORAGE_PROVIDER — the pre-deploy gate (scripts/check-secrets.js, run by scripts/deploy-prod.sh)', () => {
    function runCheckSecrets(env) {
        const r = spawnSync(process.execPath, [CHECK_SECRETS_JS, '--env=production'], {
            env: { PATH: process.env.PATH, ...env },
            encoding: 'utf8',
            timeout: 30000,
        });
        return { status: r.status, output: `${r.stdout || ''}${r.stderr || ''}` };
    }

    test('fails when STORAGE_PROVIDER is unset and the S3 keys are missing', () => {
        const { status, output } = runCheckSecrets(productionEnvWithoutS3Keys());
        expect(output).toMatch(/S3_ACCESS_KEY/);
        expect(output).toMatch(/S3_SECRET_KEY/);
        expect(status).toBe(1);
    });

    test('passes when STORAGE_PROVIDER is explicitly local and the S3 keys are missing', () => {
        const { status, output } = runCheckSecrets(productionEnvWithoutS3Keys({ STORAGE_PROVIDER: 'local' }));
        expect(output).not.toMatch(/S3_ACCESS_KEY/);
        expect(status).toBe(0);
    });

    test('passes when STORAGE_PROVIDER is unset and the S3 keys are set', () => {
        const { status } = runCheckSecrets(productionEnvWithoutS3Keys({ S3_ACCESS_KEY: 'access', S3_SECRET_KEY: 'secret' }));
        expect(status).toBe(0);
    });
});

describe('STORAGE_PROVIDER is local, minio, s3 or nothing — environment validation (config/env-validator.js)', () => {
    const VALID_PRODUCTION_ENV = {
        DATABASE_URL: 'postgresql://u:p@db.example.test:5432/gacp',
        REDIS_URL: 'redis://redis.example.test:6379',
        ENCRYPTION_KEY: 'k'.repeat(40),
        HEALTH_JWT_SECRET: 'h'.repeat(40),
        PROVIDER_JWT_SECRET: 'p'.repeat(40),
    };

    function validateWith(mode, provider) {
        const env = { ...(mode === 'production' ? VALID_PRODUCTION_ENV : {}), NODE_ENV: mode };
        if (provider !== undefined) { env.STORAGE_PROVIDER = provider; }
        const saved = process.env;
        process.env = env;
        try {
            return validateEnvironment(mode);
        } finally {
            process.env = saved;
        }
    }

    const aboutStorage = (messages) => messages.filter((m) => /STORAGE_PROVIDER/.test(m));

    describe('in production', () => {
        test.each(ACCEPTED_PROVIDERS)('accepts %s', (_label, provider) => {
            expect(validateWith('production', provider)).toMatchObject({ isValid: true, errors: [] });
        });

        test.each(UNRECOGNISED_PROVIDERS)('refuses the boot for %s, naming STORAGE_PROVIDER', (_label, provider) => {
            const result = validateWith('production', provider);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toMatch(/STORAGE_PROVIDER/);
            expect(result.isValid).toBe(false);
        });

        test('the refusal lists the accepted words', () => {
            const message = validateWith('production', 'mini0').errors.join('\n');
            expect(message).toMatch(/local/);
            expect(message).toMatch(/minio/);
            expect(message).toMatch(/s3/);
        });

        test('the refusal never prints the value it refused (a mis-pasted line can carry a secret into it)', () => {
            const pasted = 'zz-not-a-provider-7f3a91';
            const result = validateWith('production', pasted);
            expect(result.errors).toHaveLength(1);
            expect(JSON.stringify(result)).not.toContain(pasted);
        });
    });

    describe.each(['development', 'test', 'staging'])('outside production (NODE_ENV=%s)', (mode) => {
        test('says nothing about any accepted value', () => {
            for (const [label, provider] of ACCEPTED_PROVIDERS) {
                const { warnings, errors } = validateWith(mode, provider);
                expect({ label, errors, warned: aboutStorage(warnings) }).toEqual({ label, errors: [], warned: [] });
            }
        });

        test.each(UNRECOGNISED_PROVIDERS)('warns about %s and still boots', (_label, provider) => {
            const result = validateWith(mode, provider);
            expect(aboutStorage(result.warnings)).toHaveLength(1);
            expect(result.errors).toEqual([]);
            expect(result.isValid).toBe(true);
        });

        test('the warning never prints the value either, for the same reason', () => {
            const pasted = 'zz-not-a-provider-7f3a91';
            expect(JSON.stringify(validateWith(mode, pasted))).not.toContain(pasted);
        });
    });
});

describe('STORAGE_PROVIDER — the real entry point (server.js) refuses a production boot on an unrecognised value, staging slot included', () => {
    function bootRealServer(provider) {
        const r = spawnSync(process.execPath, [SERVER_JS], {
            env: {
                PATH: process.env.PATH,
                NODE_ENV: 'production',
                GACP_DEPLOY_SLOT: 'staging',
                DATABASE_URL: UNREACHABLE_DATABASE_URL,
                REDIS_URL: UNREACHABLE_REDIS_URL,
                ENCRYPTION_KEY: 'k'.repeat(40),
                HEALTH_JWT_SECRET: 'h'.repeat(40),
                PROVIDER_JWT_SECRET: 'p'.repeat(40),
                STORAGE_PROVIDER: provider,
            },
            encoding: 'utf8',
            timeout: 30000,
        });
        return { status: r.status, output: `${r.stdout || ''}${r.stderr || ''}` };
    }

    test.each([
        ['a typo (mini0)', 'mini0'],
        ['another provider (aws)', 'aws'],
        ['local followed by a zero-width space', 'local\u200b'],
    ])('exits 1 at environment validation for %s, naming STORAGE_PROVIDER', (_label, provider) => {
        const { status, output } = bootRealServer(provider);
        expect(output).toMatch(/STARTUP FAILED - Environment validation failed/);
        expect(output).toMatch(/STORAGE_PROVIDER/);
        // The secret guard runs next and also exits 1; reaching it means validation did not stop the boot.
        expect(output).not.toMatch(/OPERATOR_INTERVENTION_REQUIRED/);
        expect(status).toBe(1);
    }, 40000);
});

describe('storage-service keeps choosing its backend exactly as before (characterization)', () => {
    test.each([
        ['unset', undefined, 'local', false],
        ['empty', '', 'local', false],
        ['local', 'local', 'local', false],
        ['" LOCAL " (case and spaces)', ' LOCAL ', 'local', false],
        ['minio', 'minio', 'minio', true],
        ['s3 (alias for minio)', 's3', 'minio', true],
        ['" S3 " (case and spaces)', ' S3 ', 'minio', true],
        ['MINIO', 'MINIO', 'minio', true],
        ['an unrecognised word, outside production (gcs)', 'gcs', 'gcs', false],
        ['a typo, outside production (mini0)', 'mini0', 'mini0', false],
    ])('STORAGE_PROVIDER %s', (_label, raw, provider, cloud) => {
        const env = raw === undefined ? {} : { STORAGE_PROVIDER: raw };
        withProcessEnv(env, () => {
            const storage = require('../../services/storage-service');
            expect(storage.STORAGE_PROVIDER).toBe(provider);
            expect(storage.isCloudStorageEnabled()).toBe(cloud);
        });
    });

    test('a blank value writes to local disk, like an unset one', () => {
        withProcessEnv({ STORAGE_PROVIDER: '   ' }, () => {
            const storage = require('../../services/storage-service');
            expect(storage.isCloudStorageEnabled()).toBe(false);
        });
    });
});

describe('STORAGE_PROVIDER has one reader (config/storage-provider.js)', () => {
    /**
     * Both security findings came from two readers answering different questions with different
     * defaults. A third reading would bring that back, so no backend source file but the reader
     * may read the variable.
     */
    const BACKEND = path.join(__dirname, '..', '..');
    const NOT_SOURCE = new Set(['node_modules', '__tests__', 'tests', 'test-support', 'chaos-tests', 'public', 'coverage']);
    const READS_IT = [
        /\benv\.STORAGE_PROVIDER\b/,
        /\benv\[\s*['"`]STORAGE_PROVIDER['"`]\s*\]/,
        /\{[^}]*\bSTORAGE_PROVIDER\b[^}]*\}\s*=\s*(?:process\.)?env\b/,
    ];

    function sourceFiles(dir) {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { return NOT_SOURCE.has(entry.name) ? [] : sourceFiles(full); }
            return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
        });
    }

    test('no other backend source file reads the variable', () => {
        const readers = sourceFiles(BACKEND)
            .filter((file) => READS_IT.some((pattern) => pattern.test(fs.readFileSync(file, 'utf8'))))
            .map((file) => path.relative(BACKEND, file).split(path.sep).join('/'));
        expect(readers).toEqual(['config/storage-provider.js']);
    });
});

describe('check-secrets CLI explains a conditional requirement', () => {
    test('formatHuman names the switch that made the key required', () => {
        const { formatHuman } = require('../../scripts/check-secrets');
        const out = formatHuman([{
            name: 'S3_ACCESS_KEY',
            reason: 'MISSING_OR_PENDING',
            spec: {
                required: 'production',
                description: 'S3/MinIO access key ID for object storage',
                requiredOnlyWhen: 'STORAGE_PROVIDER is not local',
                usedIn: [],
            },
        }], 'production');
        expect(out).toMatch(/S3_ACCESS_KEY/);
        expect(out).toMatch(/only when STORAGE_PROVIDER is not local/);
    });
});
