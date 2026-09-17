/**
 * NFR-003 / US-001/AC-08 — credentials are never sent in the clear. **Protected path.**
 *
 * Half of this criterion belongs to the deployment and is verified at Gate 3. The half provable
 * in CI is here: in production, a request that did not arrive over HTTPS is refused, and served
 * responses carry `Strict-Transport-Security`.
 *
 * **No `TRUST_PROXY` configuration key is added** (US-001/D-05). Trusting `x-forwarded-proto`
 * from an unproxied source lets a client spoof it, so the honest version of this needs to know
 * which proxy to trust — and hosting is not chosen yet (`app-architecture.md` §7 item 3), so
 * the correct value cannot be known. `ai/standards/task-surfaces.md` routes every `.env` key
 * change to the human, and escalating for a value nobody can yet choose correctly is ceremony.
 *
 * **What this means, stated plainly so nobody over-reads it:** against a correctly configured
 * proxy this refuses plaintext. Against a *misconfigured* deployment where the app is directly
 * reachable, a client can set the header itself and this proves nothing. The redirect and the
 * real guarantee belong to the platform. That is the residual, and it is Gate 3's.
 */
import type { RequestHandler } from 'express';
import { ERROR_CODES, forbidden } from '../errors.js';

/** Two years, the value HSTS preload lists require. */
const HSTS = 'max-age=63072000; includeSubDomains';

export interface RequireHttpsOptions {
  production: boolean;
}

export function requireHttps({ production }: RequireHttpsOptions): RequestHandler {
  return (req, res, next) => {
    if (!production) {
      // No TLS terminator in development, and HSTS on localhost pins the whole origin to HTTPS
      // in the developer's browser — which then refuses to load the dev server. Painful to undo.
      next();
      return;
    }

    // A proxy chain appends: `x-forwarded-proto: https, http`. The FIRST entry is the scheme the
    // client actually used; reading the last would let an internal hop mask a plaintext client
    // connection.
    const header = req.headers['x-forwarded-proto'];
    const raw = Array.isArray(header) ? header[0] : header;
    const proto = raw?.split(',')[0]?.trim().toLowerCase();

    if (proto !== 'https') {
      // Absent counts as refused: we cannot show the connection was encrypted, and for the one
      // unauthenticated route that carries a password a misconfigured proxy should present as a
      // broken deploy rather than as credentials in the clear.
      next(forbidden(ERROR_CODES.invalid_request, 'This service is available over HTTPS only.'));
      return;
    }

    res.setHeader('Strict-Transport-Security', HSTS);
    next();
  };
}
