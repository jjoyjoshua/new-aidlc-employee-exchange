/**
 * `/api/bookings` — US-006's first route. Validates the query, delegates to the service, shapes
 * the response. The rule it must not break is AC-06: nothing about the occupant of a taken desk
 * ever appears in the body — that is structural in `bookings.repository.ts`, not this file's job
 * to enforce, but this handler must not undo it by adding anything to the response the service
 * did not already build.
 */
import { Router } from 'express';
import { availabilityQuerySchema, type DateRefusal } from '@desk-booking/contracts';
import { ERROR_CODES, badRequest, unprocessable } from '../../http/errors.js';
import type { BookingsService } from './bookings.service.js';

export interface BookingsRouterDeps {
  service: BookingsService;
}

/**
 * AC-04/AC-08 note: the date controls (US-005) make a weekend or out-of-window date unreachable
 * by mouse, so this refusal is currently a server-side defence with no live UI path, not a state
 * a screen renders (design note §2.7). One message per reason is still correct API design.
 */
const REFUSAL_MESSAGE: Record<DateRefusal, string> = {
  past: 'That date has already passed.',
  'too-far-ahead': "That date is beyond the office's 30-day booking window.",
  closed: 'The office is closed on weekends.',
};

export function createBookingsRouter({ service }: BookingsRouterDeps): Router {
  const router = Router();

  router.get('/availability', async (req, res, next) => {
    try {
      const parsed = availabilityQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        // Generic, matching auth.router.ts's convention: no issue list echoed back.
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const outcome = await service.getAvailability(parsed.data.date);

      if (outcome.kind === 'refused') {
        throw unprocessable(ERROR_CODES.date_not_bookable, REFUSAL_MESSAGE[outcome.reason]);
      }

      res.json(outcome.data);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
