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

/**
 * US-007/FR-05, AC-06. The caller's OWN Confirmed booking for the requested date, or `null`.
 * Deliberately no `userId` — it is always the caller's, and carrying one would be an invitation
 * to generalise this into "whose booking" later (design note §2.1). Filtered server-side on
 * `req.user.id`, never a query param — `availabilityQuerySchema` stays `.strict()` with no
 * `userId` field, so a client-supplied one is a `400` at the route edge, before it could reach
 * the service (design note §2.2).
 */
export const myBookingSchema = z.object({
  id: z.string().uuid(),
  deskId: z.string().uuid(),
  deskNumber: z.string().min(1),
});
export type MyBooking = z.infer<typeof myBookingSchema>;

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
  /**
   * US-007/FR-05. `.nullable()`, not `.optional()`: a server that has evaluated the question
   * always answers it, so a response missing the key entirely is a bug rather than "no
   * booking" — an `undefined` here would be indistinguishable from an old server that predates
   * this field, which `.optional()` would quietly permit (US-007/AC-06). Defaulted to `null` so
   * an old fixture with no `myBooking` key at all still parses (additive, ADR-002's asymmetry).
   */
  myBooking: myBookingSchema.nullable().default(null),
  /**
   * US-008/REQ-034. The caller's most recently booked desk, **already filtered to eligibility**:
   * present only when that desk is in `desks` above AND its `status` is `available` (AC-05's three
   * causes, one outcome). `null` when the caller has never booked (AC-04), or when the desk is
   * taken, inactive, or otherwise absent. The browser renders the label on the row whose `id`
   * matches and does not re-derive eligibility — there is nothing here to re-check.
   *
   * Derived from the single most recent booking, not from frequency — "usual" implies a count and
   * the derivation has none.
   *
   * `.nullable().default(null)` for the same reason `myBooking` has it: a server that evaluated the
   * question always answers it, and an old fixture with no key at all still parses.
   */
  usualDeskId: z.string().uuid().nullable().default(null),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
