/**
 * Against the real `createApp`, through supertest — matching `bookings.routes.spec.ts`'s own
 * reasoning: the mount-level guard (`requireReminderSecret`) is only proven by a request
 * reaching the REAL mount, not by a stub repository injected around a guard it never exercises.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { AvailabilityRepository } from '../bookings/bookings.repository.js';
import { emptyAvailabilityRepository } from '../bookings/bookings.fixtures.js';
import type { NotificationsService, RecordAndSendResult } from '../notifications/notifications.service.js';
import type { RemindersRepository, ReminderCandidateRow } from './reminders.repository.js';

const SECRET = 'a-genuinely-long-shared-secret-value';
const TODAY = '2026-09-16'; // Wednesday
const NOW_MS = () => Date.parse(`${TODAY}T12:00:00Z`);

beforeEach(() => {
  setConfigForTesting({
    NODE_ENV: 'test',
    PORT: 3000,
    CORS_ORIGINS: [],
    SESSION_LIFETIME_DAYS: 30,
    SESSION_LAST_SEEN_THROTTLE_MINUTES: 60,
    OFFICE_TIMEZONE: 'Asia/Kolkata',
    REMINDER_RUN_SECRET: SECRET,
  } as unknown as Config);
});

function throwingNotifications(): Pick<
  NotificationsService,
  'sendBookingConfirmation' | 'sendBookingCancellation' | 'sendReminderEmail'
> {
  return {
    async sendBookingConfirmation() {
      throw new Error('not exercised — this file exercises /api/internal/reminders only');
    },
    async sendBookingCancellation() {
      throw new Error('not exercised — this file exercises /api/internal/reminders only');
    },
    async sendReminderEmail() {
      return { ok: true, recorded: true };
    },
  };
}

function recordingNotifications(
  result: RecordAndSendResult = { ok: true, recorded: true },
): Pick<NotificationsService, 'sendBookingConfirmation' | 'sendBookingCancellation' | 'sendReminderEmail'> & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    async sendBookingConfirmation() {
      throw new Error('not exercised');
    },
    async sendBookingCancellation() {
      throw new Error('not exercised');
    },
    async sendReminderEmail(input) {
      calls.push(input.bookingId);
      return result;
    },
  };
}

function noRows(): RemindersRepository {
  return { async listConfirmedBookingsForDate() { return []; } };
}

function rowsFor(rows: ReminderCandidateRow[]): RemindersRepository {
  return { async listConfirmedBookingsForDate() { return rows; } };
}

function appWith(options: {
  reminders?: RemindersRepository;
  notifications?: Pick<NotificationsService, 'sendBookingConfirmation' | 'sendBookingCancellation' | 'sendReminderEmail'>;
}) {
  return buildApp({
    profiles: { async findById() { return undefined; }, async stampLastSeen() {}, async clearMustChangePassword() {} },
    verifier: { async verify() { return undefined; } },
    availability: emptyAvailabilityRepository as AvailabilityRepository,
    nowMs: NOW_MS,
    reminders: options.reminders ?? noRows(),
    notifications: options.notifications ?? throwingNotifications(),
  });
}

describe('POST /api/internal/reminders/run — the shared-secret guard (US-030/AC-01)', () => {
  it('refuses with 401 reminder_run_unauthorized when the secret header is absent', async () => {
    const app = appWith({});
    const response = await request(app).post('/api/internal/reminders/run');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('reminder_run_unauthorized');
  });

  it('refuses with 401 reminder_run_unauthorized when the secret is wrong', async () => {
    const app = appWith({});
    const response = await request(app)
      .post('/api/internal/reminders/run')
      .set('X-Reminder-Run-Secret', 'not-the-secret');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('reminder_run_unauthorized');
  });

  it('the guard is mount-level — a DIFFERENT method under the same mount still requires the secret', async () => {
    const app = appWith({});
    const response = await request(app).get('/api/internal/reminders/run');

    expect(response.status).toBe(401);
  });
});

describe('POST /api/internal/reminders/run — a correctly-authenticated run (US-030/AC-01)', () => {
  it('returns 200 with a skipped summary when tomorrow is a weekend', async () => {
    // TODAY (2026-09-16) is a Wednesday — pick a Friday instant instead so tomorrow is Saturday.
    const app = buildApp({
      profiles: { async findById() { return undefined; }, async stampLastSeen() {}, async clearMustChangePassword() {} },
      verifier: { async verify() { return undefined; } },
      availability: emptyAvailabilityRepository as AvailabilityRepository,
      nowMs: () => Date.parse('2026-09-18T12:00:00Z'),
      reminders: noRows(),
      notifications: throwingNotifications(),
    });

    const response = await request(app)
      .post('/api/internal/reminders/run')
      .set('X-Reminder-Run-Secret', SECRET);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ kind: 'skipped', reason: 'weekend' });
  });

  it('returns 200 with the run summary, and calls sendReminderEmail once per confirmed booking for tomorrow (US-030/AC-01, AC-02)', async () => {
    const notifications = recordingNotifications();
    const app = appWith({
      reminders: rowsFor([
        { id: 'b1', userId: 'u1', email: 'dana@company.com', deskNumber: 'A-01', bookingDate: '2026-09-17' },
      ]),
      notifications,
    });

    const response = await request(app)
      .post('/api/internal/reminders/run')
      .set('X-Reminder-Run-Secret', SECRET);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ kind: 'ran', date: '2026-09-17', attempted: 1, sent: 1, failed: 0 });
    expect(notifications.calls).toEqual(['b1']);
  });

  it('a repository failure propagates to a 500 — a genuine outage is never swallowed', async () => {
    const app = appWith({
      reminders: {
        async listConfirmedBookingsForDate() {
          throw new Error('db unreachable');
        },
      },
    });

    const response = await request(app)
      .post('/api/internal/reminders/run')
      .set('X-Reminder-Run-Secret', SECRET);

    expect(response.status).toBe(500);
  });
});
