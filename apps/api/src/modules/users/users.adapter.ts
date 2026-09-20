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
};
