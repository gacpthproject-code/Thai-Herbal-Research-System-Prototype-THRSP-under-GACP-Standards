'use strict';

/*
 * Seeds the round-6 scratch database with what the booking-dialog and inspector-page screenshots show,
 * and mints the session tokens. Writes ids and tokens to a 0600 JSON file; prints nothing secret.
 * usage: node shot-seed.js <out.json>   (env from shot.env)
 *
 * Per screen size: one application whose filing names someone on site and is not late, and one with no
 * one on site whose inspection date has passed. The field inspector วิชัย ลงแปลง already holds five
 * visits in the next five working days (the cap, order 56(1) 2.2) and at most two a day (2.3), so the
 * late booking is asked for both the late-visit and the over-cap reason before it saves.
 */

const fs = require('fs');
const path = require('path');

const BACKEND = '/home/ubuntu/work/wt-dispatcher/apps/backend';
const { createDispatcherWorld } = require(path.join(BACKEND, '__tests__/integration/fixtures/dispatcher-world'));
const jwtSecurity = require(path.join(BACKEND, 'config/jwt-security'));
const { addWorkingDays, startOfLocalDay } = require(path.join(BACKEND, 'utils/working-days'));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const PLACE = {
    siteName: 'แปลงสาธิตบ้านดอยคำ', siteAddress: '12 หมู่ 3', subDistrict: 'ริมใต้', district: 'แม่ริม', province: 'เชียงใหม่',
    postalCode: '50180', latitude: 18.9136, longitude: 98.9443,
};
const SOMEONE_ELSE = { siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '086-555-6666', siteContactIsApplicant: false, siteContactInformed: true };

/** A Bangkok working day `days` ahead at `hour`:00. */
const workingDayAt = (days, hour) => new Date(startOfLocalDay(addWorkingDays(new Date(), days)).getTime() + hour * HOUR);
const bangkokIsoDay = (date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

async function main() {
    const out = process.argv[2];
    const world = await createDispatcherWorld({ tag: 'shot6' });
    const { raw, fx } = world;

    const rename = (id, firstName, lastName) => raw.user.update({ where: { id }, data: { firstName, lastName } });
    await raw.organization.update({ where: { id: fx.orgA }, data: { name: 'สำนักงานตรวจรับรองตัวอย่าง' } });
    await rename(fx.dispatcherA.id, 'มานี', 'จัดคิวดี');
    await rename(fx.reviewerA.id, 'สมศรี', 'ตรวจเอกสาร');
    await rename(fx.inspectorA.id, 'วิชัย', 'ลงแปลง');
    await rename(fx.inspectorA2.id, 'อำนาจ', 'ตรวจไว');
    await rename(fx.applicant.id, 'สมชาย', 'ใจดี');
    await raw.entity.update({ where: { id: fx.entityA }, data: { displayName: 'บริษัท ดอยคำสมุนไพร จำกัด' } });

    const filing = (farm, extra = {}) => ({
        applicantData: { fullName: 'สมชาย ใจดี', phone: '081-234-5678', email: 'somchai@example.test' }, farmData: { ...PLACE, ...farm }, ...extra,
    });
    const settleM2 = (applicationId, settledAt) => raw.checkoutOrder.updateMany({
        where: { applicationId, milestone: 'M2' }, data: { settledAt, paymentTermsVersion: 'payment-terms-th-v1.3' },
    });
    const bookedVisit = async (visitAt) => world.application('AUDIT_CONFIRMED', {
        milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitAt,
        formData: filing(SOMEONE_ELSE, {
            auditSchedule: { scheduledDate: visitAt.toISOString(), auditorId: fx.inspectorA.id, location: PLACE.siteName, estimatedDuration: 120, scheduledAt: new Date().toISOString() },
        }),
    });

    const booking = {};
    for (const size of ['desktop', 'phone']) {
        const ready = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: filing(SOMEONE_ELSE) });
        await settleM2(ready.id, new Date(Date.now() - 2 * DAY));
        const late = await world.settledInto('AUDIT_FEE_PAID', {
            reviewerId: fx.reviewerA.id, formData: filing({}, { siteContactRequest: { sentAt: new Date(Date.now() - 2 * HOUR).toISOString() } }),
        });
        await settleM2(late.id, new Date(Date.now() - 120 * DAY));
        booking[size] = { ready: ready.applicationNumber, late: late.applicationNumber };
    }

    // The inspector's visit the inspector page opens, and four more: five in the cap's window, two at most a day.
    const visit = await bookedVisit(workingDayAt(3, 9));
    await raw.auditChecklist.create({ data: { applicationId: visit.id, auditorId: fx.inspectorA.id, organizationId: fx.orgA, status: 'IN_PROGRESS', createdBy: fx.dispatcherA.id } }).catch(() => null);
    for (const [days, hour] of [[1, 9], [1, 13], [2, 9], [4, 9]]) {
        await bookedVisit(workingDayAt(days, hour));
    }

    const providerToken = (user) => jwtSecurity.generateToken({
        id: user.id, userId: user.id, role: user.role, canonicalRole: user.role, organizationId: user.organizationId,
    }, 'provider', { expiresIn: '4h' });

    const fixture = {
        booking,
        // The late booking goes to a day the inspector holds one visit on, at 13:00 Bangkok.
        lateVisitDay: { desktop: bangkokIsoDay(workingDayAt(2, 9)), phone: bangkokIsoDay(workingDayAt(4, 9)) },
        inspectorName: 'วิชัย ลงแปลง',
        ids: { visit: visit.id },
        numbers: { visit: visit.applicationNumber },
        tokens: { dispatcher: providerToken(fx.dispatcherA), inspector: providerToken(fx.inspectorA) },
        made: world.made,
    };
    fs.writeFileSync(out, JSON.stringify(fixture), { mode: 0o600 });
    await raw.$disconnect();
    console.log('seeded', 4 + 5, 'applications');
}

main().catch((error) => { console.error('seed failed:', error.message); process.exit(1); });
