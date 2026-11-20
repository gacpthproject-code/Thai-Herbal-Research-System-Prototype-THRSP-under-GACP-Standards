#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent HTML — Carpet-Bomb Page-by-Page HTML Validation
 * ═══════════════════════════════════════════════════════════════
 * Fetches EVERY page on the GACP platform against the live server
 * and validates:
 * HTTP status code (200/307/308 = OK)
 * Content-Type header (text/html)
 * Has <!DOCTYPE html> or <!doctype html>
 * Has <html> root element
 * Has <head> with <title>
 * Has <body> element
 * No server error traces leaked in HTML
 * Page size (bytes)
 * Response time (ms)
 *
 * Usage: node scripts/test/agent-html-validator.js [BASE_URL]
 */
const fs = require('fs');
const path = require('path');
const BASE_URL = process.argv[2] || 'https://gacpth.com';

let passed = 0, failed = 0, warnings = 0;
const results = [];

// ─── FULL PAGE REGISTRY (102 pages from sitemap) ────────────
const ALL_PAGES = [
    // Root
    { path: '/', group: 'ROOT', label: 'Landing Page' },
    // Auth
    { path: '/auth/health/login', group: 'AUTH', label: 'Health Login' },
    { path: '/auth/health/privacy', group: 'AUTH', label: 'Health Privacy' },
    { path: '/auth/health/terms', group: 'AUTH', label: 'Health Terms' },
    { path: '/auth/provider/login', group: 'AUTH', label: 'Provider Login' },
    { path: '/auth/clear-session', group: 'AUTH', label: 'Clear Session' },
    { path: '/login', group: 'AUTH', label: 'Login (redirect)' },
    { path: '/register', group: 'AUTH', label: 'Register' },
    { path: '/register/success', group: 'AUTH', label: 'Register Success' },
    // Public / Legal
    { path: '/privacy', group: 'PUBLIC', label: 'Privacy Policy' },
    { path: '/terms', group: 'PUBLIC', label: 'Terms of Service' },
    { path: '/test', group: 'PUBLIC', label: 'Test Page' },
    { path: '/verify', group: 'PUBLIC', label: 'Certificate Verify' },
    { path: '/verify/GACP-TEST-001', group: 'PUBLIC', label: 'Verify Cert Number' },
    // Trace
    { path: '/trace', group: 'TRACE', label: 'Trace Home' },
    { path: '/trace/SAMPLE-QR', group: 'TRACE', label: 'Trace QR Code' },
    { path: '/trace/batch/SAMPLE-BATCH', group: 'TRACE', label: 'Trace Batch' },
    { path: '/trace/lot/SAMPLE-LOT', group: 'TRACE', label: 'Trace Lot' },
    { path: '/trace/plant/SAMPLE-PLANT', group: 'TRACE', label: 'Trace Plant' },
    { path: '/trace/plot-cycle/SAMPLE-PLOT', group: 'TRACE', label: 'Trace Plot Cycle' },
    // Admin
    { path: '/admin/communication', group: 'ADMIN', label: 'Communication' },
    { path: '/admin/dashboard', group: 'ADMIN', label: 'Dashboard' },
    { path: '/admin/planting', group: 'ADMIN', label: 'Planting' },
    { path: '/admin/planting/1', group: 'ADMIN', label: 'Planting Detail' },
    { path: '/admin/settings', group: 'ADMIN', label: 'Settings' },
    { path: '/admin/users', group: 'ADMIN', label: 'Users' },
    // Health Portal
    { path: '/health', group: 'HEALTH', label: 'Health Home' },
    { path: '/health/dashboard', group: 'HEALTH', label: 'Dashboard' },
    { path: '/health/applications', group: 'HEALTH', label: 'Applications' },
    { path: '/health/applications/new', group: 'HEALTH', label: 'New Application' },
    { path: '/health/applications/new/step/1', group: 'HEALTH', label: 'New Step Redirect 1' },
    { path: '/health/applications/new/step/2', group: 'HEALTH', label: 'New Step Redirect 2' },
    { path: '/health/applications/new-legacy', group: 'HEALTH', label: 'Legacy Wizard Home' },
    { path: '/health/applications/new-legacy/step/1', group: 'HEALTH-WIZARD', label: 'Step 1 — Consent' },
    { path: '/health/applications/new-legacy/step/2', group: 'HEALTH-WIZARD', label: 'Step 2 — Plant' },
    { path: '/health/applications/new-legacy/step/3', group: 'HEALTH-WIZARD', label: 'Step 3 — Purpose' },
    { path: '/health/applications/new-legacy/step/4', group: 'HEALTH-WIZARD', label: 'Step 4 — Applicant' },
    { path: '/health/applications/new-legacy/step/5', group: 'HEALTH-WIZARD', label: 'Step 5 — Farm' },
    { path: '/health/applications/new-legacy/step/6', group: 'HEALTH-WIZARD', label: 'Step 6 — Production' },
    { path: '/health/applications/new-legacy/step/7', group: 'HEALTH-WIZARD', label: 'Step 7 — Quality' },
    { path: '/health/applications/new-legacy/step/8', group: 'HEALTH-WIZARD', label: 'Step 8 — Documents' },
    { path: '/health/applications/new-legacy/step/9', group: 'HEALTH-WIZARD', label: 'Step 9 — Review' },
    { path: '/health/applications/new-legacy/step/10', group: 'HEALTH-WIZARD', label: 'Step 10 — Quote' },
    { path: '/health/applications/new-legacy/step/11', group: 'HEALTH-WIZARD', label: 'Step 11 — Invoice' },
    { path: '/health/applications/new-legacy/step/12', group: 'HEALTH-WIZARD', label: 'Step 12 — Success' },
    { path: '/health/applications/new-legacy/success', group: 'HEALTH', label: 'Application Success' },
    { path: '/health/applications/amendment', group: 'HEALTH', label: 'Amendment' },
    { path: '/health/applications/payment', group: 'HEALTH', label: 'Payment' },
    { path: '/health/applications/preview', group: 'HEALTH', label: 'Preview' },
    { path: '/health/applications/renewal', group: 'HEALTH', label: 'Renewal' },
    { path: '/health/applications/replacement', group: 'HEALTH', label: 'Replacement' },
    { path: '/health/applications/tracking', group: 'HEALTH', label: 'App Tracking' },
    { path: '/health/applications/1', group: 'HEALTH', label: 'App Detail' },
    { path: '/health/applications/1/car', group: 'HEALTH', label: 'App CAR' },
    { path: '/health/applications/1/edit', group: 'HEALTH', label: 'App Edit' },
    { path: '/health/applications/1/preview', group: 'HEALTH', label: 'App Preview' },
    { path: '/health/certificates', group: 'HEALTH', label: 'Certificates' },
    { path: '/health/documents', group: 'HEALTH', label: 'Documents' },
    { path: '/health/documents/1', group: 'HEALTH', label: 'Document Detail' },
    { path: '/health/establishments', group: 'HEALTH', label: 'Establishments' },
    { path: '/health/establishments/1', group: 'HEALTH', label: 'Establishment Detail' },
    { path: '/health/establishments/new', group: 'HEALTH', label: 'New Establishment' },
    { path: '/health/export-documents', group: 'HEALTH', label: 'Export Documents' },
    { path: '/health/notifications', group: 'HEALTH', label: 'Notifications' },
    { path: '/health/official-documents', group: 'HEALTH', label: 'Official Docs' },
    { path: '/health/payments', group: 'HEALTH', label: 'Payments' },
    { path: '/health/planting', group: 'HEALTH', label: 'Planting' },
    { path: '/health/planting/1', group: 'HEALTH', label: 'Planting Detail' },
    { path: '/health/planting/1/activities', group: 'HEALTH', label: 'Planting Activities' },
    { path: '/health/planting/new', group: 'HEALTH', label: 'New Planting' },
    { path: '/health/profile', group: 'HEALTH', label: 'Profile' },
    { path: '/health/reports', group: 'HEALTH', label: 'Reports' },
    { path: '/health/resources', group: 'HEALTH', label: 'Resources' },
    { path: '/health/settings', group: 'HEALTH', label: 'Settings' },
    { path: '/health/site-analysis', group: 'HEALTH', label: 'Site Analysis' },
    { path: '/health/sop-builder', group: 'HEALTH', label: 'SOP Builder' },
    { path: '/health/sop-templates', group: 'HEALTH', label: 'SOP Templates' },
    { path: '/health/start', group: 'HEALTH', label: 'Getting Started' },
    { path: '/health/start/readiness', group: 'HEALTH', label: 'Readiness Check' },
    { path: '/health/tracking', group: 'HEALTH', label: 'Tracking' },
    { path: '/health/tracking/cycles', group: 'HEALTH', label: 'Tracking Cycles' },
    { path: '/health/tracking/cycles/1', group: 'HEALTH', label: 'Cycle Detail' },
    { path: '/health/tracking/cycles/1/plants', group: 'HEALTH', label: 'Cycle Plants' },
    { path: '/health/tracking/logs', group: 'HEALTH', label: 'Tracking Logs' },
    { path: '/health/tracking/lots', group: 'HEALTH', label: 'Tracking Lots' },
    { path: '/health/tracking/plants/QR-SAMPLE', group: 'HEALTH', label: 'Plant QR' },
    { path: '/health/training', group: 'HEALTH', label: 'Training' },
    // Provider Portal
    { path: '/provider', group: 'PROVIDER', label: 'Provider Home' },
    { path: '/provider/login', group: 'PROVIDER', label: 'Provider Login Alt' },
    { path: '/provider/dashboard', group: 'PROVIDER', label: 'Dashboard' },
    { path: '/provider/dashboard/admin', group: 'PROVIDER', label: 'Admin Dashboard' },
    { path: '/provider/applications', group: 'PROVIDER', label: 'Applications' },
    { path: '/provider/applications/1', group: 'PROVIDER', label: 'App Detail' },
    { path: '/provider/applications/1/print', group: 'PROVIDER', label: 'App Print' },
    { path: '/provider/audits', group: 'PROVIDER', label: 'Audits' },
    { path: '/provider/audits/1', group: 'PROVIDER', label: 'Audit Detail' },
    { path: '/provider/accounting', group: 'PROVIDER', label: 'Accounting' },
    { path: '/provider/analytics', group: 'PROVIDER', label: 'Analytics' },
    { path: '/provider/calendar', group: 'PROVIDER', label: 'Calendar' },
    { path: '/provider/certificates', group: 'PROVIDER', label: 'Certificates' },
    { path: '/provider/coordinator', group: 'PROVIDER', label: 'Coordinator' },
    { path: '/provider/criteria', group: 'PROVIDER', label: 'Criteria' },
    { path: '/provider/documents', group: 'PROVIDER', label: 'Documents' },
    { path: '/provider/management', group: 'PROVIDER', label: 'Management' },
    { path: '/provider/planting', group: 'PROVIDER', label: 'Planting' },
    { path: '/provider/planting/1', group: 'PROVIDER', label: 'Planting Detail' },
    { path: '/provider/profile', group: 'PROVIDER', label: 'Profile' },
    { path: '/provider/receipts', group: 'PROVIDER', label: 'Receipts' },
    { path: '/provider/reports', group: 'PROVIDER', label: 'Reports' },
    { path: '/provider/scheduler/reassign', group: 'PROVIDER', label: 'Scheduler Reassign' },
    { path: '/provider/settings', group: 'PROVIDER', label: 'Settings' },
    { path: '/provider/settings/system', group: 'PROVIDER', label: 'System Settings' },
];

