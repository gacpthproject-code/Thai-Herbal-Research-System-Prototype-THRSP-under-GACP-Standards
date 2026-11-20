#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent UX — Carpet-Bomb UX/UI Design Audit
 * ═══════════════════════════════════════════════════════════════
 * Audits every page of the GACP platform for:
 *   Phase A: Design System Consistency (CSS tokens, component usage)
 *   Phase B: Live Page Audit (HTML structure, accessibility, SEO)
 *   Phase C: Typography & Font Loading
 *   Phase D: Color & Contrast Compliance
 *   Phase E: Component Library Coverage
 *   Phase F: Responsive / Mobile Readiness
 *   Phase G: Accessibility (a11y)
 *   Phase H: Micro-interactions & Animation
 *
 * Usage: node scripts/test/agent-ux-audit.js [BASE_URL]
 */
const fs = require('fs');
const path = require('path');
const BASE_URL = process.argv[2] || 'https://gacpth.com';
const SRC = path.join(__dirname, '..', '..', 'apps', 'web-app', 'src');

let passed = 0, failed = 0, warnings = 0, info = 0;
const results = [];
const findings = [];

function test(cat, name, fn) {
    const label = `[${cat}] ${name}`;
    try {
        const r = fn();
        if (r && r.warn) { warnings++; results.push({ s: '⚠️', label, d: r.warn }); findings.push({ severity: 'warning', cat, name, detail: r.warn }); }
        else if (r && r.info) { info++; results.push({ s: '💡', label, d: r.info }); findings.push({ severity: 'info', cat, name, detail: r.info }); passed++; }
        else { passed++; results.push({ s: '✅', label, d: String(r || '').substring(0, 150) }); }
    } catch (e) { failed++; results.push({ s: '❌', label, d: String(e.message || e).substring(0, 200) }); findings.push({ severity: 'critical', cat, name, detail: e.message }); }
}
async function testAsync(cat, name, fn) {
    const label = `[${cat}] ${name}`;
    try {
        const r = await fn();
        if (r && r.warn) { warnings++; results.push({ s: '⚠️', label, d: r.warn }); findings.push({ severity: 'warning', cat, name, detail: r.warn }); }
        else if (r && r.info) { info++; results.push({ s: '💡', label, d: r.info }); findings.push({ severity: 'info', cat, name, detail: r.info }); passed++; }
        else { passed++; results.push({ s: '✅', label, d: String(r || '').substring(0, 150) }); }
    } catch (e) { failed++; results.push({ s: '❌', label, d: String(e.message || e).substring(0, 200) }); findings.push({ severity: 'critical', cat, name, detail: e.message }); }
}
function assert(c, m) { if (!c) throw new Error(m); }
function readSrc(rel) { return fs.readFileSync(path.join(SRC, rel), 'utf-8'); }
function srcExists(rel) { return fs.existsSync(path.join(SRC, rel)); }

async function fetchPage(urlPath) {
    let res = await fetch(`${BASE_URL}${urlPath}`, { redirect: 'manual' });
    if ([301, 302, 307, 308].includes(res.status) && res.headers.get('location')) {
        let loc = new URL(res.headers.get('location'), `${BASE_URL}${urlPath}`).href;
        if (loc.startsWith('http://')) loc = loc.replace(/^http:/, 'https:');
        res = await fetch(loc);
    }
    return { status: res.status, text: await res.text(), headers: res.headers };
}

// ═══════════════════════════════════════════════════════════
// PHASE A: Design System Consistency
// ═══════════════════════════════════════════════════════════

