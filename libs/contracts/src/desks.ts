/**
 * US-014's slice — `GET /api/admin/desks`. Architect design note §3
 * (`inception/specs/US-014-filter-all-bookings/design-note.md`); ADR-004 for why this read lives
 * in its own module rather than inside `modules/bookings`.
 */
import { z } from 'zod';

/** One desk in the administrator's desk vocabulary (US-014/AC-03, story Edge cases). Every desk,
 *  ACTIVE AND INACTIVE — an inactive desk's historic bookings must stay findable. Deliberately NOT
 *  `deskAvailabilitySchema` (`availability.ts`): that shape's `status` is a per-date occupancy
 *  fact, and an inactive desk is absent from it entirely — the opposite of what this filter needs
 *  (design note §0). */
export const adminDeskSchema = z.object({
  id: z.string().uuid(),
  /** `A-01` (BR-001.4). `z.string().min(1)`, not the format regex — strictness belongs on
   *  requests, exactly as `deskAvailabilitySchema.deskNumber` records. */
  deskNumber: z.string().min(1),
  /** `desks.is_active` (REQ-017, BR-001.7), carried so the filter can mark an inactive desk in
   *  its own list rather than hiding it. */
  isActive: z.boolean(),
  /**
   * US-016/AC-04, AC-05 (BR-001.9). How many CONFIRMED bookings this desk holds dated the
   * office's today or later — the exact quantity US-019's hard block tests, which is why
   * SCR-006 shows it: the block becomes predictable instead of discovered.
   *
   * "Today" is the OFFICE's today, resolved server-side from one clock reading per request
   * (NFR-001) — never the browser's. A count computed against a device date would disagree
   * with the block that refuses the deactivation.
   *
   * REQUIRED, and 0 rather than absent. AC-05's whole content is that none must not look like
   * missing data; an optional field makes "no upcoming bookings" and "this server did not tell
   * you" the same value on the wire, and no amount of rendering recovers that. The em dash
   * SCR-006 draws is a RENDERING of 0 (US-016 design note §7.2), not a second wire value.
   *
   * Cancelled bookings, Completed ones and past Confirmed ones are all excluded — see
   * `domain/booking-history.ts`'s `displayStatusPredicate`, which is where the predicate lives
   * and the only place it may be written (US-016 design note §2.4).
   */
  bookedAhead: z.number().int().nonnegative(),
});
export type AdminDesk = z.infer<typeof adminDeskSchema>;

/**
 * `GET /api/admin/desks`'s `200` body. An OBJECT, not a bare array — US-016 added `bookedAhead`
 * to `adminDeskSchema` additively, exactly as this shape was built to allow (ADR-002's
 * asymmetry; US-016 design note §3.1), without changing this envelope's own type. Not
 * `.strict()` — every response in this package is additive-safe (`auth.ts`'s stated rule).
 */
export const adminDesksResponseSchema = z.object({
  /** Ordered `desk_number` ASC — `desks_desk_number_key` already serves the ORDER BY, so no new
   *  index is needed. */
  desks: z.array(adminDeskSchema),
});
export type AdminDesksResponse = z.infer<typeof adminDesksResponseSchema>;
