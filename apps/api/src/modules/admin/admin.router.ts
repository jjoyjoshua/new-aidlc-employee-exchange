/**
 * `/api/admin` — **empty in US-001, and deliberately so.**
 *
 * It exists because `requireAdmin` mounts on the mount point rather than per route
 * (`app.ts`). A guard needs something to sit in front of, and this router being empty is what
 * makes US-001/AC-03's server half provable today with no admin endpoints yet written:
 *
 *   - Employee token -> 403 admin_only from the guard, carrying no data
 *   - Admin token    -> 404 route_not_found (the guard passed; there is genuinely nothing here)
 *   - No token       -> 401 no_session
 *
 * Every admin route added later inherits the guard before it is written. Adding one here is a
 * new contract and belongs to the story that needs it.
 */
import { Router } from 'express';

export const adminRouter = Router();