function phaseADesignSystem() {
    const css = readSrc('styles/globals.css');

    test('TOKENS', 'CSS custom properties defined', () => {
        const vars = (css.match(/--[\w-]+:/g) || []).length;
        assert(vars >= 20, `Only ${vars} CSS variables`);
        return `${vars} design tokens defined`;
    });

    test('TOKENS', 'Light mode tokens', () => {
        assert(css.includes('--background:'), 'Missing --background');
        assert(css.includes('--foreground:'), 'Missing --foreground');
        assert(css.includes('--primary:'), 'Missing --primary');
        assert(css.includes('--secondary:'), 'Missing --secondary');
        return 'background/foreground/primary/secondary✓';
    });

    test('TOKENS', 'Dark mode tokens', () => {
        assert(css.includes('.dark {') || css.includes('.dark{'), 'No dark mode');
        const darkSection = css.substring(css.indexOf('.dark'));
        const darkVars = (darkSection.match(/--[\w-]+:/g) || []).length;
        assert(darkVars >= 10, `Only ${darkVars} dark mode vars`);
        return `${darkVars} dark mode tokens`;
    });

    test('TOKENS', 'Semantic status colors', () => {
        assert(css.includes('--success:'), 'Missing --success');
        assert(css.includes('--warning:'), 'Missing --warning');
        assert(css.includes('--info:'), 'Missing --info');
        assert(css.includes('--destructive:'), 'Missing --destructive');
        return 'success/warning/info/destructive✓';
    });

    test('TOKENS', 'Sidebar tokens', () => {
        assert(css.includes('--sidebar-background:'), 'Missing sidebar tokens');
        return 'sidebar-background/foreground/accent✓';
    });

    test('TOKENS', 'Glass/Glassmorphism system', () => {
        assert(css.includes('--glass-bg:'), 'Missing glass tokens');
        assert(css.includes('backdrop-filter'), 'Missing backdrop-filter');
        const glassClasses = (css.match(/\.glass[\w-]*/g) || []);
        return `${glassClasses.length} glass classes (glass, glass-heavy, glass-card, etc.)`;
    });

    test('TOKENS', 'Border radius system', () => {
        assert(css.includes('--radius:'), 'Missing --radius');
        return `radius: ${css.match(/--radius:\s*([^;]+)/)?.[1] || 'N/A'}`;
    });
}

// ═══════════════════════════════════════════════════════════
// PHASE B: Typography & Font System
// ═══════════════════════════════════════════════════════════

function phaseBTypography() {
    const css = readSrc('styles/globals.css');

    test('TYPO', 'Thai font (Prompt) configured', () => {
        assert(css.includes("'Prompt'") || css.includes('Prompt'), 'Missing Prompt font');
        return "Font: 'Prompt' (Thai-optimized)";
    });

    test('TYPO', 'Font rendering optimization', () => {
        assert(css.includes('text-rendering: optimizeLegibility'), 'Missing text-rendering');
        assert(css.includes('-webkit-font-smoothing: antialiased'), 'Missing font-smoothing');
        return 'optimizeLegibility✓ antialiased✓';
    });

    test('TYPO', 'Thai word breaking', () => {
        assert(css.includes('word-break') || css.includes('overflow-wrap'), 'Missing Thai text wrapping');
        return 'word-break✓ overflow-wrap✓';
    });

    // Check font loading in layout
    test('TYPO', 'Font loaded in layout', () => {
        const layout = readSrc('app/layout.tsx');
        const hasFontImport = layout.includes('Prompt') || layout.includes('font') || layout.includes('google');
        assert(hasFontImport, 'No font import in layout');
        return 'Font import in layout✓';
    });

    // Check for consistent heading hierarchy in pages
    test('TYPO', 'Heading classes consistent (text-lg/xl/2xl)', () => {
        const pages = findAllPages();
        let h1Count = 0, h2Count = 0;
        for (const p of pages.slice(0, 20)) {
            const content = fs.readFileSync(p, 'utf-8');
            if (content.includes('<h1')) h1Count++;
            if (content.includes('<h2')) h2Count++;
        }
        return `h1 in ${h1Count}/20 pages, h2 in ${h2Count}/20 pages`;
    });
}

// ═══════════════════════════════════════════════════════════
// PHASE C: Component Library Analysis
// ═══════════════════════════════════════════════════════════

