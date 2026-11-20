#!/usr/bin/env node
/**
 * Agent V — Provider Portal Deep-Dive Test
 * Tests provider portal endpoints and frontend pages for all roles.
 */
const fs=require('fs'),path=require('path');
const BASE_URL=process.argv[2]||'https://gacpth.com';
const API=`${BASE_URL}/api`;
function generateThaiId(p){const d=p.split('').map(Number);while(d.length<12)d.push(0);const w=[13,12,11,10,9,8,7,6,5,4,3,2];let s=0;for(let i=0;i<12;i++)s+=d[i]*w[i];d.push((11-(s%11))%10);return d.join('');}
const ACCOUNTS={ADMIN:{id:generateThaiId('290000000000'),role:'ADMIN'},REVIEWER:{id:generateThaiId('390000000000'),role:'REVIEWER'},SCHEDULER:{id:generateThaiId('490000000000'),role:'SCHEDULER'},AUDITOR:{id:generateThaiId('590000000000'),role:'AUDITOR'},ACCOUNTANT:{id:generateThaiId('690000000000'),role:'ACCOUNTANT'}};
const PASSWORD='Test@12345';
let passed=0,failed=0,skipped=0;const results=[];const tokens={};
async function test(cat,name,fn){const label=`[${cat}] ${name}`;try{const r=await fn();if(r==='SKIP'){skipped++;results.push({s:'⏭️',label,d:'Skipped'});return;}passed++;results.push({s:'✅',label,d:String(r||'').substring(0,100)});}catch(e){failed++;results.push({s:'❌',label,d:String(e.message||e).substring(0,120)});}}
function assert(c,m){if(!c)throw new Error(m);}
async function fetchAPI(url,opts={}){const h={'Content-Type':'application/json',...(opts.headers||{})};let res=await fetch(url,{...opts,headers:h,redirect:'manual'});if([301,302,307,308].includes(res.status)&&res.headers.get('location')){let ru=new URL(res.headers.get('location'),url).href;if(new URL(url).protocol==='https:'&&ru.startsWith('http://'))ru=ru.replace(/^http:/,'https:');res=await fetch(ru,{...opts,headers:h});}const t=await res.text();let j;try{j=JSON.parse(t)}catch{j=null}return{status:res.status,json:j,text:t,headers:res.headers};}
function authH(role){return tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{};}

async function loginAll(){
    for(const[rn,acc]of Object.entries(ACCOUNTS)){
        const{json,headers}=await fetchAPI(`${API}/auth/provider/login`,{method:'POST',body:JSON.stringify({providerId:acc.id,password:PASSWORD})});
        let tk=json?.data?.tokens?.accessToken||json?.data?.token||json?.token||null;
        if(!tk){const sc=headers.getSetCookie?.()||[];for(const c of sc){if(c.startsWith('provider_token='))tk=c.split(';')[0].split('=').slice(1).join('=');}}
        tokens[rn]=tk;
    }
}

async function runProviderAPITests(){
    const eps=[
        {path:'/provider/stats',name:'Provider stats'},
        {path:'/applications',name:'Applications List'},
        {path:'/applications/queue',name:'Applications Queue',allow503:true},
        {path:'/audits',name:'Audits list'},
        {path:'/audits/pending-schedule',name:'Audits pending schedule'},
        {path:'/audits/scheduled',name:'Audits scheduled'},
        {path:'/criteria',name:'Criteria list'},
        {path:'/dashboard',name:'Dashboard'},
        {path:'/notifications',name:'Notifications'},
        {path:'/provider/reviewer/dashboard',name:'Reviewer dashboard'},
        {path:'/provider/scheduler/dashboard',name:'Scheduler dashboard'},
        {path:'/provider/scheduler/auditors',name:'Scheduler auditors'},
        {path:'/provider/scheduler/reviewers',name:'Scheduler reviewers'},
        {path:'/provider/auditor/dashboard',name:'Auditor dashboard'},
        {path:'/analytics/dashboard',name:'Analytics dashboard'},
        {path:'/site-analyses',name:'Site analyses'},
        {path:'/invoices',name:'Invoices'},
        {path:'/payments',name:'Payments'},
        {path:'/accounting',name:'Accounting'},
        {path:'/config',name:'Config'},
    ];
    for(const ep of eps){
        await test('PROVIDER-API',ep.name,async()=>{
            const{status}=await fetchAPI(`${API}${ep.path}`,{headers:authH('ADMIN')});
            const maxStatus=ep.allow503?504:500;
            assert(status<maxStatus,`Server error: ${status}`);
            return `status: ${status}`;
        });
    }
}

