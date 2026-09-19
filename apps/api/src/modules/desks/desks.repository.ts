/**
 * The desk INVENTORY read (US-014, REQ-031). A read-only repository over `desks` — US-014 design
 * note §3.2, §3.3 (`inception/specs/US-014-filter-all-bookings/`), placed here rather than inside
 * `modules/bookings` per ADR-004's own precedent (US-013 §4.1: "put the read where the write will
 * have to live") — desk WRITES will land here once US-015/US-017 build them.
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
}

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
};
