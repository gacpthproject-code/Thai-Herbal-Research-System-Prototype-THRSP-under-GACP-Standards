import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
await p.goto(B+'/health/home',{waitUntil:'networkidle',timeout:40000});
await p.waitForTimeout(1000);
// ทำให้ token เสียกลางคัน — เหมือนหมดอายุ
await ctx.clearCookies({name:'auth_token'});
await ctx.clearCookies({name:'refresh_token'});
console.log('cookies cut. now click ชำระเงิน in nav...');
await p.locator('a[href*="payments"], button:has-text("ชำระเงิน")').first().click();
await p.waitForTimeout(4000);
console.log('URL:', p.url().replace(B,''));
const st=await p.evaluate(()=>({
  h:[...document.querySelectorAll('h1,h2')].map(x=>x.textContent.trim().slice(0,50)).slice(0,2),
  alerts:[...document.querySelectorAll('[role=alert],[role=status]')].map(x=>x.textContent.trim().slice(0,90)).filter(Boolean).slice(0,3),
  bodySnippet:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,220),
}));
console.log(JSON.stringify(st,null,1));
await p.screenshot({path:`${OUT}/session-expired-midtask.png`,fullPage:true});
await b.close();
