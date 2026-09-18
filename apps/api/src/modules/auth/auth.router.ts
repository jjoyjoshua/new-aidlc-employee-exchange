/**
 * `/api/auth` — the only unauthenticated write surface in the system.
 *
 * The handler validates, delegates and shapes a response. The rule it must not break is
 * US-001/AC-04: one message and one response-time band across an unknown email, a wrong
 * password and a deactivated account. The convergence happens in `auth.service.ts`; this file's
 * job is to not undo it by shaping three responses from one outcome.
 */
import { Router, type RequestHandler } from 'express';
import { signInRequestSchema, setPasswordRequestSchema, type Office } from '@desk-booking/contracts';
import {
  ERROR_CODES,
  badRequest,
  forbidden,
  HttpError,
  unauthorized,
  unprocessable,
  serviceUnavailable,
} from '../../http/errors.js';
import { sleep } from '../../infra/clock/index.js';
import { SIGN_IN_MIN_FAILURE_MS } from '../../domain/sign-in-failure-delay.js';
import { officeToday } from '../../domain/booking-window.js';
import { logger } from '../../infra/logger/index.js';
import type { AuthService } from './auth.service.js';
import '../../http/request-user.js';

/**
 * The one sentence a refused sign-in gets, whatever caused it (SCR-001 ST-04).
 *
 * The UI owns user-visible copy and keys it on `code` (US-001/D-10). This string exists so the
 * three failure bodies are **byte-identical on the wire** — it is a wire-uniformity value, not
 * user-facing copy. The apparent duplication with the screen is deliberate; do not "fix" it.
 */
const REFUSAL_MESSAGE =
  "That email and password don't match an active account. If you think your account should be active, contact your office admin.";

export interface AuthRouterDeps {
  service: AuthService;
  nowMs: () => number;
  /** Applied to `GET /session` only — `POST /sign-in` is the unauthenticated route. */
  requireSession: RequestHandler;
  /** US-005/AC-07 — the configured office zone. Threaded in rather than read from `config()`
   *  here, so `buildApp({ officeTimezone })` is the test seam, exactly as `sessionLifetimeMs` is
   *  for NFR-009 (`composition.ts`). */
  officeTimezone: string;
}

