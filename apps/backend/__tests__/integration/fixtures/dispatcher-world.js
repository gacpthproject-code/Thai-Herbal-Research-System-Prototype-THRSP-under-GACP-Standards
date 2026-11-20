'use strict';

/**
 * The world the dispatcher's and the field inspector's doors are tested in, on real Postgres: two
 * organizations, their staff, a holder company with two members (the applicant and one more), and
 * applications seated at any status with the payments that status needs. cleanup() removes every
 * row it made.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { settleMilestones } = require('../../../test-support/settled-milestones');
const { addWorkingDays, startOfLocalDay } = require('../../../utils/working-days');

async function createDispatcherWorld({ tag }) {
    const raw = new PrismaClient();
    await raw.$connect();
    const sfx = crypto.randomUUID().slice(0, 8);
    const made = { userIds: [], entityIds: [], appIds: [], orgIds: [] };
    let seq = 0;
    let slotDay = 3;

    async function staff(role, organizationId) {
        const id = crypto.randomUUID();
        seq += 1;
        const key = `${tag}-${seq}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId: key, password: 'x', role, authType: 'PROVIDER_ID', providerId: key, email: `${key}@example.test`,
                firstName: `เจ้าหน้าที่${seq}`, lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        made.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function healthUser(name, organizationId, { email, phoneNumber } = {}) {
        const id = crypto.randomUUID();
        const key = `${tag}-${name}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId: key, healthId: key, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: email || `${key}@example.test`, phoneNumber: phoneNumber || null, firstName: name, lastName: 'ทดสอบ', organizationId,
            },
        });
        made.userIds.push(id);
        return { id, canonicalId: key };
    }

    const fx = {};
    for (const side of ['A', 'B']) {
        const org = await raw.organization.create({ data: { name: `${tag}-${side}-${sfx}`, slug: `${tag}-${side.toLowerCase()}-${sfx}`, code: `${tag}${side}_${sfx}`.toUpperCase() } });
        made.orgIds.push(org.id);
        fx[`org${side}`] = org.id;
    }
    fx.dispatcherA = await staff('dispatcher', fx.orgA);
    fx.dispatcherB = await staff('dispatcher', fx.orgB);
    fx.reviewerA = await staff('document_reviewer', fx.orgA);
    fx.reviewerA2 = await staff('document_reviewer', fx.orgA);
    fx.inspectorA = await staff('field_inspector', fx.orgA);
    fx.inspectorA2 = await staff('field_inspector', fx.orgA);
    fx.adminA = await staff('system_admin_dtam', fx.orgA);
    fx.approverA = await staff('certificate_approver', fx.orgA);
    fx.applicant = await healthUser('applicant', fx.orgA, { email: `${tag}-applicant-mail-${sfx}@example.test`, phoneNumber: '0891112222' });
    fx.holderMember = await healthUser('holder', fx.orgA);
    fx.entityA = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท ${tag}-a ${sfx} จำกัด`, organizationId: fx.orgA } })).id;
    fx.entityB = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท ${tag}-b ${sfx} จำกัด`, organizationId: fx.orgB } })).id;
    made.entityIds.push(fx.entityA, fx.entityB);
    for (const userId of [fx.applicant.id, fx.holderMember.id]) {
        await raw.entityMembership.create({ data: { userId, entityId: fx.entityA, role: 'ADMIN', status: 'ACTIVE', organizationId: fx.orgA } });
    }

    /** a working day ahead, 09:00 Bangkok, each call a different day so the per-day cap never interferes */
    function nextSlot() {
        slotDay += 1;
        const day = startOfLocalDay(addWorkingDays(new Date(), slotDay));
        return new Date(day.getTime() + 9 * 60 * 60 * 1000);
    }

    async function application(status, { milestones = [], org = fx.orgA, formData = {}, ...extra } = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-${tag}-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: org, entityId: org === fx.orgA ? fx.entityA : fx.entityB, submitterId: fx.applicant.id, status,
                formData: {
                    workflowState: status,
                    farmData: {
                        siteName: 'แปลงทดสอบผู้จัดคิว', siteAddress: '99 หมู่ 1', subDistrict: 'ทดสอบ', district: 'เมือง',
                        province: 'เชียงใหม่', postalCode: '50000', latitude: 18.7883, longitude: 98.9853,
                    },
                    ...formData,
                },
                ...extra,
            },
        });
        made.appIds.push(row.id);
        await settleMilestones(raw, { id: row.id, healthId: fx.applicant.canonicalId, organizationId: org }, milestones);
        for (const invoice of await raw.invoice.findMany({ where: { applicationId: row.id }, select: { id: true } })) {
            await raw.invoice.update({ where: { id: invoice.id }, data: { receiptNumber: `RC-${invoice.id}`, receiptIssuedAt: new Date() } });
        }
        return row;
    }

    /** the settlement's own write: SYSTEM moves a paid application into the dispatcher's queue */
    async function settledInto(toStatus, extra = {}) {
        const { writeApplicationStatus } = require('../../../services/application-status-writer');
        const fromStatus = toStatus === 'DOC_FEE_PAID' ? 'PENDING_DOC_FEE' : 'PENDING_AUDIT_FEE';
        const row = await application(fromStatus, { milestones: toStatus === 'DOC_FEE_PAID' ? ['M1'] : ['M1', 'M2'], ...extra });
        await writeApplicationStatus({
            prisma: raw, applicationId: row.id, fromStatus, toStatus, actorId: null, actorRole: 'system', reason: 'TEST_SETTLED',
        });
        return row;
    }

    /**
     * `client` with application.findMany narrowed to this world's rows: a job that reads every
     * application in the database then acts on this file's rows only, never on another file's that
     * runs at the same time.
     */
    function narrowedToThisWorld(client) {
        return new Proxy(client, {
            get(target, prop) {
                if (prop === 'application') {
                    return new Proxy(target.application, {
                        get(model, op) {
                            if (op === 'findMany') {
                                return (args = {}) => model.findMany({ ...args, where: { ...(args.where || {}), id: { in: made.appIds } } });
                            }
                            const value = model[op];
                            return typeof value === 'function' ? value.bind(model) : value;
                        },
                    });
                }
                const value = target[prop];
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
    }

    const rowOf = (id) => raw.application.findUnique({
        where: { id }, select: { status: true, reviewerId: true, auditorId: true, scheduledDate: true, formData: true, version: true },
    });

    async function cleanup() {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: made.appIds } };
        for (const model of ['checkoutOrder', 'workActivity', 'revisionDeadline', 'correctionRound', 'invoice', 'auditChecklist']) {
            await wipe(model, byApp);
        }
        await wipe('notification', { userId: { in: made.userIds } });
        await wipe('auditLog', { organizationId: { in: made.orgIds } });
        await wipe('auditLog', { resourceId: { in: made.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: made.userIds } });
        await wipe('application', { id: { in: made.appIds } });
        await wipe('entityMembership', { entityId: { in: made.entityIds } });
        await wipe('entity', { id: { in: made.entityIds } });
        await wipe('user', { id: { in: made.userIds } });
        await wipe('organization', { id: { in: made.orgIds } });
        await raw.$disconnect();
    }

    return { raw, fx, made, staff, healthUser, application, settledInto, nextSlot, rowOf, narrowedToThisWorld, cleanup };
}

module.exports = { createDispatcherWorld };
