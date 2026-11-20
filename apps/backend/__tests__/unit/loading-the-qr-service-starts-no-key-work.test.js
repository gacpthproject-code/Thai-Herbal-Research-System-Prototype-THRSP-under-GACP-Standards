/**
 * Loading a module starts no signing-key work (security re-review 2026-10-09 I-D). The QR service was
 * built at require time and its constructor built the signature singleton, whose constructor starts
 * key initialization in the background. A test that only needed a lot-quota rule loaded it through
 * the traceability service, ended before that background work, and the work then required a file
 * after the Jest environment was torn down, which set the run's exit code to 1. The signature service
 * is now reached on first use; the server still checks the key at boot (validateSigningKeyAtBoot).
 */

'use strict';

describe('the QR service', () => {
    test('loading it builds no signature service', () => {
        jest.isolateModules(() => {
            const signature = require('../../services/crypto/signature-service');
            const built = jest.spyOn(signature, 'getSignatureService');
            require('../../services/qrcode/qrcode-service');
            expect(built).not.toHaveBeenCalled();
        });
    });

    test('its first use reaches the one signature service', () => {
        jest.isolateModules(() => {
            const signature = require('../../services/crypto/signature-service');
            const singleton = { ensureInitialized: jest.fn() };
            jest.spyOn(signature, 'getSignatureService').mockReturnValue(singleton);
            const qr = require('../../services/qrcode/qrcode-service');
            expect(qr.signatureService).toBe(singleton);
        });
    });
});
