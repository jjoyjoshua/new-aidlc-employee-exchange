/**
 * US-020/AC-01, AC-02, AC-04, AC-06. `listAccounts` is the whole of this module's slice this
 * story adds: the filtered list AND the whole-list composition summary, in one response.
 *
 * US-021 adds this module's first WRITE, `createAccount` — two systems, one write each, no
 * shared transaction (ADR-011). See that function's own docblock for the compensating-delete
 * shape ADR-011 requires.
 *
 * US-023 adds this module's first UPDATE, `updateAccount` — the same no-shared-transaction problem,
 * but with the order REVERSED from create (ADR-012): `user_profiles` first, Supabase Auth second,
 * because the foreign key that forces Auth-first on an insert constrains nothing on an update
 * (design note §2.1). See that function's own docblock for the restore-compensation shape.
 */
import type { AdminUser, AdminUsersResponse, AdminSummary, DeactivationPreview, UserRole } from '@desk-booking/contracts';
import type { UserAccountRow, UserSummaryRow, UsersRepository } from './users.repository.js';
import type { UsersAuthAdapter } from './users.adapter.js';
import { logger } from '../../infra/logger/index.js';
import { officeToday } from '../../domain/booking-window.js';
import { displayStatusPredicate } from '../../domain/booking-history.js';
import { generateResetPassword } from '../../domain/generate-reset-password.js';

export interface UsersServiceDeps {
  users: UsersRepository;
  usersAuth: UsersAuthAdapter;
  /** US-023 — `updated_at`'s first writer. One reading threaded through, so the repository never
   *  reads a clock itself (`desks.service.ts`'s own `DesksServiceDeps` shape). */
  nowMs: () => number;
  /** US-025's first use — `deactivateAccount` computes the office's "today" the same way
   *  `desksService`/`adminBookingsService` already do (design note §3.2, C9). */
  officeTimezone: string;
  /** US-027 — the ONE crypto-backed source `resetPassword` threads into the pure
   *  `generateResetPassword` (design note §5.1): `domain/` is declared pure and a CSPRNG is the
   *  same nondeterminism `Date.now`/`nowMs` is banned from reading directly. */
  randomInt: (maxExclusive: number) => number;
}

export interface CreateAccountInput {
  fullName: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface UpdateAccountInput {
  id: string;
  fullName: string;
  email: string;
}

/**
 * US-023/AC-01, AC-02, AC-03, AC-05, AC-07. `CreateAccountOutcome`'s four kinds plus `not_found`
 * — the same single addition `RenameDeskOutcome` makes over `CreateDeskOutcome`.
 */
/**
 * US-024/AC-01, AC-04, AC-07, AC-12. `ChangeRoleOutcome`'s three kinds — `updateAccount`'s own
 * shape minus `duplicate`/`unavailable`/`failed`: this is a single-system write to `role` only,
 * never Supabase Auth, so ADR-011/ADR-012's cross-system compensation shapes do not apply
 * (`spec.md`'s Technical constraints).
 */
export type ChangeRoleOutcome =
  | { kind: 'ok'; account: AdminUser }
  | { kind: 'not_found' }
  /** US-024/AC-04, AC-07 (BR-001.11, V-11). The trigger refused it — never an in-app count
   *  (design note §2.4, §5, `ADR-013`). */
  | { kind: 'blocked' };

/**
 * US-025/AC-01, AC-02, AC-04, AC-10, AC-12. Three kinds — `already_inactive` never reaches this
 * far: it is the repository's, collapsed here into `ok` (design note §2.2, §3.2, C8), so every
 * promise AC-13 makes (cannot sign in, chip reads Deactivated) stays true with no invented copy.
 */
export type DeactivateAccountOutcome =
  | { kind: 'ok'; account: AdminUser; cancelledCount: number }
  /** US-025/AC-10 (BR-001.11, V-11). The trigger refused it — never an in-app count. */
  | { kind: 'blocked' }
  | { kind: 'not_found' };

/**
 * US-026/AC-01, AC-03, AC-04, AC-05, AC-07. Two kinds only — `changeRole`'s shape minus `blocked`:
 * reactivation cannot fire the last-active-admin trigger (design note §2), so there is nothing for
 * a `blocked` branch to report.
 */
export type ActivateAccountOutcome = { kind: 'ok'; account: AdminUser } | { kind: 'not_found' };

/**
 * US-027/AC-01, AC-06, AC-07, AC-08, AC-09, AC-10. `unavailable` covers both a Supabase Auth
 * outage AND a genuine per-account failure at that write — the router maps both to
 * `503 service_unavailable`, the same split `updateAccount`'s `unavailable` already takes for
 * the sibling cross-system write. No `duplicate` kind: a password cannot collide.
 */
export type ResetPasswordOutcome =
  | { kind: 'ok'; account: AdminUser; password: string }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

export type UpdateAccountOutcome =
  | { kind: 'ok'; account: AdminUser }
  | { kind: 'duplicate'; fullName: string; isActive: boolean }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

/**
 * US-021/AC-01, AC-06, AC-08. Four kinds at THIS layer — wider than the browser ever sees
 * (`decisions.md` D-05, D-09): `unavailable` (Supabase Auth unreachable) and `failed` (the
 * profile write failed, compensated or not) map to different HTTP statuses in the router
 * (503 vs 500), even though `create-account.ts` collapses both to one `failed` outcome
 * client-side. No service in this codebase constructs an `HttpError` — `desks.service.ts`'s
 * `createDesk`/`deactivateDesk` are the precedent this follows.
 */
export type CreateAccountOutcome =
  | { kind: 'ok'; account: AdminUser }
  | { kind: 'duplicate'; fullName: string; isActive: boolean }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

function mapAccount(row: UserAccountRow): AdminUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
  };
}

