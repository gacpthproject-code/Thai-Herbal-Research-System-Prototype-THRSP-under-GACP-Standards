/**
 * Inline binary-ish assets for the API-mocked Playwright suite.
 *
 * The fixtures point document and audit-photo previews at paths like
 * `/mock/audit-photo-w1b.png` and `/api/documents/<id>`. Neither is served in
 * mock mode — `public/mock/` does not exist (404) and the documents API needs
 * a backend (503) — so every preview surface rendered a broken image, among
 * them the reviewer's 9-document iframe.
 *
 * Tests still passed, because they assert on DOM text and never asked whether
 * the image decoded. preview-integrity.spec.ts closes that: it checks
 * `naturalWidth`, which is 0 for a broken raster image.
 *
 * SVG rather than a base64 PNG blob: it is legible in a committed diff,
 * carries real text a human can read in a screenshot, and scales to any
 * preview box. Browsers render it in both `<img>` and `<iframe>`.
 */
import type { Page } from '@playwright/test';

/** A scanned-looking application document page. */
export function documentSvg(title = 'เอกสารประกอบคำขอ', subtitle = 'สำเนาบัตรประจำตัวประชาชน'): string {
  const lines = Array.from({ length: 11 }, (_, i) => {
    const y = 300 + i * 30;
    const w = i % 4 === 3 ? 250 : 430;
    return `<rect x="60" y="${y}" width="${w}" height="12" rx="4" fill="#e2e8f0"/>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="740" viewBox="0 0 560 740" role="img" aria-label="${title}">
  <rect width="560" height="740" fill="#94a3b8"/>
  <rect x="20" y="20" width="520" height="700" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
  <rect x="60" y="60" width="120" height="120" rx="6" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
  <circle cx="120" cy="108" r="26" fill="#cbd5e1"/>
  <path d="M78 168 q42 -44 84 0 z" fill="#cbd5e1"/>
  <text x="210" y="92" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0f172a">${title}</text>
  <text x="210" y="124" font-family="sans-serif" font-size="15" fill="#475569">${subtitle}</text>
  <text x="210" y="156" font-family="monospace" font-size="13" fill="#64748b">DOC-2569-W1B-0001</text>
  <line x1="60" y1="220" x2="500" y2="220" stroke="#0f172a" stroke-width="2"/>
  <text x="60" y="262" font-family="sans-serif" font-size="15" font-weight="bold" fill="#0f172a">รายละเอียดเอกสาร</text>
  ${lines}
  <rect x="330" y="640" width="170" height="60" rx="6" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="415" y="666" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#16a34a">ตรวจสอบแล้ว</text>
  <text x="415" y="686" text-anchor="middle" font-family="monospace" font-size="10" fill="#16a34a">E2E MOCK</text>
</svg>`;
}

/** An on-site inspection photo stand-in. */
export function auditPhotoSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420" role="img" aria-label="ภาพถ่ายการตรวจแปลง">
  <rect width="640" height="420" fill="#bae6fd"/>
  <rect y="250" width="640" height="170" fill="#65a30d"/>
  <circle cx="540" cy="80" r="42" fill="#fde047"/>
  <path d="M0 250 q160 -70 320 0 q160 -70 320 0 z" fill="#4d7c0f"/>
  <g fill="#166534">
    <rect x="90" y="238" width="8" height="60"/><ellipse cx="94" cy="232" rx="26" ry="18"/>
    <rect x="210" y="246" width="8" height="52"/><ellipse cx="214" cy="240" rx="24" ry="16"/>
    <rect x="330" y="240" width="8" height="58"/><ellipse cx="334" cy="234" rx="26" ry="18"/>
    <rect x="450" y="250" width="8" height="48"/><ellipse cx="454" cy="244" rx="22" ry="15"/>
  </g>
  <rect x="16" y="352" width="300" height="52" rx="6" fill="#0f172a" fill-opacity="0.72"/>
  <text x="30" y="374" font-family="monospace" font-size="13" fill="#ffffff">18.7883 N, 98.9853 E</text>
  <text x="30" y="394" font-family="monospace" font-size="12" fill="#e2e8f0">27 ก.ค. 2569 11:14 · E2E MOCK</text>
</svg>`;
}

function svgRoute(body: string) {
  return {
    status: 200,
    contentType: 'image/svg+xml; charset=utf-8',
    headers: { 'cache-control': 'no-store' },
    body,
  };
}

/**
 * Serve every preview URL the app requests in mock mode.
 *
 * Call BEFORE the page navigates. Safe to call more than once per page —
 * Playwright keeps the most recently registered matching handler.
 */
export async function installMockAssetRoutes(page: Page): Promise<void> {
  // Escape hatch for demonstrating the RED state. The guard lives here rather
  // than in the spec because the fixtures install these routes too — a
  // spec-level skip alone would still get them via `accountDtamMocks` and the
  // "broken preview" state would be unreachable.
  if (process.env.PREVIEW_NO_ASSET_ROUTES === '1') return;

  // Fixture-authored static paths under /mock/*.
  await page.route('**/mock/**', async (route) => {
    const url = route.request().url();
    if (/audit-photo/i.test(url)) return route.fulfill(svgRoute(auditPhotoSvg()));
    return route.fulfill(svgRoute(documentSvg()));
  });

  // Reviewer document iframe + any other document file endpoint.
  await page.route('**/api/documents/**', async (route) => route.fulfill(svgRoute(documentSvg())));
  await page.route('**/api/applications/*/documents/*/file*', async (route) =>
    route.fulfill(svgRoute(documentSvg())));
}
