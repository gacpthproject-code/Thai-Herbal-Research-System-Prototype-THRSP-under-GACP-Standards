/**
 * useNavChips — tile-home notification chip counts + certificate state.
 *
 * Chips come from `/api/applications/my`, bucketed by status:
 *   pendingActions — REVISION_REQUESTED, PENDING_DOC_FEE, PENDING_AUDIT_FEE, CAR_PENDING
 *   unpaid         — PENDING_DOC_FEE, PENDING_AUDIT_FEE
 * A zero count renders as null (chip hidden), never "0 รายการ".
 *
 * hasActiveCert/certsLoaded/certError come from `/api/certificates/my`.
 * 'usable' means getCertBadgeKind(...) !== 'expired' (see cert-status.ts: a
 * bare status compare is wrong because natural expiry does not flip
 * Certificate.status). Only the planting page reads this, to explain why
 * "สร้างรอบปลูก" is disabled. It never hides or locks a menu entry.
 *
 * Each fetch is gated independently so a caller pays only for what it reads:
 *   - `chips`    (default true) — /api/applications/my.
 *   - `certLock` (default true) — /api/certificates/my.
 *
 * ERROR is a third state, distinct from "loaded, no cert"
 * (certsLoaded:true, hasActiveCert:false) and "still loading"
 * (certsLoaded:false, certError:false). On error `certsLoaded` stays false
 * and `certError` flips true, so a failed request never reads as "you hold
 * no certificate". Consumers fail open; the real gate is server-side in
 * `plantingService.createCycle`.
 */
'use client';

import { useEffect, useState } from 'react';
import { apiClient as api } from '@/lib/api/api-client';
import { getCertBadgeKind, getDaysRemaining } from '@/app/health/certificates/cert-status';

interface ApplicationRecord {
  status?: string;
}

interface CertificateRecord {
  status?: string;
  expiryDate?: string;
}

const PENDING_ACTION_STATUSES = new Set<string>([
  'REVISION_REQUESTED',
  'PENDING_DOC_FEE',
  'PENDING_AUDIT_FEE',
  'CAR_PENDING',
]);

const UNPAID_STATUSES = new Set<string>(['PENDING_DOC_FEE', 'PENDING_AUDIT_FEE']);

export interface NavChips {
  pendingActions: string | null;
  unpaid: string | null;
  /** True once at least one non-expired (getCertBadgeKind !== 'expired') certificate is on file. */
  hasActiveCert: boolean;
  /** False until the certificates fetch resolves successfully (or `certLock` is false) — before that, certificate state is unknown. Stays false on error too (see `certError`). */
  certsLoaded: boolean;
  /**
   * True when the certificates fetch failed (network/throw, or a
   * `success: false` envelope) — lock state is UNKNOWN, a third state
   * distinct from "loaded, no cert" (certsLoaded:true) and "still loading"
   * (certsLoaded:false, certError:false). Consumers must render this the
   * same as "still loading", never as a confirmed absence of certificate.
   */
  certError: boolean;
}

const EMPTY_CHIPS: NavChips = {
  pendingActions: null,
  unpaid: null,
  hasActiveCert: false,
  certsLoaded: false,
  certError: false,
};

export interface UseNavChipsOptions {
  /** Fetch /api/applications/my for pendingActions/unpaid. Default true. */
  chips?: boolean;
  /** Fetch /api/certificates/my for hasActiveCert/certsLoaded. Default true. */
  certLock?: boolean;
}

export function useNavChips(options: UseNavChipsOptions = {}): NavChips {
  const { chips: chipsEnabled = true, certLock: certLockEnabled = true } = options;
  const [chips, setChips] = useState<NavChips>(EMPTY_CHIPS);

  useEffect(() => {
    if (!chipsEnabled) {
      setChips((prev) => ({ ...prev, pendingActions: null, unpaid: null }));
      return;
    }
    let cancelled = false;
    api
      .get<ApplicationRecord[]>('/api/applications/my')
      .then((res) => {
        if (cancelled) return;
        if (res.success === false) return;
        const apps = Array.isArray(res.data) ? res.data : [];
        let pendingCount = 0;
        let unpaidCount = 0;
        for (const app of apps) {
          const status = app.status;
          if (!status) continue;
          if (PENDING_ACTION_STATUSES.has(status)) pendingCount += 1;
          if (UNPAID_STATUSES.has(status)) unpaidCount += 1;
        }
        setChips((prev) => ({
          ...prev,
          pendingActions: pendingCount > 0 ? `${pendingCount} รายการรอคุณดำเนินการ` : null,
          unpaid: unpaidCount > 0 ? `มียอดค้างชำระ ${unpaidCount} รายการ` : null,
        }));
      })
      .catch(() => {
        // Chips are presentational only — a fetch failure just leaves them
        // hidden (null), it must never crash the tile-home page.
        if (!cancelled) setChips((prev) => ({ ...prev, pendingActions: null, unpaid: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [chipsEnabled]);

  useEffect(() => {
    if (!certLockEnabled) {
      setChips((prev) => ({ ...prev, hasActiveCert: false, certsLoaded: false, certError: false }));
      return;
    }
    let cancelled = false;
    api
      .get<CertificateRecord[]>('/api/certificates/my')
      .then((res) => {
        if (cancelled) return;
        if (res.success === false) {
          // F-2 fix: a `success: false` envelope is an ERROR, not "loaded,
          // no cert" — certsLoaded must stay false (see module doc).
          setChips((prev) => ({ ...prev, certsLoaded: false, certError: true }));
          return;
        }
        const certs = Array.isArray(res.data) ? res.data : [];
        // Reuse certificates/cert-status.ts's getCertBadgeKind — see the
        // module doc comment above for why a bare status compare is wrong.
        const active = certs.some((c) => {
          if (!c.status || !c.expiryDate) return false;
          const daysLeft = getDaysRemaining(c.expiryDate);
          return getCertBadgeKind(c.status, daysLeft) !== 'expired';
        });
        setChips((prev) => ({ ...prev, hasActiveCert: active, certsLoaded: true, certError: false }));
      })
      .catch(() => {
        // F-2 fix: a network failure/throw is an ERROR, not "loaded, no
        // cert" — see the module doc's ERROR-is-a-third-state note.
        if (!cancelled) setChips((prev) => ({ ...prev, certsLoaded: false, certError: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [certLockEnabled]);

  return chips;
}

export default useNavChips;
