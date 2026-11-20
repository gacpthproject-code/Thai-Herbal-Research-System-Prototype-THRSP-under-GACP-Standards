'use strict';

/**
 * คำสั่ง 105 ข้อ 4: สคริปต์ 2FA ใน scripts/ops ผูกกับเครื่องตาม staff-2fa-hosts.tsv รันไฟล์ในอิมเมจ (ไม่ docker cp จาก checkout)
 * รันสคริปต์จริงด้วย bash บน PATH ที่มี docker/ssh/sudo/hostname/curl ปลอม ไม่แตะ staging หรือ demo
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const OPS = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'ops');
const SHIM_ROOT = process.env.STAFF_2FA_SHIM_DIR || os.tmpdir();
const HOST = 'VM-0-3-ubuntu';
const DEMO_TARGET = 'deploy@119.59.105.140';
const LIB = path.join(OPS, 'lib', 'staff-2fa-host.sh');
const PRODUCTION_DIRS = { state: '/home/ubuntu/work/state/ops/staff-2fa', platform: '/opt/gacp-platform' };

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$SHIM_LOG"
flag() { [ -f "$SHIM_STATE/flag-on" ]; }
case "$1 $2" in
  "ps "*) [ "\${FAKE_CONTAINER_RUNNING:-1}" = 1 ] && echo abc123; exit 0;;
  "inspect "*) case "$*" in *Config.Image*) echo "ghcr.io/jonmaxmore/gacp-backend:\${FAKE_TAG:-local-abc}";; *Health*) echo healthy;; *Restart*) echo 0;; esac; exit 0;;
  "compose "*) case "$*" in *" up "*) if grep -qx 'REQUIRE_MFA_FOR_PRIVILEGED=true' .env.*; then touch "$SHIM_STATE/flag-on"; else rm -f "$SHIM_STATE/flag-on"; fi; echo "Started backend";; esac; exit 0;;
  "exec "*)
    case "$*" in
      *GACP_DEPLOY_SLOT*) exit "\${FAKE_SLOT_OK:-0}";;
      *REQUIRE_MFA_FOR_PRIVILEGED*) flag && exit 0 || exit 1;;
      *"test -f"*) exit "\${FAKE_SCRIPT_IN_IMAGE:-0}";;
      *"--event flag-off"*) exit "\${FAKE_FLAG_OFF_EXIT:-0}";;
      *"node scripts/ops/"*)
        rc=\${FAKE_NODE_EXIT:-0}
        [ "$rc" = 0 ] && echo "ตัดการเข้าสู่ระบบและ token ที่ค้างอยู่ 3 บัญชี" || echo "ไม่ตัด: จำลองการปฏิเสธ" >&2
        exit "$rc";;
    esac; exit 0;;
esac
exit 0
`;

const FAKE_SSH = `#!/usr/bin/env bash
printf 'ssh %s\\n' "$*" >> "$SHIM_LOG"
cmd="\${@: -1}"
case "$cmd" in
  "echo "*"| base64 -d | bash") decoded=$(printf '%s' "$cmd" | sed 's/^echo //; s/ | base64 -d | bash$//' | base64 -d); eval "set -- $decoded"; printf 'ssh-decoded %s\\n' "$*" >> "$SHIM_LOG"
    case "$decoded" in *Config.Image*) echo "ghcr.io/jonmaxmore/gacp-backend:\${FAKE_TAG:-local-abc}";; *"docker ps"*) echo abc123;; esac; exit 0;;
  *"bash -s") cat > "$SHIM_STATE/ssh-stdin"; [ -z "\${FAKE_SSH_EXIT:-}" ] || exit "$FAKE_SSH_EXIT"
    eval "export \${cmd% bash -s}"; sed "s#/opt/gacp-platform#$FAKE_DEMO_DIR#" "$SHIM_STATE/ssh-stdin" | bash -s; exit;;
esac
exit 0
`;

function writeShim(dir, name, body) {
    fs.writeFileSync(path.join(dir, name), body, { mode: 0o755 });
}

function copyOpsWithDirs(ops, dirs) {
    fs.mkdirSync(path.join(ops, 'lib'), { recursive: true });
    fs.readdirSync(OPS).filter((name) => /\.(sh|tsv)$/.test(name)).forEach((name) => fs.copyFileSync(path.join(OPS, name), path.join(ops, name)));
    let lib = fs.readFileSync(LIB, 'utf8');
    Object.keys(PRODUCTION_DIRS).forEach((key) => {
        expect(lib.split(PRODUCTION_DIRS[key]).length - 1).toBe(1);
        lib = lib.replace(PRODUCTION_DIRS[key], dirs[key]);
    });
    fs.writeFileSync(path.join(ops, 'lib', 'staff-2fa-host.sh'), lib);
}

function setup() {
    const root = fs.mkdtempSync(path.join(SHIM_ROOT, 's2fa-shims-'));
    const bin = path.join(root, 'bin');
    const state = path.join(root, 'state');
    const platform = path.join(root, 'platform');
    const shimState = path.join(root, 'shim-state');
    const demo = path.join(root, 'demo');
    const ops = path.join(root, 'ops');
    [bin, state, platform, shimState, demo].forEach((dir) => fs.mkdirSync(dir));
    copyOpsWithDirs(ops, { state, platform });
    writeShim(bin, 'docker', FAKE_DOCKER);
    writeShim(bin, 'ssh', FAKE_SSH);
    writeShim(bin, 'hostname', '#!/usr/bin/env bash\necho "${FAKE_HOSTNAME}"\n');
    writeShim(bin, 'sudo', '#!/usr/bin/env bash\nargs=(); while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2;; *) args+=("$1"); shift;; esac; done; exec "${args[@]}"\n');
    writeShim(bin, 'curl', '#!/usr/bin/env bash\necho 200\n');
    writeShim(bin, 'sleep', '#!/usr/bin/env bash\nexit 0\n');
    fs.writeFileSync(path.join(platform, '.env.staging'), 'DATABASE_URL=postgres://x\nREQUIRE_MFA_FOR_PRIVILEGED=false\n');
    fs.writeFileSync(path.join(platform, 'docker-compose.staging.yml'), 'services:\n  backend-staging:\n    environment:\n      - GACP_DEPLOY_SLOT=staging\n      - REQUIRE_MFA_FOR_PRIVILEGED=false\n');
    fs.writeFileSync(path.join(platform, 'docker-compose.production.yml'), 'services: {}\n');
    fs.writeFileSync(path.join(demo, '.env.demo'), 'DATABASE_URL=postgres://x\n');
    fs.writeFileSync(path.join(demo, 'docker-compose.demo.yml'), 'services:\n  backend-demo: {}\n');
    fs.writeFileSync(path.join(demo, 'docker-compose.production.yml'), 'services: {}\n');
    return { root, bin, state, platform, shimState, demo, ops, log: path.join(root, 'shim.log') };
}

function run(env, script, args = [], extra = {}) {
    const result = spawnSync('bash', [path.join(env.ops, script), ...args], {
        encoding: 'utf8',
        env: {
            PATH: `${env.bin}:/usr/bin:/bin`,
            HOME: env.root,
            SHIM_LOG: env.log,
            SHIM_STATE: env.shimState,
            FAKE_HOSTNAME: HOST,
            FAKE_DEMO_DIR: env.demo,
            ...extra,
        },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const dockerCalls = (env) => (fs.existsSync(env.log) ? fs.readFileSync(env.log, 'utf8').split('\n').filter(Boolean) : []);
const logRows = (env) => fs.readFileSync(path.join(env.state, 'runs.log'), 'utf8').trim().split('\n').map((line) => line.split('\t'));
const runLog = (env) => logRows(env).filter((row) => row[5] !== 'start');
const marker = (env, slot) => path.join(env.state, `flag-on.${slot}.done`);
const flagEvents = (env) => dockerCalls(env).map((call) => (/node scripts\/ops\/staff-sessions-revoke-at-flag-on\.js --event (\S+)/.exec(call) || [])[1]).filter(Boolean);
const FLAG_SCRIPTS = [['mfa-flag-on-staging.sh', 'staging'], ['mfa-flag-on-demo.sh', 'demo']];

describe('host table', () => {
    test('names staging on this host locally and demo over ssh to 119.59.105.140, nothing else', () => {
        const rows = fs.readFileSync(path.join(OPS, 'staff-2fa-hosts.tsv'), 'utf8').split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t'));
        expect(rows).toEqual([
            ['staging', HOST, 'local', 'gacp-backend-staging', 'staging'],
            ['demo', HOST, `ssh ${DEMO_TARGET}`, 'gacp-backend-demo', '-'],
        ]);
    });
});

describe('every wrapper is bound to its host and logs every run', () => {
    test.each(['staff-mfa-roster.sh', 'staff-first-signin-report.sh', 'staff-2fa-emergency-reset.sh'])('%s refuses an unknown slot and a foreign host before touching docker, and logs both refusals', (script) => {
        const env = setup();
        const unknown = run(env, script, ['nowhere']);
        expect(unknown.status).toBe(2);
        expect(unknown.stderr).toMatch(/ไม่รู้จัก slot 'nowhere'/);
        const foreign = run(env, script, ['staging'], { FAKE_HOSTNAME: 'laptop' });
        expect(foreign.status).toBe(2);
        expect(foreign.stderr).toMatch(/รันได้เฉพาะบนเครื่อง VM-0-3-ubuntu/);
        expect(dockerCalls(env)).toEqual([]);
        const log = runLog(env);
        expect(log.map((row) => [row[1], row[3], row[5], row[6]])).toEqual([
            [script, '?', 'refused', 'exit=2 unknown slot'],
            [script, 'staging', 'refused', 'exit=2 wrong host'],
        ]);
        expect((fs.statSync(path.join(env.state, 'runs.log')).mode & 0o777)).toBe(0o600);
    });

    test('the roster on staging runs the file inside the image after the slot check, never copies from the checkout, and logs done', () => {
        const env = setup();
        const result = run(env, 'staff-mfa-roster.sh', ['staging']);
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('gacp-backend-staging on staging runs image tag local-abc');
        const calls = dockerCalls(env);
        expect(calls.some((call) => /^exec gacp-backend-staging node -e .*GACP_DEPLOY_SLOT==='staging'/.test(call))).toBe(true);
        expect(calls).toContain('exec gacp-backend-staging test -f /app/apps/backend/scripts/ops/staff-mfa-roster.js');
        expect(calls).toContain('exec -w /app/apps/backend gacp-backend-staging node scripts/ops/staff-mfa-roster.js');
        expect(calls.filter((call) => /^cp /.test(call))).toEqual([]);
        expect(runLog(env).map((row) => [row[1], row[2], row[3], row[4], row[5], row[6]])).toEqual([['staff-mfa-roster.sh', HOST, 'staging', 'roster', 'done', 'exit=0']]);
    });

    test('a container outside its slot, or an image without the script, is refused with the reason logged', () => {
        const env = setup();
        const slot = run(env, 'staff-first-signin-report.sh', ['staging'], { FAKE_SLOT_OK: '1' });
        expect(slot.status).toBe(2);
        expect(slot.stderr).toMatch(/GACP_DEPLOY_SLOT=staging/);
        const image = run(env, 'staff-first-signin-report.sh', ['staging'], { FAKE_SCRIPT_IN_IMAGE: '1' });
        expect(image.status).toBe(2);
        expect(image.stderr).toMatch(/ไม่มี scripts\/ops\/staff-first-signin-report\.js/);
        expect(dockerCalls(env).filter((call) => /node scripts\/ops/.test(call))).toEqual([]);
        expect(runLog(env).map((row) => row[6])).toEqual(['exit=2 slot env mismatch', 'exit=2 script not in image']);
    });

    test('the roster on demo goes over ssh to the fixed target with the fixed key and runs inside gacp-backend-demo', () => {
        const env = setup();
        const result = run(env, 'staff-mfa-roster.sh', ['demo']);
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        const calls = dockerCalls(env);
        expect(calls.filter((call) => /^ssh /.test(call)).every((call) => call.includes(`-i /home/ubuntu/.ssh/id_ed25519_newhost -o IdentitiesOnly=yes ${DEMO_TARGET} `))).toBe(true);
        expect(calls).toContain('ssh-decoded docker exec -w /app/apps/backend gacp-backend-demo node scripts/ops/staff-mfa-roster.js');
        expect(calls.filter((call) => !/^ssh/.test(call))).toEqual([]);
        expect(runLog(env)[0].slice(3, 6)).toEqual(['demo', 'roster', 'done']);
    });

    test('the emergency reset forwards its four references (Thai included) to the file in the image and logs the mfa-clear event; short usage is refused', () => {
        const env = setup();
        expect(run(env, 'staff-2fa-emergency-reset.sh', ['staging', '--target', 'u1']).status).toBe(2);
        const args = ['--target', 'u1', '--requester', 'a1', '--confirmation', 'หนังสือ 12/2569', '--approval', 'คำสั่ง 105'];
        const result = run(env, 'staff-2fa-emergency-reset.sh', ['staging', ...args]);
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(dockerCalls(env)).toContain(`exec -w /app/apps/backend gacp-backend-staging node scripts/ops/staff-2fa-emergency-reset.js ${args.join(' ')}`);
        const demo = run(env, 'staff-2fa-emergency-reset.sh', ['demo', ...args]);
        expect(demo.status).toBe(0);
        expect(dockerCalls(env)).toContain(`ssh-decoded docker exec -w /app/apps/backend gacp-backend-demo node scripts/ops/staff-2fa-emergency-reset.js ${args.join(' ')}`);
        expect(runLog(env).map((row) => [row[4], row[5]])).toEqual([['mfa-clear', 'refused'], ['mfa-clear', 'done'], ['mfa-clear', 'done']]);
    });
});

describe('mfa-flag-on-staging.sh', () => {
    test('turns the flag on, revokes sessions with --event flag-on right after the flag reads on, writes the once-per-host marker, refuses a second apply, and rollback reopens it', () => {
        const env = setup();
        const first = run(env, 'mfa-flag-on-staging.sh', [], { FAKE_TAG: 'main-abc' });
        expect({ status: first.status, stderr: first.stderr }).toEqual({ status: 0, stderr: '' });
        expect(fs.readFileSync(path.join(env.platform, '.env.staging'), 'utf8')).toContain('REQUIRE_MFA_FOR_PRIVILEGED=true');
        expect(fs.readFileSync(path.join(env.platform, 'docker-compose.staging.yml'), 'utf8')).toContain('REQUIRE_MFA_FOR_PRIVILEGED=${REQUIRE_MFA_FOR_PRIVILEGED:-false}');
        const calls = dockerCalls(env);
        const up = calls.findIndex((call) => /compose .* up -d --no-deps backend-staging/.test(call));
        const revoke = calls.findIndex((call) => /^exec -w \/app\/apps\/backend gacp-backend-staging node scripts\/ops\/staff-sessions-revoke-at-flag-on\.js --event flag-on --note flag-on staging tag main-abc \d{4}-/.test(call));
        expect(up).toBeGreaterThan(-1);
        expect(revoke).toBeGreaterThan(up);
        expect(calls.filter((call) => /^cp /.test(call))).toEqual([]);
        expect(first.stdout).toContain('REQUIRE_MFA_FOR_PRIVILEGED เปิดแล้ว: ใช่');
        expect(fs.existsSync(marker(env, 'staging'))).toBe(true);
        expect((fs.statSync(marker(env, 'staging')).mode & 0o777)).toBe(0o600);

        const second = run(env, 'mfa-flag-on-staging.sh', [], { FAKE_TAG: 'main-abc' });
        expect(second.status).toBe(2);
        expect(second.stderr).toMatch(/รันได้ครั้งเดียวต่อเครื่อง/);
        expect(dockerCalls(env).filter((call) => /node scripts\/ops/.test(call))).toHaveLength(1);

        const rollback = run(env, 'mfa-flag-on-staging.sh', ['rollback'], { FAKE_TAG: 'main-abc' });
        expect({ status: rollback.status, stderr: rollback.stderr }).toEqual({ status: 0, stderr: '' });
        expect(fs.readFileSync(path.join(env.platform, '.env.staging'), 'utf8')).toContain('REQUIRE_MFA_FOR_PRIVILEGED=false');
        expect(fs.existsSync(marker(env, 'staging'))).toBe(false);

        expect(runLog(env).map((row) => [row[4], row[5], row[6]])).toEqual([
            ['flag-on', 'done', 'exit=0 tag=main-abc marker=written'],
            ['flag-on', 'refused', 'exit=2 already applied'],
            ['flag-on-rollback', 'done', 'exit=0 tag=main-abc marker=removed'],
        ]);
    });

    test('when the revoke step refuses, the run exits 2, says the flag is on but sessions stand, writes no marker, and logs refused', () => {
        const env = setup();
        const result = run(env, 'mfa-flag-on-staging.sh', [], { FAKE_NODE_EXIT: '2' });
        expect(result.status).toBe(2);
        expect(result.stderr).toMatch(/ธงเปิดแล้ว แต่การตัด session ถูกปฏิเสธหรือล้มเหลว \(exit 2\)/);
        expect(fs.existsSync(marker(env, 'staging'))).toBe(false);
        expect(runLog(env).map((row) => [row[5], row[6]])).toEqual([['refused', 'exit=2']]);
    });

    test('refuses off this host before reading any file', () => {
        const env = setup();
        const result = run(env, 'mfa-flag-on-staging.sh', [], { FAKE_HOSTNAME: 'demo-box' });
        expect(result.status).toBe(2);
        expect(dockerCalls(env)).toEqual([]);
        expect(fs.readFileSync(path.join(env.platform, '.env.staging'), 'utf8')).toContain('REQUIRE_MFA_FOR_PRIVILEGED=false');
    });
});

describe('mfa-flag-on-demo.sh', () => {
    test('runs from this host over ssh to the fixed demo target, carries the revoke step with --event flag-on in the remote script, and keeps the once-per-host marker', () => {
        const env = setup();
        const first = run(env, 'mfa-flag-on-demo.sh', [], { FAKE_TAG: 'main-def' });
        expect({ status: first.status, stderr: first.stderr }).toEqual({ status: 0, stderr: '' });
        const sshCalls = dockerCalls(env).filter((call) => /^ssh /.test(call));
        expect(sshCalls.every((call) => call.includes(`${DEMO_TARGET} `))).toBe(true);
        expect(sshCalls.some((call) => /MODE=apply STAMP='' NOTE='flag-on demo tag main-def \d{4}-[^']+' bash -s$/.test(call))).toBe(true);
        const remote = fs.readFileSync(path.join(env.shimState, 'ssh-stdin'), 'utf8');
        const calls = dockerCalls(env);
        const up = calls.findIndex((call) => /^compose .* up -d --no-deps backend-demo/.test(call));
        const revoke = calls.findIndex((call) => /^exec -w \/app\/apps\/backend gacp-backend-demo node scripts\/ops\/staff-sessions-revoke-at-flag-on\.js --event flag-on --note flag-on demo tag main-def \d{4}-/.test(call));
        expect(up).toBeGreaterThan(-1);
        expect(revoke).toBeGreaterThan(up);
        expect(remote).not.toContain('docker cp');
        expect(fs.existsSync(marker(env, 'demo'))).toBe(true);

        const second = run(env, 'mfa-flag-on-demo.sh', [], { FAKE_TAG: 'main-def' });
        expect(second.status).toBe(2);
        expect(dockerCalls(env).filter((call) => /bash -s$/.test(call))).toHaveLength(1);

        const stamp = fs.readdirSync(env.demo).find((name) => name.startsWith('.env.demo.bak-mfa-')).slice('.env.demo.bak-mfa-'.length);
        const rollback = run(env, 'mfa-flag-on-demo.sh', ['rollback', stamp], { FAKE_TAG: 'main-def' });
        expect({ status: rollback.status, stderr: rollback.stderr }).toEqual({ status: 0, stderr: '' });
        expect(dockerCalls(env).some((call) => call.includes(`MODE=rollback STAMP='${stamp}' `))).toBe(true);
        expect(fs.readFileSync(path.join(env.demo, '.env.demo'), 'utf8')).not.toContain('REQUIRE_MFA_FOR_PRIVILEGED=true');
        expect(fs.existsSync(marker(env, 'demo'))).toBe(false);
        expect(runLog(env).map((row) => [row[3], row[4], row[5], row[6]])).toEqual([
            ['demo', 'flag-on', 'done', 'exit=0 tag=main-def marker=written'],
            ['demo', 'flag-on', 'refused', 'exit=2 already applied'],
            ['demo', 'flag-on-rollback', 'done', 'exit=0 tag=main-def marker=removed'],
        ]);
    });

    test('a refused remote run leaves no marker and is logged as refused; a foreign host never reaches ssh', () => {
        const env = setup();
        const refused = run(env, 'mfa-flag-on-demo.sh', [], { FAKE_SSH_EXIT: '2' });
        expect(refused.status).toBe(2);
        expect(fs.existsSync(marker(env, 'demo'))).toBe(false);
        const foreign = run(env, 'mfa-flag-on-demo.sh', [], { FAKE_HOSTNAME: 'laptop' });
        expect(foreign.status).toBe(2);
        expect(dockerCalls(env).filter((call) => /bash -s$/.test(call))).toHaveLength(1);
        expect(runLog(env).map((row) => [row[5], row[6]])).toEqual([['refused', 'exit=2'], ['refused', 'exit=2 wrong host']]);
    });
});

describe.each(FLAG_SCRIPTS)('order 108(1): every flag-on revokes sessions (%s)', (script, slot) => {
    const apply = (env) => run(env, script, [], { FAKE_TAG: 'main-abc' });
    const rollback = (env, extra = {}) => run(env, script, ['rollback'], { FAKE_TAG: 'main-abc', ...extra });
    const ok = (result) => ({ status: result.status, stderr: result.stderr });
    const logged = (env) => runLog(env).map((row) => [row[3], row[4], row[5], row[6]]);

    test('(a) on → rollback → on revokes twice, the rollback records flag-off in the database between them, and all three runs are logged', () => {
        const env = setup();
        expect(ok(apply(env))).toEqual({ status: 0, stderr: '' });
        const back = rollback(env);
        expect(ok(back)).toEqual({ status: 0, stderr: '' });
        expect(back.stdout).toContain('REQUIRE_MFA_FOR_PRIVILEGED เปิดแล้ว: ไม่ใช่');
        expect(fs.existsSync(marker(env, slot))).toBe(false);
        expect(ok(apply(env))).toEqual({ status: 0, stderr: '' });
        expect(flagEvents(env)).toEqual(['flag-on', 'flag-off', 'flag-on']);
        expect(dockerCalls(env).filter((call) => /--event flag-off --note flag-on-rollback \S+ tag main-abc \d{4}-/.test(call))).toHaveLength(1);
        expect(fs.existsSync(marker(env, slot))).toBe(true);
        expect(logged(env)).toEqual([
            [slot, 'flag-on', 'done', 'exit=0 tag=main-abc marker=written'],
            [slot, 'flag-on-rollback', 'done', 'exit=0 tag=main-abc marker=removed'],
            [slot, 'flag-on', 'done', 'exit=0 tag=main-abc marker=written'],
        ]);
    });

    test('(b) on → on refuses the second without revoking, and logs the refusal', () => {
        const env = setup();
        expect(ok(apply(env))).toEqual({ status: 0, stderr: '' });
        const second = apply(env);
        expect(second.status).toBe(2);
        expect(second.stderr).toMatch(/เปิดธงบน \S+ ไปแล้วเมื่อ .+ ถ้าต้องย้อนให้ใช้ rollback/);
        expect(flagEvents(env)).toEqual(['flag-on']);
        expect(logged(env).map((row) => row.slice(1))).toEqual([
            ['flag-on', 'done', 'exit=0 tag=main-abc marker=written'],
            ['flag-on', 'refused', 'exit=2 already applied'],
        ]);
    });

    test('(c) on → rollback → on → on refuses the last', () => {
        const env = setup();
        [apply, rollback, apply].forEach((step) => expect(ok(step(env))).toEqual({ status: 0, stderr: '' }));
        const last = apply(env);
        expect(last.status).toBe(2);
        expect(flagEvents(env)).toEqual(['flag-on', 'flag-off', 'flag-on']);
        expect(logged(env).map((row) => row[2])).toEqual(['done', 'done', 'done', 'refused']);
    });

    test('a rollback whose flag-off record fails keeps the marker, so the next apply is refused until a rollback records it', () => {
        const env = setup();
        expect(ok(apply(env))).toEqual({ status: 0, stderr: '' });
        const back = rollback(env, { FAKE_FLAG_OFF_EXIT: '1' });
        expect(back.status).toBe(1);
        expect(back.stderr).toMatch(/บันทึกการย้อนธงในฐานข้อมูลไม่สำเร็จ/);
        expect(fs.existsSync(marker(env, slot))).toBe(true);
        expect(apply(env).status).toBe(2);
        expect(ok(rollback(env))).toEqual({ status: 0, stderr: '' });
        expect(ok(apply(env))).toEqual({ status: 0, stderr: '' });
        expect(flagEvents(env)).toEqual(['flag-on', 'flag-off', 'flag-off', 'flag-on']);
    });
});

describe.each(FLAG_SCRIPTS)('review M1: rollback STAMP is exactly YYYYMMDD-HHMMSS before any use (%s)', (script, slot) => {
    const sentinel = (env) => path.join(env.root, 'injected');
    const payloads = (env) => [
        ['quote', `1-1'; touch ${sentinel(env)}; echo '`],
        ['semicolon', `20261020-224500; touch ${sentinel(env)}`],
        ['command substitution', `20261020-224500$(touch ${sentinel(env)})`],
        ['newline', `20261020-224500\ntouch ${sentinel(env)}`],
        ['path', '20261020-224500/../../etc'],
        ['short', '2026102-224500'],
        ['long', '20261020-2245001'],
    ];

    test('every injection payload is refused with exit 2, logged as bad stamp, and nothing runs', () => {
        const env = setup();
        const cases = payloads(env);
        const results = cases.map(([name, stamp]) => {
            const result = run(env, script, ['rollback', stamp]);
            return [name, result.status, /STAMP must look like 20261020-224500/.test(result.stderr)];
        });
        expect({ results, calls: dockerCalls(env), injected: fs.existsSync(sentinel(env)) })
            .toEqual({ results: cases.map(([name]) => [name, 2, true]), calls: [], injected: false });
        expect(runLog(env).map((row) => [row[3], row[4], row[5], row[6]])).toEqual(cases.map(() => [slot, 'flag-on-rollback', 'refused', 'exit=2 bad stamp']));
    });

    test('a well-formed stamp restores that backup', () => {
        const env = setup();
        expect(run(env, script, [], { FAKE_TAG: 'main-abc' }).status).toBe(0);
        const dir = slot === 'demo' ? env.demo : env.platform;
        const prefix = `.env.${slot}.bak-mfa-`;
        const stamp = fs.readdirSync(dir).find((name) => name.startsWith(prefix)).slice(prefix.length);
        expect(stamp).toMatch(/^\d{8}-\d{6}$/);
        const back = run(env, script, ['rollback', stamp], { FAKE_TAG: 'main-abc' });
        expect({ status: back.status, stderr: back.stderr }).toEqual({ status: 0, stderr: '' });
        expect(back.stdout).toContain(`restored ${prefix}${stamp}`);
    });
});

describe('review L1: the caller cannot move the state or platform directory', () => {
    test('the lib a production run sources names both directories as literals and reads no STAFF_2FA_ variable', () => {
        const lib = fs.readFileSync(LIB, 'utf8');
        expect(lib).not.toMatch(/STAFF_2FA_/);
        expect(lib.split('\n').filter((line) => /^S2FA_(STATE|PLATFORM)_DIR=/.test(line))).toEqual([
            `S2FA_STATE_DIR=${PRODUCTION_DIRS.state}`,
            `S2FA_PLATFORM_DIR=${PRODUCTION_DIRS.platform}`,
        ]);
    });

    test('STAFF_2FA_STATE_DIR and STAFF_2FA_PLATFORM_DIR from the caller move neither the marker, the log, nor the files edited', () => {
        const env = setup();
        const elsewhere = path.join(env.root, 'elsewhere');
        const otherPlatform = path.join(env.root, 'other-platform');
        fs.mkdirSync(elsewhere);
        fs.cpSync(env.platform, otherPlatform, { recursive: true });
        const moved = { FAKE_TAG: 'main-abc', STAFF_2FA_STATE_DIR: elsewhere, STAFF_2FA_PLATFORM_DIR: otherPlatform };
        const first = run(env, 'mfa-flag-on-staging.sh', [], moved);
        const second = run(env, 'mfa-flag-on-staging.sh', [], { ...moved, STAFF_2FA_STATE_DIR: path.join(env.root, 'third') });
        expect({
            first: first.status,
            second: second.status,
            elsewhere: fs.readdirSync(elsewhere),
            third: fs.existsSync(path.join(env.root, 'third')),
            otherPlatformFlag: fs.readFileSync(path.join(otherPlatform, '.env.staging'), 'utf8').includes('REQUIRE_MFA_FOR_PRIVILEGED=true'),
            fixedPlatformFlag: fs.readFileSync(path.join(env.platform, '.env.staging'), 'utf8').includes('REQUIRE_MFA_FOR_PRIVILEGED=true'),
            marker: fs.existsSync(marker(env, 'staging')),
            revokes: flagEvents(env),
        }).toEqual({ first: 0, second: 2, elsewhere: [], third: false, otherPlatformFlag: false, fixedPlatformFlag: true, marker: true, revokes: ['flag-on'] });
        expect(runLog(env).map((row) => [row[5], row[6]])).toEqual([['done', 'exit=0 tag=main-abc marker=written'], ['refused', 'exit=2 already applied']]);
    });
});

describe('review L2: a slot the caller types reaches the log only after the host table names it', () => {
    const forged = `x\n2099-01-01T00:00:00Z\tstaff-mfa-roster.sh\t${HOST}\tstaging\troster\tdone\texit=0 forged`;
    const slots = [['forged row', forged], ['tab', 'staging\tdemo'], ['carriage return', 'staging\rdemo'], ['escape', '\u001b[2Jstaging'], ['awk escape alias', 'stag\\151ng']];

    test('unknown slots, including one that would forge a log line or alias a real slot, are refused and logged as ?', () => {
        const env = setup();
        const statuses = slots.map(([name, slot]) => [name, run(env, 'staff-mfa-roster.sh', [slot]).status]);
        expect(statuses).toEqual(slots.map(([name]) => [name, 2]));
        expect(dockerCalls(env)).toEqual([]);
        const raw = fs.readFileSync(path.join(env.state, 'runs.log'), 'utf8');
        expect(raw).not.toMatch(/forged|[\r\u001b]/);
        expect(runLog(env).map((row) => [row.length, row[3], row[5], row[6]])).toEqual(slots.map(() => [7, '?', 'refused', 'exit=2 unknown slot']));
    });
});

describe('review I1: every run logs its intent before it changes anything', () => {
    test('each run writes a start line, then its outcome line, with the same script, slot and event', () => {
        const env = setup();
        run(env, 'staff-mfa-roster.sh', ['staging']);
        run(env, 'staff-mfa-roster.sh', ['nowhere']);
        run(env, 'mfa-flag-on-demo.sh', [], { FAKE_TAG: 'main-def' });
        expect(logRows(env).map((row) => [row[1], row[3], row[4], row[5], row[6]])).toEqual([
            ['staff-mfa-roster.sh', 'staging', 'roster', 'start', '-'],
            ['staff-mfa-roster.sh', 'staging', 'roster', 'done', 'exit=0'],
            ['staff-mfa-roster.sh', '?', 'roster', 'start', '-'],
            ['staff-mfa-roster.sh', '?', 'roster', 'refused', 'exit=2 unknown slot'],
            ['mfa-flag-on-demo.sh', 'demo', 'flag-on', 'start', '-'],
            ['mfa-flag-on-demo.sh', 'demo', 'flag-on', 'done', 'exit=0 tag=main-def marker=written'],
        ]);
    });

    test.each(FLAG_SCRIPTS)('%s with a state directory it cannot write stops before docker, ssh or any file edit', (script, slot) => {
        const env = setup();
        fs.rmSync(env.state, { recursive: true });
        fs.writeFileSync(env.state, 'not a directory\n');
        const envFile = slot === 'demo' ? path.join(env.demo, '.env.demo') : path.join(env.platform, '.env.staging');
        const before = fs.readFileSync(envFile, 'utf8');
        const result = run(env, script, [], { FAKE_TAG: 'main-abc' });
        expect({ status: result.status, calls: dockerCalls(env), edited: fs.readFileSync(envFile, 'utf8') !== before })
            .toEqual({ status: 1, calls: [], edited: false });
        expect(result.stderr).toContain('/runs.log');
    });
});
