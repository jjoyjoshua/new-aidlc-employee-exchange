/**
 * Two reads for the availability screen (REQ-007), and no rule (`bookings.service.ts` holds the
 * projection). ADR-004 — this module may `SELECT` from `desks`, a table it does not own, with an
 * explicit column list; only `modules/desks` (US-015/US-017) may write it.
 *
 * Rows come back in the database's snake_case; the mapping to the wire's camelCase happens in
 * the service, matching the convention `auth.repository.ts` set on the first module.
 */
import { supabase } from '../../infra/supabase/index.js';
import type { BookingStatus, OfficeDate } from '@desk-booking/contracts';

/** The `desks` columns this module reads. Never `select('*')` — a wider select is how an
 *  occupant column or a write-side field would leak into a read this module does not own. */
export interface DeskRow {
  id: string;
  desk_number: string;
}

/** The `desks` columns US-007/FR-04's active/exists guard reads. Never `select('*')` — same
 *  rule as `DeskRow` above. `desk_number` travels too so FR-01's `201` response can name the
 *  desk without a second query — the service already has this row by the time it inserts. */
export interface DeskActiveRow {
  id: string;
  desk_number: string;
  is_active: boolean;
}

/** US-007/FR-05. What `findMyConfirmedBooking` hands back — the caller's own booking, joined
 *  to the desk number `myBooking`'s wire shape needs, nothing else (design note §2.2). */
export interface MyConfirmedBookingRow {
  id: string;
  desk_id: string;
  desk_number: string;
}

/** US-010/AC-01, AC-03, AC-04, AC-05. One row of `listMyBookingsInWindow` — the STORED status;
 *  the derivation to Completed happens in the service (`booking-history.ts`), not here. */
export interface MyBookingRow {
  id: string;
  booking_date: OfficeDate;
  status: BookingStatus;
  desk_number: string;
}

/** US-007/FR-02. `insertConfirmedBooking`'s outcome — a discriminated result, never a guess.
 *  See the constraint-violation mapping in `insertConfirmedBooking` for what each kind means. */
export type InsertBookingOutcome =
  | { kind: 'ok'; id: string }
  | { kind: 'desk_conflict' }
  | { kind: 'user_conflict' };

