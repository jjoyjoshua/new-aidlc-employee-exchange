/**
 * The auth chain. **Protected path** — any change here is Complex
 * (`ai/standards/task-surfaces.md`).
 *
 * `app-architecture.md` §5.1 describes six steps. US-001 built 1–3 and 6; US-003 built 4;
 * US-004 builds 5, gated by `passwordChangeGate` so the two routes that must survive a set
 * mark — the password-change route itself and `GET /session` — run this same chain with the
 * gate 'exempt' rather than being special-cased by path (US-004 design note §4.2–§4.3).
 *
 *   1. Authorization: Bearer <jwt>?  missing or malformed  -> 401 no_session
 *   2. Verify the token with Supabase.  invalid or expired -> 401 session_invalid
 *   3. Load user_profiles by the token's subject.
 *        no profile, or is_active = false                  -> 401 account_inactive
 *   4. last_seen_at older than the configured lifetime      -> 401 session_expired
 *      Otherwise, throttled, renew last_seen_at.
 *   5. must_change_password = true, gate 'enforced'         -> 403 password_change_required
 *   6. Attach the user to the request. Nothing else.
 *
 * **Four distinct 401 codes, one UI behaviour.** All four send the browser to SCR-001 ST-01.
 * They are distinct because an operator triaging "users are being signed out" needs to tell a
 * 30-day idle expiry from a token Supabase refused from a deactivated account, and because
 * collapsing them now means widening the contract later. They leak nothing: reaching this
 * middleware at all requires a token, which requires the password.
 */
import type { RequestHandler } from 'express';
import { ERROR_CODES, forbidden, unauthorized } from '../errors.js';
import { isSessionExpired, shouldStampLastSeen } from '../../domain/session-lifetime.js';
import type { AuthService } from '../../modules/auth/auth.service.js';
import '../request-user.js';

export interface SessionVerifier {
  /** The token's subject, or undefined if the token is invalid or expired. */
  verify(accessToken: string): Promise<string | undefined>;
}

export interface RequireSessionDeps {
  verifier: SessionVerifier;
  service: AuthService;
  /** NFR-009. The same reading `composition.ts` already threads into the auth service. */
  nowMs: () => number;
  /** NFR-009. In milliseconds — `composition.ts` converts the configured days once. */
  sessionLifetimeMs: number;
  /** NFR-009. In milliseconds — `composition.ts` converts the configured minutes once. */
  lastSeenThrottleMs: number;
  /**
   * US-004 / REQ-029. `'enforced'` is what every module mount takes. `'exempt'` exists for the
   * two routes in `authRouter` that a user with the mark must still be able to reach — the
   * password-change route itself and `GET /session` (US-004 design note §4.3: the browser's
   * only way to learn the mark is set is this endpoint, so gating it too would make the mark
   * unreachable on a cold boot).
   *
   * **Required, never defaulted**, for the reason `RevokeScope` is required on the adapter
   * (US-002/D-03): a default lets the consequential choice be made by omission.
   */
  passwordChangeGate: 'enforced' | 'exempt';
}

const bearer = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return undefined;
  return token && token.length > 0 ? token : undefined;
};

export function requireSession({
  verifier,
  service,
  nowMs,
  sessionLifetimeMs,
  lastSeenThrottleMs,
  passwordChangeGate,
}: RequireSessionDeps): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      try {
        // 1 — is there a bearer token at all?
        const token = bearer(req.headers.authorization);
        if (!token) {
          next(unauthorized(ERROR_CODES.no_session, 'Sign in to continue.'));
          return;
        }

        // 2 — is it a token this project issued, and is it still valid?
        const userId = await verifier.verify(token);
        if (!userId) {
          next(unauthorized(ERROR_CODES.session_invalid, 'Your session has ended. Sign in again.'));
          return;
        }

        // 3 — does the account still exist and is it still active?
        //
        // REQ-005 biting here rather than at token expiry is what makes deactivation take
        // effect immediately on a live session. That is also the de facto answer to
        // db-design.md open question 3, which is still formally open and the PO's to confirm.
        // `loadSession` returns undefined for both "no profile" and "is_active = false".
        const session = await service.loadSession(userId);
        if (!session) {
          next(unauthorized(ERROR_CODES.account_inactive, 'Sign in to continue.'));
          return;
        }
        const { user, lastSeenAtMs } = session;

        // 4 — NFR-009. One clock reading for both the check and (if it applies) the write —
        //     reading it twice would let the two readings drift apart (US-003 design note §2.4).
        //     Order is load-bearing: check expiry BEFORE renewing. Renewing first would
        //     resurrect exactly the session this rule exists to kill (design note §2.3).
        const now = nowMs();
        if (isSessionExpired(lastSeenAtMs, now, sessionLifetimeMs)) {
          next(unauthorized(ERROR_CODES.session_expired, 'Your session has ended. Sign in again.'));
          return;
        }
        if (shouldStampLastSeen(lastSeenAtMs, now, lastSeenThrottleMs)) {
          await service.markSeen(userId, new Date(now));
        }

        // 5 — REQ-029 / BR-001.17. must_change_password = true -> 403 password_change_required
        //     on every route this chain guards with the gate 'enforced'. The mark is loaded
        //     from user_profiles by step 3, never from a JWT claim: an admin reset (REQ-021)
        //     sets it under a live session, and a claim would go stale at that moment — the
        //     same reason `role` is not a claim.
        //
        //     Sign-out (US-002) needs no allowlist entry here: it is mounted outside this chain
        //     entirely and never reaches step 5 in the first place (US-002 design note §2.2).
        //     The two routes that run this chain with the gate 'exempt' — the password-change
        //     route itself and GET /session — are named in composition.ts, by name (US-004
        //     design note §4.2-§4.3).
        if (passwordChangeGate === 'enforced' && user.mustChangePassword) {
          next(forbidden(ERROR_CODES.password_change_required, 'Choose your own password to continue.'));
          return;
        }

        // 6 — attach, and nothing else.
        req.user = user;
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}
