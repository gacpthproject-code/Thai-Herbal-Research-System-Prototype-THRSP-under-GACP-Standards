import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
// เปิด wizard ใหม่หลังปิดเบราว์เซอร์ — งานเก่าต้องกลับมา
await p.goto(B+'/health/applications/new',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(3000);
console.log('URL:', p.url().replace(B,''));
const st=await p.evaluate(()=>({
  h:[...document.querySelectorAll('h2')].map(x=>x.textContent.trim().slice(0,40)).slice(0,2),
  resume:[...document.querySelectorAll('button,a')].map(x=>x.textContent.trim()).filter(t=>/ต่อ|เดิม|ล่าสุด|draft/i.test(t)).slice(0,4),
  firstName:(document.querySelector('#identity-firstName')||{}).value ?? null,
  stepActive:(()=>{const el=document.querySelector('[class*="active"],[aria-current="step"]');return el?el.textContent.trim().slice(0,20):null})(),
}));
console.log('after reopen:', JSON.stringify(st));
await p.screenshot({path:`${OUT}/wizard-after-reopen.png`,fullPage:true});

// ทดสอบ back button จากกลาง wizard
await p.goBack(); await p.waitForTimeout(1500);
console.log('after browser-back:', p.url().replace(B,''));
await b.close();