export interface AvailabilityRepository {
  /** US-006/AC-04. `.eq('is_active', true)` is the WHOLE of this criterion — an inactive desk
   *  must never appear here, as taken or as free. Ordered by `desk_number`, which is also
   *  AC-05's total order over the fixed-width `A-01` format (`zones.ts` relies on this same
   *  property independently, so AC-05 is provable without a database too). */
  listActiveDesks(): Promise<DeskRow[]>;
  /** US-006/AC-06. The select list is `desk_id` ONLY — no `user_id`, no `*`. The occupant is
   *  never read, not merely never sent (design note §2.5): there is no column here to forget to
   *  strip in a later refactor. */
  listConfirmedDeskIds(date: OfficeDate): Promise<string[]>;
  /** US-007/FR-04. `undefined` for a missing id — an inactive desk is still a real row and is
   *  returned as `{ is_active: false }`, never conflated with "does not exist". */
  getDeskById(id: string): Promise<DeskActiveRow | undefined>;
  /** US-007/FR-05, AC-06. Filtered to `user_id`, `booking_date` and `status = 'confirmed'` —
   *  never a wider select (design note §2.2's three-part argument for why a leak here is safe
   *  even so, and why the filter must not be dropped regardless). `undefined` means the caller
   *  holds no Confirmed booking for that date. */
  findMyConfirmedBooking(userId: string, date: OfficeDate): Promise<MyConfirmedBookingRow | undefined>;
  /** US-007/FR-02, D-01, D-04. No availability check precedes this — the two partial unique
   *  indexes in `0003_bookings.sql` are what arbitrate. See the implementation for the mapping
   *  contract (Architect design note §1.2): only a recognised `23505` naming one of the two
   *  known indexes becomes an outcome; everything else throws. */
  insertConfirmedBooking(userId: string, deskId: string, date: OfficeDate): Promise<InsertBookingOutcome>;
  /** US-007/FR-06, AC-07, D-03 as amended by US-011 (design note §3). One
   *  `UPDATE ... RETURNING`, scoped to id / owner / confirmed / **not past** — no read-then-write
   *  window (design note §3.2).
   *
   *  `today` is the office's own calendar date, passed in from the service's single
   *  `officeToday(nowMs(), officeTimezone)` reading — never read here (domain/ and repositories
   *  take their clock as an argument). It is BR-001.6 / US-011/AC-02 expressed where the write
   *  happens; the same rule in TypeScript is `bookingDisplayStatus(...) === 'confirmed'`
   *  (ADR-007).
   *
   *  `undefined` means the write applied to nothing. It does NOT say why — classification of a
   *  miss is the service's job, from `findMyBookingState` below (design note §1.4). */
  cancelOwnedBooking(
    userId: string,
    bookingId: string,
    cancelledAt: Date,
    today: OfficeDate,
  ): Promise<{ id: string } | undefined>;
  /** US-011/AC-09. The caller's own booking's current state, or `undefined`. Read-only, and
   *  issued ONLY after `cancelOwnedBooking` returns nothing, to classify the miss (design note
   *  §1.4).
   *
   *  `.eq('user_id', userId)` is what keeps US-007/D-03's anti-enumeration guarantee structural:
   *  a booking that is not the caller's is `undefined` here, indistinguishable from one that does
   *  not exist, so the caller's own `booking_already_cancelled` can only ever describe a row the
   *  caller already reads through `GET /api/bookings` (design note §1.2). Never widen the select
   *  list beyond `status, booking_date` — the service needs nothing else. */
  findMyBookingState(
    userId: string,
    bookingId: string,
  ): Promise<{ status: BookingStatus; booking_date: OfficeDate } | undefined>;
  /** US-009/AC-02, AC-06. Confirmed bookings across a date RANGE, for the free-day scan. The
   *  select list is `booking_date, desk_id` — no `user_id`, exactly as `listConfirmedDeskIds`
   *  (US-006/AC-06). Reads `bookings`, the table this module owns; `desks` is not re-read (the
   *  service already has the active desk list from the same availability call). */
  listConfirmedDeskIdsInRange(
    from: OfficeDate,
    to: OfficeDate,
  ): Promise<Array<{ booking_date: OfficeDate; desk_id: string }>>;
  /** US-009/AC-06, BR-001.1. The caller's OWN confirmed dates in the range — `booking_date` only,
   *  filtered to `user_id`, the shape `findMyConfirmedBooking` established (US-007). */
  listMyConfirmedDatesInRange(userId: string, from: OfficeDate, to: OfficeDate): Promise<OfficeDate[]>;
  /** US-010/AC-01, AC-03, AC-04, AC-05. The caller's own bookings in an INCLUSIVE date window,
   *  newest first. `to === undefined` means unbounded above — the default page carries future
   *  bookings too (design note §1.2). ALL statuses: a Cancelled row is history and SCR-002
   *  renders it (ST-10) — there is no `.eq('status', ...)` here.
   *
   *  Filtered to `user_id`, never a parameter. `desk_number` travels through the embed so a desk
   *  renamed since shows its CURRENT number (BR-001.19, RISK-012 — the story's accepted
   *  consequence), matching `findMyConfirmedBooking`'s join.
   *
   *  Ordered `booking_date desc, created_at desc` — the second key is load-bearing, not
   *  belt-and-braces (design note §5): cancel-then-rebook (BR-001.2) can leave two rows sharing
   *  the same `booking_date` for the same user, and only `created_at desc` gives a stable order. */
  listMyBookingsInWindow(userId: string, from: OfficeDate, to?: OfficeDate): Promise<MyBookingRow[]>;
  /** US-010/AC-03. The single newest booking of the caller's STRICTLY before a date, or
   *  `undefined` when nothing is older. Two uses, one shape (design note §1.3): the "is there
   *  anything older" probe that decides whether the Show-older control exists at all, and the
   *  anchor for the next page's window. `booking_date` ONLY — nothing else is needed. */
  findMyNewestBookingBefore(userId: string, before: OfficeDate): Promise<{ booking_date: OfficeDate } | undefined>;
  /** US-008/AC-03. The caller's most recently booked desk id across ALL dates and ALL statuses —
   *  derived from history, never a stored preference (there is no favourite-desk column and this
   *  story adds none). `desk_id` ONLY: no `user_id`, no dates, no status.
   *
   *  NO status filter: a Cancelled booking counts as history (product decision, story §Edge
   *  cases — it still records where the employee chose to sit).
   *
   *  Ordered `booking_date desc, created_at desc` — the second key is load-bearing, not
   *  belt-and-braces (design note §5): cancel-then-rebook (BR-001.2) can leave two rows sharing
   *  the same `booking_date` for the same user, and only `created_at desc` picks the row that
   *  replaced the other, not whichever row Postgres returns first.
   *
   *  `undefined` means the caller has never booked (AC-04). */
  findMyLastBookedDeskId(userId: string): Promise<string | undefined>;
}

