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
import type { BookingStatus, OfficeDate, UserRole } from '@desk-booking/contracts';
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
  /**
   * US-025/AC-05. The account's own **Confirmed** bookings dated `from` or later — desk number
   * and date each, for the deactivate confirmation dialog to list individually. Read-only,
   * changes nothing.
   *
   * Reads `bookings`, a table `modules/users` does NOT own — per `app-architecture.md` §2's
   * written exception granting `users` the whole deactivation cascade (design note §6.1, D-02),
   * the same "read across, write within" shape `desks.repository.ts`'s
   * `countUpcomingConfirmedForDesk` already exercises for a different table.
   *
   * `status`/`from` arrive from the SERVICE's `displayStatusPredicate('confirmed', today)`
   * reading — never written literally here, `countUpcomingConfirmedForDesk`'s own discipline.
   * No `count` returned: the caller reads `.length` (design note §3.3, C15).
   */
  previewDeactivation(id: string, status: BookingStatus, from: OfficeDate): Promise<PreviewDeactivationRow[]>;
  /**
   * US-025/AC-01, AC-02, AC-03, AC-04, AC-10, AC-12. Calls the migration's
   * `deactivate_account_cascade` Postgres function via `.rpc()` — the project's first cross-table
   * transactional write (design note §2). One call, one transaction: flips `is_active` and
   * `deactivated_at`, and cancels every Confirmed booking dated `today` or later for this account,
   * or aborts the whole thing if BR-001.11's existing trigger (`0004_last_active_admin_guard.sql`,
   * unmodified) refuses it.
   *
   * The four PostgREST argument names (`p_target_id`, `p_actor_id`, `p_now`, `p_today`) are a wire
   * contract spelled ONLY in this method (design note §2.1, §3.1) — renaming any of them here
   * without the migration is a breaking change that surfaces as `PGRST202` at runtime, never at
   * typecheck.
   *
   * Four outcomes, not three: `already_inactive` is a real case (a race, or a stale list) that
   * `not_found`'s approved 404 copy would misrepresent — the account plainly exists (design note
   * §2.2). This method reports it faithfully; `usersService.deactivateAccount` decides what it
   * means for the product (collapses it to `ok`, design note §3.2, C8).
   *
   * Matches `error.code === LAST_ACTIVE_ADMIN_SQLSTATE` ONLY — the same constant `setRole` uses,
   * not re-declared — and throws on everything else, including `PGRST202` (a schema-cache miss or
   * a mis-spelled argument name, never a business outcome).
   */
  deactivateAccount(input: DeactivateAccountInput): Promise<DeactivateAccountOutcome>;
  /**
   * US-026/AC-01, AC-03, AC-04, AC-05, AC-07. Names `is_active` and `updated_at` and NOTHING
   * else — never `role` (AC-03), never `must_change_password` (AC-05), never `deactivated_at`
   * (design note §4 — that column is scoped in writing to "when REQ-020 last ran", an audit
   * stamp `0001_user_profiles.sql:42` gives no reactivation branch to clear). AC-04 needs no
   * predicate here at all: this method never names `bookings`, so the cascade's cancellations
   * cannot be touched by construction, not by a guard.
   *
   * A plain `UPDATE`, not an RPC (design note §3) — unlike `deactivateAccount`, this write is one
   * statement with no cross-table effect, so `setRole`'s shape (`:341-352`) is the correct model,
   * right down to `updated_at` being set: `user_profiles.updated_at` carries no narrower scope the
   * way `desks.updated_at` does (`0002_desks.sql`'s "REQ-016 only"), so this write sets it exactly
   * as `updateProfileDetails`/`setRole` already do for their own non-rename edits.
   *
   * No `blocked` outcome: the last-active-admin trigger's `WHEN` clause requires `old.is_active`,
   * which is false on every reactivation by definition, so the trigger is never entered (design
   * note §2) — a `blocked` branch here would be unreachable. No `already_active` outcome either:
   * a plain `UPDATE` cannot see the pre-write state, and unlike `deactivateAccount`'s cascade, a
   * repeat activation has no side effect to double-fire, so `ok` is an honest answer either way
   * (design note §3).
   *
   * `.maybeSingle()`, never `.single()` — `updateProfileDetails`'s own stated reason: zero matched
   * rows must answer `{ kind: 'not_found' }`, not a thrown Postgres error.
   */
  activateAccount(input: ActivateAccountInput): Promise<ActivateAccountOutcome>;

  /**
   * US-027/AC-07, AC-10. Names `must_change_password` and `updated_at` and NOTHING else — never
   * `role`, never `is_active` — `setRole`/`activateAccount`'s own discipline for their own two
   * columns.
   *
   * Unconditional, exactly like `activateAccount`: this is the first writer to set the flag back
   * to `true` on an account that is already active. There is no `already_armed` outcome — a plain
   * `UPDATE` cannot see the pre-write state, and a repeat has no side effect to double-fire, so
   * `ok` is honest either way (AC-10's re-resettable case is this branch, not a separate one).
   *
   * `.maybeSingle()`, never `.single()` — zero matched rows answers `not_found`, not a throw.
   *
   * **This write doubles as the reset endpoint's existence check** (design note §2.2, §2.3): the
   * service calls this FIRST, before generating a password or touching Supabase Auth, and reads
   * `not_found` straight off this result rather than a preceding `findById`. `RETURNING` the same
   * five columns `activateAccount` does is what makes that possible — one statement is the
   * existence check, the write, and the response body.
   */
  armMustChangePassword(input: ArmMustChangePasswordInput): Promise<ArmMustChangePasswordOutcome>;
}

