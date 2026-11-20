const express = require('express');
const router = express.Router();
const logger = require('../../../shared/logger');
const crypto = require('crypto'); // C5-05: constant-time cron-secret compare
const { runCorrectionDeadlineSweep } = require('../../../jobs/correction-deadline-sweep');

function verifyCronSecret(req) {
    const configuredSecret = String(process.env.CRON_SECRET || '').trim();
    if (!configuredSecret) {
        // SECURITY: reject when CRON_SECRET is not configured
        logger.error('[Cron] CRON_SECRET environment variable is not set. Rejecting request.');
        return false;
    }
    // PENTEST R3-01 — header-only. A ?secret= query fallback lands the CRON_SECRET
    // verbatim in nginx/Cloudflare access logs, proxy logs, and Referer headers,
    // where anyone with log read access recovers it and can drive the SYSTEM
    // auto-cancel/expire transitions. Headers are not written to access logs by
    // default. The in-process node-cron jobs do not use this route.
    const provided = String(req.headers['x-cron-secret'] || '').trim();
    // C5-05 (audit 2026-06-10): constant-time compare — `===` short-circuits on the
    // first differing byte, leaking the secret length/prefix via timing. timingSafeEqual
    // needs equal-length buffers, so gate on length first (length is not itself secret).
    if (!provided) { return false; }
    const a = Buffer.from(provided);
    const b = Buffer.from(configuredSecret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Run the correction-deadline sweep by hand (jobs/correction-deadline-sweep.js). The backend's own
 * scheduler runs it every hour; this door is for an operator who needs a run now, or a dry run.
 */
router.get('/auto-cancel', async (req, res) => {
    try {
        if (!verifyCronSecret(req)) {
            return res.status(401).json({
                success: false,
                error: 'CRON_SECRET_INVALID',
            });
        }
        const dryRun = String(req.query.dryRun || 'false').trim().toLowerCase() === 'true';
        const data = await runCorrectionDeadlineSweep({ dryRun });
        return res.json({ success: true, data });
    } catch (error) {
        logger.error('[Cron Auto Cancel] Error:', error);
        // Do not echo raw error.message — the real cause is logged above.
        return res.status(500).json({
            success: false,
            error: 'Failed to process auto-cancel',
        });
    }
});

module.exports = router;
