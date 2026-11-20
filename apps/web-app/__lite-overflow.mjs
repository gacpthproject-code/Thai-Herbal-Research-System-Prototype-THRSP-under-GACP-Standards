import { chromium } from '@playwright/test';
const WEB='http://127.0.0.1:3100', API='http://127.0.0.1:8100';
const APP='61f1eea0-17fc-40fa-b6b6-10fbc4f0992f';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},locale:'th-TH'});
const page=await ctx.newPage();
const r=await ctx.request.post(`${API}/api/auth/applicant/login`,{data:{identifier:'1102001501231',password:'LiteWalk#2569'}});
const tok=(await r.json())?.data?.tokens?.accessToken;
await page.goto(WEB+'/auth',{waitUntil:'domcontentloaded'});
await page.evaluate(t=>{localStorage.setItem('token',t);localStorage.setItem('accessToken',t);},tok);

const PAGES=[['auth','/auth'],['login','/auth/health/login'],['verify','/verify'],
             ['fee',`/health/payments?app=${APP}`],['apps','/health/applications'],['home','/health/home']];
console.log('  หน้า                 scrollW/clientW   เลื่อนแนวนอน   ตัวที่ล้น');
for(const [n,p] of PAGES){
  try{
    await page.goto(WEB+p,{waitUntil:'networkidle',timeout:25000});
    await page.waitForTimeout(900);
    const m=await page.evaluate(()=>{
      const d=document.documentElement;
      const over=[...document.querySelectorAll('*')]
        .filter(e=>e.getBoundingClientRect().right > d.clientWidth+1)
        .slice(0,3)
        .map(e=>`${e.tagName.toLowerCase()}${e.className&&typeof e.className==='string'?'.'+e.className.split(' ').slice(0,2).join('.'):''}`);
      return {sw:d.scrollWidth, cw:d.clientWidth, over};
    });
    const bad=m.sw>m.cw+1;
    console.log(`  ${n.padEnd(20)} ${String(m.sw).padStart(4)}/${m.cw}      ${bad?'✗ ใช่':'✓ ไม่'}          ${m.over.join(' | ').slice(0,60)}`);
  }catch(e){console.log(`  ${n}: ${String(e).slice(0,60)}`);}
}
await b.close();
