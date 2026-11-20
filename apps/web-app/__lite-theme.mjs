import { chromium } from '@playwright/test';
const WEB='http://127.0.0.1:3100';
const b=await chromium.launch();
for(const scheme of ['dark','light']){
  const ctx=await b.newContext({colorScheme:scheme});
  const p=await ctx.newPage();
  await p.goto(WEB+'/auth',{waitUntil:'networkidle'});
  await p.waitForTimeout(500);
  const r=await p.evaluate(()=>({
    htmlClass: document.documentElement.className,
    dataTheme: document.documentElement.getAttribute('data-theme'),
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    localStorageTheme: localStorage.getItem('theme'),
  }));
  console.log(`  ${scheme.padEnd(6)} prefersDark=${r.prefersDark}  html.class="${r.htmlClass}"  data-theme=${r.dataTheme}  ls=${r.localStorageTheme}`);
  console.log(`         body bg=${r.bodyBg}  color=${r.bodyColor}`);
  await ctx.close();
}
await b.close();
