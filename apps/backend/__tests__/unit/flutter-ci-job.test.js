/**
 * The Flutter app has to be built by a Flutter toolchain somewhere.
 *
 * `apps/mobile-app` ships 17 Dart test files and a large `lib/`, and until now
 * nothing in CI ran either `flutter analyze` or `flutter test`. Every Dart
 * change on this repository has been merged on the strength of review plus one
 * JS parity test that reads `health_dashboard_stage.dart` as *text*. That test
 * is worth having, but it cannot know whether the file compiles.
 *
 * PR #704 said so explicitly: "There is no Flutter SDK in this environment and
 * no Flutter job in CI, so the mobile changes are covered by review, the
 * sovereignty gate, and a new JS parity test." This closes that gap.
 *
 * The assertions below are about the pipeline being real, not about it merely
 * existing:
 *
 *   - the SDK is installed, or `flutter` is not on PATH and every step is a
 *     no-op that exits 0;
 *   - both `analyze` and `test` run, because analyze alone would pass a file
 *     whose logic is wrong and test alone would miss code no test imports;
 *   - `build-success` depends on the job, or it is advisory and a red Flutter
 *     run cannot block a merge — which is the same as not having it.
 */

const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW = path.join(__dirname, '../../../../.github/workflows/ci.yml');
const workflow = fs.readFileSync(WORKFLOW, 'utf8');

/** The block of YAML belonging to one job id, up to the next top-level job. */
const jobBlock = (id) => {
    const start = workflow.indexOf(`\n  ${id}:\n`);
    if (start === -1) {
        return '';
    }
    const rest = workflow.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[a-z0-9_-]+:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
};

describe('the Flutter job', () => {
    const block = jobBlock('flutter');

    it('exists at all', () => {
        expect(block).not.toBe('');
    });

    it('installs the Flutter SDK', () => {
        // Without this the shell has no `flutter`, and every step below it
        // either errors or silently does nothing.
        expect(block).toMatch(/flutter-action|flutter-version|subosito/);
    });

    it('runs the analyzer', () => {
        expect(block).toMatch(/flutter analyze/);
    });

    it('runs the tests', () => {
        expect(block).toMatch(/flutter test/);
    });

    it('fetches packages before either of them', () => {
        // `flutter analyze` on a tree with no .dart_tool resolves nothing and
        // reports import errors for every package.
        const pubGet = block.indexOf('flutter pub get');
        const analyze = block.indexOf('flutter analyze');
        expect(pubGet).toBeGreaterThan(-1);
        expect(pubGet).toBeLessThan(analyze);
    });

    it('works inside apps/mobile-app', () => {
        expect(block).toMatch(/working-directory:\s*apps\/mobile-app/);
    });
});

describe('the Flutter job gates the merge', () => {
    it('is a dependency of Build Success', () => {
        // A job nothing depends on is advisory. Dart would still be merged red.
        const buildSuccess = jobBlock('build-success');
        expect(buildSuccess).toMatch(/needs:\s*\[[^\]]*\bflutter\b[^\]]*\]/);
    });
});

describe('the Dart analyzer has rules to enforce', () => {
    const MOBILE = path.join(__dirname, '../../../mobile-app');

    it('declares flutter_lints as a dev dependency', () => {
        const pubspec = fs.readFileSync(path.join(MOBILE, 'pubspec.yaml'), 'utf8');
        expect(pubspec).toMatch(/^\s{2}flutter_lints:/m);
    });

    it('has an analysis_options.yaml', () => {
        // Without this file the flutter_lints dependency is inert: `flutter
        // analyze` falls back to the bare default rule set, which reports
        // compile errors and nothing else. The package was already in
        // pubspec.yaml and had been doing nothing since it landed.
        expect(fs.existsSync(path.join(MOBILE, 'analysis_options.yaml'))).toBe(true);
    });

    it('includes the flutter_lints rule set', () => {
        const options = fs.readFileSync(path.join(MOBILE, 'analysis_options.yaml'), 'utf8');
        expect(options).toMatch(/include:\s*package:flutter_lints\/flutter\.yaml/);
    });

    it('reports the strict-analysis backlog in CI', () => {
        // The blocking `flutter analyze` step stays at its current strictness
        // until the backlog is known to be zero. This second step runs the
        // analyzer at full strictness and prints the result without failing
        // the job, so the next iteration sizes the work from a real run
        // instead of a guess. It must not gate the merge yet.
        const block = jobBlock('flutter');
        expect(block).toMatch(/--fatal-infos/);
        expect(block).toMatch(/continue-on-error:\s*true/);
    });
});

describe('the Dart test run stays hermetic', () => {
    it('leaves the network-tagged integration tests skipped', () => {
        // apps/mobile-app/dart_test.yaml marks them `live` and skips them, so a
        // plain `flutter test` is offline. Passing --run-skipped here would
        // point CI at the real backend and make the job flaky by design.
        const block = jobBlock('flutter');
        expect(block).not.toMatch(/--run-skipped/);
        expect(block).not.toMatch(/--tags\s+live/);
    });

    it('is backed by a dart_test.yaml that actually skips them', () => {
        const config = fs.readFileSync(
            path.join(__dirname, '../../../mobile-app/dart_test.yaml'),
            'utf8',
        );
        expect(config).toMatch(/tags:/);
        expect(config).toMatch(/live:/);
        expect(config).toMatch(/skip:/);
    });
});
