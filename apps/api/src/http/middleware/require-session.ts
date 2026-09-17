/**
 * The auth chain. **Protected path** — any change here is Complex
 * (`ai/standards/task-surfaces.md`).
 *
 * `app-architecture.md` §5.1 describes five steps. US-001 builds 1–3 and 6. Steps 4 and 5
 * belong to US-003 and US-004 and are left below as named, empty, commented seams so the next
 * author does not have to guess where they go.
 *
 *   1. Authorization: Bearer <jwt>?  missing or malformed  -> 401 no_session
 *   2. Verify the token with Supabase.  invalid or expired -> 401 session_invalid
 *   3. Load user_profiles by the token's subject.
 *        no profile, or is_active = false                  -> 401 account_inactive
 *      Stamp last_seen_at.
 *   4. [US-003]  last_seen_at older than 30 days           -> 401 session_expired
 *   5. [US-004]  must_change_password = true               -> 403 password_change_required
 *   6. Attach the user to the request. Nothing else.
 *
 * **Three distinct 401 codes, one UI behaviour.** All three send the browser to SCR-001 ST-01.
 * They are distinct because US-003 and US-025 will want to tell them apart operationally, and
 * because collapsing them now means widening the contract later. They leak nothing: reaching
 * this middleware at all requires a token, which requires the password.
 */
import type { RequestHandler } from 'express';
import { ERROR_CODES, unauthorized } from '../errors.js';
import type { AuthService } from '../../modules/auth/auth.service.js';
import '../request-user.js';

export interface SessionVerifier {
  /** The token's subject, or undefined if the token is invalid or expired. */
  verify(accessToken: string): Promise<string | undefined>;
}

export interface RequireSessionDeps {
  verifier: SessionVerifier;
  service: AuthService;
}

const bearer = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return undefined;
  return token && token.length > 0 ? token : undefined;
};

export function requireSession({ verifier, service }: RequireSessionDeps): RequestHandler {
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
        // `currentUser` returns undefined for both "no profile" and "is_active = false".
        const user = await service.currentUser(userId);
        if (!user) {
          next(unauthorized(ERROR_CODES.account_inactive, 'Sign in to continue.'));
          return;
        }

        // 4 — [US-003] last_seen_at older than 30 days -> 401 session_expired, otherwise
        //     refresh it, throttled to once an hour. US-001 creates the column and stamps it at
        //     sign-in; the comparison wants a configurable lifetime a test can shorten, and
        //     inventing that config here would be building a story nobody has planned.

        // 5 — [US-004] must_change_password = true -> 403 password_change_required on every
        //     route except the password-change route and sign-out. The code string is already
        //     exported from @desk-booking/contracts so that when US-004 arrives the middleware
        //     and SCR-010 agree on one constant rather than two typed strings.
        //
        //     Consequence while this seam is empty: must_change_password defaults to true, so
        //     between US-001 and US-004 an administrator-set credential is unrestricted. That
        //     is acceptable only because no protected screens exist yet — US-004 must land
        //     before any booking story.

        // 6 — attach, and nothing else.
        req.user = user;
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}
