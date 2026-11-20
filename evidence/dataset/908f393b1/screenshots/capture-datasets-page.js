'use strict';

/**
 * Screenshots of /provider/datasets through the real browser path: Next dev
 * server from this tree, its /api proxy, the backend from this tree on a
 * scratch database with the synthetic sample written through the real doors.
 * No sample ruling is loaded, so the three farm domains show the state a real
 * deployment has today. Sessions are the provider_token cookie a login sets.
 *
 *   node capture-datasets-page.js <repo> <empty-database-url> <out-dir>
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const [repo, url, outDir] = process.argv.slice(2);
const lab = require(path.join(repo, 'apps/backend/scripts/datasets/lib/lab'));
const sample = require(path.join(repo, 'apps/backend/scripts/datasets/lib/sample'));
const { readZip } = require(path.join(repo, 'apps/backend/scripts/datasets/check-dataset'));
const { chromium } = require(path.join(repo, 'apps/web-app/node_modules/@playwright/test'));
const { PrismaClient } = require(path.join(repo, 'apps/backend/node_modules/@prisma/client'));

async function main() {
    fs.mkdirSync(outDir, { recursive: true });
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbd3-capture-'));
    fs.mkdirSync(path.join(logDir, 'keys'));
    lab.migrate(url);
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    const stage = await sample.insertStage(prisma);
    const jwt = lab.jwtSecrets();
    const mint = lab.tokenMinter(jwt);
    const backend = await lab.bootBackend({
        label: 'page', logDir,
        env: {
            DATABASE_URL: url, ...jwt, DATASET_PSEUDONYM_KEY: lab.randomSecret('tbd3-key'), HMAC_KEY: lab.randomSecret('tbd3-hmac'),
            SURVEY_RESPONDENT_KEY: lab.randomSecret('tbd3-resp'), SIGNING_KEY_DIR: path.join(logDir, 'keys'), RSA_PRIVATE_KEY_PASSPHRASE: lab.randomSecret('tbd3-rsa'),
        },
    });
    const api = (m, p, o) => lab.call(backend.base, m, p, o);
    await sample.writeThroughDoors({ api, mint, stage });

    const port = 3600 + Math.floor(Math.random() * 300);
    const webLog = fs.openSync(path.join(logDir, 'next.log'), 'w');
    const web = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
        cwd: path.join(repo, 'apps/web-app'),
        env: { PATH: process.env.PATH, HOME: os.homedir(), NODE_ENV: 'development', INTERNAL_API_URL: backend.base, BACKEND_URL: backend.base,
            NEXT_PUBLIC_API_URL: `http://127.0.0.1:${port}`, NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--max-old-space-size=2048' },
        stdio: ['ignore', webLog, webLog],
    });
    const base = `http://127.0.0.1:${port}`;
    const result = { port, shots: [], downloads: [] };
    const browser = await chromium.launch();
    try {
        for (let i = 0; i < 180; i += 1) {
            try { if ((await fetch(`${base}/api/health`)).status < 500) { break; } } catch { /* still starting */ }
            await new Promise((r) => { setTimeout(r, 1000); });
        }
        const shots = [
            ['adminA', '01-system-admin-dtam-exporter.png', { width: 1280, height: 900 }],
            ['reviewerA', '02-document-reviewer-read-only.png', { width: 1280, height: 900 }],
            ['adminA', '03-system-admin-dtam-mobile.png', { width: 390, height: 844 }],
        ];
        for (const [who, file, viewport] of shots) {
            const context = await browser.newContext({ viewport, acceptDownloads: true, locale: 'th-TH' });
            await context.addCookies([{ name: 'provider_token', value: mint(stage.people[who]), domain: '127.0.0.1', path: '/' }]);
            const page = await context.newPage();
            await page.goto(`${base}/provider/datasets`, { waitUntil: 'domcontentloaded', timeout: 240000 });
            await page.waitForSelector('[data-testid="dataset-survey-responses"]', { timeout: 240000 });
            await page.screenshot({ path: path.join(outDir, file), fullPage: true });
            const buttons = await page.locator('button').allInnerTexts();
            result.shots.push({ who, role: stage.people[who].role, file, url: page.url(), buttons: buttons.map((b) => b.trim()) });
            if (who === 'adminA' && viewport.width > 1000) {
                const [bundle] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /ดาวน์โหลดชุดเต็ม/ }).click()]);
                const zipPath = path.join(logDir, 'bundle.zip');
                await bundle.saveAs(zipPath);
                const files = readZip(fs.readFileSync(zipPath));
                const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
                result.downloads.push({ button: 'ดาวน์โหลดชุดเต็ม (ZIP)', file: bundle.suggestedFilename(), entries: [...files.keys()], notExported: manifest.notExported });
                const card = page.locator('[data-testid="dataset-survey-responses"]');
                const [withdrawn] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'CSV' }).nth(1).click()]);
                const csvPath = path.join(logDir, 'withdrawn.csv');
                await withdrawn.saveAs(csvPath);
                result.downloads.push({ button: 'รายการคำตอบที่ถอนความยินยอมแล้ว CSV', file: withdrawn.suggestedFilename(), header: fs.readFileSync(csvPath, 'utf8').split('\n')[0] });
            }
            await context.close();
        }
    } finally {
        await browser.close();
        web.kill('SIGTERM');
        await backend.stop();
        await prisma.$disconnect();
    }
    fs.writeFileSync(path.join(outDir, 'capture-result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => { console.error(`capture failed: ${err.stack || err.message}`); process.exit(1); });
