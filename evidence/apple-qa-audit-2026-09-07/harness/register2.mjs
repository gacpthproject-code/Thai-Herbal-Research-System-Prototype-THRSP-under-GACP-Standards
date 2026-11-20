import { chromium } from './lib.mjs';
import fs from 'node:fs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const ID=process.env.QA_ID, PW=process.env.QA_PW;
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'});
const p=await ctx.newPage(); p.setDefaultTimeout(15000);
const shot=async n=>{await p.waitForTimeout(600);await p.screenshot({path:`${OUT}/reg-${n}.png`,fullPage:true});};
const dump=async l=>{const d=await p.evaluate(()=>({h:[...document.querySelectorAll('h1,h2')].map(x=>x.textContent.trim()).slice(-1)[0],
  i:[...document.querySelectorAll('input,select')].map(x=>`${x.id||x.name}(${x.type})`).join(' '),
  b:[...document.querySelectorAll('button')].map(x=>x.textContent.trim().slice(0,26)).join(' / '),
  a:[...document.querySelectorAll('[role=alert],.text-red-600,.text-destructive')].map(x=>x.textContent.trim().slice(0,100)).filter(Boolean).slice(0,5)}));
  console.log(`[${l}] ${d.h}\n   in: ${d.i}\n   btn: ${d.b}\n   alert: ${JSON.stringify(d.a)}`); return d;};
try{
  await p.goto(B+'/register',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(700);
  await p.locator('#reg-identifier').fill(ID);
  await p.locator('#reg-firstName').fill('ทดสอบคุณภาพ');
  await p.locator('#reg-lastName').fill('ระบบจีเอซีพี');
  await p.locator('button:has-text("ถัดไป")').click(); await p.waitForTimeout(900);

  // ขั้น 2 — ช่องทางติดต่อ · ลองอีเมลผิดรูปแบบก่อน
  await p.locator('#reg-email').fill('not-an-email');
  await p.locator('#reg-phone').fill('123');
  await p.locator('button:has-text("ถัดไป")').click(); await p.waitForTimeout(800);
  await shot('06-step2-invalid'); await dump('step2 invalid');

  await p.locator('#reg-email').fill('qa.audit+'+Date.now()+'@example.com');
  await p.locator('#reg-phone').fill('0812345678');
  await p.locator('button:has-text("ถัดไป")').click(); await p.waitForTimeout(1100);
  await shot('07-step3'); const s3=await dump('step 3');

  // ขั้น 3 — รหัสผ่าน · ลองรหัสอ่อนก่อน
  const pwIds=(s3.i.match(/[\w-]+\(password\)/g)||[]).map(x=>x.replace(/\(password\)/,''));
  console.log('password fields:', pwIds.join(','));
  if(pwIds[0]) await p.locator('#'+pwIds[0]).fill('123');
  if(pwIds[1]) await p.locator('#'+pwIds[1]).fill('123');
  await p.locator('button:has-text("ถัดไป"), button:has-text("สมัคร")').first().click().catch(()=>{});
  await p.waitForTimeout(800); await shot('08-weak-pw'); await dump('weak password');

  if(pwIds[0]) await p.locator('#'+pwIds[0]).fill(PW);
  if(pwIds[1]) await p.locator('#'+pwIds[1]).fill(PW);
  await shot('09-step3-filled');
  await p.locator('button:has-text("ถัดไป"), button:has-text("สมัคร")').first().click().catch(()=>{});
  await p.waitForTimeout(1200); await shot('10-step4'); const s4=await dump('step 4');

  // ยืนยัน (ติ๊ก consent ถ้ามี แล้วส่ง)
  for(const cb of await p.locator('input[type=checkbox]').all()){ await cb.check().catch(()=>{}); }
  await shot('11-step4-consent');
  const submit=p.locator('button:has-text("สมัครสมาชิก"), button:has-text("ยืนยัน"), button:has-text("ถัดไป")').last();
  console.log('submit label:', (await submit.textContent().catch(()=>'?'))?.trim());
  await submit.click().catch(e=>console.log('click err',e.message.slice(0,80)));
  await p.waitForTimeout(3500); await shot('12-after-submit');
  console.log('URL after submit:', p.url());
  await dump('after submit');
}catch(e){ console.log('ERR', String(e.message).split('\n')[0].slice(0,200)); await shot('ERR2'); }
await b.close();
