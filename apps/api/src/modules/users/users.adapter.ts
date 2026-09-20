/**
 * `modules/users`'s own Supabase Auth seam — US-021's first write.
 *
 * This does NOT live in or import `modules/auth/auth.adapter.ts`: `eslint.config.mjs:16-22`'s
 * `MAY_IMPORT.users = ['notifications']` forbids `modules/users` importing `modules/auth`, and
 * that file is itself a protected path (US-021/D-06). This adapter calls `infra/supabase`
 * directly instead — the same service-role client `auth.adapter.ts` uses, just not that file.
 *
 * Same "translate a GoTrue error into a typed outcome, never throw" shape `auth.adapter.ts`
 * already establishes for `setPassword` (`auth.adapter.ts:121-136`).
 */
import { supabase } from '../../infra/supabase/index.js';
import { logger } from '../../infra/logger/index.js';

export type CreateAuthAccountOutcome =
  | { kind: 'ok'; userId: string }
  /**
   * Defence in depth against the race D-02's pre-emptive `findByEmail` check cannot close: two
   * concurrent creates for the same email. GoTrue's own duplicate-email error carries the code
   * `email_exists` (`@supabase/auth-js@2.109.0`, `error-codes.d.ts` — verified against the
   * installed version, not assumed).
   */
  | { kind: 'duplicate' }
  | { kind: 'unavailable' };

export type DeleteAuthAccountOutcome = { kind: 'ok' } | { kind: 'failed' };

export type UpdateAuthEmailOutcome =
  | { kind: 'ok' }
  /** GoTrue's own `email_exists` — `createAccount`'s branch above, reused rather than re-derived. */
  | { kind: 'duplicate' }
  | { kind: 'unavailable' };

/** No `duplicate` branch — a password cannot collide the way an email address can. */
export type UpdateAuthPasswordOutcome = { kind: 'ok' } | { kind: 'unavailable' };

export interface UsersAuthAdapter {
  createAccount(email: string, password: string): Promise<CreateAuthAccountOutcome>;
  /**
   * ADR-011's compensating delete — called when the credential was minted but the matching
   * `user_profiles` insert then failed. `auth.admin.deleteUser(userId)` with **no second
   * argument**: `shouldSoftDelete` defaults `false`, and it MUST stay `false` — a soft delete
   * leaves the row and the email still occupied, exactly the harm this call exists to undo.
   * `user_profiles.id`'s `on delete cascade` (`0001_user_profiles.sql:28`) makes this one call
   * sufficient. Never throws — "logged, never thrown", the same discipline `revokeSession`
   * already uses for a failed compensating action.
   */
  deleteAccount(userId: string): Promise<DeleteAuthAccountOutcome>;
  /**
   * US-023/AC-05, AC-07. `updateUserById(userId, { email, email_confirm: true })` — ONE
   * attribute plus its confirmation, and named `updateEmail` rather than `updateAccount` so a
   * diff adding a `password` key to it is visibly wrong (design note §3.3). `email_confirm:
   * true` for the same two reasons `createAccount` passes it: it suppresses a GoTrue-sent
   * confirmation email nobody in this repository wrote code to send, AND it is (to the extent
   * verifiable outside a live project) what makes the new address usable to sign in with
   * immediately rather than left pending (US-023/AC-05, design note §3.4, open item 3).
   *
   * NEVER `deleteAccount` + `createAccount` to "re-provision" the account: `user_profiles.id`'s
   * `on delete cascade` would destroy the profile row and everything keyed to it — the exact trap
   * US-023's own QA notes name (ADR-012 §Decision item 3).
   */
  updateEmail(userId: string, email: string): Promise<UpdateAuthEmailOutcome>;
  /**
   * US-027/AC-01, AC-06. `updateUserById(userId, { password })` — ONE attribute, no
   * `email_confirm`, no other key — named `setPassword` rather than `updateAccount` for
   * `updateEmail`'s own stated reason: a diff adding an `email` key to it is visibly wrong.
   *
   * **This duplicates `auth.adapter.ts:110-136`'s `setPassword` exactly** — required, not
   * sloppy: `modules/users` cannot import `modules/auth` (`eslint.config.mjs`'s `MAY_IMPORT.users
   * = ['notifications']`, enforced at the repository root). The two must be kept in lockstep by
   * hand; this one mirrors that one's `catch`-to-`unavailable` shape and its exact log line —
   * `{ userId, message: error.message }`, never the password, never the whole options object
   * (design note §4.1, §3.1 — AC-08's blast radius).
   *
   * The caller (`users.service.ts`) writes `user_profiles` FIRST and calls this SECOND (D-06,
   * ADR-012's order) — a failure here leaves the account's existing password untouched.
   */
  setPassword(userId: string, password: string): Promise<UpdateAuthPasswordOutcome>;
}

