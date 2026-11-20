/**
 * scripts/scrub-staff-ids-from-formdata.js against a real Postgres through the
 * application's own prisma client (soft-delete filter and PDPA decrypt included).
 *
 * - A soft-deleted application is scanned and repaired too (security review H2).
 * - A row whose formData could not be decrypted is skipped and counted, never
 *   written back: writing it would replace the ciphertext with the failure marker (H3).
 * - A row changed by someone else between the read and the write is not overwritten (H3).
 * - Dry run counts and writes nothing; a second apply changes nothing.
 */

'use strict';

// Before services/prisma-database is first required: the PDPA extension is wired at
// require time (services/prisma-pdpa-extension.js).
process.env.ENABLE_PDPA_FIELD_ENCRYPTION = 'true';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const STAFF_NATIONAL_ID = '3100000000418';
const UNDECRYPTABLE = 'enc:v1:bm90LWEtcmVhbC1jaXBoZXJ0ZXh0';

d('scrub-staff-ids-from-formdata (real Postgres, app prisma client)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let prisma;
    let withoutTenantScope;
    let run;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { appIds: [], userIds: [] };
    let seq = 0;

    async function application(formData, extra = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-SCRUB-${seq}-${sfx}`, healthId: `scrub-${sfx}`, areaType: 'OUTDOOR',
                organizationId: fx.orgId, status: 'CAR_PENDING', formData: { workflowState: 'CAR_PENDING', ...formData }, ...extra,
            },
        });
        fx.appIds.push(row.id);
        return row.id;
    }

    /** As stored: what Postgres holds, ciphertext included. */
    const storedFormData = async (id) => (await raw.application.findUnique({ where: { id }, select: { formData: true } })).formData;
    /** As the application reads it: decrypted, soft-deleted rows included. */
    const readFormData = async (id) => (await withoutTenantScope(
        () => prisma.application.findUnique({ where: { id }, select: { formData: true } }),
    )).formData;

    /**
     * The script's prisma, narrowed to this suite's rows. `beforeWrite` runs once, after the
     * script read a page and before it writes, to stand in for a concurrent writer.
     */
    function scopedClient({ beforeWrite } = {}) {
        let pending = beforeWrite;
        return {
            application: {
                findMany: async (args) => {
                    const page = await prisma.application.findMany({ ...args, where: { ...args.where, id: { in: fx.appIds } } });
                    if (page.length && pending) { await pending(); pending = null; }
                    return page;
                },
                update: (args) => prisma.application.update(args),
                updateMany: (args) => prisma.application.updateMany(args),
            },
        };
    }

    const findUserByProviderId = (providerId) => raw.user.findFirst({ where: { providerId }, select: { id: true } });
    const scrub = (opts, client = scopedClient()) => withoutTenantScope(() => run({ prisma: client, findUserByProviderId, ...opts }));

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        ({ prisma } = require('../../services/prisma-database'));
        ({ withoutTenantScope } = require('../../services/tenant-context'));
        ({ run } = require('../../scripts/scrub-staff-ids-from-formdata'));
        fx.orgId = (await raw.organization.create({ data: { name: `scrub-${sfx}`, slug: `scrub-${sfx}`, code: `SCRUB_${sfx}`.toUpperCase() } })).id;
        fx.staffId = crypto.randomUUID();
        await raw.user.create({
            data: {
                id: fx.staffId, canonicalId: `scrub-${sfx}`, password: 'x', role: 'document_reviewer', authType: 'PROVIDER_ID',
                providerId: STAFF_NATIONAL_ID, email: `scrub-${sfx}@example.test`, firstName: 'เจ้าหน้าที่', lastName: 'ทดสอบ',
                organizationId: fx.orgId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(fx.staffId);
    });

    afterAll(async () => {
        await raw.application.deleteMany({ where: { id: { in: fx.appIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    test('dry run, apply, a second apply: soft-deleted rows repaired, undecryptable and concurrently changed rows left alone', async () => {
        const live = await application({ reviewHistory: [{ action: 'approve', by: STAFF_NATIONAL_ID }] });
        const deleted = await application({ auditDecision: { decidedBy: STAFF_NATIONAL_ID } }, { isDeleted: true, deletedAt: new Date() });
        const undecryptable = await application({
            applicantData: { idCard: UNDECRYPTABLE },
            carRequest: { requestedBy: STAFF_NATIONAL_ID },
        });
        const raced = await application({ auditExecution: { startedBy: STAFF_NATIONAL_ID } });
        const undecryptableBefore = await storedFormData(undecryptable);

        const dry = await scrub({ apply: false });
        expect(dry).toMatchObject({ scanned: 4, rowsToChange: 3, rowsChanged: 0, decryptFailed: 1, conflicts: 0 });
        expect(JSON.stringify(await readFormData(deleted))).toContain(STAFF_NATIONAL_ID);

        const concurrentFormData = { workflowState: 'CAR_PENDING', auditExecution: { startedBy: STAFF_NATIONAL_ID }, editedMeanwhile: true };
        const applied = await scrub({ apply: true }, scopedClient({
            beforeWrite: async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                await raw.application.update({ where: { id: raced }, data: { formData: concurrentFormData } });
            },
        }));
        expect(applied).toMatchObject({ scanned: 4, rowsToChange: 3, rowsChanged: 2, decryptFailed: 1, conflicts: 1 });

        expect((await readFormData(live)).reviewHistory[0].by).toBe(fx.staffId);
        expect((await readFormData(deleted)).auditDecision.decidedBy).toBe(fx.staffId);
        expect(await storedFormData(undecryptable)).toEqual(undecryptableBefore);
        expect(JSON.stringify(await storedFormData(undecryptable))).not.toContain('PII_DECRYPT_FAILED');
        expect(await storedFormData(raced)).toEqual(concurrentFormData);

        const second = await scrub({ apply: true });
        expect(second).toMatchObject({ rowsToChange: 1, rowsChanged: 1, decryptFailed: 1, conflicts: 0 });
        expect((await readFormData(raced)).auditExecution.startedBy).toBe(fx.staffId);
        expect((await readFormData(raced)).editedMeanwhile).toBe(true);

        const third = await scrub({ apply: true });
        expect(third).toMatchObject({ rowsToChange: 0, rowsChanged: 0, replaced: 0, dropped: 0, decryptFailed: 1, conflicts: 0 });
        expect(await storedFormData(undecryptable)).toEqual(undecryptableBefore);
        for (const id of [live, deleted, raced]) {
            expect(JSON.stringify(await readFormData(id))).not.toMatch(/\d{13}/);
        }
    });
});
