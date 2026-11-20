'use strict';
/**
 * Scratch-DB seed for the PromptPay walk (2026-09-27). Runs ONLY against the
 * throwaway container qr-walk-pg (127.0.0.1:55461) — refuses any other URL.
 *
 * What it writes, and why it is seeded rather than walked:
 *   - a JURISTIC entity owned by the walk farmer (registered through the real
 *     POST /api/auth/health/register door), with a contact email, because the
 *     operator's ruling is that a company holds its own certificate and the
 *     entity contact email is the first source of the payer email;
 *   - one application at PENDING_DOC_FEE (M1 payable) for that entity.
 * Mode `personal` (the email-input walk) skips the company and files the
 * application under the user's own INDIVIDUAL workspace, which has no contact
 * email — so the payer email falls through to the user, who registered with
 * none, and the screen has to ask.
 * Everything after this — quotation issuance, acceptance, the payment-terms
 * consent, the checkout, Stripe, the webhook, settlement, the receipt — runs
 * through the real doors.
 */
const { PrismaClient } = require('@prisma/client');

const url = process.env.DATABASE_URL || '';
if (!url.includes('127.0.0.1:55461/gacp_walk')) {
    console.error('refusing: not the scratch walk database');
    process.exit(2);
}

function juristicId() {
    const d = [0, 1, 0, 5, 5, 6, 9, 0, 2, 7, 0, 1];
    const s = d.reduce((acc, x, i) => acc + x * (13 - i), 0);
    return d.join('') + String((11 - (s % 11)) % 10);
}

(async () => {
    const prisma = new PrismaClient();
    const nid = process.argv[2];
    const mode = process.argv[3] || 'company';
    const user = await prisma.user.findFirst({ where: { canonicalId: nid } });
    if (!user) { throw new Error('walk farmer not registered'); }
    const org = await prisma.organization.findFirst({ where: { slug: 'default' } });
    let entity;
    if (mode === 'personal') {
        const m = await prisma.entityMembership.findFirst({
            where: { userId: user.id, role: 'OWNER', entity: { type: 'INDIVIDUAL' } },
            include: { entity: true },
        });
        entity = m.entity;
    } else {
    entity = await prisma.entity.create({
        data: {
            type: 'JURISTIC',
            displayName: 'บริษัท ทดสอบพร้อมเพย์ จำกัด',
            juristicId: juristicId(),
            organizationId: org.id,
            createdBy: user.id,
            payload: {
                companyType: 'LIMITED',
                contact: { name: 'ฝ่ายบัญชี', phone: '021234567', email: 'accounts@qr-walk-company.example' },
            },
        },
    });
    await prisma.entityMembership.create({
        data: {
            userId: user.id, entityId: entity.id, organizationId: org.id,
            role: 'OWNER', status: 'ACTIVE', acceptedAt: new Date(),
        },
    });
    }
    const app = await prisma.application.create({
        data: {
            applicationNumber: `APP-QRWALK-${Date.now()}`,
            healthId: user.canonicalId,
            entityId: entity.id,
            organizationId: org.id,
            areaType: 'OUTDOOR',
            status: 'PENDING_DOC_FEE',
            cultivationScopeCount: 1,
            formData: { cultivationMethods: ['outdoor'], applicantType: mode === 'personal' ? 'INDIVIDUAL' : 'JURISTIC' },
        },
    });
    console.log(JSON.stringify({ entityId: entity.id, applicationId: app.id, applicationNumber: app.applicationNumber }));
    await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
