'use strict';

/**
 * Proof that a session signed in with a backup code (operator order 89 ก, round 3).
 *
 * One backup code is enough to move the second factor to a new device: the sign-in at
 * POST /mfa/verify that consumed the code grants this proof, bound to the token id of the
 * session it minted, and POST /mfa/setup on an enabled account accepts the proof once in
 * place of a second code. The proof lives ten minutes, is deleted on use (a DEL that removes
 * one key; a concurrent second taker gets nothing), and counts in the same limiter as a code.
 *
 * Redis, best effort on grant: a sign-in never fails because the store is down; the person
 * then moves with a second code as before. Reads fail closed: no answer, no proof.
 *
 * @module services/auth/mfa-rebind-proof-store
 */

const redisService = require('../redis-service');
const logger = require('../../shared/logger');

const REBIND_PROOF_TTL_SECONDS = 10 * 60;
const keyFor = (userId) => `mfa:rebind-proof:${userId}`;

const matches = (entry, session) => Boolean(entry && session && entry.session === session && Number(entry.expiresAt) > Date.now());

async function grant(userId, session) {
    if (!userId || !session) { return false; }
    try {
        await redisService.setStrict(keyFor(userId), { session, expiresAt: Date.now() + REBIND_PROOF_TTL_SECONDS * 1000 }, REBIND_PROOF_TTL_SECONDS);
        return true;
    } catch (err) {
        logger.warn(`[mfa-rebind-proof] not granted (two codes needed instead): ${err?.message}`);
        return false;
    }
}

async function peek(userId, session) {
    try {
        return matches(await redisService.getStrict(keyFor(userId)), session);
    } catch {
        return false;
    }
}

async function consume(userId, session) {
    let entry;
    try {
        entry = await redisService.getStrict(keyFor(userId));
    } catch {
        return false;
    }
    if (!matches(entry, session)) { return false; }
    const client = redisService.client;
    if (!redisService.isConnected || !client) { return false; }
    try {
        return (await client.del(keyFor(userId))) === 1;
    } catch {
        return false;
    }
}

module.exports = { grant, peek, consume, keyFor, REBIND_PROOF_TTL_SECONDS };
