'use strict';

/*
 * Seeds the scratch database with what the round-5 screenshots show and mints the session tokens.
 * Writes the ids and tokens to a 0600 JSON file; prints nothing secret.
 * usage: node shot-seed.js <out.json>   (env from shot.env)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKEND = '/home/ubuntu/work/wt-dispatcher/apps/backend';
const { createDispatcherWorld } = require(path.join(BACKEND, '__tests__/integration/fixtures/dispatcher-world'));
const realFiling = require(path.join(BACKEND, '__tests__/fixtures/v2-wizard-real-filing.json'));
const jwtSecurity = require(path.join(BACKEND, 'config/jwt-security'));
const { addWorkingDays, startOfLocalDay } = require(path.join(BACKEND, 'utils/working-days'));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const PLACE = {
    siteName: 'แปลงสาธิตบ้านดอยคำ', siteAddress: '12 หมู่ 3', subDistrict: 'ริมใต้', district: 'แม่ริม', province: 'เชียงใหม่',
    postalCode: '50180', latitude: 18.9136, longitude: 98.9443,
};
const SOMEONE_ELSE = { siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '086-555-6666', siteContactIsApplicant: false, siteContactInformed: true };

async function main() {
    const out = process.argv[2];
    const world = await createDispatcherWorld({ tag: 'shot5' });
    const { raw, fx } = world;

    const rename = (id, firstName, lastName) => raw.user.update({ where: { id }, data: { firstName, lastName } });
    await raw.organization.update({ where: { id: fx.orgA }, data: { name: 'สำนักงานตรวจรับรองตัวอย่าง' } });
    await rename(fx.dispatcherA.id, 'มานี', 'จัดคิวดี');
    await rename(fx.reviewerA.id, 'สมศรี', 'ตรวจเอกสาร');
    await rename(fx.inspectorA.id, 'วิชัย', 'ลงแปลง');
    await rename(fx.inspectorA2.id, 'อำนาจ', 'ตรวจไว');
    await rename(fx.approverA.id, 'ปรีชา', 'ออกใบรับรอง');
    await rename(fx.applicant.id, 'สมชาย', 'ใจดี');
    await rename(fx.holderMember.id, 'สมหญิง', 'ใจดี');
    await raw.entity.update({ where: { id: fx.entityA }, data: { displayName: 'บริษัท ดอยคำสมุนไพร จำกัด' } });

    const filing = (farm, extra = {}) => ({
        applicantData: { fullName: 'สมชาย ใจดี', phone: '081-234-5678', email: 'somchai@example.test' }, farmData: { ...PLACE, ...farm }, ...extra,
    });
    const settleM2 = (applicationId, settledAt) => raw.checkoutOrder.updateMany({
        where: { applicationId, milestone: 'M2' }, data: { settledAt, paymentTermsVersion: 'payment-terms-th-v1.3' },
    });

    // Wizard step 3: the applicant's draft, steps 1-2 answered, no one on site yet.
    const { siteContactName: _n, sitePhone: _p, siteContactIsApplicant: _a, ...realFarm } = realFiling.farmData;
    const draft = await world.application('DRAFT', { formData: { ...realFiling, workflowState: 'DRAFT', farmData: realFarm } });

    // Success step: filed and the first instalment paid.
    const filed = await world.settledInto('DOC_FEE_PAID', { formData: filing(SOMEONE_ELSE) });

    // Booking dialog: one names someone on site, one does not and was asked two hours ago and is late.
    const ready = await world.settledInto('AUDIT_FEE_PAID', { reviewerId: fx.reviewerA.id, formData: filing(SOMEONE_ELSE) });
    await settleM2(ready.id, new Date(Date.now() - 2 * DAY));
    const noContact = await world.settledInto('AUDIT_FEE_PAID', {
        reviewerId: fx.reviewerA.id, formData: filing({}, { siteContactRequest: { sentAt: new Date(Date.now() - 2 * HOUR).toISOString() } }),
    });
    await settleM2(noContact.id, new Date(Date.now() - 120 * DAY));

    // The field inspector's booked visit.
    const visitAt = new Date(startOfLocalDay(addWorkingDays(new Date(), 3)).getTime() + 9 * HOUR);
    const visit = await world.application('AUDIT_CONFIRMED', {
        milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA.id, scheduledDate: visitAt,
        formData: filing(SOMEONE_ELSE, { auditSchedule: { scheduledDate: visitAt.toISOString(), auditorId: fx.inspectorA.id, location: PLACE.siteName, estimatedDuration: 120, scheduledAt: new Date().toISOString() } }),
    });
    await raw.auditChecklist.create({ data: { applicationId: visit.id, auditorId: fx.inspectorA.id, organizationId: fx.orgA, status: 'IN_PROGRESS', createdBy: fx.dispatcherA.id } }).catch(() => null);

    // The applicant's application page: a visit booked late, then the inspector moved for conflict of interest.
    const visitedAt = new Date(Date.now() - 5 * DAY);
    const bookedAt = new Date(Date.now() - 12 * DAY).toISOString();
    const lateSchedule = {
        scheduledDate: visitedAt.toISOString(), auditorId: fx.inspectorA.id, location: PLACE.siteName, estimatedDuration: 120, scheduledAt: bookedAt,
        statedReasons: { lateVisit: { reasonCode: 'NO_INSPECTOR_AVAILABLE', reasonText: null, side: 'INSPECTION_BODY', inspectBy: new Date(Date.now() - 14 * DAY).toISOString() } },
    };
    const coiMove = {
        from: fx.inspectorA.id, to: fx.inspectorA2.id, reason: 'พบว่าผู้ตรวจพื้นที่คนเดิมมีส่วนได้เสียกับผู้ยื่นหรือสถานที่ปลูก',
        reasonCode: 'CONFLICT_OF_INTEREST', reasonText: null, side: 'INSPECTION_BODY', statedReasons: null,
        reassignedBy: fx.dispatcherA.id, reassignedAt: new Date(Date.now() - 2 * DAY).toISOString(),
    };
    const moved = await world.application('CAR_PENDING', {
        milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA2.id, scheduledDate: visitedAt,
        formData: filing(SOMEONE_ELSE, {
            auditSchedule: lateSchedule, _reassignmentHistory: [coiMove], auditorName: 'อำนาจ ตรวจไว',
            carDueAt: new Date(Date.now() + 25 * DAY).toISOString(), carRequestedAt: visitedAt.toISOString(),
        }),
    });

    // The certificate approver's decision file, flagged by the same move.
    const decided = await world.application('AUDIT_PASSED', {
        milestones: ['M1', 'M2'], reviewerId: fx.reviewerA.id, auditorId: fx.inspectorA2.id, scheduledDate: visitedAt,
        formData: filing(SOMEONE_ELSE, { auditSchedule: lateSchedule, _reassignmentHistory: [coiMove], auditorName: 'อำนาจ ตรวจไว' }),
    });

    // The certificates dashboard: one expiring within 30 days, one valid for the year.
    const certificateIds = [];
    const firstNumber = 100 + (Math.floor(Date.now() / 1000) % 8000);
    const farmIds = [];
    for (const [days, place] of [[21, 'แปลงสาธิตบ้านดอยคำ'], [300, 'แปลงสาธิตห้วยตึงเฒ่า']]) {
        const farm = await raw.farm.create({
            data: {
                ownerId: fx.applicant.id, farmName: place, farmType: 'CULTIVATION', address: '12 หมู่ 3', province: 'เชียงใหม่', district: 'แม่ริม', subDistrict: 'ริมใต้',
                postalCode: '50180', totalArea: 1, cultivationArea: 1, cultivationMethod: 'OUTDOOR', organizationId: fx.orgA,
            },
        });
        farmIds.push(farm.id);
        const row = await world.application('CERTIFIED', { milestones: ['M1', 'M2'], formData: filing(SOMEONE_ELSE) });
        const cert = await raw.certificate.create({
            data: {
                certificateNumber: `TH-GACP ${firstNumber + certificateIds.length}/2569`, verificationCode: crypto.randomUUID().slice(0, 12), qrData: 'shot', applicationId: row.id,
                userId: fx.applicant.id, farmId: farm.id, farmName: place, applicantName: 'บริษัท ดอยคำสมุนไพร จำกัด', cropType: 'กัญชา', farmSize: 1,
                province: 'เชียงใหม่', district: 'แม่ริม', subDistrict: 'ริมใต้', standardId: 'gacp-dtam', standardName: 'GACP', status: 'active',
                expiryDate: new Date(Date.now() + days * DAY), validityMonths: 12, issuedBy: fx.approverA.id, organizationId: fx.orgA,
                holderType: 'JURISTIC', holderDisplayName: 'บริษัท ดอยคำสมุนไพร จำกัด', submittedByUserId: fx.applicant.id,
            },
        });
        certificateIds.push(cert.id);
    }

    const providerToken = (user) => jwtSecurity.generateToken({
        id: user.id, userId: user.id, role: user.role, canonicalRole: user.role, organizationId: user.organizationId,
    }, 'provider', { expiresIn: '4h' });
    const applicantToken = jwtSecurity.generateToken({
        id: fx.applicant.id, userId: fx.applicant.id, role: 'health', canonicalRole: 'health', organizationId: fx.orgA,
    }, 'public', { expiresIn: '4h' });

    const fixture = {
        orgA: fx.orgA,
        applicant: { id: fx.applicant.id, firstName: 'สมชาย', lastName: 'ใจดี', phoneNumber: '0891112222', role: 'health' },
        plantId: realFiling.plantId,
        requestType: realFiling.requestType,
        ids: { draft: draft.id, filed: filed.id, ready: ready.id, noContact: noContact.id, visit: visit.id, moved: moved.id, decided: decided.id },
        numbers: { draft: draft.applicationNumber, filed: filed.applicationNumber, ready: ready.applicationNumber, noContact: noContact.applicationNumber, visit: visit.applicationNumber, moved: moved.applicationNumber, decided: decided.applicationNumber },
        tokens: { dispatcher: providerToken(fx.dispatcherA), inspector: providerToken(fx.inspectorA), approver: providerToken(fx.approverA), applicant: applicantToken },
        made: world.made,
        certificateNumbers: certificateIds.map((_, index) => `TH-GACP ${firstNumber + index}/2569`),
        extra: { certificateIds, farmIds },
    };
    fs.writeFileSync(out, JSON.stringify(fixture), { mode: 0o600 });
    await raw.$disconnect();
    console.log('seeded', Object.keys(fixture.ids).length, 'applications and', certificateIds.length, 'certificates');
}

main().catch((error) => { console.error('seed failed:', error.message); process.exit(1); });
