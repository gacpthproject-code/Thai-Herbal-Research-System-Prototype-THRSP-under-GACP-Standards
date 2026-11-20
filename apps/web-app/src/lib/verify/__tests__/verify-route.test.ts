import { describe, expect, it } from '@jest/globals';
import { routeForScannedText, verifyPathFor } from '../verify-route';

const OWN = 'gacpth.com';

describe('verifyPathFor', () => {
    it.each([
        ['61/2569', '/verify/61-2569'],
        [' 61 / 2569 ', '/verify/61-2569'],
        ['61-2569', '/verify/61-2569'],
        ['TH-GACP 1/2569', '/verify/TH-GACP-1-2569'],
        ['th-gacp  87 / 2568', '/verify/TH-GACP-87-2568'],
        ['TH-GACP-87-2568', '/verify/TH-GACP-87-2568'],
        ['GACP-TH-2568-A3F7B2', '/verify/GACP-TH-2568-A3F7B2'],
        ['GACP-DTAM-2569-A3F7B2', '/verify/GACP-DTAM-2569-A3F7B2'],
    ])('%s goes to %s', (typed, path) => {
        expect(verifyPathFor(typed)).toBe(path);
    });

    it('anything else is encoded, never cut at a slash or #', () => {
        expect(verifyPathFor('abc/def#1')).toBe('/verify/abc%2Fdef%231');
    });

    it('blank is null', () => {
        expect(verifyPathFor('  ')).toBeNull();
    });

    it.each(['.', '..', ' .. ', '...'])('dots alone ("%s") are no number: /verify/.. would open the home page', (typed) => {
        expect(verifyPathFor(typed)).toBeNull();
    });
});

describe('routeForScannedText', () => {
    it('a certificate QR of this site opens its verify page', () => {
        expect(routeForScannedText('https://gacpth.com/verify/TH-GACP-1-2569', OWN))
            .toEqual({ kind: 'path', path: '/verify/TH-GACP-1-2569', otherHost: null });
    });

    it('a lot QR opens the trace page', () => {
        expect(routeForScannedText('https://gacpth.com/trace/lot/LOT-2569-000019-A', OWN))
            .toEqual({ kind: 'path', path: '/trace/lot/LOT-2569-000019-A', otherHost: null });
    });

    it('a URL to anything else is not ours', () => {
        expect(routeForScannedText('https://gacpth.com/auth', OWN)).toEqual({ kind: 'foreign' });
        expect(routeForScannedText('https://evil.example/verify/', OWN)).toEqual({ kind: 'foreign' });
    });

    it('plain text is read as a certificate number', () => {
        expect(routeForScannedText('61/2569', OWN)).toEqual({ kind: 'path', path: '/verify/61-2569', otherHost: null });
        expect(routeForScannedText('TH-GACP 5/2569', OWN)).toEqual({ kind: 'path', path: '/verify/TH-GACP-5-2569', otherHost: null });
    });
});

describe('routeForScannedText: a QR that points to another host (security review L3)', () => {
    it('is reduced to its path on this site, and names the host so the page can say so', () => {
        expect(routeForScannedText('https://evil.example/verify/TH-GACP-1-2569?code=x', OWN))
            .toEqual({ kind: 'path', path: '/verify/TH-GACP-1-2569?code=x', otherHost: 'evil.example' });
    });

    it('a name before @ is not the host: the real host is named', () => {
        expect(routeForScannedText('https://gacpth.com@evil.example/verify/TH-GACP-1-2569', OWN))
            .toEqual({ kind: 'path', path: '/verify/TH-GACP-1-2569', otherHost: 'evil.example' });
    });

    it('backslashes after the scheme are slashes to a browser: the host is still named', () => {
        expect(routeForScannedText('https://evil.example\\verify\\TH-GACP-1-2569', OWN))
            .toEqual({ kind: 'path', path: '/verify/TH-GACP-1-2569', otherHost: 'evil.example' });
    });

    it('the host is compared without case', () => {
        expect(routeForScannedText('https://GACPTH.COM/verify/TH-GACP-1-2569', OWN))
            .toEqual({ kind: 'path', path: '/verify/TH-GACP-1-2569', otherHost: null });
    });
});

describe('routeForScannedText: negative controls (security review L2)', () => {
    it.each([
        ['a protocol-relative //host', '//evil.example/verify/TH-GACP-1-2569'],
        ['a bare path', '/verify/TH-GACP-1-2569'],
        ['backslashes for slashes', '\\\\evil.example\\verify\\TH-GACP-1-2569'],
        ['https:\\\\ with backslashes', 'https:\\\\evil.example\\verify\\TH-GACP-1-2569'],
        ['javascript:', 'javascript:alert(1)'],
        ['JaVaScRiPt: in mixed case', 'JaVaScRiPt:alert(document.cookie)'],
        ['data:', 'data:text/html,<script>alert(1)</script>'],
        ['../ out of /verify', 'https://gacpth.com/verify/../auth/provider/login'],
        ['%2e%2e out of /verify', 'https://gacpth.com/verify/%2e%2e/admin'],
        ['%2E%2E in upper case', 'https://gacpth.com/trace/%2E%2E/%2E%2E/admin'],
        ['an upper-case /VERIFY', 'https://gacpth.com/VERIFY/TH-GACP-1-2569'],
        ['a double slash after /verify', 'https://gacpth.com/verify//evil.example'],
        ['a backslash after /verify', 'https://gacpth.com/verify/\\evil.example'],
        ['dots alone', '..'],
    ])('%s is not followed: %s', (_label, scanned) => {
        expect(routeForScannedText(scanned, OWN)).toEqual({ kind: 'foreign' });
    });

    it('every path it returns stays on this site, under /verify/ or /trace/', () => {
        const scanned = [
            'https://evil.example/trace/lot/X', 'https://gacpth.com/verify/%2e%2e%2fadmin', 'TH-GACP 1/2569',
            'abc/../../admin', '%2e%2e', 'https://gacpth.com/trace/lot/%2F%2Fevil.example', ' https://gacpth.com/verify/A ',
        ];
        for (const text of scanned) {
            const route = routeForScannedText(text, OWN);
            if (route.kind === 'path') {
                expect(route.path).toMatch(/^\/(verify|trace)\/[^/\\]/);
                const resolved = new URL(route.path, 'https://gacpth.com');
                expect(resolved.host).toBe('gacpth.com');
                expect(resolved.pathname).toMatch(/^\/(verify|trace)\/[^/]/);
            }
        }
    });
});
