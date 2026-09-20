/**
 * US-020/AC-01, AC-02, AC-04, AC-06. `listAccounts` is the whole of this module's slice this
 * story adds: the filtered list AND the whole-list composition summary, in one response.
 *
 * US-021 adds this module's first WRITE, `createAccount` — two systems, one write each, no
 * shared transaction (ADR-011). See that function's own docblock for the compensating-delete
 * shape ADR-011 requires.
 */
import type { AdminUser, AdminUsersResponse, AdminSummary, UserRole } from '@desk-booking/contracts';
import type { UserAccountRow, UserSummaryRow, UsersRepository } from './users.repository.js';
import type { UsersAuthAdapter } from './users.adapter.js';
import { logger } from '../../infra/logger/index.js';

export interface UsersServiceDeps {
  users: UsersRepository;
  usersAuth: UsersAuthAdapter;
}

export interface CreateAccountInput {
  fullName: string;
  email: string;
  role: UserRole;
  password: string;
}

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

export function createUsersService({ users, usersAuth }: UsersServiceDeps) {
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
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
