// A = { path, name, grep }  open a page, screenshot it, return matching lines of its text
await h.go(page, A.path);
await page.waitForTimeout(A.wait || 3000);
const r = await h.shot(page, A.name);
const t = await page.evaluate(() => document.body.innerText);
const re = new RegExp(A.grep || '.', 'u');
return [r, h.scrub(t.split('\n').filter((l) => re.test(l)).slice(0, A.max || 25).join('\n'))];
