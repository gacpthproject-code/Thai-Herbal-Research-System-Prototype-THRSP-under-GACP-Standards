import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:390,height:844},
  locale:'th-TH', isMobile:true, hasTouch:true, deviceScaleFactor:2});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
for (const route of ['/health/home','/health/more','/health/training','/health/settings']) {
  await p.goto(B+route,{waitUntil:'networkidle',timeout:40000});
  await p.waitForTimeout(1200);
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await p.waitForTimeout(900);
  const m=await p.evaluate(()=>{
    const nav=document.querySelector('.gov-bottom-nav, nav[class*=bottom], [data-testid*=bottom-nav]')?.closest('nav,div');
    const nb=nav?nav.getBoundingClientRect():null;
    const bodyPB=getComputedStyle(document.body).paddingBottom;
    const mainPB=(()=>{const m=document.querySelector('main');return m?getComputedStyle(m).paddingBottom:null})();
    // element visually under the nav at the very bottom
    let covered=null;
    if(nb){
      const x=nb.left+nb.width/2, y=nb.top-4;
      const el=document.elementFromPoint(x, nb.top+nb.height/2);
      const below=document.elementFromPoint(x, y);
      covered={atNavCenter:el?el.tagName+'.'+String(el.className).slice(0,40):null,
               justAbove:below?below.tagName+'.'+String(below.className).slice(0,40):null};
    }
    // touch-target audit on the nav
    const items=[...document.querySelectorAll('.gov-bottom-nav-item')].map(a=>{
      const r=a.getBoundingClientRect();
      return {t:(a.textContent||'').trim().slice(0,12), w:Math.round(r.width), h:Math.round(r.height),
              aria:a.getAttribute('aria-label')||null, hasText:(a.textContent||'').trim().length>0};
    });
    return {navRect:nb?{top:Math.round(nb.top),h:Math.round(nb.height)}:null, bodyPB, mainPB, covered, items,
            scrollBottom: Math.round(window.scrollY+window.innerHeight), docH: document.body.scrollHeight};
  });
  console.log(route, JSON.stringify(m));
  await p.screenshot({path:`${OUT}/bottom-${route.replace(/\W+/g,'_')}.png`});
}
await b.close();
