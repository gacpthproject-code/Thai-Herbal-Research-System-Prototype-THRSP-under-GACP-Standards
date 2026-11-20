import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
const calls=[];
// จำลอง token หมดอายุ: ทุก API ที่หน้า payments ใช้ ตอบ 401 แบบที่ backend ตอบจริง
await p.route('**/api/**', route => {
  const u=route.request().url();
  calls.push(route.request().method()+' '+u.replace(B,'').slice(0,70));
  if (/payments|invoices|checkout|billing|quotation/.test(u)) {
    return route.fulfill({status:500, contentType:'application/json',
      body:JSON.stringify({success:false,error:'INTERNAL_ERROR',message:'Something broke'})});
  }
  return route.continue();
});
await p.goto(B+'/health/payments',{waitUntil:'networkidle',timeout:40000});
await p.waitForTimeout(3500);
const st=await p.evaluate(()=>({
  listArea:(document.body.innerText.match(/ไม่พบรายการชำระเงิน|เข้าสู่ระบบ|หมดอายุ|เซสชัน|ลองใหม่|ผิดพลาด/g)||[]),
  url:location.pathname,
}));
console.log('API calls:', calls.filter(c=>/payments|invoice|billing/.test(c)).slice(0,4));
console.log('state:', JSON.stringify(st));
await p.screenshot({path:`${OUT}/payments-on-500.png`,fullPage:true});
await b.close();
