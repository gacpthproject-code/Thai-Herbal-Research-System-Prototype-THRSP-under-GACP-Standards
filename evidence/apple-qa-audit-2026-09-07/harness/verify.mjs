import { chromium } from './lib.mjs';
const B='https://demo.gacpth.com', OUT=process.argv[2];
const b=await chromium.launch();

// ---- A) หัวเรื่องไทยสองบรรทัดบนหน้า login: ink band ทับกันจริงไหม ----
{
  const p=await (await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'})).newPage();
  await p.goto(B+'/login',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1500);
  const r=await p.evaluate(()=>{
    const h=document.querySelector('h1'); if(!h) return null;
    const cs=getComputedStyle(h);
    const tn=[...h.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
    if(!tn) return {note:'no text node', fs:cs.fontSize, lh:cs.lineHeight, ls:cs.letterSpacing};
    const t=tn.textContent, rng=document.createRange();
    const rows={};
    for(let i=0;i<t.length;i++){
      if(!t[i].trim()) continue;
      rng.setStart(tn,i); rng.setEnd(tn,i+1);
      const c=rng.getBoundingClientRect();
      const key=Math.round(c.top/10)*10;
      rows[key]=rows[key]||{top:1e9,bottom:-1e9,chars:''};
      rows[key].top=Math.min(rows[key].top,c.top); rows[key].bottom=Math.max(rows[key].bottom,c.bottom);
      rows[key].chars+=t[i];
    }
    const lines=Object.values(rows).sort((a,b)=>a.top-b.top).map(l=>({top:Math.round(l.top),bottom:Math.round(l.bottom),h:Math.round(l.bottom-l.top),s:l.chars.slice(0,14)}));
    let overlapPx=null;
    if(lines.length>1) overlapPx=Math.round(lines[0].bottom-lines[1].top);
    return {fontSize:cs.fontSize, lineHeight:cs.lineHeight, letterSpacing:cs.letterSpacing, lines, overlapPx};
  });
  console.log('A) /login h1:', JSON.stringify(r));
}

// ---- B) ราคาบนหน้า /pricing ใช้ฟอนต์อะไรจริง ----
{
  const p=await (await b.newContext({viewport:{width:1440,height:900},locale:'th-TH'})).newPage();
  await p.goto(B+'/pricing',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1500);
  const r=await p.evaluate(()=>{
    const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && /บาท/.test(e.textContent) && /\d/.test(e.textContent));
    return els.slice(0,4).map(e=>({txt:e.textContent.trim().slice(0,26), font:getComputedStyle(e).fontFamily.slice(0,52), variant:getComputedStyle(e).fontVariantNumeric}));
  });
  console.log('B) /pricing money elements:'); r.forEach(x=>console.log('   ',JSON.stringify(x)));
}

// ---- C) หน้าสแกน QR: การ์ดทับหัวเรื่องกี่พิกเซล ----
{
  const p=await (await b.newContext({viewport:{width:390,height:844},locale:'th-TH',isMobile:true})).newPage();
  await p.goto(B+'/trace/960853e6-7c3d-461d-a62a-1fb96e687a2d',{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(3000);
  const r=await p.evaluate(()=>{
    const h=[...document.querySelectorAll('h1,h2')].find(e=>/ผ่านการรับรอง|รับรองมาตรฐาน/.test(e.textContent));
    if(!h) return {note:'headline not found'};
    const hr=h.getBoundingClientRect();
    const card=[...document.querySelectorAll('div')].find(d=>{const r=d.getBoundingClientRect();return r.top>hr.top&&r.top<hr.bottom+80&&r.width>200&&getComputedStyle(d).backgroundColor==='rgb(255, 255, 255)'});
    const cr=card?card.getBoundingClientRect():null;
    const hero=h.closest('[class*="h-\\["]')||h.parentElement.parentElement;
    const hs=getComputedStyle(hero);
    return {headline:h.textContent.trim().slice(0,40), headlineBottom:Math.round(hr.bottom),
      cardTop:cr?Math.round(cr.top):null, coveredPx:cr?Math.round(hr.bottom-cr.top):null,
      heroOverflow:hs.overflow, heroHeight:hs.height};
  });
  console.log('C) QR hero vs card:', JSON.stringify(r));
}

// ---- D) touch target < 44px บนมือถือ ----
{
  const ctx=await b.newContext({storageState:process.env.AUTH_STATE, viewport:{width:390,height:844},locale:'th-TH',isMobile:true});
  const p=await ctx.newPage();
  await p.goto(B+'/health/applications',{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1800);
  const r=await p.evaluate(()=>{
    const small=[];
    for(const el of document.querySelectorAll('button,a[href],input,select,[role=button]')){
      const c=el.getBoundingClientRect();
      if(c.width===0||c.height===0) continue;
      if(c.height<44||c.width<44) small.push({t:(el.textContent||el.getAttribute('aria-label')||el.tagName).trim().slice(0,20), w:Math.round(c.width), h:Math.round(c.height)});
    }
    return {total:document.querySelectorAll('button,a[href],input,select,[role=button]').length, small:small.slice(0,10), smallCount:small.length};
  });
  console.log('D) /health/applications mobile touch targets <44px:', r.smallCount, 'of', r.total);
  r.small.forEach(x=>console.log('   ',JSON.stringify(x)));
}
await b.close();
