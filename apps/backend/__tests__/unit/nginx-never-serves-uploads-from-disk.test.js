'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const CONFIG_DIRS = ['nginx', 'deploy/nginx', 'docker/nginx'];

function configFilesUnder(base, dirs) {
    const found = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(base, dir), { withFileTypes: true })) {
            const child = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(child); } else if (entry.name.includes('.conf')) { found.push(child); }
        }
    };
    dirs.filter((dir) => fs.existsSync(path.join(base, dir))).forEach(walk);
    return found;
}

function locations(config) {
    const text = config.split('\n').map((line) => line.replace(/#.*$/, '')).join('\n');
    const blocks = [];
    const header = /location\s+(?:(=|~\*|~|\^~)\s*)?("[^"]*"|[^\s{]+)\s*\{/g;
    let match;
    while ((match = header.exec(text)) !== null) {
        let depth = 1;
        let i = header.lastIndex;
        while (depth > 0 && i < text.length) {
            if (text[i] === '{') { depth += 1; }
            if (text[i] === '}') { depth -= 1; }
            i += 1;
        }
        blocks.push({
            header: match[0].trim(),
            modifier: match[1] || '',
            pattern: match[2].replace(/^"(.*)"$/, '$1'),
            body: text.slice(header.lastIndex, i - 1),
        });
    }
    return blocks;
}

const UPLOADS_FILES = ['/uploads/lab-results/report.pdf', '/uploads/car/photo.jpg', '/uploads/application-drafts/id-card.png', '/uploads/avatar.webp'];

function reachesUploads({ header, modifier, pattern }) {
    if (header.includes('uploads')) { return true; }
    if (!modifier.startsWith('~')) { return false; }
    const regex = new RegExp(pattern, modifier === '~*' ? 'i' : '');
    return UPLOADS_FILES.some((file) => regex.test(file));
}

function servesUploadsFromDisk(config) {
    return locations(config)
        .filter(reachesUploads)
        .filter(({ body }) => !/(^|[\s;{])proxy_pass\s/m.test(body) || /(^|[\s;{])(alias|root|try_files)\s/m.test(body))
        .map(({ header }) => header);
}

const read = (file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
const configFiles = configFilesUnder(REPO_ROOT, CONFIG_DIRS);

describe('nginx never serves /uploads from disk', () => {
    test('the scan finds the nginx configs and their /uploads locations', () => {
        expect(configFiles).toEqual(expect.arrayContaining(['nginx/gacp.production.conf', 'deploy/nginx/staging.gacpth.com.conf']));
        expect(configFiles.flatMap((file) => locations(read(file)).filter(reachesUploads)).length).toBeGreaterThan(0);
    });

    test.each(configFiles)('%s: every location that can answer /uploads proxies it to the backend', (file) => {
        expect(servesUploadsFromDisk(read(file))).toEqual([]);
    });
});

describe('the scan catches every shape that serves /uploads from disk', () => {
    const server = (lines) => `server {\n    listen 80;\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;

    test.each([
        ['an alias', ['location /uploads/ {', '    alias /app/uploads/;', '}']],
        ['a root inside the location', ['location ^~ /uploads/ {', '    root /srv/www;', '}']],
        ['a bare location under a server-level root', ['root /srv/www;', 'location /uploads/ {', '    expires 30d;', '}']],
        ['an alternation regex', ['location ~ ^/(uploads|static)/ {', '    root /srv/www;', '}']],
        ['a static-file regex that captures /uploads/*.pdf', ['root /srv/www;', 'location ~* \\.(pdf|jpe?g|png)$ {', '    expires 30d;', '}']],
    ])('%s', (_label, lines) => {
        expect(servesUploadsFromDisk(server(lines))).toHaveLength(1);
    });

    test('a location that proxies /uploads to the backend passes', () => {
        expect(servesUploadsFromDisk(server(['location /uploads/ {', '    proxy_pass http://backend:8000;', '}']))).toEqual([]);
    });

    test('a config in a subfolder is scanned', () => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-scan-'));
        try {
            fs.mkdirSync(path.join(base, 'nginx', 'conf.d'), { recursive: true });
            fs.writeFileSync(path.join(base, 'nginx', 'conf.d', 'uploads.conf'), server([]));
            expect(configFilesUnder(base, CONFIG_DIRS)).toEqual([path.join('nginx', 'conf.d', 'uploads.conf')]);
        } finally {
            fs.rmSync(base, { recursive: true, force: true });
        }
    });
});
