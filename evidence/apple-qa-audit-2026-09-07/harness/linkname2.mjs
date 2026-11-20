import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:390,height:844},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
await p.goto(B+'/health/home',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1000);
const r=await p.evaluate(()=>{
  const els=[...document.querySelectorAll('a[href$="home"]')];
  return els.map(a=>({
    cls:String(a.className).slice(0,70),
    outer:a.outerHTML.replace(/\s+/g,' ').slice(0,320),
    text:(a.textContent||'').trim().slice(0,40),
    ariaHidden:a.getAttribute('aria-hidden'),
    childAriaHidden:[...a.querySelectorAll('[aria-hidden="true"]')].length,
    rect:(()=>{const x=a.getBoundingClientRect();return {w:Math.round(x.width),h:Math.round(x.height)}})(),
  }));
});
console.log(JSON.stringify(r,null,1));
await b.close();