/**
 * US-020/AC-02, AC-06 (BR-001.11; design note §2.2, A10). Tallies the WHOLE table's
 * `role`/`is_active` rows into the four counts the summary line needs.
 *
 * `employees + admins === total` by construction — every row increments exactly one of the two
 * role buckets AND `total`, in the same iteration. `deactivated` counts rows INSIDE `total`, not
 * a fourth bucket: it is incremented alongside the role bucket, never instead of it. This is the
 * shape that keeps AC-02's own worked example ("38 people · 36 employees, 2 admins · 1
 * deactivated") true, and the invariant a "count total over active rows only" bug would
 * otherwise still pass on any fixture with nobody deactivated.
 *
 * db-design.md:352's own bound — "hundreds of accounts, not millions" — is why an in-memory
 * tally over these two-column rows needs no PostgREST aggregate (design note §2.2, rejecting one
 * for the same three reasons US-016 §2.2 gave its own count).
 */
function tallySummary(rows: UserSummaryRow[]): AdminSummary {
  let total = 0;
  let employees = 0;
  let admins = 0;
  let deactivated = 0;

  for (const row of rows) {
    total += 1;
    if (row.role === 'admin') admins += 1;
    else employees += 1;
    if (!row.is_active) deactivated += 1;
  }

  return { total, employees, admins, deactivated };
}

