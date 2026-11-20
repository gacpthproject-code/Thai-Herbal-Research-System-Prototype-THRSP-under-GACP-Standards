// Round 2: upload an attachment, then SAVE the activity carrying it, through the UI.
// Usage: node walk-save.js <base> <cycleId> <entityId> <outDir> <label> <light|dark> <pdf>
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const [base, cycleId, entityId, outDir, label, theme, pdf] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'network'), { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme });
  await ctx.addInitScript(([t, e]) => {
    localStorage.setItem('theme', t); localStorage.setItem('theme:explicit', '1');
    localStorage.setItem('gacp.activeEntityId', e);
  }, [theme, entityId]);
  const page = await ctx.newPage();
  const calls = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (/\/attachments|\/activities/.test(u) && res.request().method() !== 'GET') {
      let body = null; try { body = await res.json(); } catch (_) {}
      calls.push({ method: res.request().method(), url: u.replace(/^https?:\/\/[^/]+/, ''), status: res.status(),
        requestAttachmentIds: (() => { try { return JSON.parse(res.request().postData() || '{}').attachmentIds || null; } catch (_) { return null; } })(),
        responseCode: body?.code || null,
        responseDocumentId: body?.data?.documentId || null,
        responseAttachmentIds: body?.data?.attachmentIds || null });
    }
  });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.fill('#identifier', '1100000000008');
  await page.fill('#password', 'Walk@123456');
  await Promise.all([page.waitForURL((u) => !/login/.test(u.toString()), { timeout: 120000 }), page.click('button[type=submit]:has-text("เข้าสู่ระบบ")')]);
  await page.goto(`${base}/health/planting/${cycleId}/activities`, { waitUntil: 'networkidle', timeout: 180000 });
  const tag = `save-${label}-${theme}`;
  await page.locator('input[type=file]').first().setInputFiles(pdf);
  await page.getByText('irrigation-record.pdf').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.getByText('ไฟล์แนบที่เลือกแล้ว').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'screenshots', `${tag}-01-attached.png`) });
  await page.getByRole('button', { name: 'บันทึกกิจกรรม' }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, 'screenshots', `${tag}-02-after-save.png`) });
  await page.getByText('Timeline กิจกรรม').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'screenshots', `${tag}-03-timeline.png`) });
  fs.writeFileSync(path.join(outDir, 'network', `${tag}.json`), JSON.stringify({ page: page.url().replace(/^https?:\/\/[^/]+/, ''), calls }, null, 2));
  await b.close();
  console.log(tag, JSON.stringify(calls.map((c) => `${c.method} ${c.url} ${c.status} ${c.responseCode || ''}`)));
})().catch((e) => { console.error('WALK FAILED', e.message); process.exit(1); });
