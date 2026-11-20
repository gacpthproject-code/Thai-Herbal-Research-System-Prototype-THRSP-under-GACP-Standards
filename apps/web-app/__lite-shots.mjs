import { chromium } from '@playwright/test';

const OUT = '/home/ubuntu/work/gacp-lite/evidence/step1-qa/after';
const WEB = 'http://127.0.0.1:3100';
const API = 'http://127.0.0.1:8100';

const APPLICANT = { id: '1102001501231', pw: 'LiteWalk#2569' };
const ACCOUNT   = { id: '1102001501233', pw: 'LiteOfficer#2569' };

async function loginApplicant(page) {
  const r = await page.request.post(`${API}/api/auth/applicant/login`, {
    data: { identifier: APPLICANT.id, password: APPLICANT.pw },
  });
  const j = await r.json();
  return j?.data?.tokens?.accessToken;
}
async function loginOfficer(page) {
  const r = await page.request.post(`${API}/api/auth/officer/login`, {
    data: { providerId: ACCOUNT.id, password: ACCOUNT.pw },
  });
  const j = await r.json();
  return j?.data?.token;
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const PUBLIC_PAGES = [
  ['auth', '/auth'],
  ['login-applicant', '/auth/health/login'],
  ['login-officer', '/auth/provider/login'],
  ['verify', '/verify'],
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
      locale: 'th-TH',
    });
    const page = await ctx.newPage();
    for (const [name, path] of PUBLIC_PAGES) {
      try {
        await page.goto(WEB + path, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/${vp.name}-${theme}-${name}.png`, fullPage: true });
        console.log(`  ✓ ${vp.name}/${theme}/${name}`);
      } catch (e) {
        console.log(`  ✗ ${vp.name}/${theme}/${name}: ${String(e).slice(0, 90)}`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.log('เสร็จ');
