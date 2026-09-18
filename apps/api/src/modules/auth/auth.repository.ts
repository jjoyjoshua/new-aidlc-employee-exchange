/**
 * Reads and writes `user_profiles` for the auth module.
 *
 * Rows come back in the database's snake_case; the mapping to the wire's camelCase happens in
 * the service's response builder, not here and not in the route. This is the first module, so
 * it sets that convention.
 */
import { supabase } from '../../infra/supabase/index.js';
import type { UserRole } from '@desk-booking/contracts';

/** The `user_profiles` columns US-001 reads. Not the whole table — later stories widen it. */
export interface UserProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  /** NFR-009. ISO string as PostgREST returns it; US-003 parses it to a number at the
   *  service edge (`auth.service.ts`) so the middleware never compares strings. */
  last_seen_at: string;
}

const COLUMNS = 'id, email, full_name, role, is_active, must_change_password, last_seen_at';

export interface ProfileRepository {
  findById(id: string): Promise<UserProfileRow | undefined>;
  /**
   * NFR-009. `at` is supplied by the caller, not read here: the value compared (by
   * `require-session.ts` step 4) and the value written must come from the same clock reading,
   * or a session could be judged against one instant and stamped with another (US-003 design
   * note §2.4) — the same reasoning `attemptSignIn`'s single `nowMs()` reading already applies
   * to itself.
   */
  stampLastSeen(id: string, at: Date): Promise<void>;
}

export const profileRepository: ProfileRepository = {
  async findById(id) {
    const { data, error } = await supabase()
      .from('user_profiles')
      .select(COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`user_profiles lookup failed: ${error.message}`);
    return (data as UserProfileRow | null) ?? undefined;
  },

  /**
   * NFR-009 measures 30 days from last *use*. US-003 owns both the comparison and this write —
   * US-001 stamped it only at sign-in. `at` is the caller's clock reading, never this module's
   * own — see the interface docblock.
   */
  async stampLastSeen(id, at) {
    const { error } = await supabase()
      .from('user_profiles')
      .update({ last_seen_at: at.toISOString() })
      .eq('id', id);

    if (error) throw new Error(`last_seen_at stamp failed: ${error.message}`);
  },
};
