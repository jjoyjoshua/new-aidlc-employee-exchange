/**
 * V-07 — admin-only surfaces. **Protected path.**
 *
 * **Mounted on the `/api/admin` mount point, never per route.** That is the design decision
 * worth defending: per-route guards are forgettable, and the first one forgotten is a data leak
 * nobody notices. Mounted this way, every future admin route inherits the guard *before it is
 * written*.
 *
 * Because the guard precedes routing, `GET /api/admin/anything` with an Employee token returns
 * `403 admin_only` rather than `404`. That gives US-001/AC-03 a real, non-cosmetic assertion
 * today, with no admin endpoints yet in existence.
 *
 * The role comes from `req.user`, which `requireSession` loaded from `user_profiles` — never
 * from a JWT claim, because REQ-022 changes roles under live sessions and a claim goes stale at
 * that moment.
 */
import type { RequestHandler } from 'express';
import { ERROR_CODES, forbidden, unauthorized } from '../errors.js';
import '../request-user.js';

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const user = req.user;

  if (!user) {
    // Reaching here without a user means requireAdmin was mounted without requireSession in
    // front of it. Refusing is the only safe answer.
    next(unauthorized(ERROR_CODES.no_session, 'Sign in to continue.'));
    return;
  }

  if (user.role !== 'admin') {
    next(forbidden(ERROR_CODES.admin_only, 'That area is for administrators.'));
    return;
  }

  next();
};
