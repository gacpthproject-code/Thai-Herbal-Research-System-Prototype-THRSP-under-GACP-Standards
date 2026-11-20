/**
 * ผู้อนุมัติตัดสินแฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน (real Postgres) — คำสั่ง 56(2) 78(2) 83 · สเปก 5.3 5.4 5.5 หน่วย U2
 *
 * แฟ้มที่ไม่ผ่าน (AUDIT_NOT_PASSED) มีสองทาง: ไม่ให้การรับรอง (REJECTED พร้อมหนังสือแจ้งคำสั่งถึงทุกคู่กรณี)
 * หรือส่งกลับให้แก้ไขข้อบกพร่อง (CAR_PENDING พร้อมหนังสือสั่งแก้ไขและกำหนด 30 วัน) ไม่มีทางอนุมัติ ·
 * ทางที่แฟ้มเสนอมาจากขาของผู้อนุมัติใน ROLE_TRANSITIONS · ทุกทางต้องเปิดแฟ้มก่อนและผ่านด่านแยกหน้าที่ ·
 * หนังสือแจ้งคำสั่งยังไม่พิมพ์วิธีอุทธรณ์ และไม่พิมพ์ชื่อหรือตำแหน่งของผู้ทำคำสั่ง (คำสั่ง 83(3))
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');
const { setAppealSetup, clearAppealSetup, TEST_APPEAL_SETUP } = require('../../test-support/appeal-setup');
const { CERTIFICATION_REFUSAL_REASONS } = require('../../shared/certification-decision-reasons');
const { STATUS_PRESENTATION } = require('../../shared/status-machine-contract');

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

const FINDINGS = [
    { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ยย้อนหลัง 3 เดือน', correctiveAction: 'จัดทำสมุดบันทึกการใช้ปัจจัยการผลิต' },
    { nonConformity: 'โรงเก็บผลผลิตไม่มีประตูล็อก', correctiveAction: 'ติดตั้งประตูที่ล็อกได้และบันทึกผู้ถือกุญแจ' },
];
const CONSIDERATION = 'ข้อบกพร่องทั้งสองข้อกระทบการควบคุมผลผลิตโดยตรง และผู้ยื่นแก้ไขในระยะสั้นไม่ได้';
const REFUSE_CODE = 'CRITICAL_NONCONFORMITY';
const BANGKOK_MS = 7 * 3600 * 1000;

/** The end of the Bangkok day `days` calendar days after `at` (order 56(2a)), computed here on its own. */
function endOfBangkokDayAfter(at, days) {
    const local = new Date(new Date(at).getTime() + BANGKOK_MS);
    const end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, 23, 59, 59, 999);
    return new Date(end - BANGKOK_MS);
}

d('ผู้อนุมัติตัดสินแฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [] };
    let seq = 0;

    async function person(role, accountType = 'PROVIDER') {
        const id = crypto.randomUUID();
        seq += 1;
        const key = `u2-${seq}-${sfx}`;
        const health = accountType === 'HEALTH';
        await raw.user.create({
            data: {
                id, canonicalId: key, healthId: health ? key : null, password: 'x', role,
                authType: health ? 'EMAIL_LEGACY' : 'PROVIDER_ID', providerId: health ? null : key,
                email: `${key}@example.test`, firstName: 'คน', lastName: role, organizationId: fx.org, status: 'ACTIVE',
                ...(health ? {} : { accountType: 'PROVIDER' }),
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId: fx.org, canonicalId: key };
    }

    const as = (actor) => { mockActor.current = { ...actor }; };
    const rowOf = (id) => raw.application.findUnique({
        where: { id },
        select: { status: true, auditorId: true, formData: true, version: true },
    });
    const officialLettersOf = (id) => raw.notification.findMany({
        where: { kind: 'OFFICIAL_LETTER', metadata: { path: ['applicationId'], equals: id } },
        orderBy: { createdAt: 'asc' },
    });
    const noticesAbout = async (userId, id) => (await raw.notification.findMany({ where: { userId } }))
        .filter((n) => n.metadata && n.metadata.applicationId === id);

    /** An application booked for its visit, both instalments paid, the inspector of the visit assigned. */
    async function booked({ auditorId = fx.inspector.id } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-U2-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.entity, submitterId: fx.applicant.id, status: 'AUDIT_CONFIRMED',
                auditorId, reviewerId: fx.reviewer.id, certificationPurposes: ['RESEARCH'],
                scheduledDate: new Date('2026-10-12T03:00:00.000Z'),
                formData: {
                    workflowState: 'AUDIT_CONFIRMED',
                    farmData: { farmName: 'ฟาร์มทดสอบหน่วยสอง', address: '9 หมู่ 1', province: 'นครปฐม' },
                },
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, row);
        return row.id;
    }

    /** A file the field inspector did not pass, through the inspector's own door. */
    async function notPassed(opts) {
        const id = await booked(opts);
        as(fx.inspector);
        const res = await request(app).post(`/api/provider/auditor/applications/${id}/audit-decisions`)
            .send({ decision: 'FAIL', notes: 'แปลงยังไม่พร้อม', findings: FINDINGS });
        expect([res.status, res.body.data && res.body.data.status]).toEqual([200, 'AUDIT_NOT_PASSED']);
        return id;
    }

    const openFile = (id, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/auditor/applications/${id}/decision-file/opened`).send();
    };
    const readFile = (id, actor = fx.approver) => {
        as(actor);
        return request(app).get(`/api/provider/auditor/applications/${id}/decision-file`);
    };
    const refuse = (id, body, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/auditor/applications/${id}/certification-refusals`).send(body);
    };
    const correct = (id, body, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/auditor/applications/${id}/certification-corrections`).send(body);
    };
    const approve = (id, actor = fx.approver) => {
        as(actor);
        return request(app).post(`/api/provider/auditor/applications/${id}/final-approvals`).send({ reason: 'หลักฐานครบ' });
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        await setAppealSetup(raw);
        const org = await raw.organization.create({ data: { name: `u2-${sfx}`, slug: `u2-${sfx}`, code: `U2_${sfx}`.toUpperCase() } });
        fx.org = org.id;
        fx.orgIds.push(org.id);
        fx.reviewer = await person('document_reviewer');
        fx.inspector = await person('field_inspector');
        fx.approver = await person('certificate_approver');
        fx.approver2 = await person('certificate_approver');
        fx.admin = await person('system_admin_dtam');
        const otherOrg = await raw.organization.create({ data: { name: `u2-other-${sfx}`, slug: `u2-other-${sfx}`, code: `U2O_${sfx}`.toUpperCase() } });
        fx.orgIds.push(otherOrg.id);
        fx.otherApprover = { id: crypto.randomUUID() };
        await raw.user.create({
            data: {
                id: fx.otherApprover.id, canonicalId: `u2-other-approver-${sfx}`, providerId: `u2-other-approver-${sfx}`, password: 'x',
                role: 'certificate_approver', authType: 'PROVIDER_ID', email: `u2-other-approver-${sfx}@example.test`,
                firstName: 'คน', lastName: 'องค์กรอื่น', organizationId: otherOrg.id, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(fx.otherApprover.id);
        fx.applicant = await person('health', 'HEALTH');
        fx.colleague = await person('health', 'HEALTH');
        fx.viewer = await person('health', 'HEALTH');
        fx.holderName = `บริษัท หน่วยสอง ${sfx} จำกัด`;
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: fx.holderName, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.entity);
        for (const [user, role, permissions] of [
            [fx.applicant, 'OWNER', []],
            [fx.colleague, 'MANAGER', ['SUBMIT_APPLICATION']],
            [fx.viewer, 'VIEWER', []],
        ]) {
            await raw.entityMembership.create({
                data: { userId: user.id, entityId: fx.entity, role, permissions, status: 'ACTIVE', organizationId: fx.org },
            });
        }

        app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.user = { ...mockActor.current }; next(); });
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        for (const model of ['checkoutOrder', 'workActivity', 'revisionDeadline', 'correctionRound', 'applicationComment', 'certificate']) {
            await wipe(model, byApp);
        }
        await wipe('invoice', byApp);
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entityMembership', { entityId: { in: fx.entityIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await clearAppealSetup(raw);
        await raw.$disconnect();
    });

    describe('แฟ้มที่ไม่ผ่านรอผู้อนุมัติ', () => {
        let id;
        beforeAll(async () => { id = await notPassed(); });

        it('แฟ้มตัดสินได้ เสนอสองทาง (ไม่ให้การรับรอง · ส่งกลับให้แก้ไข) และแสดงผลไม่ผ่านพร้อมข้อบกพร่องของผู้ตรวจ', async () => {
            const res = await readFile(id);
            expect(res.status).toBe(200);
            expect(res.body.data.decidable).toBe(true);
            expect(res.body.data.actions).toEqual(['REFUSE', 'REQUEST_CORRECTION']);
            expect(res.body.data.inspectorSummary.decision).toBe('FAIL');
            expect(res.body.data.inspectorSummary.findings.map((f) => f.nonConformity)).toEqual(FINDINGS.map((f) => f.nonConformity));
        });

        it('งานตัดสินเข้าคิวงานของผู้อนุมัติ (stage_activity_configs ของ AUDIT_NOT_PASSED)', async () => {
            const work = await raw.workActivity.findMany({
                where: { applicationId: id, triggeredAtStage: 'AUDIT_NOT_PASSED', state: { in: ['TODO', 'CLAIMED', 'IN_PROGRESS'] } },
                select: { workType: true, candidateGroup: true },
            });
            expect(work).toEqual([{ workType: 'FINAL_APPROVAL', candidateGroup: 'certificate_approver' }]);
        });

        it('ผู้ยื่นและสมาชิกผู้ถือได้แจ้งผลไม่ผ่านชนิด INSPECTION_RESULT_RECORDED พร้อมข้อบกพร่องทุกข้อ', async () => {
            for (const party of [fx.applicant, fx.colleague]) {
                const notices = (await noticesAbout(party.id, id)).filter((n) => n.type === 'INSPECTION_RESULT_RECORDED');
                expect(notices).toHaveLength(1);
                for (const f of FINDINGS) { expect(notices[0].message).toContain(f.nonConformity); }
                expect(notices[0].message).toContain('คำขอนี้อยู่ระหว่างการพิจารณาผล และจะแจ้งผลให้ทราบ');
                expect(notices[0].message).not.toContain('ผู้อนุมัติ');
            }
        });

        it('ผู้อนุมัติขององค์กรอื่นไม่ได้แจ้งว่ามีแฟ้มรอ และสมาชิกที่ดูได้อย่างเดียวไม่ได้แจ้งผลไม่ผ่าน', async () => {
            expect((await noticesAbout(fx.approver.id, id)).length).toBeGreaterThan(0);
            expect(await noticesAbout(fx.otherApprover.id, id)).toEqual([]);
            expect((await noticesAbout(fx.colleague.id, id)).filter((n) => n.type === 'INSPECTION_RESULT_RECORDED')).toHaveLength(1);
            expect(await noticesAbout(fx.viewer.id, id)).toEqual([]);
        });

        it('กดอนุมัติแฟ้มที่ไม่ผ่าน = 409 OUTCOME_NOT_OFFERED ไม่มีใบรับรอง สถานะไม่เปลี่ยน', async () => {
            await openFile(id);
            const res = await approve(id);
            expect([res.status, res.body.code]).toEqual([409, 'OUTCOME_NOT_OFFERED']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
        });
    });

    it('ทุกสถานะในคิวตัดสินมีงานตัดสินของผู้อนุมัติที่เปิดใช้อยู่ (stage_activity_configs)', async () => {
        const { DECISION_QUEUE_STATES } = require('../../shared/decision-states');
        for (const status of DECISION_QUEUE_STATES) {
            const rows = await raw.stageActivityConfig.findMany({
                where: { workflowStage: status, isActive: true }, select: { workType: true, candidateGroup: true },
            });
            expect([status, rows]).toEqual([status, expect.arrayContaining([{ workType: 'FINAL_APPROVAL', candidateGroup: 'certificate_approver' }])]);
        }
    });

    it('หนังสือแจ้งคำสั่งเขียนไม่ได้ = ไม่มีการตัดสิน: 500 สถานะ รุ่น และบันทึกการตัดสินไม่เปลี่ยน ไม่มีหนังสือฉบับใด', async () => {
        const id = await notPassed();
        await openFile(id);
        const before = await rowOf(id);
        await raw.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION u2_letter_fault() RETURNS trigger AS $$
            BEGIN
                IF NEW.kind = 'OFFICIAL_LETTER' AND NEW.metadata->>'applicationId' = '${id}' THEN
                    RAISE EXCEPTION 'letter store refused (test fault)';
                END IF;
                RETURN NEW;
            END $$ LANGUAGE plpgsql`);
        await raw.$executeRawUnsafe('CREATE TRIGGER u2_letter_fault BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION u2_letter_fault()');
        let res;
        try {
            res = await refuse(id, { reasonCode: REFUSE_CODE, consideration: CONSIDERATION });
        } finally {
            await raw.$executeRawUnsafe('DROP TRIGGER IF EXISTS u2_letter_fault ON notifications');
            await raw.$executeRawUnsafe('DROP FUNCTION IF EXISTS u2_letter_fault()');
        }
        expect(res.status).toBe(500);
        const after = await rowOf(id);
        expect([after.status, after.version, after.formData.certificationDecision]).toEqual(['AUDIT_NOT_PASSED', before.version, undefined]);
        expect(await officialLettersOf(id)).toHaveLength(0);
    });

    it('แฟ้มที่ผ่าน: เสนอ อนุมัติ · ไม่ให้การรับรอง · ส่งกลับ และส่งกลับให้ผู้ยื่นแก้ไขไม่ได้ (409 OUTCOME_NOT_OFFERED)', async () => {
        const id = await booked();
        await raw.application.update({ where: { id }, data: { status: 'AUDIT_PASSED', formData: { workflowState: 'AUDIT_PASSED' } } });
        const file = await readFile(id);
        expect(file.body.data.actions).toEqual(['APPROVE', 'REFUSE', 'RETURN']);
        await openFile(id);
        const res = await correct(id, { note: 'ส่งกลับ' });
        expect([res.status, res.body.code]).toEqual([409, 'OUTCOME_NOT_OFFERED']);
        expect((await rowOf(id)).status).toBe('AUDIT_PASSED');
    });

    describe('ไม่ให้การรับรองแฟ้มที่ไม่ผ่าน', () => {
        it('ยังไม่เปิดแฟ้ม = 409 DECISION_FILE_NOT_OPENED', async () => {
            const id = await notPassed();
            const res = await refuse(id, { reasonCode: REFUSE_CODE, consideration: CONSIDERATION });
            expect([res.status, res.body.code]).toEqual([409, 'DECISION_FILE_NOT_OPENED']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
        });

        it('เหตุนอกรายการ = 400 สถานะไม่เปลี่ยน ไม่มีหนังสือ', async () => {
            const id = await notPassed();
            await openFile(id);
            const res = await refuse(id, { reasonCode: 'BECAUSE_I_SAID_SO', consideration: CONSIDERATION });
            expect([res.status, res.body.code]).toEqual([400, 'CERTIFICATION_REFUSAL_REASON_REQUIRED']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
            expect(await officialLettersOf(id)).toHaveLength(0);
        });

        it.each([
            ['ไม่มีข้อพิจารณา', {}],
            ['ช่องว่างล้วน', { consideration: '                         ' }],
            ['19 ตัวอักษร', { consideration: 'ก'.repeat(19) }],
            ['1,001 ตัวอักษร', { consideration: 'ข'.repeat(1001) }],
        ])('ข้อพิจารณา (%s) = 400 DECISION_CONSIDERATION_REQUIRED สถานะไม่เปลี่ยน ไม่มีหนังสือ', async (_name, extra) => {
            const id = fx.considerationAppId || (fx.considerationAppId = await notPassed());
            await openFile(id);
            const res = await refuse(id, { reasonCode: REFUSE_CODE, ...extra });
            expect([res.status, res.body.code]).toEqual([400, 'DECISION_CONSIDERATION_REQUIRED']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
            expect(await officialLettersOf(id)).toHaveLength(0);
        });

        describe('ไม่ให้การรับรองสำเร็จ', () => {
            let id;
            let res;
            beforeAll(async () => {
                id = await notPassed();
                await openFile(id);
                res = await refuse(id, { reasonCode: REFUSE_CODE, consideration: `  ${CONSIDERATION}\n`, note: 'บันทึกภายในห้ามหลุด' });
            });

            it('คำขอเป็น REJECTED ไม่มีใบรับรอง บันทึกการตัดสินมีสถานะต้นทาง ข้อพิจารณา และเลขคำสั่ง', async () => {
                expect([res.status, res.body.data && res.body.data.status]).toEqual([200, 'REJECTED']);
                const row = await rowOf(id);
                expect(row.status).toBe('REJECTED');
                expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
                expect(row.formData.certificationDecision).toEqual(expect.objectContaining({
                    outcome: 'REFUSED', reasonCode: REFUSE_CODE, fromStatus: 'AUDIT_NOT_PASSED', consideration: CONSIDERATION,
                    refusalId: expect.stringMatching(/^[0-9a-f-]{36}$/),
                }));
            });

            it('หนังสือแจ้งคำสั่งถึงผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่นคนละฉบับ ไม่ถึงสมาชิกที่ดูได้อย่างเดียว ทุกฉบับเลขคำสั่งเดียวกัน', async () => {
                const letters = await officialLettersOf(id);
                expect(letters.map((l) => l.userId).sort()).toEqual([fx.applicant.id, fx.colleague.id].sort());
                const { refusalId } = (await rowOf(id)).formData.certificationDecision;
                expect(letters.map((l) => l.metadata.refusalId)).toEqual([refusalId, refusalId]);
                expect(letters.every((l) => l.metadata.letterType === 'TERMINAL_DECISION')).toBe(true);
            });

            it('หนังสือมีข้อเท็จจริง เหตุ หลักเกณฑ์ ข้อพิจารณา คำสั่ง สิทธิ์อุทธรณ์ตามการตั้งค่า และสิทธิยื่นคำขอใหม่', async () => {
                const [letter] = await officialLettersOf(id);
                expect(letter.title).toBe(`หนังสือแจ้งคำสั่งไม่ให้การรับรองมาตรฐาน GACP คำขอเลขที่ ${letter.metadata.applicationNumber}`);
                for (const part of [
                    fx.holderName, 'ฟาร์มทดสอบหน่วยสอง', 'ผู้ตรวจพื้นที่', 'ไม่ผ่าน',
                    FINDINGS[0].nonConformity, FINDINGS[1].nonConformity,
                    CERTIFICATION_REFUSAL_REASONS[REFUSE_CODE], 'มาตรฐาน GACP', CONSIDERATION,
                    'จึงมีคำสั่งไม่ให้การรับรอง', `ท่านมีสิทธิ์อุทธรณ์คำสั่งนี้ภายใน ${TEST_APPEAL_SETUP.timeLimitDays} วันนับแต่วันที่ได้รับแจ้งคำสั่ง`,
                    `ช่องทางการอุทธรณ์: ${TEST_APPEAL_SETUP.channel}`, 'ยื่นคำขอรับรองใหม่',
                ]) {
                    expect([part, letter.message.includes(part)]).toEqual([part, true]);
                }
            });

            it('หนังสือไม่มีบันทึกภายใน ป้ายสถานะ ชื่อหรือตำแหน่งของผู้ทำคำสั่ง อีเมลของแพลตฟอร์ม และระยะเวลาอื่นนอกจากที่ตั้งค่า (คำสั่ง 78(4) 83(3) 118(1))', async () => {
                for (const letter of await officialLettersOf(id)) {
                    expect(JSON.stringify(letter)).not.toContain('บันทึกภายในห้ามหลุด');
                    for (const word of [
                        STATUS_PRESENTATION.AUDIT_NOT_PASSED.label, STATUS_PRESENTATION.AUDIT_PASSED.label,
                        'อธิบดี', 'ปฏิบัติราชการแทน', 'ลงนาม', 'contact@gacpth.com',
                        fx.approver.canonicalId,
                    ]) {
                        expect([word, letter.message.includes(word)]).toEqual([word, false]);
                    }
                    expect(letter.message.match(/ภายใน\s*\d+\s*วัน/g)).toEqual([`ภายใน ${TEST_APPEAL_SETUP.timeLimitDays} วัน`]);
                }
            });

            it('ไม่มีแจ้งเตือน CERTIFICATION_REFUSED อีก: ทุกคู่กรณีถือหนังสือแล้ว', async () => {
                const refusedNotices = await raw.notification.count({
                    where: { userId: { in: fx.userIds }, metadata: { path: ['notice'], equals: 'CERTIFICATION_REFUSED' } },
                });
                expect(refusedNotices).toBe(0);
            });

            it('แฟ้มหลังตัดสิน: ตัดสินไม่ได้แล้ว ไม่มีทางให้เลือก และแสดงผลพร้อมข้อพิจารณา', async () => {
                const file = await readFile(id);
                expect(file.status).toBe(200);
                expect(file.body.data.decidable).toBe(false);
                expect(file.body.data.actions).toEqual([]);
                expect(file.body.data.decision).toEqual(expect.objectContaining({
                    outcome: 'REFUSED', reasonLabel: CERTIFICATION_REFUSAL_REASONS[REFUSE_CODE], consideration: CONSIDERATION,
                }));
            });
        });
    });

    describe('ส่งกลับให้แก้ไขข้อบกพร่อง', () => {
        it('ยังไม่เปิดแฟ้ม = 409 DECISION_FILE_NOT_OPENED', async () => {
            const id = await notPassed();
            const res = await correct(id, {});
            expect([res.status, res.body.code]).toEqual([409, 'DECISION_FILE_NOT_OPENED']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
        });

        it.each([[[]], [[3]], [['x']]])('เลือกข้อบกพร่อง %j ที่ไม่มีอยู่จริง = 400 CORRECTION_FINDINGS_REQUIRED สถานะไม่เปลี่ยน', async (findingIndexes) => {
            const id = fx.badPickAppId || (fx.badPickAppId = await notPassed());
            await openFile(id);
            const res = await correct(id, { findingIndexes });
            expect([res.status, res.body.code]).toEqual([400, 'CORRECTION_FINDINGS_REQUIRED']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
        });

        describe('ส่งกลับสำเร็จ เลือกข้อที่ 2 พร้อมคำสั่งเพิ่มเติม', () => {
            let id;
            let res;
            let before;
            beforeAll(async () => {
                id = await notPassed();
                await openFile(id);
                before = Date.now();
                res = await correct(id, { findingIndexes: [2], note: 'แนบภาพประตูที่ติดตั้งแล้ว' });
            });

            it('คำขอเป็น CAR_PENDING กำหนดส่งสิ้นวันที่ 30 นับจากวันตัดสิน ผู้ตรวจพื้นที่คนเดิมยังเป็นผู้ตรวจ', async () => {
                expect([res.status, res.body.data && res.body.data.status]).toEqual([200, 'CAR_PENDING']);
                const row = await rowOf(id);
                expect(row.status).toBe('CAR_PENDING');
                expect(row.auditorId).toBe(fx.inspector.id);
                expect(row.formData.carDueAt).toBe(endOfBangkokDayAfter(row.formData.carRequestedAt, 30).toISOString());
                expect(new Date(row.formData.carRequestedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
                expect(row.formData.certificationDecision).toEqual(expect.objectContaining({
                    outcome: 'CORRECTION_REQUESTED', fromStatus: 'AUDIT_NOT_PASSED', findingIndexes: [2], note: 'แนบภาพประตูที่ติดตั้งแล้ว',
                }));
            });

            it('หนังสือสั่งแก้ไขถึงผู้ยื่น มีเฉพาะข้อที่เลือก กำหนดส่ง และรอบที่ 1', async () => {
                const letters = await officialLettersOf(id);
                expect(letters).toHaveLength(1);
                const [letter] = letters;
                expect(letter.userId).toBe(fx.applicant.id);
                expect(letter.metadata).toEqual(expect.objectContaining({ stage: 'FIELD_AUDIT_CAR', roundNo: 1 }));
                expect(letter.message).toContain(FINDINGS[1].nonConformity);
                expect(letter.message).not.toContain(FINDINGS[0].nonConformity);
                expect(letter.metadata.dueAt).toBe((await rowOf(id)).formData.carDueAt);
            });

            it('รอบแก้ไขขั้นตรวจพื้นที่เพิ่ม 1 แถว และนาฬิกากำหนดส่งเริ่มพร้อมการตัดสิน', async () => {
                expect(await raw.correctionRound.count({ where: { applicationId: id, stage: 'FIELD_AUDIT' } })).toBe(1);
                const deadline = await raw.revisionDeadline.findUnique({ where: { applicationId: id } });
                expect(deadline).toEqual(expect.objectContaining({ status: 'PENDING' }));
                expect(deadline.revisionDue.toISOString()).toBe((await rowOf(id)).formData.carDueAt);
            });

            it('สมาชิกผู้ถือได้แจ้งให้แก้ไขพร้อมข้อที่เลือก', async () => {
                const notices = (await noticesAbout(fx.colleague.id, id)).filter((n) => n.type === 'AUDIT_RESULT_CAR');
                expect(notices).toHaveLength(1);
                expect(notices[0].message).toContain(FINDINGS[1].nonConformity);
            });

            it('แฟ้มหลังตัดสินยังเปิดอ่านได้ และบอกว่าส่งกลับให้แก้ไขแล้ว', async () => {
                const file = await readFile(id);
                expect(file.status).toBe(200);
                expect(file.body.data.decidable).toBe(false);
                expect(file.body.data.decision).toEqual(expect.objectContaining({ outcome: 'CORRECTION_REQUESTED' }));
            });
        });
    });

    describe('ผู้ที่ตัดสินแฟ้มนี้ไม่ได้', () => {
        it('ผู้อนุมัติที่เป็นผู้ตรวจพื้นที่ของคำขอนี้ = 409 EVALUATOR_CANNOT_DECIDE ทั้งสองทาง', async () => {
            const id = await notPassed();
            await raw.application.update({ where: { id }, data: { auditorId: fx.approver2.id } });
            await openFile(id, fx.approver2);
            const refused = await refuse(id, { reasonCode: REFUSE_CODE, consideration: CONSIDERATION }, fx.approver2);
            const corrected = await correct(id, {}, fx.approver2);
            expect([refused.status, refused.body.code, corrected.status, corrected.body.code])
                .toEqual([409, 'EVALUATOR_CANNOT_DECIDE', 409, 'EVALUATOR_CANNOT_DECIDE']);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
        });

        it.each([['ผู้ดูแลฝั่งกรม', 'admin'], ['ผู้ตรวจพื้นที่', 'inspector']])('%s กดตัดสิน = 403', async (_name, who) => {
            const id = await notPassed();
            const refused = await refuse(id, { reasonCode: REFUSE_CODE, consideration: CONSIDERATION }, fx[who]);
            const corrected = await correct(id, {}, fx[who]);
            expect([refused.status, corrected.status]).toEqual([403, 403]);
            expect((await rowOf(id)).status).toBe('AUDIT_NOT_PASSED');
        });
    });

    it('สองผู้อนุมัติกดพร้อมกัน (ไม่ให้การรับรอง กับ ส่งกลับให้แก้ไข): คนที่สองได้ 409 แถว REJECTED เดียว หนังสือชุดเดียว', async () => {
        const { refuseCertification } = require('../../services/certification-decision-service');
        const id = await notPassed();
        await openFile(id);
        await openFile(id, fx.approver2);
        let release;
        const gate = new Promise((r) => { release = r; });
        let written;
        const holding = new Promise((r) => { written = r; });
        const heldPrisma = {
            $transaction: (fn) => raw.$transaction(async (tx) => {
                const out = await fn(tx);
                written();
                await gate;
                return out;
            }, { timeout: 30000 }),
        };
        const refusal = refuseCertification({
            applicationRef: id, actor: fx.approver2, reasonCode: REFUSE_CODE, consideration: CONSIDERATION, prisma: heldPrisma,
        });
        await holding;
        const correcting = correct(id, {}).then((r) => r);
        for (let i = 0; i < 200; i += 1) {
            const [{ n }] = await raw.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity
                WHERE wait_event_type = 'Lock' AND datname = current_database()`;
            if (n > 0) { break; }
            await new Promise((r) => { setTimeout(r, 25); });
        }
        release();
        await refusal;
        const res = await correcting;
        expect(res.status).toBe(409);
        expect((await rowOf(id)).status).toBe('REJECTED');
        expect(await officialLettersOf(id)).toHaveLength(2);
        expect(await raw.correctionRound.count({ where: { applicationId: id } })).toBe(0);
    });
});
