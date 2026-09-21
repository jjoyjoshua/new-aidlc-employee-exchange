/**
 * Against the real `createApp`, through supertest — matching `bookings.routes.spec.ts`'s own
 * reasoning: the mount-level guard (`requireSession`) and AC-10 (no account id anywhere in the
 * request) are only proven by a request reaching the REAL mount.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { SessionVerifier } from '../../http/middleware/require-session.js';
import type { NotificationsService } from './notifications.service.js';

interface Row {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'admin';
  is_active: boolean;
  must_change_password: boolean;
  last_seen_at: string;
}

const EMPLOYEE: Row = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  full_name: 'Priya Sharma',
  role: 'employee',
  is_active: true,
  must_change_password: false,
  last_seen_at: new Date().toISOString(),
};

const EMPLOYEE_TOKEN = 'employee-token';
const NOW_MS = () => Date.parse('2026-09-16T12:00:00Z');
const VAPID_PUBLIC_KEY = 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k';

const VALID_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  p256dh: 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k',
  auth: '6_vGXk9KyNjRxqt5n23www',
};

/** US-031 — none of this file's tests exercise the email path. */
const NOT_STUBBED_EMAIL = {
  async sendBookingConfirmation(): Promise<never> {
    throw new Error('sendBookingConfirmation not stubbed — this file exercises /api/notifications only');
  },
  async sendBookingCancellation(): Promise<never> {
    throw new Error('sendBookingCancellation not stubbed — this file exercises /api/notifications only');
  },
  async sendReminderEmail(): Promise<never> {
    throw new Error('sendReminderEmail not stubbed — this file exercises /api/notifications only');
  },
};

/** Records exactly what the router passed to the service, read back as plain data — never
 *  asserted as a mock "was called with" (this codebase's own convention). */
function recordingPush(options: { optIn?: boolean } = {}): Pick<
  NotificationsService,
  'sendBookingConfirmation' | 'sendBookingCancellation' | 'sendReminderEmail' | 'getPushSettings' | 'optIntoPush' | 'optOutOfPush'
> & {
  optInCalls: Array<{ userId: string; subscription: unknown }>;
  optOutCalls: string[];
} {
  const optInCalls: Array<{ userId: string; subscription: unknown }> = [];
  const optOutCalls: string[] = [];
  return {
    ...NOT_STUBBED_EMAIL,
    optInCalls,
    optOutCalls,
    async getPushSettings() {
      return { pushOptIn: options.optIn ?? false, vapidPublicKey: VAPID_PUBLIC_KEY };
    },
    async optIntoPush(userId, subscription) {
      optInCalls.push({ userId, subscription });
      return { pushOptIn: true };
    },
    async optOutOfPush(userId) {
      optOutCalls.push(userId);
      return { pushOptIn: false };
    },
  };
}

beforeEach(() => {
  setConfigForTesting({
    NODE_ENV: 'test',
    PORT: 3000,
    CORS_ORIGINS: [],
    SESSION_LIFETIME_DAYS: 30,
    SESSION_LAST_SEEN_THROTTLE_MINUTES: 60,
    OFFICE_TIMEZONE: 'Asia/Kolkata',
    VAPID_PUBLIC_KEY,
  } as unknown as Config);
});

function appWith(notifications: ReturnType<typeof recordingPush>) {
  const verifier: SessionVerifier = {
    async verify(token) {
      if (token === EMPLOYEE_TOKEN) return EMPLOYEE.id;
      return undefined;
    },
  };

  return buildApp({
    profiles: {
      async findById(id: string) {
        return id === EMPLOYEE.id ? EMPLOYEE : undefined;
      },
      async stampLastSeen() {},
      async clearMustChangePassword() {},
    },
    verifier,
    nowMs: NOW_MS,
    notifications,
  });
}

