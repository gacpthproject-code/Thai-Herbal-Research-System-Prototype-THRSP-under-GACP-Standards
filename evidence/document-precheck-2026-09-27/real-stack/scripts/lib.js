const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const OUT = process.env.OUT;
const BASE = 'http://localhost:3133';
const logFile = path.join(S, 'walk-log.txt');
function note(s) { const line = `[${new Date().toISOString()}] ${s}`; fs.appendFileSync(logFile, line + '\n'); console.log(line); }
async function open({ state, dark = false, storage } = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'th-TH', colorScheme: dark ? 'dark' : 'light', storageState: storage && fs.existsSync(storage) ? storage : undefined });
  await ctx.addInitScript((d) => { try { localStorage.setItem('theme', d ? 'dark' : 'light'); localStorage.setItem('theme:explicit','1'); } catch (e) {} }, dark);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') note(`console.error: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => note(`pageerror: ${String(e).slice(0, 200)}`));
  return { browser, ctx, page };
}
async function shot(page, name, opts = {}) {
  const p = path.join(OUT, name + '.png');
  await page.screenshot({ path: p, fullPage: !!opts.full, ...(opts.clip ? { clip: opts.clip } : {}) });
  note(`shot ${name}.png`);
  return p;
}
async function elShot(loc, name) { const p = path.join(OUT, name + '.png'); await loc.screenshot({ path: p }); note(`shot ${name}.png (element)`); return p; }
module.exports = { open, shot, elShot, note, BASE, S, OUT };
