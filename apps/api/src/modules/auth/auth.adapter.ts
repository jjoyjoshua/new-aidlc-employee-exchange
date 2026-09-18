/**
 * The real `AuthAdapter` — the only place Supabase Auth is spoken to.
 *
 * It exists so `auth.service.ts` can express the three US-001/AC-04 causes without a network,
 * and so the one judgement this file makes — *is this a rejection or an outage?* — sits in one
 * readable function instead of being scattered through the service.
 */
import { supabase, supabaseAuthClient } from '../../infra/supabase/index.js';
import { logger } from '../../infra/logger/index.js';
import type { AuthAdapter, AuthAttempt, RevokeScope } from './auth.service.js';

/**
 * A rejection is a credential answer; an outage is not, and AC-07 exists to keep them apart.
 *
 * GoTrue answers a bad credential with `400`/`401`. Anything at or above `500`, and anything
 * with no status at all — DNS failure, connection refused, a timeout — is the service being
 * unreachable, and must reach the user as "we can't reach the booking service" rather than
 * "your password is wrong".
 *
 * Erring towards `unavailable` on an unrecognised shape is deliberate: telling a user their
 * credentials failed when the truth is our outage is the worse of the two mistakes.
 */
export function isTransportFailure(error: { status?: number | undefined } | null): boolean {
  if (!error) return false;
  const status = error.status;

  // No status at all, or a status below 100, means **no HTTP response happened** — the request
  // never reached a server that answered. supabase-js reports a refused connection, a DNS
  // failure or a timeout as `AuthRetryableFetchError` with `status: 0`, which is not a status
  // code at all; 100 is the lowest real one.
  //
  // Checking only for `undefined` here was a live defect: `0 >= 500` is false, so a total
  // outage was classified as a CREDENTIAL REJECTION and every user was told their password was
  // wrong. Found by pointing the server at a Supabase that was not running.
  if (status === undefined || status < 100) return true;

  return status >= 500;
}

export const supabaseAuthAdapter: AuthAdapter = {
  async signInWithPassword(email, password): Promise<AuthAttempt> {
    let result: Awaited<ReturnType<ReturnType<typeof supabaseAuthClient>['auth']['signInWithPassword']>>;

    try {
      // The SDK mostly RETURNS failures rather than throwing, which is why the `error` branch
      // below exists. But it can also throw outright — client construction can fail, and a
      // fetch implementation can raise rather than resolve. Found by running the server:
      // a throw here escaped this adapter entirely and surfaced as a 500, which told the user
      // "our bug" when the truth was "we cannot reach the service".
      //
      // A downstream that throws is the same outcome for the user as a downstream that answers
      // 5xx: AC-07's "unreachable", never AC-04's "rejected". Erring this way is deliberate —
      // calling an outage a rejection tells someone their password is wrong during an incident.
      result = await supabaseAuthClient().auth.signInWithPassword({ email, password });
    } catch (thrown) {
      logger.error('supabase auth threw', {
        message: thrown instanceof Error ? thrown.message : String(thrown),
      });
      return { kind: 'unavailable' };
    }

    const { data, error } = result;

    if (error) {
      if (isTransportFailure(error)) {
        // No credential detail here — this line is about our dependency, not about the user.
        logger.error('supabase auth unreachable', { status: error.status, message: error.message });
        return { kind: 'unavailable' };
      }
      return { kind: 'rejected' };
    }

    // Defensive: a success with no session is not a shape GoTrue documents, and treating it as
    // a sign-in would hand the caller an undefined token.
    if (!data.session || !data.user) return { kind: 'unavailable' };

    return {
      kind: 'ok',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        // `expires_at` is optional in the SDK's types; derive it rather than emit `undefined`,
        // which `sessionSchema` would reject at the browser's parse.
        expires_at:
          data.session.expires_at ??
          Math.floor(Date.now() / 1000) + (data.session.expires_in ?? 3600),
      },
      userId: data.user.id,
    };
  },

  /**
   * Revoke a session GoTrue has already minted — for an account US-001 then refused, or for a
   * user ending their own session (US-002). `scope` is the caller's to decide; see the
   * `AuthAdapter` interface for why it is required rather than defaulted.
   *
   * This needs the **service-role** client — admin operations are not available on the anon
   * key. Verified present in @supabase/supabase-js 2.109.0 as `auth.admin.signOut(jwt, scope)`.
   */
  async revokeSession(accessToken, scope: RevokeScope) {
    const { error } = await supabase().auth.admin.signOut(accessToken, scope);
    if (error) {
      // Logged, never thrown. The refusal is the security outcome and it is already decided;
      // a failed revoke must not turn into a successful sign-in. But it must not be silent
      // either — a deactivated account with a live refresh token is worth an alert.
      logger.error('failed to revoke session for a refused sign-in', { message: error.message });
    }
  },

  /**
   * US-004. `auth.admin.updateUserById` needs the **service-role** client — there is no
   * password-write call on the anon key, by design (ADR-001).
   *
   * A failure or a throw both become `unavailable`, never a rejected promise: this is the same
   * "erring towards unavailable" judgement `signInWithPassword` already makes for a downstream
   * that fails, and it is load-bearing here specifically — a thrown error the caller does not
   * catch would leave `auth.service.ts`'s write-then-clear ordering (design note §6) in an
   * ambiguous state instead of the safe, recoverable one it is written to guarantee. No
   * password appears in the log line — see `§0`'s constraints in `decisions.md` D-06.
   */
  async setPassword(userId, newPassword) {
    try {
      const { error } = await supabase().auth.admin.updateUserById(userId, { password: newPassword });
      if (error) {
        logger.error('failed to write a new password', { userId, message: error.message });
        return { kind: 'unavailable' };
      }
      return { kind: 'ok' };
    } catch (thrown) {
      logger.error('supabase auth threw while writing a new password', {
        userId,
        message: thrown instanceof Error ? thrown.message : String(thrown),
      });
      return { kind: 'unavailable' };
    }
  },
};
