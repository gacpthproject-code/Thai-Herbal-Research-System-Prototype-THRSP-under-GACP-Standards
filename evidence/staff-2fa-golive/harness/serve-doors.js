'use strict';

const path = require('path');

const backend = path.resolve(__dirname, '..', '..', '..', 'apps', 'backend');
const fromBackend = (name) => require(require.resolve(name, { paths: [backend] }));
const express = fromBackend('express');
const cookieParser = fromBackend('cookie-parser');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth/provider', require(path.join(backend, 'routes/api/auth/auth-provider')));
app.use('/api/auth/health', require(path.join(backend, 'routes/api/auth/auth-health')));
app.use('/api/mfa', require(path.join(backend, 'routes/api/identity/mfa')));
app.use('/api/provider/applications', require(path.join(backend, 'routes/api/provider/applications')));

const port = Number(process.env.PORT || 8471);
app.listen(port, '127.0.0.1', () => process.stdout.write(`doors listening on 127.0.0.1:${port}\n`));
