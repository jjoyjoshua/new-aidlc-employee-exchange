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
export interface AuthAdapter {
  signInWithPassword(email: string, password: string): Promise<AuthAttempt>;
  /** Invalidate a session GoTrue has already minted. See `attemptSignIn`. */
  revokeSession(accessToken: string): Promise<void>;
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
        await auth.revokeSession(attempt.session.access_token).catch(() => undefined);
        return reject();
      }

      await profiles.stampLastSeen(profile.id);

      return { kind: 'ok', session: toSession(attempt.session), user: toUser(profile) };
    },

    /** `GET /api/auth/session` — the role comes from the table, never from a JWT claim. */
    async currentUser(userId: string): Promise<AuthenticatedUser | undefined> {
      const profile = await profiles.findById(userId);
      return profile && profile.is_active ? toUser(profile) : undefined;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
