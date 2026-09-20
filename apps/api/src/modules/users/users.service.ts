/**
 * US-020/AC-01, AC-02, AC-04, AC-06. `listAccounts` is the whole of this module's slice this
 * story adds: the filtered list AND the whole-list composition summary, in one response.
 */
import type { AdminUser, AdminUsersResponse, AdminSummary } from '@desk-booking/contracts';
import type { UserAccountRow, UserSummaryRow, UsersRepository } from './users.repository.js';

export interface UsersServiceDeps {
  users: UsersRepository;
}

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

export function createUsersService({ users }: UsersServiceDeps) {
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
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
