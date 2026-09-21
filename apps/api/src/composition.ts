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
import { createAdminRouter } from './modules/admin/admin.router.js';
import { supabaseAuthAdapter } from './modules/auth/auth.adapter.js';
import { profileRepository, type ProfileRepository } from './modules/auth/auth.repository.js';
import { createAuthRouter } from './modules/auth/auth.router.js';
import { createAuthService, type AuthAdapter } from './modules/auth/auth.service.js';
import { availabilityRepository, type AvailabilityRepository } from './modules/bookings/bookings.repository.js';
import { createBookingsRouter } from './modules/bookings/bookings.router.js';
import { createBookingsService } from './modules/bookings/bookings.service.js';
import { adminBookingsRepository, type AdminBookingsRepository } from './modules/bookings/admin-bookings.repository.js';
import { createAdminBookingsService } from './modules/bookings/admin-bookings.service.js';
import { desksRepository, type DesksRepository } from './modules/desks/desks.repository.js';
import { createDesksService } from './modules/desks/desks.service.js';
import { notificationsService, type NotificationsService } from './modules/notifications/notifications.service.js';
import { createNotificationsRouter } from './modules/notifications/notifications.router.js';
import { remindersRepository, type RemindersRepository } from './modules/reminders/reminders.repository.js';
import { createRemindersService } from './modules/reminders/reminders.service.js';
import { createRemindersRouter } from './modules/reminders/reminders.router.js';
import { usersRepository, type UsersRepository } from './modules/users/users.repository.js';
import { createUsersService } from './modules/users/users.service.js';
import { usersAuthAdapter, type UsersAuthAdapter } from './modules/users/users.adapter.js';
import { SIGN_IN_MIN_FAILURE_MS } from './domain/sign-in-failure-delay.js';
import { supabase } from './infra/supabase/index.js';
import { randomInt as nodeRandomInt } from 'node:crypto';
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
  /** US-005/AC-07 test seam — overrides the configured `OFFICE_TIMEZONE`. */
  officeTimezone?: string;
  /** US-006 test seam — overrides the real `desks`/`bookings` reads. */
  availability?: AvailabilityRepository;
  /** US-013 test seam — overrides the real cross-employee `bookings`/`desks`/`user_profiles` read. */
  adminBookings?: AdminBookingsRepository;
  /** US-014 test seam — overrides the real `desks` inventory read. */
  desks?: DesksRepository;
  /** US-020 test seam — overrides the real `user_profiles` account read. */
  users?: UsersRepository;
  /** US-021 test seam — overrides the real Supabase Auth create/delete calls. */
  usersAuth?: UsersAuthAdapter;
  /** US-027 test seam — overrides the real CSPRNG the reset-password generator draws from
   *  (`domain/generate-reset-password.ts` takes `randomInt` as a parameter, never reading
   *  `crypto` itself, design note §5.1). */
  randomInt?: (maxExclusive: number) => number;
  /** US-028/US-029/US-030 test seam — overrides the real `notificationsService`, which reads
   *  `MAIL_*` config through `infra/mailer`. Every existing route test builds a `Config` fixture
   *  with no mail keys, so a test that does not need to exercise mail behaviour must not hit the
   *  real singleton (US-028/D-04). One seam for every router (US-029/D-01) — not one per caller. */
  notifications?: Pick<
    NotificationsService,
    'sendBookingConfirmation' | 'sendBookingCancellation' | 'sendReminderEmail' | 'getPushSettings' | 'optIntoPush' | 'optOutOfPush'
  >;
  /** US-030 test seam — overrides the real cross-employee `bookings` read the reminder run uses. */
  reminders?: RemindersRepository;
}

/** Assemble the application. Every dependency is overridable, and none has to be. */
export function buildApp(options: BuildAppOptions = {}): Express {
  const nowMs = options.nowMs ?? (() => Date.now());
  const randomInt = options.randomInt ?? nodeRandomInt;

  const service = createAuthService({
    auth: options.auth ?? supabaseAuthAdapter,
    profiles: options.profiles ?? profileRepository,
    nowMs,
    floorMs: options.floorMs ?? SIGN_IN_MIN_FAILURE_MS,
  });

  const sharedDeps = {
    verifier: options.verifier ?? supabaseSessionVerifier,
    service,
    nowMs,
    sessionLifetimeMs: options.sessionLifetimeMs ?? config().SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
    lastSeenThrottleMs: options.lastSeenThrottleMs ?? config().SESSION_LAST_SEEN_THROTTLE_MINUTES * 60 * 1000,
  };

  // US-004 design note §4.2. Two instances of the same chain, differing only in the one step
  // that must not apply to two routes: the password-change route itself and `GET /session`.
  // Every module mount takes `session`; `sessionForPasswordChange` is named, unattractive, and
  // has exactly the two call sites below — visible in one file rather than a path allowlist
  // buried in the middleware.
  const session = requireSession({ ...sharedDeps, passwordChangeGate: 'enforced' });
  const sessionForPasswordChange = requireSession({ ...sharedDeps, passwordChangeGate: 'exempt' });

  const officeTimezone = options.officeTimezone ?? config().OFFICE_TIMEZONE;

  const bookingsService = createBookingsService({
    availability: options.availability ?? availabilityRepository,
    nowMs,
    officeTimezone,
  });

  const adminBookingsService = createAdminBookingsService({
    bookings: options.adminBookings ?? adminBookingsRepository,
    nowMs,
    officeTimezone,
  });

  const desksService = createDesksService({ desks: options.desks ?? desksRepository, nowMs, officeTimezone });

  const usersService = createUsersService({
    users: options.users ?? usersRepository,
    usersAuth: options.usersAuth ?? usersAuthAdapter,
    nowMs,
    // US-025's first use — deactivateAccount computes the office's "today" the same way
    // desksService/adminBookingsService already do (design note §3.2, C9).
    officeTimezone,
    randomInt,
  });

  const remindersService = createRemindersService({
    bookings: options.reminders ?? remindersRepository,
    notifications: options.notifications ?? notificationsService,
    nowMs,
    officeTimezone,
  });

  return createApp({
    authRouter: createAuthRouter({
      service,
      nowMs,
      requireSession: sessionForPasswordChange,
      officeTimezone,
    }),
    adminRouter: createAdminRouter({
      bookings: adminBookingsService,
      desks: desksService,
      users: usersService,
      notifications: options.notifications ?? notificationsService,
    }),
    bookingsRouter: createBookingsRouter({
      service: bookingsService,
      notifications: options.notifications ?? notificationsService,
    }),
    remindersRouter: createRemindersRouter({ service: remindersService }),
    notificationsRouter: createNotificationsRouter({ service: options.notifications ?? notificationsService }),
    requireSession: session,
  });
}

