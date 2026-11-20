import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
try{
  await p.goto(B+'/login',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(600);
  await p.locator('#identifier').fill(process.env.QA_ID);
  await p.locator('input[type=password]').first().fill(process.env.QA_PW);
  const t0=Date.now();
  await p.locator('button:has-text("เข้าสู่ระบบ")').last().click();
  await p.waitForTimeout(6000);
  console.log('after login ->', p.url(), '|', Date.now()-t0, 'ms');
  await p.screenshot({path:`${OUT}/login-result.png`,fullPage:true});
  console.log('alerts:', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('[role=alert],.text-red-600,.text-destructive')].map(x=>x.textContent.trim().slice(0,140)).filter(Boolean).slice(0,3))));
  console.log('h1/h2:', await p.evaluate(()=>[...document.querySelectorAll('h1,h2')].map(x=>x.textContent.trim().slice(0,60)).slice(0,3).join(' | ')));
  const ck=await ctx.cookies(); console.log('cookies:', ck.map(c=>c.name).join(','));
}catch(e){console.log('ERR',String(e.message).split('\n')[0].slice(0,180));}
await b.close();
