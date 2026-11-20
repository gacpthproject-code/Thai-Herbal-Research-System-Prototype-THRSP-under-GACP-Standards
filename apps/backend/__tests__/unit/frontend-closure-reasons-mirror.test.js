/**
 * The admin close form offers the closure reasons the backend accepts, worded the same way
 * (order 35). The web list is read from its source and compared to the backend values.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { APPLICATION_CLOSURE_REASONS } = require('../../shared/application-closure-reasons');

const FE_FILE = path.resolve(__dirname, '../../../web-app/src/constants/application-closure-reasons.ts');

test('the web closure reasons are the backend\'s, code for code and word for word', () => {
    const src = fs.readFileSync(FE_FILE, 'utf8');
    const body = src.match(/export const APPLICATION_CLOSURE_REASONS = \{([\s\S]*?)\} as const;/);
    expect(body).not.toBeNull();
    const fe = Object.fromEntries([...body[1].matchAll(/^\s*([A-Z_]+): '([^']*)',$/gm)].map((m) => [m[1], m[2]]));
    expect(fe).toEqual({ ...APPLICATION_CLOSURE_REASONS });
});
