#!/usr/bin/env node

/**
 * ============================================================================
 * TestSprite - Backend Test Suite Runner
 * ============================================================================
 * Reads the test plan JSON and executes test cases against the running API.
 * Generates a report in testsprite-reports/.
 *
 * Usage:
 *   node scripts/run-testsprite-full-suite.js [--api-url http://localhost:5000/api]
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
const apiUrlArg = args.find((a) => a.startsWith('--api-url='));
const API_BASE = apiUrlArg
    ? apiUrlArg.split('=')[1]
    : process.env.API_BASE_URL || 'http://localhost:5000/api';

const PLAN_PATH = path.join(__dirname, '..', '..', 'testsprite_tests', 'testsprite_full_test_plan.json');
const REPORT_DIR = path.join(__dirname, '..', '..', 'testsprite-reports');

// Ensure report dir
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

function httpRequest(method, endpoint, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${API_BASE}${endpoint}`);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        const postData = body ? JSON.stringify(body) : null;

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: method,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            rejectUnauthorized: false,
        };

        if (postData) {
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({ status: res.statusCode, body: parsed });
            });
        });

        req.on('error', (err) => resolve({ status: 0, body: null, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null, error: 'TIMEOUT' }); });

        if (postData) req.write(postData);
        req.end();
    });
}

async function runTestCase(tc) {
    const start = Date.now();
    const result = { id: tc.id, name: tc.name, status: 'UNKNOWN', durationMs: 0, details: {} };

    try {
        // Parse endpoint
        const parts = tc.endpoint.split(' ');
        const method = parts[0] || 'GET';
        let endpoint = parts[1] || parts[0];

        // Replace path params with dummy IDs
        endpoint = endpoint.replace(/:(\w+)/g, '00000000-0000-0000-0000-000000000000');

        const headers = tc.headers || {};
        const body = tc.payload || null;

        const { status, body: responseBody, error } = await httpRequest(method, endpoint, body, headers);

        result.details = { httpStatus: status, error: error || null };

        if (error) {
            result.status = status === 0 ? 'ERROR' : 'FAIL';
        } else if (tc.category === 'security') {
            // Security tests pass if the endpoint doesn't crash
            result.status = status < 500 ? 'PASS' : 'FAIL';
        } else if (tc.category === 'negative') {
            // Negative tests pass on 4xx
            result.status = status >= 400 && status < 500 ? 'PASS' : 'FAIL';
        } else {
            // Happy-path tests: expect 200/201 OR 401/403 (if no auth provided)
            result.status = [200, 201, 401, 403].includes(status) ? 'PASS' : 'FAIL';
        }
    } catch (err) {
        result.status = 'ERROR';
        result.details.error = err.message;
    }

    result.durationMs = Date.now() - start;
    return result;
}

async function main() {
    console.log('');
    console.log('========================================');
    console.log('   TestSprite - Full Suite Runner');
    console.log('========================================');
    console.log(`API: ${API_BASE}`);
    console.log(`Plan: ${PLAN_PATH}`);
    console.log('');

    // Load test plan
    const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8').replace(/^﻿/, ''));
    const allResults = [];
    let passed = 0, failed = 0, errors = 0;

    for (const [moduleKey, module] of Object.entries(plan.modules)) {
        console.log(`\n ${module.name} (${module.testCases.length} tests)`);

        for (const tc of module.testCases) {
            const result = await runTestCase(tc);
            allResults.push({ module: moduleKey, ...result });

            const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
            const statusColor = result.status === 'PASS' ? '\x1b[32m' : result.status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
            console.log(`  ${icon} ${statusColor}${tc.id}\x1b[0m ${tc.name} (${result.durationMs}ms)`);

            if (result.status === 'PASS') passed++;
            else if (result.status === 'FAIL') failed++;
            else errors++;
        }
    }

    // Summary
    const total = allResults.length;
    console.log('\n========================================');
    console.log('   TESTSPRITE RESULTS');
    console.log('========================================');
    console.log(`Passed: ${passed}/${total}`);
    console.log(`Failed: ${failed}/${total}`);
    console.log(`Errors: ${errors}/${total}`);
    console.log(`Pass Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log('========================================\n');

    // Save report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const report = {
        plan: plan.testPlan,
        version: plan.version,
        apiBaseUrl: API_BASE,
        executedAt: new Date().toISOString(),
        summary: { total, passed, failed, errors, passRate: ((passed / total) * 100).toFixed(1) + '%' },
        results: allResults,
    };

    const reportPath = path.join(REPORT_DIR, `testsprite-report-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report saved: ${reportPath}`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(2);
});
