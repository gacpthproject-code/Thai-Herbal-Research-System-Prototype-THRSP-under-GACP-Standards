/**
 * ฉากผู้ยื่น + บริษัทผู้ถือ สำหรับเทสต์แจ้งเตือนฝั่งผู้ยื่น (real Postgres)
 *
 * บริษัทผู้ถือหนึ่งแห่ง สมาชิก:
 *   applicant — ADMIN (มี SUBMIT_APPLICATION) เป็นผู้ยื่น
 *   owner     — OWNER
 *   granted   — MANAGER ที่เจ้าของให้สิทธิ์ SUBMIT_APPLICATION
 *   manager   — MANAGER ไม่มีสิทธิ์ยื่น          (ต้องไม่ได้รับ)
 *   viewer    — VIEWER                           (ต้องไม่ได้รับ)
 *   revoked   — ADMIN สถานะ REVOKED               (ต้องไม่ได้รับ)
 *   outsider  — OWNER ของบริษัทอื่น                (ต้องไม่ได้รับ)
 * และเจ้าหน้าที่ในองค์กรเดียวกัน: reviewer, inspector, inspector2 (ผู้ตรวจพื้นที่อีกคน)
 * กับ foreignInspector ในองค์กรอื่น
 */

'use strict';

const { filedHolderData } = require('../../../test-support/filed-application');

const crypto = require('crypto');
const { certificateRow } = require('./certificate-row');

