'use strict';

process.env.PAYMENT_ADAPTER = process.env.PAYMENT_ADAPTER || 'mock';
process.env.RATE_LIMIT_MAX = '1000000';

const fs = require('fs');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { seedHolderScopeFixture, cleanupHolderScopeFixture } = require('./fixtures/holder-scope-fixture');
const { deriveDimensions } = require('../../services/application-requirements-service');

jest.mock('../../services/pdf/pdf-generator.service', () => ({
    initialize: async () => {},
    warmUp: async () => {},
    close: async () => {},
    generatePDF: async () => Buffer.from('%PDF-1.4 walk'),
    generateFromTemplate: async () => Buffer.from('%PDF-1.4 walk'),
    replaceTemplateVariables: (t) => t,
    readTemplateCached: (templatePath) => require('fs').readFileSync(templatePath, 'utf8'),
}));

function completeLegacySteps() {
    return {
        1: {
            operator_name: 'นายทดสอบ', tax_id: '1100000000008', address_contact: '123 ถนนทดสอบ',
            phone_no: '0812345678', email: 'legacy@example.com', operator_type: 'INDIVIDUAL',
        },
        2: {
            herb_type_id: 'cannabis', botanical_name: 'Cannabis sativa', strain_name: 'Thai Stick',
            material_source: 'self', source_location: 'farm', lot_number: 'LOT-1',
        },
        3: {},
        4: {
            applicant_type: 'INDIVIDUAL', first_name: 'นาย', last_name: 'ทดสอบ', id_card: '1100000000008',
            phone: '0812345678', email: 'legacy@example.com',
        },
        5: {
            plot_name: 'แปลง 1', land_title_no: 'NS3-1', area_rai: 2, area_ngan: 0, area_sq_wa: 0,
            lat: 13.1, long: 100.6, surrounding_environment: 'rural',
        },
        6: {
            water_source_type: 'well', irrigation_method: 'drip', soil_preparation_method: 'tilling',
            soil_analysis_date: '2026-01-01', water_analysis_date: '2026-01-01', fertilizer_type: 'organic',
            fertilizer_schedule: 'weekly', pest_control_method: 'ipm', weed_control_method: 'manual',
            input_usage_history: 'none',
        },
        7: {
            harvest_criteria: 'maturity', harvest_method: 'manual', equipment_sanitation: 'cleaned',
            harvest_time_of_day: 'morning', cleaning_method: 'rinse', drying_method: 'sun', sorting_criteria: 'size',
            moisture_content_target: '12%', packaging_material_type: 'foil', storage_condition: 'cool',
            warehouse_pest_control: 'traps', stock_management_system: 'fifo',
        },
        8: { files: [{ name: 'doc.pdf' }] },
        9: {
            traceability_code_format: 'QR', internal_audit_date: '2026-01-01', sample_retention_period: '1 year',
            complaint_handling_procedure: 'documented',
        },
    };
}

d('#47 a submit without a declared area type is refused (real Postgres, real server)', () => {
    let raw;
    let app;
    let fx;
    const results = {};

    async function readBack(applicationId) {
        const row = await raw.application.findUnique({ where: { id: applicationId } });
        const formData = row.formData && typeof row.formData === 'object' ? row.formData : {};
        return {
            status: row.status,
            areaType: row.areaType,
            stepsStored: Object.keys(formData.steps || {}).length,
            quotations: await raw.quotation.count({ where: { applicationId } }),
            certificateScopeIfIssued: deriveDimensions(row).areaTypes,
        };
    }

    async function defaultOutdoorDraft(label) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-HS-LEGACY-${label}-${fx.sfx}`, healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entities.PA, submitterId: fx.users.A.id, status: 'DRAFT',
                formData: { plantId: 'cannabis', certificationPurposes: ['EXPORT'], applicantType: 'INDIVIDUAL', workflowState: 'DRAFT' },
            },
        });
        await raw.applicationDocument.create({
            data: { applicationId: row.id, documentType: 'LICENCE_PT10', fileUrl: `/uploads/test/legacy-${label}-pt10.pdf` },
        });
        return row.id;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await seedHolderScopeFixture(raw);
        const { ConsentVersions } = require('../../middleware/consent-manager');
        for (const category of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'PAYMENT_TERMS']) {
            await raw.userConsent.create({
                data: { userId: fx.users.A.id, organizationId: fx.orgId, category, version: ConsentVersions[category], granted: true, grantedAt: new Date() },
            });
        }
        app = require('../../server');
        await require('../../services/prisma-database').connect();
        const h = { Authorization: `Bearer ${fx.tokens.A}` };
        const answer = (res) => ({ status: res.status, error: res.body?.error || res.body?.code || null, errorSteps: Object.keys(res.body?.errorsByStep || {}) });

        const viaSubmit = await defaultOutdoorDraft('SUBMIT');
        const res = await request(app).post('/api/applications/submit').set(h).send({
            applicationId: viaSubmit, steps: completeLegacySteps(), declarationsAccepted: true,
        });
        results['POST /submit'] = { answer: answer(res), row: await readBack(viaSubmit) };

        if (process.env.SUBMIT_DOOR_PROBE_OUT) {
            fs.writeFileSync(process.env.SUBMIT_DOOR_PROBE_OUT, `${JSON.stringify(results, null, 1)}\n`);
        }
    }, 300000);

    afterAll(async () => {
        if (raw) {
            await cleanupHolderScopeFixture(raw, fx);
            await raw.$disconnect();
        }
    });

    test.each(['POST /submit'])(
        '%s: 422 APPLICATION_INCOMPLETE on the area step, the filing stays a DRAFT, nothing is priced',
        (door) => {
            const { answer, row } = results[door];
            expect(answer).toMatchObject({ status: 422, error: 'APPLICATION_INCOMPLETE' });
            expect(answer.errorSteps).toContain('2');
            expect(row).toMatchObject({ status: 'DRAFT', stepsStored: 0, quotations: 0 });
        },
    );
});
