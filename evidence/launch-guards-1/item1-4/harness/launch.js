'use strict';

const path = require('path');

const backend = path.join(process.env.RV_TREE, 'apps', 'backend');
const app = require(path.join(backend, 'server.js'));
const prismaDatabase = require(path.join(backend, 'services', 'prisma-database'));
const redisService = require(path.join(backend, 'services', 'redis-service'));

(async () => {
    await prismaDatabase.connect();
    await redisService.connect();
    const port = Number(process.env.PORT);
    app.listen(port, '127.0.0.1', () => {
        process.stdout.write(`lg1 listening 127.0.0.1:${port} NODE_ENV=${process.env.NODE_ENV} flag=${process.env.REQUIRE_MFA_FOR_PRIVILEGED === 'true' ? 'on' : 'off'}\n`);
    });
})().catch((error) => {
    process.stderr.write(`launch failed: ${error.message}\n`);
    process.exit(1);
});