/** US-026. What `activateAccount` needs from the caller — `updatedAt` is the ONE clock reading
 *  the service takes, threaded through exactly as `setRole` requires. */
export interface ActivateAccountInput {
  id: string;
  updatedAt: Date;
}

export type ActivateAccountOutcome =
  | { kind: 'ok'; profile: ProfileDetailsRow }
  | { kind: 'not_found' };

/** US-027. What `armMustChangePassword` needs from the caller — `updatedAt` is the ONE clock
 *  reading the service takes, threaded through exactly as `activateAccount` requires. */
export interface ArmMustChangePasswordInput {
  id: string;
  updatedAt: Date;
}

export type ArmMustChangePasswordOutcome =
  | { kind: 'ok'; profile: ProfileDetailsRow }
  | { kind: 'not_found' };

/** US-025/AC-05. One row `previewDeactivation` reads back. */
export interface PreviewDeactivationRow {
  id: string;
  desk_number: string;
  booking_date: OfficeDate;
}

/** US-025. What `deactivateAccount` needs from the caller. `now`/`today` are ONE clock reading
 *  (`officeToday(nowMs(), officeTimezone)`), never two — the same discipline every other writer
 *  in this module follows for `updatedAt`. `actorId` is ATTRIBUTION only (`bookings.cancelled_by`,
 *  BR-001.20) — `requireAdmin` at the mount is the sole authority over who may call this at all. */
export interface DeactivateAccountInput {
  id: string;
  actorId: string;
  now: Date;
  today: OfficeDate;
}

/** One cascade-cancelled booking, as the RPC returns it (design note §2.3, C16). `deskNumber` is
 *  joined so US-029/US-032 can compose copy naming a desk without a second query (FR-12) — a uuid
 *  is not composable copy. `cancellationSource` is read BACK from the row, never re-asserted —
 *  `0003_bookings.sql`'s own instruction to the notification composer. */
export interface CancelledBookingRow {
  id: string;
  deskId: string;
  deskNumber: string;
  bookingDate: OfficeDate;
  cancellationSource: 'deactivation_cascade';
}

export type DeactivateAccountOutcome =
  | { kind: 'ok'; profile: ProfileDetailsRow; cancelledBookings: CancelledBookingRow[] }
  /** US-025/design note §2.2. The account exists and was ALREADY inactive when the cascade ran —
   *  a race, or a stale list. Distinct from `not_found`, whose approved 404 copy would be false
   *  about an account that plainly exists. The SERVICE decides what this means for the product. */
  | { kind: 'already_inactive'; profile: ProfileDetailsRow }
  /** US-025/AC-10 (BR-001.11, V-11). The DATABASE refused it, inside the writing transaction,
   *  via the SAME trigger and advisory lock `setRole` above relies on (`ADR-013`) — never an
   *  in-app count. */
  | { kind: 'blocked' }
  | { kind: 'not_found' };

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

/** US-025. The one place this name and its four PostgREST argument names are spelled (design
 *  note §2.1, §3.1) — renaming either without the migration is a breaking change that surfaces
 *  as `PGRST202` at runtime, never at typecheck. */
const DEACTIVATE_ACCOUNT_RPC = 'deactivate_account_cascade';