export function createAuthRouter({ service, nowMs, requireSession, officeTimezone }: AuthRouterDeps): Router {
  const router = Router();

  /** US-005/AC-07 — the office's own clock and zone, sent on every boot response. */
  const office = (): Office => ({ timezone: officeTimezone, today: officeToday(nowMs(), officeTimezone) });

  router.post('/sign-in', async (req, res, next) => {
    try {
      const parsed = signInRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        // Generic, always. The Zod issue list is the natural thing to return and it would put a
        // fragment of a submitted password into a response for a malformed body (FR-15).
        //
        // Not padded: this depends on the body's shape, not on whether the account exists, so
        // it is no enumeration oracle.
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const startedAtMs = nowMs();
      const outcome = await service.attemptSignIn(parsed.data.email, parsed.data.password);

      if (outcome.kind === 'unavailable') {
        throw serviceUnavailable("We can't reach the booking service right now.");
      }

      if (outcome.kind === 'rejected') {
        const remaining = outcome.deadlineMs - nowMs();

        if (remaining <= 0) {
          // The floor makes the three causes share a LOWER bound; it does not make them
          // identical. Once the real work exceeds the floor, the floor masks nothing and
          // AC-04's timing guarantee has quietly stopped holding — the three causes are back
          // to taking however long they naturally take.
          //
          // This must report how far out of band we are, not merely that we are. The first
          // version logged `-remaining`, which is ~0 by construction because the deadline has
          // already passed — a warning that fired correctly and carried no information.
          // `elapsedMs` against `floorMs` is what an operator can actually act on.
          const elapsedMs = nowMs() - startedAtMs;
          logger.warn('sign-in rejection exceeded the failure-delay floor', {
            elapsedMs,
            floorMs: SIGN_IN_MIN_FAILURE_MS,
            overshootMs: elapsedMs - SIGN_IN_MIN_FAILURE_MS,
          });
        }

        await sleep(remaining);
        throw unauthorized(ERROR_CODES.invalid_credentials, REFUSAL_MESSAGE);
      }

      res.json({ session: outcome.session, user: outcome.user, office: office() });
    } catch (error) {
      next(error);
    }
  });

  /**
   * `POST /sign-out` (US-002) — mounted here, unauthenticated, deliberately.
   *
   * This reads the bearer token itself and runs **no** `requireSession`. Every step of that
   * chain either refuses nothing worth refusing for this request or — step 3, a deactivated
   * account — would refuse the one request that needs to reach the adapter. `requireSession`
   * decides whether a session may *act*; this route destroys one, which is a different job
   * (design note §2.2). This is also how AC-04 holds structurally: a future `must_change_password`
   * gate is added to a chain this route never runs.
   *
   * Answers `204` for every input, including a missing, malformed or already-dead token
   * (US-002/AC-02, US-002/D-02). The caller asked for a session to end; a session that already
   * authorises nothing has already granted the request.
   */
  router.post('/sign-out', async (req, res, next) => {
    try {
      const [scheme, token] = (req.headers.authorization ?? '').split(' ');
      const accessToken = scheme?.toLowerCase() === 'bearer' && token ? token : undefined;

      await service.signOut(accessToken);

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  /**
   * `POST /set-password` (US-004). Runs `requireSession` with the gate `'exempt'` — the caller
   * still needs a valid session (steps 1-4), it is just not refused for the one condition this
   * route exists to clear (design note §2.1, §4.2). `GET /session` below shares this same
   * dependency for the same reason (design note §4.3).
   *
   * The confirm field never crosses the wire (design note §2.2); V-12 is enforced by
   * `setPasswordRequestSchema` before anything else runs. No password appears in any log line
   * on any path through this handler (`decisions.md` D-06).
   */
  router.post('/set-password', requireSession, async (req, res, next) => {
    try {
      const parsed = setPasswordRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        // Generic, same reasoning as `/sign-in`: no issue list, no echo of the submitted value.
        throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
      }

      const user = req.user;
      if (!user) {
        // Unreachable in practice — `requireSession` step 6 always attaches a user before this
        // handler runs. Kept as a typed guard rather than a non-null assertion.
        throw new HttpError(401, ERROR_CODES.no_session, 'Sign in to continue.');
      }

      const outcome = await service.setPassword(user.id, parsed.data.newPassword);

      if (outcome.kind === 'not-required') {
        // AC-03's server half. The mirror of `password_change_required` — one character apart
        // in a switch, which is why both are named constants rather than string literals.
        throw forbidden(ERROR_CODES.password_change_not_required, 'Your password does not need to be changed.');
      }

      if (outcome.kind === 'same-as-current') {
        // V-15 (AC-05) — the one refusal on SCR-010 the browser cannot reach on its own.
        throw unprocessable(
          ERROR_CODES.password_same_as_current,
          "That's the password your admin gave you. Choose a different one — the point is that only you know it.",
        );
      }

      if (outcome.kind === 'unavailable') {
        throw serviceUnavailable("We couldn't save that just now. The password you signed in with still works.");
      }

      // design note §6.4 — `session` travels only when the server's re-sign-in succeeded; the
      // browser hands it to the same place a sign-in response's session goes.
      res.json({ user: outcome.user, ...(outcome.session ? { session: outcome.session } : {}) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * `GET /session` — required by US-001, not optional.
   *
   * AC-03 is a **direct address** request: the user types `/admin/bookings`, the app boots cold
   * with a stored token and must decide what to render. It cannot decide from localStorage,
   * which is client-controlled, and it must not decide from a JWT claim — REQ-022 changes roles
   * under live sessions and a claim goes stale at that moment (`app-architecture.md` §5.1).
   *
   * Mounted behind `requireSession` with the gate `'exempt'` (US-004 design note §4.3): a user
   * whose mark is set must still be able to learn that fact on a cold boot, or the browser's
   * own error handling for a `403` here would sign them out instead of returning them to
   * SCR-010 (US-004/AC-08). Reaching this handler otherwise means the session is already
   * verified and the profile already loaded, exactly as before.
   */
  router.get('/session', requireSession, (req, res, next) => {
    const user = req.user;
    if (!user) {
      next(new HttpError(401, ERROR_CODES.no_session, 'Sign in to continue.'));
      return;
    }
    res.json({ user, office: office() });
  });

  return router;
}
