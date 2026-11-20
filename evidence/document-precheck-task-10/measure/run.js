'use strict';
// Runs the document-precheck queue processor ONCE, in this process, against a
// PENDING row seeded on the scratch Postgres, for /measure/scan-3page.pdf.
process.chdir('/app/apps/backend');
const { PrismaClient } = require('/app/apps/backend/node_modules/@prisma/client');
(async () => {
    const raw = new PrismaClient();
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const org = await raw.organization.create({ data: { name: 'measure org', slug: `measure-${s}`, code: `MEAS_${s}`.toUpperCase().slice(0, 24) } });
    const canonicalId = `measure-${s}`;
    await raw.user.create({ data: { canonicalId, password: 'x', organizationId: org.id, authType: 'EMAIL_LEGACY', firstName: 'สมชาย', lastName: 'ใจดี' } });
    const app = await raw.application.create({ data: { applicationNumber: `MEAS-${s}`, healthId: canonicalId, areaType: 'OUTDOOR', organizationId: org.id, status: 'DRAFT' } });
    const pc = await raw.documentPrecheck.create({ data: { organizationId: org.id, applicationId: app.id, documentId: `doc-${s}`, slotId: 'company_reg', status: 'PENDING', rulesVersion: 1 } });
    const rssBefore = process.memoryUsage().rss;
    const processor = require('/app/apps/backend/jobs/document-precheck-processor.js');
    const t0 = process.hrtime.bigint();
    await processor({ data: { precheckId: pc.id, absPath: '/measure/scan-3page.pdf', mimeType: 'application/pdf' }, attemptsMade: 0, opts: { attempts: 2 } });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const row = await raw.documentPrecheck.findUnique({ where: { id: pc.id }, select: { status: true, extractMethod: true, pageCount: true, ocrConfidence: true, flags: { select: { check: true, result: true } } } });
    console.log(JSON.stringify({
        wallMs: Math.round(ms),
        status: row.status, extractMethod: row.extractMethod, pageCount: row.pageCount, ocrConfidence: row.ocrConfidence,
        flags: row.flags.map((f) => `${f.check}:${f.result}`).sort(),
        selfRssBeforeMiB: +(rssBefore / 1048576).toFixed(1),
        selfMaxRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
    }));
    await raw.$disconnect();
    process.exit(0);
})().catch((e) => { console.error('RUN FAILED', e && e.message); process.exit(1); });
