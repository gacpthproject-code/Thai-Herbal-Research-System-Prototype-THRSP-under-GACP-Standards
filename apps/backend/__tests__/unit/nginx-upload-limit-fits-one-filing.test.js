'use strict';

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const fs = require('node:fs');
const path = require('node:path');
const { buildHerbRuleRows } = require('../../scripts/seed-herb-requirement-rules');
const { PLANT_SLUG_TO_CODE } = require('../../config/plant-species-slugs');
const { PURPOSE_CODES, purposeLicenceSlotId } = require('../../shared/certification-purposes');
const { OPTIONAL_SLOT_IDS } = require('../../services/application-requirements-service');
const { getCanonicalSlotId } = require('../../routes/api/applications/validation-slot-utils');
const { MAX_UPLOAD_BYTES } = require('@gacp/validation/upload-rules');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const CONFIG_DIRS = ['nginx', 'deploy/nginx', 'docker/nginx'];
const DEMO_HOST_SNAPSHOT = 'deploy/nginx/demo-host/opt/gacp-platform/nginx/gacp.production.conf';
const UPLOAD_LOCATION = '/api/applications/draft-documents';
const FOUNDING_RULE_SLOTS = ['company_reg', 'community_cert'];
const OPTIONAL_FOR_CANNABIS_PLANTING = ['controlled_herb_license'];
const UPLOAD_PASSES_PER_BURST = 2;

function largestFiling() {
    let largest = { plant: null, requestType: null, slots: 0 };
    for (const plant of Object.keys(PLANT_SLUG_TO_CODE)) {
        const rows = buildHerbRuleRows(plant);
        for (const requestType of ['NEW', 'RENEWAL', 'REPLACEMENT']) {
            const slots = new Set(rows
                .filter((row) => !row.requestType || row.requestType === requestType)
                .map((row) => getCanonicalSlotId(row.slotId)));
            FOUNDING_RULE_SLOTS.forEach((slotId) => slots.add(getCanonicalSlotId(slotId)));
            PURPOSE_CODES.forEach((purpose) => {
                const licence = purposeLicenceSlotId(plant, purpose);
                if (licence) { slots.add(getCanonicalSlotId(licence)); }
            });
            [...OPTIONAL_SLOT_IDS, ...OPTIONAL_FOR_CANNABIS_PLANTING].forEach((slotId) => slots.add(slotId));
            if (slots.size > largest.slots) { largest = { plant, requestType, slots: slots.size }; }
        }
    }
    return largest;
}

function configFiles() {
    const found = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
            const child = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(child); } else if (entry.name.includes('.conf')) { found.push(child); }
        }
    };
    CONFIG_DIRS.filter((dir) => fs.existsSync(path.join(REPO_ROOT, dir))).forEach(walk);
    return found.filter((file) => file !== DEMO_HOST_SNAPSHOT);
}

function withoutComments(text) {
    return text.split('\n').map((line) => line.replace(/#.*$/, '')).join('\n');
}

function locationBody(text, pattern) {
    const start = text.search(new RegExp(`location\\s+${pattern.replace(/[/.]/g, '\\$&')}\\s*\\{`));
    if (start === -1) { return null; }
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i += 1) {
        if (text[i] === '{') { depth += 1; }
        if (text[i] === '}') { depth -= 1; if (depth === 0) { return text.slice(text.indexOf('{', start) + 1, i); } }
    }
    return null;
}

function perMinute(rate) {
    const [, count, unit] = rate.match(/^(\d+)r\/([sm])$/);
    return Number(count) * (unit === 's' ? 60 : 1);
}

function bytes(size) {
    const [, count, unit] = size.match(/^(\d+)([kKmMgG]?)$/);
    const scale = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[unit.toLowerCase()];
    return Number(count) * scale;
}

const filing = largestFiling();
const uploadZoneConfigs = configFiles()
    .map((file) => ({ file, text: withoutComments(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')) }))
    .filter(({ text }) => /limit_req_zone\s+\S+\s+zone=api_upload:/.test(text));

describe('one filing uploads all its documents through nginx (order 120, F-A8-12)', () => {
    it('reads a real filing size from the register seed', () => {
        expect(filing.slots).toBeGreaterThanOrEqual(19);
    });

    it('finds the configs that carry the upload zone', () => {
        expect(uploadZoneConfigs.map(({ file }) => file).sort())
            .toEqual(['docker/nginx/default.conf', 'nginx/gacp.production.conf', 'nginx/nginx.local.conf']);
    });

    describe.each(uploadZoneConfigs.map((config) => [config.file, config]))('%s', (_file, { text }) => {
        const upload = locationBody(text, UPLOAD_LOCATION);

        it(`limits ${UPLOAD_LOCATION} with the upload zone`, () => {
            expect(upload).not.toBeNull();
            expect(upload).toMatch(/limit_req\s+zone=api_upload\b/);
        });

        it(`holds the largest filing ${UPLOAD_PASSES_PER_BURST} times over in one burst`, () => {
            const burst = Number(upload.match(/limit_req\s+zone=api_upload\s+burst=(\d+)/)[1]);
            expect(burst).toBeGreaterThanOrEqual(UPLOAD_PASSES_PER_BURST * filing.slots);
            expect(upload).toMatch(/limit_req\s+zone=api_upload\s+burst=\d+\s+nodelay;/);
        });

        it('refills one whole filing every minute', () => {
            const rate = text.match(/limit_req_zone\s+\S+\s+zone=api_upload:\S+\s+rate=(\S+);/)[1];
            expect(perMinute(rate)).toBeGreaterThanOrEqual(filing.slots);
        });

        it('answers a rate limit with 429, never 503', () => {
            const statuses = [...text.matchAll(/limit_req_status\s+(\d+);/g)].map((m) => m[1]);
            expect(statuses).toEqual(['429']);
            const beforeFirstServer = text.slice(0, text.indexOf('server {'));
            expect(beforeFirstServer).toMatch(/limit_req_status\s+429;/);
        });

        it('never turns a 429 into the maintenance page', () => {
            const errorPages = [...text.matchAll(/error_page\s+([^;]+);/g)].map((m) => m[1]);
            errorPages.forEach((codes) => expect(codes.split(/\s+/)).not.toContain('429'));
        });

        it('lets the largest single file through', () => {
            const size = upload.match(/client_max_body_size\s+(\S+);/)[1];
            expect(bytes(size)).toBeGreaterThan(MAX_UPLOAD_BYTES);
        });
    });
});

describe('the demo host still runs the upload limit from before order 120', () => {
    const text = withoutComments(fs.readFileSync(path.join(REPO_ROOT, DEMO_HOST_SNAPSHOT), 'utf8'));
    const upload = locationBody(text, UPLOAD_LOCATION);

    it('keeps the pre-fix values, so a sync cannot land without this block noticing', () => {
        expect(text).toMatch(/limit_req_zone\s+\S+\s+zone=api_upload:10m\s+rate=5r\/m;/);
        expect(upload).toMatch(/limit_req\s+zone=api_upload\s+burst=10\s+nodelay;/);
        expect(text).not.toMatch(/limit_req_status/);
        expect(10).toBeLessThan(UPLOAD_PASSES_PER_BURST * filing.slots);
    });
});
