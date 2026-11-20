#!/usr/bin/env node
'use strict';

const mode = process.argv.slice(2);
if (mode.length !== 1 || !['--dry-run', '--apply'].includes(mode[0])) {
    console.error('usage: car-staged-files-sweep.js (--dry-run | --apply)');
    process.exit(1);
}

const { runCarStagedFilesSweep } = require('../../services/car-staged-files-sweep');
const { prisma } = require('../../services/prisma-database');

runCarStagedFilesSweep({ dryRun: mode[0] === '--dry-run' })
    .then((summary) => { console.log(JSON.stringify({ mode: mode[0], ...summary })); })
    .catch((error) => { console.error(`car-staged-files-sweep failed: ${error.message}`); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
