import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
await p.goto(B+'/health/applications/new',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(2500);

const pick=async t=>{ const l=p.locator(`button:has-text("${t}")`).first(); if(await l.count()){ await l.click(); await p.waitForTimeout(350);} };
await pick('ขอใหม่'); await pick('บุคคลธรรมดา'); await pick('กัญชา');
await p.waitForTimeout(400);
await p.screenshot({path:`${OUT}/wizard-01-picked.png`,fullPage:true});
const nextEnabled=await p.locator('button:has-text("ถัดไป")').first().isEnabled();
console.log('after 3 picks, ถัดไป enabled =', nextEnabled);

for(let step=1; step<=6; step++){
  const t0=Date.now();
  const nb=p.locator('button:has-text("ถัดไป")').first();
  if(!(await nb.count()) || !(await nb.isEnabled())) { console.log(`stop at step ${step}: ถัดไป unavailable/disabled`); break; }
  await nb.click();
  await p.waitForTimeout(2200);
  const info=await p.evaluate(()=>({
    url:location.pathname,
    h:[...document.querySelectorAll('h2,h3')].map(x=>x.textContent.trim().slice(0,42)).slice(0,4),
    fields:[...document.querySelectorAll('input,select,textarea')].length,
    visibleFields:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.offsetParent!==null).length,
    req:[...document.querySelectorAll('[required],[aria-required="true"]')].length,
    labels:[...document.querySelectorAll('label')].length,
    alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim().slice(0,70)).slice(0,3),
    docH:document.body.scrollHeight,
  }));
  console.log(`step${step+1} ${info.url} ${Date.now()-t0}ms | fields ${info.visibleFields}/${info.fields} required ${info.req} labels ${info.labels} pageH ${info.docH}px`);
  console.log(`        ${JSON.stringify(info.h)} alerts=${JSON.stringify(info.alerts)}`);
  await p.screenshot({path:`${OUT}/wizard-0${step+1}.png`,fullPage:true});
}
await b.close();
