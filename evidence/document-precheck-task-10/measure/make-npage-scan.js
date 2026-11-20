'use strict';
// Builds one scanned 3-page A4 PDF (company registration certificate text),
// each page a full-page greyscale PNG rendered by make-corpus.js's renderPagePng
// (the corpus's own page renderer) and embedded as the page's only object.
const path = require('path');
const fs = require('fs');
const backend = process.argv[2];
const out = process.argv[3];
const sharp = require(path.join(backend, 'node_modules', 'sharp'));
const { TEMPLATES, renderPagePng, writePdf } = require(path.join(backend, 'scripts/document-precheck/make-corpus.js'));
const N = Number(process.argv[4] || 3);
const A4 = [595.28, 841.89];
(async () => {
    const base = TEMPLATES.company_reg({
        entity: 'บริษัท สมุนไพรทดสอบ จำกัด',
        juristicId: '0105568045932',
        director: 'นายสมชาย ใจดี',
        issueDate: '1 กันยายน พ.ศ. 2569',
    });
    const pages = [];
    for (let p = 0; p < N; p++) {
        // ~27 lines fills an A4 page at the corpus's 60 px line height and 1240 px width (150 dpi).
        const lines = [];
        while (lines.length < 27) {lines.push(...base);}
        lines.length = 27;
        lines[0] = `${base[0]}  หน้า ${p + 1}/${N}`;
        pages.push(await renderPagePng(lines));
    }
    await writePdf(out, (doc) => {
        pages.forEach((png, i) => {
            if (i > 0) {doc.addPage({ size: A4, margin: 0 });}
            doc.image(png, 0, 0, { fit: A4, align: 'center', valign: 'top' });
        });
    }, { size: A4, margin: 0 });
    for (const [i, png] of pages.entries()) {
        const m = await sharp(png).metadata();
        console.log(`page ${i + 1}: ${m.width}x${m.height} px png`);
    }
    console.log(`${out}: ${fs.statSync(out).size} bytes`);
})().catch((e) => { console.error(e); process.exit(1); });
