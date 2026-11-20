'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_CONFIG = path.join(os.homedir(), 'work/state/walk/deploy-walk.config.json');

function loadConfig(targetName, file = process.env.DEPLOY_WALK_CONFIG || DEFAULT_CONFIG) {
    let st;
    try { st = fs.statSync(file); } catch { throw new Error(`ไม่มีไฟล์ตั้งค่า ${file}`); }
    if (st.mode & 0o077) { throw new Error(`ไฟล์ตั้งค่า ${file} ต้องเป็น 0600 (ตอนนี้ ${(st.mode & 0o777).toString(8)})`); }
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!all[targetName]) { throw new Error(`ไฟล์ตั้งค่าไม่มีส่วนของ ${targetName}`); }
    return all[targetName];
}

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

// null = เครื่องนี้ยังไม่มีบัญชีนี้ (ไม่ได้ตั้ง หรือไฟล์ที่ชี้ไว้ยังไม่ถูกสร้าง) · ไฟล์ตั้งค่าผิดรูปแบบอื่น = throw
function accountCredentials(cfg, role) {
    const all = cfg.accounts ?? {};
    if (typeof all !== 'object' || Array.isArray(all)) { throw new Error('accounts ในไฟล์ตั้งค่าต้องเป็น object'); }
    const a = all[role];
    if (!a) { return null; }
    const read = (f, fn) => { try { return fn(f); } catch (err) { if (err.code === 'ENOENT') { return null; } throw err; } };
    const e = a.envFile ? read(a.envFile, readEnvFile) : {};
    if (!e) { return null; }
    if (a.passwordFile) {
        e.PASSWORD = read(a.passwordFile, (f) => fs.readFileSync(f, 'utf8').trim());
        if (e.PASSWORD === null) { return null; }
    }
    if (a.providerId) { e.PROVIDER_ID = a.providerId; }
    const staff = !!e.PROVIDER_ID;
    return { role, staff, identifier: staff ? e.PROVIDER_ID : e.WALK_NID, password: staff ? e.PASSWORD : e.WALK_PW, env: e };
}

const MARK = 'WALK-RESULT:';
const BOOT = `const MARK='${MARK}';let s='';process.stdin.on('data',(d)=>{s+=d;}).on('end',()=>{const {code,input}=JSON.parse(s);`
    + `const F=Object.getPrototypeOf(async()=>{}).constructor;new F('input','require',code)(input,require)`
    + `.then((r)=>{process.stdout.write('\\n'+MARK+JSON.stringify(r)+'\\n');process.exit(0);})`
    + `.catch((e)=>{process.stderr.write(String(e&&e.message).split('\\n')[0]);process.exit(1);});});`;

const containerArgv = (cfg, docker) => (cfg.ssh
    ? ['ssh', '-o', 'BatchMode=yes', '--', cfg.ssh, ...docker.map((x) => `'${x.replace(/'/g, "'\\''")}'`)]
    : docker);

function inContainer(cfg, name, input = {}, { timeoutMs = 120000 } = {}) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'container', `${name}.js`), 'utf8');
    const [cmd, ...args] = containerArgv(cfg, ['docker', 'exec', '-i', '-w', '/app/apps/backend', cfg.backendContainer, 'node', '-e', BOOT]);
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let out = ''; let err = '';
        const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${name}: timeout ${timeoutMs}ms`)); }, timeoutMs);
        p.stdout.on('data', (d) => { out += d; });
        p.stderr.on('data', (d) => { err += d; });
        p.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) { reject(new Error(`${name}: exit ${code} ${err.slice(0, 300)}`)); return; }
            const line = out.split('\n').filter((l) => l.startsWith(MARK)).pop();
            try { resolve(JSON.parse(line.slice(MARK.length))); } catch { reject(new Error(`${name}: ไม่มีผลลัพธ์`)); }
        });
        p.stdin.end(JSON.stringify({ code, input }));
    });
}

module.exports = { DEFAULT_CONFIG, loadConfig, accountCredentials, containerArgv, inContainer };
