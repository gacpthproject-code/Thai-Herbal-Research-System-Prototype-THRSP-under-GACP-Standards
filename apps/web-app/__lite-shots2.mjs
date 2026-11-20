import { chromium } from '@playwright/test';
const OUT='/home/ubuntu/work/gacp-lite/evidence/step1-qa/after';
const WEB='http://127.0.0.1:3100', API='http://127.0.0.1:8100';

async function tokenApplicant(ctx){
  const r=await ctx.request.post(`${API}/api/auth/applicant/login`,{data:{identifier:'1102001501231',password:'LiteWalk#2569'}});
  return (await r.json())?.data?.tokens?.accessToken;
}
async function tokenOfficer(ctx,id){
  const r=await ctx.request.post(`${API}/api/auth/officer/login`,{data:{providerId:id,password:'LiteOfficer#2569'}});
  return (await r.json())?.data?.token;
}

const b=await chromium.launch();
const APP='61f1eea0-17fc-40fa-b6b6-10fbc4f0992f';

for(const vp of [{n:'desktop',w:1440,h:900},{n:'mobile',w:390,h:844}]){
  // ── ฝั่งผู้ยื่น ──
  let ctx=await b.newContext({viewport:{width:vp.w,height:vp.h},locale:'th-TH'});
  let page=await ctx.newPage();
  const t=await tokenApplicant(ctx);
  await page.goto(WEB+'/auth',{waitUntil:'domcontentloaded'});
  await page.evaluate(tok=>{localStorage.setItem('token',tok);localStorage.setItem('accessToken',tok);},t);
  for(const [name,path] of [['fee-status',`/health/payments?app=${APP}`],['applications','/health/applications'],['home','/health/home']]){
    try{
      await page.goto(WEB+path,{waitUntil:'networkidle',timeout:25000});
      await page.waitForTimeout(1200);
      await page.screenshot({path:`${OUT}/${vp.n}-applicant-${name}.png`,fullPage:true});
      console.log(`  ✓ ${vp.n}/applicant/${name}`);
    }catch(e){console.log(`  ✗ ${vp.n}/applicant/${name}: ${String(e).slice(0,70)}`);}
  }
  await ctx.close();

  // ── ฝั่งบัญชี ──
  ctx=await b.newContext({viewport:{width:vp.w,height:vp.h},locale:'th-TH'});
  page=await ctx.newPage();
  const ot=await tokenOfficer(ctx,'1102001501233');
  await page.goto(WEB+'/auth',{waitUntil:'domcontentloaded'});
  await page.evaluate(tok=>{localStorage.setItem('token',tok);localStorage.setItem('accessToken',tok);},ot);
  for(const [name,path] of [['accounting','/provider/accounting'],['home','/provider/home']]){
    try{
      await page.goto(WEB+path,{waitUntil:'networkidle',timeout:25000});
      await page.waitForTimeout(1200);
      await page.screenshot({path:`${OUT}/${vp.n}-account-${name}.png`,fullPage:true});
      console.log(`  ✓ ${vp.n}/account/${name}`);
    }catch(e){console.log(`  ✗ ${vp.n}/account/${name}: ${String(e).slice(0,70)}`);}
  }
  await ctx.close();
}
await b.close();
