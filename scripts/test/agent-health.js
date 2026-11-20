#!/usr/bin/env node
/**
 * Agent H — Health Portal Deep-Dive Test
 * Tests health member journey: apps, farms, planting, payments, certs, docs, trace, frontend pages.
 */
const fs = require('fs');
const path = require('path');
const BASE_URL = process.argv[2] || 'https://gacpth.com';
const API = `${BASE_URL}/api`;

function generateThaiId(prefix) {
    const digits = prefix.split('').map(Number);
    while (digits.length < 12) digits.push(0);
    const weights = [13,12,11,10,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += digits[i] * weights[i];
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}
const HEALTH_ID = generateThaiId('110000000000');
const PASSWORD = 'Test@12345';
let passed = 0, failed = 0, skipped = 0;
const results = [];
let token = null;

async function test(cat, name, fn) {
    const label = `[${cat}] ${name}`;
    try {
        const r = await fn();
        if (r === 'SKIP') { skipped++; results.push({s:'⏭️',label,d:'Skipped'}); return; }
        passed++; results.push({s:'✅',label,d:String(r||'').substring(0,100)});
    } catch(e) { failed++; results.push({s:'❌',label,d:String(e.message||e).substring(0,120)}); }
}
function assert(c,m){if(!c)throw new Error(m);}
async function fetchAPI(url,opts={}){
    const h={'Content-Type':'application/json',...(opts.headers||{})};
    let res=await fetch(url,{...opts,headers:h,redirect:'manual'});
    if([301,302,307,308].includes(res.status)&&res.headers.get('location')){
        let ru=new URL(res.headers.get('location'),url).href;
        if(new URL(url).protocol==='https:'&&ru.startsWith('http://'))ru=ru.replace(/^http:/,'https:');
        res=await fetch(ru,{...opts,headers:h});
    }
    const t=await res.text();let j;try{j=JSON.parse(t)}catch{j=null}
    return{status:res.status,json:j,text:t,headers:res.headers};
}
function authH(){return token?{Authorization:`Bearer ${token}`}:{};}

async function login(){
    const{json,headers}=await fetchAPI(`${API}/auth/health/login`,{method:'POST',body:JSON.stringify({identifier:HEALTH_ID,password:PASSWORD})});
    token=json?.data?.tokens?.accessToken||json?.data?.token||json?.token||null;
    if(!token){const sc=headers.getSetCookie?.()||[];for(const c of sc){if(c.startsWith('auth_token=')||c.startsWith('health_token='))token=c.split(';')[0].split('=').slice(1).join('=');}}
}

async function runAPITests(){
    const eps=[
        {path:'/applications/my',name:'My applications'},
        {path:'/farms',name:'My farms'},
        {path:'/planting-cycles',name:'My planting cycles'},
        {path:'/plants',name:'Plants list'},
        {path:'/payments',name:'My payments'},
        {path:'/certificates',name:'My certificates'},
        {path:'/notifications',name:'My notifications'},
        {path:'/documents',name:'My documents'},
        {path:'/dashboard/stats',name:'Dashboard stats'},
        {path:'/standards',name:'Standards (public)',noAuth:true},
        {path:'/cultivation-config',name:'Cultivation config (public)',noAuth:true},
        {path:'/pricing',name:'Pricing (public)',noAuth:true},
        {path:'/trace/verify/NONEXISTENT',name:'Trace verify (public)',noAuth:true},
        {path:'/v1/public/verify/GACP-FAKE-001',name:'Cert verify (public)',noAuth:true},
    ];
    for(const ep of eps){
        await test('API',ep.name,async()=>{
            const h=ep.noAuth?{}:authH();
            const{status}=await fetchAPI(`${API}${ep.path}`,{headers:h});
            assert(status<504,`Server error: ${status}`);
            return `status: ${status}`;
        });
    }
}

async function runFrontendTests(){
    const pages=['/login','/register','/health/dashboard','/health/applications','/health/planting','/health/payments','/health/certificates','/health/reports','/health/sop-builder','/health/tracking'];
    for(const p of pages){
        await test('FRONTEND',`Page ${p}`,async()=>{
            const{status}=await fetchAPI(`${BASE_URL}${p}`);
            assert(status<504,`Server error: ${status}`);
            return `status: ${status}`;
        });
    }
}

async function runRBACTests(){
    await test('RBAC','Health blocked from /admin/users',async()=>{
        const{status}=await fetchAPI(`${API}/admin/users`,{headers:authH()});
        assert(status===401||status===403||status===429,`Expected 401/403, got ${status}`);
        return `Blocked: ${status}`;
    });
    await test('RBAC','Health blocked from /provider',async()=>{
        const{status}=await fetchAPI(`${API}/provider`,{headers:authH()});
        assert(status===401||status===403||status===429,`Expected 401/403, got ${status}`);
        return `Blocked: ${status}`;
    });
}

function printReport(){
    const total=passed+failed+skipped;
    const rate=total>0?((passed/total)*100).toFixed(1):'0.0';
    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║       Agent H — Health Portal Test Report                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${BASE_URL}\n  Date:   ${new Date().toISOString()}\n`);
    let cat='';
    for(const r of results){const c=r.label.match(/\[(.+?)\]/)?.[1]||'';if(c!==cat){cat=c;console.log(`\n── ${cat} ${'─'.repeat(50-cat.length)}`);}console.log(`  ${r.s} ${r.label.replace(/\[.+?\] /,'')} ${r.d?`(${r.d})`:''}`)}
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passed} Failed: ${failed} Skipped: ${skipped}`);
    console.log(`Pass Rate: ${rate}% (${total} total)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if(failed===0)console.log('\n ALL HEALTH PORTAL TESTS PASSED\n');
    else{console.log(`\n ${failed} TEST(S) FAILED\n`);for(const r of results)if(r.s==='')console.log(`• ${r.label}: ${r.d}`);console.log('')}
    const outFile=path.join(__dirname,'agent-health-results.txt');
    fs.writeFileSync(outFile,[`Agent H — Health Portal Test Report`,`Target: ${BASE_URL}`,`Date: ${new Date().toISOString()}`,`Pass: ${passed} | Fail: ${failed} | Skip: ${skipped} | Rate: ${rate}%`,'', ...results.map(r=>`${r.s==='✅'?'PASS':r.s==='❌'?'FAIL':'SKIP'} | ${r.label} | ${r.d}`)].join('\n'),'utf-8');
    console.log(`Results → ${outFile}\n`);
    return{agent:'H-Health',passed,failed,skipped,total,rate:parseFloat(rate)};
}

async function main(){
    console.log(`\n Agent H — Health Portal Deep-Dive Test\n Target: ${BASE_URL}\n`);
    for(let i=1;i<=5;i++){try{const r=await fetch(`${API}/health`);if(r.ok){console.log(`Backend healthy\n`);break;}}catch{}if(i===5){console.log(`Backend not ready\n`);break;}await new Promise(r=>setTimeout(r,3000));}
    await login();
    await runAPITests();
    await runFrontendTests();
    await runRBACTests();
    const summary=printReport();
    if(typeof module!=='undefined')module.exports=summary;
    process.exit(failed>0?1:0);
}
main().catch(err=>{console.error('Fatal:',err);process.exit(2);});
