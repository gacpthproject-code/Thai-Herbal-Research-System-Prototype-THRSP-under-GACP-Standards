import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(25000);
await p.goto(B+'/login',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(900);
await p.locator('#identifier').fill(process.env.QA_ID);
await p.locator('input[type=password]').first().fill(process.env.QA_PW);
await p.locator('button:has-text("เข้าสู่ระบบ")').last().click();
await p.waitForURL(u=>/\/health\/(home|dashboard)/.test(u.pathname),{timeout:45000}).catch(()=>{});
await p.waitForTimeout(1500);
console.log('logged in as virgin account ->', p.url().replace(B,''));
await p.goto(B+'/health/applications/new',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(3000);
const pick=async t=>{const l=p.locator(`button:has-text("${t}")`).first(); if(await l.count()){await l.click(); await p.waitForTimeout(300);}};
await pick('ขอใหม่'); await pick('บุคคลธรรมดา'); await pick('กัญชา');
await p.locator('button:has-text("ถัดไป")').first().click();
await p.waitForTimeout(3000);
const st=await p.evaluate(()=>({
  url:location.pathname,
  alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim().slice(0,80)),
  next:(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('ถัดไป'));return b?(b.disabled?'DISABLED':'enabled'):'missing'})(),
}));
console.log('FIRST-EVER application, step 2:', JSON.stringify(st,null,1));
await p.screenshot({path:`${OUT}/virgin-step2.png`,fullPage:true});
await b.close();
