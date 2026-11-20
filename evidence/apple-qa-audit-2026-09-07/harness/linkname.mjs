import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:390,height:844},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
await p.goto(B+'/health/home',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1000);
const r=await p.evaluate(()=>[...document.querySelectorAll('a')].map(a=>({
  href:(a.getAttribute('href')||'').slice(0,40),
  cls:String(a.className).slice(0,44),
  text:(a.textContent||'').trim().slice(0,26),
  aria:a.getAttribute('aria-label'),
  title:a.getAttribute('title'),
  imgAlt:[...a.querySelectorAll('img')].map(i=>i.getAttribute('alt')).join('|')||null,
  svgTitle:[...a.querySelectorAll('svg title')].map(t=>t.textContent).join('|')||null,
})).filter(a=>!a.text && !a.aria && !a.title && !a.imgAlt && !a.svgTitle));
console.log('UNLABELLED LINKS:', JSON.stringify(r,null,1));
await b.close();
