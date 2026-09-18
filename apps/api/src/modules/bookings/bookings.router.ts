/**
 * `/api/bookings` — US-006's first route, plus US-007's write side: `POST /`,
 * `POST /:id/cancel`, and `GET /availability` now threading `req.user.id` so its response can
 * carry `myBooking`.
 *
 * The rule this file must not break is still AC-06: nothing about the occupant of a TAKEN desk
 * ever appears in the body — that stays structural in `bookings.repository.ts`, not this file's
 * job to enforce. US-007 loosens that guarantee by exactly one field, `myBooking`, which is
 * always the caller's own (design note §2.2) — this handler's only obligation toward that is to
 * thread `req.user.id`, never anything from the query string.
 */
import { Router } from 'express';
import {
  availabilityQuerySchema,
  bookingCreateSchema,
  cancelBookingParamsSchema,
  type DateRefusal,
} from '@desk-booking/contracts';
import { ERROR_CODES, badRequest, conflict, notFound, unauthorized, unprocessable } from '../../http/errors.js';
import type { BookingsService } from './bookings.service.js';
import '../../http/request-user.js';

export interface BookingsRouterDeps {
  service: BookingsService;
}

/**
 * AC-04/AC-08 note: the date controls (US-005) make a weekend or out-of-window date unreachable
 * by mouse, so this refusal is currently a server-side defence with no live UI path, not a state
 * a screen renders (design note §2.7). One message per reason is still correct API design.
 * Shared by `GET /availability` and `POST /` (US-007/AC-11) — one rule, one set of sentences.
 */
const REFUSAL_MESSAGE: Record<DateRefusal, string> = {
  past: 'That date has already passed.',
  'too-far-ahead': "That date is beyond the office's 30-day booking window.",
  closed: 'The office is closed on weekends.',
};

/**
 * `req.user` is always present here in practice — `http/app.ts` mounts this whole router behind
 * `requireSession`. Refusing rather than asserting (`req.user!`) is the design note's own
 * finding (F-10): reaching this function without a user means the guard was mounted wrong, and
 * that must fail loudly, the same shape `require-admin.ts:22-29` already uses.
 */
function requireUser(req: { user?: { id: string; email: string } }) {
  const user = req.user;
  if (!user) {
    throw unauthorized(ERROR_CODES.no_session, 'Sign in to continue.');
  }
  return user;
}

export function createBookingsRouter({ service }: BookingsRouterDeps): Router {
  const router = Router();

  router.get('/availability', async (req, res, next) => {
    try {
      const parsed = availabilityQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        // Generic, matching auth.router.ts's convention: no issue list echoed back.
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const user = requireUser(req);
      const outcome = await service.getAvailability(parsed.data.date, user.id);

      if (outcome.kind === 'refused') {
        throw unprocessable(ERROR_CODES.date_not_bookable, REFUSAL_MESSAGE[outcome.reason]);
      }

      // US-007, design note §2.3 (finding F-4). This body used to be byte-identical for every
      // employee; it now carries `myBooking`, the caller's own booking. A 200 with no freshness
      // directive is heuristically cacheable by a shared intermediary, and a session cookie does
      // not prevent that the way an Authorization header historically did — set this explicitly
      // rather than let it default.
      res.setHeader('Cache-Control', 'private, no-store');
      res.json(outcome.data);
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-007/FR-01–FR-04. Validates, delegates to `createBooking` (which runs the date guard, the
   * desk guard, then the no-precheck insert — D-04), and maps its outcome to a status code.
   * `confirmationEmail` is `req.user.email`, already loaded by `requireSession` — no second read,
   * no call into `modules/notifications` (spec.md's AC-04 constraint).
   */
  router.post('/', async (req, res, next) => {
    try {
      const parsed = bookingCreateSchema.safeParse(req.body);

      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const user = requireUser(req);
      const outcome = await service.createBooking(user.id, parsed.data);

      if (outcome.kind === 'date_refused') {
        throw unprocessable(ERROR_CODES.date_not_bookable, REFUSAL_MESSAGE[outcome.reason]);
      }
      if (outcome.kind === 'desk_not_found') {
        throw notFound(ERROR_CODES.desk_not_found, 'That desk does not exist.');
      }
      if (outcome.kind === 'desk_inactive') {
        throw unprocessable(ERROR_CODES.desk_inactive, 'That desk is no longer active.');
      }
      if (outcome.kind === 'desk_conflict') {
        // US-007/AC-08 — the desk-per-day index fired. Someone else's confirm won the race.
        throw conflict(ERROR_CODES.desk_already_booked, 'Someone else just booked that desk.');
      }
      if (outcome.kind === 'user_conflict') {
        // US-007/AC-05 — the user-per-day index fired. The caller already holds a Confirmed
        // booking for that date, made elsewhere between page load and this request.
        throw conflict(ERROR_CODES.already_booked_that_date, 'You already have a booking for that date.');
      }

      res.status(201).json({ ...outcome.booking, confirmationEmail: user.email });
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-007/FR-06, AC-07, D-03. One `200` with an empty body on success — `api-client.ts`'s
   * `requestNoContent` is the browser's matching half, the same seam `POST /sign-out` (US-002)
   * already uses for a success that has nothing to say. `404 booking_not_found` covers "no such
   * booking", "not the caller's" and "not currently confirmed" alike, deliberately
   * undiscriminated (D-03, design note §3.3).
   */
  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const parsed = cancelBookingParamsSchema.safeParse(req.params);

      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const user = requireUser(req);
      const outcome = await service.cancelBooking(user.id, parsed.data.id);

      if (outcome.kind === 'not_found') {
        throw notFound(ERROR_CODES.booking_not_found, 'That booking could not be found.');
      }

      res.status(200).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