export const availabilityRepository: AvailabilityRepository = {
  async listActiveDesks() {
    const { data, error } = await supabase()
      .from('desks')
      .select('id, desk_number')
      .eq('is_active', true)
      .order('desk_number');

    if (error) throw new Error(`desks lookup failed: ${error.message}`);
    return (data ?? []) as DeskRow[];
  },

  async listConfirmedDeskIds(date) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('desk_id')
      .eq('booking_date', date)
      .eq('status', 'confirmed');

    if (error) throw new Error(`bookings lookup failed: ${error.message}`);
    return ((data ?? []) as Array<{ desk_id: string }>).map((row) => row.desk_id);
  },

  async getDeskById(id) {
    const { data, error } = await supabase()
      .from('desks')
      .select('id, desk_number, is_active')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`desk lookup failed: ${error.message}`);
    return (data as DeskActiveRow | null) ?? undefined;
  },

  async findMyConfirmedBooking(userId, date) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('id, desk_id, desks(desk_number)')
      .eq('user_id', userId)
      .eq('booking_date', date)
      .eq('status', 'confirmed')
      .maybeSingle();

    if (error) throw new Error(`bookings lookup failed: ${error.message}`);
    if (!data) return undefined;

    // `unknown` first, per the compiler's own hint: supabase-js's query-builder types default a
    // relationship embed to an ARRAY when no generated `Database` schema type is supplied (this
    // project does not generate one), because it cannot see the foreign key's cardinality from
    // the select string alone. At runtime PostgREST embeds a many-to-one relation (many
    // `bookings` rows to one `desks` row) as a single object, never an array — this cast states
    // the actual wire shape, not the generic default the type-level parser guessed.
    const row = data as unknown as { id: string; desk_id: string; desks: { desk_number: string } | null };
    return { id: row.id, desk_id: row.desk_id, desk_number: row.desks?.desk_number ?? '' };
  },

  /**
   * D-01, D-04. No `SELECT` precedes this insert — the two partial unique indexes are the only
   * thing that decides who wins a race for the same desk or the same user's second booking of
   * the day. What follows is the mapping contract Architect design note §1.2 requires:
   *
   *   - Gate on the SQLSTATE first. `23505` is "unique violation"; anything else (the
   *     `bookings_weekday_only`/`bookings_cancelled_*` CHECK constraints are `23514`, a missing
   *     desk's FK is `23503`) means the code is wrong, not that the user is — THROW, do not map
   *     it to a conflict. It reaches `error-handler.ts`, which logs it and returns a bare 500.
   *   - Match the violated index by its BARE NAME inside `error.message`, never the surrounding
   *     English sentence — Postgres localises that via `lc_messages`; the quoted identifier is
   *     not localised.
   *   - A `23505` that names neither known index is NOT an outcome either. Falling through to
   *     `desk_conflict` here would tell an employee "someone else took that desk" when the truth
   *     is unknown — a wrong answer nobody notices is worse than an honest 500 (design note
   *     §1.2, Architect finding F-1). THROW.
   *
   * Proven against a real Postgres instance, not only this fake-client mapping, by
   * `bookings.repository.concurrency.spec.ts` (Step 3, design note §1.3, F-2).
   */
  async insertConfirmedBooking(userId, deskId, date) {
    const { data, error } = await supabase()
      .from('bookings')
      .insert({ user_id: userId, desk_id: deskId, booking_date: date })
      .select('id')
      .single();

    if (!error) return { kind: 'ok', id: (data as { id: string }).id };

    if (error.code !== '23505') {
      throw new Error(`booking insert failed: ${error.message}`);
    }
    if (error.message.includes('bookings_one_confirmed_per_desk_per_day')) return { kind: 'desk_conflict' };
    if (error.message.includes('bookings_one_confirmed_per_user_per_day')) return { kind: 'user_conflict' };

    throw new Error(`unrecognised unique violation: ${error.message}`);
  },

  /**
   * D-03, design note §3.2, amended by US-011 (its own design note §2.1, §3, §4.2). One
   * `UPDATE ... WHERE id = ? AND user_id = ? AND status = 'confirmed' AND booking_date >= ?
   * RETURNING id` — no read-then-write window, so two concurrent cancels of the same booking
   * produce exactly one returned row and one empty result, the database arbitrating exactly as
   * the insert's unique indexes do. `cancelledAt` and `today` are the caller's OWN clock reading,
   * from the SAME instant, never this module's own (same convention as `auth.repository.ts`'s
   * `stampLastSeen`) — two separate `nowMs()` calls would differ across office midnight
   * (US-011 design note §2.1, §8.4).
   *
   * The `.gte('booking_date', today)` predicate is BR-001.6 / US-011/AC-02 expressed where the
   * write happens — a past-dated Confirmed booking is left unmatched, the same way "not the
   * caller's" and "not currently confirmed" already are. `undefined` no longer says WHY (US-011
   * design note §1.4): classification is `bookings.service.ts`'s job, via `findMyBookingState`.
   *
   * The schema requires `cancelled_at`/`cancellation_source` to be set in the SAME `UPDATE` as
   * `status = 'cancelled'` (`bookings_cancelled_at_matches_status`, `bookings_cancelled_has_source`).
   * If either were forgotten here, Postgres rejects the write with a `23514` — which propagates
   * as an unhandled error (a 500), never silently as `404 booking_not_found` (design note §1.2).
   */
  async cancelOwnedBooking(userId, bookingId, cancelledAt, today) {
    const { data, error } = await supabase()
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: cancelledAt.toISOString(),
        cancelled_by: userId,
        cancellation_source: 'owner',
      })
      .eq('id', bookingId)
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .gte('booking_date', today)
      .select('id')
      .maybeSingle();

    if (error) throw new Error(`booking cancel failed: ${error.message}`);
    return (data as { id: string } | null) ?? undefined;
  },

  /**
   * US-011/AC-09, design note §1.4, §4.2. Read-only, issued ONLY when `cancelOwnedBooking` above
   * returns nothing, and ONLY to classify that miss — never to decide whether to write. Select
   * list is `status, booking_date` and nothing wider; no `desk_id`, no join.
   *
   * `.eq('user_id', userId)` is load-bearing for D-03's anti-enumeration guarantee: a booking
   * that is not the caller's returns `undefined` here, byte-identical to one that does not exist
   * at all — the new `409 booking_already_cancelled` this feeds can therefore only ever describe
   * a booking the caller already owns and can already read via `GET /api/bookings` (design note
   * §1.2). Do not drop this filter, and do not widen the select list.
   */
  async findMyBookingState(userId, bookingId) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('status, booking_date')
      .eq('id', bookingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(`bookings lookup failed: ${error.message}`);
    return (data as { status: BookingStatus; booking_date: OfficeDate } | null) ?? undefined;
  },

  /**
   * US-009/AC-02, AC-06. The select list is `booking_date, desk_id` — no `user_id` — over an
   * inclusive `[from, to]` range, confirmed only. Served by `bookings_booking_date_status_idx`
   * (`0003_bookings.sql`), the same index `listConfirmedDeskIds` uses for a single date.
   */
  async listConfirmedDeskIdsInRange(from, to) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('booking_date, desk_id')
      .gte('booking_date', from)
      .lte('booking_date', to)
      .eq('status', 'confirmed');

    if (error) throw new Error(`bookings range lookup failed: ${error.message}`);
    return (data ?? []) as Array<{ booking_date: OfficeDate; desk_id: string }>;
  },

  /**
   * US-009/AC-06, BR-001.1. Filtered to `user_id`, over the same inclusive range, confirmed only —
   * served by `bookings_user_id_booking_date_idx`.
   */
  async listMyConfirmedDatesInRange(userId, from, to) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('booking_date')
      .eq('user_id', userId)
      .gte('booking_date', from)
      .lte('booking_date', to)
      .eq('status', 'confirmed');

    if (error) throw new Error(`bookings range lookup failed: ${error.message}`);
    return ((data ?? []) as Array<{ booking_date: OfficeDate }>).map((row) => row.booking_date);
  },

  async findMyLastBookedDeskId(userId) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('desk_id')
      .eq('user_id', userId)
      .order('booking_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`bookings lookup failed: ${error.message}`);
    return (data as { desk_id: string } | null)?.desk_id ?? undefined;
  },

  /**
   * US-010/AC-01, AC-03, AC-04, AC-05, design note §5. `to` is applied with `.lte()` only when
   * given — the default page (no `to`) is unbounded above, on purpose (§1.2).
   */
  async listMyBookingsInWindow(userId, from, to) {
    let query = supabase()
      .from('bookings')
      .select('id, booking_date, status, desks(desk_number)')
      .eq('user_id', userId)
      .gte('booking_date', from)
      .order('booking_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (to !== undefined) query = query.lte('booking_date', to);

    const { data, error } = await query;
    if (error) throw new Error(`bookings lookup failed: ${error.message}`);

    // See findMyConfirmedBooking's comment above for why this cast is necessary and correct.
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      booking_date: OfficeDate;
      status: BookingStatus;
      desks: { desk_number: string } | null;
    }>;
    // Unlike findMyConfirmedBooking, a missing embed is NOT defaulted to '' here: `desk_id` is
    // `not null references desks (id) on delete restrict` (0003_bookings.sql:27), so every
    // booking has a desk and a missing embed means something is structurally wrong. Manufacturing
    // '' would turn an impossible state into a browser parse failure (deskNumber: z.string().min(1)
    // rejects it) instead of a loud server error (design note §5).
    return rows.map((row) => {
      if (!row.desks) throw new Error(`booking ${row.id} has no joined desk — desk_id is NOT NULL, this is a bug`);
      return { id: row.id, booking_date: row.booking_date, status: row.status, desk_number: row.desks.desk_number };
    });
  },

  /** US-010/AC-03, design note §1.3, §5. `booking_date` only — nothing else is read. */
  async findMyNewestBookingBefore(userId, before) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('booking_date')
      .eq('user_id', userId)
      .lt('booking_date', before)
      .order('booking_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`bookings lookup failed: ${error.message}`);
    return (data as { booking_date: OfficeDate } | null) ?? undefined;
  },
};