async function buildApplicantParties(raw, tag) {
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { sfx, userIds: [], entityIds: [], appIds: [], orgIds: [] };
    let seq = 0;

    const org = async (name) => {
        const row = await raw.organization.create({ data: { name: `${tag}-${name}-${sfx}`, slug: `${tag}-${name}-${sfx}`, code: `${tag}_${name}_${sfx}`.toUpperCase() } });
        fx.orgIds.push(row.id);
        return row.id;
    };
    fx.orgId = await org('a');
    fx.foreignOrgId = await org('b');

    const health = async (label) => {
        seq += 1;
        const id = crypto.randomUUID();
        const canonicalId = `${tag}-${label}-${seq}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `${canonicalId}@example.test`, firstName: label, lastName: 'ทดสอบ', organizationId: fx.orgId,
            },
        });
        fx.userIds.push(id);
        return { id, canonicalId };
    };
    const staff = async (role, organizationId = fx.orgId) => {
        seq += 1;
        const id = crypto.randomUUID();
        const key = `${tag}-st-${seq}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId: key, providerId: key, password: 'x', role, authType: 'PROVIDER_ID', accountType: 'PROVIDER',
                email: `${key}@example.test`, firstName: `เจ้าหน้าที่${seq}`, lastName: role, organizationId, status: 'ACTIVE',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    };

    const company = await raw.entity.create({
        data: { type: 'JURISTIC', displayName: `บริษัท ${tag} จำกัด`, organizationId: fx.orgId, ...filedHolderData('JURISTIC') },
    });
    fx.entityIds.push(company.id);
    fx.entityId = company.id;
    const other = await raw.entity.create({
        data: { type: 'JURISTIC', displayName: `บริษัท อื่น ${tag} จำกัด`, juristicId: '0105561234578', organizationId: fx.orgId },
    });
    fx.entityIds.push(other.id);

    const join = async (user, entityId, role, status = 'ACTIVE') => raw.entityMembership.create({
        data: { userId: user.id, entityId, role, status, organizationId: fx.orgId },
    });

    fx.applicant = await health('applicant');
    fx.owner = await health('owner');
    fx.granted = await health('granted');
    fx.manager = await health('manager');
    fx.viewer = await health('viewer');
    fx.revoked = await health('revoked');
    fx.outsider = await health('outsider');
    await join(fx.applicant, company.id, 'ADMIN');
    await join(fx.owner, company.id, 'OWNER');
    const grantedM = await join(fx.granted, company.id, 'MANAGER');
    await raw.entityMemberPermissionGrant.create({
        data: { membershipId: grantedM.id, permission: 'SUBMIT_APPLICATION', effect: 'GRANT', organizationId: fx.orgId },
    });
    await join(fx.manager, company.id, 'MANAGER');
    await join(fx.viewer, company.id, 'VIEWER');
    await join(fx.revoked, company.id, 'ADMIN', 'REVOKED');
    await join(fx.outsider, other.id, 'OWNER');

    fx.reviewer = await staff('document_reviewer');
    fx.inspector = await staff('field_inspector');
    fx.inspector2 = await staff('field_inspector');
    fx.foreignInspector = await staff('field_inspector', fx.foreignOrgId);

    fx.expectedParties = [fx.applicant.id, fx.owner.id, fx.granted.id].sort();
    fx.nonParties = [fx.manager.id, fx.viewer.id, fx.revoked.id, fx.outsider.id];

    fx.makeApplication = async (data = {}) => {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-${tag}-${seq}-${sfx}`.toUpperCase(), healthId: fx.applicant.canonicalId,
                submitterId: fx.applicant.id, entityId: company.id, areaType: 'OUTDOOR', organizationId: fx.orgId,
                status: 'DRAFT', formData: {}, ...data,
            },
        });
        fx.appIds.push(row.id);
        return row;
    };

    fx.settle = async (applicationId, milestone) => {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-${tag}-${seq}-${sfx}`.toUpperCase(), applicationId, healthId: fx.applicant.canonicalId,
                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0,
                dueDate: new Date(), status: 'PAID', paidAt: new Date(), organizationId: fx.orgId, metadata: {},
            },
        });
        return raw.checkoutOrder.create({
            data: {
                applicationId, milestone, platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0,
                totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id, organizationId: fx.orgId,
            },
        });
    };

    fx.farmId = (await raw.farm.create({
        data: {
            ownerId: fx.applicant.id, farmName: `ฟาร์ม ${tag} ${sfx}`, farmType: 'CULTIVATION', address: '1', province: 'สมุทรปราการ',
            district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', totalArea: 1, cultivationArea: 1,
            cultivationMethod: 'OUTDOOR', organizationId: fx.orgId, entityId: company.id,
        },
    })).id;

    fx.makeCertificate = async (applicationId, data = {}) => {
        seq += 1;
        return raw.certificate.create({
            data: certificateRow(
                { applicationId, userId: fx.applicant.id, farmId: fx.farmId, organizationId: fx.orgId },
                { certificateNumber: `TH-GACP ${seq}-${sfx}`, verificationCode: `V-${tag}-${seq}-${sfx}`, issuedBy: fx.reviewer.id, ...data },
            ),
        });
    };

    fx.recipientsOf = async (where) => {
        const rows = await raw.notification.findMany({ where: { userId: { in: fx.userIds }, ...where }, select: { userId: true } });
        return [...new Set(rows.map((r) => r.userId))].sort();
    };

    fx.cleanup = async () => {
        const users = { in: fx.userIds };
        await raw.notification.deleteMany({ where: { userId: users } }).catch(() => {});
        await raw.checkoutDocument.deleteMany({ where: { checkoutOrder: { applicationId: { in: fx.appIds } } } }).catch(() => {});
        for (const model of ['checkoutOrder', 'revisionDeadline', 'auditChecklist', 'applicationStatusHistory', 'workActivity', 'postAuditTask', 'quotation', 'invoice', 'certificate']) {
            if (raw[model]?.deleteMany) {
                await raw[model].deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
            }
        }
        await raw.application.deleteMany({ where: { id: { in: fx.appIds } } }).catch(() => {});
        await raw.farm.deleteMany({ where: { id: fx.farmId } }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: { in: fx.entityIds } } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: fx.entityIds } } }).catch(() => {});
        await raw.auditLog?.deleteMany({ where: { actorId: users } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: users } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
    };

    return fx;
}

module.exports = { buildApplicantParties };
