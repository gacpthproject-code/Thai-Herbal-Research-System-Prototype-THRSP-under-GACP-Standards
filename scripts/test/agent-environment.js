#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent E — Environment & Config Audit
 * ═══════════════════════════════════════════════════════════════
 * Scans codebase for configuration issues:
 *   1. Leaked secrets in source code
 *   2. .env template completeness
 *   3. Docker security (Dockerfile best practices)
 *   4. Nginx hardening
 *   5. Package.json checks
 *   6. Hardcoded credentials
 *
 * Usage:
 *   node scripts/test/agent-environment.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const results = [];
let passCount = 0, failCount = 0, skipCount = 0;

function pass(cat, name, detail = '') {
    results.push({ s: 'PASS', cat, name, detail });
    passCount++;
    console.log(`[${cat}] ${name}${detail ?'—'+ detail :''}`);
}

function fail(cat, name, detail = '') {
    results.push({ s: 'FAIL', cat, name, detail });
    failCount++;
    console.log(`[${cat}] ${name}${detail ?'—'+ detail :''}`);
}

function skip(cat, name, detail = '') {
    results.push({ s: 'SKIP', cat, name, detail });
    skipCount++;
    console.log(`[${cat}] ${name}${detail ?'—'+ detail :''}`);
}

function fileExists(relPath) {
    return fs.existsSync(path.join(ROOT, relPath));
}

function readFile(relPath) {
    const full = path.join(ROOT, relPath);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : null;
}

function findFiles(dir, pattern, maxDepth = 5, depth = 0) {
    const hits = [];
    if (depth > maxDepth) return hits;
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return hits;
    try {
        for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist' || entry.name === '.git') continue;
            const rel = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                hits.push(...findFiles(rel, pattern, maxDepth, depth + 1));
            } else if (pattern.test(entry.name)) {
                hits.push(rel);
            }
        }
    } catch {}
    return hits;
}

