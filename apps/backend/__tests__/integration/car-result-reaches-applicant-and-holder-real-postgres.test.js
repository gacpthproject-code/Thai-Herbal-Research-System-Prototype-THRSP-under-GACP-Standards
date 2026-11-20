/**
 * ผลตรวจแปลงที่มีข้อบกพร่อง (CAR) ถึงผู้ยื่นและผู้ถือ (real Postgres, ไม่ mock fanout)
 *
 * D1 (audit 2026-10-07): ประตูหลักของผู้ตรวจพื้นที่ (/api/audit/onsite/:auditId/decision →
 * submitDecision) ส่งแจ้งเตือนด้วย Application.healthId ซึ่งเป็น canonicalId ไม่ใช่ User.id
 * fanout หา user ไม่เจอแล้วข้ามเงียบ ๆ ⇒ ผู้ยื่นไม่รู้ว่ามี CAR นาฬิกา 5 วันทำการเดินจนถูกยกเลิก
 * คำสั่ง 32: แจ้งผู้ถือ = สมาชิกบริษัทผู้ถือที่มีสิทธิ์ SUBMIT_APPLICATION รวมผู้ยื่น ตัดคนซ้ำ
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

d('ผลตรวจ CAR จากประตู onsite ถึงผู้ยื่นและผู้ถือ (real Postgres)', () => {
    let raw;
    let fx;
    let onsite;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'car1');
        onsite = require('../../services/audit-onsite-service');
        await require('../../services/notification-fanout-service')._internals._clearDedupeForTests();
    });

    afterAll(async () => {
        await fx.cleanup();
        await raw.$disconnect();
    });

    // ประตูจริงรันใต้ tenant ของผู้ตรวจ (tenant-context-middleware)
    const asInspector = (fn) => require('../../services/tenant-context').runWithTenantContext({ organizationId: fx.orgId }, fn);

    async function auditFor(application) {
        return raw.auditChecklist.create({
            data: {
                applicationId: application.id, templateName: 'GACP_GENERAL', sections: [], auditorId: fx.inspector.id,
                status: 'IN_PROGRESS', organizationId: fx.orgId,
            },
        });
    }

    test('MAJOR → CAR_PENDING: ผู้ยื่น เจ้าของ และผู้ได้สิทธิ์ยื่นได้แจ้ง · สมาชิกที่ไม่มีสิทธิ์ยื่นไม่ได้', async () => {
        const application = await fx.makeApplication({ status: 'AUDIT_CONFIRMED', auditorId: fx.inspector.id, reviewerId: fx.reviewer.id });
        await fx.settle(application.id, 'M1');
        await fx.settle(application.id, 'M2');
        const audit = await auditFor(application);

        await asInspector(() => onsite.submitDecision({
            auditId: audit.id, decision: 'MAJOR', summary: 'ป้ายแปลงไม่ครบ', findings: [{ nonConformity: 'ป้ายแปลงไม่ครบ', correctiveAction: 'ติดป้ายแปลงให้ครบ' }], actorId: fx.inspector.id, actorRole: 'field_inspector',
        }));

        const after = await raw.application.findUnique({ where: { id: application.id }, select: { status: true } });
        expect(after.status).toBe('CAR_PENDING');
        const got = await fx.recipientsOf({ type: 'AUDIT_RESULT_CAR' });
        expect(got).toEqual(fx.expectedParties);
        for (const id of fx.nonParties) { expect(got).not.toContain(id); }
    });

    test('ผู้ยื่นที่เป็นเจ้าของคนเดียว ได้แจ้งครั้งเดียว (ตัดคนซ้ำ)', async () => {
        const application = await fx.makeApplication({
            status: 'AUDIT_CONFIRMED', auditorId: fx.inspector.id, reviewerId: fx.reviewer.id,
            healthId: fx.owner.canonicalId, submitterId: fx.owner.id,
        });
        await fx.settle(application.id, 'M1');
        await fx.settle(application.id, 'M2');
        const audit = await auditFor(application);
        await asInspector(() => onsite.submitDecision({
            auditId: audit.id, decision: 'MAJOR', summary: 'ระบบน้ำไม่ผ่าน', findings: [{ nonConformity: 'ป้ายแปลงไม่ครบ', correctiveAction: 'ติดป้ายแปลงให้ครบ' }], actorId: fx.inspector.id, actorRole: 'field_inspector',
        }));
        const rows = await raw.notification.findMany({
            where: { userId: fx.owner.id, type: 'AUDIT_RESULT_CAR', metadata: { path: ['applicationId'], equals: application.id } },
        });
        expect(rows).toHaveLength(1);
    });
});
