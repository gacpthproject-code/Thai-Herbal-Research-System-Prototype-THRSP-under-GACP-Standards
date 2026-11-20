/**
 * The finance refund form offers the provider-cancellation reasons the backend
 * accepts, worded the same way. The web list is read from its source and
 * compared to the backend values, never to a literal typed here.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
    PROVIDER_CANCELLATION_REASONS, PROVIDER_CANCELLATION_REASON_MILESTONES, REFUND_TRANSFER_WORKING_DAYS,
} = require('../../shared/refund-kinds');

const FE_FILE = path.resolve(__dirname, '../../../web-app/src/constants/refund-kinds.ts');

function feReasons() {
    const src = fs.readFileSync(FE_FILE, 'utf8');
    const body = src.match(/export const PROVIDER_CANCELLATION_REASONS = \{([\s\S]*?)\} as const;/);
    if (!body) {throw new Error('PROVIDER_CANCELLATION_REASONS not found in refund-kinds.ts');}
    return Object.fromEntries([...body[1].matchAll(/^\s*([A-Z_]+): '([^']*)',$/gm)].map((m) => [m[1], m[2]]));
}

function feReasonMilestones() {
    const src = fs.readFileSync(FE_FILE, 'utf8');
    const body = src.match(/export const PROVIDER_CANCELLATION_REASON_MILESTONES\b[^=]*= \{([\s\S]*?)\};/);
    if (!body) {throw new Error('PROVIDER_CANCELLATION_REASON_MILESTONES not found in refund-kinds.ts');}
    return Object.fromEntries([...body[1].matchAll(/^\s*([A-Z_]+): \[([^\]]*)\],$/gm)]
        .map((m) => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map((milestone) => milestone[1])]));
}

describe('web refund reasons mirror shared/refund-kinds.js', () => {
    it('the same codes with the same Thai labels', () => {
        expect(feReasons()).toEqual({ ...PROVIDER_CANCELLATION_REASONS });
    });

    it('every reason names the milestones it may cancel, and the web offers each on the same ones', () => {
        expect(Object.keys(PROVIDER_CANCELLATION_REASON_MILESTONES)).toEqual(Object.keys(PROVIDER_CANCELLATION_REASONS));
        expect(feReasonMilestones()).toEqual({ ...PROVIDER_CANCELLATION_REASON_MILESTONES });
    });

    it('the same minimum note length', () => {
        const src = fs.readFileSync(FE_FILE, 'utf8');
        const svc = fs.readFileSync(path.resolve(__dirname, '../../services/refund-service.js'), 'utf8');
        const fe = Number(src.match(/CANCELLATION_NOTE_MIN_LENGTH = (\d+);/)[1]);
        const be = Number(svc.match(/const NOTE_MIN_LENGTH = (\d+);/)[1]);
        expect(fe).toBe(be);
    });

    it('the same refund transfer timetable', () => {
        const src = fs.readFileSync(FE_FILE, 'utf8');
        expect(Number(src.match(/export const REFUND_TRANSFER_WORKING_DAYS = (\d+);/)[1])).toBe(REFUND_TRANSFER_WORKING_DAYS);
    });
});
