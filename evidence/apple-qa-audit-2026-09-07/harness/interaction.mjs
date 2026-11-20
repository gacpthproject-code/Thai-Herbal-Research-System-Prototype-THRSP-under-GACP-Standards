import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);

// ---------- 1) FOCUS RING: เดินด้วย Tab อย่างเดียว 14 ครั้ง ----------
await p.goto(B+'/health/home',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1200);
const focus=[];
for(let i=0;i<14;i++){
  await p.keyboard.press('Tab'); await p.waitForTimeout(120);
  focus.push(await p.evaluate(()=>{
    const el=document.activeElement; if(!el||el===document.body) return {tag:'BODY'};
    const cs=getComputedStyle(el);
    const r=el.getBoundingClientRect();
    return {tag:el.tagName, txt:(el.textContent||'').trim().slice(0,22),
      outline:cs.outlineStyle+' '+cs.outlineWidth+' '+cs.outlineColor,
      boxShadow:cs.boxShadow.slice(0,60),
      visible:r.width>0&&r.height>0 && r.top>=0 && r.top<window.innerHeight,
      offscreen: r.top<0 || r.top>window.innerHeight};
  }));
}
const noRing=focus.filter(f=>f.tag!=='BODY' && f.outline.startsWith('none') && (!f.boxShadow||f.boxShadow==='none'));
console.log('TAB STOPS', focus.length, '| ไม่มี focus ring:', noRing.length);
noRing.slice(0,5).forEach(f=>console.log('   NO-RING', f.tag, JSON.stringify(f.txt), f.outline));
await p.screenshot({path:`${OUT}/focus-after-14-tabs.png`});

// ---------- 2) THEME TOGGLE: มี transition ไหม + กี่ ms ----------
await p.goto(B+'/health/home',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(900);
const trans=await p.evaluate(()=>{
  const de=document.documentElement, bd=document.body;
  const g=e=>{const c=getComputedStyle(e);return {prop:c.transitionProperty,dur:c.transitionDuration,ease:c.transitionTimingFunction}};
  return {html:g(de), body:g(bd)};
});
console.log('THEME TRANSITION', JSON.stringify(trans));
const toggle=p.locator('button[aria-label*="โหมด"], button[aria-label*="theme"], button:has(svg.lucide-moon), button:has(svg.lucide-sun)').first();
const has=await toggle.count();
console.log('theme toggle found:', has);
if(has){
  const before=await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  await toggle.click(); await p.waitForTimeout(60);
  const at60=await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  await p.waitForTimeout(500);
  const after=await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  console.log('bg before/60ms/after:', before,'/',at60,'/',after, '| instant flip =', at60===after && before!==after);
  await p.screenshot({path:`${OUT}/theme-after-toggle.png`});
}

// ---------- 3) prefers-reduced-motion ----------
const rm=await p.evaluate(()=>{
  let n=0; for(const s of document.styleSheets){ try{ for(const r of s.cssRules){ if(String(r.conditionText||r.media?.mediaText||'').includes('reduced-motion')) n++; } }catch{} }
  return n;
});
console.log('CSS rules under prefers-reduced-motion:', rm);
await b.close();
