const fs=require('fs'),path=require('path');
const SRC=path.resolve(process.argv[2]);
const ROOTS=['app/provider','app/admin','components/admin','components/feature/notification-preferences.tsx','lib/i18n/dictionaries/sections/th-provider.ts'];
const EXCLUDED=[/\/__tests__\//,/^app\/provider\/accounting\//,/^app\/provider\/analytics\/page\.tsx$/];
const J=new RegExp(process.argv[3]);const THAI=/[฀-๿]/;
function filesUnder(rel){const abs=path.join(SRC,rel);if(!fs.existsSync(abs))return[];if(fs.statSync(abs).isFile())return[rel];return fs.readdirSync(abs).flatMap(n=>filesUnder(path.join(rel,n)));}
function strip(s){return s.replace(/\{\/\*[\s\S]*?\*\/\}/g,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`\\])\/\/.*$/gm,'$1');}
function copy(s){const c=strip(s);const l=c.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)||[];const j=Array.from(c.matchAll(/>([^<>{}]+)</g),m=>m[1]);return[...l,...j];}
const files=ROOTS.flatMap(filesUnder).filter(r=>/\.(ts|tsx)$/.test(r)).filter(r=>!EXCLUDED.some(p=>p.test(r.split(path.sep).join('/'))));
let n=0;for(const rel of files){const src=fs.readFileSync(path.join(SRC,rel),'utf8');const dict=rel.endsWith('th-provider.ts');for(const t of copy(src)){if(!J.test(t))continue;if(!dict&&!THAI.test(t))continue;n++;console.log(rel+': '+t.trim().slice(0,100));}}
console.log('total',n);
