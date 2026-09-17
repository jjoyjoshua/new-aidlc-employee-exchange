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
}

const COLUMNS = 'id, email, full_name, role, is_active, must_change_password';

export interface ProfileRepository {
  findById(id: string): Promise<UserProfileRow | undefined>;
  stampLastSeen(id: string): Promise<void>;
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
   * NFR-009 measures 30 days from last *use*. US-001 only stamps it; the comparison and the
   * hourly throttle are US-003's, which wants the lifetime as a configuration value it can
   * shorten in a test.
   */
  async stampLastSeen(id) {
    const { error } = await supabase()
      .from('user_profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(`last_seen_at stamp failed: ${error.message}`);
  },
};
