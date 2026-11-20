'use strict';
const fs = require('fs');
const [, , treeRoot, outPrefix] = process.argv;
const svc = require(`${treeRoot}/apps/backend/services/pdf/katorlor1-template-service`);
const { app, requirements } = JSON.parse(fs.readFileSync(`${__dirname}/../filing.secret.json`, 'utf8'));
(async () => {
    fs.writeFileSync(`${outPrefix}.secret.html`, svc.renderKatorlor1Html(app, requirements), { mode: 0o600 });
    fs.writeFileSync(`${outPrefix}.secret.pdf`, await svc.renderKatorlor1Pdf(app, requirements), { mode: 0o600 });
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
