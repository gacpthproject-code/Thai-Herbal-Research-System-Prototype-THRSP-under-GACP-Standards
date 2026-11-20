'use strict';

// user_consent_events refuses DELETE, and its rows hold a RESTRICT key on the user, so a
// real-Postgres suite that deletes its users must clear the history with triggers off first.
async function dropConsentRows(client, userIdFilter) {
    if (userIdFilter === undefined || userIdFilter === null) { return; }
    await client.$transaction([
        client.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
        client.userConsentEvent.deleteMany({ where: { userId: userIdFilter } }),
        client.userConsent.deleteMany({ where: { userId: userIdFilter } }),
    ]);
}

module.exports = { dropConsentRows };