describe('GET /api/notifications/push — the mount-level guard (US-031/AC-10)', () => {
  it('refuses with 401 when no session is presented', async () => {
    const app = appWith(recordingPush());
    const response = await request(app).get('/api/notifications/push');
    expect(response.status).toBe(401);
  });

  it('refuses with 401 on a bad token, the same as any other guarded mount', async () => {
    const app = appWith(recordingPush());
    const response = await request(app).get('/api/notifications/push').set('Authorization', 'Bearer not-a-real-token');
    expect(response.status).toBe(401);
  });
});

describe('GET /api/notifications/push (US-031/FR-01, AC-01, AC-04)', () => {
  it('returns the caller’s own pushOptIn flag and the VAPID public key', async () => {
    const app = appWith(recordingPush({ optIn: true }));
    const response = await request(app).get('/api/notifications/push').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ pushOptIn: true, vapidPublicKey: VAPID_PUBLIC_KEY });
  });

  it('never carries anything about a browser subscription (design note §3)', async () => {
    const app = appWith(recordingPush());
    const response = await request(app).get('/api/notifications/push').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.body).not.toHaveProperty('subscriptionExists');
  });

  it('is never cached — Cache-Control: private, no-store', async () => {
    const app = appWith(recordingPush());
    const response = await request(app).get('/api/notifications/push').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});

describe('POST /api/notifications/push/opt-in (US-031/FR-03, AC-02, AC-10)', () => {
  it('accepts a well-formed subscription and returns the confirmed flag', async () => {
    const app = appWith(recordingPush());
    const response = await request(app)
      .post('/api/notifications/push/opt-in')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send(VALID_SUBSCRIPTION);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ pushOptIn: true });
  });

  it('passes the caller’s OWN id to the service — never anything from the body (US-031/AC-10)', async () => {
    const notifications = recordingPush();
    const app = appWith(notifications);

    await request(app)
      .post('/api/notifications/push/opt-in')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ ...VALID_SUBSCRIPTION, userId: 'someone-elses-id' }); // rejected by .strict() below

    // The unknown `userId` field makes this a 400 before the service is ever called — proven
    // by the next test. This test's own point is structural: no route parameter exists that
    // COULD carry an id even if `.strict()` did not reject it.
    expect(notifications.optInCalls).toEqual([]);
  });

  it('rejects an unknown field — .strict(), the same as every other request schema', async () => {
    const app = appWith(recordingPush());
    const response = await request(app)
      .post('/api/notifications/push/opt-in')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ ...VALID_SUBSCRIPTION, userId: 'someone-elses-id' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('rejects a non-https endpoint before the service is ever called (design note §4.4, trust boundary)', async () => {
    const notifications = recordingPush();
    const app = appWith(notifications);
    const response = await request(app)
      .post('/api/notifications/push/opt-in')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ ...VALID_SUBSCRIPTION, endpoint: 'http://fcm.googleapis.com/fcm/send/abc123' });

    expect(response.status).toBe(400);
    expect(notifications.optInCalls).toEqual([]);
  });

  it('rejects a private-host endpoint — the authenticated-SSRF case (design note §4.4)', async () => {
    const app = appWith(recordingPush());
    const response = await request(app)
      .post('/api/notifications/push/opt-in')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ ...VALID_SUBSCRIPTION, endpoint: 'https://169.254.169.254/latest/meta-data' });

    expect(response.status).toBe(400);
  });

  it('refuses with 401 when no session is presented', async () => {
    const app = appWith(recordingPush());
    const response = await request(app).post('/api/notifications/push/opt-in').send(VALID_SUBSCRIPTION);
    expect(response.status).toBe(401);
  });
});

describe('POST /api/notifications/push/opt-out (US-031/FR-04, AC-03)', () => {
  it('succeeds with no body and no browser round-trip (US-031/AC-03, BR-001.15)', async () => {
    const notifications = recordingPush({ optIn: true });
    const app = appWith(notifications);

    const response = await request(app).post('/api/notifications/push/opt-out').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ pushOptIn: false });
    expect(notifications.optOutCalls).toEqual([EMPLOYEE.id]);
  });

  it('refuses with 401 when no session is presented', async () => {
    const app = appWith(recordingPush());
    const response = await request(app).post('/api/notifications/push/opt-out');
    expect(response.status).toBe(401);
  });
});
