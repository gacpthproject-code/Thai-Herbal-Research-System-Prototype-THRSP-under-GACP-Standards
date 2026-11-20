#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * Agent UX Page Score v2 — Hybrid SSR + Source Code Analysis
 * ═══════════════════════════════════════════════════════════════
 * Scores every page on the GACP platform using TWO data sources:
 *
 *   A) LIVE HTML from server (SSR shell) — tests SEO, meta, structure
 *   B) SOURCE CODE from file system     — tests Tailwind, components,
 *                                          responsive, animation, a11y
 *
 * This eliminates the "SSR gap" where client-rendered components
 * don't show their Tailwind classes in the HTML response.
 *
 * 10 Scoring Categories (10pts each = 100 total):
 *   1. HTML Structure      — DOCTYPE, lang, semantic elements
 *   2. SEO & Meta          — title, description, OG, viewport
 *   3. Typography          — font, heading hierarchy, text sizes
 *   4. Tailwind Density    — Tailwind class usage in source code
 *   5. Component Quality   — shadcn, icons, custom components
 *   6. Accessibility       — aria, alt, roles, labels
 *   7. Responsive Design   — sm:/md:/lg: breakpoints in source
 *   8. Animation & Polish  — transitions, hover, motion
 *   9. Interactivity       — buttons, forms, events, cursor
 *  10. Page Weight & Perf  — size, inline styles, loading
 *
 * Usage: node scripts/test/agent-ux-page-score.js
 */
const fs = require('fs');
const path = require('path');
const BASE_URL = process.argv[2] || 'https://gacpth.com';
const SRC = path.join(__dirname, '..', '..', 'apps', 'web-app', 'src');

// ── All pages with their source file mappings ──
// Auth login pages re-export the main login — so we resolve to the actual component
const WIZARD_PAGE = 'app/health/applications/new-legacy/step/[id]/page.tsx';
const WIZARD_STEPS = 'app/health/applications/new-legacy/steps';

