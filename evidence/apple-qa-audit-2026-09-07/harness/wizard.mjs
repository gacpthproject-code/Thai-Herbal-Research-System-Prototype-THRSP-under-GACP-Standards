import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text().replace(/\s+/g,' ').slice(0,120))});
const t0=Date.now();
await p.goto(B+'/health/applications/new',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);
console.log('open wizard:', Date.now()-t0, 'ms | url', p.url().replace(B,''));
await p.screenshot({path:`${OUT}/wizard-01.png`,fullPage:true});
const s=await p.evaluate(()=>({
  h:[...document.querySelectorAll('h1,h2,h3')].map(x=>x.textContent.trim().slice(0,50)).slice(0,6),
  steps:[...document.querySelectorAll('[data-testid*=step],[class*=step]')].length,
  inputs:[...document.querySelectorAll('input,select,textarea')].map(x=>`${x.id||x.name||x.placeholder||'-'}:${x.type||x.tagName}`).slice(0,30),
  buttons:[...document.querySelectorAll('button')].map(x=>x.textContent.trim().slice(0,26)).filter(Boolean).slice(0,14),
  required:[...document.querySelectorAll('[required],[aria-required=true]')].length,
}));
console.log('headings:', JSON.stringify(s.h));
console.log('inputs  :', s.inputs.join(' | '));
console.log('buttons :', s.buttons.join(' / '));
console.log('required:', s.required, '| step-ish nodes:', s.steps);
console.log('console errors:', errs.slice(0,3));
await b.close();
