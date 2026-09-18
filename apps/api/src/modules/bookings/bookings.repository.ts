/**
 * Two reads for the availability screen (REQ-007), and no rule (`bookings.service.ts` holds the
 * projection). ADR-004 — this module may `SELECT` from `desks`, a table it does not own, with an
 * explicit column list; only `modules/desks` (US-015/US-017) may write it.
 *
 * Rows come back in the database's snake_case; the mapping to the wire's camelCase happens in
 * the service, matching the convention `auth.repository.ts` set on the first module.
 */
import { supabase } from '../../infra/supabase/index.js';
import type { OfficeDate } from '@desk-booking/contracts';

/** The `desks` columns this module reads. Never `select('*')` — a wider select is how an
 *  occupant column or a write-side field would leak into a read this module does not own. */
export interface DeskRow {
  id: string;
  desk_number: string;
}

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
};
