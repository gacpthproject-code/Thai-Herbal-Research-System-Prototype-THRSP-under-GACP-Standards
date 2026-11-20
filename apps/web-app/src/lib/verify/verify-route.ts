import { toCertificateSlug } from './public-verify-url';

/**
 * Where a typed certificate number goes. `TH-GACP 1/2569` carries a space and a
 * slash, so it travels as its slug `TH-GACP-1-2569`; legacy `GACP-TH-…` and
 * `GACP-DTAM-…` numbers are already URL-safe and pass through. The backend maps
 * every spelling back to the stored number (certificate-number-display.js).
 */
export function verifyPathFor(typed: string): string | null {
  const trimmed = String(typed ?? '').trim().replace(/\s+/g, ' ');
  // Dots alone are no number, and /verify/.. resolves to the home page.
  if (!trimmed || /^\.+$/.test(trimmed)) return null;
  return `/verify/${encodeURIComponent(toCertificateSlug(trimmed))}`;
}

/**
 * `otherHost` is set when the scanned URL names a host other than this site, so the
 * page can say so before opening the same path here (security review L3).
 */
export type ScanRoute = { kind: 'path'; path: string; otherHost: string | null } | { kind: 'foreign' };

/** Paths a GACP QR may point at: a certificate check or a product trace page. */
const OWN_QR_PATH = /^\/(verify|trace)\/[^/]/;

/** Text that is a link of some kind (a scheme, or a path) and so cannot be a certificate number. */
const LINK_SHAPED = /^(?:[a-z][a-z0-9+.-]*:|[\\/])/i;

/**
 * Where a scanned QR goes. Only an http(s) URL is read as a link, and it is reduced
 * to its path, so a QR printed with another host (staging, an old domain, or a
 * forgery) still opens THIS site's page and never navigates off-site. Any other
 * link-shaped text is refused. Plain text is read as a certificate number.
 */
export function routeForScannedText(raw: string, ownHost: string): ScanRoute {
  const text = String(raw ?? '').trim();
  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { kind: 'foreign' };
    }
    if (!OWN_QR_PATH.test(url.pathname)) return { kind: 'foreign' };
    const otherHost = url.host.toLowerCase() === ownHost.toLowerCase() ? null : url.host;
    return { kind: 'path', path: `${url.pathname}${url.search}`, otherHost };
  }
  if (LINK_SHAPED.test(text)) return { kind: 'foreign' };
  const path = verifyPathFor(text);
  return path ? { kind: 'path', path, otherHost: null } : { kind: 'foreign' };
}