export function createUsersService({ users, usersAuth, nowMs, officeTimezone, randomInt }: UsersServiceDeps) {
  return {
    /**
     * US-020/AC-01, AC-02, AC-04, AC-06. `listAccounts` (filtered by `q` when present) and
     * `getSummaryCounts` (always the WHOLE table, `q` never reaches it — the parameter does not
     * exist on that method) run via `Promise.all`: they are independent reads, and the summary
     * must not wait on, or be affected by, the filtered read (design note §2.2 item 3).
     *
     * The summary is a SECOND, unfiltered read, tallied here — never derived from the `users`
     * array this same response carries. That is forced, not chosen: the moment `q` is
     * non-empty the browser holds a SUBSET, and AC-06 requires a number computed over the WHOLE
     * table (design note §2.2's restatement of US-016 §3.2's rule, applied to the opposite case).
     */
    async listAccounts(q?: string): Promise<AdminUsersResponse> {
      const [accountRows, summaryRows] = await Promise.all([
        users.listAccounts(q),
        users.getSummaryCounts(),
      ]);

      return {
        users: accountRows.map(mapAccount),
        summary: tallySummary(summaryRows),
      };
    },

    /**
     * US-021/AC-01, AC-06, AC-08. Design note §2.8's shape, exactly. Two systems, one write
     * each, in the ORDER the foreign key forces (`user_profiles.id references auth.users(id)`,
     * ADR-011 §Decision item 1) — never a choice this function makes.
     */
    async createAccount({ fullName, email, role, password }: CreateAccountInput): Promise<CreateAccountOutcome> {
      // 1. A message-composition read, NOT the uniqueness arbiter (design note §2.7,
      // `decisions.md` D-02). Two indexes actually arbitrate a real race — GoTrue's own on
      // `auth.users.email`, and `user_profiles_email_key` — and this read never prevents either
      // from firing; it only lets a genuine duplicate's refusal name its holder.
      const existing = await users.findByEmail(email);
      if (existing) return { kind: 'duplicate', fullName: existing.full_name, isActive: existing.is_active };

      // 2. Auth first is FORCED by user_profiles.id's foreign key (ADR-011 §Decision item 1).
      const created = await usersAuth.createAccount(email, password);
      if (created.kind === 'unavailable') return { kind: 'unavailable' };

      if (created.kind === 'duplicate') {
        // GoTrue holds this email; `findByEmail` did not, a moment ago. Two possible causes
        // (design note §2.4): a concurrent request that has now finished its own profile
        // insert, or an orphan left by an earlier partial failure whose compensation also
        // failed. Re-reading is what tells them apart.
        const now = await users.findByEmail(email);
        if (now) return { kind: 'duplicate', fullName: now.full_name, isActive: now.is_active };
        // No profile behind a real Auth account: an orphan (ADR-011 §Decision item 5). Nothing
        // the caller can do, and nothing safe to delete or adopt from this request — that is
        // exactly the self-healing ADR-011 rejects.
        logger.error('auth.users holds this email but user_profiles has no row — orphaned credential', {
          email,
        });
        return { kind: 'failed' };
      }

      // 3. From here, a failure leaves the two systems disagreeing until compensated.
      try {
        await users.insertProfile({ id: created.userId, email, fullName, role });
      } catch (error) {
        logger.error('profile insert failed after the credential was minted; compensating', {
          userId: created.userId,
          message: error instanceof Error ? error.message : String(error),
        });
        // Hard delete (ADR-011 §Decision item 2) — `user_profiles.id`'s `on delete cascade`
        // makes this one call sufficient. Logged either way, never thrown, never surfaced
        // (ADR-011 §Decision item 3): the caller sees one undifferentiated failure regardless
        // of whether the compensation itself succeeded.
        const undone = await usersAuth.deleteAccount(created.userId);
        if (undone.kind !== 'ok') {
          logger.error('compensating delete FAILED — an orphaned credential remains', {
            userId: created.userId,
          });
        }
        return { kind: 'failed' };
      }

      // desks.service.ts:82-95's shape: return the row just built, never a re-read.
      return { kind: 'ok', account: { id: created.userId, fullName, email, role, isActive: true } };
    },

    /**
     * US-023/AC-01, AC-02, AC-03, AC-05, AC-06, AC-07, AC-08. Design note §2.11's shape, exactly.
     * Two systems, one write each, in the ORDER ADR-012 decided — `user_profiles` first, Supabase
     * Auth second, the REVERSE of `createAccount` above, because the foreign key that forces
     * Auth-first on an insert constrains nothing here (design note §2.1).
     */
    async updateAccount({ id, fullName, email }: UpdateAccountInput): Promise<UpdateAccountOutcome> {
      // The read that makes everything else possible (design note §2.6): existence, the old
      // values a failed Auth write restores, and whether the email actually changed at all.
      const current = await users.findById(id);
      if (!current) return { kind: 'not_found' };

      const emailChanged = current.email.toLowerCase() !== email;

      // The LOAD-BEARING guard (design note §2.8): when the email is unchanged, no duplicate
      // check runs and neither write touches it — AC-03 holds because a self-collision is never
      // tested for, not because `excludeId` below catches it.
      if (emailChanged) {
        const holder = await users.findByEmail(email, id);
        if (holder) return { kind: 'duplicate', fullName: holder.full_name, isActive: holder.is_active };
      }

      // Profile FIRST (ADR-012 §Decision item 1) — the reverse of create.
      const written = await users.updateProfileDetails({ id, fullName, email, updatedAt: new Date(nowMs()) });
      if (written.kind === 'not_found') return { kind: 'not_found' };
      if (written.kind === 'duplicate') {
        // `excludeId` defence in depth (design note §2.8): the guard above missed a concurrent
        // write that landed between the read and this one. Re-read once, the same re-read device
        // `createAccount` uses for its own race.
        const holder = await users.findByEmail(email, id);
        if (holder) return { kind: 'duplicate', fullName: holder.full_name, isActive: holder.is_active };
        logger.error('user_profiles_email_key fired but no row holds the email — inconsistent', { id });
        return { kind: 'failed' };
      }

      // No Auth call AT ALL when the email did not change (design note §2.3) — structurally, not
      // by arrangement: AC-07's re-provisioning trap has nothing to reach for on this path.
      if (!emailChanged) return { kind: 'ok', account: mapAccount(written.profile) };

      // ONE attribute (design note §3.3, AC-07) — `usersAuth.updateEmail` never constructs a
      // `password` key, and `deleteAccount` is never called from this path.
      const auth = await usersAuth.updateEmail(id, email);
      if (auth.kind === 'ok') return { kind: 'ok', account: mapAccount(written.profile) };

      // Compensation: this request undoing its OWN write (ADR-012 §Decision item 2 / ADR-011
      // item 2 — not item 4's self-healing, which this is not). BOTH old values restored (design
      // note §2.7 — a partial revert would contradict SCR-009 ST-08's "Nothing has changed.").
      // Logged, never thrown, never surfaced (ADR-011 item 3).
      logger.error('auth email update failed after the profile was written; compensating', {
        id,
        kind: auth.kind,
      });
      const restored = await users.updateProfileDetails({
        id,
        fullName: current.full_name,
        email: current.email,
        updatedAt: new Date(nowMs()),
      });
      if (restored.kind !== 'ok') {
        logger.error(
          'COMPENSATING RESTORE FAILED — user_profiles and auth.users now disagree about this ' +
            'account\'s email; sign-in uses the OLD address and notifications the NEW one',
          { id },
        );
        return { kind: 'failed' };
      }

      // `duplicate` from GoTrue here is NOT one the administrator can act on — no profile row
      // holds the address, so there is nothing to name in ST-04 (ADR-011 item 4: no adopting, no
      // deleting a resource this request did not create).
      if (auth.kind === 'duplicate') {
        logger.error(
          'auth.users holds this email but user_profiles does not — orphaned or diverged credential ' +
            '(ADR-011 §Decision item 5, ADR-012 §Decision item 6)',
          { id, email },
        );
        return { kind: 'failed' };
      }
      return { kind: 'unavailable' };
    },

    /**
     * US-024/AC-01, AC-04, AC-07, AC-12. A single-system write — `user_profiles.role` only, no
     * Auth call on any branch (design note §1, `spec.md`'s Technical constraints). ONE `nowMs()`
     * reading, threaded to the repository as `updatedAt` — `updateAccount`'s own discipline
     * above, unchanged.
     *
     * NO in-app admin count, on any branch. BR-001.11 is enforced entirely by the database
     * trigger (`0004_last_active_admin_guard.sql`, `ADR-013`) — this method passes `blocked`
     * straight through whatever the repository reports, which is what makes AC-07 (a deactivated
     * admin does not count) structural rather than logic this method could get wrong.
     */
    async changeRole(id: string, role: UserRole): Promise<ChangeRoleOutcome> {
      const result = await users.setRole({ id, role, updatedAt: new Date(nowMs()) });
      if (result.kind !== 'ok') return result;
      return { kind: 'ok', account: mapAccount(result.profile) };
    },

    /**
     * US-025/AC-05. Read-only, changes nothing. `officeToday`/`displayStatusPredicate('confirmed',
     * today)` — the same reading `desks.service.ts:150-158` takes for desk deactivation, never a
     * raw `>= now()`.
     */
    async previewDeactivation(id: string): Promise<DeactivationPreview> {
      const today = officeToday(nowMs(), officeTimezone);
      const predicate = displayStatusPredicate('confirmed', today);
      if (predicate.from === undefined) {
        throw new Error("displayStatusPredicate('confirmed', today) returned no floor — this is a bug");
      }

      const rows = await users.previewDeactivation(id, predicate.stored, predicate.from);
      return {
        bookings: rows.map((row) => ({ id: row.id, deskNumber: row.desk_number, date: row.booking_date })),
      };
    },

    /**
     * US-025/AC-01, AC-02, AC-03, AC-04, AC-10, AC-12. ONE `nowMs()` reading, threaded to both
     * the RPC's `p_now` stamp and its `p_today` date floor (`deactivateDesk`'s own discipline:
     * two readings could straddle office midnight and cancel a different set of bookings than
     * the one the stamp claims). No in-app admin count on any branch — the trigger is the sole
     * arbiter, `changeRole`'s own discipline, unchanged.
     *
     * `already_inactive` is collapsed to `ok` with `cancelledCount: 0`, logged rather than
     * surfaced: the account IS deactivated and the person CANNOT sign in, which is every promise
     * AC-13 makes — mapping it to `not_found` or a failure would ship copy that is false about
     * an account that plainly exists (design note §2.2).
     *
     * `cancelledBookings` stops here, deliberately — reduced to a count. The rows exist for
     * US-029/US-032 to consume when they land; a future caller widens this explicitly rather than
     * finding a dead field (`desks.service.ts:113-115`'s own precedent for exactly this shape).
     */
    async deactivateAccount(id: string, actorId: string): Promise<DeactivateAccountOutcome> {
      const now = nowMs();
      const today = officeToday(now, officeTimezone);
      const predicate = displayStatusPredicate('confirmed', today);
      if (predicate.from === undefined) {
        throw new Error("displayStatusPredicate('confirmed', today) returned no floor — this is a bug");
      }

      const result = await users.deactivateAccount({
        id,
        actorId,
        now: new Date(now),
        today: predicate.from,
      });

      if (result.kind === 'blocked' || result.kind === 'not_found') return result;

      if (result.kind === 'already_inactive') {
        logger.warn('deactivation found the account already inactive — nothing was changed', { id });
        return { kind: 'ok', account: mapAccount(result.profile), cancelledCount: 0 };
      }

      return {
        kind: 'ok',
        account: mapAccount(result.profile),
        cancelledCount: result.cancelledBookings.length,
      };
    },

    /**
     * US-026/AC-01, AC-03, AC-04, AC-05, AC-07. ONE `nowMs()` reading, threaded to the repository
     * as `updatedAt` — `changeRole`'s own discipline. No `blocked` branch to handle: reactivation
     * cannot fire the last-active-admin trigger (design note §2), so `activateAccount`'s outcome
     * passes straight through with no in-app admin count on any branch.
     */
    async activateAccount(id: string): Promise<ActivateAccountOutcome> {
      const result = await users.activateAccount({ id, updatedAt: new Date(nowMs()) });
      if (result.kind !== 'ok') return result;
      return { kind: 'ok', account: mapAccount(result.profile) };
    },

    /**
     * US-027/AC-01, AC-06, AC-07, AC-08, AC-09, AC-10. Two systems, one write each, in D-06's
     * order — `user_profiles` FIRST, Supabase Auth SECOND — the REVERSE of `createAccount`'s
     * order and the SAME as `updateAccount`'s, for `updateAccount`'s own reason restated: the
     * foreign key that forces Auth-first on an insert constrains nothing here, and the reverse
     * order can leave an account holding a credential NOBODY has seen if the profile write then
     * failed (design note §2.1, ADR-012).
     *
     * No `findById`: `armMustChangePassword` IS the existence check, `not_found` short-circuits
     * before a password is ever generated or a Supabase Auth call is ever made (design note §2.2,
     * §2.3).
     *
     * The plaintext exists in exactly one place — the local `password` binding — and leaves this
     * function in exactly one direction: the returned `ok` outcome. It is never passed to
     * `logger`, never interpolated into a template literal, and never written to any column
     * other than through `usersAuth.setPassword` (AC-08, RISK-005).
     *
     * No compensating un-arm on an Auth failure (D-06, design note §2.4): the account's password
     * is untouched, so the only residual is that `must_change_password` stays armed on an account
     * whose credential did not change — which is what BR-001.17 already asks of a person on this
     * flag, not a divergence to repair the way `updateAccount`'s email restore closes one.
     */
    async resetPassword(id: string): Promise<ResetPasswordOutcome> {
      const armed = await users.armMustChangePassword({ id, updatedAt: new Date(nowMs()) });
      if (armed.kind === 'not_found') return { kind: 'not_found' };

      const password = generateResetPassword(randomInt);

      const auth = await usersAuth.setPassword(id, password);
      if (auth.kind !== 'ok') {
        logger.error('password reset failed at the auth write; the credential was NOT changed', { id });
        return { kind: 'unavailable' };
      }

      return { kind: 'ok', account: mapAccount(armed.profile), password };
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