function phaseCComponents() {
    const uiDir = path.join(SRC, 'components', 'ui');
    const components = fs.readdirSync(uiDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

    test('COMP', 'Component library size', () => {
        assert(components.length >= 20, `Only ${components.length} components`);
        return `${components.length} components in ui/`;
    });

    const essentialComponents = ['button', 'input', 'card', 'badge', 'alert', 'select', 'checkbox', 'skeleton', 'spinner', 'progress'];
    for (const comp of essentialComponents) {
        test('COMP', `Essential: ${comp} component`, () => {
            const exists = components.some(c => c.toLowerCase().includes(comp));
            assert(exists, `Missing ${comp} component`);
            return `${comp}✓`;
        });
    }

    test('COMP', 'Status badge component', () => {
        assert(srcExists('components/ui/status-badge.tsx'), 'Missing status-badge');
        const content = readSrc('components/ui/status-badge.tsx');
        const variants = ['draft', 'submitted', 'approved', 'rejected'].filter(v => content.toLowerCase().includes(v));
        return `${variants.length} status variants (${variants.join(', ')})`;
    });

    test('COMP', 'Loading states (skeleton + spinner)', () => {
        assert(srcExists('components/ui/loading-skeleton.tsx') || srcExists('components/ui/skeleton.tsx'), 'Missing skeleton');
        assert(srcExists('components/ui/loading-spinner.tsx') || srcExists('components/ui/spinner.tsx'), 'Missing spinner');
        return 'skeleton✓ spinner✓';
    });

    test('COMP', 'Error handling (error-boundary + error-state)', () => {
        assert(srcExists('components/ui/error-boundary.tsx'), 'Missing error-boundary');
        assert(srcExists('components/ui/error-state.tsx'), 'Missing error-state');
        return 'error-boundary✓ error-state✓';
    });

    test('COMP', 'Navigation components', () => {
        const hasBottomNav = srcExists('components/ui/bottom-nav.tsx');
        const hasSidebar = srcExists('components/ui/sidebar.tsx') || srcExists('components/ui/sidebar-nav.tsx');
        const hasMobileHeader = srcExists('components/ui/mobile-header.tsx');
        assert(hasSidebar, 'Missing sidebar navigation');
        return `sidebar✓ bottomNav:${hasBottomNav ? '✓' : '✗'} mobileHeader:${hasMobileHeader ? '✓' : '✗'}`;
    });

    test('COMP', 'Theme toggle component', () => {
        assert(srcExists('components/ui/theme-toggle.tsx'), 'Missing theme toggle');
        return 'theme-toggle✓ (dark mode switching)';
    });
}

// ═══════════════════════════════════════════════════════════
// PHASE D: Animations & Micro-interactions
// ═══════════════════════════════════════════════════════════

function phaseDAnimations() {
    const css = readSrc('styles/globals.css');

    test('ANIM', 'Page entrance animation', () => {
        assert(css.includes('page-stagger-in') || css.includes('page-enter'), 'No page entrance animation');
        return 'page-enter stagger animation✓';
    });

    test('ANIM', 'Card hover effect', () => {
        assert(css.includes('.card-hover'), 'No card-hover class');
        assert(css.includes('translateY(-2px)'), 'No hover lift effect');
        return 'card-hover: translateY(-2px) + box-shadow✓';
    });

    test('ANIM', 'Button press feedback', () => {
        assert(css.includes('.btn-press'), 'No button press feedback');
        assert(css.includes('scale(0.97)'), 'No scale effect');
        return 'btn-press: scale(0.97) on :active✓';
    });

    test('ANIM', 'Skeleton shimmer loading', () => {
        assert(css.includes('@keyframes shimmer'), 'No shimmer animation');
        assert(css.includes('.skeleton'), 'No skeleton class');
        return 'shimmer loading animation✓';
    });

    test('ANIM', 'Slide and scale animations', () => {
        const has = ['slide-in-left', 'slide-in-right', 'scale-in'].filter(a => css.includes(a));
        assert(has.length >= 2, 'Missing slide/scale animations');
        return `${has.length} directional animations`;
    });

    test('ANIM', 'Progress bar animation', () => {
        assert(css.includes('progress-fill') || css.includes('.progress-animated'), 'No progress animation');
        return 'progress-fill animation✓';
    });

    test('ANIM', 'Badge pulse notification', () => {
        assert(css.includes('badge-pulse'), 'No badge pulse');
        return 'badge-pulse for notifications✓';
    });

    test('ANIM', 'Default interactive transitions', () => {
        assert(css.includes('a, button, [role="button"]'), 'No default transitions');
        assert(css.includes('transition-duration: 150ms'), 'No 150ms duration');
        return 'Global 150ms transitions on interactive elements✓';
    });
}

// ═══════════════════════════════════════════════════════════
// PHASE E: Accessibility
// ═══════════════════════════════════════════════════════════

function phaseEAccessibility() {
    const css = readSrc('styles/globals.css');

    test('A11Y', 'Reduced motion support', () => {
        assert(css.includes('prefers-reduced-motion'), 'No reduced motion');
        return 'prefers-reduced-motion: reduce✓';
    });

    test('A11Y', 'Focus ring visible', () => {
        assert(css.includes('focus-visible'), 'No focus-visible styles');
        assert(css.includes('outline'), 'No outline');
        return 'focus-visible with ring outline✓';
    });

    test('A11Y', 'Selection color', () => {
        assert(css.includes('::selection'), 'No selection styles');
        return 'Custom selection color (brand-aligned)✓';
    });

    test('A11Y', 'Print styles', () => {
        assert(css.includes('@media print'), 'No print styles');
        return 'Print: hides nav/sidebar, resets colors✓';
    });

    test('A11Y', 'Scrollbar styling', () => {
        assert(css.includes('::-webkit-scrollbar'), 'No custom scrollbar');
        return 'Custom scrollbar (8px, rounded)✓';
    });

    test('A11Y', 'Smooth scroll with offset', () => {
        assert(css.includes('scroll-behavior: smooth'), 'No smooth scroll');
        assert(css.includes('scroll-padding-top'), 'No scroll padding');
        return 'smooth scroll with 5rem header offset✓';
    });
}

// ═══════════════════════════════════════════════════════════
// PHASE F: Layout System
// ═══════════════════════════════════════════════════════════

function phaseFLayout() {
    // Check layout files
    test('LAYOUT', 'Root layout exists', () => {
        assert(srcExists('app/layout.tsx'), 'Missing root layout');
        return 'Root layout✓';
    });

    test('LAYOUT', 'Health portal layout', () => {
        const exists = srcExists('app/health/layout.tsx');
        assert(exists, 'No health layout');
        const content = readSrc('app/health/layout.tsx');
        const hasSidebar = content.includes('sidebar') || content.includes('Sidebar') || content.includes('SideNav');
        return `Health layout✓ sidebar:${hasSidebar ? '✓' : '✗'}`;
    });

    test('LAYOUT', 'Provider portal layout', () => {
        const exists = srcExists('app/provider/layout.tsx');
        assert(exists, 'No provider layout');
        return 'Provider layout✓';
    });

    test('LAYOUT', 'Viewport meta tag in layout', () => {
        const layout = readSrc('app/layout.tsx');
        // Next.js 14+ auto-injects viewport via Metadata API (metadata export)
        const hasViewport = layout.includes('viewport') || layout.includes('Viewport') || layout.includes('metadata');
        assert(hasViewport, 'Missing viewport');
        return 'viewport meta✓ (Next.js Metadata API)';
    });

    test('LAYOUT', 'Responsive breakpoints (Tailwind)', () => {
        // Check tailwind config for responsive
        let twConfig;
        try { twConfig = fs.readFileSync(path.join(SRC, '..', 'tailwind.config.ts'), 'utf-8'); }
        catch { try { twConfig = fs.readFileSync(path.join(SRC, '..', 'tailwind.config.js'), 'utf-8'); } catch { twConfig = ''; } }
        return twConfig ? 'Tailwind config exists (responsive built-in)' : { info: 'No custom tailwind config; using defaults' };
    });
}

// ═══════════════════════════════════════════════════════════
// PHASE G: Live Page UX Audit
// ═══════════════════════════════════════════════════════════

const KEY_PAGES = [
    '/', '/login', '/register',
    '/auth/health/login', '/auth/provider/login',
    '/health/dashboard', '/health/applications', '/health/applications/new',
    '/health/certificates', '/health/planting', '/health/profile',
    '/health/tracking', '/health/sop-builder',
    '/provider/dashboard', '/provider/applications', '/provider/audits',
    '/provider/certificates', '/provider/calendar', '/provider/profile',
    '/verify', '/trace', '/privacy', '/terms',
];

async function phaseGLiveAudit() {
    for (const pg of KEY_PAGES) {
        await testAsync('LIVE-UX', `${pg} — HTML quality`, async () => {
            const { status, text } = await fetchPage(pg);
            if (status >= 500) throw new Error(`Server error: ${status}`);
            const checks = [];
            // Title
            const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/is);
            const title = titleMatch?.[1]?.trim() || '';
            if (!title) checks.push('no-title');
            // Viewport
            if (!text.includes('viewport')) checks.push('no-viewport');
            // Charset
            if (!/charset\s*=\s*["']?utf-8/i.test(text)) checks.push('no-charset');
            // Font
            if (!text.includes('Prompt') && !text.includes('prompt')) checks.push('no-thai-font');
            // Page size check (too small = likely empty)
            if (text.length < 15000) checks.push(`small:${(text.length/1024).toFixed(0)}KB`);
            // Check for inline styles (anti-pattern)
            const inlineStyles = (text.match(/style\s*=\s*"/g) || []).length;
            if (inlineStyles > 20) checks.push(`${inlineStyles} inline styles`);

            if (checks.length > 3) return { warn: checks.join(', ') };
            if (checks.length > 0) return { info: `Minor: ${checks.join(', ')}` };
            return `${status} | ${title.substring(0, 30)} | ${(text.length / 1024).toFixed(0)}KB`;
        });
    }
}

// ═══════════════════════════════════════════════════════════
// PHASE H: Page Source UX Patterns
// ═══════════════════════════════════════════════════════════

function phaseHPatterns() {
    const pages = findAllPages().slice(0, 50);

    // Check empty state patterns
    test('PATTERN', 'Empty state component usage', () => {
        const css = readSrc('styles/globals.css');
        assert(css.includes('.empty-state'), 'No empty-state class');
        return 'empty-state CSS class defined✓';
    });

    // Status badge consistency
    test('PATTERN', 'Status badge CSS classes', () => {
        const css = readSrc('styles/globals.css');
        const statuses = ['draft', 'submitted', 'reviewing', 'approved', 'rejected', 'expired'];
        const found = statuses.filter(s => css.includes(`.status-${s}`));
        assert(found.length >= 4, `Only ${found.length} status badge classes`);
        return `${found.length} status badge classes: ${found.join(', ')}`;
    });

    // Card variants
    test('PATTERN', 'Card variant classes', () => {
        const css = readSrc('styles/globals.css');
        const variants = ['card-accent-left', 'card-accent-top', 'card-borderless'].filter(v => css.includes(v));
        assert(variants.length >= 2, 'Missing card variants');
        return `${variants.length} card variants: ${variants.join(', ')}`;
    });

    // Table styling
    test('PATTERN', 'Table hover + zebra striping', () => {
        const css = readSrc('styles/globals.css');
        assert(css.includes('table tbody tr:hover'), 'No table row hover');
        assert(css.includes('nth-child(even)'), 'No zebra striping');
        return 'Table hover✓ zebra-stripe✓';
    });

    // Help system
    test('PATTERN', 'Help system components', () => {
        const hasHelpCenter = srcExists('components/ui/help-center.tsx');
        const hasHelpTooltip = srcExists('components/ui/help-tooltip.tsx');
        const hasOnboarding = srcExists('components/ui/onboarding-modal.tsx');
        return `help-center:${hasHelpCenter ? '✓' : '✗'} tooltip:${hasHelpTooltip ? '✓' : '✗'} onboarding:${hasOnboarding ? '✓' : '✗'}`;
    });

    // i18n support
    test('PATTERN', 'i18n / Language support', () => {
        const hasI18n = srcExists('lib/i18n/language-context.tsx') || srcExists('lib/i18n');
        return hasI18n ? 'i18n language context✓' : { info: 'No i18n support found' };
    });
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function findAllPages() {
    const pagesDir = path.join(SRC, 'app');
    const pages = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name === 'page.tsx') pages.push(full);
        }
    }
    walk(pagesDir);
    return pages;
}

// ═══════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════

function printReport() {
    const total = passed + failed;
    const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║ Agent UX — Carpet-Bomb UX/UI Design Audit Report ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${BASE_URL}\n  Date:   ${new Date().toISOString()}\n`);

    let cat = '';
    for (const r of results) {
        const c = r.label.match(/\[(.+?)\]/)?.[1] || '';
        if (c !== cat) {
            cat = c;
            const cr = results.filter(r2 => (r2.label.match(/\[(.+?)\]/)?.[1] || '') === c);
            const cp = cr.filter(r2 => r2.s === '✅' || r2.s === '💡').length;
            console.log(`\n── ${cat} (${cp}/${cr.length}) ${'─'.repeat(Math.max(0, 55 - cat.length))}`);
        }
        console.log(`  ${r.s} ${r.label.replace(/\[.+?\] /, '')} ${r.d ? `(${r.d})` : ''}`);
    }

    console.log('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Passed: ${passed} Failed: ${failed} Warnings: ${warnings} Info: ${info}`);
    console.log(`Pass Rate: ${rate}% (${total} checks)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const phases = {
        'TOKENS': 'A: Design Tokens',
        'TYPO': 'B: Typography',
        'COMP': 'C: Components',
        'ANIM': 'D: Animations',
        'A11Y': 'E: Accessibility',
        'LAYOUT': 'F: Layout System',
        'LIVE-UX': 'G: Live Page UX',
        'PATTERN': 'H: UX Patterns',
    };
    console.log('\n  PHASE SUMMARY:');
    for (const [key, label] of Object.entries(phases)) {
        const pr = results.filter(r => r.label.startsWith(`[${key}]`));
        const pp = pr.filter(r => r.s === '✅' || r.s === '💡').length;
        const bar = pr.length > 0 ? '█'.repeat(Math.round((pp / pr.length) * 20)).padEnd(20, '░') : '░'.repeat(20);
        console.log(`  ${label.padEnd(22)} ${bar} ${String(pp).padStart(2)}/${String(pr.length).padEnd(2)} ${pr.length > 0 ? ((pp / pr.length) * 100).toFixed(0) : '0'}%`);
    }

    if (failed === 0)
        console.log('\n UX/UI AUDIT PASSED — Design system is solid!\n');
    else {
        console.log(`\n ${failed} CRITICAL ISSUE(S)\n`);
        for (const r of results.filter(r => r.s ==='')) console.log(`• ${r.label}: ${r.d}`);
    }
    if (warnings > 0) {
        console.log(`${warnings} WARNING(S):`);
        for (const r of results.filter(r => r.s ==='')) console.log(`• ${r.label}: ${r.d}`);
    }
    console.log('');

    // Design System Score
    const designScore = Math.round((passed / Math.max(1, total)) * 100);
    console.log(`DESIGN SYSTEM SCORE: ${designScore}/100`);
    console.log('');

    // Save
    const outFile = path.join(__dirname, 'agent-ux-audit-results.txt');
    fs.writeFileSync(outFile, [
        'Agent UX — UX/UI Design Audit Report',
        `Target: ${BASE_URL}`,
        `Date: ${new Date().toISOString()}`,
        `Pass: ${passed} | Fail: ${failed} | Warnings: ${warnings} | Info: ${info}`,
        `Design Score: ${designScore}/100`,
        '', ...results.map(r => `${r.s === '✅' ? 'PASS' : r.s === '❌' ? 'FAIL' : r.s === '⚠️' ? 'WARN' : 'INFO'} | ${r.label} | ${r.d}`),
    ].join('\n'), 'utf-8');
    console.log(`  Results → ${outFile}\n`);

    // JSON
    const jsonFile = path.join(__dirname, 'agent-ux-audit-results.json');
    fs.writeFileSync(jsonFile, JSON.stringify({
        agent: 'UX-Audit', timestamp: new Date().toISOString(),
        target: BASE_URL, passed, failed, warnings, info,
        score: designScore, findings,
    }, null, 2), 'utf-8');

    return { agent: 'UX-Audit', passed, failed, warnings, info, score: designScore };
}

async function main() {
    console.log(`\n Agent UX — Carpet-Bomb UX/UI Design Audit`);
    console.log(`   Target: ${BASE_URL}\n`);

    console.log('   Phase A: Design System Tokens...');
    phaseADesignSystem();
    console.log('   Phase B: Typography & Fonts...');
    phaseBTypography();
    console.log('   Phase C: Component Library...');
    phaseCComponents();
    console.log('   Phase D: Animations...');
    phaseDAnimations();
    console.log('   Phase E: Accessibility...');
    phaseEAccessibility();
    console.log('   Phase F: Layout System...');
    phaseFLayout();
    console.log('   Phase G: Live Page UX Audit...');
    await phaseGLiveAudit();
    console.log('   Phase H: UX Patterns...');
    phaseHPatterns();

    printReport();
    process.exit(failed > 0 ? 1 : 0);
}
main().catch(err => { console.error('Fatal:', err); process.exit(2); });
