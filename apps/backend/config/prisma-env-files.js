'use strict';

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const OWN_ENV_FILE = path.resolve(__dirname, '..', '.env');

function generatedClient() {
    try {
        return require.resolve('.prisma/client/index.js', {
            paths: [path.dirname(require.resolve('@prisma/client'))],
        });
    } catch {
        return null;
    }
}

/**
 * The env files @prisma/client loads into process.env when it is required and on
 * every new PrismaClient(). Prisma 5 writes their paths into the generated client
 * relative to the client's real directory, so a checkout that borrows another
 * checkout's node_modules loads that checkout's apps/backend/.env.
 */
function prismaEnvFiles() {
    const client = generatedClient();
    if (!client) {
        return [];
    }
    const config = fs.readFileSync(client, 'utf8').match(/"relativeEnvPaths":\s*(\{[^{}]*\})/);
    if (!config) {
        return [];
    }
    const { rootEnvPath, schemaEnvPath } = JSON.parse(config[1]);
    return [rootEnvPath, schemaEnvPath].filter(Boolean).map((relative) => path.resolve(path.dirname(client), relative));
}

function startupEnvironmentNames() {
    let environ;
    try {
        environ = fs.readFileSync('/proc/self/environ', 'latin1');
    } catch {
        return null;
    }
    return new Set(environ.split('\0').map((entry) => entry.split('=', 1)[0]));
}

function databaseUrlSetBeforePrismaReadEnvFiles() {
    const client = generatedClient();
    const prismaReadEnvFilesAlready = Boolean(client && require.cache[client]);
    if (!prismaReadEnvFilesAlready) {
        return process.env.DATABASE_URL !== undefined;
    }
    const startup = startupEnvironmentNames();
    return startup === null || startup.has('DATABASE_URL');
}

function prismaLoadedDatabaseUrlFrom(file) {
    try {
        return fs.existsSync(file) && 'DATABASE_URL' in dotenv.parse(fs.readFileSync(file));
    } catch {
        return false;
    }
}

function refuseDatabaseUrlLoadedFromAnotherCheckout(
    setBeforePrismaReadEnvFiles,
    envFiles = prismaEnvFiles(),
    ownEnvFile = OWN_ENV_FILE,
) {
    if (setBeforePrismaReadEnvFiles) {
        return;
    }
    const sources = envFiles.filter((file) => file !== ownEnvFile && prismaLoadedDatabaseUrlFrom(file));
    if (sources.length > 0) {
        throw new Error(
            `DATABASE_URL came from ${sources.join(', ')}, another checkout's env file that @prisma/client `
            + 'loads through the shared node_modules, not from this run. Export DATABASE_URL for the database '
            + 'this run should use, or run from that checkout.',
        );
    }
}

module.exports = { prismaEnvFiles, databaseUrlSetBeforePrismaReadEnvFiles, refuseDatabaseUrlLoadedFromAnotherCheckout };
