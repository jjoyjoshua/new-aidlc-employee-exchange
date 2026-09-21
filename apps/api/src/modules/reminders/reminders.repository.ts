/**
 * US-030's own module — one query, no write. Deliberately separate from `modules/bookings`
 * (D-04): a scheduled, unauthenticated-by-session read across every employee's bookings is not
 * `bookings.router.ts`'s `requireSession`-guarded shape, the same reasoning that keeps
 * `modules/admin` separate from `modules/bookings` for its own cross-employee reads.
 */
import { supabase } from '../../infra/supabase/index.js';
import type { OfficeDate } from '@desk-booking/contracts';

/** One booking eligible for a reminder — desk number and owner email already resolved, so the
 *  service composes without a second query (US-030/D-04's own reasoning, matching US-029's). */
export interface ReminderCandidateRow {
  id: string;
  userId: string;
  email: string;
  deskNumber: string;
  bookingDate: OfficeDate;
}

export interface RemindersRepository {
  /** US-030/AC-01, AC-02, AC-05, AC-06. Confirmed bookings for exactly one date — a cancelled or
   *  completed (past-dated) booking is excluded by the `status = 'confirmed'` predicate itself,
   *  read live at call time, never from a cache taken earlier (AC-06's "reads the status at send
   *  time, not at booking time"). */
  listConfirmedBookingsForDate(date: OfficeDate): Promise<ReminderCandidateRow[]>;
}

export const remindersRepository: RemindersRepository = {
  async listConfirmedBookingsForDate(date) {
    const { data, error } = await supabase()
      .from('bookings')
      .select('id, user_id, booking_date, desks(desk_number), user_profiles!user_id(email)')
      .eq('booking_date', date)
      .eq('status', 'confirmed');

    if (error) throw new Error(`reminder candidates lookup failed: ${error.message}`);

    // A many-to-one embed defaults to an array in supabase-js's types with no generated
    // `Database` schema, but PostgREST embeds it as a single object at runtime
    // (`admin-bookings.repository.ts`'s own precedent for this cast).
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      user_id: string;
      booking_date: OfficeDate;
      desks: { desk_number: string } | null;
      user_profiles: { email: string } | null;
    }>;

    return rows.map((row) => {
      if (!row.desks) throw new Error(`booking ${row.id} has no joined desk — desk_id is NOT NULL, this is a bug`);
      if (!row.user_profiles) {
        throw new Error(`booking ${row.id} has no joined user_profiles — user_id is NOT NULL, this is a bug`);
      }
      return {
        id: row.id,
        userId: row.user_id,
        email: row.user_profiles.email,
        deskNumber: row.desks.desk_number,
        bookingDate: row.booking_date,
      };
    });
  },
};
