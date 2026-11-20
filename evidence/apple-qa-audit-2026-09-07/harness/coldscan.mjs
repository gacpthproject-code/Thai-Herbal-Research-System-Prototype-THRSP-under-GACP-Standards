import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com';
const QR='/trace/960853e6-7c3d-461d-a62a-1fb96e687a2d';
const b=await chromium.launch();
// จำลองมือถือกลางแจ้ง: 4G ช้า ครั้งแรก ไม่มี cache
const ctx=await b.newContext({viewport:{width:390,height:844},locale:'th-TH',isMobile:true,hasTouch:true});
const p=await ctx.newPage();
const cdp=await ctx.newCDPSession(p);
await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.5*1024*1024/8,uploadThroughput:750*1024/8});
const t0=Date.now();
await p.goto(B+QR,{waitUntil:'domcontentloaded',timeout:60000});
const domMs=Date.now()-t0;
// รอจนหัวเรื่อง "ผ่านการรับรอง" ปรากฏ = ผู้ซื้อเห็นคำตอบ
await p.waitForFunction(()=>/ผ่านการรับรอง|ได้รับการรับรอง/.test(document.body.innerText),{timeout:60000}).catch(()=>{});
const answerMs=Date.now()-t0;
await p.waitForLoadState('networkidle',{timeout:60000}).catch(()=>{});
const fullMs=Date.now()-t0;
console.log(`slow-4G first scan: dom=${domMs}ms answer-visible=${answerMs}ms full=${fullMs}ms`);
const m=await p.evaluate(()=>{
  const nav=performance.getEntriesByType('navigation')[0];
  const res=performance.getEntriesByType('resource');
  const js=res.filter(r=>r.name.includes('/_next/static')&&r.name.endsWith('.js'));
  const totalJs=js.reduce((s,r)=>s+(r.transferSize||0),0);
  return {transferJsKB:Math.round(totalJs/1024), jsFiles:js.length,
    domInteractive:Math.round(nav.domInteractive), pageWeightKB:Math.round(res.reduce((s,r)=>s+(r.transferSize||0),0)/1024)};
});
console.log('weights:', JSON.stringify(m));
await b.close();
