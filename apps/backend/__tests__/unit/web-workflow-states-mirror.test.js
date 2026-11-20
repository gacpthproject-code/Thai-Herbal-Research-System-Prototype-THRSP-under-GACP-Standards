'use strict';

/**
 * The web's list of workflow states (apps/web-app/src/lib/constants/workflow-states.ts) is a hand
 * mirror of WORKFLOW_STATES. The server refuses to boot on a state with no label
 * (status-machine-contract.js); the web had no such check, so a state added on the server showed
 * the raw token on screen. Read as text: the backend suite has no TypeScript toolchain.
 */

const fs = require('fs');
const path = require('path');
const { WORKFLOW_STATES } = require('../../services/workflow-transition-service');
const { STATUS_PRESENTATION } = require('../../shared/status-machine-contract');

const WEB_STATES = path.join(__dirname, '../../../web-app/src/lib/constants/workflow-states.ts');
const block = fs.readFileSync(WEB_STATES, 'utf8').match(/export const WORKFLOW_STATES = \[([\s\S]*?)\] as const;/);

test('the web list is found, so this test checks something', () => {
    expect(block).not.toBeNull();
});

test('the web knows every workflow state the server has, in the same order', () => {
    const web = (block[1].match(/'[^']+'/g) || []).map((quoted) => quoted.slice(1, -1));
    expect(web).toEqual([...WORKFLOW_STATES]);
});

test('the server labels a refused application "ไม่ได้รับการรับรอง" (order 78(2))', () => {
    expect(STATUS_PRESENTATION.REJECTED.label).toBe('ไม่ได้รับการรับรอง');
});