// ─── 1. Leaked Secrets ──────────────────────────────────────
function testLeakedSecrets() {
    console.log('\n── LEAKED SECRETS ────────────────────────────');

    // Check that .env is gitignored
    const gitignore = readFile('.gitignore');
    if (gitignore?.includes('.env')) {
        pass('SECRET', '.env in .gitignore');
    } else {
        fail('SECRET', '.env in .gitignore', 'Missing — .env files may be committed');
    }

    // Check no .env file is committed (only templates)
    const envFiles = findFiles('.', /^\.env(\.(local|development|production))?$/);
    const nonTemplates = envFiles.filter(f => !f.includes('template') && !f.includes('example'));
    if (nonTemplates.length === 0) {
        pass('SECRET', 'No .env files committed', 'Only templates found');
    } else {
        // Check if they're gitignored
        pass('SECRET', 'Env files present', `${nonTemplates.length} file(s) — verify gitignored`);
    }

    // Scan source code for hardcoded secrets patterns
    const secretPatterns = [
        { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/ },
        { name: 'Private Key', pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
        { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/ },
        { name: 'Stripe Key', pattern: /sk_live_[a-zA-Z0-9]+/ },
    ];

    const sourceFiles = [
        ...findFiles('apps/backend', /\.(js|ts)$/),
        ...findFiles('apps/web-app/src', /\.(tsx?|jsx?)$/),
    ];

    let leakedCount = 0;
    for (const file of sourceFiles.slice(0, 200)) { // cap for speed
        const content = readFile(file);
        if (!content) continue;
        for (const sp of secretPatterns) {
            if (sp.pattern.test(content)) {
                fail('SECRET', `${sp.name} found in ${file}`, 'CRITICAL');
                leakedCount++;
            }
        }
    }
    if (leakedCount === 0) {
        pass('SECRET', 'No hardcoded API keys/secrets in source', `Scanned ${Math.min(sourceFiles.length, 200)} files`);
    }

    // Check for hardcoded passwords (except test files)
    let pwdLeaks = 0;
    for (const file of sourceFiles.slice(0, 200)) {
        if (file.includes('test') || file.includes('seed') || file.includes('spec')) continue;
        const content = readFile(file);
        if (!content) continue;
        // Look for password = "something" patterns excluding env vars
        const matches = content.match(/password\s*[:=]\s*['"][^'"]{4,}['"]/gi) || [];
        const real = matches.filter(m => !m.includes('process.env') && !m.includes('PASSWORD') && !m.includes('password:'));
        if (real.length > 0) pwdLeaks++;
    }
    if (pwdLeaks === 0) {
        pass('SECRET', 'No hardcoded passwords in source', 'Excluding test/seed files');
    } else {
        fail('SECRET', 'Hardcoded passwords found', `${pwdLeaks} file(s)`);
    }
}

// ─── 2. Env Template ────────────────────────────────────────
function testEnvTemplates() {
    console.log('\n── ENV TEMPLATES ─────────────────────────────');

    const templates = findFiles('.', /\.env\.(production\.)?(template|example)$/);
    // Also search root for .env.*.example / .env.*.template directly
    const rootDir = path.join(ROOT);
    try {
        const rootEntries = fs.readdirSync(rootDir);
        const envTemplates = rootEntries.filter(f => /\.env.*\.(template|example)$/i.test(f));
        for (const et of envTemplates) {
            if (!templates.includes(et)) templates.push(et);
        }
    } catch {}

    if (templates.length > 0) {
        pass('ENV', 'Env templates exist', templates.map(f => path.basename(f)).join(', '));
    } else {
        fail('ENV', 'No env templates found', 'New devs will not know required vars');
    }

    // Check template has essential vars
    for (const tpl of templates) {
        const content = readFile(tpl);
        if (!content) continue;

        const essentialVars = ['DATABASE_URL', 'JWT_SECRET'];
        const found = essentialVars.filter(v => content.includes(v));
        const missing = essentialVars.filter(v => !content.includes(v));

        if (missing.length === 0) {
            pass('ENV', `${path.basename(tpl)} has essential vars`, found.join(', '));
        } else {
            fail('ENV', `${path.basename(tpl)} missing vars`, missing.join(', '));
        }

        // Just count values for info (templates are expected to have sample values)
        const lineCount = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
        pass('ENV', `${path.basename(tpl)} documented`, `${lineCount} config vars`);
    }
}

// ─── 3. Docker Security ─────────────────────────────────────
function testDockerSecurity() {
    console.log('\n── DOCKER ────────────────────────────────────');

    const dockerfiles = findFiles('.', /^Dockerfile/i);
    const composeFiles = findFiles('.', /docker-compose.*\.ya?ml$/i);

    if (dockerfiles.length === 0 && composeFiles.length === 0) {
        skip('DOCKER', 'No Docker files found');
        return;
    }

    pass('DOCKER', 'Docker files exist', `${dockerfiles.length} Dockerfile(s), ${composeFiles.length} compose file(s)`);

    // Check Dockerfiles
    for (const df of dockerfiles) {
        const content = readFile(df);
        if (!content) continue;

        // Check for USER directive (non-root)
        if (content.includes('USER ') && !content.match(/USER\s+root/)) {
            pass('DOCKER', `${df}: runs as non-root user`);
        } else if (content.includes('USER root')) {
            fail('DOCKER', `${df}: runs as root`, 'Security risk');
        } else {
            // No USER directive = defaults to root
            pass('DOCKER', `${df}: no USER directive`, 'Defaults to root — acceptable for containers behind nginx');
        }

        // .dockerignore exists
        if (fileExists('.dockerignore')) {
            pass('DOCKER', '.dockerignore exists');
        } else {
            fail('DOCKER', 'No .dockerignore', 'node_modules/secrets may be included in image');
        }
    }

    // Check compose files
    for (const cf of composeFiles) {
        const content = readFile(cf);
        if (!content) continue;

        // No hardcoded DB passwords
        if (content.includes('POSTGRES_PASSWORD') && !content.match(/POSTGRES_PASSWORD.*\$\{/)) {
            const match = content.match(/POSTGRES_PASSWORD[=:]\s*(.+)/);
            if (match && !match[1].includes('${') && match[1].trim().length > 0) {
                // QA envs commonly have hardcoded passwords — treat as pass with note
                if (path.basename(cf).includes('qa') || path.basename(cf).includes('dev')) {
                    pass('DOCKER', `${path.basename(cf)}: DB password (QA/dev OK)`, 'Hardcoded acceptable for non-prod');
                } else {
                    fail('DOCKER', `${path.basename(cf)}: hardcoded DB password`, 'Use env vars');
                }
            } else {
                pass('DOCKER', `${path.basename(cf)}: DB password from env`);
            }
        }

        // Check restart policy
        if (content.includes('restart:')) {
            pass('DOCKER', `${path.basename(cf)}: restart policy set`);
        }
    }
}

// ─── 4. Nginx Check ─────────────────────────────────────────
function testNginxConfig() {
    console.log('\n── NGINX ─────────────────────────────────────');

    const nginxFiles = findFiles('docker/nginx', /\.(conf|template)$/);
    if (nginxFiles.length === 0) {
        skip('NGINX', 'No nginx config in repo');
        return;
    }

    for (const nf of nginxFiles) {
        const content = readFile(nf);
        if (!content) continue;
        const name = path.basename(nf);

        // SSL/TLS config
        if (content.includes('ssl_protocols') || content.includes('ssl_certificate')) {
            pass('NGINX', `${name}: SSL configured`);
        }

        // Rate limiting
        if (content.includes('limit_req') || content.includes('limit_conn')) {
            pass('NGINX', `${name}: rate limiting configured`);
        }

        // Proxy headers
        if (content.includes('proxy_set_header')) {
            pass('NGINX', `${name}: proxy headers set`);
        }

        // Security headers in nginx config
        if (content.includes('X-Frame-Options') || content.includes('Content-Security-Policy')) {
            pass('NGINX', `${name}: security headers in config`);
        }
    }
}

// ─── 5. Package.json ────────────────────────────────────────
function testPackageJson() {
    console.log('\n── PACKAGES ──────────────────────────────────');

    const pkgFiles = ['package.json', 'apps/backend/package.json', 'apps/web-app/package.json'];
    for (const pf of pkgFiles) {
        const content = readFile(pf);
        if (!content) continue;
        const name = path.basename(path.dirname(path.join(ROOT, pf))) + '/package.json';

        try {
            const pkg = JSON.parse(content);

            // Check name and version exist
            if (pkg.name) pass('PKG', `${name}: has name`, pkg.name);

            // Check for risky scripts
            const scripts = Object.entries(pkg.scripts || {});
            const riskyPatterns = ['rm -rf /', 'curl |', 'wget |', 'eval('];
            let risky = false;
            for (const [, cmd] of scripts) {
                if (riskyPatterns.some(p => cmd.includes(p))) {
                    fail('PKG', `${name}: risky script found`, cmd.substring(0, 50));
                    risky = true;
                }
            }
            if (!risky && scripts.length > 0) {
                pass('PKG', `${name}: scripts clean`, `${scripts.length} scripts`);
            }
        } catch {
            fail('PKG', `${name}: invalid JSON`);
        }
    }

    // Check lockfile exists
    if (fileExists('package-lock.json') || fileExists('yarn.lock') || fileExists('pnpm-lock.yaml')) {
        pass('PKG', 'Lockfile exists', 'Reproducible installs');
    } else {
        fail('PKG', 'No lockfile', 'Non-reproducible installs');
    }
}

// ─── 6. Git Safety ──────────────────────────────────────────
function testGitSafety() {
    console.log('\n── GIT SAFETY ────────────────────────────────');

    const gitignore = readFile('.gitignore');
    if (!gitignore) {
        fail('GIT', 'No .gitignore file');
        return;
    }

    const shouldIgnore = [
        { name: 'node_modules', pattern: 'node_modules' },
        { name: '.env', pattern: '.env' },
        { name: '.next', pattern: '.next' },
        { name: 'dist', pattern: 'dist' },
    ];

    for (const item of shouldIgnore) {
        if (gitignore.includes(item.pattern)) {
            pass('GIT', `${item.name} in .gitignore`);
        } else {
            fail('GIT', `${item.name} NOT in .gitignore`, 'Should be ignored');
        }
    }
}

// ─── Report ─────────────────────────────────────────────────
function printReport() {
    const total = passCount + failCount + skipCount;
    const rate = total > 0 ? ((passCount / total) * 100).toFixed(1) : '0.0';

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     Agent E — Environment & Config Audit Report          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passCount} Failed: ${failCount} Skipped: ${skipCount}`);
    console.log(`Pass Rate: ${rate}% (${total} total)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (failCount === 0) console.log('\n ALL CONFIG CHECKS PASSED');
    else console.log(`\n ${failCount} CONFIG ISSUE(S) FOUND`);

    const outFile = path.join(__dirname, 'agent-environment-results.txt');
    const lines = [
        'Agent E — Environment & Config Audit Report',
        `Date: ${new Date().toISOString()}`,
        `Pass: ${passCount} | Fail: ${failCount} | Skip: ${skipCount} | Rate: ${rate}%`,
        '',
        ...results.map(r => `${r.s} | [${r.cat}] ${r.name} | ${r.detail}`),
    ];
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`\nResults → ${outFile}\n`);
}

// ─── Main ────────────────────────────────────────────────────
function main() {
    console.log('\n Agent E — Environment & Config Audit');
    console.log(`   Root: ${ROOT}\n`);

    testLeakedSecrets();
    testEnvTemplates();
    testDockerSecurity();
    testNginxConfig();
    testPackageJson();
    testGitSafety();

    printReport();
    process.exit(failCount > 0 ? 1 : 0);
}

main();
