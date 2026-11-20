'use strict';

/**
 * The step-2 identity drafts move into the holder record only where they agree (order 142,
 * brief item 5). Real Postgres, through the PDPA-extended client the script itself uses.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const COMPANY_ID = '0105569999999';
const OTHER_COMPANY_ID = '0103555123458';
const CITIZEN_ID = '1101700207030';
const OTHER_CITIZEN_ID = '3609900123459';
const THIRD_CITIZEN_ID = '3100600123450';

d('backfill-holder-from-drafts (real Postgres)', () => {
    let raw;
    let prisma;
    let withoutTenantScope;
    let run;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { entities: {}, apps: [] };

    async function entity(key, data) {
        const row = await raw.entity.create({ data: { organizationId: fx.orgId, ...data } });
        fx.entities[key] = row.id;
        return row.id;
    }
    async function application(entityId, status, applicantData) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-BF-${sfx}-${fx.apps.length}`, healthId: `bf-${sfx}`, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId, status, formData: { applicantData },
            },
        });
        fx.apps.push(row.id);
    }
    const holderOf = async (key) => (await prisma.entity.findUnique({ where: { id: fx.entities[key] } })).payload?.holder;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        ({ prisma } = require('../../services/prisma-database'));
        ({ withoutTenantScope } = require('../../services/tenant-context'));
        ({ run } = require('../../scripts/holder/backfill-holder-from-drafts'));
        fx.orgId = (await raw.organization.create({ data: { name: `bf-${sfx}`, slug: `bf-${sfx}`, code: `BF_${sfx}`.toUpperCase() } })).id;
        fx.userId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.userId, canonicalId: `bf-${sfx}`, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `bf-${sfx}@example.test`, organizationId: fx.orgId,
            },
        });

        const company = await entity('company', { type: 'JURISTIC', displayName: 'บริษัท ตรงกัน จำกัด', juristicId: COMPANY_ID });
        await application(company, 'DRAFT', { companyName: 'บริษัท ตรงกัน จำกัด', taxId: COMPANY_ID, address: '9 หมู่ 9', phone: '0811111111', authorizedSignatory: 'นายสมชาย ใจดี' });
        const other = await entity('other', { type: 'JURISTIC', displayName: 'บริษัท อื่น จำกัด', juristicId: OTHER_COMPANY_ID });
        await application(other, 'DRAFT', { taxId: COMPANY_ID, address: 'ที่อยู่ของบริษัทอื่น' });
        const person = await entity('person', { type: 'INDIVIDUAL', displayName: 'สมหญิง ปลูกดี', thaiCitizenId: CITIZEN_ID });
        await application(person, 'DRAFT', { firstName: 'สมหญิง', lastName: 'ปลูกดี', address: 'ไม่มีเลขบัตร' });
        const respelt = await entity('respelt', { type: 'INDIVIDUAL', displayName: 'สมชาย ใจดี', thaiCitizenId: OTHER_CITIZEN_ID });
        await application(respelt, 'DRAFT', { idCard: OTHER_CITIZEN_ID, prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดีมาก', address: 'สะกดชื่อต่างจากทะเบียน' });
        const agreeing = await entity('agreeing', { type: 'INDIVIDUAL', displayName: 'สมศรี มีสุข', thaiCitizenId: THIRD_CITIZEN_ID });
        await application(agreeing, 'DRAFT', { idCard: THIRD_CITIZEN_ID, prefix: 'นาง', firstName: 'สมศรี', lastName: 'มีสุข', nationality: 'ไทย', phone: '0844444444' });
        const community = await entity('community', {
            type: 'COMMUNITY_ENTERPRISE', displayName: 'วิสาหกิจชุมชน', communityRegNo: '12345678901',
            payload: { holder: { contact: { phone: '0822222222' } } },
        });
        await application(community, 'DRAFT', { communityRegistrationNo: '12345678901', phone: '0833333333', houseCode: '1' });
        const filed = await entity('filed', { type: 'JURISTIC', displayName: 'บริษัท ยื่นแล้ว จำกัด', juristicId: '0105561234560' });
        await application(filed, 'SUBMITTED', { taxId: '0105561234560', address: 'ห้ามแตะ' });
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.application.deleteMany({ where: { id: { in: fx.apps } } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: Object.values(fx.entities) } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: fx.userId } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    const runOnce = (apply) => run({ apply, prisma, withoutTenantScope, organizationId: fx.orgId, log: () => {} });

    test('a dry run reports every outcome and writes nothing', async () => {
        const counts = await runOnce(false);
        expect(counts).toMatchObject({ drafts: 6, MAPPED: 2, IDENTIFIER_MISMATCH: 1, NO_IDENTIFIER: 1, CONFLICT: 2 });
        expect(await holderOf('company')).toBeUndefined();
        expect(await holderOf('agreeing')).toBeUndefined();
    });

    test('--apply fills only the agreeing drafts\' empty fields, never splits a one-string name, never respells a registered name', async () => {
        await runOnce(true);
        expect(await holderOf('company')).toEqual({ contact: { address: '9 หมู่ 9', phone: '0811111111' } });
        expect(await holderOf('other')).toBeUndefined();
        expect(await holderOf('person')).toBeUndefined();
        expect(await holderOf('respelt')).toBeUndefined();
        expect(await holderOf('agreeing')).toEqual({
            person: { title: 'นาง', firstName: 'สมศรี', lastName: 'มีสุข', nationality: 'ไทย' },
            contact: { phone: '0844444444' },
        });
        expect(await holderOf('community')).toEqual({ contact: { phone: '0822222222' } });
        expect(await holderOf('filed')).toBeUndefined();
    });

    test('a second run finds nothing left to map', async () => {
        const counts = await runOnce(true);
        expect(counts).toMatchObject({ MAPPED: 0, NOTHING_TO_MAP: 2 });
    });
});
