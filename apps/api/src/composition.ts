/**
 * The composition root — where the real adapters are wired to the real services.
 *
 * It is separate from `index.ts` so that starting the process and assembling the application
 * are different acts: a test can assemble the whole chain over stub adapters and still exercise
 * the *real* `createApp`, which is what US-001/AC-03 needs. A test that builds its own little
 * Express app proves nothing about the mount points.
 *
 * Nothing here holds a rule. If a decision appears in this file, it belongs in `domain/` or in
 * the module's service.
 */
import type { Express } from 'express';
import { createApp } from './http/app.js';
import { requireSession, type SessionVerifier } from './http/middleware/require-session.js';
import { adminRouter } from './modules/admin/admin.router.js';
import { supabaseAuthAdapter } from './modules/auth/auth.adapter.js';
import { profileRepository, type ProfileRepository } from './modules/auth/auth.repository.js';
import { createAuthRouter } from './modules/auth/auth.router.js';
import { createAuthService, type AuthAdapter } from './modules/auth/auth.service.js';
import { SIGN_IN_MIN_FAILURE_MS } from './domain/sign-in-failure-delay.js';
import { supabase } from './infra/supabase/index.js';
import { config } from './config/index.js';

/**
 * Verifies a bearer token with Supabase and returns its subject.
 *
 * Uses the service-role client's `auth.getUser(jwt)`, which validates the token's signature and
 * expiry upstream rather than trusting anything we could get wrong locally. The **role** is not
 * taken from here — `requireSession` loads it from `user_profiles`, because REQ-022 changes
 * roles under live sessions and a JWT claim goes stale at that moment.
 */
export const supabaseSessionVerifier: SessionVerifier = {
  async verify(accessToken) {
    const { data, error } = await supabase().auth.getUser(accessToken);
    if (error || !data.user) return undefined;
    return data.user.id;
  },
};

export interface BuildAppOptions {
  auth?: AuthAdapter;
  profiles?: ProfileRepository;
  verifier?: SessionVerifier;
  nowMs?: () => number;
  floorMs?: number;
  /** NFR-009 test seam — overrides the configured `SESSION_LIFETIME_DAYS`, in milliseconds. */
  sessionLifetimeMs?: number;
  /** NFR-009 test seam — overrides the configured `SESSION_LAST_SEEN_THROTTLE_MINUTES`, in milliseconds. */
  lastSeenThrottleMs?: number;
}

/** Assemble the application. Every dependency is overridable, and none has to be. */
export function buildApp(options: BuildAppOptions = {}): Express {
  const nowMs = options.nowMs ?? (() => Date.now());

  const service = createAuthService({
    auth: options.auth ?? supabaseAuthAdapter,
    profiles: options.profiles ?? profileRepository,
    nowMs,
    floorMs: options.floorMs ?? SIGN_IN_MIN_FAILURE_MS,
  });

  const session = requireSession({
    verifier: options.verifier ?? supabaseSessionVerifier,
    service,
    nowMs,
    sessionLifetimeMs: options.sessionLifetimeMs ?? config().SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
    lastSeenThrottleMs: options.lastSeenThrottleMs ?? config().SESSION_LAST_SEEN_THROTTLE_MINUTES * 60 * 1000,
  });

  return createApp({
    authRouter: createAuthRouter({ service, nowMs, requireSession: session }),
    adminRouter,
    requireSession: session,
  });
}

