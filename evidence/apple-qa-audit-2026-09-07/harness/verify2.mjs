import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const lum=c=>{const[r,g,bl]=c.match(/\d+/g).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return 0.2126*r+0.7152*g+0.0722*bl};
const ratio=(a,bg)=>{const L1=lum(a),L2=lum(bg);return Math.round(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05))*100)/100};

// E) หน้า /accessibility โหมดสว่าง — ปุ่มสลับภาษามองเห็นไหม
{
  const p=await (await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'})).newPage();
  await p.goto(B+'/accessibility',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>{
    const out=[];
    for(const el of document.querySelectorAll('button,a')){
      if(el.children.length>2) continue;
      const cs=getComputedStyle(el);
      let bgEl=el,bg=cs.backgroundColor;
      while(bgEl&&(bg==='rgba(0, 0, 0, 0)'||bg==='transparent')){bgEl=bgEl.parentElement;bg=bgEl?getComputedStyle(bgEl).backgroundColor:'rgb(255,255,255)';}
      out.push({t:(el.textContent||'').trim().slice(0,18), fg:cs.color, bg});
    }
    return out.slice(0,8);
  });
  console.log('E) /accessibility controls (light):');
  r.forEach(x=>console.log(`    "${x.t}" fg=${x.fg} bg=${x.bg} ratio=${ratio(x.fg,x.bg)}`));
  await p.locator('body').screenshot({path:`${OUT}/a11y-light-top.png`}).catch(()=>{});
}
// F) 404 โหมดมืด — ปุ่มที่ว่างเปล่า
{
  const ctx=await b.newContext({viewport:{width:1440,height:900},locale:'th-TH',colorScheme:'dark'});
  await ctx.addInitScript(()=>{try{localStorage.setItem('theme','dark');localStorage.setItem('theme:explicit','1');}catch{}});
  const p=await ctx.newPage();
  await p.goto(B+'/this-route-does-not-exist',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>[...document.querySelectorAll('a,button')].map(el=>{
    const cs=getComputedStyle(el);let bgEl=el,bg=cs.backgroundColor;
    while(bgEl&&(bg==='rgba(0, 0, 0, 0)'||bg==='transparent')){bgEl=bgEl.parentElement;bg=bgEl?getComputedStyle(bgEl).backgroundColor:'rgb(0,0,0)';}
    return {t:(el.textContent||'').trim().slice(0,22),fg:cs.color,bg};
  }).slice(0,6));
  console.log('F) 404 dark controls:');
  r.forEach(x=>console.log(`    "${x.t}" fg=${x.fg} bg=${x.bg} ratio=${ratio(x.fg,x.bg)}`));
  await p.screenshot({path:`${OUT}/404-dark.png`,fullPage:true});
}
await b.close();
