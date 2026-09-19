/**
 * `/api/admin` — US-013 is the first story to add a route here.
 *
 * `requireAdmin` mounts on the mount point, never per route (`app.ts`), and that property
 * survives this file no longer being empty: the guard still runs before Express even tries to
 * match `GET /bookings` against this router, so
 *
 *   - Employee token -> 403 admin_only from the guard, before this router is reached at all
 *   - Admin token, unknown path -> 404 route_not_found (the guard passed; this router genuinely
 *     has nothing at that path)
 *   - No token       -> 401 no_session
 *
 * is exactly as true today as when this router was empty (US-001/AC-03's own tests request
 * `/api/admin/anything`, a path this story does not add, and are unaffected). Every future admin
 * route inherits the same guard the same way — this file is now the worked example rather than
 * the placeholder.
 */
import { Router } from 'express';
import { allBookingsQuerySchema } from '@desk-booking/contracts';
import { ERROR_CODES, badRequest } from '../../http/errors.js';
import type { AdminBookingsService } from '../bookings/admin-bookings.service.js';

export interface AdminRouterDeps {
  bookings: AdminBookingsService;
}

export function createAdminRouter({ bookings }: AdminRouterDeps): Router {
  const router = Router();

  /**
   * US-013/AC-02–AC-10. No `requireUser`/role check here — the mount already decided who may
   * reach this handler (design note §5); reading `req.user` again would be a second, forgettable
   * copy of `requireAdmin`. A repository failure propagates to `next(error)`, never caught into
   * an empty page — that is what keeps AC-08's real-empty-system `total: 0` distinguishable from
   * a load failure (ST-05), the same reasoning `bookings.router.ts`'s `GET /` states.
   */
  router.get('/bookings', async (req, res, next) => {
    try {
      const parsed = allBookingsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const result = await bookings.listAllBookings(parsed.data.page ?? 1);

      // This is the most sensitive read in the system — everybody's whereabouts, in one body.
      res.setHeader('Cache-Control', 'private, no-store');
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
