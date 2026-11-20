import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'})).newPage();
await p.goto(B+'/auth',{waitUntil:'networkidle',timeout:40000});
await p.waitForTimeout(1200);
const r=await p.evaluate(()=>{
  // หา element ที่ถือประโยคนี้
  const el=[...document.querySelectorAll('p,div,span')].find(e=>e.children.length===0&&/ชำระค่าธรรมเนียม/.test(e.textContent));
  if(!el) return {found:false};
  const range=document.createRange();
  const tn=el.firstChild;
  const text=tn.textContent;
  const i=text.indexOf('ค่าธรรมเนียม');
  const lines=[];
  // หา y ของตัวอักษรแต่ละตัวในคำ ค่าธรรมเนียม
  for(let k=i;k<i+12&&k<text.length;k++){
    range.setStart(tn,k); range.setEnd(tn,k+1);
    const rc=range.getBoundingClientRect();
    lines.push({ch:text[k], y:Math.round(rc.top)});
  }
  const ys=[...new Set(lines.map(l=>l.y))];
  const cs=getComputedStyle(el);
  return {found:true, distinctLineYs:ys, brokenMidWord: ys.length>1,
    breakAt: ys.length>1 ? lines.find(l=>l.y===ys[1]).ch : null,
    wordBreak:cs.wordBreak, lineBreak:cs.lineBreak, overflowWrap:cs.overflowWrap,
    lang:document.documentElement.lang};
});
console.log(JSON.stringify(r));
await b.close();
