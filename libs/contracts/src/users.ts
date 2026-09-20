/**
 * US-020's slice — `GET /api/admin/users`. The first read of `modules/users`
 * (`apps/api/src/modules/README.md:9` reserves the module by name; this story fills it, read-only).
 *
 * Field names mirror `authenticatedUserSchema` (`auth.ts`) but this schema is NOT that one,
 * reused or extended — the session's shape and an admin list's shape must be able to diverge
 * (design note §9.1).
 */
import { z } from 'zod';
import { userRoleSchema } from './auth.js';

/**
 * One account in the people list (US-020/AC-01). `id`, `fullName`, `email`, `role`, `isActive` —
 * the exact select list `users.repository.ts`'s `listAccounts` issues, and nothing more.
 *
 * Deliberately NO `isYou` field: the "(you)" marker (AC-03) is derived by the browser comparing
 * this row's `id` to `useAuth()`'s signed-in id — never a second source for the same fact on the
 * wire (design note §7.3). A diff adding `isYou` here is a review finding.
 */
export const adminUserSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  isActive: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/**
 * `GET /api/admin/users?q=<term>`'s query (US-020/AC-04). `.strict()` — an unknown field is
 * rejected, matching every other request schema in this package.
 *
 * `.trim()` so a term that is whitespace-only collapses to the `.min(1)` failure rather than
 * reaching the repository as a filter that matches everything. `.max(100)` (design note A15/§2.3)
 * is a guard against a pathological body, not a policy — it bounds the string the `.or()` filter
 * string (`search-filter.ts`) is built from, removing a whole class of degenerate pattern before
 * it reaches Postgres.
 */
export const adminUsersQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

/**
 * The whole-list composition counts (US-020/AC-02, AC-06; BR-001.11). A SECOND, unfiltered read,
 * tallied in `users.service.ts` — never derived from the `users` array in the same response, and
 * never recomputed when `q` is present (design note §2.2). `employees + admins === total`, and
 * `deactivated` counts rows INSIDE that total, not a fourth bucket — the invariant the service's
 * own tests assert, because a "count active rows only" bug passes every fixture with nobody
 * deactivated.
 */
export const adminSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  employees: z.number().int().nonnegative(),
  admins: z.number().int().nonnegative(),
  deactivated: z.number().int().nonnegative(),
});
export type AdminSummary = z.infer<typeof adminSummarySchema>;

/**
 * `GET /api/admin/users`'s `200` body (US-020/AC-01, AC-02, AC-05, AC-06; design note §3.2/A5).
 *
 * NO top-level `total`. `summary.total` is the only total this envelope carries — a top-level
 * `total` alongside `summary.total` would be the same number on the same object, able to
 * disagree with itself (US-014 §3.1's phrase, applied here the same way US-016 §3.2 applied it
 * to reject a `counts` object). AC-05's match line is `Showing ${users.length} of ${summary.total}`
 * — the browser holds the whole filtered array (no paging, AC-08), so nothing on this screen
 * needs a third number.
 *
 * Not `.strict()` — additive-safe by design, matching every response in this package
 * (`desks.ts`, `auth.ts`).
 */
export const adminUsersResponseSchema = z.object({
  users: z.array(adminUserSchema),
  summary: adminSummarySchema,
});
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;