export const usersAuthAdapter: UsersAuthAdapter = {
  async createAccount(email, password) {
    try {
      // `email_confirm: true` is half of AC-10's proof, not merely "so the account can sign
      // in" (US-021/AC-10, design note §3.4). Without it, GoTrue itself sends a confirmation
      // email in any project with SMTP configured — an email nobody in this repository wrote
      // code to send. The other half is that the `notifications` module is untouched.
      const { data, error } = await supabase().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        if (error.code === 'email_exists') return { kind: 'duplicate' };
        logger.error('failed to create an auth account', { message: error.message, code: error.code });
        return { kind: 'unavailable' };
      }

      // Defensive: a success with no user is not a shape GoTrue documents, and treating it as a
      // creation would hand the caller an undefined id to insert as a foreign key.
      if (!data.user) return { kind: 'unavailable' };

      return { kind: 'ok', userId: data.user.id };
    } catch (thrown) {
      logger.error('supabase auth threw while creating an account', {
        message: thrown instanceof Error ? thrown.message : String(thrown),
      });
      return { kind: 'unavailable' };
    }
  },

  async deleteAccount(userId) {
    try {
      // No second argument — see the interface docblock. A soft delete would leave the email
      // occupied, which is the exact harm ADR-011's compensation exists to undo.
      const { error } = await supabase().auth.admin.deleteUser(userId);
      if (error) {
        logger.error('compensating delete failed — an orphaned credential may remain', {
          userId,
          message: error.message,
        });
        return { kind: 'failed' };
      }
      return { kind: 'ok' };
    } catch (thrown) {
      logger.error('supabase auth threw during a compensating delete', {
        userId,
        message: thrown instanceof Error ? thrown.message : String(thrown),
      });
      return { kind: 'failed' };
    }
  },

  async updateEmail(userId, email) {
    try {
      // ONE attribute — no `password` key is ever constructed here (design note §3.3, AC-07).
      const { error } = await supabase().auth.admin.updateUserById(userId, { email, email_confirm: true });

      if (error) {
        if (error.code === 'email_exists') return { kind: 'duplicate' };
        logger.error('failed to update an auth account email', { userId, message: error.message, code: error.code });
        return { kind: 'unavailable' };
      }

      return { kind: 'ok' };
    } catch (thrown) {
      logger.error('supabase auth threw while updating an account email', {
        userId,
        message: thrown instanceof Error ? thrown.message : String(thrown),
      });
      return { kind: 'unavailable' };
    }
  },

  async setPassword(userId, password) {
    try {
      // ONE attribute — the interface docblock's own rule, mirrored from `updateEmail`. The
      // password is passed as a VALUE to this one call and to nothing else; it is never
      // interpolated into a template literal anywhere in this function (AC-08).
      const { error } = await supabase().auth.admin.updateUserById(userId, { password });

      if (error) {
        logger.error('failed to set an account password', { userId, message: error.message });
        return { kind: 'unavailable' };
      }

      return { kind: 'ok' };
    } catch (thrown) {
      logger.error('supabase auth threw while setting an account password', {
        userId,
        message: thrown instanceof Error ? thrown.message : String(thrown),
      });
      return { kind: 'unavailable' };
    }
  },
};
