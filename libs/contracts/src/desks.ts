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
});
export type AdminDesk = z.infer<typeof adminDeskSchema>;

/**
 * `GET /api/admin/desks`'s `200` body. An OBJECT, not a bare array, so a later story (US-016) can
 * add a field to `adminDeskSchema` additively without changing the body's own type (ADR-002's
 * asymmetry; design note §3.3). Not `.strict()` — every response in this package is additive-safe
 * (`auth.ts`'s stated rule).
 */
export const adminDesksResponseSchema = z.object({
  /** Ordered `desk_number` ASC — `desks_desk_number_key` already serves the ORDER BY, so no new
   *  index is needed. */
  desks: z.array(adminDeskSchema),
});
export type AdminDesksResponse = z.infer<typeof adminDesksResponseSchema>;
