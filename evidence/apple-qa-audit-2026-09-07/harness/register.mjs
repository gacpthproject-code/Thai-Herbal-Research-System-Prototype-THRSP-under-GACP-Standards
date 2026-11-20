import { chromium } from './lib.mjs';
import fs from 'node:fs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const ID=process.env.QA_ID, PW=process.env.QA_PW;
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage();
p.setDefaultTimeout(12000);
const notes=[];
const shot=async n=>{await p.waitForTimeout(600);await p.screenshot({path:`${OUT}/reg-${n}.png`,fullPage:true});};
const dump=async label=>{
  const d=await p.evaluate(()=>({
    heading:[...document.querySelectorAll('h1,h2')].map(x=>x.textContent.trim()).slice(0,2).join(' / '),
    inputs:[...document.querySelectorAll('input,select,textarea')].map(i=>`${i.id||i.name||'-'}(${i.type||i.tagName})`).join(' '),
    buttons:[...document.querySelectorAll('button')].map(x=>x.textContent.trim().slice(0,22)).join(' / '),
    alerts:[...document.querySelectorAll('[role=alert],.text-red-600,.text-destructive,[data-error]')].map(x=>x.textContent.trim().slice(0,90)).filter(Boolean).slice(0,4),
  }));
  console.log(`[${label}] ${d.heading}\n   inputs: ${d.inputs}\n   buttons: ${d.buttons}\n   alerts: ${JSON.stringify(d.alerts)}`);
  return d;
};
try{
  await p.goto(B+'/register',{waitUntil:'networkidle',timeout:40000});
  await p.waitForTimeout(700);

  // --- EDGE-CASE PROBE ก่อนกรอกจริง: กด "ถัดไป" ทั้งที่ยังว่าง
  await p.locator('button:has-text("ถัดไป")').click();
  await p.waitForTimeout(700);
  await shot('01-empty-submit');
  await dump('empty submit');

  // --- EDGE: เลขบัตรผิด checksum
  await p.locator('#reg-identifier').fill('1111111111111');
  await p.locator('#reg-firstName').fill('ก');
  await p.locator('#reg-lastName').fill('ข');
  await p.locator('button:has-text("ถัดไป")').click();
  await p.waitForTimeout(800);
  await shot('02-bad-checksum');
  await dump('bad checksum');

  // --- EDGE: สตริงยาวมาก + unicode + emoji ในช่องชื่อ
  await p.locator('#reg-firstName').fill('あ🌿'+'ก'.repeat(300));
  await p.waitForTimeout(400);
  const overflow=await p.evaluate(()=>({scrollW:document.documentElement.scrollWidth,clientW:document.documentElement.clientWidth}));
  console.log('[long-string] overflow', JSON.stringify(overflow));
  await shot('03-long-unicode');

  // --- ของจริง
  await p.locator('#reg-identifier').fill(ID);
  await p.locator('#reg-firstName').fill('ทดสอบคุณภาพ');
  await p.locator('#reg-lastName').fill('ระบบจีเอซีพี');
  await shot('04-step1-filled');
  await p.locator('button:has-text("ถัดไป")').click();
  await p.waitForTimeout(1000);
  await shot('05-step2');
  const s2=await dump('step 2');

  fs.writeFileSync(`${OUT}/../reg-state.json`, JSON.stringify({step2:s2},null,2));
}catch(e){ console.log('ERR', String(e.message).split('\n')[0].slice(0,200)); await shot('ERR'); }
await b.close();
