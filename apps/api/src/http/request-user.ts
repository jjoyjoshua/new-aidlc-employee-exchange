/**
 * What `requireSession` attaches to a request, and nothing else.
 *
 * Declared in one place so the middleware and every handler agree on it, and so the shape is
 * the contract's `AuthenticatedUser` rather than a second, drifting definition.
 */
import type { AuthenticatedUser } from '@desk-booking/contracts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Present only after `requireSession`. Read from `user_profiles` on every request —
       * **never** from a JWT claim, because REQ-022 changes roles under live sessions and a
       * claim goes stale at that moment (`app-architecture.md` §5.1).
       */
      user?: AuthenticatedUser;
    }
  }
}

export {};
