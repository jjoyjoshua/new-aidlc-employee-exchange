import type { AuthenticatedUser } from '@desk-booking/contracts';

/**
 * Where a signed-in user belongs. The mark outranks the role: REQ-029 is "before any other
 * application function is reachable", and SCR-010 has no shell around it.
 *
 * US-004/AC-01 (sign-in lands here instead of the usual destination), AC-03 (someone without
 * the mark is sent away from SCR-010) and AC-07 (the destination after a successful change) are
 * the same question asked three times, and a pure function is the only way they cannot answer it
 * differently (design note §7.1).
 */
export function landingPathFor(user: AuthenticatedUser): string {
  if (user.mustChangePassword) return '/set-password';
  return user.role === 'admin' ? '/admin/bookings' : '/bookings';
}
