/**
 * `/api/internal/reminders` — US-030's only route. No request body, no `libs/contracts` schema
 * to validate: the run takes nothing beyond the secret header `requireReminderSecret` (mounted
 * in `http/app.ts`, never here) already checked.
 */
import { Router } from 'express';
import type { RemindersService } from './reminders.service.js';

export interface RemindersRouterDeps {
  service: RemindersService;
}

export function createRemindersRouter({ service }: RemindersRouterDeps): Router {
  const router = Router();

  /**
   * US-030/AC-01. A genuine failure to even LIST candidate bookings propagates to `next(error)`
   * — a `500`, not swallowed — because that is an outage worth alerting on. Only a PER-BOOKING
   * send failure is caught, inside `runReminders` itself (AC-10).
   */
  router.post('/run', async (_req, res, next) => {
    try {
      const result = await service.runReminders();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
