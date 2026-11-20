'use strict';
// Walk-only preload: keep the scratch backend off the public interface (server.js binds 0.0.0.0).
const net = require('net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function patchedListen(...args) {
    if (args[1] === '0.0.0.0') { args[1] = '127.0.0.1'; }
    return listen.apply(this, args);
};
