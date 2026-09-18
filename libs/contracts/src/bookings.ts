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
