/**
 * The desk inventory read AND write (US-014, US-016, US-017, US-018; REQ-031, REQ-015, REQ-016).
 * Placed here rather than inside `modules/bookings` per ADR-004's own precedent (US-013 §4.1:
 * "put the read where the write will have to live") — desk writes landed with US-017 (add a
 * desk) and US-018 (rename); US-019 (activate/deactivate) is this module's remaining write path.
 *
 * Deliberately NOT `modules/bookings`'s `listActiveDesks` (`bookings.repository.ts`): that method
 * filters `is_active = true` for US-006/AC-04's availability grid, an invariant that method must
 * keep. This repository's whole point is the OPPOSITE — every desk, active and inactive, so an
 * inactive desk's historic bookings stay findable in the admin filter.
 */
import { supabase } from '../../infra/supabase/index.js';
import type { BookingStatus, OfficeDate } from '@desk-booking/contracts';

/** One row this module reads back from `desks`. */
export interface DeskRow {
  id: string;
  desk_number: string;
  is_active: boolean;
}

export interface DesksRepository {
  /** US-014/AC-03, edge case. No `.eq('is_active', …)` — the absence is the requirement.
   *  Ordered `desk_number` ASC; `desks_desk_number_key` already serves the ORDER BY. */
  listAllDesks(): Promise<DeskRow[]>;
  /** US-016/AC-04, AC-05 (BR-001.9). The desk id of every booking matching `status` dated `from`
   *  or later — one row per booking, NOT a count: the tally is the service's (`desks.service.ts`),
   *  and this repository holds no rule.
   *
   *  Reads `bookings`, a table `modules/desks` does NOT own (ADR-004: read across, write within).
   *  The select list is `desk_id` ONLY — no `user_id`, no `*` — exactly as `modules/bookings`'s
   *  own `listConfirmedDeskIds` states for this table: the occupant is never read, not merely
   *  never sent, so there is no column here to forget to strip in a refactor.
   *
   *  `status` and `from` arrive from the service's `displayStatusPredicate('confirmed', today)`
   *  reading — neither is written literally here, which is the whole of why this count and
   *  US-019's deactivation block cannot drift apart (US-016 design note §2.4).
   *
   *  Bounded by requirement, not by hope: REQ-006 caps a bookable date at today + 30 and
   *  `bookings_one_confirmed_per_desk_per_day` allows one confirmed row per desk per day, so this
   *  returns at most `desks x 31` uuids — about 3,100 at BR-001.4's 100-desk ceiling. Served by
   *  `bookings_booking_date_status_idx`. */
  listUpcomingConfirmedDeskIds(status: BookingStatus, from: OfficeDate): Promise<string[]>;
  /**
   * US-017/AC-01, AC-04, AC-05 (REQ-015, BR-001.4, BR-001.8, V-08, V-16). Inserts one desk and
   * returns the created row, or reports the duplicate. `deskNumber` arrives ALREADY normalised
   * (`normalizeDeskNumber`, applied by `deskCreateSchema` at the route edge) — this method does
   * not normalise and must not, or the rule would have two homes.
   *
   * `is_active` is NOT named: `0002_desks.sql`'s `is_active boolean not null default true`
   * defaults it to `true`, which IS US-017/AC-01's "created Active". Naming it here would be a
   * second statement of the same default. `created_at`/`updated_at` likewise default — this
   * schema has one trigger (`db-design.md` §3) and it is not on this table.
   *
   * NO availability/existence pre-check precedes this. `desks_desk_number_key` is the sole
   * arbiter, exactly as the two partial unique indexes are for `insertConfirmedBooking`
   * (`bookings.repository.ts`, US-007/D-04): a `SELECT … WHERE desk_number = ?` followed by an
   * `INSERT` is a read-then-write window two concurrent admins can both pass.
   *
   * Only a `23505` naming the ONE known index becomes an outcome; everything else throws, the
   * mapping contract `insertConfirmedBooking` states for the same class of failure. A `23514`
   * (the format CHECK) is deliberately NOT mapped: reaching it means the normaliser or the schema
   * failed, which must surface as a 500 rather than be reported to an administrator as a
   * duplicate. */
  insertDesk(deskNumber: string): Promise<InsertDeskOutcome>;
  /**
   * US-018/AC-01, AC-02, AC-03, AC-07 (REQ-016, BR-001.4, BR-001.8, BR-001.19, V-08, V-16).
   * Renames one desk and returns the updated row, reports the duplicate, or reports that no row
   * matched. `deskNumber` arrives ALREADY normalised (`deskUpdateSchema` at the route edge) —
   * this method does not normalise and must not, or the rule would have two homes.
   *
   * The `WHERE` names `id`, NEVER `desk_number`. That is not a style preference: it is AC-01's
   * "the desk keeps its identity and its booking history", and AC-06's "a booking references the
   * desk, not the string". A rename keyed on the old string would be a different operation.
   *
   * `updated_at` IS named, and it is the only column besides `desk_number` that this write sets.
   * `0002_desks.sql`'s `updated_at` is application-maintained ("this schema has exactly one
   * trigger… and it is not this") and its comment names REQ-016 — "when the desk was last
   * renamed". This method is that column's first and only writer. The timestamp comes from the
   * SERVICE's single `nowMs()` reading, never from `now()` in SQL and never from a second clock
   * read (US-018 design note §2.2).
   *
   * NO existence or uniqueness pre-check precedes this. `desks_desk_number_key` is the sole
   * arbiter, exactly as `insertDesk` states for the same class of failure. A
   * `SELECT … WHERE desk_number = ? AND id <> ?` followed by an `UPDATE` is a read-then-write
   * window two concurrent admins can both pass, AND it is the implementation that would break
   * AC-07's "renaming to the current number is not an error" — a self-collision `SELECT` finds
   * the row itself (US-018 design note §2.3).
   *
   * Only a `23505` naming the ONE known index becomes an outcome; everything else throws. A
   * `23514` (the format CHECK) is deliberately NOT mapped, for the same reason `insertDesk`
   * leaves it unmapped: reaching it means the normaliser or the schema failed, and it must
   * surface as a 500 rather than as a false "already taken". */
  updateDeskNumber(id: string, deskNumber: string, updatedAt: Date): Promise<UpdateDeskOutcome>;
}

