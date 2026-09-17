import express, { type Express, type Router, type RequestHandler } from 'express';
import { config } from '../config/index.js';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { requireAdmin } from './middleware/require-admin.js';
import { requireHttps } from './middleware/require-https.js';

/**
 * The Express application.
 *
 * Modules mount their routers here as they are built — `auth`, `users`, `desks`, `bookings`,
 * `notifications` (app-architecture.md §2). Mounting a new module is a Complex change: it
 * adds a contract.
 *
 * Route handlers validate, delegate, and shape the response. A handler containing a business
 * rule is a review finding — the rules live in `domain/` so they can be found in one place.
 */
/**
 * What the app needs handed to it, so a test can assemble the real middleware chain over stub
 * adapters. US-001/AC-03 is only proven by a request against the *real* mount — a test that
 * builds its own little Express app proves nothing about this file.
 */
export interface AppDeps {
  authRouter: Router;
  adminRouter: Router;
  requireSession: RequestHandler;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');

  // NFR-003 / US-001/AC-08 — before anything reads a body, so a plaintext request carrying a
  // password is refused rather than parsed.
  app.use(requireHttps({ production: config().NODE_ENV === 'production' }));

  app.use(express.json({ limit: '100kb' }));

  // Explicit origins per environment; never `*` outside local dev (security-standards.md).
  const allowed = new Set(config().CORS_ORIGINS);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Liveness only. It asserts nothing about Supabase or the mailer: a health check that
  // fails because a downstream is slow takes a working server out of rotation.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---- module routers mount here -------------------------------------------
  //
  // `/api/auth` is mounted unguarded because `POST /sign-in` is the one unauthenticated route
  // in the system. `GET /session` applies the session chain itself, inside the router — the
  // only place in this codebase where a guard is per-route rather than per-mount, and it is
  // per-route precisely because its sibling must NOT be guarded.
  app.use('/api/auth', deps.authRouter);

  // **The admin guard mounts on the mount point, never per route.** A per-route guard is
  // forgettable and the first one forgotten is a data leak nobody notices. Mounted here, every
  // future admin route inherits it before it is written (US-001/AC-03).
  //
  // adminRouter is EMPTY in US-001. It exists so the guard has something to sit in front of,
  // which is what makes AC-03's server half provable today: an Employee token gets 403 from the
  // guard rather than 404 from the router.
  app.use('/api/admin', deps.requireSession, requireAdmin, deps.adminRouter);

  // app.use('/api/bookings', bookingsRouter);
  // ...

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
