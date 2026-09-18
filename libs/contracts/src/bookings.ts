/**
 * US-007's slice of the wire contract — `POST /api/bookings` and `POST /api/bookings/:id/cancel`.
 *
 * `myBooking` on `GET /api/bookings/availability` lives in `availability.ts`, not here — it is
 * one additive field on an existing response (D-02), not a new endpoint.
 */
import { z } from 'zod';
import { officeDateSchema } from './booking-window.js';

/**
 * `POST /api/bookings`'s one legitimate body. `.strict()` — an unknown field is rejected, not
 * ignored (matching every other request schema in this package). No `status`: the caller cannot
 * request anything but a Confirmed booking, so there is nothing to name.
 */
export const bookingCreateSchema = z
  .object({
    date: officeDateSchema,
    deskId: z.string().uuid(),
  })
  .strict();
export type BookingCreateRequest = z.infer<typeof bookingCreateSchema>;

export const bookingStatusSchema = z.enum(['confirmed', 'cancelled']);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

/**
 * `POST /api/bookings`'s `201` body (FR-01, AC-03, AC-04). Not `.strict()` — every response in
 * this package is additive-safe (`auth.ts`'s stated rule).
 */
export const bookingSchema = z.object({
  id: z.string().uuid(),
  deskId: z.string().uuid(),
  deskNumber: z.string().min(1),
  date: officeDateSchema,
  status: bookingStatusSchema,
  /**
   * The address the confirmation *will* go to (AC-04's on-screen copy), read fresh from the
   * caller's own account — not evidence that a mail was actually dispatched. US-028 is the story
   * that sends it; if the two ever disagree, the screen is wrong, not this field (design note
   * §F-9, spec.md's AC-04 constraint).
   */
  confirmationEmail: z.string().email(),
});
export type Booking = z.infer<typeof bookingSchema>;

/** `POST /api/bookings/:id/cancel`'s one route param. */
export const cancelBookingParamsSchema = z.object({ id: z.string().uuid() }).strict();
export type CancelBookingParams = z.infer<typeof cancelBookingParamsSchema>;

/**
 * US-010's slice — `GET /api/bookings`. Architect design note §1, §2 (this story's folder in
 * `inception/specs/`); ADR-007 for the derivation this section's second enum exists to carry.
 */

/**
 * `GET /api/bookings`. `.strict()` — an unknown field is rejected, not ignored, matching every
 * other request schema in this package. There is deliberately no `userId` and no `limit`: the
 * caller is the session's (design note §1.1) and the page size is the server's (§1.3).
 */
export const myBookingsQuerySchema = z.object({ before: officeDateSchema.optional() }).strict();
export type MyBookingsQuery = z.infer<typeof myBookingsQuerySchema>;

/**
 * What an employee READS (REQ-028, BR-001.5, US-010/AC-04). Response-only, and never the shape
 * of anything written — `bookingStatusSchema` above is what the database stores and what
 * `POST /api/bookings` returns, and it stays two-valued. `completed` exists on no table and in
 * no enum: it is `confirmed` plus a date that has passed in the office's timezone, derived per
 * request in `apps/api/src/domain/booking-history.ts` (ADR-007). Kept as a SEPARATE schema
 * rather than widening `bookingStatusSchema`, so a wire enum named `bookingStatus` never admits
 * a value the database's `booking_status` cannot hold (design note §2.2).
 */
export const bookingDisplayStatusSchema = z.enum(['confirmed', 'completed', 'cancelled']);
export type BookingDisplayStatus = z.infer<typeof bookingDisplayStatusSchema>;

/** One row of `GET /api/bookings`'s `items` (US-010/AC-01, AC-03, AC-04, AC-05). */
export const myBookingListItemSchema = z.object({
  id: z.string().uuid(),
  /** Read through the join, so a desk renamed since (BR-001.19, US-018) shows its CURRENT
   *  number — the story's accepted consequence (RISK-012), not a defect. */
  deskNumber: z.string().min(1),
  date: officeDateSchema,
  status: bookingDisplayStatusSchema,
});
export type MyBookingListItem = z.infer<typeof myBookingListItemSchema>;

/**
 * `GET /api/bookings`'s `200` body. Not `.strict()` — every response in this package is
 * additive-safe (`auth.ts`'s stated rule).
 */
export const myBookingsResponseSchema = z.object({
  /**
   * The office's today the server used to derive every `status` in `items` below, echoed so the
   * payload is self-describing (design note §1.4) — the same reason `availabilityResponseSchema`
   * echoes `date`. The browser uses it for exactly one thing: AC-02's TODAY emphasis. It must
   * NOT use `office.today` from the auth context for that (design note §7.2) — this value is
   * always fresh for the request that produced it; the auth context's is not.
   */
  today: officeDateSchema,
  /**
   * ONE flat array, ordered `date` DESC then insertion DESC. Sectioning into Upcoming/Past is
   * the browser's (design note §4.1), exactly as zone grouping was left to the browser in
   * US-006. Wire invariant, guaranteed by the derivation: an item with `status === 'confirmed'`
   * always has `date >= today` (design note §1.4).
   */
  items: z.array(myBookingListItemSchema),
  /**
   * AC-03's "load older" control, and its disappearance. The value to send back as `?before=`,
   * or `null` when the caller has nothing older. ONE field, not `hasMore` + `nextCursor` — two
   * fields answering one question eventually disagree in front of a user (design note §1.4).
   */
  nextBefore: officeDateSchema.nullable().default(null),
});
export type MyBookingsResponse = z.infer<typeof myBookingsResponseSchema>;
