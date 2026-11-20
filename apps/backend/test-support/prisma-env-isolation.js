'use strict';

const fs = require('fs');
const path = require('path');
const { prismaEnvFiles } = require('../config/prisma-env-files');

const HIDDEN = Symbol.for('gacp.test.hiddenPrismaEnvFiles');

/**
 * Prisma reads an env file only after fs.existsSync says it is there.
 */
function hidePrismaEnvFiles(files = prismaEnvFiles()) {
    let hidden = fs.existsSync[HIDDEN];
    if (!hidden) {
        const existsSync = fs.existsSync;
        hidden = new Set();
        const existsUnlessHidden = (target) => !hidden.has(path.resolve(String(target))) && existsSync(target);
        existsUnlessHidden[HIDDEN] = hidden;
        fs.existsSync = existsUnlessHidden;
    }
    for (const file of files) {
        hidden.add(path.resolve(file));
    }
}

function assertPrismaLoadsNoEnvFile() {
    const before = new Set(Object.keys(process.env));
    const { PrismaClient } = require('@prisma/client');
    new PrismaClient();
    const loaded = Object.keys(process.env).filter((name) => !before.has(name));
    if (loaded.length > 0) {
        throw new Error(
            `@prisma/client still loaded ${loaded.join(', ')} from an env file after this run hid `
            + `${[...(fs.existsSync[HIDDEN] || [])].join(', ') || 'nothing'}. Teach config/prisma-env-files.js where it looks now.`,
        );
    }
}

module.exports = { hidePrismaEnvFiles, assertPrismaLoadsNoEnvFile };
