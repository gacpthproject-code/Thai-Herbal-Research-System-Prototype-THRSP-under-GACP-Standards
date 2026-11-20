#!/usr/bin/env node

// Apply path corrections to testsprite_full_test_plan.json. The plan was
// generated 2026-03-02; the canonical surface refactor since then renamed
// or removed many endpoints. This one-shot scrub aligns the plan with
// what the API actually exposes today.
//
// Each correction is one of:
//   - delete: remove the test case (route deprecated or never built)
//   - update: rewrite endpoint + optional category + optional payload

'use strict';

const fs = require('fs');
const path = require('path');

const PLAN_PATH = path.join(__dirname, '..', '..', 'testsprite_tests', 'testsprite_full_test_plan.json');

const CORRECTIONS = {
    'TC-APP-001': { update: { endpoint: 'POST /api/applications/draft', category: 'negative' } },
    'TC-APP-002': { update: { endpoint: 'GET /api/applications/' } },
    'TC-APP-004': { update: { endpoint: 'POST /api/applications/submit', category: 'negative' } },
    'TC-APP-005': { delete: true },
    'TC-APP-006': { update: { endpoint: 'POST /api/applications/car/:id/car' } },
    'TC-APP-007': { update: { endpoint: 'GET /api/applications/config' } },
    'TC-APP-009': { delete: true },
    'TC-APP-010': { delete: true },

    'TC-FARM-003': { update: { endpoint: 'PATCH /api/farms/:id' } },
    'TC-FARM-005': { update: { endpoint: 'POST /api/water-sources/plot/:plotId', category: 'negative' } },
    'TC-FARM-006': { update: { endpoint: 'POST /api/seed-sources/cycle/:cycleId', category: 'negative' } },
    'TC-FARM-007': { update: { endpoint: 'POST /api/fertilizer-records/cycle/:cycleId', category: 'negative' } },
    'TC-FARM-008': { update: { endpoint: 'POST /api/controlled-environments/plot/:plotId', category: 'negative' } },

    'TC-PAY-003': { delete: true },
    'TC-PAY-004': { delete: true },
    'TC-PAY-005': { update: { endpoint: 'GET /api/quotes/my' } },

    'TC-CERT-001': { delete: true },
    'TC-CERT-003': { update: { endpoint: 'GET /api/certificates/:id/download' } },
    'TC-CERT-004': { delete: true },

    'TC-AUDIT-002': { update: { endpoint: 'POST /api/provider/scheduler/audits/schedules', category: 'negative' } },
    'TC-AUDIT-003': { update: { endpoint: 'POST /api/audits/:id/result', category: 'negative' } },
    'TC-AUDIT-004': { update: { endpoint: 'POST /api/audits/reassign/:id/reassign', category: 'negative' } },
    'TC-AUDIT-006': { update: { endpoint: 'GET /api/post-audit/tasks/:applicationId' } },
    'TC-AUDIT-007': { update: { endpoint: 'GET /api/revision-deadline/:applicationId', category: 'negative' } },

    'TC-PLANT-005': { update: { endpoint: 'GET /api/planting-cycles/:cycleId/plant-units' } },

    'TC-TRACE-001': { update: { endpoint: 'GET /api/trace/:qrCode', category: 'negative' } },
    'TC-TRACE-002': { delete: true },
    'TC-TRACE-003': { update: { endpoint: 'GET /api/lots/:id', category: 'negative' } },
    'TC-TRACE-004': { update: { endpoint: 'GET /api/interoperability/v1/verification', category: 'negative' } },
    'TC-TRACE-005': { update: { category: 'negative' } },
    'TC-TRACE-006': { update: { endpoint: 'GET /api/interoperability/v1/data-contracts/traceability' } },

    'TC-REPORT-002': { update: { endpoint: 'GET /api/reports/dashboard' } },
    'TC-REPORT-003': { update: { endpoint: 'GET /api/analytics/geography/farms' } },
    'TC-REPORT-004': { update: { endpoint: 'GET /api/analytics/trends/applications' } },
    'TC-REPORT-005': { delete: true },

    'TC-FRAUD-001': { update: { endpoint: 'GET /api/fraud-detection/farms/duplicates' } },
    'TC-FRAUD-002': { update: { endpoint: 'POST /api/fraud-detection/documents/:documentId/verify', category: 'negative' } },
    'TC-FRAUD-003': { update: { endpoint: 'GET /api/fraud-detection/dashboard' } },

    'TC-LAB-002': { delete: true },
    'TC-LAB-003': { delete: true },
    'TC-LAB-004': { delete: true },

    'TC-PROV-001': { update: { endpoint: 'GET /api/dashboard' } },
    'TC-PROV-003': { update: { endpoint: 'POST /api/provider/scheduler/audits/schedules', category: 'negative' } },
    'TC-PROV-004': { delete: true },
    'TC-PROV-005': { delete: true },

    'TC-DOC-001': { update: { endpoint: 'POST /api/documents/verify', category: 'negative' } },
    'TC-DOC-002': { update: { endpoint: 'GET /api/documents/' } },
    'TC-DOC-003': { delete: true },
};

function main() {
    const raw = fs.readFileSync(PLAN_PATH, 'utf8').replace(/^﻿/, '');
    const plan = JSON.parse(raw);

    let deleted = 0;
    let updated = 0;
    let kept = 0;

    for (const [moduleKey, mod] of Object.entries(plan.modules)) {
        const next = [];
        for (const tc of mod.testCases) {
            const correction = CORRECTIONS[tc.id];
            if (correction?.delete) {
                deleted++;
                continue;
            }
            if (correction?.update) {
                if (correction.update.endpoint) tc.endpoint = correction.update.endpoint;
                if (correction.update.category) tc.category = correction.update.category;
                if (correction.update.payload) tc.payload = correction.update.payload;
                updated++;
            } else {
                kept++;
            }
            next.push(tc);
        }
        mod.testCases = next;
    }

    let total = 0;
    const byPrio = { P0: 0, P1: 0, P2: 0 };
    const byCat = {};
    for (const mod of Object.values(plan.modules)) {
        for (const tc of mod.testCases) {
            total++;
            if (byPrio[tc.priority] !== undefined) byPrio[tc.priority]++;
            byCat[tc.category] = (byCat[tc.category] || 0) + 1;
        }
    }

    plan.summary = {
        totalModules: Object.keys(plan.modules).length,
        totalTestCases: total,
        byPriority: byPrio,
        byCategory: byCat,
        lastUpdated: new Date().toISOString().slice(0, 10),
        lastUpdatedBy: 'Phase 8 stale-path scrub',
    };

    fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 4) + '\n');
    console.log(`[scrub] kept=${kept} updated=${updated} deleted=${deleted} total=${total}`);
}

main();
