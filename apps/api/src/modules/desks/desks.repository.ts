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
};
