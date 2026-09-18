/**
 * US-006's slice of the wire contract — `GET /api/bookings/availability?date=`.
 *
 * What this deliberately does NOT carry is as much of the contract as what it does: no derived
 * counts, no server-side zone grouping, and no occupant identity of any kind (design note §2.4,
 * §2.5). See `bookings.service.ts` for the projection that builds this response, and
 * `apps/ui/src/screens/book-a-desk/zones.ts` for the grouping the browser applies on top of it.
 */
import { z } from 'zod';
import { officeDateSchema } from './booking-window.js';

/** The one query this endpoint accepts. `.strict()` — unknown fields are rejected, not ignored
 *  (`app-architecture.md` §5.2), matching every other request schema in this package. */
export const availabilityQuerySchema = z.object({ date: officeDateSchema }).strict();
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

/** AC-02's vocabulary, which is also the screen's: icon AND word, never colour alone (NFR-008).
 *  A closed two-value enum makes it explicit in the contract that there is no third value in
 *  which a person's name could ever appear (AC-06). */
export const deskAvailabilityStatusSchema = z.enum(['available', 'taken']);
export type DeskAvailabilityStatus = z.infer<typeof deskAvailabilityStatusSchema>;

export const deskAvailabilitySchema = z.object({
  /** US-007 posts this. Carried now so a later story does not have to change a response shape
   *  (the reasoning US-001/D-08 applied to `mustChangePassword`). */
  id: z.string().uuid(),
  /**
   * `A-01` (BR-001.4). Deliberately `z.string()` and NOT the format regex: strictness belongs on
   * requests, and a response schema that pinned the format would take the whole screen to
   * `unavailable` over one unexpected row. The `desks_desk_number_format` CHECK constraint is
   * where the format is guaranteed; this is where it is merely carried.
   */
  deskNumber: z.string().min(1),
  status: deskAvailabilityStatusSchema,
});
export type DeskAvailability = z.infer<typeof deskAvailabilitySchema>;

/** Responses are **not** `.strict()`, per `auth.ts`'s stated rule for every endpoint in this
 *  package — an additive field must not break a tab loaded before the deploy. */
export const availabilityResponseSchema = z.object({
  /** Echoed so the payload is self-describing (design note §2.4) — not a staleness guard, which
   *  `use-availability.ts`'s request-id counter already owns. */
  date: officeDateSchema,
  /**
   * Every **active** desk, taken and free alike (AC-03), ordered by `deskNumber` ascending. An
   * inactive desk is absent entirely — not as taken, not as free (AC-04, BR-001.7). An EMPTY
   * array means the office has no active desks at all (AC-09), which is a different fact from
   * every desk being taken (design note §2.6) — the UI checks `desks.length === 0` before any
   * fully-booked branch, never the reverse.
   */
  desks: z.array(deskAvailabilitySchema),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
