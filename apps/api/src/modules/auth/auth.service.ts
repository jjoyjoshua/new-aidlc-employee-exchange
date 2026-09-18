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
  /**
   * US-004. Writes a new credential for the account, via the service-role admin API — the only
   * write Supabase Auth offers that does not require the account's own current session.
   *
   * Never throws and never reports the failure's detail upward: a failure here is the same
   * "unavailable" outcome as any other unreachable downstream (US-001/AC-07's convention),
   * because REQ-029's guarantee (the old password stays valid until a new one is confirmed)
   * depends on this call being the one thing that changes the credential — a failure here must
   * leave the account exactly as it was.
   */
  setPassword(userId: string, newPassword: string): Promise<{ kind: 'ok' } | { kind: 'unavailable' }>;
}

export type SignInOutcome =
  | { kind: 'ok'; session: Session; user: AuthenticatedUser }
  /** `deadlineMs` is the absolute instant the response may be sent — not a duration. */
  | { kind: 'rejected'; deadlineMs: number }
  | { kind: 'unavailable' };

/**
 * US-004. `not-required` is AC-03's server half — there is no voluntary password change in
 * this release, so an account whose mark is already clear is refused rather than served.
 * `same-as-current` is V-15 (AC-05); `unavailable` covers both a probe and a write that cannot
 * reach Supabase (design note §5.2, §6.1).
 */
export type SetPasswordOutcome =
  /**
   * `session` is present when the server's own re-sign-in with the new password succeeded
   * (design note §6.4) — confirmed 2026-09-18 against the real Supabase project that
   * `auth.admin.updateUserById` revokes the caller's prior access token, so a replacement is
   * required for AC-07 to hold. Absent on the rare case that re-sign-in itself could not
   * complete; the browser's next request then simply `401`s and the guard returns the user to
   * sign-in, where the new password already works (AC-06) — degraded, never a lockout.
   */
  | { kind: 'ok'; user: AuthenticatedUser; session?: Session }
  | { kind: 'not-required' }
  | { kind: 'same-as-current' }
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

    /**
     * `POST /api/auth/set-password` (US-004). Re-reads the profile itself rather than trusting
     * a caller-supplied one (design note §5.3) — the rule's precondition is read where the rule
     * lives, and this stays testable as `(userId, password) -> outcome` with no Express request
     * involved.
     *
     * The order below is the one place in this story where a wrong choice is silent rather than
     * loud (design note §6.1-§6.2): the credential is written before the mark is cleared, never
     * the reverse, so every way this can stop halfway leaves the account recoverable by simply
     * trying again — never released into the product with the administrator-set password still
     * live and the mark permanently cleared.
     */
    async setPassword(userId: string, newPassword: string): Promise<SetPasswordOutcome> {
      const profile = await profiles.findById(userId);
      // Defensive only: requireSession's own chain has already refused a missing or inactive
      // profile before this ever runs. Treated the same as an unreachable downstream rather
      // than given its own UI state, because it is not a state this story's ACs describe.
      if (!profile || !profile.is_active) return { kind: 'unavailable' };

      // AC-03's server half. There is no voluntary password change in this release (BRD-001
      // §10) — an account that is not marked is refused, not served.
      if (!profile.must_change_password) return { kind: 'not-required' };

      // V-15. Supabase exposes no password-comparison API, so the check is a probe: attempt a
      // sign-in with the candidate password. Success means it equals the stored one.
      const probe = await auth.signInWithPassword(profile.email, newPassword);

      if (probe.kind === 'unavailable') {
        // Fails closed (design note §5.2): V-15 cannot be proven, so nothing is written. The
        // administrator-set password and the mark are both untouched — RISK-009 holds.
        return { kind: 'unavailable' };
      }

      if (probe.kind === 'ok') {
        // The probe minted a REAL session. `'local'`, never `'global'` — this session belongs
        // to the probe alone; `'global'` would also end the user's live session on SCR-010,
        // signing them out as a side effect of a refused submission (design note §5.1).
        await auth.revokeSession(probe.session.access_token, 'local').catch(() => undefined);
        return { kind: 'same-as-current' };
      }

      // probe.kind === 'rejected' — the candidate is not the current password. Proceed.
      const write = await auth.setPassword(userId, newPassword);
      if (write.kind === 'unavailable') {
        // Nothing has changed: the administrator-set password and the mark are both untouched
        // (AC-08 holds structurally, the same property steps 1-3 above already have).
        return { kind: 'unavailable' };
      }

      // The credential is real now — everything from here on is recoverable regardless of
      // outcome (design note §6.2).

      // design note §6.4. The write above revokes the caller's own access token (confirmed
      // 2026-09-18 against the real project), so AC-07's "continues straight into the product"
      // needs a fresh one. Best-effort: a failure here degrades to a session-less success
      // rather than a failed change — see `SetPasswordOutcome`'s docblock.
      const resign = await auth.signInWithPassword(profile.email, newPassword).catch(
        (): AuthAttempt => ({ kind: 'unavailable' }),
      );
      const session = resign.kind === 'ok' ? toSession(resign.session) : undefined;

      // A failure clearing the mark must not be reported as a failed change — that would send
      // the user into V-15's confusing double-failure path on their very next attempt (design
      // note §6.2). The server-side gate remains authoritative regardless: the worst case is a
      // 403 on the next request, not a stranded account.
      await profiles.clearMustChangePassword(userId).catch((error: unknown) => {
        logger.error('must_change_password clear failed after a successful password write', { userId, error });
      });

      return { kind: 'ok', user: toUser({ ...profile, must_change_password: false }), ...(session ? { session } : {}) };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
