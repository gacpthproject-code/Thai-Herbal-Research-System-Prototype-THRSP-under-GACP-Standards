/**
 * The older one-step "ลบบัญชีของฉัน" door (DELETE /api/auth/health/me/delete) only set isDeleted:
 * it cleared nothing, and the retention sweep never read deleted rows, so an account closed
 * through it kept every identifying value for good, while the owner could no longer ask for
 * erasure (PDPA_ALREADY_DELETED). The two-step request-and-confirm erasure at
 * /api/pdpa/erasure replaced it (R4-D, 2026-05-17) and is the only way to close an account.
 */

const router = require('../../routes/api/auth/auth-health');

const routes = router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route.path}`));

test('the self-service data export door is still routed (control)', () => {
    expect(routes).toContain('GET /me/export');
});

test('there is no one-step account delete door', () => {
    expect(routes).not.toContain('DELETE /me/delete');
});
