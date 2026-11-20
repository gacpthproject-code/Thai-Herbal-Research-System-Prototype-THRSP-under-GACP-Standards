#!/usr/bin/env node
/**
 * Stand-in for the GACP backend while the real Next app runs locally: every
 * request is answered the way auth-middleware.js rejectInactiveAccount answers
 * a suspended account (403 ACCOUNT_INACTIVE). No database, no real account.
 *
 * usage: node stub-backend.js <port>
 */
'use strict';

const http = require('http');

const port = Number(process.argv[2] || 39181);
const BODY = JSON.stringify({
    success: false,
    error: 'Forbidden',
    message: 'บัญชีของคุณถูกระงับการใช้งาน หากมีข้อสงสัย กรุณาติดต่อเจ้าหน้าที่กรมการแพทย์แผนไทยและการแพทย์ทางเลือก / Account is inactive',
    code: 'ACCOUNT_INACTIVE',
});

http.createServer((req, res) => {
    process.stdout.write(`${new Date().toISOString()} ${req.method} ${req.url}\n`);
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    res.end(BODY);
}).listen(port, '127.0.0.1', () => {
    process.stdout.write(`stub backend on 127.0.0.1:${port}\n`);
});
