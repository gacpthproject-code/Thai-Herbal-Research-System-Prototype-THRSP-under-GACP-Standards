/**
 * nginx-exposure.test.js
 *
 * Two nginx behaviours that read as safe and are not.
 *
 * THE WHITELIST THAT ALLOWS EVERYONE. `nginx/gacp.production.conf` runs inside
 * a container and only ever receives connections proxied from the host nginx,
 * so `$remote_addr` there is the Docker bridge — never a visitor's address. Its
 * `location /pgadmin/` block reads
 *
 *     allow 127.0.0.0/8; allow 172.16.0.0/12; allow 10.0.0.0/8; deny all;
 *
 * and `172.16.0.0/12` covers every Docker bridge address, so `deny all` can
 * never fire. Meanwhile the host config that DOES see the real client had no
 * `/pgadmin/` location at all, so the request fell through its catch-all and
 * reached the database console. An IP restriction written at the wrong layer is
 * worse than none, because the comment above it says the console is protected.
 *
 * THE HEADERS THAT VANISH. nginx does not merge `add_header`: a block that
 * declares any header of its own inherits none from its parent. Six locations
 * in the same file each set a `Cache-Control` or `X-Robots-Tag`, and so silently
 * drop all nine server-level security headers — including on `location /`,
 * which serves every page, and `location /api/`, which serves every API
 * response. The directives are present in the file and absent from the wire.
 *
 * These assertions are about config text rather than a live server, so they
 * hold in CI where no nginx is running.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isAllowed, readGateConfig } = require('../../../../scripts/ci/check-access-allowlist');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const HOST_CONF = path.join(REPO_ROOT, 'deploy', 'nginx', 'gacp-platform.conf');
const DOCKER_CONF = path.join(REPO_ROOT, 'nginx', 'gacp.production.conf');

const DEMO_HOST = path.join(REPO_ROOT, 'deploy', 'nginx', 'demo-host');
const CONF_D = path.join(DEMO_HOST, 'etc', 'nginx', 'conf.d');
const DEFAULT_VHOST = path.join(CONF_D, '00-gacp-platform.conf');

const read = (file) => fs.readFileSync(file, 'utf8');
const liveLines = (file) => read(file)
    .split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter((l) => !l.text.trim().startsWith('#'));

function stripCommentAndQuotes(line) {
    let quote = null;
    let unquoted = '';
    for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        if (quote) {
            if (c === '\\') {i += 1; continue;}
            if (c === quote) {quote = null;}
            continue;
        }
        if (c === '#') {return { uncommented: line.slice(0, i), unquoted };}
        if (c === '"' || c === "'") {quote = c; continue;}
        unquoted += c;
    }
    return { uncommented: line, unquoted };
}

function serverBlocks(file) {
    const lines = read(file).split('\n').map(stripCommentAndQuotes);
    const blocks = [];
    let current = null;
    let depth = 0;
    for (const { uncommented: text, unquoted } of lines) {
        if (!current && /^\s*server\s*\{/.test(unquoted)) {
            current = [];
            depth = 0;
        }
        if (!current) {continue;}
        current.push({ text, depth });
        depth += (unquoted.match(/\{/g) || []).length - (unquoted.match(/\}/g) || []).length;
        if (depth === 0) {
            blocks.push(current);
            current = null;
        }
    }
    return blocks.map((body) => {
        const text = body.map((l) => l.text).join('\n');
        const names = (text.match(/^\s*server_name\s+([^;]+);/m) || [, ''])[1].split(/\s+/);
        const serverLevel = body.filter((l) => l.depth === 1).map((l) => l.text.trim()).filter(Boolean);
        return { text, names, serverLevel };
    });
}

const REWRITE_PHASE = /^(if|return|rewrite|set)\b/;
const rewritePhase = (block) => block.serverLevel.filter((l) => REWRITE_PHASE.test(l));

function locationBody(text, header) {
    const start = text.indexOf(header);
    if (start === -1) {return null;}
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i += 1) {
        if (text[i] === '{') {depth += 1;}
        if (text[i] === '}') {depth -= 1;}
        if (depth === 0) {return text.slice(start, i + 1);}
    }
    return null;
}

/**
 * Server-level headers the container config sets before any location block.
 *
 * Content-Security-Policy is deliberately NOT here — see the CSP describe
 * block below for why nginx must not set one at all.
 */
