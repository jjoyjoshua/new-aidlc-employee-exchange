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
   */
  findByEmail(email: string): Promise<EmailLookupRow | undefined>;
  /**
   * US-021/AC-01, AC-08. Inserts the row for an account whose Auth credential already exists
   * (`id` is the Auth user's own id — this repository never mints one). Deliberately does NOT
   * name `is_active` or `must_change_password`: both default `true` at the column
   * (`0001_user_profiles.sql:34-36`), the same reasoning `desks.repository.ts`'s own `insertDesk`
   * uses for leaving `is_active` unnamed.
   */
  insertProfile(input: InsertProfileInput): Promise<void>;
}

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

  async findByEmail(email) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .select('full_name, is_active')
      .eq('email', email)
      .maybeSingle();

    if (error) throw new Error(`email lookup failed: ${error.message}`);
    return (data as EmailLookupRow | null) ?? undefined;
  },

  async insertProfile({ id, email, fullName, role }) {
    const { error } = await supabase()
      .from('user_profiles')
      .insert({ id, email, full_name: fullName, role });

    if (error) throw new Error(`profile insert failed: ${error.message}`);
  },
};
