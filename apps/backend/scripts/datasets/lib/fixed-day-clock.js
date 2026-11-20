'use strict';

/**
 * Preloaded (`node -r`) only into the backend the dataset checker boots to write
 * its synthetic sample. Every Date the process makes counts forward from
 * DATASET_SAMPLE_CLOCK_START instead of today, so the dates the system's own
 * code stamps (submission day, withdrawal day, deletion day) repeat on every
 * run. Elapsed time still passes normally, so timeouts and timers behave.
 */

if (process.env.NODE_ENV !== 'development') {
    throw new Error('fixed-day-clock.js moves the clock; it loads only into the checker\'s development backend');
}

const RealDate = Date;
const origin = RealDate.parse(process.env.DATASET_SAMPLE_CLOCK_START || '');
if (Number.isNaN(origin)) {
    throw new Error('fixed-day-clock: DATASET_SAMPLE_CLOCK_START must be an ISO timestamp');
}
const bootedAt = RealDate.now();
const now = () => origin + (RealDate.now() - bootedAt);

class SampleDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) { super(now()); } else { super(...args); }
    }

    static now() { return now(); }
}

global.Date = SampleDate;
