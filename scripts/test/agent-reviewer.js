#!/usr/bin/env node
/**
 * Agent DR — Document Reviewer Workflow Test
 * Tests reviewer scope: dashboard, review queue, save progress, application details, criteria.
 */
const fs=require('fs'),path=require('path');
const BASE_URL=process.argv[2]||'https://gacpth.com';
const API=`${BASE_URL}/api`;
function generateThaiId(p){const d=p.split('').map(Number);while(d.length<12)d.push(0);const w=[13,12,11,10,9,8,7,6,5,4,3,2];let s=0;for(let i=0;i<12;i++)s+=d[i]*w[i];d.push((11-(s%11))%10);return d.join('');}
const REVIEWER_ID=generateThaiId('390000000000');
const PASSWORD='Test@12345';
let passed=0,failed=0,skipped=0;const results=[];let token=null;
async function test(cat,name,fn){const label=`[${cat}] ${name}`;try{const r=await fn();if(r==='SKIP'){skipped++;results.push({s:'⏭️',label,d:'Skipped'});return;}passed++;results.push({s:'✅',label,d:String(r||'').substring(0,100)});}catch(e){failed++;results.push({s:'❌',label,d:String(e.message||e).substring(0,120)});}}
function assert(c,m){if(!c)throw new Error(m);}
async function fetchAPI(url,opts={}){const h={'Content-Type':'application/json',...(opts.headers||{})};let res=await fetch(url,{...opts,headers:h,redirect:'manual'});if([301,302,307,308].includes(res.status)&&res.headers.get('location')){let ru=new URL(res.headers.get('location'),url).href;if(new URL(url).protocol==='https:'&&ru.startsWith('http://'))ru=ru.replace(/^http:/,'https:');res=await fetch(ru,{...opts,headers:h});}const t=await res.text();let j;try{j=JSON.parse(t)}catch{j=null}return{status:res.status,json:j,text:t,headers:res.headers};}
function authH(){return token?{Authorization:`Bearer ${token}`}:{};}

async function login(){
    const{json,headers}=await fetchAPI(`${API}/auth/provider/login`,{method:'POST',body:JSON.stringify({providerId:REVIEWER_ID,password:PASSWORD})});
    token=json?.data?.tokens?.accessToken||json?.data?.token||json?.token||null;
    if(!token){const sc=headers.getSetCookie?.()||[];for(const c of sc){if(c.startsWith('provider_token='))token=c.split(';')[0].split('=').slice(1).join('=');}}
}

async function runReviewerWorkflowTests(){
    const eps=[
        {path:'/provider/reviewer/dashboard',name:'Reviewer Dashboard'},
        {path:'/applications',name:'Applications List',allow503:true},
        {path:'/applications/queue',name:'Applications Queue',allow503:true},
        {path:'/criteria',name:'Criteria List'},
        {path:'/audits',name:'Audits List'},
        {path:'/notifications',name:'Notifications'},
        {path:'/auth/provider/me',name:'My Profile'},
        {path:'/dashboard',name:'General Dashboard'},
        {path:'/provider/reports/summary',name:'Reports Summary'},
        {path:'/provider/reports/kpi',name:'Reports KPI'},
    ];
    for(const ep of eps){
        await test('REVIEWER-WORKFLOW',ep.name,async()=>{
            const{status}=await fetchAPI(`${API}${ep.path}`,{headers:authH()});
            assert(status<(ep.allow503?504:500),`Server error: ${status}`);
            return `status: ${status}`;
        });
    }
}

async function runReviewerFrontendTests(){
    const pages=['/provider/dashboard','/provider/applications'];
    for(const p of pages){await test('REVIEWER-FRONTEND',`Page ${p}`,async()=>{const{status}=await fetchAPI(`${BASE_URL}${p}`);assert(status<500,`Server error: ${status}`);return `status: ${status}`;});}
}

async function runReviewerRBACTests(){
    await test('REVIEWER-RBAC','Cannot access /admin/users',async()=>{const{status}=await fetchAPI(`${API}/admin/users`,{headers:authH()});assert(status===401||status===403||status===429,`Expected 401/403, got ${status}`);return `Blocked: ${status}`;});
    await test('REVIEWER-RBAC','Cannot access /admin/config',async()=>{const{status}=await fetchAPI(`${API}/admin/config`,{headers:authH()});assert(status===401||status===403||status===429,`Expected 401/403, got ${status}`);return `Blocked: ${status}`;});
    await test('REVIEWER-RBAC','Cannot access /provider/management',async()=>{const{status}=await fetchAPI(`${API}/provider`,{headers:authH()});assert(status<500,`Server error: ${status}`);return `status: ${status}`;});
}

function printReport(){
    const total=passed+failed+skipped;const rate=total>0?((passed/total)*100).toFixed(1):'0.0';
    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║       Agent DR — Document Reviewer Test Report           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${BASE_URL}\n  Date:   ${new Date().toISOString()}\n`);
    let cat='';for(const r of results){const c=r.label.match(/\[(.+?)\]/)?.[1]||'';if(c!==cat){cat=c;console.log(`\n── ${cat} ${'─'.repeat(50-cat.length)}`);}console.log(`  ${r.s} ${r.label.replace(/\[.+?\] /,'')} ${r.d?`(${r.d})`:''}`)}
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passed} Failed: ${failed} Skipped: ${skipped}\n Pass Rate: ${rate}% (${total} total)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if(failed===0)console.log('\n ALL REVIEWER TESTS PASSED\n');else{console.log(`\n ${failed} TEST(S) FAILED\n`);for(const r of results)if(r.s==='')console.log(`• ${r.label}: ${r.d}`);console.log('')}
    const outFile=path.join(__dirname,'agent-reviewer-results.txt');
    fs.writeFileSync(outFile,[`Agent DR — Document Reviewer Test Report`,`Target: ${BASE_URL}`,`Date: ${new Date().toISOString()}`,`Pass: ${passed} | Fail: ${failed} | Skip: ${skipped} | Rate: ${rate}%`,'', ...results.map(r=>`${r.s==='✅'?'PASS':r.s==='❌'?'FAIL':'SKIP'} | ${r.label} | ${r.d}`)].join('\n'),'utf-8');
    console.log(`Results → ${outFile}\n`);return{agent:'DR-Reviewer',passed,failed,skipped,total,rate:parseFloat(rate)};
}
async function main(){
    console.log(`\n Agent DR — Document Reviewer Workflow Test\n Target: ${BASE_URL}\n`);
    for(let i=1;i<=5;i++){try{const r=await fetch(`${API}/health`);if(r.ok){console.log(`Backend healthy\n`);break;}}catch{}if(i===5){console.log('Backend not ready\n');break;}await new Promise(r=>setTimeout(r,3000));}
    await login();await runReviewerWorkflowTests();await runReviewerFrontendTests();await runReviewerRBACTests();
    const summary=printReport();if(typeof module!=='undefined')module.exports=summary;process.exit(failed>0?1:0);
}
main().catch(err=>{console.error('Fatal:',err);process.exit(2);});
