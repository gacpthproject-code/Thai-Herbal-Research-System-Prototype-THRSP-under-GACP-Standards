'use strict';
// Prints the decision for every column of User and Entity: what anonymizeAccount writes, or why the
// column keeps its value. Reads the Prisma schema, runs the real routine against a recording client,
// and reads test-support/account-columns-kept.js. Usage: node evidence/pdpa-retention-truth/column-table.js
const fs = require('fs');
const path = require('path');
const BACKEND = path.join(__dirname, '..', '..', 'apps', 'backend');
const { anonymizeAccount } = require(path.join(BACKEND, 'services', 'account-anonymization'));
const { KEPT_USER_COLUMNS, KEPT_ENTITY_COLUMNS } = require(path.join(BACKEND, 'test-support', 'account-columns-kept'));

const SCHEMA_DIR = path.join(BACKEND, 'prisma', 'schema');
const texts = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.prisma')).map((f) => fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'));
const models = new Set(texts.flatMap((t) => [...t.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1])));
function columnsOf(name) {
    for (const t of texts) {
        const block = t.match(new RegExp(`^model\\s+${name}\\s*\\{([\\s\\S]*?)^\\}`, 'm'));
        if (block) {
            return block[1].split('\n').map((l) => l.trim().match(/^(\w+)\s+(\w+)(\[\])?/)).filter((m) => m && !models.has(m[2]) && !m[3]).map((m) => m[1]);
        }
    }
    throw new Error(name);
}

const writes = {};
const tx = {
    user: { update: async ({ data }) => { writes.User = data; } },
    entityMembership: { findMany: async () => [{ entityId: 'e' }] },
    entity: { update: async ({ data }) => { writes.Entity = data; } },
    identityLink: { deleteMany: async () => ({ count: 0 }) },
    invoice: { count: async () => 0 },
};

function describe(value) {
    if (value === null) {return ['cleared', 'NULL'];}
    if (value instanceof Date) {return ['marker', 'time of the run'];}
    if (value === 'user-id') {return ['tombstone', "the account's own id (unique, never a national ID or HMAC)"];}
    if (value === false) {return ['cleared', 'false'];}
    return [value === true ? 'marker' : 'tombstone', JSON.stringify(value)];
}

(async () => {
    await anonymizeAccount(tx, 'user-id', new Date());
    const rows = [['model', 'column', 'decision', 'value or reason']];
    for (const [model, kept] of [['User', KEPT_USER_COLUMNS], ['Entity', KEPT_ENTITY_COLUMNS]]) {
        for (const col of columnsOf(model)) {
            if (col in writes[model]) {
                let [decision, value] = col === 'sessionsRevokedAt' ? ['written', 'session epoch: every earlier token stops working'] : describe(writes[model][col]);
                if (model === 'Entity' && col === 'displayName') {
                    value += '; kept while an invoice or receipt of the entity issued within TAX_DOCUMENT_RETENTION_YEARS (7) prints it (ม.87/3, §7 item 2), then cleared by a later sweep';
                }
                rows.push([model, col, decision, value]);
            } else if (col in kept) {
                rows.push([model, col, 'kept', kept[col]]);
            } else {
                rows.push([model, col, 'UNDECIDED', '']);
            }
        }
    }
    rows.push(['IdentityLink', '(every row of the account)', 'deleted', 'a ThaID subject is a keyed HMAC of the national ID, and a live link signs the person back in']);
    process.stdout.write(`${rows.map((r) => r.join('\t')).join('\n')}\n`);
})();
