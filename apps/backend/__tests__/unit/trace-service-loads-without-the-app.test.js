'use strict';

/**
 * Loading the trace service first must not boot the whole app. common.js once took prisma
 * from require('../../server'): any process that loaded trace-service before server.js (a
 * test, a script) built the app mid-load, the /api/trace router captured a half-loaded
 * trace-service, and the lot door answered 500 for every certified lot
 * (evaluateCertGate is not a function). A fresh node process keeps the load order honest;
 * jest's own module registry would hide it.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const BACKEND = path.resolve(__dirname, '../..');

const PROBE = `
const loaded = () => Object.keys(require.cache).some((k) => k === require.resolve('./server'));
const trace = require('./services/trace-service');
process.stdout.write('\\nPROBE ' + JSON.stringify({ serverLoaded: loaded(), gate: typeof trace.evaluateCertGate }));
process.exit(0);
`;

test('requiring trace-service before server.js leaves server.js unloaded', () => {
    const out = execFileSync(process.execPath, ['-e', PROBE], {
        cwd: BACKEND, timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, DATABASE_URL: 'postgresql://probe:probe@127.0.0.1:1/probe' },
    });
    const line = out.split('\n').find((l) => l.startsWith('PROBE '));
    expect(JSON.parse(line.slice('PROBE '.length))).toEqual({ serverLoaded: false, gate: 'function' });
});
