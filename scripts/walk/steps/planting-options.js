// A = { p }  applicant opens /health/planting/new and returns every choice the form offers (read-only, nothing saved)
await h.go(page, '/health/planting/new');
await page.waitForTimeout(3000);
await h.shot(page, `${A.p}-planting-choices`);
const options = [];
for (const s of await page.locator('select').all()) options.push(...(await s.locator('option').allTextContents()));
const text = await page.evaluate(() => document.querySelector('main')?.innerText || '');
return { options, text };
