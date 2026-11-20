'use strict';
const crypto = require('crypto');
const fs = require('fs');
const fromTree = require('module').createRequire(`${process.cwd()}/`);
const { PrismaClient } = fromTree('@prisma/client');
const authService = fromTree('./services/prisma-auth-service');
const { completeHolderEntity } = fromTree('./test-support/complete-holder');
const { settleMilestones } = fromTree('./test-support/settled-milestones');
const { writeApplicationStatus } = fromTree('./services/application-status-writer');
const { addWorkingDays, startOfLocalDay } = fromTree('./utils/working-days');
const { thaiIdCheckDigit } = fromTree('@gacp/validation/thai-id-checksum');

const OUT = process.argv[2];
if (!OUT) { throw new Error('usage: fixture.js <out.json>'); }
const nid = (prefix) => { const f = (prefix + crypto.randomInt(1e11).toString().padStart(11, '0')).slice(0, 12); return f + thaiIdCheckDigit(f); };
const pw = () => `Wf3!${crypto.randomBytes(9).toString('base64url')}9a`;

(async () => {
    const p = new PrismaClient();
    if (!(await p.organization.findUnique({ where: { slug: 'default' } }))) {
        await p.organization.create({ data: { name: 'ทดสอบ WF3', slug: 'default', code: 'DEFAULT' } });
    }
    const person = async (role, lastName) => {
        const login = nid(role === 'health' ? '1' : '3');
        const password = pw();
        const user = await authService.register({
            ...(role === 'health' ? { healthId: login } : { providerId: login, accountType: 'PROVIDER' }),
            role, password, firstName: 'ทดสอบ', lastName, email: `wf3-${role}-${crypto.randomBytes(3).toString('hex')}@example.test`, phoneNumber: '0800000000',
        });
        await p.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
        return { id: user.id, canonicalId: user.canonicalId, organizationId: user.organizationId, role, login, password };
    };
    const applicant = await person('health', 'ผู้ยื่น');
    const dispatcher = await person('dispatcher', 'ผู้จัดคิว');
    const reviewer = await person('document_reviewer', 'ผู้ตรวจเอกสาร');
    const inspector = await person('field_inspector', 'ผู้ตรวจแปลง');
    const org = applicant.organizationId;
    const entity = await p.entity.create({ data: { ...completeHolderEntity('JURISTIC', { displayName: 'บริษัท สวนสมุนไพร WF3 จำกัด' }), organizationId: org } });
    await p.entityMembership.create({ data: { userId: applicant.id, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: org } });
    if (!(await p.plantSpecies.findUnique({ where: { code: 'KRA' } }))) {
        await p.plantSpecies.create({ data: { code: 'KRA', nameTH: 'กระท่อม', nameEN: 'Kratom' } });
    }

    let seq = 0;
    const application = async (status, { milestones = [], ...extra } = {}) => {
        seq += 1;
        const row = await p.application.create({
            data: {
                applicationNumber: `APP-WF3-${seq}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`, healthId: applicant.canonicalId,
                areaType: 'OUTDOOR', organizationId: org, entityId: entity.id, submitterId: applicant.id, status,
                formData: {
                    workflowState: status, plantId: 'kratom',
                    farmData: {
                        siteName: 'แปลงทดสอบ WF3', siteAddress: '99 หมู่ 1', subDistrict: 'บางกระสอ', district: 'เมืองนนทบุรี',
                        province: 'นนทบุรี', postalCode: '11000', latitude: 13.86, longitude: 100.51,
                    },
                },
                ...extra,
            },
        });
        await settleMilestones(p, { id: row.id, healthId: applicant.canonicalId, organizationId: org }, milestones);
        for (const invoice of await p.invoice.findMany({ where: { applicationId: row.id }, select: { id: true } })) {
            await p.invoice.update({ where: { id: invoice.id }, data: { receiptNumber: `RC-${invoice.id}`, receiptIssuedAt: new Date() } });
        }
        return row;
    };
    const write = (id, fromStatus, toStatus, actor) => writeApplicationStatus({
        prisma: p, applicationId: id, fromStatus, toStatus, actorId: actor ? actor.id : null, actorRole: actor ? actor.role : 'system', reason: 'WALK_FIXTURE',
    });

    const reviewApp = await application('PENDING_DOC_FEE', { milestones: ['M1'] });
    await write(reviewApp.id, 'PENDING_DOC_FEE', 'DOC_FEE_PAID', null);

    const day = startOfLocalDay(addWorkingDays(new Date(), 4));
    const slot = new Date(day.getTime() + 10 * 60 * 60 * 1000);
    const failed = await application('AUDIT_NOT_PASSED', { milestones: ['M1', 'M2'], auditorId: inspector.id, reviewerId: reviewer.id, scheduledDate: slot });
    const toBook = await application('PENDING_AUDIT_FEE', { milestones: ['M1', 'M2'], reviewerId: reviewer.id });
    await write(toBook.id, 'PENDING_AUDIT_FEE', 'AUDIT_FEE_PAID', null);

    const worksheet = await application('AUDIT_CONFIRMED', {
        milestones: ['M1', 'M2'], auditorId: inspector.id, reviewerId: reviewer.id, scheduledDate: new Date(slot.getTime() + 24 * 60 * 60 * 1000),
    });

    const out = {
        applicant, dispatcher, reviewer, inspector, entityId: entity.id,
        reviewApp: { id: reviewApp.id, number: reviewApp.applicationNumber },
        failed: { id: failed.id, number: failed.applicationNumber },
        toBook: { id: toBook.id, number: toBook.applicationNumber },
        worksheet: { id: worksheet.id, number: worksheet.applicationNumber },
        slotDay: slot.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }), slotTime: '10:00',
    };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), { mode: 0o600 });
    console.log(`fixture: review ${reviewApp.applicationNumber} · failed ${failed.applicationNumber} at ${out.slotDay} ${out.slotTime} · to book ${toBook.applicationNumber} · worksheet ${worksheet.applicationNumber}`);
    await p.$disconnect();
    process.exit(0);
})().catch((e) => { console.error('fixture failed:', e.stack || e.message); process.exit(1); });
