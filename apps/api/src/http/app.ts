import express, { type Express } from 'express';
import { config } from '../config/index.js';
import { errorHandler, notFoundHandler } from './error-handler.js';

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
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
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
  // app.use('/api/auth', authRouter);
  // app.use('/api/bookings', bookingsRouter);
  // ...

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
