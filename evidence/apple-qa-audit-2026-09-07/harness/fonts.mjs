import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'})).newPage();
await p.goto(B+'/auth',{waitUntil:'networkidle',timeout:40000});
await p.waitForTimeout(2500);
const f=await p.evaluate(async()=>{
  await document.fonts.ready;
  const loaded=[...document.fonts].map(ff=>`${ff.family} ${ff.weight} ${ff.status}`);
  const h1=document.querySelector('h1');
  const cs=h1?getComputedStyle(h1):null;
  // ฟอนต์ที่ "ใช้จริง" ในการวาด h1
  const check=n=>document.fonts.check(`16px "${n}"`, 'ทดสอบ');
  return {
    faces: loaded,
    h1Stack: cs?cs.fontFamily.slice(0,90):null,
    resolves: { 'Sukhumvit Set':check('Sukhumvit Set'), 'Sarabun':check('Sarabun'), 'Anuphan':check('Anuphan'), 'Prompt':check('Prompt'), 'Noto Sans Thai':check('Noto Sans Thai') },
  };
});
console.log(JSON.stringify(f,null,1));
await b.close();