export type InsertDeskOutcome = { kind: 'ok'; desk: DeskRow } | { kind: 'duplicate' };
export type UpdateDeskOutcome =
  | { kind: 'ok'; desk: DeskRow }
  | { kind: 'duplicate' }
  /** US-018 design note §3.5. Zero rows matched `id`. Desks are never deleted, so this is not
   *  reachable from the screen — but a write that applied to nothing must answer something, and
   *  a 500 for a well-formed request naming a missing resource is the wrong shape. */
  | { kind: 'not_found' };

export const desksRepository: DesksRepository = {
  async listAllDesks() {
    const { data, error } = await supabase()
      .from('desks')
      .select('id, desk_number, is_active')
      .order('desk_number');

    if (error) throw new Error(`desks lookup failed: ${error.message}`);
    return (data ?? []) as DeskRow[];
  },

  async listUpcomingConfirmedDeskIds(status, from) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('desk_id')
      .eq('status', status)
      .gte('booking_date', from);

    if (error) throw new Error(`bookings lookup failed: ${error.message}`);
    return ((data ?? []) as Array<{ desk_id: string }>).map((row) => row.desk_id);
  },

  async insertDesk(deskNumber) {
    const { data, error } = await supabase()
      .from('desks')
      .insert({ desk_number: deskNumber })
      .select('id, desk_number, is_active')
      .single();

    if (!error) return { kind: 'ok', desk: data as DeskRow };
    if (error.code !== '23505') throw new Error(`desk insert failed: ${error.message}`);
    if (error.message.includes('desks_desk_number_key')) return { kind: 'duplicate' };
    throw new Error(`unrecognised unique violation: ${error.message}`);
  },

  async updateDeskNumber(id, deskNumber, updatedAt) {
    const { data, error } = await supabase()
      .from('desks')
      .update({ desk_number: deskNumber, updated_at: updatedAt.toISOString() })
      .eq('id', id)
      .select('id, desk_number, is_active')
      .maybeSingle();

    if (!error) return data ? { kind: 'ok', desk: data as DeskRow } : { kind: 'not_found' };
    if (error.code !== '23505') throw new Error(`desk update failed: ${error.message}`);
    if (error.message.includes('desks_desk_number_key')) return { kind: 'duplicate' };
    throw new Error(`unrecognised unique violation: ${error.message}`);
  },
};