async function runProviderFrontendTests(){
    const pages=['/provider/login','/provider/dashboard','/provider/applications','/provider/coordinator','/provider/audits','/provider/calendar','/provider/accounting','/provider/management','/provider/settings'];
    for(const p of pages){
        await test('PROVIDER-FRONTEND',`Page ${p}`,async()=>{
            const{status}=await fetchAPI(`${BASE_URL}${p}`);
            assert(status<500,`Server error: ${status}`);
            return `status: ${status}`;
        });
    }
}

async function runRoleAccessTests(){
    for(const[rn]of Object.entries(ACCOUNTS)){
        await test('ROLE-ACCESS',`${rn} /me`,async()=>{
            const{status}=await fetchAPI(`${API}/auth/provider/me`,{headers:authH(rn)});
            assert(status<500,`Server error: ${status}`);
            return `status: ${status}`;
        });
    }
}

function printReport(){
    const total=passed+failed+skipped;const rate=total>0?((passed/total)*100).toFixed(1):'0.0';
    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║       Agent V — Provider Portal Test Report              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${BASE_URL}\n  Date:   ${new Date().toISOString()}\n`);
    let cat='';for(const r of results){const c=r.label.match(/\[(.+?)\]/)?.[1]||'';if(c!==cat){cat=c;console.log(`\n── ${cat} ${'─'.repeat(50-cat.length)}`);}console.log(`  ${r.s} ${r.label.replace(/\[.+?\] /,'')} ${r.d?`(${r.d})`:''}`)}
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passed} Failed: ${failed} Skipped: ${skipped}\n Pass Rate: ${rate}% (${total} total)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if(failed===0)console.log('\n ALL PROVIDER PORTAL TESTS PASSED\n');else{console.log(`\n ${failed} TEST(S) FAILED\n`);for(const r of results)if(r.s==='')console.log(`• ${r.label}: ${r.d}`);console.log('')}
    const outFile=path.join(__dirname,'agent-provider-results.txt');
    fs.writeFileSync(outFile,[`Agent V — Provider Portal Test Report`,`Target: ${BASE_URL}`,`Date: ${new Date().toISOString()}`,`Pass: ${passed} | Fail: ${failed} | Skip: ${skipped} | Rate: ${rate}%`,'', ...results.map(r=>`${r.s==='✅'?'PASS':r.s==='❌'?'FAIL':'SKIP'} | ${r.label} | ${r.d}`)].join('\n'),'utf-8');
    console.log(`Results → ${outFile}\n`);
    return{agent:'V-Provider',passed,failed,skipped,total,rate:parseFloat(rate)};
}
async function main(){
    console.log(`\n Agent V — Provider Portal Deep-Dive Test\n Target: ${BASE_URL}\n`);
    for(let i=1;i<=5;i++){try{const r=await fetch(`${API}/health`);if(r.ok){console.log(`Backend healthy\n`);break;}}catch{}if(i===5){console.log('Backend not ready\n');break;}await new Promise(r=>setTimeout(r,3000));}
    await loginAll();await runProviderAPITests();await runProviderFrontendTests();await runRoleAccessTests();
    const summary=printReport();if(typeof module!=='undefined')module.exports=summary;process.exit(failed>0?1:0);
}
main().catch(err=>{console.error('Fatal:',err);process.exit(2);});