const PAGES = [
  // Public
  { path: '/', group: 'Public', label: 'Landing / Splash', src: 'app/page.tsx', deps: ['components/runtime/splash-view.tsx'] },
  { path: '/login', group: 'Public', label: 'Login', src: 'app/(auth)/login/page.tsx', deps: [] },
  { path: '/register', group: 'Public', label: 'Register', src: 'app/(auth)/register/page.tsx', deps: [] },
  { path: '/verify', group: 'Public', label: 'Verifier Portal', src: 'app/verify/page.tsx', deps: ['components/feature/trust-verifier-portal.tsx'] },
  { path: '/trace', group: 'Public', label: 'Trace Portal', src: 'app/trace/page.tsx', deps: ['components/feature/trace-portal.tsx'] },
  { path: '/privacy', group: 'Public', label: 'Privacy Policy', src: 'app/privacy/page.tsx', deps: [] },
  { path: '/terms', group: 'Public', label: 'Terms', src: 'app/terms/page.tsx', deps: [] },
  // Auth (re-exports → resolve to actual login component)
  { path: '/auth/health/login', group: 'Auth', label: 'Health Login', src: 'app/auth/health/login/page.tsx', deps: ['app/(auth)/login/page.tsx'] },
  { path: '/auth/provider/login', group: 'Auth', label: 'Provider Login', src: 'app/auth/provider/login/page.tsx', deps: ['app/provider/login/page.tsx'] },
  // Health Portal
  { path: '/health/dashboard', group: 'Health', label: 'Dashboard', src: 'app/health/dashboard/page.tsx', deps: [] },
  { path: '/health/applications', group: 'Health', label: 'Applications', src: 'app/health/applications/page.tsx', deps: [] },
  { path: '/health/applications/new', group: 'Health', label: 'New Application', src: 'app/health/applications/new/page.tsx', deps: ['app/health/applications/new-legacy/step/[id]/page.tsx', 'app/health/applications/new-legacy/steps/consent-step.tsx'] },
  { path: '/health/certificates', group: 'Health', label: 'Certificates', src: 'app/health/certificates/page.tsx', deps: [] },
  { path: '/health/planting', group: 'Health', label: 'Planting', src: 'app/health/planting/page.tsx', deps: [] },
  { path: '/health/profile', group: 'Health', label: 'Profile', src: 'app/health/profile/page.tsx', deps: [] },
  { path: '/health/tracking', group: 'Health', label: 'Tracking', src: 'app/health/tracking/page.tsx', deps: [] },
  { path: '/health/sop-builder', group: 'Health', label: 'SOP Builder', src: 'app/health/sop-builder/page.tsx', deps: [] },
  { path: '/health/notifications', group: 'Health', label: 'Notifications', src: 'app/health/notifications/page.tsx', deps: [] },
  // Application Wizard Steps (corrected file names matching actual files)
  { path: '/health/applications/new-legacy/step/1', group: 'Wizard', label: 'Step 1 ยินยอม', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/consent-step.tsx`] },
  { path: '/health/applications/new-legacy/step/2', group: 'Wizard', label: 'Step 2 เลือกพืช', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/plant-selection-step.tsx`] },
  { path: '/health/applications/new-legacy/step/3', group: 'Wizard', label: 'Step 3 วัตถุประสงค์', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/purpose-step.tsx`] },
  { path: '/health/applications/new-legacy/step/4', group: 'Wizard', label: 'Step 4 ข้อมูลทั่วไป', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/general-step.tsx`] },
  { path: '/health/applications/new-legacy/step/5', group: 'Wizard', label: 'Step 5 ข้อมูลแปลง', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/farm-info-step.tsx`] },
  { path: '/health/applications/new-legacy/step/6', group: 'Wizard', label: 'Step 6 การผลิต', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/production-info-step.tsx`] },
  { path: '/health/applications/new-legacy/step/7', group: 'Wizard', label: 'Step 7 คุณภาพ', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/quality-control-step.tsx`] },
  { path: '/health/applications/new-legacy/step/8', group: 'Wizard', label: 'Step 8 หลักฐาน', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/documents-step.tsx`] },
  { path: '/health/applications/new-legacy/step/9', group: 'Wizard', label: 'Step 9 ตรวจทาน', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/review-step.tsx`] },
  { path: '/health/applications/new-legacy/step/10', group: 'Wizard', label: 'Step 10 ใบเสนอราคา', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/quote-step.tsx`] },
  { path: '/health/applications/new-legacy/step/11', group: 'Wizard', label: 'Step 11 ใบแจ้งหนี้', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/invoice-step.tsx`] },
  { path: '/health/applications/new-legacy/step/12', group: 'Wizard', label: 'Step 12 สำเร็จ', src: WIZARD_PAGE, deps: [`${WIZARD_STEPS}/success-step.tsx`] },
  // Provider Portal (only pages that actually exist)
  { path: '/provider/dashboard', group: 'Provider', label: 'Dashboard', src: 'app/provider/dashboard/page.tsx', deps: [] },
  { path: '/provider/applications', group: 'Provider', label: 'Applications', src: 'app/provider/applications/page.tsx', deps: [] },
  { path: '/provider/audits', group: 'Provider', label: 'Audits', src: 'app/provider/audits/page.tsx', deps: [] },
  { path: '/provider/certificates', group: 'Provider', label: 'Certificates', src: 'app/provider/certificates/page.tsx', deps: [] },
  { path: '/provider/calendar', group: 'Provider', label: 'Calendar', src: 'app/provider/calendar/page.tsx', deps: [] },
  { path: '/provider/profile', group: 'Provider', label: 'Profile', src: 'app/provider/profile/page.tsx', deps: [] },
  { path: '/provider/coordinator', group: 'Provider', label: 'Coordinator', src: 'app/provider/coordinator/page.tsx', deps: [] },
  { path: '/provider/reports', group: 'Provider', label: 'Reports', src: 'app/provider/reports/page.tsx', deps: [] },
  { path: '/provider/accounting', group: 'Provider', label: 'Accounting', src: 'app/provider/accounting/page.tsx', deps: [] },
  { path: '/provider/analytics', group: 'Provider', label: 'Analytics', src: 'app/provider/analytics/page.tsx', deps: [] },
  { path: '/provider/planting', group: 'Provider', label: 'Planting', src: 'app/provider/planting/page.tsx', deps: [] },
  { path: '/provider/settings', group: 'Provider', label: 'Settings', src: 'app/provider/settings/page.tsx', deps: ['app/provider/settings/system/page.tsx'] },
  // Admin
  { path: '/admin/dashboard', group: 'Admin', label: 'Dashboard', src: 'app/admin/dashboard/page.tsx', deps: [] },
  { path: '/admin/users', group: 'Admin', label: 'Users', src: 'app/admin/users/page.tsx', deps: ['app/provider/management/page.tsx'] },
  { path: '/admin/settings', group: 'Admin', label: 'Settings', src: 'app/admin/settings/page.tsx', deps: [] },
  { path: '/admin/communication', group: 'Admin', label: 'Communication', src: 'app/admin/communication/page.tsx', deps: [] },
  { path: '/admin/planting', group: 'Admin', label: 'Planting', src: 'app/admin/planting/page.tsx', deps: [] },
];

// ═══════════════════════════════════════════════════════════
// READ SOURCE CODE (page + deps combined)
// ═══════════════════════════════════════════════════════════

function readSource(pg) {
  let combined = '';
  try { combined += fs.readFileSync(path.join(SRC, pg.src), 'utf-8'); } catch {}
  for (const dep of (pg.deps || [])) {
    try { combined += '\n' + fs.readFileSync(path.join(SRC, dep), 'utf-8'); } catch {}
  }
  return combined;
}

// ═══════════════════════════════════════════════════════════
// SCORING FUNCTIONS (each returns 0-10)
// Each uses hybrid: both HTML + source code
// ═══════════════════════════════════════════════════════════

function scoreStructure(html, src) {
  let s = 0;
  const all = html + '\n' + src;
  if (/<!DOCTYPE\s+html>/i.test(html)) s += 1;
  if (/<html[^>]*lang=/i.test(html)) s += 1;
  if (/<head[\s>]/i.test(html)) s += 1;
  if (/<main[\s>]/i.test(all) || /role="main"/i.test(all)) s += 1;
  if (/<header[\s>]/i.test(all) || /<nav[\s>]/i.test(all)) s += 1;
  if (/<footer[\s>]/i.test(all)) s += 1;
  if (/<section[\s>]/i.test(all) || /<article[\s>]/i.test(all)) s += 1;
  if (/<h1[\s>]/i.test(all) || /<h2[\s>]/i.test(all)) s += 1;
  if (/<div[\s>]/i.test(src)) s += 1;
  if (src.length > 100) s += 1; // Has meaningful source
  return Math.min(10, s);
}

function scoreSeoMeta(html, src) {
  let s = 0;
  if (/<title[^>]*>.{3,}<\/title>/i.test(html)) s += 2;
  if (/meta[^>]*description/i.test(html) || /description:/i.test(src)) s += 2;
  if (/meta[^>]*charset/i.test(html)) s += 1;
  if (/meta[^>]*viewport/i.test(html) || /metadata/i.test(src)) s += 2;
  if (/Metadata/i.test(src)) s += 1; // Next.js Metadata export
  if (/<link[^>]*icon/i.test(html)) s += 1;
  if (/title:/i.test(src)) s += 1;
  return Math.min(10, s);
}

function scoreTypography(html, src) {
  let s = 0;
  const all = html + '\n' + src;
  if (/Prompt/i.test(all)) s += 2;
  if (/font-bold|font-semibold|font-extrabold|font-medium/i.test(all)) s += 2;
  if (/text-sm|text-xs|text-lg|text-xl|text-2xl|text-3xl|text-4xl/i.test(all)) s += 2;
  if (/tracking-|leading-|line-clamp/i.test(all)) s += 1;
  if (/<h1[\s>]|<h2[\s>]|<h3[\s>]/i.test(all)) s += 1;
  if (/text-muted|text-foreground|text-primary/i.test(all)) s += 1;
  if (/truncate|whitespace-/i.test(all)) s += 1;
  return Math.min(10, s);
}

function scoreTailwind(html, src) {
  let s = 0;
  const all = html + '\n' + src;
  const patterns = [
    { re: /\bflex\b|\bgrid\b|\bgap-|\bspace-/g, weight: 1 },
    { re: /\bp-\d|\bpx-|\bpy-|\bpt-|\bpb-|\bpl-|\bpr-|\bm-\d|\bmx-|\bmy-/g, weight: 1 },
    { re: /\brounded|\bborder|\bshadow/g, weight: 1 },
    { re: /\bbg-|\btext-|\bfrom-|\bto-|\bvia-/g, weight: 1 },
    { re: /\bw-|\bh-|\bmin-|\bmax-/g, weight: 1 },
    { re: /\bitems-|\bjustify-|\bself-/g, weight: 1 },
  ];
  let totalMatches = 0;
  for (const p of patterns) totalMatches += (all.match(p.re) || []).length;

  // Absolute tailwind density
  if (totalMatches > 150) s += 5;
  else if (totalMatches > 80) s += 4;
  else if (totalMatches > 40) s += 3;
  else if (totalMatches > 15) s += 2;
  else if (totalMatches > 5) s += 1;

  // Per-line density bonus (normalizes for page size)
  const lineCount = Math.max(1, src.split('\n').length);
  const density = totalMatches / lineCount;
  if (density > 0.8) s += 2;
  else if (density > 0.4) s += 1;

  // Design token usage
  if (/bg-primary|bg-card|bg-muted|bg-background|bg-accent/i.test(all)) s += 1;
  if (/hsl\(var\(--|var\(--/i.test(all)) s += 1;
  if (/className=/i.test(src)) s += 1;
  return Math.min(10, s);
}

function scoreComponents(html, src) {
  let s = 0;
  const all = html + '\n' + src;
  // Import analysis
  const imports = (src.match(/import\s+.*from\s+['"]@\/components/g) || []).length;
  if (imports >= 5) s += 3;
  else if (imports >= 2) s += 2;
  else if (imports >= 1) s += 1;

  // shadcn / custom components
  if (/Card|CardContent|CardHeader/i.test(src)) s += 1;
  if (/Button/i.test(src)) s += 1;
  if (/Badge|Alert|Input|Select|Checkbox/i.test(src)) s += 1;
  if (/Lucide|lucide|Icon/i.test(src)) s += 1;
  if (/Skeleton|spinner|Loading/i.test(all)) s += 1;
  if (/Dialog|Modal|Sheet|Popover|Tooltip/i.test(src)) s += 1;
  if (/Table|DataTable|Tabs|Accordion/i.test(src)) s += 1;
  return Math.min(10, s);
}

function scoreAccessibility(html, src) {
  let s = 0;
  const all = html + '\n' + src;
  if (/aria-label/i.test(all)) s += 2;
  if (/aria-hidden|aria-expanded|aria-selected|aria-describedby/i.test(all)) s += 1;
  if (/role="/i.test(all)) s += 1;
  if (/alt="|alt='/i.test(all)) s += 1;
  if (/sr-only|visually-hidden/i.test(all)) s += 1;
  if (/focus-visible|focus:/i.test(all)) s += 1;
  if (/<label[\s>]|htmlFor|Label/i.test(all)) s += 1;
  if (/disabled|isDisabled/i.test(all)) s += 1;
  if (/tabIndex|tabindex/i.test(all)) s += 1;
  return Math.min(10, s);
}

function scoreResponsive(html, src) {
  let s = 0;
  const all = html + '\n' + src;

  // ── Tailwind breakpoints ──
  const bps = { 'sm:': 0, 'md:': 0, 'lg:': 0, 'xl:': 0, '2xl:': 0 };
  for (const bp of Object.keys(bps)) {
    bps[bp] = (all.match(new RegExp(bp.replace(':', '\\:'), 'g')) || []).length;
  }
  const twTotal = Object.values(bps).reduce((a, b) => a + b, 0);

  if (twTotal > 30) s += 5;
  else if (twTotal > 15) s += 4;
  else if (twTotal > 8) s += 3;
  else if (twTotal > 3) s += 2;
  else if (twTotal > 0) s += 1;

  // ── CSS-based responsive patterns (gov-auth, @media, containers) ──
  let cssResp = 0;
  // Government auth responsive layout classes
  if (/gov-auth-page|gov-auth-mobile-header|gov-auth-hero|gov-auth-form-panel/i.test(all)) cssResp += 3;
  // @media queries or responsive CSS references
  if (/@media\s*\(|@screen\s/i.test(all)) cssResp += 2;
  // Container-based responsive layouts (ProviderLayout, Container, etc.)
  if (/ProviderLayout|AdminLayout|Container\s/i.test(all)) cssResp += 1;
  // Flex-wrap responsive patterns (programmatic responsive)
  if (/flex-wrap|flex-col\s+\w+:flex-row|flex\s+flex-col/i.test(all)) cssResp += 1;
  s += Math.min(4, cssResp);

  // ── Responsive utility patterns ──
  if (/hidden\s+\w+:|block\s+\w+:/i.test(all)) s += 1;
  if (/grid-cols-.*\w+:grid-cols|grid\s.*gap/i.test(all)) s += 1;
  if (/overflow-x-auto|overflow-auto|overflow-hidden/i.test(all)) s += 1;
  if (/min-h-screen|min-h-\[|max-w-\[|max-w-\d/i.test(all)) s += 1;
  return Math.min(10, s);
}

function scoreAnimation(html, src) {
  let s = 0;
  const all = html + '\n' + src;
  if (/animate-|@keyframes/i.test(all)) s += 1;
  if (/transition-|duration-|ease-/i.test(all)) s += 2;
  if (/hover:/i.test(all)) s += 2;
  if (/framer-motion|motion\.|useAnimation|AnimatePresence/i.test(all)) s += 2;
  if (/group-hover|active:|focus:/i.test(all)) s += 1;
  if (/card-hover|btn-press|glass-card|glass-panel/i.test(all)) s += 1;
  if (/scale-|rotate-|translate-|transform/i.test(all)) s += 1;
  return Math.min(10, s);
}

function scoreInteractivity(html, src) {
  let s = 0;
  const all = html + '\n' + src;
  if (/<button|Button/i.test(all)) s += 2;
  if (/<a[\s>]|Link|href/i.test(all)) s += 1;
  if (/<input|<textarea|<select|Input|Select|Checkbox/i.test(all)) s += 2;
  if (/<form|onSubmit|handleSubmit/i.test(all)) s += 1;
  if (/onClick|onChange|onBlur|handleClick/i.test(all)) s += 1;
  if (/cursor-pointer/i.test(all)) s += 1;
  if (/useState|useEffect|useReducer|useCallback/i.test(src)) s += 1;
  if (/toast|notification|Alert/i.test(all)) s += 1;
  return Math.min(10, s);
}

function scorePerformance(html, src) {
  let s = 10;
  const size = html.length;
  const inlineStyles = (src.match(/style=\{/g) || []).length;
  const codeSize = src.length;

  // Deductions
  if (size > 500000) s -= 3;
  else if (size > 200000) s -= 1;
  if (size < 5000) s -= 2; // Very small SSR shell OK for Next.js
  if (inlineStyles > 15) s -= 2;
  else if (inlineStyles > 8) s -= 1;
  if (codeSize > 50000) s -= 1; // Very large component

  // Bonuses for good practices
  if (/Suspense|lazy|dynamic/i.test(src)) s += 1;
  if (/Image|next\/image/i.test(src)) s += 1;
  if (/loading="lazy"|priority/i.test(src)) s += 1;
  if (/Skeleton|loading/i.test(src)) s += 1;
  return Math.max(0, Math.min(10, s));
}

// ═══════════════════════════════════════════════════════════
// SCORING ENGINE
// ═══════════════════════════════════════════════════════════

async function fetchPage(urlPath) {
  try {
    let res = await fetch(`${BASE_URL}${urlPath}`, { redirect: 'manual' });
    if ([301, 302, 307, 308].includes(res.status) && res.headers.get('location')) {
      let loc = new URL(res.headers.get('location'), `${BASE_URL}${urlPath}`).href;
      res = await fetch(loc);
    }
    return { status: res.status, html: await res.text() };
  } catch (e) {
    return { status: 0, html: '', error: e.message };
  }
}

async function scorePage(pg) {
  const { status, html, error } = await fetchPage(pg.path);
  const src = readSource(pg);

  if (error) {
    return { ...pg, status, total: 0, scores: {}, grade: 'F', error, srcLines: 0 };
  }

  const scores = {
    structure: scoreStructure(html, src),
    seo: scoreSeoMeta(html, src),
    typography: scoreTypography(html, src),
    tailwind: scoreTailwind(html, src),
    components: scoreComponents(html, src),
    accessibility: scoreAccessibility(html, src),
    responsive: scoreResponsive(html, src),
    animation: scoreAnimation(html, src),
    interactivity: scoreInteractivity(html, src),
    performance: scorePerformance(html, src),
  };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const grade = total >= 90 ? 'A+' : total >= 80 ? 'A' : total >= 70 ? 'B+' :
                total >= 60 ? 'B' : total >= 50 ? 'C' : total >= 40 ? 'D' : 'F';
  const srcLines = src.split('\n').length;

  return { ...pg, status, total, scores, grade, size: html.length, srcLines };
}

// ═══════════════════════════════════════════════════════════
// HTML DASHBOARD GENERATOR
// ═══════════════════════════════════════════════════════════

function gradeColor(grade) {
  return { 'A+': '#22c55e', 'A': '#4ade80', 'B+': '#84cc16', 'B': '#eab308', 'C': '#f97316', 'D': '#ef4444', 'F': '#dc2626' }[grade] || '#94a3b8';
}

function generateDashboard(results, avgScore) {
  const groups = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  }
  const overallGrade = avgScore >= 90 ? 'A+' : avgScore >= 80 ? 'A' : avgScore >= 70 ? 'B+' : avgScore >= 60 ? 'B' : avgScore >= 50 ? 'C' : 'D';
  const categories = ['structure', 'seo', 'typography', 'tailwind', 'components', 'accessibility', 'responsive', 'animation', 'interactivity', 'performance'];

  const groupRows = Object.entries(groups).map(([group, pages]) => {
    const avg = Math.round(pages.reduce((s, p) => s + p.total, 0) / pages.length);
    const grade = avg >= 90 ? 'A+' : avg >= 80 ? 'A' : avg >= 70 ? 'B+' : avg >= 60 ? 'B' : avg >= 50 ? 'C' : 'D';
    const rows = pages.sort((a, b) => b.total - a.total).map(p => {
      const bars = categories.map(k => {
        const v = p.scores?.[k] || 0;
        const col = v >= 8 ? '#22c55e' : v >= 5 ? '#eab308' : '#ef4444';
        return `<div class="sb"><span class="sl">${k.slice(0,4)}</span><div class="sbg"><div class="sbf" style="width:${v*10}%;background:${col}"></div></div><span class="sv">${v}</span></div>`;
      }).join('');
      return `<tr class="pr" onclick="this.classList.toggle('ex')">
        <td class="pp">${p.path}</td><td class="pl">${p.label}</td><td><span class="sb2" style="background:${gradeColor(p.grade)}">${p.total}</span></td>
        <td class="pg" style="color:${gradeColor(p.grade)}">${p.grade}</td><td class="ps">${p.srcLines || 0}</td>
      </tr><tr class="dr"><td colspan="5"><div class="sg">${bars}</div></td></tr>`;
    }).join('');
    return `<div class="gs"><div class="gh"><h2>${group}</h2><span class="ga" style="background:${gradeColor(grade)}">${avg}/100 (${grade})</span><span class="gc">${pages.length} pages</span></div>
    <table><thead><tr><th>Path</th><th>Page</th><th>Score</th><th>Grade</th><th>Lines</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join('');

  // Category radar data
  const catAvgs = categories.map(c => ((results.reduce((s, r) => s + (r.scores?.[c] || 0), 0) / results.length) * 10).toFixed(0));

  return `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>GACP UX/UI Per-Page Score — v2</title>
<style>
/* No webfont <link> here. This report is generated locally and opened in a
   browser, so a Google Fonts link would have sent the reviewer's IP to Google
   every time they opened it. The platform self-hosts its fonts (@fontsource)
   and an internal tool is no reason to make an exception, so the report uses
   whatever Thai-capable font the reviewer's system already has. */
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Prompt','Sarabun','Noto Sans Thai',system-ui,-apple-system,'Segoe UI',sans-serif;background:#0a0f1e;color:#e2e8f0;padding:1.5rem 2rem;line-height:1.5}
.hero{text-align:center;padding:2rem 0 1.5rem;position:relative}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(34,197,94,0.08) 0%,transparent 60%);pointer-events:none}
.hero h1{font-size:1.5rem;font-weight:700;background:linear-gradient(135deg,#22c55e,#eab308,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-0.02em}
.hero .ov{font-size:5rem;font-weight:800;color:${gradeColor(overallGrade)};text-shadow:0 0 40px ${gradeColor(overallGrade)}30;line-height:1.1}
.hero .sub{color:#64748b;font-size:0.8rem;margin-top:0.5rem}
.hero .method{display:inline-flex;gap:0.5rem;margin-top:0.75rem;background:#1e293b;border:1px solid #334155;border-radius:9999px;padding:0.25rem 1rem;font-size:0.7rem;color:#94a3b8}
.hero .method b{color:#22c55e}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin:1.5rem auto;max-width:900px}
.card{background:#1e293b;border:1px solid #334155;border-radius:0.75rem;padding:1rem;text-align:center}
.card .v{font-size:1.75rem;font-weight:800;color:#22c55e}.card .l{font-size:0.65rem;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-top:0.25rem}
.cats{max-width:700px;margin:1.5rem auto;display:grid;grid-template-columns:1fr 1fr;gap:0.25rem 1.5rem}
.cat-item{display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;padding:0.25rem 0}
.cat-label{width:90px;text-transform:capitalize;color:#94a3b8;font-weight:500}
.cat-bar-bg{flex:1;height:8px;background:#1e293b;border-radius:4px;overflow:hidden;border:1px solid #334155}
.cat-bar-f{height:100%;border-radius:4px;transition:width 0.6s}
.cat-val{width:28px;text-align:right;font-weight:700;font-size:0.8rem}
.gs{margin:2rem 0}.gh{display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;padding:0.5rem 0;border-bottom:2px solid #1e293b}
.gh h2{font-size:1rem;font-weight:600}.ga{padding:2px 10px;border-radius:9999px;font-size:0.7rem;font-weight:700;color:#fff}
.gc{color:#475569;font-size:0.7rem;margin-left:auto}
table{width:100%;border-collapse:collapse}thead th{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.06em;color:#475569;padding:0.5rem 0.75rem;text-align:left;border-bottom:1px solid #1e293b}
.pr{cursor:pointer;transition:background 0.15s}.pr:hover{background:#141b2d}.pr td{padding:0.5rem 0.75rem;border-bottom:1px solid #141b2d;font-size:0.8rem}
.pp{font-family:'Courier New',monospace;font-size:0.7rem;color:#64748b}.pl{font-weight:500}
.sb2{display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:1.5rem;border-radius:6px;color:#fff;font-size:0.75rem;font-weight:700}
.pg{font-weight:800;font-size:1rem}.ps{color:#475569;font-size:0.7rem}
.dr{display:none}.pr.ex+.dr{display:table-row}.dr td{padding:0.5rem 0.75rem;background:#141b2d;border-bottom:1px solid #1e293b}
.sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:3px}
.sb{display:flex;align-items:center;gap:4px;font-size:0.65rem}.sl{width:32px;color:#64748b;text-transform:uppercase}
.sbg{flex:1;height:5px;background:#1e293b;border-radius:3px;overflow:hidden}.sbf{height:100%;border-radius:3px}
.sv{width:14px;text-align:right;font-weight:600;font-size:0.7rem}
.ts{text-align:center;color:#334155;font-size:0.65rem;margin-top:2rem;padding:1rem 0}
@media(max-width:640px){.sg{grid-template-columns:1fr}.cards{grid-template-columns:repeat(2,1fr)}.cats{grid-template-columns:1fr}}
</style></head><body>
<div class="hero">
  <h1>🎨 GACP Per-Page UX/UI Score</h1>
  <div class="ov">${avgScore}</div>
  <div class="sub">Average across ${results.length} pages • Grade: ${overallGrade}</div>
  <div class="method"><b>Hybrid v2</b> SSR HTML + Source Code Analysis</div>
</div>
<div class="cards">
  <div class="card"><div class="v">${results.length}</div><div class="l">Pages</div></div>
  <div class="card"><div class="v" style="color:${gradeColor('A+')}">${results.filter(r=>r.total>=90).length}</div><div class="l">A+ Pages</div></div>
  <div class="card"><div class="v" style="color:${gradeColor('A')}">${results.filter(r=>r.total>=80).length}</div><div class="l">A+ & A Pages</div></div>
  <div class="card"><div class="v">${Math.max(...results.map(r=>r.total))}</div><div class="l">Highest</div></div>
  <div class="card"><div class="v" style="color:#f97316">${Math.min(...results.map(r=>r.total))}</div><div class="l">Lowest</div></div>
  <div class="card"><div class="v">${results.reduce((s,r)=> s + (r.srcLines||0), 0).toLocaleString()}</div><div class="l">Total Lines</div></div>
</div>
<h3 style="text-align:center;font-size:0.85rem;color:#94a3b8;margin:1.5rem 0 0.5rem">Category Averages</h3>
<div class="cats">${categories.map((c, i) => {
  const avg = parseFloat(catAvgs[i]);
  const col = avg >= 80 ? '#22c55e' : avg >= 50 ? '#eab308' : '#ef4444';
  return `<div class="cat-item"><span class="cat-label">${c}</span><div class="cat-bar-bg"><div class="cat-bar-f" style="width:${avg}%;background:${col}"></div></div><span class="cat-val" style="color:${col}">${(avg/10).toFixed(1)}</span></div>`;
}).join('')}</div>
${groupRows}
<div class="ts">Generated: ${new Date().toISOString()} • ${BASE_URL} • Hybrid v2 (SSR + Source)</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

function barChart(val, max = 10) {
  const filled = Math.round((val / max) * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

async function main() {
  console.log(`\n Agent UX Page Score v2 — Hybrid SSR + Source Code Analysis`);
  console.log(`   Target:  ${BASE_URL}`);
  console.log(`   Source:  ${SRC}`);
  console.log(`   Pages:   ${PAGES.length}`);
  console.log(`   Method:  SSR HTML + Source Code (dual analysis)\n`);

  const results = [];
  const categories = ['structure', 'seo', 'typography', 'tailwind', 'components', 'accessibility', 'responsive', 'animation', 'interactivity', 'performance'];

  for (let i = 0; i < PAGES.length; i++) {
    const pg = PAGES[i];
    process.stdout.write(`   [${String(i + 1).padStart(2)}/${PAGES.length}] ${pg.path.padEnd(50)} `);
    const result = await scorePage(pg);
    results.push(result);
    const emoji = result.total >= 90 ? '🏆' : result.total >= 80 ? '✅' : result.total >= 70 ? '🟢' : result.total >= 60 ? '🟡' : result.total >= 50 ? '🟠' : '🔴';
    console.log(`${emoji} ${result.total}/100 (${result.grade}) [${result.srcLines || 0} lines]`);
  }

  const avgScore = Math.round(results.reduce((s, r) => s + r.total, 0) / results.length);
  const overallGrade = avgScore >= 90 ? 'A+' : avgScore >= 80 ? 'A' : avgScore >= 70 ? 'B+' : avgScore >= 60 ? 'B' : avgScore >= 50 ? 'C' : 'D';

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║ Per-Page UX/UI Score Report v2 (Hybrid: SSR + Source Code) ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\n  Average:  ${avgScore}/100 (${overallGrade})`);
  console.log(`  Pages:    ${results.length}`);
  console.log(`  Method:   Hybrid — SSR HTML + Source Code Analysis`);
  console.log(`  Target:   ${BASE_URL}`);
  console.log(`  Date:     ${new Date().toISOString()}\n`);

  // Grade distribution
  console.log('  GRADE DISTRIBUTION:');
  for (const g of ['A+', 'A', 'B+', 'B', 'C', 'D', 'F']) {
    const count = results.filter(r => r.grade === g).length;
    if (count > 0) {
      const bar = '█'.repeat(Math.ceil((count / results.length) * 40));
      console.log(`    ${g.padEnd(3)} ${bar} ${count}`);
    }
  }

  // Category averages
  console.log('\n  CATEGORY AVERAGES (out of 10):');
  for (const cat of categories) {
    const avg = (results.reduce((s, r) => s + (r.scores?.[cat] || 0), 0) / results.length).toFixed(1);
    console.log(`    ${cat.padEnd(15)} ${barChart(parseFloat(avg))} ${avg}`);
  }

  // Group averages
  console.log('\n  GROUP AVERAGES:');
  const groups = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  }
  for (const [group, pages] of Object.entries(groups)) {
    const avg = Math.round(pages.reduce((s, p) => s + p.total, 0) / pages.length);
    const grade = avg >= 90 ? 'A+' : avg >= 80 ? 'A' : avg >= 70 ? 'B+' : avg >= 60 ? 'B' : avg >= 50 ? 'C' : 'D';
    console.log(`    ${group.padEnd(12)} ${avg}/100 (${grade}) — ${pages.length} pages`);
  }

  // Top & Bottom
  const sorted = [...results].sort((a, b) => b.total - a.total);
  console.log('\n TOP 5 PAGES:');
  for (const r of sorted.slice(0, 5)) console.log(`    ${r.total}/100 ${r.grade.padEnd(3)} ${r.path} (${r.srcLines} lines)`);
  console.log('\n BOTTOM 5 PAGES:');
  for (const r of sorted.slice(-5).reverse()) console.log(`    ${r.total}/100 ${r.grade.padEnd(3)} ${r.path} (${r.srcLines} lines)`);

  // Per-page table
  console.log('\n  ── PER-PAGE SCORES ──');
  console.log(`  ${'Path'.padEnd(50)} ${'Score'.padStart(5)} ${'Grade'.padEnd(5)} ${'Lines'.padStart(6)}`);
  console.log(`  ${'─'.repeat(50)} ${'─'.repeat(5)} ${'─'.repeat(5)} ${'─'.repeat(6)}`);
  for (const r of results) console.log(`  ${r.path.padEnd(50)} ${String(r.total).padStart(5)} ${r.grade.padEnd(5)} ${String(r.srcLines||0).padStart(6)}`);
  console.log('');

  // Save results
  const outDir = __dirname;
  const txtFile = path.join(outDir, 'agent-ux-page-score-results.txt');
  fs.writeFileSync(txtFile, [
    'GACP UX/UI Per-Page Score Report v2',
    `Target: ${BASE_URL}`, `Date: ${new Date().toISOString()}`,
    `Method: Hybrid (SSR HTML + Source Code)`,
    `Average: ${avgScore}/100 (${overallGrade})`, `Pages: ${results.length}`, '',
    'Path | Score | Grade | Struct | SEO | Typo | TW | Comp | A11y | Resp | Anim | Inter | Perf | Lines',
    ...results.map(r => {
      const s = r.scores || {};
      return `${r.path} | ${r.total} | ${r.grade} | ${s.structure||0} | ${s.seo||0} | ${s.typography||0} | ${s.tailwind||0} | ${s.components||0} | ${s.accessibility||0} | ${s.responsive||0} | ${s.animation||0} | ${s.interactivity||0} | ${s.performance||0} | ${r.srcLines||0}`;
    }),
  ].join('\n'), 'utf-8');
  console.log(`Text → ${txtFile}`);

  const jsonFile = path.join(outDir, 'agent-ux-page-score-results.json');
  fs.writeFileSync(jsonFile, JSON.stringify({
    agent: 'UX-Page-Score-v2', timestamp: new Date().toISOString(),
    target: BASE_URL, method: 'Hybrid SSR + Source Code',
    averageScore: avgScore, overallGrade, totalPages: results.length,
    results: results.map(r => ({ path: r.path, group: r.group, label: r.label, total: r.total, grade: r.grade, scores: r.scores, srcLines: r.srcLines })),
  }, null, 2), 'utf-8');
  console.log(`JSON → ${jsonFile}`);

  const htmlFile = path.join(outDir, 'ux-page-score-dashboard.html');
  fs.writeFileSync(htmlFile, generateDashboard(results, avgScore), 'utf-8');
  console.log(`Dashboard → ${htmlFile}\n`);

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
