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
import {
  allBookingsQuerySchema,
  adminUsersQuerySchema,
  cancelBookingParamsSchema,
  deskCreateSchema,
  deskIdParamsSchema,
  deskUpdateSchema,
} from '@desk-booking/contracts';
import { ERROR_CODES, badRequest, conflict, notFound, unauthorized, unprocessable } from '../../http/errors.js';
import type { AdminBookingsService } from '../bookings/admin-bookings.service.js';
import type { DesksService } from '../desks/desks.service.js';
import type { UsersService } from '../users/users.service.js';
import '../../http/request-user.js';

export interface AdminRouterDeps {
  bookings: AdminBookingsService;
  desks: DesksService;
  users: UsersService;
}

/**
 * US-015/design note §4. `req.user` is always present here in practice — this whole router is
 * mounted behind `requireSession` (`http/app.ts`). Refusing rather than asserting (`req.user!`)
 * means reaching this function without a user fails loudly rather than crashing on a misconfigured
 * mount, the same shape `bookings.router.ts`'s own `requireUser` and `require-admin.ts` use.
 *
 * Read ONLY for ATTRIBUTION (`cancelled_by`), never for authorization — `requireAdmin` (the mount)
 * is the sole authority over who reaches this router at all. This is the one place in this file
 * that reads `req.user`, and it does not decide anything by doing so.
 */
function requireActingAdmin(req: { user?: { id: string } }) {
  const user = req.user;
  if (!user) {
    throw unauthorized(ERROR_CODES.no_session, 'Sign in to continue.');
  }
  return user;
}

