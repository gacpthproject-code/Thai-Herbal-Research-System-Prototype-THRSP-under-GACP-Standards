import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
const net=[];
p.on('response', async r=>{ const u=r.url(); if(u.includes('/api/')) net.push(`${r.status()} ${r.request().method()} ${u.replace(B,'').slice(0,110)}`); });
p.on('requestfailed', rq=>{ if(rq.url().includes('/api/')) net.push('FAILED '+rq.method()+' '+rq.url().replace(B,'').slice(0,110)+' :: '+(rq.failure()&&rq.failure().errorText)); });
await p.goto(B+'/health/applications/new',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
const pick=async t=>{const l=p.locator(`button:has-text("${t}")`).first(); if(await l.count()){await l.click(); await p.waitForTimeout(300);}};
await pick('ขอใหม่'); await pick('บุคคลธรรมดา'); await pick('กัญชา');
net.length=0;
await p.locator('button:has-text("ถัดไป")').first().click();
await p.waitForTimeout(3500);
console.log('=== API calls on entering step 2 ===');
net.forEach(x=>console.log('  ', x));
const st=await p.evaluate(()=>({
  alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim()).slice(0,3),
  nextDisabled:(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('ถัดไป'));return b?b.disabled:null})(),
  nextText:(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('ถัดไป'));return b?b.textContent.trim():null})(),
  retry:[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>/ลองใหม่|รีเฟรช|retry/i.test(t)),
  filled:[...document.querySelectorAll('input')].map(i=>`${i.id||i.name}="${(i.value||'').slice(0,18)}"`),
}));
console.log('\n=== step 2 state ===');
console.log(JSON.stringify(st,null,1));
await p.screenshot({path:`${OUT}/wizard-step2-blocked.png`,fullPage:true});
await b.close();
