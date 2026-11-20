'use strict';

/**
 * คำสั่ง 118(3): scripts/ops/run-closing-jobs.sh รันงานปิดคำขอตามเวลาจริงทันทีหนึ่งรอบ บน staging เท่านั้น
 * ผูกกับเครื่องตาม closing-jobs-hosts.tsv และบันทึกทุกครั้งลงไฟล์ 0600 (ชื่อกับจำนวนเท่านั้น)
 * รันสคริปต์จริงด้วย bash บน PATH ที่มี docker/hostname ปลอม ไม่แตะ staging หรือ demo
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const OPS = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'ops');
const SCRIPT = 'run-closing-jobs.sh';
const TABLE = 'closing-jobs-hosts.tsv';
const HOST = 'VM-0-3-ubuntu';
const STATE_DIR = '/home/ubuntu/work/state/ops/closing-jobs';
const ENTRY = 'exec -w /app/apps/backend gacp-backend-staging node scripts/ops/run-closing-jobs.js';
const SUMMARY = 'closing-jobs revisionDeadlineChecker:processed=2,expired=1,errors=0 correctionDeadlineSweep:checked=3,skipped=0 paymentClosureSweep:scanned=4,closed=1';

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$SHIM_LOG"
case "$1" in
  ps) [ "\${FAKE_CONTAINER_RUNNING:-1}" = 1 ] && echo abc123; exit 0;;
  exec)
    case "$*" in
      *GACP_DEPLOY_SLOT*) exit "\${FAKE_SLOT_OK:-0}";;
      *"test -f"*) exit "\${FAKE_SCRIPT_IN_IMAGE:-0}";;
      *"node scripts/ops/run-closing-jobs.js"*)
        echo "[payment-closure] Auto-closed: APP-SECRET-0001 (M1 due 2026-09-01) -> EXPIRED"
        printf '%s\\n' "$FAKE_SUMMARY"
        exit "\${FAKE_NODE_EXIT:-0}";;
    esac; exit 0;;
esac
exit 0
`;

function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'closing-jobs-shims-'));
    const bin = path.join(root, 'bin');
    const ops = path.join(root, 'ops');
    const state = path.join(root, 'state');
    [bin, ops].forEach((dir) => fs.mkdirSync(dir));
    const script = fs.readFileSync(path.join(OPS, SCRIPT), 'utf8');
    expect(script.split(STATE_DIR).length - 1).toBe(1);
    fs.writeFileSync(path.join(ops, SCRIPT), script.replace(STATE_DIR, state));
    fs.copyFileSync(path.join(OPS, TABLE), path.join(ops, TABLE));
    fs.writeFileSync(path.join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'hostname'), '#!/usr/bin/env bash\necho "${FAKE_HOSTNAME}"\n', { mode: 0o755 });
    return { root, bin, ops, state, log: path.join(root, 'shim.log'), runs: path.join(state, 'runs.log') };
}

function run(env, args, extra = {}) {
    const result = spawnSync('bash', [path.join(env.ops, SCRIPT), ...args], {
        encoding: 'utf8',
        env: { PATH: `${env.bin}:/usr/bin:/bin`, HOME: env.root, SHIM_LOG: env.log, FAKE_HOSTNAME: HOST, FAKE_SUMMARY: SUMMARY, ...extra },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const dockerCalls = (env) => (fs.existsSync(env.log) ? fs.readFileSync(env.log, 'utf8').split('\n').filter(Boolean) : []);
const logRows = (env) => fs.readFileSync(env.runs, 'utf8').trim().split('\n').map((line) => line.split('\t'));
const outcomes = (env) => logRows(env).filter((row) => row[3] !== 'start').map((row) => row.slice(2));

test('the host table names staging alone, on this host, in gacp-backend-staging that declares GACP_DEPLOY_SLOT=staging', () => {
    const rows = fs.readFileSync(path.join(OPS, TABLE), 'utf8').split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t'));
    expect(rows).toEqual([['staging', HOST, 'gacp-backend-staging', 'staging']]);
});

test('demo, an unknown slot, no slot, and a foreign host are refused before docker, each logged as refused in a 0600 file', () => {
    const env = setup();
    const demo = run(env, ['demo']);
    expect(demo.status).toBe(2);
    expect(demo.stderr).toMatch(/รันได้เฉพาะ staging/);
    expect(run(env, ['nowhere']).status).toBe(2);
    expect(run(env, []).status).toBe(2);
    expect(run(env, ['staging', 'extra']).status).toBe(2);
    const foreign = run(env, ['staging'], { FAKE_HOSTNAME: 'demo-box' });
    expect(foreign.status).toBe(2);
    expect(foreign.stderr).toMatch(/รันได้เฉพาะบนเครื่อง VM-0-3-ubuntu/);
    expect(dockerCalls(env)).toEqual([]);
    expect(outcomes(env)).toEqual([
        ['?', 'refused', 'exit=2 unknown slot'],
        ['?', 'refused', 'exit=2 unknown slot'],
        ['?', 'refused', 'exit=2 unknown slot'],
        ['staging', 'refused', 'exit=2 bad usage'],
        ['staging', 'refused', 'exit=2 wrong host'],
    ]);
    expect(fs.statSync(env.runs).mode & 0o777).toBe(0o600);
});

test('a stopped container, a container outside the staging slot, or an image without the entry is refused before the jobs run', () => {
    const env = setup();
    expect(run(env, ['staging'], { FAKE_CONTAINER_RUNNING: '0' }).status).toBe(2);
    const slot = run(env, ['staging'], { FAKE_SLOT_OK: '1' });
    expect(slot.status).toBe(2);
    expect(slot.stderr).toMatch(/GACP_DEPLOY_SLOT=staging/);
    const image = run(env, ['staging'], { FAKE_SCRIPT_IN_IMAGE: '1' });
    expect(image.status).toBe(2);
    expect(image.stderr).toMatch(/scripts\/ops\/run-closing-jobs\.js/);
    expect(dockerCalls(env).filter((call) => /node scripts\/ops/.test(call))).toEqual([]);
    expect(outcomes(env).map((row) => row[2])).toEqual(['exit=2 container not running', 'exit=2 slot env mismatch', 'exit=2 script not in image']);
});

test('on staging it checks the slot, then runs the entry inside the image once with no arguments, and logs the job names and counts only', () => {
    const env = setup();
    const result = run(env, ['staging']);
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout).toContain(SUMMARY);
    const calls = dockerCalls(env);
    const slotCheck = calls.findIndex((call) => /^exec gacp-backend-staging node -e .*GACP_DEPLOY_SLOT==='staging'/.test(call));
    expect(slotCheck).toBeGreaterThan(-1);
    expect(calls.filter((call) => call.includes('run-closing-jobs.js') && call.startsWith('exec -w'))).toEqual([ENTRY]);
    expect(calls.indexOf(ENTRY)).toBeGreaterThan(slotCheck);
    expect(calls.filter((call) => /^(cp|run|compose) /.test(call))).toEqual([]);
    expect(logRows(env).map((row) => row.slice(1))).toEqual([
        [HOST, 'staging', 'start', '-'],
        [HOST, 'staging', 'done', `exit=0 ${SUMMARY.slice('closing-jobs '.length)}`],
    ]);
    expect(fs.readFileSync(env.runs, 'utf8')).not.toContain('APP-SECRET');
});

test('a failed job run is logged as failed with the counts it printed', () => {
    const env = setup();
    const failedSummary = 'closing-jobs revisionDeadlineChecker:processed=0,expired=0,errors=0 correctionDeadlineSweep:failed paymentClosureSweep:scanned=0,closed=0';
    const result = run(env, ['staging'], { FAKE_NODE_EXIT: '1', FAKE_SUMMARY: failedSummary });
    expect(result.status).toBe(1);
    expect(outcomes(env)).toEqual([['staging', 'failed', `exit=1 ${failedSummary.slice('closing-jobs '.length)}`]]);
});

test('a summary line that is not names and counts never reaches the log', () => {
    const env = setup();
    const forged = [
        'closing-jobs paymentClosureSweep:closed=1\tdone',
        'closing-jobs paymentClosureSweep:APP-SECRET-0001',
        'closing-jobs paymentClosureSweep:closed=1 สมชาย',
    ];
    forged.forEach((line) => expect(run(env, ['staging'], { FAKE_SUMMARY: line }).status).toBe(0));
    expect(outcomes(env)).toEqual(forged.map(() => ['staging', 'done', 'exit=0']));
    expect(fs.readFileSync(env.runs, 'utf8')).not.toMatch(/SECRET|สมชาย/);
    expect(logRows(env).every((row) => row.length === 5)).toBe(true);
});

test('a state directory it cannot write stops the run before docker', () => {
    const env = setup();
    fs.writeFileSync(env.state, 'not a directory\n');
    const result = run(env, ['staging']);
    expect({ status: result.status, calls: dockerCalls(env) }).toEqual({ status: 1, calls: [] });
    expect(result.stderr).toContain('runs.log');
});