export function createAdminRouter({ bookings, desks, users }: AdminRouterDeps): Router {
  const router = Router();

  /**
   * US-013/AC-02–AC-10; US-014/AC-01–AC-04. No role check here — the mount already decided who
   * may reach this handler (design note §5); a role check here would be a second, forgettable
   * copy of `requireAdmin`. A repository failure propagates to `next(error)`, never caught into
   * an empty page — that is what keeps AC-08's real-empty-system `total: 0` distinguishable from
   * a load failure (ST-05), the same reasoning `bookings.router.ts`'s `GET /` states.
   *
   * Everybody's WHEREABOUTS, in one body, behind a date filter — sensitive, but see `/users`
   * below for the read that carries everybody's NAME and EMAIL with no filter at all
   * (US-020 design note §3.4/§8.2 item 4).
   */
  router.get('/bookings', async (req, res, next) => {
    try {
      const parsed = allBookingsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const { page, from, to, status, deskId } = parsed.data;
      const result = await bookings.listAllBookings(page ?? 1, {
        ...(from !== undefined && { from }),
        ...(to !== undefined && { to }),
        ...(status !== undefined && { status }),
        ...(deskId !== undefined && { deskId }),
      });

      res.setHeader('Cache-Control', 'private, no-store');
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-020/AC-01, AC-02, AC-04, AC-06, AC-13. `modules/users`'s first route, read-only.
   *
   * This is the most sensitive read in the system — not `/bookings` above (that is filtered to a
   * date window); this one returns every account's name and email, unfiltered, on any request
   * that supplies no `q` at all. `adminUsersQuerySchema` bounds `q` to 100 characters and rejects
   * an unknown field; a parse failure reuses the same `invalid_request` branch `/bookings` uses
   * above — no new error code (design note §3.3).
   *
   * The trust control here is NOT this handler: `adminUsersResponseSchema` is deliberately not
   * `.strict()`, so the only thing stopping a leaked column (`must_change_password`,
   * `deactivated_at`, ...) is `users.repository.ts`'s explicit select list and
   * `users.service.ts`'s explicit field mapping (design note §7). No role check here either — the
   * mount already decided who may reach this handler.
   */
  router.get('/users', async (req, res, next) => {
    try {
      const parsed = adminUsersQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const result = await users.listAccounts(parsed.data.q);

      res.setHeader('Cache-Control', 'private, no-store');
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-014/AC-03, edge case. The desk vocabulary for the admin filter — every desk, active and
   * inactive. US-016/AC-01, AC-04, AC-05 extended this same handler additively with `bookedAhead`
   * (the service now also tallies each desk's upcoming Confirmed bookings) rather than adding a
   * second endpoint — no handler change was needed here, the whole of the extension lives in
   * `DesksService.listAllDesks`.
   *
   * Still no query parameters: US-016/AC-09 confirmed the desk count this release targets
   * (30–100, BR-001.4) does not need search, and this endpoint takes none by requirement now,
   * not merely by omission.
   */
  router.get('/desks', async (_req, res, next) => {
    try {
      const result = await desks.listAllDesks();
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ desks: result });
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-015/AC-02, AC-04, AC-09. `POST`, not `DELETE` — the row survives the transition (AC-04).
   * `cancelBookingParamsSchema` is reused verbatim from `bookings.router.ts` — one route param, a
   * uuid, `.strict()`. `200` with an empty body on success, matching the employee cancel endpoint
   * exactly (design note §2.1, §2.3) — the two cancel endpoints differ in precisely which mount
   * they sit on, and therefore who may call them.
   */
  /**
   * US-017/AC-01, AC-02, AC-04, AC-08. `deskCreateSchema` trims, uppercases and validates the
   * shape at the edge — a raw lower-case or badly-shaped body never reaches `desks.createDesk`
   * (design note §2.4). No pre-check: the service's insert is the sole arbiter of a duplicate,
   * so `outcome.kind === 'duplicate'` is the ONLY branch besides success.
   */
  router.post('/desks', async (req, res, next) => {
    try {
      const parsed = deskCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const outcome = await desks.createDesk(parsed.data.deskNumber);

      if (outcome.kind === 'duplicate') {
        throw conflict(ERROR_CODES.desk_number_taken, 'That desk number is already in use.');
      }

      res.status(201).json(outcome.desk);
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-018/AC-01, AC-02, AC-07, AC-09. Modifies an attribute of an existing resource, which is
   * why this is `PATCH` at the resource's own address rather than a verb sub-resource like
   * `/bookings/:id/cancel` above — that shape is for a refusable TRANSITION (US-019's
   * activate/deactivate will be the next one), not a plain field update
   * (`ai/standards/api-standards.md`, US-018 design note §3.1).
   *
   * `deskUpdateSchema` reuses the SAME `deskNumberSchema` `deskCreateSchema` does — AC-02's "same
   * rules as create" is true because it is the same object. No pre-check precedes the update:
   * `desks_desk_number_key` is the sole arbiter, exactly as the create path states, and that
   * absence is also what makes AC-07's self-rename a non-error (design note §2.3).
   *
   * US-019's activate/deactivate (below) landed as the verb sub-resources this comment predicted.
   */
  router.patch('/desks/:id', async (req, res, next) => {
    try {
      const parsedParams = deskIdParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }
      const parsedBody = deskUpdateSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const outcome = await desks.renameDesk(parsedParams.data.id, parsedBody.data.deskNumber);

      if (outcome.kind === 'duplicate') {
        throw conflict(ERROR_CODES.desk_number_taken, 'That desk number is already in use.');
      }
      if (outcome.kind === 'not_found') {
        throw notFound(ERROR_CODES.desk_not_found, 'That desk could not be found.');
      }

      res.status(200).json(outcome.desk);
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-019/AC-01, AC-04, AC-05, AC-07, AC-08, AC-12. A refusable state TRANSITION, hence the verb
   * sub-resource — `ai/standards/api-standards.md`, which names this exact endpoint as its own
   * example. `deskIdParamsSchema` is reused verbatim; there is no body — the verb is in the
   * address, and a body would be a second place for the same fact (design note §3.2).
   *
   * `outcome.kind === 'blocked'` is BR-001.9's hard block: `422 desk_has_upcoming_bookings`
   * carrying the count in `details` (ADR-009), never in the message string (design note §4). No
   * role check here — the mount already decided who may reach this handler (§3.6).
   */
  router.post('/desks/:id/deactivate', async (req, res, next) => {
    try {
      const parsed = deskIdParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const outcome = await desks.deactivateDesk(parsed.data.id);

      if (outcome.kind === 'blocked') {
        throw unprocessable(
          ERROR_CODES.desk_has_upcoming_bookings,
          'That desk has upcoming bookings, so it cannot be deactivated.',
          { upcomingBookings: outcome.upcomingBookings },
        );
      }
      if (outcome.kind === 'not_found') {
        throw notFound(ERROR_CODES.desk_not_found, 'That desk could not be found.');
      }

      res.status(200).json(outcome.desk);
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-019/AC-01, AC-09, AC-12. No rule to satisfy — SCR-006's structural decision that activating
   * harms nobody and needs no confirmation. Same shape as deactivate otherwise: a verb sub-resource,
   * `deskIdParamsSchema` reused, no body.
   */
  router.post('/desks/:id/activate', async (req, res, next) => {
    try {
      const parsed = deskIdParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const outcome = await desks.activateDesk(parsed.data.id);

      if (outcome.kind === 'not_found') {
        throw notFound(ERROR_CODES.desk_not_found, 'That desk could not be found.');
      }

      res.status(200).json(outcome.desk);
    } catch (error) {
      next(error);
    }
  });

  router.post('/bookings/:id/cancel', async (req, res, next) => {
    try {
      const parsed = cancelBookingParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const admin = requireActingAdmin(req);
      const outcome = await bookings.cancelAnyBooking(admin.id, parsed.data.id);

      if (outcome.kind === 'already_cancelled') {
        // AC-09, ST-10's non-retryable branch. The browser renders its OWN copy keyed on the
        // `code`; this message is for logs and non-browser consumers.
        throw conflict(ERROR_CODES.booking_already_cancelled, 'That booking has already been cancelled.');
      }
      if (outcome.kind === 'not_found') {
        // Covers "no such booking" AND a real, past-dated booking (AC-02) — deliberately
        // undiscriminated, matching the employee cancel endpoint (decisions.md D-07).
        throw notFound(ERROR_CODES.booking_not_found, 'That booking could not be found.');
      }

      res.status(200).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
