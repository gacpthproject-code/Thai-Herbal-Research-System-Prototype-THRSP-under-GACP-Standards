import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:1440,height:900},locale:'th-TH',deviceScaleFactor:2});
const p=await ctx.newPage(); p.setDefaultTimeout(20000);
await p.goto(B+'/health/applications',{waitUntil:'networkidle',timeout:40000});
await p.waitForTimeout(1500);
const m=await p.evaluate(()=>{
  const inp=document.querySelector('input[placeholder*="ค้นหา"]');
  if(!inp) return null;
  const cs=getComputedStyle(inp);
  const r=inp.getBoundingClientRect();
  // ไอคอนพี่น้องที่ absolute ทับอยู่
  const wrap=inp.parentElement;
  const icon=wrap.querySelector('svg');
  const ir=icon?icon.getBoundingClientRect():null;
  return {placeholder:inp.placeholder.slice(0,30), paddingLeft:cs.paddingLeft,
    inputLeft:Math.round(r.left), iconRight:ir?Math.round(ir.right):null,
    textStartsAt:Math.round(r.left)+parseFloat(cs.paddingLeft),
    iconOverlapsText: ir ? (r.left+parseFloat(cs.paddingLeft)) < ir.right : null};
});
console.log(JSON.stringify(m));
const el=p.locator('input[placeholder*="ค้นหา"]');
await el.screenshot({path:`${OUT}/search-input-zoom.png`});
await b.close();
