import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(30000);
// หน่วงเฉพาะ API 3 วินาที — จำลองเน็ตช้า แล้วถ่ายสิ่งที่ผู้ใช้เห็นระหว่างรอ
await p.route('**/api/**', async route => {
  await new Promise(r=>setTimeout(r,3000));
  route.continue();
});
for (const route of ['/health/payments','/health/applications','/health/certificates','/health/documents']) {
  const t0=Date.now();
  p.goto(B+route,{waitUntil:'commit',timeout:40000}).catch(()=>{});
  await p.waitForTimeout(1800); // กลางช่วงรอ API
  const st=await p.evaluate(()=>({
    skeletons:document.querySelectorAll('[class*=skeleton],[class*=animate-pulse]').length,
    spinners:document.querySelectorAll('[class*=spin],[class*=loader],[role=progressbar]').length,
    text:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,120),
  }));
  console.log(`${route}: skeletons=${st.skeletons} spinners=${st.spinners}`);
  console.log(`   sees: ${st.text}`);
  await p.screenshot({path:`${OUT}/loading-${route.replace(/\W+/g,'_')}.png`});
  await p.waitForTimeout(3500);
}
await b.close();
