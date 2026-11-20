'use strict';

const { CLOSING_JOBS } = require('../../jobs/closing-jobs');

function countsOf(result) {
    const counts = Object.entries(result || {}).filter(([key, value]) => /^[A-Za-z]+$/.test(key) && Number.isInteger(value));
    return counts.map(([key, value]) => `${key}=${value}`).join(',');
}

async function runClosingJobs() {
    let ok = true;
    const parts = [];
    for (const [name, run] of Object.entries(CLOSING_JOBS)) {
        try {
            parts.push(`${name}:${countsOf(await run()) || 'done'}`);
        } catch (error) {
            ok = false;
            parts.push(`${name}:failed`);
            console.error(`${name} failed: ${error?.message}`);
        }
    }
    return { ok, summary: `closing-jobs ${parts.join(' ')}` };
}

if (require.main === module) {
    if (process.argv.length > 2) {
        console.error('usage: node scripts/ops/run-closing-jobs.js (no arguments: the jobs run on the real clock)');
        process.exit(2);
    }
    runClosingJobs()
        .then(async ({ ok, summary }) => {
            await require('../../services/prisma-database').disconnect();
            console.log(summary);
            process.exit(ok ? 0 : 1);
        })
        .catch((error) => {
            console.error(`run-closing-jobs failed: ${error?.message}`);
            process.exit(1);
        });
}

module.exports = { runClosingJobs };