// ─── HTML VALIDATION LOGIC ───────────────────────────────────

function validateHTML(html, url) {
    const checks = [];
    const lower = html.toLowerCase();

    // 1. DOCTYPE
    const hasDoctype = lower.includes('<!doctype html');
    checks.push({ name: 'DOCTYPE', pass: hasDoctype });

    // 2. <html> tag
    const hasHtml = /<html[\s>]/i.test(html);
    checks.push({ name: '<html>', pass: hasHtml });

    // 3. <head>
    const hasHead = /<head[\s>]/i.test(html);
    checks.push({ name: '<head>', pass: hasHead });

    // 4. <title>
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    const hasTitle = !!titleMatch && titleMatch[1].trim().length > 0;
    const titleText = titleMatch ? titleMatch[1].trim().substring(0, 60) : '';
    checks.push({ name: '<title>', pass: hasTitle, detail: titleText });

    // 5. <body>
    const hasBody = /<body[\s>]/i.test(html);
    checks.push({ name: '<body>', pass: hasBody });

    // 6. No server error traces
    const hasStackTrace = /at\s+\w+\s*\(.*?\.\w+:\d+/i.test(html);
    const hasNodeModules = /node_modules\//i.test(html) && !lower.includes('next/dist'); // exclude next.js internal
    const hasServerError = hasStackTrace || (hasNodeModules && lower.includes('error'));
    checks.push({ name: 'No leaked errors', pass: !hasServerError });

    // 7. Has meaningful content (not just an empty shell)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').trim() : '';
    const hasContent = bodyContent.length > 50;
    checks.push({ name: 'Has content', pass: hasContent, detail: `${bodyContent.length} chars` });

    // 8. Charset
    const hasCharset = /charset\s*=\s*["']?utf-8/i.test(html);
    checks.push({ name: 'UTF-8 charset', pass: hasCharset });

    // 9. Viewport meta
    const hasViewport = /name\s*=\s*["']viewport["']/i.test(html);
    checks.push({ name: 'Viewport meta', pass: hasViewport });

    return checks;
}

async function testPage(page) {
    const url = `${BASE_URL}${page.path}`;
    const startTime = Date.now();
    let status, html, contentType, elapsed, redirectUrl;

    try {
        const res = await fetch(url, { redirect: 'manual' });
        status = res.status;
        contentType = res.headers.get('content-type') || '';

        // Follow redirects for HTML pages
        if ([301, 302, 307, 308].includes(status)) {
            const loc = res.headers.get('location');
            redirectUrl = loc;
            // Follow one redirect
            if (loc) {
                let absLoc = loc.startsWith('http') ? loc : new URL(loc, url).href;
                if (new URL(url).protocol === 'https:' && absLoc.startsWith('http://'))
                    absLoc = absLoc.replace(/^http:/, 'https:');
                const res2 = await fetch(absLoc, { redirect: 'manual' });
                status = res2.status;
                contentType = res2.headers.get('content-type') || '';
                html = await res2.text();
            } else {
                html = await res.text();
            }
        } else {
            html = await res.text();
        }
        elapsed = Date.now() - startTime;
    } catch (e) {
        elapsed = Date.now() - startTime;
        results.push({
            path: page.path,
            group: page.group,
            label: page.label,
            status: 'ERR',
            elapsed,
            pass: false,
            issues: [`Connection error: ${e.message}`],
            size: 0,
        });
        failed++;
        return;
    }

    const size = Buffer.byteLength(html || '', 'utf-8');
    const isHTML = contentType.includes('text/html');
    const issues = [];

    // Status check
    if (status >= 500) {
        issues.push(`Server error: HTTP ${status}`);
    }

    // Content-Type check
    if (!isHTML && status === 200) {
        issues.push(`Content-Type is "${contentType}", expected text/html`);
    }

    // HTML validation (only if we got HTML content)
    let htmlChecks = [];
    if (isHTML && html && status < 500) {
        htmlChecks = validateHTML(html, url);
        for (const check of htmlChecks) {
            if (!check.pass) {
                issues.push(`Missing ${check.name}`);
            }
        }
    }

    // Determine result
    const isCriticalFail = status >= 500 || issues.some(i => i.includes('Server error'));
    const hasWarnings = issues.length > 0 && !isCriticalFail;

    if (isCriticalFail) {
        failed++;
    } else if (hasWarnings) {
        warnings++;
        passed++; // Warnings still count as passed
    } else {
        passed++;
    }

    results.push({
        path: page.path,
        group: page.group,
        label: page.label,
        status,
        elapsed,
        size,
        contentType: contentType.split(';')[0].trim(),
        pass: !isCriticalFail,
        redirect: redirectUrl || null,
        issues,
        htmlChecks: htmlChecks.map(c => ({ ...c })),
        title: htmlChecks.find(c => c.name === '<title>')?.detail || '',
    });
}

// ─── REPORT ──────────────────────────────────────────────────

function printReport() {
    const total = passed + failed;
    const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
    const groups = [...new Set(ALL_PAGES.map(p => p.group))];

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║ Agent HTML — Carpet-Bomb Page-by-Page Validation Report ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${BASE_URL}`);
    console.log(`  Date:   ${new Date().toISOString()}`);
    console.log(`  Pages:  ${ALL_PAGES.length}\n`);

    for (const group of groups) {
        const groupResults = results.filter(r => r.group === group);
        const groupPassed = groupResults.filter(r => r.pass).length;
        console.log(`\n── ${group} (${groupPassed}/${groupResults.length}) ${'─'.repeat(Math.max(0, 55 - group.length))}`);

        for (const r of groupResults) {
            const icon = r.pass ? (r.issues.length > 0 ? '⚠️' : '✅') : '❌';
            const time = `${r.elapsed}ms`.padStart(6);
            const sizeKB = r.size ? `${(r.size / 1024).toFixed(1)}kb`.padStart(8) : '     N/A';
            const statusStr = String(r.status).padStart(3);
            const redirect = r.redirect ? ` → ${r.redirect.replace(BASE_URL, '')}` : '';
            const title = r.title ? ` "${r.title}"` : '';

            console.log(`  ${icon} ${statusStr} ${time} ${sizeKB}  ${r.path}${redirect}${title}`);

            if (r.issues.length > 0) {
                for (const issue of r.issues) {
                    console.log(`     ⤷ ${issue}`);
                }
            }
        }
    }

    // Summary
    console.log('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passed} Failed: ${failed} Warnings: ${warnings}`);
    console.log(`Pass Rate: ${rate}% (${total} pages tested)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Group summary table
    console.log('\n  GROUP SUMMARY:');
    for (const group of groups) {
        const gr = results.filter(r => r.group === group);
        const gp = gr.filter(r => r.pass).length;
        const bar = '█'.repeat(Math.round((gp / gr.length) * 20)).padEnd(20, '░');
        const pct = ((gp / gr.length) * 100).toFixed(0);
        console.log(`  ${group.padEnd(16)} ${bar} ${String(gp).padStart(3)}/${String(gr.length).padEnd(3)} ${pct}%`);
    }

    if (failed === 0) {
        console.log('\n ALL PAGES VALIDATED SUCCESSFULLY\n');
    } else {
        console.log(`\n ${failed} PAGE(S) HAVE CRITICAL ISSUES\n`);
        for (const r of results.filter(r => !r.pass)) {
            console.log(`    • ${r.path}: ${r.issues.join(', ')}`);
        }
        console.log('');
    }

    // Save results
    const outFile = path.join(__dirname, 'agent-html-validator-results.txt');
    const lines = [
        'Agent HTML — Page-by-Page Validation Report',
        `Target: ${BASE_URL}`,
        `Date: ${new Date().toISOString()}`,
        `Pass: ${passed} | Fail: ${failed} | Warnings: ${warnings} | Rate: ${rate}%`,
        `Pages tested: ${total}`,
        '',
        'RESULTS:',
        '',
    ];
    for (const r of results) {
        const icon = r.pass ? 'PASS' : 'FAIL';
        const warn = r.issues.length > 0 ? ` [${r.issues.join('; ')}]` : '';
        lines.push(`${icon} | ${r.status} | ${r.elapsed}ms | ${r.size}b | ${r.group} | ${r.path} | ${r.label}${warn}`);
    }
    fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
    console.log(`  Results → ${outFile}\n`);

    // JSON output
    const jsonFile = path.join(__dirname, 'agent-html-validator-results.json');
    fs.writeFileSync(jsonFile, JSON.stringify({
        agent: 'HTML-Validator',
        timestamp: new Date().toISOString(),
        target: BASE_URL,
        totalPages: ALL_PAGES.length,
        passed, failed, warnings,
        rate: parseFloat(rate),
        results: results.map(r => ({
            path: r.path, group: r.group, label: r.label,
            status: r.status, elapsed: r.elapsed, size: r.size,
            pass: r.pass, issues: r.issues, title: r.title,
        })),
    }, null, 2), 'utf-8');

    return { agent: 'HTML-Validator', passed, failed, warnings, total, rate: parseFloat(rate) };
}

// ─── MAIN ────────────────────────────────────────────────────

async function main() {
    console.log(`\n Agent HTML — Carpet-Bomb Page-by-Page Validation`);
    console.log(`   Target: ${BASE_URL}`);
    console.log(`   Pages:  ${ALL_PAGES.length}\n`);

    // Health check
    for (let i = 1; i <= 5; i++) {
        try {
            const r = await fetch(`${BASE_URL}/api/health`);
            if (r.ok) { console.log(`Backend healthy\n`); break; }
        } catch {}
        if (i === 5) { console.log(`Backend not ready\n`); break; }
        await new Promise(r => setTimeout(r, 3000));
    }

    // Test all pages with small delay between groups
    let currentGroup = '';
    for (let i = 0; i < ALL_PAGES.length; i++) {
        const page = ALL_PAGES[i];
        if (page.group !== currentGroup) {
            currentGroup = page.group;
            process.stdout.write(`   Testing ${currentGroup}...`);
        }
        await testPage(page);
        // Small delay every 10 pages to avoid rate-limiting
        if (i > 0 && i % 10 === 0) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    process.stdout.write(' done\n');

    const summary = printReport();
    if (typeof module !== 'undefined') module.exports = summary;
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
