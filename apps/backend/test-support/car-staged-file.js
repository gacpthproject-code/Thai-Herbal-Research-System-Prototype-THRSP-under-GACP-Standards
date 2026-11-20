'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BASE_UPLOAD_DIR } = require('../services/uploads-root');

const CAR_DIR = path.join(BASE_UPLOAD_DIR, 'car');
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(`%${' '.repeat(4096)}\n%%EOF\n`)]);

async function stageCarFile(prisma, applicationId, { findingNo = 1 } = {}) {
    const filename = `CAR-test-${Date.now()}-${crypto.randomInt(1_000_000_000)}.pdf`;
    fs.mkdirSync(CAR_DIR, { recursive: true });
    fs.writeFileSync(path.join(CAR_DIR, filename), PDF);
    const entry = {
        id: filename, filename, findingNo, originalName: 'หลักฐาน.pdf', path: `/uploads/car/${filename}`,
        size: PDF.length, mimeType: 'application/pdf', uploadedAt: new Date().toISOString(),
    };
    await prisma.$executeRaw`
        UPDATE applications SET "formData" = jsonb_set(
            COALESCE("formData", '{}'::jsonb), '{carStagedFiles}',
            COALESCE("formData"->'carStagedFiles', '[]'::jsonb) || jsonb_build_array(${JSON.stringify(entry)}::jsonb))
        WHERE id = ${applicationId}`;
    return entry;
}

const carRoundFiles = (staged) => staged.map((entry) => ({ id: entry.id, findingNo: entry.findingNo }));

module.exports = { stageCarFile, carRoundFiles, CAR_DIR };
