import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
for (const theme of ['light','dark']) {
  const ctx=await b.newContext({viewport:{width:1440,height:900},locale:'th-TH',colorScheme:theme});
  await ctx.addInitScript(t=>{try{localStorage.setItem('theme',t);localStorage.setItem('theme:explicit','1');}catch{}}, theme);
  const p=await ctx.newPage();
  await p.goto(B+'/login',{waitUntil:'networkidle',timeout:45000});
  await p.waitForTimeout(600);
  const id=p.locator('#identifier');
  await id.click();
  await id.type('1409901234560', {delay:35});
  await p.waitForTimeout(400);
  const m=await p.evaluate(()=>{
    const el=document.querySelector('#identifier');
    const cs=getComputedStyle(el);
    // walk up for the real painted background
    let bgEl=el, bg=cs.backgroundColor;
    while (bgEl && (bg==='rgba(0, 0, 0, 0)'||bg==='transparent')) { bgEl=bgEl.parentElement; bg=bgEl?getComputedStyle(bgEl).backgroundColor:'#fff'; }
    const lum=c=>{const[r,g,bl]=c.match(/\d+/g).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return 0.2126*r+0.7152*g+0.0722*bl};
    const L1=lum(cs.color), L2=lum(bg);
    return {value:el.value, color:cs.color, bg, caret:cs.caretColor,
      ratio: Math.round(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05))*100)/100,
      placeholderShown: el.matches(':placeholder-shown')};
  });
  console.log(theme.toUpperCase(), JSON.stringify(m));
  await p.locator('#identifier').screenshot({path:`${OUT}/typed-field-${theme}.png`}).catch(()=>{});
  await p.screenshot({path:`${OUT}/typed-login-${theme}.png`, clip:{x:860,y:320,width:440,height:220}});
  await ctx.close();
}
await b.close();
