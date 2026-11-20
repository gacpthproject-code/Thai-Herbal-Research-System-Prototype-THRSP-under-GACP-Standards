/**
 * ชุดข้อมูลดิบเพื่อการวิจัย ตามเกณฑ์ Track B ข้อ dataset และคำสั่ง 49 (real Postgres)
 *
 * ลำดับแถวคงที่ · แบ่งหน้าแล้วไม่ซ้ำไม่ตก · ข้อมูลฟาร์มส่งออกไม่ได้จนกว่ามีฐานการใช้เพื่อวิจัยที่มีผล
 * · คำตอบที่ยินยอมตามข้อความ v3 เท่านั้น · จังหวัดที่มีผู้ตอบน้อยกว่า 5 คนเป็นค่าว่าง
 * · ข้อความอิสระปิดเบอร์โทร อีเมล เลขบัตร · รหัสเชื่อมข้ามโดเมนได้ · รายการรุ่นที่ถูกลบ
 * · ชุดเต็มพร้อม manifest ตรงกับไฟล์ทุกไฟล์
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';
const PSEUDONYM_KEY = `dataset-export-test-key-${'k'.repeat(24)}`;
process.env.DATASET_PSEUDONYM_KEY = PSEUDONYM_KEY;

const crypto = require('crypto');
const zlib = require('zlib');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const mockActor = { current: null };
jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const { tenantContextMiddleware } = jest.requireActual('../../middleware/tenant-context-middleware');
    const bindTenant = tenantContextMiddleware();
    const attach = (req, res, next) => {
        req.user = { ...mockActor.current };
        return bindTenant(req, res, next);
    };
    return { ...actual, authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach, authenticateToken: attach };
});

const mockBases = { current: { FARM_OPERATION: [] } };
jest.mock('../../data/datasets/research-use-bases', () => ({
    get RESEARCH_USE_BASES() { return mockBases.current; },
}));
const ETHICS_APPROVAL = { committee: 'คณะกรรมการจริยธรรมการวิจัยทดสอบ', reference: 'TEST-ETHICS-1', approvedOn: '2025-12-01' };
const IN_FORCE = { FARM_OPERATION: [{ effectiveFrom: '2026-01-01', inForce: true, privacyNoticeVersion: 'test-notice', ethicsApproval: ETHICS_APPROVAL, ruling: 'test' }] };
const FROM_5_OCT = { effectiveFrom: '2026-10-05', inForce: true, privacyNoticeVersion: 'x', ethicsApproval: { ...ETHICS_APPROVAL, approvedOn: '2026-10-01' }, ruling: 'from 5 Oct' };

const datasetService = require('../../services/dataset-export-service');

const PHONE = '081-234-5678';
const EMAIL = 'somchai.farm@example.com';
const NATIONAL_ID = '1100000000008';
const UUID_SHAPE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function readZip(buffer) {
    const files = new Map();
    let offset = 0;
    while (buffer.readUInt32LE(offset) === 0x04034b50) {
        const method = buffer.readUInt16LE(offset + 8);
        const crc = buffer.readUInt32LE(offset + 14);
        const size = buffer.readUInt32LE(offset + 18);
        const nameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
        const start = offset + 30 + nameLength + extraLength;
        const data = buffer.subarray(start, start + size);
        expect({ name, method, crc }).toEqual({ name, method: 0, crc: zlib.crc32(data) });
        files.set(name, data);
        offset = start + size;
    }
    return files;
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const jsonl = (text) => text.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

d('ชุดข้อมูลดิบเพื่อการวิจัย (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { orgIds: [], userIds: [], farmIds: [], entityIds: [], speciesIds: [], templateIds: [] };
    const p = datasetService.pseudonymiserFor(PSEUDONYM_KEY);
    const as = (user) => { mockActor.current = { ...user }; };
    const scope = () => ({ organizationId: fx.orgA });

    async function user(role, organizationId, accountType) {
        const id = crypto.randomUUID();
        await raw.user.create({
            data: {
                id, canonicalId: `ds-${fx.userIds.length}-${sfx}`, password: 'x', role,
                authType: accountType === 'PROVIDER' ? 'PROVIDER_ID' : 'EMAIL_LEGACY',
                ...(accountType === 'PROVIDER' ? { providerId: `ds-${fx.userIds.length}-${sfx}` } : { healthId: `ds-${fx.userIds.length}-${sfx}` }),
                email: `ds-${fx.userIds.length}-${sfx}@example.test`, organizationId, status: 'ACTIVE', accountType,
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function farm(name) {
        const entity = await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท ${name} ${sfx} จำกัด`, organizationId: fx.orgA } });
        fx.entityIds.push(entity.id);
        const row = await raw.farm.create({
            data: {
                ownerId: fx.farmer.id, farmName: `ฟาร์ม ${name} ${sfx}`, farmType: 'CULTIVATION', address: '1', province: 'เชียงใหม่',
                district: 'เมือง', subDistrict: 'ศรีภูมิ', postalCode: '50200', totalArea: 1, cultivationArea: 1,
                cultivationMethod: 'OUTDOOR', organizationId: fx.orgA, entityId: entity.id,
            },
        });
        fx.farmIds.push(row.id);
        return row;
    }

    async function response(template, { version, consentAt = new Date('2026-10-01T03:00:00Z'), withdrawnAt = null, province = 'เชียงใหม่', text = 'ตอบ' }) {
        const r = await raw.surveyResponse.create({
            data: {
                templateId: template.id, region: 'NORTH', province, organizationId: fx.orgA, submittedAt: new Date('2026-10-01T18:30:00Z'),
                researchConsentVersion: version, researchConsentAt: version ? consentAt : null, researchConsentWithdrawnAt: withdrawnAt,
            },
        });
        await raw.surveyAnswer.create({ data: { responseId: r.id, questionId: template.text, valueText: text, organizationId: fx.orgA } });
        await raw.surveyAnswer.create({ data: { responseId: r.id, questionId: template.rating, valueNumber: 4, organizationId: fx.orgA } });
        return r;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `ds-${tag}-${sfx}`, slug: `ds-${tag}-${sfx}`, code: `DS${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;
        fx.adminA = await user('system_admin_dtam', fx.orgA, 'PROVIDER');
        fx.reviewerA = await user('document_reviewer', fx.orgA, 'PROVIDER');
        fx.farmer = await user('health', fx.orgA, 'HEALTH');

        fx.farm1 = await farm('หนึ่ง');
        fx.farm2 = await farm('สอง');
        const species = await raw.plantSpecies.create({ data: { code: `DS${sfx}`, nameTH: `พืช ${sfx}` } });
        fx.speciesIds.push(species.id);
        fx.cycle = await raw.plantingCycle.create({
            data: { cycleName: `รอบ ${sfx}`, farmId: fx.farm1.id, plantSpeciesId: species.id, startDate: new Date('2026-06-01'), organizationId: fx.orgA },
        });
        const tie = new Date('2026-07-01T01:00:00Z');
        fx.logs = [];
        for (let i = 0; i < 5; i += 1) {
            fx.logs.push(await raw.cultivationLog.create({
                data: {
                    cycleId: fx.cycle.id, logType: 'FERTILIZER', createdAt: tie, organizationId: fx.orgA, quantity: i,
                    productName: `ปุ๋ยสูตร 15-15-15 ร้านโทร ${PHONE} อีเมล ${EMAIL}`,
                    method: `หยอดโคน แทนคุณสมชาย ${NATIONAL_ID} อ้างอิง ${crypto.randomUUID()}`,
                },
            }));
        }
        fx.batchLive = await raw.harvestBatch.create({ data: { batchNumber: `LOT-DS-${sfx}-1`, cycleId: fx.cycle.id, farmId: fx.farm1.id, freshWeight: 10, organizationId: fx.orgA } });
        fx.batchDeleted = await raw.harvestBatch.create({ data: { batchNumber: `LOT-DS-${sfx}-2`, farmId: fx.farm1.id, freshWeight: 11, organizationId: fx.orgA } });
        fx.batchOfDeletedFarm = await raw.harvestBatch.create({ data: { batchNumber: `LOT-DS-${sfx}-3`, farmId: fx.farm2.id, freshWeight: 12, organizationId: fx.orgA, createdAt: new Date('2026-07-03T00:00:00Z') } });
        fx.cycleOfDeletedFarm = await raw.plantingCycle.create({
            data: { cycleName: `รอบ ${sfx}-2`, farmId: fx.farm2.id, plantSpeciesId: species.id, startDate: new Date('2026-06-01'), organizationId: fx.orgA },
        });
        // rows are created months before their farm or cycle is deleted, as in real use
        fx.logOfDeletedFarm = await raw.cultivationLog.create({ data: { cycleId: fx.cycleOfDeletedFarm.id, logType: 'IRRIGATION', organizationId: fx.orgA, createdAt: new Date('2026-07-02T00:00:00Z') } });
        fx.deletedCycle = await raw.plantingCycle.create({
            data: { cycleName: `รอบ ${sfx}-3`, farmId: fx.farm1.id, plantSpeciesId: species.id, startDate: new Date('2026-06-01'), organizationId: fx.orgA },
        });
        fx.logOfDeletedCycle = await raw.cultivationLog.create({ data: { cycleId: fx.deletedCycle.id, logType: 'WEED_CONTROL', organizationId: fx.orgA, createdAt: new Date('2026-07-02T00:00:00Z') } });
        fx.batchOfDeletedCycle = await raw.harvestBatch.create({
            data: { batchNumber: `LOT-DS-${sfx}-4`, cycleId: fx.deletedCycle.id, farmId: fx.farm1.id, freshWeight: 13, organizationId: fx.orgA, createdAt: new Date('2026-07-04T00:00:00Z') },
        });

        const security = await raw.traceQrSecurity.create({
            data: {
                entityType: 'HARVEST_BATCH', entityId: fx.batchLive.id, qrCode: `QRDS${sfx}`, publicUrl: `https://example.test/ds/${sfx}`,
                payload: {}, dataHash: 'h', chainHash: `c-${sfx}`, signature: 's', organizationId: fx.orgA,
            },
        });
        await raw.traceQrScan.create({ data: { qrSecurityId: security.id, requestPath: `/api/trace/batch/${fx.batchLive.id}`, organizationId: fx.orgA } });

        const t = await raw.surveyTemplate.create({ data: { code: `DS-${sfx}`, title: 'แบบสำรวจชุดข้อมูล', status: 'ACTIVE', organizationId: fx.orgA, targetGroup: 'FARMER' } });
        fx.templateIds.push(t.id);
        const q = async (sortOrder, questionType) => raw.surveyQuestion.create({
            data: { templateId: t.id, sortOrder, questionText: `คำถาม ${sortOrder}`, questionType, isRequired: true, organizationId: fx.orgA },
        });
        fx.template = { id: t.id, rating: (await q(1, 'RATING_5')).id, text: (await q(2, 'TEXTAREA')).id };

        fx.v3 = [];
        for (let i = 0; i < 5; i += 1) {
            fx.v3.push(await response(fx.template, { version: 'research-survey-notice-th-v3', text: i === 0 ? `โทรหาผมที่ ${PHONE} หรือ ${EMAIL}` : 'ตอบ' }));
        }
        fx.v3Lone = await response(fx.template, { version: 'research-survey-notice-th-v3', province: 'ลำพูน' });
        fx.v2 = await response(fx.template, { version: 'research-survey-notice-th-v2' });
        fx.noConsent = await response(fx.template, { version: null });
        fx.withdrawn = await response(fx.template, { version: 'research-survey-notice-th-v3', withdrawnAt: new Date('2026-10-05T20:00:00Z') });

        await raw.harvestBatch.update({ where: { id: fx.batchDeleted.id }, data: { isDeleted: true } });
        await raw.farm.update({ where: { id: fx.farm2.id }, data: { isDeleted: true, deletedAt: new Date('2026-10-06T19:00:00Z') } });
        await raw.plantingCycle.update({ where: { id: fx.deletedCycle.id }, data: { isDeleted: true, deletedAt: new Date('2026-10-04T03:00:00Z') } });

        app = express();
        app.use(express.json());
        app.use('/api/datasets', require('../../routes/api/datasets/datasets'));
    });

    afterEach(() => { mockBases.current = { FARM_OPERATION: [] }; });

    afterAll(async () => {
        await raw.surveyAnswer.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.surveyResponse.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.surveyQuestion.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.surveyTemplate.deleteMany({ where: { id: { in: fx.templateIds } } }).catch(() => {});
        await raw.traceQrScan.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.traceQrSecurity.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.harvestBatch.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.cultivationLog.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.plantingCycle.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.plantSpecies.deleteMany({ where: { id: { in: fx.speciesIds } } }).catch(() => {});
        await raw.farm.deleteMany({ where: { id: { in: fx.farmIds } } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: fx.entityIds } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
        await raw.$disconnect();
    });

    const exportAs = async (who, key, format = 'jsonl') => {
        as(who);
        return request(app).get(`/api/datasets/${key}/export?format=${format}`);
    };

    const getBundle = () => {
        as(fx.adminA);
        return request(app).get('/api/datasets/bundle').buffer(true).parse((r, cb) => {
            const chunks = [];
            r.on('data', c => chunks.push(c));
            r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
    };

    test('แคตตาล็อก: 5 โดเมน · ปุ่มส่งออกเฉพาะ system_admin_dtam · ข้อมูลฟาร์มปิดจนกว่ามีฐานการใช้เพื่อวิจัย', async () => {
        as(fx.adminA);
        const admin = await request(app).get('/api/datasets');
        expect(admin.status).toBe(200);
        expect(admin.body.data.canExport).toBe(true);
        const byKey = Object.fromEntries(admin.body.data.domains.map(x => [x.key, x]));
        expect(Object.keys(byKey)).toEqual(['cultivation-logs', 'harvest-batches', 'trace-scans', 'survey-responses', 'survey-questions']);
        for (const key of ['cultivation-logs', 'harvest-batches', 'trace-scans']) {
            expect({ key, available: byKey[key].available, code: byKey[key].unavailableCode })
                .toEqual({ key, available: false, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE' });
        }
        expect(byKey['survey-responses'].available).toBe(true);
        expect(byKey['harvest-batches'].lists).toEqual([{ key: 'harvest-batches/deleted', thaiName: 'รายการรุ่นเก็บเกี่ยวที่ถูกลบ' }]);
        expect(byKey['cultivation-logs'].lists).toEqual([{ key: 'cultivation-logs/deleted', thaiName: 'รายการบันทึกกิจกรรมที่ถูกลบ' }]);
        expect(byKey['survey-responses'].lists).toEqual([{ key: 'survey-responses/withdrawn', thaiName: 'รายการคำตอบที่ถอนความยินยอมแล้ว' }]);

        as(fx.reviewerA);
        const reviewer = await request(app).get('/api/datasets');
        expect(reviewer.body.data.canExport).toBe(false);

        mockBases.current = IN_FORCE;
        as(fx.adminA);
        const opened = await request(app).get('/api/datasets');
        expect(opened.body.data.domains.find(x => x.key === 'cultivation-logs').available).toBe(true);
    });

    test('ข้อมูลฟาร์มไม่มีฐานการใช้เพื่อวิจัยที่มีผล = 403 พร้อมรหัส ไม่มีแถวออก · มีฐานแล้วส่งออกได้', async () => {
        for (const key of ['cultivation-logs', 'harvest-batches', 'trace-scans']) {
            const res = await exportAs(fx.adminA, key);
            expect({ key, status: res.status, code: res.body.error }).toEqual({ key, status: 403, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE' });
        }
        mockBases.current = { FARM_OPERATION: [{ effectiveFrom: '2099-01-01', inForce: true, privacyNoticeVersion: 'x', ethicsApproval: ETHICS_APPROVAL, ruling: 'future' }] };
        expect((await exportAs(fx.adminA, 'cultivation-logs')).status).toBe(403);
        mockBases.current = { FARM_OPERATION: [...IN_FORCE.FARM_OPERATION, { effectiveFrom: '2026-02-01', inForce: false, privacyNoticeVersion: 'x', ruling: 'ended' }] };
        expect((await exportAs(fx.adminA, 'cultivation-logs')).status).toBe(403);
        mockBases.current = IN_FORCE;
        expect((await exportAs(fx.adminA, 'cultivation-logs')).status).toBe(200);
        expect((await exportAs(fx.adminA, 'survey-responses')).status).toBe(200);
    });

    test('มติที่ถึงวันมีผลแต่ไม่มีหนังสืออนุมัติจากคณะกรรมการจริยธรรมการวิจัย = 403 ทุกโดเมนข้อมูลฟาร์ม แคตตาล็อกปิด ชุดเต็มไม่มีข้อมูลฟาร์ม และรายการลบว่าง (คำสั่ง 56(4.3))', async () => {
        const FARM = ['cultivation-logs', 'harvest-batches', 'trace-scans'];
        mockBases.current = { FARM_OPERATION: [{ effectiveFrom: '2026-01-01', inForce: true, privacyNoticeVersion: 'test-notice', ruling: 'no ethics approval' }] };
        for (const key of FARM) {
            const res = await exportAs(fx.adminA, key);
            expect({ key, status: res.status, code: res.body.error }).toEqual({ key, status: 403, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE' });
        }
        as(fx.adminA);
        const catalog = await request(app).get('/api/datasets');
        expect(catalog.body.data.domains.filter(x => FARM.includes(x.key)).map(x => [x.key, x.available, x.unavailableCode]))
            .toEqual(FARM.map(key => [key, false, 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE']));
        // the fixture holds a farm and a cycle deleted in October: under an approved ruling from 2026-01-01 both lists would name them
        for (const key of ['cultivation-logs/deleted', 'harvest-batches/deleted']) {
            expect({ key, rows: jsonl((await request(app).get(`/api/datasets/${key}?format=jsonl`)).text) }).toEqual({ key, rows: [] });
        }
        const res = await getBundle();
        expect(res.status).toBe(200);
        const files = readZip(res.body);
        const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
        expect(manifest.notExported).toEqual(FARM.map(key => ({ key, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE' })));
        expect([...files.keys()].filter(name => FARM.some(key => name === `${key}.csv` || name === `${key}.jsonl`))).toEqual([]);
        expect(manifest.researchBasis.FARM_OPERATION).toEqual({ inForce: false, effectiveFrom: '2026-01-01', privacyNoticeVersion: 'test-notice', ethicsApproval: null });
    });

    test('ลำดับแถวคงที่ [createdAt, id] · แบ่งหน้าคร่อมแถวเวลาเท่ากันแล้วไม่ซ้ำไม่ตก · ส่งออกซ้ำได้ไบต์เดียวกัน', async () => {
        mockBases.current = IN_FORCE;
        const expected = [...fx.logs].sort((a, b) => (a.id < b.id ? -1 : 1)).map(l => p(l.id));
        const small = jsonl((await datasetService.exportDomain('cultivation-logs', 'jsonl', { scope: scope(), pageSize: 2 })).body);
        expect(small.map(r => r.id)).toEqual(expected);
        const whole = await datasetService.exportDomain('cultivation-logs', 'jsonl', { scope: scope() });
        expect(jsonl(whole.body).map(r => r.id)).toEqual(expected);
        expect({ rows: whole.rows, keyFingerprint: whole.keyFingerprint }).toEqual({ rows: 5, keyFingerprint: datasetService.keyFingerprint(PSEUDONYM_KEY) });
        for (const format of ['csv', 'jsonl']) {
            const first = (await exportAs(fx.adminA, 'cultivation-logs', format)).text;
            const second = (await exportAs(fx.adminA, 'cultivation-logs', format)).text;
            expect(sha256(second)).toBe(sha256(first));
        }
    });

    test('คำตอบแบบสำรวจ: เฉพาะที่ยินยอมตาม v3 และยังไม่ถอน · จังหวัดที่ปิดในภาคเดียวกันรวมกันต้องถึง 5 คน', async () => {
        const rows = jsonl((await exportAs(fx.adminA, 'survey-responses')).text);
        expect([...new Set(rows.map(r => r.responseId))].sort()).toEqual([...fx.v3, fx.v3Lone].map(r => p(r.id)).sort());
        for (const excluded of [fx.v2, fx.noConsent, fx.withdrawn]) {
            expect(rows.some(r => r.responseId === p(excluded.id))).toBe(false);
        }
        // ลำพูน 1 คนปิดเดี่ยว ๆ แล้วกลุ่มค่าว่างของภาคเหนือคือคนนั้นคนเดียว จึงปิดเชียงใหม่ (5 คน) ด้วย ภาคเหนือมี 6 คนจึงยังแสดงภาค
        expect([...new Set(rows.map(r => `${r.region}|${r.province}`))]).toEqual(['NORTH|null']);
        expect(rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.submittedAt))).toBe(true);
        expect(rows[0].submittedAt).toBe('2026-10-02');
    });

    test('ข้อความอิสระ: ปิดเบอร์โทร อีเมล เลขบัตร และรหัสรูปแบบ UUID ทุกช่อง', async () => {
        mockBases.current = IN_FORCE;
        for (const key of ['cultivation-logs', 'survey-responses']) {
            for (const format of ['csv', 'jsonl']) {
                const out = (await exportAs(fx.adminA, key, format)).text;
                expect({ key, format, phone: out.includes(PHONE) || out.includes('0812345678') }).toEqual({ key, format, phone: false });
                expect(out).not.toContain(EMAIL);
                expect(out).not.toContain(NATIONAL_ID);
                expect(out).not.toMatch(UUID_SHAPE);
            }
        }
        const log = jsonl((await exportAs(fx.adminA, 'cultivation-logs')).text)[0];
        expect(log.productName).toBe('ปุ๋ยสูตร 15-15-15 ร้านโทร [เบอร์โทร] อีเมล [อีเมล]');
        expect(log.method).toBe('หยอดโคน แทนคุณสมชาย 1-XXXX-XXXX-X-0008 อ้างอิง [รหัส]');
    });

    test('รหัสแฝงเชื่อมข้ามโดเมนได้: ฟาร์ม รอบปลูก รุ่นที่ถูกสแกน คำถาม', async () => {
        mockBases.current = IN_FORCE;
        const logs = jsonl((await exportAs(fx.adminA, 'cultivation-logs')).text);
        const batches = jsonl((await exportAs(fx.adminA, 'harvest-batches')).text);
        const scans = jsonl((await exportAs(fx.adminA, 'trace-scans')).text);
        const answers = jsonl((await exportAs(fx.adminA, 'survey-responses')).text);
        const questions = jsonl((await exportAs(fx.adminA, 'survey-questions')).text);
        expect(new Set(logs.map(l => l.farmId))).toEqual(new Set([p(fx.farm1.id)]));
        expect(batches.map(b => b.id)).toEqual([p(fx.batchLive.id)]);
        expect(batches[0].farmId).toBe(logs[0].farmId);
        expect(batches[0].cycleId).toBe(logs[0].cycleId);
        expect(scans.map(s => [s.scannedEntityType, s.scannedEntityId, s.requestPath]))
            .toEqual([['HARVEST_BATCH', batches[0].id, '/api/trace/batch/:batchId']]);
        const questionIds = new Set(questions.map(q => q.questionId));
        expect(answers.every(a => questionIds.has(a.questionId))).toBe(true);
        expect(new Set(questions.map(q => q.templateId))).toEqual(new Set([p(fx.template.id)]));
        expect(questions.map(q => q.questionText)).toEqual(['คำถาม 1', 'คำถาม 2']);
    });

    test('บันทึกกิจกรรมของรอบปลูกหรือฟาร์มที่ถูกลบไม่ถูกส่งออก และอยู่ในรายการบันทึกที่ถูกลบด้วยรหัสแฝงเดิม', async () => {
        mockBases.current = IN_FORCE;
        const ids = jsonl((await exportAs(fx.adminA, 'cultivation-logs')).text).map(r => r.id);
        expect(ids).toEqual(expect.arrayContaining(fx.logs.map(l => p(l.id))));
        expect({ deletedFarm: ids.includes(p(fx.logOfDeletedFarm.id)), deletedCycle: ids.includes(p(fx.logOfDeletedCycle.id)) })
            .toEqual({ deletedFarm: false, deletedCycle: false });
        as(fx.adminA);
        const res = await request(app).get('/api/datasets/cultivation-logs/deleted?format=jsonl');
        expect(res.status).toBe(200);
        expect(jsonl(res.text).sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual([
            { id: p(fx.logOfDeletedFarm.id), deletedOn: '2026-10-07' },
            { id: p(fx.logOfDeletedCycle.id), deletedOn: '2026-10-04' },
        ].sort((a, b) => (a.id < b.id ? -1 : 1)));
    });

    test('รายการรุ่นที่ถูกลบ: รุ่นที่ลบเอง รุ่นของฟาร์มและของรอบปลูกที่ถูกลบ ด้วยรหัสแฝงเดียวกับที่เคยส่งออก · ผู้ดูแลกรมเท่านั้น', async () => {
        mockBases.current = IN_FORCE;
        expect(jsonl((await exportAs(fx.adminA, 'harvest-batches')).text).map(b => b.id)).not.toContain(p(fx.batchOfDeletedCycle.id));
        as(fx.adminA);
        const res = await request(app).get('/api/datasets/harvest-batches/deleted?format=jsonl');
        expect(res.status).toBe(200);
        expect(jsonl(res.text).sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual([
            { id: p(fx.batchDeleted.id), deletedOn: null },
            { id: p(fx.batchOfDeletedFarm.id), deletedOn: '2026-10-07' },
            { id: p(fx.batchOfDeletedCycle.id), deletedOn: '2026-10-04' },
        ].sort((a, b) => (a.id < b.id ? -1 : 1)));
        as(fx.reviewerA);
        expect((await request(app).get('/api/datasets/harvest-batches/deleted?format=jsonl')).status).toBe(403);
        as(fx.adminA);
        expect((await request(app).get('/api/datasets/trace-scans/deleted?format=jsonl')).status).toBe(404);
    });

    test('รายการลบของข้อมูลฟาร์มมีเฉพาะแถวที่อาจส่งออกไปแล้ว: ไม่เคยมีฐาน = ว่าง · ลบก่อนฐานเริ่มมีผล = ไม่อยู่ในรายการ', async () => {
        as(fx.adminA);
        const listed = async (key) => jsonl((await request(app).get(`/api/datasets/${key}?format=jsonl`)).text).map(r => r.id).sort();
        expect({ logs: await listed('cultivation-logs/deleted'), batches: await listed('harvest-batches/deleted') }).toEqual({ logs: [], batches: [] });
        // a ruling in force from 2026-10-05 (Bangkok): the cycle deleted on 2026-10-04 never left; the farm deleted on 2026-10-07 and the batch deleted today could have
        mockBases.current = { FARM_OPERATION: [FROM_5_OCT] };
        expect(await listed('cultivation-logs/deleted')).toEqual([p(fx.logOfDeletedFarm.id)]);
        expect(await listed('harvest-batches/deleted')).toEqual([p(fx.batchDeleted.id), p(fx.batchOfDeletedFarm.id)].sort());
        // a ruling that has ended still lists what was deleted after it began
        mockBases.current = { FARM_OPERATION: [FROM_5_OCT, { effectiveFrom: '2026-10-06', inForce: false, privacyNoticeVersion: 'x', ruling: 'ended' }] };
        expect(await listed('cultivation-logs/deleted')).toEqual([p(fx.logOfDeletedFarm.id)]);
    });

    test('รายการลบ: ฟาร์มที่ถูกลบโดยไม่มีวันลบ (แถวเก่า) ถือว่าลบวันนี้ จึงไม่ซ่อนรุ่นที่อาจส่งออกไปแล้ว (K16 review)', async () => {
        const legacyFarm = await farm('สาม');
        const batch = await raw.harvestBatch.create({
            data: { batchNumber: `LOT-DS-${sfx}-5`, farmId: legacyFarm.id, freshWeight: 14, organizationId: fx.orgA, createdAt: new Date('2026-07-05T00:00:00Z') },
        });
        // the batch itself was last written long before the ruling; only its farm went, at a time nobody recorded
        await raw.harvestBatch.update({ where: { id: batch.id }, data: { updatedAt: new Date('2026-07-06T00:00:00Z') } });
        await raw.farm.update({ where: { id: legacyFarm.id }, data: { isDeleted: true, deletedAt: null } });
        mockBases.current = { FARM_OPERATION: [FROM_5_OCT] };
        as(fx.adminA);
        const listed = jsonl((await request(app).get('/api/datasets/harvest-batches/deleted?format=jsonl')).text);
        expect(listed).toContainEqual({ id: p(batch.id), deletedOn: null });
    });

    test('ข้อมูลฟาร์มออกเป็นวันที่ตามปฏิทินไทย ไม่มีเวลาของวัน', async () => {
        mockBases.current = IN_FORCE;
        await raw.harvestBatch.update({ where: { id: fx.batchLive.id }, data: { harvestDate: new Date('2026-09-30T18:30:00Z') } });
        const DAY = /^\d{4}-\d{2}-\d{2}$/;
        const notDays = [];
        for (const [key, fields] of [['cultivation-logs', ['createdAt', 'logDate']], ['harvest-batches', ['createdAt', 'harvestDate']], ['trace-scans', ['createdAt']]]) {
            for (const row of jsonl((await exportAs(fx.adminA, key)).text)) {
                for (const f of fields) { if (!DAY.test(row[f])) { notDays.push(`${key}.${f}=${row[f]}`); } }
            }
        }
        expect(notDays).toEqual([]);
        const logs = jsonl((await exportAs(fx.adminA, 'cultivation-logs')).text);
        expect(logs.find(l => l.id === p(fx.logs[0].id)).createdAt).toBe('2026-07-01');
        const batches = jsonl((await exportAs(fx.adminA, 'harvest-batches')).text);
        expect(batches.find(b => b.id === p(fx.batchLive.id)).harvestDate).toBe('2026-10-01');
    });

    test('ชุดเต็ม: zip มีทุกไฟล์ที่มีฐาน + รายการลบ/ถอน + คู่มือ + manifest ที่ sha256 และจำนวนแถวตรงไฟล์', async () => {
        const res = await getBundle();
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/zip/);
        const files = readZip(res.body);
        const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
        expect(manifest.pseudonymKeyFingerprint).toBe(datasetService.keyFingerprint(PSEUDONYM_KEY));
        expect(manifest.acceptedConsentVersions).toEqual(['research-survey-notice-th-v3']);
        expect(manifest.recipient).toBe('คลังข้อมูลวิจัยของโครงการ');
        expect(manifest.notExported.map(x => [x.key, x.code])).toEqual([
            ['cultivation-logs', 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE'],
            ['harvest-batches', 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE'],
            ['trace-scans', 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE'],
        ]);
        expect(manifest.files.map(f => f.path).sort()).toEqual([
            'cultivation-logs-deleted.csv', 'cultivation-logs-deleted.jsonl',
            'data-dictionary.md',
            'harvest-batches-deleted.csv', 'harvest-batches-deleted.jsonl',
            'survey-questions.csv', 'survey-questions.jsonl',
            'survey-responses-withdrawn.csv', 'survey-responses-withdrawn.jsonl',
            'survey-responses.csv', 'survey-responses.jsonl',
        ]);
        expect([...files.keys()].sort()).toEqual([...manifest.files.map(f => f.path), 'manifest.json'].sort());
        for (const f of manifest.files) {
            const data = files.get(f.path);
            expect({ path: f.path, sha256: sha256(data), bytes: data.length }).toEqual({ path: f.path, sha256: f.sha256, bytes: f.bytes });
            if (f.format === 'jsonl') {
                expect({ path: f.path, rows: jsonl(data.toString('utf8')).length }).toEqual({ path: f.path, rows: f.rows });
            }
        }
        expect(files.get('manifest.json').toString('utf8')).not.toContain(PSEUDONYM_KEY);
        const surveyCsv = manifest.files.find(f => f.path === 'survey-responses.csv');
        const surveyJsonl = manifest.files.find(f => f.path === 'survey-responses.jsonl');
        expect(surveyCsv.rows).toBe(surveyJsonl.rows);
        expect(surveyJsonl.rows).toBe(12);
    });
});
