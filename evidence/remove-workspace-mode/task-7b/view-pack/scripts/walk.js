// Usage: node walk.js <base> <cycleId> <entityId> <outDir> <label> <light|dark> <pdf>
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/wt-r2/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const [base, cycleId, entityId, outDir, label, theme, pdf] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'network'), { recursive: true });
  const TRACE_DIR = process.env.TRACE_DIR || '/tmp/vp-trace'; fs.mkdirSync(TRACE_DIR, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme });
  await ctx.tracing.start({ screenshots: true, snapshots: true });
  await ctx.addInitScript(([t, e]) => {
    localStorage.setItem('theme', t); localStorage.setItem('theme:explicit', '1');
    localStorage.setItem('gacp.activeEntityId', e);
  }, [theme, entityId]);
  const page = await ctx.newPage();
  const calls = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (/draft-documents|\/attachments/.test(u)) {
      const req = res.request();
      let body = null; try { body = await res.json(); } catch (_) {}
      calls.push({ method: req.method(), url: u.replace(/^https?:\/\/[^/]+/, ''), status: res.status(),
        requestHeaderActiveEntity: (await req.allHeaders())['x-active-entity-id'] || null,
        responseDataKeys: body && body.data ? Object.keys(body.data) : null, success: body ? body.success : null });
    }
  });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.fill('#identifier', '1100000000008');
  await page.fill('#password', 'Walk@123456');
  await Promise.all([page.waitForURL((u) => !/login/.test(u.toString()), { timeout: 120000 }), page.click('button[type=submit]:has-text("เข้าสู่ระบบ")')]);
  await page.goto(`${base}/health/planting/${cycleId}/activities`, { waitUntil: 'networkidle', timeout: 180000 });
  const input = page.locator('input[type=file]').first();
  await input.scrollIntoViewIfNeeded();
  const tag = `${label}-${theme}`;
  await page.screenshot({ path: path.join(outDir, 'screenshots', `${tag}-01-before-upload.png`) });
  await input.setInputFiles(pdf);
  await page.getByText('irrigation-record.pdf').first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByText('ไฟล์แนบที่เลือกแล้ว').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: path.join(outDir, 'screenshots', `${tag}-02-after-upload.png`) });
  await page.screenshot({ path: path.join(outDir, 'screenshots', `${tag}-03-full-page.png`), fullPage: true });
  // remove through the UI
  const del = page.getByRole('button', { name: 'ลบ' }).first();
  if (await del.count()) { await del.click(); await page.waitForTimeout(1500); }
  await page.screenshot({ path: path.join(outDir, 'screenshots', `${tag}-04-after-remove.png`) });
  fs.writeFileSync(path.join(outDir, 'network', `${tag}.json`), JSON.stringify({ page: page.url().replace(/^https?:\/\/[^/]+/, ''), calls }, null, 2));
  await ctx.tracing.stop({ path: path.join(TRACE_DIR, `${tag}.zip`) });
  await b.close();
  console.log(tag, JSON.stringify(calls.map((c) => `${c.method} ${c.url} ${c.status}`)));
})().catch((e) => { console.error('WALK FAILED', e.message); process.exit(1); });
