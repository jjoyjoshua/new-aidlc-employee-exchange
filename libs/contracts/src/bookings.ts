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

/**
 * US-013's slice — `GET /api/admin/bookings`. Architect design note §2 (this story's folder in
 * `inception/specs/`). A different resource from `GET /api/bookings` above: cross-employee, behind
 * `requireAdmin`, page-based rather than a date cursor — design note §2.4 gives the criterion that
 * separates the two, not an inconsistency.
 */

/** The arithmetic bound `allBookingsQuerySchema.page` accepts — keeps `(page - 1) * PAGE_SIZE`
 *  inside the safe-integer range for a pathological value. Not a performance guard: a large
 *  offset costs the same as a small one here (design note §2.2, §3.4). */
export const MAX_PAGE = 1_000_000;

/**
 * `GET /api/admin/bookings`. `.strict()`, matching every other request schema in this package.
 * Deliberately no `limit`: the page size is the server's, never a client parameter (design note
 * §2.4) — this is the one route that returns everybody's whereabouts. US-014 adds `from`, `to`,
 * `status` and `deskId` here; this story adds nothing else.
 */
export const allBookingsQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(MAX_PAGE).optional() })
  .strict();
export type AllBookingsQuery = z.infer<typeof allBookingsQuerySchema>;

/** One row of `GET /api/admin/bookings`'s `items` (US-013/AC-03, AC-06). Four fields, and the
 *  absences are deliberate (design note §2.3): no `employeeId`/`employeeEmail` — AC-10's "no
 *  other employee's booking data is returned" is a constraint on this payload, not only on who
 *  may call it; no `deskId` — that is US-014's filter parameter, not this story's. */
export const allBookingsListItemSchema = z.object({
  id: z.string().uuid(),
  date: officeDateSchema,
  /** Read through the `desks` embed, so a desk renamed since (BR-001.19, US-018) shows its
   *  CURRENT number — the same accepted consequence `myBookingListItemSchema` records. */
  deskNumber: z.string().min(1),
  /** AC-03's "the employee who holds it" — `user_profiles.full_name`, read through the
   *  disambiguated embed (design note §3.1). */
  employeeName: z.string().min(1),
  /** DERIVED — `bookingDisplayStatusSchema`, never the stored two-value enum (ADR-007). */
  status: bookingDisplayStatusSchema,
});
export type AllBookingsListItem = z.infer<typeof allBookingsListItemSchema>;

/**
 * `GET /api/admin/bookings`'s `200` body. Not `.strict()` — every response in this package is
 * additive-safe (`auth.ts`'s stated rule).
 */
export const allBookingsResponseSchema = z.object({
  /** The office's today the server used to derive every `status` in `items` (design note §2.3) —
   *  also AC-07's "from {date}", since the default view starts at today. */
  today: officeDateSchema,
  /** AC-07. The count of bookings MATCHING THE VIEW, not the number on this page (design note
   *  §2.5) — stays true after `Show more`. */
  total: z.number().int().nonnegative(),
  /** Ordered `date` ASC, then `created_at` ASC, then `id` ASC — a TOTAL order; the third key is
   *  load-bearing for offset paging's stability (design note §3.2), not belt-and-braces. */
  items: z.array(allBookingsListItemSchema),
  /** AC-04. The value to send back as `?page=`, or `null` when this is the last page. ONE field
   *  answering "is there more" — the shape `nextBefore` established in US-010, one page number
   *  instead of one date. */
  nextPage: z.number().int().min(2).nullable().default(null),
});
export type AllBookingsResponse = z.infer<typeof allBookingsResponseSchema>;