/** The shape `deactivate_account_cascade` returns, as JSON, before this method reshapes it into
 *  `DeactivateAccountOutcome` (design note §2.2, §2.3). Not exported — a database detail. */
interface DeactivateAccountPayload {
  outcome: 'ok' | 'not_found' | 'already_inactive';
  profile?: ProfileDetailsRow;
  cancelled_bookings?: Array<{
    id: string;
    desk_id: string;
    desk_number: string;
    booking_date: OfficeDate;
    cancellation_source: 'deactivation_cascade';
  }>;
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

  async previewDeactivation(id, status, from) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('id, booking_date, desks(desk_number)')
      .eq('user_id', id)
      .eq('status', status)
      .gte('booking_date', from);

    if (error) throw new Error(`deactivation preview lookup failed: ${error.message}`);

    // A many-to-one embed defaults to an array in supabase-js's types with no generated
    // `Database` schema, but PostgREST embeds it as a single object at runtime
    // (`admin-bookings.repository.ts`'s own precedent for this cast).
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      booking_date: OfficeDate;
      desks: { desk_number: string } | null;
    }>;

    return rows.map((row) => {
      // desk_id is NOT NULL (0003_bookings.sql) — a missing embed means something is
      // structurally wrong, the same reasoning `admin-bookings.repository.ts` states.
      if (!row.desks) throw new Error(`booking ${row.id} has no joined desk — desk_id is NOT NULL, this is a bug`);
      return { id: row.id, desk_number: row.desks.desk_number, booking_date: row.booking_date };
    });
  },

  async deactivateAccount({ id, actorId, now, today }) {
    const { data, error } = await supabase().rpc(DEACTIVATE_ACCOUNT_RPC, {
      p_target_id: id,
      p_actor_id: actorId,
      p_now: now.toISOString(),
      p_today: today,
    });

    // Same constant, same single match, same reason as `setRole` above: `Z0011` is raised by
    // exactly one statement in the whole schema. Everything else — including `PGRST202` (schema
    // cache / a mis-spelled argument name) — throws rather than being mapped to a refusal it is
    // not (design note §2.7, §3.1).
    if (error) {
      if (error.code === LAST_ACTIVE_ADMIN_SQLSTATE) return { kind: 'blocked' };
      throw new Error(`account deactivation failed: ${error.message}`);
    }

    const payload = data as DeactivateAccountPayload | null;
    if (!payload) throw new Error('deactivation returned no payload — this is a bug');

    if (payload.outcome === 'not_found') return { kind: 'not_found' };

    if (payload.outcome === 'already_inactive') {
      if (!payload.profile) throw new Error('deactivation outcome "already_inactive" carried no profile — this is a bug');
      return { kind: 'already_inactive', profile: payload.profile };
    }

    if (payload.outcome === 'ok') {
      if (!payload.profile) throw new Error('deactivation outcome "ok" carried no profile — this is a bug');
      const cancelledBookings: CancelledBookingRow[] = (payload.cancelled_bookings ?? []).map((row) => ({
        id: row.id,
        deskId: row.desk_id,
        deskNumber: row.desk_number,
        bookingDate: row.booking_date,
        cancellationSource: row.cancellation_source,
      }));
      return { kind: 'ok', profile: payload.profile, cancelledBookings };
    }

    // `updateProfileDetails`'s "unrecognised unique violation" discipline: an outcome this code
    // does not know is a bug, never a refusal.
    throw new Error(`unrecognised deactivation outcome: ${String((payload as { outcome: unknown }).outcome)}`);
  },

  async activateAccount({ id, updatedAt }) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .update({ is_active: true, updated_at: updatedAt.toISOString() })
      .eq('id', id)
      .select('id, full_name, email, role, is_active')
      .maybeSingle();

    if (error) throw new Error(`account activation failed: ${error.message}`);
    return data ? { kind: 'ok', profile: data as ProfileDetailsRow } : { kind: 'not_found' };
  },

  async armMustChangePassword({ id, updatedAt }) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .update({ must_change_password: true, updated_at: updatedAt.toISOString() })
      .eq('id', id)
      .select('id, full_name, email, role, is_active')
      .maybeSingle();

    if (error) throw new Error(`must_change_password arming failed: ${error.message}`);
    return data ? { kind: 'ok', profile: data as ProfileDetailsRow } : { kind: 'not_found' };
  },
};
