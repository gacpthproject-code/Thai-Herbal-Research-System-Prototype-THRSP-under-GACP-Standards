'use strict';

// usage, from apps/backend with the scratch database env (no row is read or written):
//   node render-quotation.js <out-dir> <label> [scopes]

const fs = require('fs');
const path = require('path');

const backend = path.resolve(__dirname, '../../apps/backend');
const quotationService = require(path.join(backend, 'services/quotation-service'));
const tpl = require(path.join(backend, 'services/pdf/invoice-template-service'));
const pdfGenerator = require(path.join(backend, 'services/pdf/pdf-generator.service'));

const [outDir, label, scopesArg] = process.argv.slice(2);
const AREA_TYPES = ['OUTDOOR', 'GREENHOUSE', 'INDOOR'].slice(0, Number(scopesArg) || 1);

const application = {
    id: 'app-render-demo',
    applicationNumber: 'APP-2569-DEMO01',
    submittedAt: new Date('2026-10-09T03:00:00Z'),
    cultivationScopeCount: AREA_TYPES.length,
    formData: {
        plantId: 'cannabis',
        farmName: 'ฟาร์มตัวอย่าง',
        cultivationMethods: AREA_TYPES,
        farmData: { areaTypes: AREA_TYPES, farmName: 'ฟาร์มตัวอย่าง' },
        applicantData: {
            firstName: 'สมชาย', lastName: 'ตัวอย่าง', phone: '0812345678',
            address: '99 หมู่ 1 ตำบลทดสอบ', district: 'อำเภอเมืองนนทบุรี', province: 'จังหวัดนนทบุรี', postalCode: '11000',
        },
    },
    entity: { id: 'e-demo', type: 'JURISTIC', displayName: 'บริษัท ตัวอย่างเกษตร จำกัด', juristicId: '0105561234560' },
};

async function main() {
    const fees = quotationService._internals.resolveBillableFees(application);
    const row = {
        quotationNumber: 'QT-PRD-2569-000123',
        issuerType: 'PLATFORM',
        status: 'PENDING',
        subtotal: fees.serviceFeeTotal,
        vat: fees.vatTotal,
        totalAmount: fees.grandTotal,
        installments: quotationService._internals.buildInstallments(fees).company,
        validUntil: new Date('2026-10-20T00:00:00Z'),
    };
    const accepted = { ...row, status: 'ACCEPTED', acceptedSnapshot: quotationService.buildAcceptanceSnapshot(row) };
    fs.mkdirSync(outDir, { recursive: true });
    for (const phase of [1, 2]) {
        const pdf = await tpl.generateQuotationPdf(
            { application, issuerSide: 'PLATFORM', phase, quotationRow: accepted },
            { quotationNumber: accepted.quotationNumber },
        );
        const file = path.join(outDir, `${label}-phase${phase}.pdf`);
        fs.writeFileSync(file, pdf);
        process.stdout.write(`${file} ${pdf.length} bytes\n`);
    }
    process.stdout.write(`row total ${row.totalAmount} = ${row.installments.map((it) => it.amount).join(' + ')}\n`);
    const instance = pdfGenerator.default || pdfGenerator;
    if (instance.browser) { await instance.browser.close(); }
}

main().then(() => process.exit(0), (error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
