/**
 * R2 anti-scope-creep guard (no DB). The `closedReason` vocab is a single
 * frozen set (see the migration + reports/pm/M4-terminal-vocab-proposal.md). Four
 * markers are now WIRED — 'CORRECTION_DEADLINE_EXPIRED' (M4,
 * jobs/revision-deadline-checker.js), 'PAYMENT_ABANDONED' (M5,
 * jobs/payment-closure-job.js), 'CANCELLED_BY_ADMIN' (the status writer, when an admin
 * closes with a reason from the fixed list, order 35) and 'CANCELLED_BY_APPLICANT' (the
 * withdraw door, order 32). The remaining THREE are RESERVED slots whose
 * writers are separate backlog tickets and MUST stay unwired for now (wiring one
 * early is scope creep and, for the reject reasons, money-adjacent). This test
 * fails if any backend source file assigns one of the reserved values to
 * `closedReason`.
 *
 * It also pins this guard's vocab to the migration's CHECK list so the two can
 * never silently drift.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

// The full frozen set. Three markers are wired; the rest are reserved.
const WIRED_MARKERS = [
    'CORRECTION_DEADLINE_EXPIRED', // M4 — revision/CAR deadline cron
    'PAYMENT_ABANDONED',           // M5 — payment-closure cron
    'CANCELLED_BY_ADMIN',          // order 35 — admin close, services/application-status-writer.js
    'CANCELLED_BY_APPLICANT',      // order 32 — the applicant's withdraw door
];
const RESERVED_OTHERS = [
    'REJECTED_DOC_REVIEW',
    'REJECTED_AUDIT',
    'LEGACY_AUTO_CANCEL',
];
const FULL_VOCAB = [...WIRED_MARKERS, ...RESERVED_OTHERS];

// Source dirs that could contain a real writer (exclude tests, migrations,
// node_modules — those legitimately mention the literals as data/fixtures).
const SOURCE_DIRS = ['services', 'jobs', 'controllers', 'modules', 'routes', 'middleware', 'shared'];

/** Recursively collect *.js files under a dir (skipping node_modules). */
function collectJsFiles(dir) {
    /** @type {string[]} */
    const out = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        if (e.name === 'node_modules') { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            out.push(...collectJsFiles(full));
        } else if (e.isFile() && e.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Find backend source files that ASSIGN `value` to a `closedReason` key/field,
 * e.g. `closedReason: 'X'` or `closedReason = "X"` (whitespace-tolerant).
 */
function writersOf(value) {
    const re = new RegExp(`closedReason["']?\\s*[:=]\\s*["']${value}["']`);
    const hits = [];
    for (const dir of SOURCE_DIRS) {
        for (const file of collectJsFiles(path.join(BACKEND_ROOT, dir))) {
            let text;
            try {
                text = fs.readFileSync(file, 'utf8');
            } catch {
                continue;
            }
            if (re.test(text)) {
                hits.push(path.relative(BACKEND_ROOT, file));
            }
        }
    }
    return hits;
}

describe('closedReason reserved slots — only the wired markers have a writer', () => {
    test('CANCELLED_BY_ADMIN is written by the status writer alone', () => {
        expect(writersOf('CANCELLED_BY_ADMIN')).toEqual(['services/application-status-writer.js']);
    });

    test.each(RESERVED_OTHERS)('no backend writer sets closedReason = %s (reserved)', (value) => {
        const writers = writersOf(value);
        expect(writers).toEqual([]);
    });

    test('this guard\'s vocab matches the migration CHECK set exactly (no drift)', () => {
        const migration = fs.readFileSync(
            path.join(
                BACKEND_ROOT,
                'prisma',
                'migrations',
                '20260805090000_add_application_closed_reason',
                'migration.sql',
            ),
            'utf8',
        );
        // Pull the quoted values inside the CHECK ... IN ( ... ) list.
        const inList = migration.slice(migration.indexOf('IN ('));
        const migrationVocab = (inList.match(/'([A-Z_]+)'/g) || [])
            .map((s) => s.replace(/'/g, ''))
            .filter((v, i, a) => a.indexOf(v) === i);
        expect(migrationVocab.sort()).toEqual([...FULL_VOCAB].sort());
    });
});
