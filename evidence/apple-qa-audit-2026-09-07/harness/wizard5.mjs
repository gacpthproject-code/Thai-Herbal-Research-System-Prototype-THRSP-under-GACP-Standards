import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
const net=[];
p.on('response', r=>{ if(r.url().includes('/api/applications')) net.push(`${Date.now()%100000} ${r.status()} ${r.request().method()} ${r.url().replace(B,'').slice(0,100)}`); });
await p.goto(B+'/health/applications/new',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
const pick=async t=>{const l=p.locator(`button:has-text("${t}")`).first(); if(await l.count()){await l.click(); await p.waitForTimeout(300);}};
await pick('ขอใหม่'); await pick('บุคคลธรรมดา'); await pick('กัญชา');
await p.locator('button:has-text("ถัดไป")').first().click();
await p.waitForTimeout(1500);
console.log('--- on step 2, alert:', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim().slice(0,60)))));
// กรอกช่องตัวตนเหมือนคนจริง
await p.locator('#identity-firstName').fill('ทดสอบคุณภาพ');
await p.locator('#identity-lastName').fill('ระบบจีเอซีพี');
await p.locator('#identity-idCard').fill('3999000000005');
await p.locator('#identity-address').fill('99 หมู่ 9 ต.ทดสอบ อ.ทดสอบ จ.เชียงใหม่ 50000');
await p.locator('#identity-phone').fill('0812345678');
console.log('--- filled, waiting for autosave (8s) ---');
await p.waitForTimeout(8000);
const st=await p.evaluate(()=>({
  alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim().slice(0,70)),
  nextDisabled:(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('ถัดไป'));return b?b.disabled:null})(),
  saveBadge:(()=>{const el=[...document.querySelectorAll('*')].find(e=>/บันทึก/.test(e.textContent||'') && e.children.length===0);return el?el.textContent.trim().slice(0,30):null})(),
}));
console.log('state after fill+wait:', JSON.stringify(st));
console.log('--- API /applications calls ---');
net.forEach(x=>console.log('  ',x));
await p.screenshot({path:`${OUT}/wizard-step2-after-fill.png`,fullPage:true});
await b.close();
