# External-Services Cleanup (Phases 1+2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** in-app Notification = the only business-notification channel in code; email/SMS business legs + stacks deleted; auth-transition email (MFA-OTP + password-reset in E1) untouched.

**Architecture:** 4 sequential tasks on `feat/external-services-cleanup` (off main 994d553f). Spec (binding): `docs/superpowers/specs/2026-08-19-external-services-cleanup-design.md`.

## Global Constraints
- KEEP: E1 `services/email-service.js` → `sendMfaOtp`, `sendPasswordReset` + the transporter path they need. Everything else email/SMS-business goes.
- Every touched notify site keeps its in-app row write byte-identical — pinned by test BEFORE the removal (RED-first on the removal pins, GREEN-stays on the in-app pins).
- T3 must remove the `required:'production'` secrets-catalog rows for retired vars in the SAME commit as the transports (boot-safety invariant).
- Full unit suite: no NEW failures vs the known baseline. Ratchet flat-or-down. Operator merges the branch.

### Task 1: Path A + the three one-off senders go in-app-only
**Files:** Modify `apps/backend/services/notification-service.js` (delete `_sendEmailForNotification`/`_sendSmsForNotification` + call sites ~:425-440, `EMAIL_MAP` ~:583-592, SMS priority gate ~:433-436, E2/S1 requires ~:3-5) · `apps/backend/routes/api/entities/index.js` (delete the courtesy-email block ~:461-477 + its import if now unused) · `apps/backend/services/application-service/application-draft-query-methods.js` (delete the E2 send ~:147 + import) · `apps/backend/jobs/sla-processor.js` (delete the email leg ~:82 + `SLA_ALERT_EMAILS` read) — LOCATE all lines fresh, they may have drifted.
**Interfaces:** `sendNotification`/`createNotification`/`createBulkNotifications` signatures UNCHANGED (30+ callers must not need edits). The in-app writes at notification-service ~:413-423, entities pending-membership row, APPLICATION_SUBMITTED at draft-query ~:132, and `notifySlaBreach`'s in-app rows all stay byte-identical.
- [ ] RED-first: pins that (a) each in-app write still fires with identical args, (b) NO email/sms module is required/invoked anywhere on these paths (module-resolution spy or require-graph assert). Run the notification suites + entities + sla suites → green. Ratchet. Commit.

### Task 2: Path B fanout in-app-only (+ the PDPA-erasure token carrier)
**Files:** Modify `apps/backend/services/notification-fanout-service.js` (CHANNELS→IN_APP; delete `_dispatchEmail`/`_dispatchSms` + email/sms dedupe arms + the duplicated email/sms preference logic ~:760-771; unknown channel names in `send({channels})` are ignored — callers stay valid) · verify `services/pdpa-erasure-service.js` ~:312: the erasure confirm-token URL — if email was its only carrier, ensure the IN-APP notification's `metadata.actionUrl` carries the confirm URL (it already flows through the same fanout call; verify + pin, extend only if missing).
**Interfaces:** `fanoutService.send({userId,type,payload,channels})` signature unchanged; returns per-channel results with email/sms reported as `skipped:'CHANNEL_RETIRED'` (or absent — implementer picks ONE shape and pins it; callers don't read those results per the audit, verify).
- [ ] RED-first: in-app dispatch still writes via notificationService for every TEMPLATES type; erasure confirm actionUrl pin; callers' suites (refund, payment-slip, slip-sla-monitor, audit-onsite, renewal cron, status-writer) green unmodified. Commit.

### Task 3: retire the stacks + secrets catalog + env
**Files:** Delete `apps/backend/services/email/` · `services/notification/providers/email-provider.js` · `services/notification/transports/email-transport.js` · `services/sms/` · `services/notification/providers/sms-provider.js` · `services/notification/transports/sms-transport.js` · `scripts/send-test-email.js`. Modify `services/email-service.js` (E1): keep ONLY the transporter + `sendMfaOtp` + `sendPasswordReset`; delete `sendInvitationEmail`, `sendSLABreachNotification` + the 4 zero-caller methods; header comment: "TRANSITION-ONLY: auth email (MFA-OTP + password-reset) — Phases 3/4 retire this file; production auth = ThaiD+หมอพร้อม (operator 2026-08-19)". Modify `config/secrets.js`: remove the EMAIL_SMTP_* (~:262-314) and THAIBULKSMS_*/SMS (~:319-355) catalog rows incl. their `required:'production'` gates + the legacy SMS_API_KEY row (~:180-184). Scrub `.env.example`: retired vars out; E1's SMTP vars annotated transition-only. Delete the retired stacks' test files; sweep for now-dangling imports repo-wide (grep every deleted module's name — zero production references must remain).
- [ ] RED-first where pinnable (secrets-validation test: prod validation passes WITHOUT the retired vars; fails-before if such a test exists — else add one). Full unit suite: no new failures vs baseline (deleted suites disappear — list them in the report). Ratchet flat-or-down. Commit.

### Task 4: preferences + FE + dead templates + docs honesty
**Files:** Modify `apps/backend/services/notification-preferences-service.js` (email/sms channel concept removed; in-app per-type remains; stored JSON with legacy email/sms keys tolerated on read) · `apps/web-app/src/components/feature/notification-preferences.tsx` + its two pages (drop email/sms columns) · `services/notification-fanout-service.js` TEMPLATES: delete the 3 unreached entries (REVISION_REQUESTED / CERTIFICATE_ISSUED / BREACH_NOTIFICATION_SUBJECT) AFTER re-verifying zero production callers by grep (dynamic-type caveat from the audit — grep `type:` literals AND constants) · `shared/notification-view.js` comment: decision → done · new `docs/operations/notifications-inapp-only.md`: the urgent-reach tradeoff (APPLICATION_EXPIRED/SLA classes), the Web Push follow-up, what remains external (auth transition email only).
- [ ] RED-first FE pins (prefs UI renders in-app-only; legacy stored JSON doesn't crash). FE + BE suites green. Commit.

## Self-Review
Spec→tasks: Phase 1 = T1+T2, Phase 2 = T3(dead methods/stacks)+T4(dead templates); keep-list honored (E1 auth pair) in T3; boot-safety secrets rule in T3 same-commit; erasure token carrier handled T2; no task touches MFA/password-reset flows. Sequential dispatch (T1→T4); T2 and T3 both touch fanout-service — T3 deletes modules T2's code no longer calls (order matters, kept).
