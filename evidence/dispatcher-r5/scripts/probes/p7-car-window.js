'use strict';
// P7: the on-site corrective-action window (order 56(2a)) as every decision door computes it.
const path = require('path');
const fs = require('fs');
const BE = process.argv[2];
const { computeCarDueDate } = require(path.join(BE, 'services/car-deadline-service'));
const { correctionWindowText, onsiteCorrectionWindowAt } = require(path.join(BE, 'services/correction-windows'));
const show = (label, v) => process.stdout.write(`PROBE ${label}: ${JSON.stringify(v)}\n`);
show('due from Thu 2026-10-15 10:00 BKK', computeCarDueDate(new Date('2026-10-15T03:00:00Z')).toISOString());
show('due from Wed 2026-10-08 10:00 BKK (before effectiveFrom)', computeCarDueDate(new Date('2026-10-08T03:00:00Z')).toISOString());
show('window in force 2026-12-01', onsiteCorrectionWindowAt(new Date('2026-12-01T03:00:00Z')));
show('expiry text CAR / revision', [correctionWindowText('CAR_PENDING', new Date('2026-10-20T03:00:00Z')), correctionWindowText('REVISION_REQUESTED')]);
const doors = {
  'audit-onsite-service submitDecision': 'services/audit-onsite-service.js',
  'POST /api/audits/:id/result': 'routes/api/audit/audits.js',
  'auditor-audit-decision-handler': 'routes/api/provider/handlers/auditor-audit-decision-handler.js',
  'workflow-transitions-handler': 'routes/api/provider/handlers/workflow-transitions-handler.js',
  'waiver-reopen (CAR origin)': 'services/waiver-reopen-service.js',
};
const scan = {};
for (const [door, file] of Object.entries(doors)) {
  const src = fs.readFileSync(path.join(BE, file), 'utf8');
  scan[door] = { usesComputeCarDueDate: /computeCarDueDate\(/.test(src), usesOnsiteCorrectionDueAt: /onsiteCorrectionDueAt\(/.test(src), addWorkingDaysForCar: /car[A-Za-z_]*\s*=\s*addWorkingDays|addWorkingDays\([^)]*CAR/i.test(src) };
}
show('decision doors', scan);