const SECURITY_HEADERS = [
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
];

describe('pgAdmin is not reachable from the public internet', () => {
    it('the host config, which is the only layer that sees the real client, refuses /pgadmin/', () => {
        const conf = read(HOST_CONF);
        expect(conf).toMatch(/location\s+\/pgadmin\//);
        // Whatever form the refusal takes, it must not proxy onward.
        const block = conf.slice(conf.indexOf('location /pgadmin/'));
        const body = block.slice(0, block.indexOf('}') + 1);
        expect(body).toMatch(/deny all|return\s+40[34]/);
        expect(body).not.toMatch(/proxy_pass/);
    });

    it('the container config does not claim an IP whitelist it cannot enforce', () => {
        // $remote_addr in the container is the Docker bridge, so an allow-list
        // of private ranges permits every request that arrives. Either the
        // block refuses outright, or it must not pretend to filter by address.
        const conf = read(DOCKER_CONF);
        const start = conf.indexOf('location /pgadmin/');
        if (start === -1) {return;}
        const body = conf.slice(start, conf.indexOf('}', start) + 1);
        const claimsWhitelist = /allow\s+172\.16\.0\.0\/12|allow\s+10\.0\.0\.0\/8/.test(body);
        expect(claimsWhitelist).toBe(false);
    });
});

describe('security headers survive into every location', () => {
    // A location that sets any add_header of its own inherits none from the
    // server block. Each such location must therefore restate the security set.
    const locationsSettingHeaders = () => {
        const lines = read(DOCKER_CONF).split('\n');
        const blocks = [];
        let current = null;
        let depth = 0;
        lines.forEach((text, index) => {
            const trimmed = text.trim();
            if (trimmed.startsWith('#')) {return;}
            if (/^location\s/.test(trimmed)) {
                current = { name: trimmed, line: index + 1, body: [] };
                depth = 0;
            }
            if (current) {
                current.body.push(text);
                depth += (text.match(/\{/g) || []).length;
                depth -= (text.match(/\}/g) || []).length;
                if (depth <= 0 && current.body.length > 1) {
                    if (current.body.some((l) => /add_header/.test(l) && !l.trim().startsWith('#'))) {
                        blocks.push(current);
                    }
                    current = null;
                }
            }
        });
        return blocks;
    };

    it('finds the locations that override headers', () => {
        // Guards the parser itself: if this ever returns nothing, the
        // assertion below would pass vacuously.
        expect(locationsSettingHeaders().length).toBeGreaterThan(0);
    });

    it.each(SECURITY_HEADERS)('%s is present in every header-setting location', (header) => {
        const offenders = locationsSettingHeaders()
            .filter((block) => !block.body.some((l) => l.includes(header)))
            .map((block) => `${DOCKER_CONF.split('/').pop()}:${block.line} ${block.name}`);
        expect(offenders).toEqual([]);
    });
});

describe('exactly one layer owns the Content-Security-Policy', () => {
    // A browser applies every CSP header it receives and enforces the
    // intersection, so two authorities can only ever produce a policy that is
    // wrong in one direction. Both nginx layers hardcoded
    //   img-src 'self' data: blob:
    // while apps/web-app/src/middleware.ts builds
    //   img-src 'self' data: blob: ${backendOrigin} ${tileOrigin}
    // from the environment. nginx cannot read NEXT_PUBLIC_MAP_TILE_URL or the
    // backend origin, so the intersection silently dropped both: an operator
    // who configured an in-country tile server got a blank map, and documents
    // served straight from the backend origin were refused as images.
    //
    // The layer that knows the values owns the header. nginx sets none.
    it.each([
        ['deploy/nginx/gacp-platform.conf', HOST_CONF],
        ['nginx/gacp.production.conf', DOCKER_CONF],
    ])('%s sets no Content-Security-Policy', (_name, file) => {
        const offenders = liveLines(file).filter((l) => /add_header\s+Content-Security-Policy/i.test(l.text));
        expect(offenders.map((l) => l.line)).toEqual([]);
    });

    it('the application still sets one, and it carries the configured tile origin', () => {
        const middleware = read(path.join(REPO_ROOT, 'apps', 'web-app', 'src', 'middleware.ts'));
        expect(middleware).toMatch(/Content-Security-Policy/);
        expect(middleware).toMatch(/img-src[^`]*tileOrigin/);
    });
});

describe('an HTTP-01 challenge can reach the webroot', () => {
    // The :80 server block serves /nginx-health and 301-redirects everything
    // else, so /.well-known/acme-challenge/<token> was answered with a
    // redirect and Let's Encrypt validation failed. It worked in production
    // only because a maintenance script injected the location into the
    // *deployed* copy at runtime — which the next deploy of this tracked file
    // silently reverts, and the certificate then expires with no visible
    // failure until the site goes untrusted.
    const vhosts = [
        'deploy/nginx/gacp-platform.conf',
        'deploy/nginx/staging.gacpth.com.conf',
        'deploy/nginx/demo-host/etc/nginx/conf.d/staging.gacpth.com.conf',
    ];

    it.each(vhosts)('%s answers the ACME challenge path before redirecting to HTTPS', (relative) => {
        const conf = read(path.join(REPO_ROOT, relative));
        expect(conf).toMatch(/location\s+\^~\s+\/\.well-known\/acme-challenge\//);

        // Order matters: nginx picks `^~` prefix matches ahead of the plain
        // `/` prefix, but a reader must still see it declared before the
        // redirect, or the next edit will move it below and break renewal.
        const acme = conf.indexOf('/.well-known/acme-challenge/');
        const redirect = conf.indexOf('return 301 https://');
        expect(acme).toBeLessThan(redirect);
    });
});

describe('the container config does not tell search engines to ignore the platform', () => {
    it('X-Robots-Tag noindex is not set for the whole server', () => {
        // GACP certification is a public register. A server-level
        // "noindex, nofollow" would delist the entire platform; it belongs only
        // on the admin surfaces.
        const serverLevel = liveLines(DOCKER_CONF)
            .filter((l) => /add_header\s+X-Robots-Tag/.test(l.text))
            .filter((l) => /^\s{4}add_header/.test(l.text)); // four spaces = server scope here
        expect(serverLevel).toEqual([]);
    });
});

describe('on staging, gacpth.com and www.gacpth.com keep the blank page as the rollback target', () => {
    const NGINX_DIR = path.join(REPO_ROOT, 'deploy', 'nginx');
    const BARE_HOSTS = ['gacpth.com', 'www.gacpth.com'];
    const BLANK_GUARD = 'if ($host ~* "^(www\\.)?gacpth\\.com$") { rewrite ^ /__gacp_blank last; }';

    const vhostFiles = () => fs.readdirSync(NGINX_DIR).filter((f) => f.endsWith('.conf'));
    const bareBlocks = () => serverBlocks(HOST_CONF).filter((b) => b.names.includes('gacpth.com'));

    it('both listeners of the bare-domain vhost name gacpth.com and www.gacpth.com', () => {
        const blocks = bareBlocks();
        expect(blocks).toHaveLength(2);
        for (const block of blocks) {
            expect(block.names).toEqual(expect.arrayContaining(BARE_HOSTS));
        }
    });

    it.each(BARE_HOSTS)('no other vhost in deploy/nginx claims %s', (host) => {
        const claimants = vhostFiles()
            .filter((f) => path.join(NGINX_DIR, f) !== HOST_CONF)
            .filter((f) => serverBlocks(path.join(NGINX_DIR, f)).some((b) => b.names.includes(host)));
        expect(claimants).toEqual([]);
    });

    it('the blank-page rewrite is the first rewrite-phase directive in each bare-domain server', () => {
        // Server-level `if`/`return`/`rewrite` run in file order and `rewrite ... last`
        // ends that phase, so the guard must come before the IP gate or any return.
        for (const block of bareBlocks()) {
            const firstRewritePhase = block.serverLevel.find((l) => /^(if|return|rewrite|set)\b/.test(l));
            expect(firstRewritePhase).toBe(BLANK_GUARD);
        }
    });

    it('the guard pattern matches the bare and www hosts in any case, and no subdomain', () => {
        const pattern = new RegExp(BLANK_GUARD.match(/"(.+?)"/)[1], 'i');
        for (const host of ['gacpth.com', 'www.gacpth.com', 'GACPTH.COM', 'Www.GacpTh.com']) {
            expect(pattern.test(host)).toBe(true);
        }
        for (const host of ['staging.gacpth.com', 'demo.gacpth.com', 'preview.gacpth.com', 'gacpth.com.evil.test', 'localhost']) {
            expect(pattern.test(host)).toBe(false);
        }
    });

    it('/__gacp_blank is internal, returns an empty body, and proxies nowhere', () => {
        for (const block of bareBlocks()) {
            const { text } = block;
            const start = text.indexOf('location = /__gacp_blank');
            expect(start).toBeGreaterThan(-1);
            const loc = text.slice(start, text.indexOf('}', start) + 1);
            expect(loc).toMatch(/^\s*internal;/m);
            expect(loc).toMatch(/add_header\s+X-Robots-Tag\s+"noindex, nofollow, noarchive"\s+always;/);
            expect(loc).not.toMatch(/proxy_pass|root\s|alias\s|try_files/);
            const returned = loc.match(/return\s+200\s+"((?:[^"\\]|\\.)*)";/);
            expect(returned).not.toBeNull();
            expect(returned[1]).toMatch(/<body><\/body>/);
            expect(returned[1]).toMatch(/<title><\/title>/);
        }
    });
});

describe('on the demo host, gacpth.com and www.gacpth.com show a notice and pass only /verify/ to demo (operator 2026-10-30)', () => {
    const DEMO_VHOST = path.join(CONF_D, 'demo.gacpth.com.conf');
    const CONTAINER_CONF = path.join(DEMO_HOST, 'opt', 'gacp-platform', 'nginx', 'gacp.production.conf');
    const NOTICE_PAGE = path.join(DEMO_HOST, 'usr', 'share', 'nginx', 'gacpth-notice', 'index.html');
    const BARE_HOSTS = ['gacpth.com', 'www.gacpth.com'];
    const GUARD = [
        'set $gacp_apex "";',
        'if ($host ~* "^(www\\.)?gacpth\\.com$") { set $gacp_apex "1"; }',
        'if ($uri ~ "^/verify/") { set $gacp_apex "${gacp_apex}v"; }',
        'if ($gacp_apex = "1v") { return 302 https://demo.gacpth.com$request_uri; }',
        'if ($gacp_apex = "1") { rewrite ^ /__gacp_notice last; }',
    ];
    const NOTICE_LINES = ['เว็บไซต์นี้ยังไม่เปิดให้บริการ', 'ระบบอยู่ระหว่างการพัฒนาและทดสอบ'];

    const confFiles = () => fs.readdirSync(CONF_D).filter((f) => f.endsWith('.conf')).sort();
    const bareBlocks = () => {
        const blocks = serverBlocks(DEFAULT_VHOST).filter((b) => b.names.includes('gacpth.com'));
        expect(blocks).toHaveLength(2);
        return blocks;
    };

    const decide = (block, host, uri) => {
        const [, hostIf, uriIf] = rewritePhase(block);
        const hostPattern = new RegExp(hostIf.match(/~\*\s+"(.+?)"/)[1], 'i');
        const uriPattern = new RegExp(uriIf.match(/~\s+"(.+?)"/)[1]);
        if (!hostPattern.test(host)) {return 'not-guarded';}
        return uriPattern.test(uri) ? 'redirect' : 'notice';
    };

    it('the host nginx.conf loads exactly the conf.d files kept here', () => {
        expect(read(path.join(DEMO_HOST, 'etc', 'nginx', 'nginx.conf'))).toMatch(/^\s*include \/etc\/nginx\/conf\.d\/\*\.conf;/m);
        expect(confFiles()).toEqual(['00-gacp-platform.conf', 'demo.gacpth.com.conf', 'staging.gacpth.com.conf']);
    });

    it('00-gacp-platform.conf is the fallback server for unnamed hosts on both ports', () => {
        // No file names default_server, so nginx falls back to the first server per port in load
        // order. conf.d/*.conf loads alphabetically, and 00- sorts first.
        expect(confFiles()[0]).toBe('00-gacp-platform.conf');
        for (const file of confFiles()) {
            expect(liveLines(path.join(CONF_D, file)).filter((l) => /default_server/.test(l.text))).toEqual([]);
        }
        const blocks = bareBlocks();
        expect(blocks).toHaveLength(2);
        for (const block of blocks) {
            expect(block.names).toEqual(expect.arrayContaining([...BARE_HOSTS, '_']));
        }
        expect(blocks.map((b) => b.text.match(/listen\s+(\d+)/)[1])).toEqual(['80', '443']);
    });

    it.each(BARE_HOSTS)('no other server block on the demo host claims %s', (host) => {
        const claimants = confFiles()
            .flatMap((f) => serverBlocks(path.join(CONF_D, f)).map((b) => ({ f, b })))
            .filter(({ f, b }) => b.names.includes(host) && f !== '00-gacp-platform.conf')
            .map(({ f }) => f);
        expect(claimants).toEqual([]);
    });

    it('the guard opens the rewrite phase of both listeners, ahead of the address deny', () => {
        // Server-level rewrite-phase directives run in file order before any location is chosen,
        // so the guard answers ahead of the deny and of every proxy_pass.
        for (const block of bareBlocks()) {
            const phase = rewritePhase(block);
            expect(phase.slice(0, GUARD.length)).toEqual(GUARD);
            expect(phase[GUARD.length]).toBe('if ($gacp_bare_domain_deny) { return 403; }');
        }
    });

    it.each([
        ['gacpth.com', '/'],
        ['www.gacpth.com', '/'],
        ['GACPTH.COM', '/login'],
        ['Www.GacpTh.com', '/api/v1/health'],
        ['gacpth.com', '/api/auth/login'],
        ['gacpth.com', '/verify'],
        ['gacpth.com', '/VERIFY/abc'],
        ['gacpth.com', '/trace/lot/1'],
    ])('%s%s gets the notice page', (host, uri) => {
        for (const block of bareBlocks()) {
            expect(decide(block, host, uri)).toBe('notice');
        }
    });

    it.each([
        ['gacpth.com', '/verify/TH-GACP-1-2569'],
        ['www.gacpth.com', '/verify/abc'],
        ['GACPTH.COM', '/verify/'],
    ])('%s%s is sent to demo.gacpth.com with its path and query', (host, uri) => {
        for (const block of bareBlocks()) {
            expect(decide(block, host, uri)).toBe('redirect');
        }
    });

    it.each(['demo.gacpth.com', 'staging.gacpth.com', 'xgacpth.com', 'gacpth.com.evil.test', 'www.gacpth.com.evil.test', 'localhost', '119.59.105.140'])(
        '%s is not touched by the guard', (host) => {
            for (const block of bareBlocks()) {
                expect(decide(block, host, '/verify/abc')).toBe('not-guarded');
                expect(decide(block, host, '/')).toBe('not-guarded');
            }
        },
    );

    it('/__gacp_notice is internal, noindex, and serves only the notice file', () => {
        for (const block of bareBlocks()) {
            const loc = locationBody(block.text, 'location = /__gacp_notice');
            expect(loc).not.toBeNull();
            expect(loc).toMatch(/^\s*internal;/m);
            expect(loc).toMatch(/add_header\s+X-Robots-Tag\s+"noindex, nofollow, noarchive"\s+always;/);
            expect(loc).toMatch(/^\s*root \/usr\/share\/nginx\/gacpth-notice;$/m);
            expect(loc).toMatch(/^\s*try_files \/index\.html =404;$/m);
            expect(loc).not.toMatch(/proxy_pass|alias\s|return\s/);
        }
    });

    it('the notice location restates every header its server sets, since its own add_header drops them', () => {
        const [, https] = bareBlocks();
        expect(https.serverLevel.filter((l) => /^add_header\s/.test(l)).length).toBeGreaterThanOrEqual(5);
        for (const block of bareBlocks()) {
            const loc = locationBody(block.text, 'location = /__gacp_notice');
            const dropped = block.serverLevel
                .filter((l) => /^add_header\s/.test(l))
                .filter((l) => !loc.split('\n').map((x) => x.trim()).includes(l));
            expect(dropped).toEqual([]);
        }
    });

    it('the notice file says the site is not open yet and asks not to be indexed', () => {
        const page = read(NOTICE_PAGE).replace(/<wbr>|<\/?em>/g, '');
        for (const line of NOTICE_LINES) {expect(page).toContain(line);}
        expect(page).toMatch(/<meta name="robots" content="noindex,nofollow">/);
        expect(page).not.toMatch(/<script|<form|\/api\//i);
    });

    it('demo.gacpth.com is served by its own vhost on both ports and proxies to the container on 443', () => {
        const blocks = serverBlocks(DEMO_VHOST);
        expect(blocks.map((b) => b.names)).toEqual([['demo.gacpth.com'], ['demo.gacpth.com']]);
        const [http, https] = blocks;
        expect(locationBody(http.text, 'location / {')).toMatch(/return 301 https:\/\/\$host\$request_uri;/);
        expect(rewritePhase(https)).toEqual(['if ($gacp_demo_deny) { return 403; }']);
        const root = locationBody(https.text, 'location / {');
        expect(root).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:8080;/);
        expect(root).toMatch(/proxy_set_header Host \$host;/);
        expect(root).not.toMatch(/gacpth\.com/);
    });

    it('demo.gacpth.com is open: the demo deny map has no row that denies', () => {
        const map = read(DEFAULT_VHOST).match(/map "[^"]*" \$gacp_demo_deny \{([^}]*)\}/);
        expect(map).not.toBeNull();
        expect(map[1].split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean)).toEqual(['default 0;']);
    });

    it('inside the container, demo.gacpth.com routes to the demo backend and frontend', () => {
        const conf = read(CONTAINER_CONF);
        expect(conf).toMatch(/map \$host \$backend_up \{[^}]*\bdemo\.gacpth\.com\s+backend-demo:8000;/);
        expect(conf).toMatch(/map \$host \$frontend_up \{[^}]*\bdemo\.gacpth\.com\s+frontend-demo:3000;/);
    });
});

describe('staging.gacpth.com on the demo host keeps its gate and its own upstream (operator order 164)', () => {
    // This is the file the runbook installs. deploy/nginx/staging.gacpth.com.conf is not.
    const STAGING_VHOST = path.join(CONF_D, 'staging.gacpth.com.conf');
    const OVERLAY = path.join(REPO_ROOT, 'docker-compose.staging-on-demo-host.yml');
    const DENY = 'if ($gacp_prelaunch_deny) { return 403; }';
    const UPSTREAM = 'http://127.0.0.1:8081';
    const PROXIED = ['location /api/ {', 'location /uploads/ {', 'location / {'];

    const blocks = () => serverBlocks(STAGING_VHOST);
    const locationsOf = (block) => block.serverLevel.filter((l) => /^location\b/.test(l));
    const gate = () => readGateConfig(read(DEFAULT_VHOST));
    const isExempt = (uri) => gate().exemptPatterns.some((p) => new RegExp(p.replace(/^~\*?/, '')).test(uri));
    const mapOf = (variable) => {
        const map = read(DEFAULT_VHOST).match(new RegExp(`^map\\s+(\\S+)\\s+\\$${variable}\\s*\\{([^}]*)\\}`, 'm'));
        expect(map).not.toBeNull();
        const rows = map[2].split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
        return { key: map[1], rows };
    };

    it('is exactly one :80 and one :443 server, for staging.gacpth.com alone', () => {
        const servers = blocks();
        expect(servers.map((b) => b.names)).toEqual([['staging.gacpth.com'], ['staging.gacpth.com']]);
        expect(servers.map((b) => b.text.match(/listen\s+(\d+)/)[1])).toEqual(['80', '443']);
    });

    it('the deny is the only rewrite-phase directive at server level on both listeners', () => {
        // At server level it runs before any location is chosen, so it covers them all.
        // Inside a location it covers one, and a rewrite ahead of it can end the phase.
        for (const block of blocks()) {
            expect(rewritePhase(block)).toEqual([DENY]);
        }
    });

    it('serves only the locations reviewed for a gated host', () => {
        const [http, https] = blocks();
        expect(locationsOf(http)).toEqual([
            'location = /__access-check {',
            'location = /nginx-health {',
            'location ^~ /.well-known/acme-challenge/ {',
            'location / {',
        ]);
        expect(locationsOf(https)).toEqual([
            'location = /__access-check {',
            'location = /__gate {',
            ...PROXIED,
            'location ~ /\\. {',
            'location ~* \\.(bak|config|sql|fla|psd|ini|log|sh|inc|swp|dist)$ {',
        ]);
    });

    it('forwards only to the staging slot, never to the 8080 that demo owns', () => {
        const passes = blocks().flatMap((b) => [...b.text.matchAll(/\b(\w+_pass)\s+(\S+);/g)]).map((m) => `${m[1]} ${m[2]}`);
        expect(passes).toEqual(PROXIED.map(() => `proxy_pass ${UPSTREAM}`));
        const [, https] = blocks();
        for (const header of PROXIED) {
            const location = locationBody(https.text, header);
            expect(location).toContain(`proxy_pass ${UPSTREAM};`);
            // Any other Host falls to `backend`, which does not exist in the staging slot.
            expect(location).toMatch(/proxy_set_header Host \$host;/);
        }
    });

    it('that upstream is the port the staging slot publishes for gacp-staging-nginx', () => {
        const published = read(OVERLAY).match(/container_name: gacp-staging-nginx\n\s+ports: !override\n\s+- "([^"]+)"/);
        expect(published).not.toBeNull();
        expect(published[1]).toBe('127.0.0.1:8081:80');
    });

    it('answers the ACME challenge from the webroot, and the gate lets it through', () => {
        const [http] = blocks();
        const acme = locationBody(http.text, 'location ^~ /.well-known/acme-challenge/ {');
        expect(acme).toMatch(/^\s*root \/var\/www\/certbot;$/m);
        expect(acme).toMatch(/^\s*try_files \$uri =404;$/m);
        expect(isExempt('/.well-known/acme-challenge/token')).toBe(true);
    });

    it('the deny map fires on blocked address, no exemption, no gate cookie, and on nothing else', () => {
        expect(mapOf('gacp_prelaunch_deny')).toEqual({
            key: '"$gacp_prelaunch_blocked_ip:$gacp_prelaunch_exempt:$gacp_gate_cookie_ok"',
            rows: ['default 0;', '"1:0:0" 1;'],
        });
    });

    it('only our gate cookie opens it, and its token stays out of git', () => {
        expect(mapOf('gacp_gate_cookie_ok')).toEqual({
            key: '$cookie_gacp_gate',
            rows: ['default 0;', 'include /etc/nginx/gacp-gate-token[.]conf;'],
        });
    });

    it('/__gate sets that cookie and goes nowhere else, and the customer cookie is never read', () => {
        const [, https] = blocks();
        const door = locationBody(https.text, 'location = /__gate {');
        expect(door).toMatch(/add_header Set-Cookie "gacp_gate=\$arg_t; [^"]*Secure; HttpOnly;[^"]*" always;/);
        expect(door).toMatch(/access_log off;/);
        expect(door).toMatch(/return 302 \/;/);
        for (const block of blocks()) {
            expect(block.text).not.toMatch(/gacp_demo/);
        }
    });

    it('the shared allowlist behind it denies by default, on the restored visitor address', () => {
        const { geo } = gate();
        expect(geo.variable).toBe('$remote_addr');
        expect(geo.defaultValue).toBe('1');
        expect(isAllowed(geo, '8.8.8.8')).toBe(false);
        expect(read(DEFAULT_VHOST)).toMatch(/^\s*real_ip_header\s+CF-Connecting-IP;/m);
    });

    it.each([
        '/__access-check',
        '/__gate',
        '/.well-known/acme-challenge/token',
        '/api/webhooks/stripe',
        '/api/v1/webhooks/stripe',
    ])('a blocked visitor is let through to %s', (uri) => {
        expect(isExempt(uri)).toBe(true);
    });

    it.each([
        '/',
        '/login',
        '/nginx-health',
        '/uploads/doc.pdf',
        '/api/v1/health',
        '/api/webhooks/stripe/extra',
        '/api/v1/webhooks/stripe-test',
    ])('a blocked visitor is not let through to %s', (uri) => {
        expect(isExempt(uri)).toBe(false);
    });

    it.each([
        '/__gate?t=abc',
        '/__access-check?x=1',
    ])('a query string on an exempt door still opens it: %s', (uri) => {
        expect(isExempt(uri)).toBe(true);
    });

    it.each([
        '/__gatefoo',
        '/__gate/',
        '/__gate/x',
        '/__gate;x=1',
        '/__access-check/',
        '/__access-check/x',
        '/__access-checks',
        '/__gate/../login',
        '/__gate/%2e%2e/api/v1/health',
        '/__gate%2f..%2fapi/v1/health',
        '/__access-check/../api/v1/health',
        '/.well-known/acme-challenge/../../api/v1/health',
        '/.well-known/acme-challenge/%2e%2e/%2e%2e/login',
        '/.well-known/acme-challenge/token/x',
        '/.well-known/acme-challenge/',
    ])('an exemption covers its exact path, not everything that starts with it: %s', (uri) => {
        expect(isExempt(uri)).toBe(false);
    });

    it.each([
        '/api/v1/health/../webhooks/stripe',
        '/login%2f..%2fapi/webhooks/stripe',
        '//api/webhooks/stripe',
        '/__gate%0a',
    ])('a line that only normalises to an exempt path is not exempt: %s', (uri) => {
        expect(isExempt(uri)).toBe(false);
    });

    it('the exemption reads the line proxy_pass forwards, so what is exempted is what reaches the upstream', () => {
        // On $uri, /api/v1/health/../webhooks/stripe is exempt and its raw line still goes upstream.
        expect(mapOf('gacp_prelaunch_exempt').key).toBe('$request_uri');
    });

    it('exempts exactly these rows and nothing by default, so an added row needs a change here', () => {
        expect(mapOf('gacp_prelaunch_exempt').rows).toEqual([
            'default 0;',
            '~^/__access-check(\\?.*)?$ 1;',
            '~^/\\.well-known/acme-challenge/[A-Za-z0-9_-]+$ 1;',
            '~^/__gate(\\?.*)?$ 1;',
            '~^/api(/v1)?/webhooks/stripe$ 1;',
        ]);
    });

    it('every exempt row is anchored at both ends, so a new row cannot arrive as a prefix', () => {
        for (const pattern of gate().exemptPatterns) {
            expect(pattern).toMatch(/^~\^.*\$$/);
        }
    });

    it('the older copy of the platform file carries the same exemptions', () => {
        expect(readGateConfig(read(HOST_CONF)).exemptPatterns)
            .toEqual(gate().exemptPatterns);
    });

    it('every exemption is a regex row the checks above can evaluate', () => {
        // parseExemptPatterns reads only `~` rows, so a literal row would pass unseen.
        expect(mapOf('gacp_prelaunch_exempt').rows).toHaveLength(gate().exemptPatterns.length + 1);
    });
});
