import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const QR='/trace/960853e6-7c3d-461d-a62a-1fb96e687a2d';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},locale:'th-TH',isMobile:true,hasTouch:true});
const p=await ctx.newPage();
const api=[];
p.on('response',r=>{const u=r.url(); if(u.includes('/api/')) api.push({u:u.replace(B,'').slice(0,80), ms:null, status:r.status()});});
const t0=Date.now();
p.goto(B+QR,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
for (const at of [1500, 3500, 6000]) {
  const wait=at-(Date.now()-t0); if(wait>0) await p.waitForTimeout(wait);
  await p.screenshot({path:`${OUT}/scan-wait-${at}ms.png`});
}
await p.waitForTimeout(4000);
// จับเวลา API ตรง ๆ
const timing=await p.evaluate(()=>performance.getEntriesByType('resource')
  .filter(r=>r.name.includes('/api/'))
  .map(r=>({path:new URL(r.name).pathname.slice(0,60), ms:Math.round(r.duration)})));
console.log('API timings:', JSON.stringify(timing));
await b.close();
