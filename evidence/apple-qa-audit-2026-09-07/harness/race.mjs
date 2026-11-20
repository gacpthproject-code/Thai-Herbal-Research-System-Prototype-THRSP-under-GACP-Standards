import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com';
const b=await chromium.launch();
for (let run=1; run<=4; run++){
  const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
  const p=await ctx.newPage(); p.setDefaultTimeout(20000);
  await p.goto(B+'/health/applications/new',{waitUntil:'networkidle',timeout:60000});
  // run 1-2: กดเร็ว (ผู้ใช้ที่รู้ทาง)  run 3-4: รอ 3 วินาทีก่อนกด
  await p.waitForTimeout(run<=2 ? 1200 : 3500);
  const pick=async t=>{const l=p.locator(`button:has-text("${t}")`).first(); if(await l.count()){await l.click(); await p.waitForTimeout(run<=2?120:400);}};
  await pick('ขอใหม่'); await pick('บุคคลธรรมดา'); await pick('กัญชา');
  const nb=p.locator('button:has-text("ถัดไป")').first();
  if(await nb.isEnabled()){ await nb.click(); } else { console.log(`run${run}: ถัดไป disabled on step1`); await ctx.close(); continue; }
  await p.waitForTimeout(2500);
  const st=await p.evaluate(()=>({
    alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim().slice(0,46)),
    next:(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('ถัดไป'));return b?(b.disabled?'DISABLED':'enabled'):'missing'})(),
  }));
  console.log(`run${run} (${run<=2?'fast':'slow'}): next=${st.next} alerts=${JSON.stringify(st.alerts)}`);
  await ctx.close();
}
await b.close();
