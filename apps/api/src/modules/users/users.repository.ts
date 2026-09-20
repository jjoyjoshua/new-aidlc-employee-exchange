/**
 * US-020's slice — `GET /api/admin/users`. This module's first file (`apps/api/src/modules/
 * users/README.md` records the module's first slice, and the forward constraint that US-023
 * through US-027 add write routes here, including the deactivation cascade
 * `modules/README.md` insists belongs to `users`, not `bookings`).
 *
 * Reads `user_profiles` (`supabase/migrations/0001_user_profiles.sql:27-44`). No migration: the
 * table and `user_profiles_is_active_role_idx` (`:52`) already exist, that index's own comment
 * naming this story by id.
 */
import { supabase } from '../../infra/supabase/index.js';
import type { UserRole } from '@desk-booking/contracts';
import { buildSearchFilter } from './search-filter.js';

/** One row `listAccounts` reads back — the EXACT select list, and no more. */
export interface UserAccountRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

/** One row `getSummaryCounts` reads back — deliberately no PII column at all. */
export interface UserSummaryRow {
  role: UserRole;
  is_active: boolean;
}

/** The one row `findByEmail` reads back — just enough to compose US-021/AC-06's refusal
 *  (`{fullName} already belongs to...`, and the reactivation sentence when `!is_active`). */
export interface EmailLookupRow {
  full_name: string;
  is_active: boolean;
}

/** What `insertProfile` needs from the caller. `email` arrives already normalised
 *  (`createAccountRequestSchema`'s `.transform`, US-021/D-01) — this method does not re-normalise. */
