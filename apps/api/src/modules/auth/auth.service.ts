/**
 * Sign-in, mediated by Express (ADR-003).
 *
 * The whole point of this file is the convergence. US-001/AC-04 requires an unknown email, a
 * wrong password and a deactivated account to be indistinguishable — one message and one
 * response-time band. Three causes naturally produce three code paths, three messages and three
 * durations, and that is how the criterion gets broken by accident.
 *
 * So: **there is no early `return res.status(401)` anywhere in this flow.** Every failure path
 * returns the same `{ kind: 'rejected' }` value with the same computed deadline, and the route
 * shapes one response from it.
 */
import { remainingDelayMs } from '../../domain/sign-in-failure-delay.js';
import type { AuthenticatedUser, Session } from '@desk-booking/contracts';
import { logger } from '../../infra/logger/index.js';
import type { ProfileRepository, UserProfileRow } from './auth.repository.js';

export type { ProfileRepository } from './auth.repository.js';

/** What Supabase Auth returns us, reduced to the three cases we act on. */
export type AuthAttempt =
  | { kind: 'ok'; session: { access_token: string; refresh_token: string; expires_at: number }; userId: string }
  | { kind: 'rejected' }
  | { kind: 'unavailable' };

/**
 * The seam over Supabase Auth. A stub implements this in tests, so the three AC-04 causes are
 * expressible without a network and without mocking the SDK.
 */
export type RevokeScope = 'local' | 'global';

export interface AuthAdapter {
  signInWithPassword(email: string, password: string): Promise<AuthAttempt>;
  /**
   * Invalidate a session GoTrue has already minted. See `attemptSignIn` and `signOut`.
   *
   * `scope` is required, never defaulted (US-002/D-03): `'global'` ends the session on every
   * device, `'local'` ends it on the one that asked. Which is correct depends entirely on the
   * caller — a default would let the more destructive `'global'` be picked by omission.
   */
  revokeSession(accessToken: string, scope: RevokeScope): Promise<void>;
}

export type SignInOutcome =
  | { kind: 'ok'; session: Session; user: AuthenticatedUser }
  /** `deadlineMs` is the absolute instant the response may be sent — not a duration. */
  | { kind: 'rejected'; deadlineMs: number }
  | { kind: 'unavailable' };

export interface AuthServiceDeps {
  auth: AuthAdapter;
  profiles: ProfileRepository;
  nowMs: () => number;
  floorMs: number;
}

const toUser = (row: UserProfileRow): AuthenticatedUser => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  mustChangePassword: row.must_change_password,
});

/** What GoTrue hands back, in its casing. Named so the mapping below has something to map from. */
interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

const toSession = (s: SupabaseSession): Session => ({
  accessToken: s.access_token,
  refreshToken: s.refresh_token,
  expiresAt: s.expires_at,
});

export function createAuthService({ auth, profiles, nowMs, floorMs }: AuthServiceDeps) {
  return {
    async attemptSignIn(email: string, password: string): Promise<SignInOutcome> {
      const startedAtMs = nowMs();

      // One rejection value, built once, so no branch below can invent its own.
      //
      // The clock is read ONCE per rejection. Reading it twice — once for the base and once
      // inside remainingDelayMs — would let the two readings drift apart under load and shorten
      // the very band this exists to make uniform.
      const reject = (): SignInOutcome => {
        const at = nowMs();
        return { kind: 'rejected', deadlineMs: at + remainingDelayMs(startedAtMs, at, floorMs) };
      };

      // US-001/D-02 — trim then lower-case in our own code. GoTrue may normalise; it is not our
      // code and not under test here, and BR-001.10 already makes uniqueness case-normalised so
      // a case-insensitive match can never be ambiguous. The password is never touched.
      const normalised = email.trim().toLowerCase();

      const attempt = await auth.signInWithPassword(normalised, password);

      // A downstream outage is not a credential answer. It must not read as a rejection
      // (AC-07) and it is not padded — it depends on nothing about the account, so it is no
      // oracle.
      if (attempt.kind === 'unavailable') return { kind: 'unavailable' };
      if (attempt.kind === 'rejected') return reject();

      const profile = await profiles.findById(attempt.userId);

      if (!profile || !profile.is_active) {
        // GoTrue has already minted a real access token AND a real refresh token for this
        // account. `requireSession` step 3 would refuse every request made with it, but leaving
        // a live refresh token for a deactivated user contradicts what REQ-005 means.
        //
        // This is the easiest line in the story to omit: every other test still passes without
        // it. A failure to revoke must not become a failure to sign in, though — the refusal is
        // the security outcome and it is already decided.
        // 'global': REQ-005 means a deactivated account holds no working credential anywhere,
        // not merely on the device that was just refused.
        await auth.revokeSession(attempt.session.access_token, 'global').catch(() => undefined);
        return reject();
      }

      // Same reading as `startedAtMs` above — not a fresh `nowMs()` call. One clock read per
      // outcome is the rule `reject()`'s own comment already states for this file.
      await profiles.stampLastSeen(profile.id, new Date(startedAtMs));

      return { kind: 'ok', session: toSession(attempt.session), user: toUser(profile) };
    },

    /**
     * `GET /api/auth/session`, and `require-session.ts` steps 3–4 (US-003/NFR-009). The role
     * comes from the table, never from a JWT claim. `lastSeenAtMs` is the session's age, parsed
     * once here so the middleware compares numbers, never a string.
     */
    async loadSession(userId: string): Promise<{ user: AuthenticatedUser; lastSeenAtMs: number } | undefined> {
      const profile = await profiles.findById(userId);
      if (!profile || !profile.is_active) return undefined;
      return { user: toUser(profile), lastSeenAtMs: new Date(profile.last_seen_at).getTime() };
    },

    /**
     * NFR-009's renewal write. Awaited, never rethrown: a transient failure here must not turn
     * an otherwise-successful authenticated request into a `500` — the same device
     * `attemptSignIn` uses for a failed revoke (US-003 design note §2.5). The cost of a lost
     * stamp is at most one throttle interval of un-renewed session; the next request retries it.
     */
    async markSeen(userId: string, at: Date): Promise<void> {
      await profiles.stampLastSeen(userId, at).catch((error: unknown) => {
        logger.warn('last_seen_at renewal failed', { userId, error });
      });
    },

    /**
     * `POST /api/auth/sign-out` (US-002). Ends the session on **this browser only**
     * (`'local'`, US-002/D-03) — the story's own words are "the next person to use this
     * browser", not every device the account is signed in on.
     *
     * Runs no session middleware and is called for every input, including a missing or
     * already-invalid token (US-002/AC-02, US-002/D-02): the caller has already got what they
     * asked for, and there is no failure state anywhere in the design for a sign-out that
     * "fails". A missing token skips the adapter call entirely and is logged — the same device
     * US-001 used for the failure-delay floor: when a guarantee quietly stops holding, one log
     * line is the operational signal.
     */
    async signOut(accessToken: string | undefined): Promise<void> {
      if (!accessToken) {
        logger.warn('sign-out called with no bearer token — nothing to revoke');
        return;
      }
      await auth.revokeSession(accessToken, 'local').catch(() => undefined);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
