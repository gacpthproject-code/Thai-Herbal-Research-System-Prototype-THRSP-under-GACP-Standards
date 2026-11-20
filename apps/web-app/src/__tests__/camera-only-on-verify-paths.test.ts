/**
 * @jest-environment node
 */
/**
 * Security review L1: the camera is granted to this site only on /verify paths, where a citizen
 * scans a certificate or lot QR (operator order 37). Every other page denies it, so script on any
 * other page cannot even ask. Read from the real middleware output for each path.
 */
import { describe, expect, it } from '@jest/globals';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function permissionsPolicy(pathname: string): string {
    const response = middleware(new NextRequest(`http://localhost${pathname}`));
    return response.headers.get('permissions-policy') ?? '';
}

const SRC = resolve(__dirname, '..');
const APP = join(SRC, 'app');
const CAMERA = join(SRC, 'lib', 'verify', 'qr-camera.ts');

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { return entry.name === '__tests__' ? [] : sourceFiles(path); }
        return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
}

function resolveSpecifier(from: string, specifier: string): string | undefined {
    const base = specifier.startsWith('@/') ? join(SRC, specifier.slice(2))
        : specifier.startsWith('.') ? resolve(dirname(from), specifier) : undefined;
    if (base === undefined) { return undefined; }
    return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]
        .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

/** The camera module and every source file that loads it, directly or through other modules. */
function filesThatLoadTheCamera(): string[] {
    const importers = new Map<string, string[]>();
    for (const file of sourceFiles(SRC)) {
        const source = readFileSync(file, 'utf8');
        for (const [, specifier] of source.matchAll(/(?:\bfrom|\bimport\s*\(?|\brequire\s*\()\s*['"]([^'"]+)['"]/g)) {
            const target = resolveSpecifier(file, specifier);
            if (target) { importers.set(target, [...(importers.get(target) ?? []), file]); }
        }
    }
    const loaders = [CAMERA];
    for (const file of loaders) {
        for (const importer of importers.get(file) ?? []) {
            if (!loaders.includes(importer)) { loaders.push(importer); }
        }
    }
    return loaders;
}

/** src/app/(public)/verify/[cert-number]/page.tsx is served at /verify/x. */
function routeOf(entry: string): string {
    const segments = relative(APP, dirname(entry)).split(sep)
        .filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment))
        .map((segment) => (segment.startsWith('[') ? 'x' : segment));
    return `/${segments.join('/')}`;
}

describe('the camera, page by page', () => {
    it.each(['/verify', '/verify/TH-GACP-1-2569', '/verify/technical'])('%s may use this site\'s camera', (pathname) => {
        const policy = permissionsPolicy(pathname);
        expect(policy).toContain('camera=(self)');
        expect(policy).toContain('microphone=()');
        expect(policy).toContain('geolocation=(self)');
    });

    it.each(['/', '/verifyx', '/trace/lot/LOT-2569-000001-A', '/pricing'])('%s may not', (pathname) => {
        const policy = permissionsPolicy(pathname);
        expect(policy).toContain('camera=()');
        expect(policy).not.toContain('camera=(self)');
        expect(policy).toContain('geolocation=(self)');
    });

    // Review F5: an alias page re-exported the scan page at a path the camera policy does not
    // cover, so its scan button could only fail.
    it('every page that can open the camera is served where the camera is allowed', () => {
        const routes = filesThatLoadTheCamera()
            .filter((file) => file.startsWith(APP + sep) && /^(?:page|layout|template)\.tsx?$/.test(basename(file)))
            .map(routeOf);
        expect(routes).toContain('/verify');
        expect(routes.filter((route) => !permissionsPolicy(route).includes('camera=(self)'))).toEqual([]);
    });

    it.each(['getUserMedia', 'BarcodeDetector'])('only lib/verify/qr-camera.ts uses %s', (api) => {
        const users = sourceFiles(SRC).filter((file) => readFileSync(file, 'utf8').toLowerCase().includes(api.toLowerCase()));
        expect(users.map((file) => relative(SRC, file))).toEqual([relative(SRC, CAMERA)]);
    });
});
