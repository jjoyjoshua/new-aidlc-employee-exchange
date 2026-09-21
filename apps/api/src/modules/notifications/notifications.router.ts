/**
 * `/api/notifications` — the `notifications` module's first router (US-031). Mounted behind
 * `requireSession` at the mount point in `http/app.ts`, the same shape as `/api/bookings` —
 * never a per-route guard, which is forgettable (design note §4.1).
 *
 * Having a router does not break "called, never consulted" (`app-architecture.md` §2,
 * `modules/README.md`): that rule is about module-to-module IMPORTS, and every module is
 * granted "its routes, its request/response shapes, and the service that does the work"
 * (`app-architecture.md` §2).
 *
 * No route here takes an account id in the path or body (US-031/AC-10) — the account is always
 * `req.user.id`, the same discipline `bookings.router.ts` and `/api/auth/set-password` use.
 */
import { Router } from 'express';
import { pushOptInRequestSchema } from '@desk-booking/contracts';
import { ERROR_CODES, badRequest, unauthorized } from '../../http/errors.js';
import type { NotificationsService } from './notifications.service.js';
import '../../http/request-user.js';

export interface NotificationsRouterDeps {
  service: Pick<NotificationsService, 'getPushSettings' | 'optIntoPush' | 'optOutOfPush'>;
}

/** Same shape as `bookings.router.ts`'s own `requireUser` (design note F-10 there): reaching a
 *  handler with no `req.user` means the guard was mounted wrong, and that fails loudly rather
 *  than by non-null assertion. */
function requireUser(req: { user?: { id: string; email: string } }) {
  const user = req.user;
  if (!user) {
    throw unauthorized(ERROR_CODES.no_session, 'Sign in to continue.');
  }
  return user;
}

/** `User-Agent` is operator diagnosis only (`db-design.md:177`), truncated here rather than at
 *  the contract layer since it is a header, not a body field, and never validated as input. */
const USER_AGENT_MAX = 300;

export function createNotificationsRouter({ service }: NotificationsRouterDeps): Router {
  const router = Router();

  /**
   * US-031/FR-01. A SEPARATE endpoint from the session response, deliberately (design note
   * §3) — riding on the session would make AC-08's failed read and AC-09's loading state both
   * unreachable, since `requireSession` already resolves before this route could run.
   */
  router.get('/push', async (req, res, next) => {
    try {
      const user = requireUser(req);
      const result = await service.getPushSettings(user.id);
      // Never cached — this is the account's live opt-in state, not a static asset.
      res.set('Cache-Control', 'private, no-store');
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-031/FR-03, AC-02. `pushOptInRequestSchema` rejects a malformed or credentialed
   * `endpoint`, an unusable key length, and any unknown field (`.strict()`) before this ever
   * reaches the service — `endpoint` is a client-supplied URL the server will later POST to
   * (US-032), so validating it at the edge is this route's trust boundary (design note §4.4).
   */
  router.post('/push/opt-in', async (req, res, next) => {
    try {
      const user = requireUser(req);
      const parsed = pushOptInRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const userAgent = req.headers['user-agent']?.slice(0, USER_AGENT_MAX);
      const result = await service.optIntoPush(user.id, { ...parsed.data, userAgent });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * US-031/FR-04, AC-03. No body — opting out needs no browser round-trip and no subscription
   * to validate (BR-001.15).
   */
  router.post('/push/opt-out', async (req, res, next) => {
    try {
      const user = requireUser(req);
      const result = await service.optOutOfPush(user.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
