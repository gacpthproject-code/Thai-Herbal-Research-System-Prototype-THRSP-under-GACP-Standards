import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3105';
const OUT = process.argv[2];
const browser = await chromium.launch();
const result = {};

for (const dark of [false, true]) {
  for (const width of [1440, 390]) {
    const key = `${dark ? 'dark' : 'light'}-${width}`;
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: dark ? 'dark' : 'light',
      locale: 'th-TH',
    });
    await context.addInitScript((isDark) => {
      try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); localStorage.setItem('theme:explicit', '1'); } catch {}
    }, dark);
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 });
    const facts = await page.evaluate(() => ({
      h1: document.querySelectorAll('h1').length,
      htmlDark: document.documentElement.classList.contains('dark'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      imgsWithoutAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
      footerIssuer: document.querySelector('[aria-labelledby="footer-issuer"]')?.textContent?.trim(),
      footerOperator: document.querySelector('[aria-labelledby="footer-operator"]')?.textContent?.trim(),
      registerLinks: document.querySelectorAll('a[href="/register"]').length,
    }));
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    result[key] = {
      ...facts,
      horizontalScroll: facts.scrollWidth > facts.clientWidth,
      axeViolations: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) })),
      axePasses: axe.passes.length,
    };
    await page.screenshot({ path: `${OUT}/landing-${key}.png`, fullPage: true });
    await page.locator('footer').screenshot({ path: `${OUT}/footer-${key}.png` });
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/walk.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { axe: v.axeViolations.length, passes: v.axePasses, hscroll: v.horizontalScroll, dark: v.htmlDark, h1: v.h1, reg: v.registerLinks }]))));
