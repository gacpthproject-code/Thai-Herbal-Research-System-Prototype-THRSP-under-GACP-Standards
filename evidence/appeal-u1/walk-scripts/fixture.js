'use strict';
// Walk fixture on the appeal-u1 scratch database: four booked applications of one juristic holder,
// both instalments settled, plus one refused the pre-U1 way with its letter. Prints ids only.
const crypto = require('crypto');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

(async () => {
    const raw = new PrismaClient();
    const one = (role, extra = {}) => raw.user.findFirst({ where: { role, isDeleted: false, ...extra }, select: { id: true, organizationId: true, canonicalId: true } });
    const inspector = await one('field_inspector');
    const approver = await one('certificate_approver');
    const reviewer = await one('document_reviewer');
    const applicant = await one('health', { firstName: 'สมชาย' });
    const org = inspector.organizationId;
    const sfx = crypto.randomUUID().slice(0, 6);
    const entity = await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท เดินทดสอบ ${sfx} จำกัด`, organizationId: org } });
    await raw.entityMembership.create({ data: { userId: applicant.id, entityId: entity.id, role: 'OWNER', permissions: [], status: 'ACTIVE', organizationId: org } });
    const farm = {
        plantId: 'cannabis', locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
        farmData: { farmName: 'ฟาร์มเดินทดสอบ', address: '9 หมู่ 1', province: 'นครปฐม', district: 'เมือง', subdistrict: 'พระปฐมเจดีย์', postalCode: '73000', totalAreaSize: '3', totalAreaUnit: 'Rai', gpsLat: '13.82', gpsLng: '100.06' },
        plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
    };
    let n = 0;
    async function seat(status, { history = [] } = {}) {
        n += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-WALK-U1-${sfx}-${n}`, healthId: applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: org, entityId: entity.id, submitterId: applicant.id, status,
                auditorId: inspector.id, reviewerId: reviewer.id, certificationPurposes: ['RESEARCH'], scheduledDate: new Date(),
                formData: { workflowState: status, ...farm }, workflowHistory: history,
            },
        });
        for (const milestone of ['M1', 'M2']) {
            const invoice = await raw.invoice.create({
                data: {
                    invoiceNumber: `INV-WALK-${sfx}-${n}-${milestone}`, applicationId: row.id, healthId: applicant.canonicalId,
                    serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0, dueDate: new Date(),
                    status: 'PAID', paidAt: new Date(), organizationId: org, metadata: {},
                },
            });
            await raw.checkoutOrder.create({
                data: {
                    applicationId: row.id, milestone, platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0, totalPayableAmount: 0,
                    status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id, organizationId: org,
                },
            });
        }
        return row;
    }
    const jobSheet = await seat('AUDIT_CONFIRMED');
    const field = await seat('AUDIT_CONFIRMED');
    const audit = await raw.auditChecklist.create({ data: { applicationId: field.id, templateName: 'GACP_GENERAL', sections: [], auditorId: inspector.id, organizationId: org, status: 'IN_PROGRESS' } });
    const refusals = await seat('AUDIT_CONFIRMED');
    const at = new Date().toISOString();
    const refused = await seat('REJECTED', { history: [{ timestamp: at, action: 'WORKFLOW_TRANSITION', fromStatus: 'AUDIT_CONFIRMED', toStatus: 'REJECTED', actorId: inspector.id, actorRole: 'field_inspector' }] });
    await raw.notification.create({ data: { userId: applicant.id, kind: 'OFFICIAL_LETTER', type: 'ERROR', organizationId: org, title: 'หนังสือแจ้งคำสั่งไม่รับรอง', message: 'คำขอนี้เป็นอันสิ้นสุด', metadata: { applicationId: refused.id, letterType: 'TERMINAL_DECISION' } } });
    const out = {
        jobSheet: { id: jobSheet.id, number: jobSheet.applicationNumber },
        field: { id: field.id, number: field.applicationNumber, auditId: audit.id },
        refusals: { id: refusals.id, number: refusals.applicationNumber },
        refused: { id: refused.id, number: refused.applicationNumber },
    };
    fs.writeFileSync('/tmp/appeal-u1/walk/fixture.json', JSON.stringify(out, null, 2));
    console.log('fixture written', Object.keys(out).join(' '));
    await raw.$disconnect();
})().catch((e) => { console.error('fixture failed:', e.message); process.exit(1); });