export interface InsertProfileInput {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

/** The row `findById`/`updateProfileDetails` read and return (US-023). `role`/`is_active` ride
 *  along so the service can build the `200` body without a second read. */
export interface ProfileDetailsRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

/** What `updateProfileDetails` writes (US-023/AC-01, AC-07). Exactly `full_name`, `email`,
 *  `updated_at` — no index signature, so `must_change_password`/`is_active` are unrepresentable
 *  here, the same discipline `insertProfile`'s own docblock states for leaving them unnamed. */
export interface UpdateProfileDetailsInput {
  id: string;
  fullName: string;
  email: string;
  updatedAt: Date;
}

export type UpdateProfileDetailsOutcome =
  | { kind: 'ok'; profile: ProfileDetailsRow }
  | { kind: 'duplicate' }
  /** Zero rows matched `id` (US-023 design note §3.5, `updateDeskNumber`'s own reasoning: a
   *  write that applied to nothing must answer something, not a 500). */
  | { kind: 'not_found' };

export interface UsersRepository {
  /**
   * US-020/AC-01, AC-04 (REQ-032, `db-design.md:351-355`). Every account — `id, full_name,
   * email, role, is_active` — ordered `full_name` ASC. `full_name` is the sole select-list
   * addition beyond what an eventual `authenticatedUserSchema`-style read would carry, and this
   * IS the select list `admin.routes.spec.ts`'s AC-13 test depends on: `adminUsersResponseSchema`
   * is deliberately NOT `.strict()`, so this explicit list — never `select('*')` — is the only
   * thing stopping an accidental `must_change_password`/`deactivated_at`/`push_opt_in`/
   * `last_seen_at` leak (design note §7, ADR-004's "load-bearing, not a style preference").
   *
   * `q`, when present, is turned into a `.or()` clause by `buildSearchFilter` — ONE named pure
   * function, so this method never re-derives or duplicates its escaping (design note §2.3).
   * When `q` is absent, NO `.or()` call is issued at all — every account, unfiltered.
   */
  listAccounts(q?: string): Promise<UserAccountRow[]>;
  /**
   * US-020/AC-02, AC-06 (BR-001.11). `role, is_active` ONLY, over the WHOLE table, unconditionally
   * unfiltered — this method takes no `q` parameter, so a future caller cannot even pass one by
   * mistake. The tally into `{ total, employees, admins, deactivated }` is the SERVICE's
   * (`users.service.ts`), never a PostgREST aggregate (design note §2.2 — an aggregate sits
   * behind a server setting this repository does not control, so a recording fake could not
   * prove it ran).
   *
   * The one query in this whole story that touches every row and carries no PII at all — worth
   * stating here, not merely achieving by omission.
   */
  getSummaryCounts(): Promise<UserSummaryRow[]>;
  /**
   * US-021/AC-06, D-02. An exact `citext` match on the already-normalised email — the duplicate
   * check reads `user_profiles` directly, BEFORE any Supabase Auth call, because that call's own
   * "already registered" error carries neither the colliding account's name nor whether it is
   * deactivated, and both are what ST-04's refusal must say. `undefined` when no account holds
   * the email — the common case, and the only one that proceeds to create an account.
   *
   * `excludeId` (US-023/AC-02, AC-03) is defence in depth, NOT why AC-03 holds — the service's
   * own unchanged-email guard is load-bearing for that (design note §2.8). Both existing US-021
   * call sites omit it and are unaffected.
   */
  findByEmail(email: string, excludeId?: string): Promise<EmailLookupRow | undefined>;
  /**
   * US-021/AC-01, AC-08. Inserts the row for an account whose Auth credential already exists
   * (`id` is the Auth user's own id — this repository never mints one). Deliberately does NOT
   * name `is_active` or `must_change_password`: both default `true` at the column
   * (`0001_user_profiles.sql:34-36`), the same reasoning `desks.repository.ts`'s own `insertDesk`
   * uses for leaving `is_active` unnamed.
   */
  insertProfile(input: InsertProfileInput): Promise<void>;
  /**
   * US-023. The current row, read BEFORE any write (design note §2.6). Four jobs in one read:
   * existence (404), the old `fullName`/`email` a failed Auth write restores, whether the email
   * actually changed at all, and the `role`/`isActive` the `200` body carries. A second `findById`
   * beside `modules/auth`'s own is correct, not duplication: `eslint.config.mjs`'s MAY_IMPORT
   * forbids `users` importing `auth`, and that method's select list serves a session, not an edit.
   */
  findById(id: string): Promise<ProfileDetailsRow | undefined>;
  /**
   * US-023/AC-01, AC-07. This module's first `UPDATE`. Names `email`, `full_name`, `updated_at`
   * and NOTHING else — never `must_change_password`, never `is_active` (design note §3.3). Also
   * the COMPENSATING restore's own statement: one method, two callers — the happy path writes the
   * new values, a failed Auth write calls it again with the remembered old ones (ADR-012).
   *
   * `.maybeSingle()`, never `.single()` — `updateDeskNumber`'s own stated reason: `.single()`
   * turns zero matched rows into a thrown Postgres error and loses the 404. A `23505` naming
   * `user_profiles_email_key` maps to `duplicate`; any other `23505` throws rather than being
   * mapped to a refusal it is not — `updateDeskNumber`'s own precedent, unchanged.
   */
  updateProfileDetails(input: UpdateProfileDetailsInput): Promise<UpdateProfileDetailsOutcome>;
  /**
   * US-024/AC-01, AC-04, AC-07, AC-12. Names `role` and `updated_at` and NOTHING else — never
   * `is_active`, never `deactivated_at` (US-025's), never `must_change_password` — the same
   * discipline `updateProfileDetails` states for its own two columns.
   *
   * `.maybeSingle()`, never `.single()` — `updateProfileDetails`'s own reason: zero matched rows
   * must answer `{ kind: 'not_found' }`, not a thrown Postgres error.
   *
   * The `blocked` outcome maps `error.code === 'Z0011'` ONLY (design note §3.1-§3.2, `ADR-013`)
   * — the project-minted SQLSTATE `user_profiles_require_active_admin()` raises
   * (`supabase/migrations/0004_last_active_admin_guard.sql`), never a message match. `Z0011` is
   * raised by exactly one statement in the whole schema, unlike `23505` above (raised by every
   * unique index), so no second discriminator is needed.
   */
  setRole(input: SetRoleInput): Promise<SetRoleOutcome>;
}

/** US-024. What `setRole` needs from the caller — `updatedAt` is the ONE clock reading the
 *  service takes, threaded through exactly as `updateProfileDetails` requires (US-023's own
 *  precedent for `nowMs()`). */
export interface SetRoleInput {
  id: string;
  role: UserRole;
  updatedAt: Date;
}

export type SetRoleOutcome =
  | { kind: 'ok'; profile: ProfileDetailsRow }
  /** US-024/AC-04, AC-07 (BR-001.11, V-11). The DATABASE refused it, inside the writing
   *  transaction, serialised by the trigger's own advisory lock (`ADR-013`) — never an in-app
   *  count taken earlier in the request. */
  | { kind: 'blocked' }
  | { kind: 'not_found' };

/** The SQLSTATE `user_profiles_require_active_admin()` raises. A PROJECT-MINTED code in the
 *  implementation-defined class `Z0`, raised by exactly ONE statement in the whole schema —
 *  design note §3.1. Deliberately not exported: a database detail, not a wire contract. The wire
 *  contract is `ERROR_CODES.last_active_admin` (`libs/contracts`), which the ROUTE composes from
 *  `blocked`. */
const LAST_ACTIVE_ADMIN_SQLSTATE = 'Z0011';

export const usersRepository: UsersRepository = {
  async listAccounts(q) {
    const builder = supabase()
      .from('user_profiles')
      .select('id, full_name, email, role, is_active')
      .order('full_name');

    const { data, error } = await (q === undefined ? builder : builder.or(buildSearchFilter(q)));

    if (error) throw new Error(`user accounts lookup failed: ${error.message}`);
    return (data ?? []) as UserAccountRow[];
  },

  async getSummaryCounts() {
    const { data, error } = await supabase().from('user_profiles').select('role, is_active');

    if (error) throw new Error(`user summary lookup failed: ${error.message}`);
    return (data ?? []) as UserSummaryRow[];
  },

  async findByEmail(email, excludeId) {
    const builder = supabase().from('user_profiles').select('full_name, is_active').eq('email', email);
    const { data, error } = await (excludeId === undefined ? builder : builder.neq('id', excludeId)).maybeSingle();

    if (error) throw new Error(`email lookup failed: ${error.message}`);
    return (data as EmailLookupRow | null) ?? undefined;
  },

  async insertProfile({ id, email, fullName, role }) {
    const { error } = await supabase()
      .from('user_profiles')
      .insert({ id, email, full_name: fullName, role });

    if (error) throw new Error(`profile insert failed: ${error.message}`);
  },

  async findById(id) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .select('id, full_name, email, role, is_active')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`user lookup failed: ${error.message}`);
    return (data as ProfileDetailsRow | null) ?? undefined;
  },

  async updateProfileDetails({ id, fullName, email, updatedAt }) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .update({ full_name: fullName, email, updated_at: updatedAt.toISOString() })
      .eq('id', id)
      .select('id, full_name, email, role, is_active')
      .maybeSingle();

    if (!error) return data ? { kind: 'ok', profile: data as ProfileDetailsRow } : { kind: 'not_found' };
    if (error.code !== '23505') throw new Error(`user update failed: ${error.message}`);
    if (error.message.includes('user_profiles_email_key')) return { kind: 'duplicate' };
    throw new Error(`unrecognised unique violation: ${error.message}`);
  },

  async setRole({ id, role, updatedAt }) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .update({ role, updated_at: updatedAt.toISOString() })
      .eq('id', id)
      .select('id, full_name, email, role, is_active')
      .maybeSingle();

    if (!error) return data ? { kind: 'ok', profile: data as ProfileDetailsRow } : { kind: 'not_found' };
    if (error.code === LAST_ACTIVE_ADMIN_SQLSTATE) return { kind: 'blocked' };
    throw new Error(`role change failed: ${error.message}`);
  },
};
