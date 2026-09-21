import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { SessionVerifier } from '../../http/middleware/require-session.js';
import type {
  BookingCancellationInput,
  BookingConfirmationInput,
  NotificationsService,
  RecordAndSendResult,
} from '../notifications/notifications.service.js';
import type { AvailabilityRepository } from './bookings.repository.js';
import {
  activeDeskRow,
  activeDesks,
  emptyAvailabilityRepository,
  inactiveDeskRow,
  MY_BOOKINGS_AT_FLOOR_ROW,
  MY_BOOKINGS_BEFORE_FLOOR_ROW,
  MY_BOOKINGS_FUTURE_CANCELLED_ROW,
  partiallyTakenDeskIds,
  RETIRED_DESK_NUMBER,
} from './bookings.fixtures.js';

/**
 * Against the real `createApp`, through supertest — matching `auth.routes.spec.ts`'s own reason
 * for existing: AC-06 in particular is only proven by the *serialized body* a real route
 * produces, not by a function's return value.
 *
 * This file builds its own minimal profile-row shape rather than importing `UserProfileRow`/
 * `ProfileRepository` from `modules/auth` — the module boundary rule (`eslint.config.mjs`
 * Boundary 3) applies to test files too, and `buildApp`'s `profiles` option checks this
 * structurally against the real type without either module needing to import the other's.
 */
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

const MUST_CHANGE_PASSWORD: Row = {
  ...EMPLOYEE,
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  email: 'newhire@company.com',
  must_change_password: true,
};

const EMPLOYEE_TOKEN = 'employee-token';
const MUST_CHANGE_PASSWORD_TOKEN = 'must-change-password-token';

const TODAY = '2026-09-16'; // Wednesday
const SATURDAY = '2026-09-19';
const TOO_FAR_AHEAD = '2026-10-17'; // today + 31
const PAST = '2026-09-15'; // today - 1

/** Any instant that resolves to TODAY in Asia/Kolkata (UTC+5:30). */
const NOW_MS = () => Date.parse(`${TODAY}T12:00:00Z`);

const noRows: AvailabilityRepository = emptyAvailabilityRepository;

/**
 * US-028/US-029/D-04. A recording no-op — every existing test in this file (US-007/009/011)
 * creates or cancels a booking without caring what happens to the notification, and this file's
 * `Config` fixture below carries no `MAIL_*` keys, so the REAL `notificationsService` must never
 * be reached here. `calls`/`cancellationCalls` are read back as plain data (never asserted as a
 * mock call) by this story's own tests.
 */
function recordingNotifications(
  result: RecordAndSendResult = { ok: true, recorded: true },
): Pick<NotificationsService, 'sendBookingConfirmation' | 'sendBookingCancellation' | 'sendReminderEmail'> & {
  calls: BookingConfirmationInput[];
  cancellationCalls: BookingCancellationInput[];
} {
  const calls: BookingConfirmationInput[] = [];
  const cancellationCalls: BookingCancellationInput[] = [];
  return {
    calls,
    cancellationCalls,
    async sendBookingConfirmation(input) {
      calls.push(input);
      return result;
    },
    async sendBookingCancellation(input) {
      cancellationCalls.push(input);
      return result;
    },
    async sendReminderEmail() {
      throw new Error('sendReminderEmail not stubbed — this file exercises /api/bookings only');
    },
  };
}

function throwingNotifications(): Pick<
  NotificationsService,
  'sendBookingConfirmation' | 'sendBookingCancellation' | 'sendReminderEmail'
> {
  return {
    async sendBookingConfirmation() {
      throw new Error('unexpected notifications failure');
    },
    async sendBookingCancellation() {
      throw new Error('unexpected notifications failure');
    },
    async sendReminderEmail() {
      throw new Error('sendReminderEmail not stubbed — this file exercises /api/bookings only');
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
  } as unknown as Config);
});

function appWith(options: {
  rows?: Row[];
  availability?: AvailabilityRepository;
  notifications?: Pick<NotificationsService, 'sendBookingConfirmation' | 'sendBookingCancellation' | 'sendReminderEmail'>;
}) {
  const rows = options.rows ?? [EMPLOYEE, MUST_CHANGE_PASSWORD];

  const profiles = {
    async findById(id: string) {
      return rows.find((r) => r.id === id);
    },
    async stampLastSeen() {},
    async clearMustChangePassword() {},
  };

  const verifier: SessionVerifier = {
    async verify(token) {
      if (token === EMPLOYEE_TOKEN) return EMPLOYEE.id;
      if (token === MUST_CHANGE_PASSWORD_TOKEN) return MUST_CHANGE_PASSWORD.id;
      return undefined;
    },
  };

  return buildApp({
    profiles,
    verifier,
    availability: options.availability ?? noRows,
    notifications: options.notifications ?? recordingNotifications(),
    nowMs: NOW_MS,
  });
}

const availability = (app: ReturnType<typeof buildApp>, query: string, token = EMPLOYEE_TOKEN) =>
  request(app)
    .get(`/api/bookings/availability${query}`)
    .set('Authorization', `Bearer ${token}`);

const createBooking = (app: ReturnType<typeof buildApp>, body: Record<string, unknown>, token = EMPLOYEE_TOKEN) =>
  request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send(body);

const cancelBooking = (app: ReturnType<typeof buildApp>, id: string, token = EMPLOYEE_TOKEN) =>
  request(app)
    .post(`/api/bookings/${id}/cancel`)
    .set('Authorization', `Bearer ${token}`);

const myBookings = (app: ReturnType<typeof buildApp>, query = '', token = EMPLOYEE_TOKEN) =>
  request(app)
    .get(`/api/bookings${query}`)
    .set('Authorization', `Bearer ${token}`);

describe('GET /api/bookings/availability — US-006/AC-03 (taken desks shown, not hidden)', () => {
  it('returns a booked desk as taken, without shrinking the array from the free-day case (US-006/AC-03)', async () => {
    const desks = activeDesks();
    const takenIds = partiallyTakenDeskIds(desks);
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async listActiveDesks() {
          return desks;
        },
        async listConfirmedDeskIds() {
          return takenIds;
        },
      },
    });

    const response = await availability(app, `?date=${TODAY}`);

    expect(response.status).toBe(200);
    expect(response.body.desks).toHaveLength(40);
    const taken = response.body.desks.filter((d: { status: string }) => d.status === 'taken');
    expect(taken).toHaveLength(takenIds.length);
  });
});

describe('GET /api/bookings/availability — US-006/AC-06 (a taken desk never says who has it)', () => {
  it('serializes a taken desk with exactly id, deskNumber and status — no occupant field, anywhere', async () => {
    const desks = activeDesks();
    const firstDesk = desks[0];
    if (!firstDesk) throw new Error('activeDesks() must return at least one desk for this test');
    const takenIds = [firstDesk.id];
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async listActiveDesks() {
          return desks;
        },
        async listConfirmedDeskIds() {
          return takenIds;
        },
      },
    });

    const response = await availability(app, `?date=${TODAY}`);

    const takenDesk = response.body.desks.find((d: { status: string }) => d.status === 'taken');
    expect(takenDesk).toBeDefined();
    expect(Object.keys(takenDesk).sort()).toEqual(['deskNumber', 'id', 'status']);

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('userId');
    expect(raw).not.toContain('user_id');
    expect(raw).not.toContain('email');
    expect(raw).not.toContain('fullName');
    expect(raw).not.toContain(EMPLOYEE.full_name);
  });
});

describe('GET /api/bookings/availability — US-006/AC-04, pass-through check ONLY (design note §6 — not this criterion\'s proof)', () => {
  it('never returns the retired desk, as taken or as free — proven here over a stub, and for real in bookings.repository.spec.ts', async () => {
    const desks = activeDesks(); // already excludes RETIRED_DESK_NUMBER — see bookings.fixtures.ts
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async listActiveDesks() {
          return desks;
        },
        async listConfirmedDeskIds() {
          return [];
        },
      },
    });

    const response = await availability(app, `?date=${TODAY}`);

    const numbers = response.body.desks.map((d: { deskNumber: string }) => d.deskNumber);
    expect(numbers).not.toContain(RETIRED_DESK_NUMBER);
  });
});

describe('GET /api/bookings/availability — request validation (defence, not a story AC)', () => {
  it('400s a missing date', async () => {
    const app = appWith({});
    const response = await availability(app, '');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('400s a malformed date', async () => {
    const app = appWith({});
    const response = await availability(app, '?date=not-a-date');
    expect(response.status).toBe(400);
  });

  it('400s a date that does not exist on the calendar', async () => {
    const app = appWith({});
    const response = await availability(app, '?date=2026-02-30');
    expect(response.status).toBe(400);
  });

  it('400s a repeated ?date= param', async () => {
    const app = appWith({});
    const response = await availability(app, `?date=${TODAY}&date=${SATURDAY}`);
    expect(response.status).toBe(400);
  });

  it('400s an unknown query param', async () => {
    const app = appWith({});
    const response = await availability(app, `?date=${TODAY}&extra=x`);
    expect(response.status).toBe(400);
  });
});

describe('GET /api/bookings/availability — the date guard (defence, not a story AC)', () => {
  it('422s date_not_bookable for a weekend date', async () => {
    const app = appWith({});
    const response = await availability(app, `?date=${SATURDAY}`);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('date_not_bookable');
  });

  it('422s date_not_bookable for a date beyond the 30-day window', async () => {
    const app = appWith({});
    const response = await availability(app, `?date=${TOO_FAR_AHEAD}`);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('date_not_bookable');
  });

  it('422s date_not_bookable for a past date', async () => {
    const app = appWith({});
    const response = await availability(app, `?date=${PAST}`);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('date_not_bookable');
  });
});

describe('GET /api/bookings/availability — the session chain (defence, not a story AC)', () => {
  it('401s with no bearer token', async () => {
    const app = appWith({});
    const response = await request(app).get(`/api/bookings/availability?date=${TODAY}`);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('no_session');
  });

  it('403s an employee whose must_change_password mark is set', async () => {
    const app = appWith({});
    const response = await availability(app, `?date=${TODAY}`, MUST_CHANGE_PASSWORD_TOKEN);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('password_change_required');
  });
});

const DESK_ID = '11111111-1111-4111-8111-111111111111';
const DESK = activeDeskRow(DESK_ID, 'A-02');

describe('GET /api/bookings/availability — Cache-Control (US-007, Architect design note §2.3, F-4)', () => {
  it('sets Cache-Control: private, no-store, since the body is now caller-specific (myBooking)', async () => {
    const app = appWith({});

    const response = await availability(app, `?date=${TODAY}`);

    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});

describe('POST /api/bookings — a valid request creates a Confirmed booking (US-007/AC-03, AC-04)', () => {
  it("returns 201 with the booking and confirmationEmail equal to the authenticated caller's email (US-007/AC-03)", async () => {
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async getDeskById() {
          return DESK;
        },
        async insertConfirmedBooking() {
          return { kind: 'ok', id: 'new-booking-id' };
        },
      },
    });

    const response = await createBooking(app, { date: TODAY, deskId: DESK_ID });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 'new-booking-id',
      deskId: DESK_ID,
      deskNumber: 'A-02',
      date: TODAY,
      status: 'confirmed',
      confirmationEmail: EMPLOYEE.email,
    });
  });
});

describe('POST /api/bookings — sends exactly one confirmation, to the owner, naming the desk and date (US-028/AC-01, AC-02, AC-06)', () => {
  it('calls sendBookingConfirmation once with the callers email, the new booking id, the desk and the date (US-028/AC-01, US-028/AC-02, US-028/AC-06)', async () => {
    const notifications = recordingNotifications();
    const app = appWith({
      notifications,
      availability: {
        ...emptyAvailabilityRepository,
        async getDeskById() {
          return DESK;
        },
        async insertConfirmedBooking() {
          return { kind: 'ok', id: 'new-booking-id' };
        },
      },
    });

    const response = await createBooking(app, { date: TODAY, deskId: DESK_ID });

    expect(response.status).toBe(201);
    expect(notifications.calls).toEqual([
      {
        bookingId: 'new-booking-id',
        userId: EMPLOYEE.id,
        email: EMPLOYEE.email,
        deskNumber: 'A-02',
        date: TODAY,
      },
    ]);
  });
});

describe('POST /api/bookings — a mail failure never loses the booking (US-028/AC-07)', () => {
  it('still returns 201 when the confirmation send reports a failure (US-028/AC-07)', async () => {
    const app = appWith({
      notifications: recordingNotifications({ ok: false, error: 'transport_unreachable', recorded: true }),
      availability: {
        ...emptyAvailabilityRepository,
        async getDeskById() {
          return DESK;
        },
        async insertConfirmedBooking() {
          return { kind: 'ok', id: 'new-booking-id' };
        },
      },
    });

    const response = await createBooking(app, { date: TODAY, deskId: DESK_ID });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('new-booking-id');
  });

  it('still returns 201 even when sendBookingConfirmation throws unexpectedly — D-05, defence beyond recordAndSends own contract (US-028/AC-07)', async () => {
    const app = appWith({
      notifications: throwingNotifications(),
      availability: {
        ...emptyAvailabilityRepository,
        async getDeskById() {
          return DESK;
        },
        async insertConfirmedBooking() {
          return { kind: 'ok', id: 'new-booking-id' };
        },
      },
    });

    const response = await createBooking(app, { date: TODAY, deskId: DESK_ID });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('new-booking-id');
  });
});

describe('POST /api/bookings — the date guard is enforced server-side, bypassing the client entirely (US-007/AC-11)', () => {
  const refusesBeforeAnyDeskLookup: AvailabilityRepository = {
    ...emptyAvailabilityRepository,
    async getDeskById() {
      throw new Error('must not be called — the date guard must refuse first');
    },
    async insertConfirmedBooking() {
      throw new Error('must not be called — the date guard must refuse first');
    },
  };

  it('422s date_not_bookable for a weekend date even when posted directly (US-007/AC-11)', async () => {
    const app = appWith({ availability: refusesBeforeAnyDeskLookup });
    const response = await createBooking(app, { date: SATURDAY, deskId: DESK_ID });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('date_not_bookable');
  });

  it('422s date_not_bookable for a past date even when posted directly (US-007/AC-11)', async () => {
    const app = appWith({ availability: refusesBeforeAnyDeskLookup });
    const response = await createBooking(app, { date: PAST, deskId: DESK_ID });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('date_not_bookable');
  });

  it('422s date_not_bookable for a date beyond the 30-day window even when posted directly (US-007/AC-11)', async () => {
    const app = appWith({ availability: refusesBeforeAnyDeskLookup });
    const response = await createBooking(app, { date: TOO_FAR_AHEAD, deskId: DESK_ID });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('date_not_bookable');
  });
});

describe('POST /api/bookings — the desk guard (US-007/AC-12)', () => {
  it('404s desk_not_found for a deskId that does not exist', async () => {
    const app = appWith({
      availability: { ...emptyAvailabilityRepository, async getDeskById() { return undefined; } },
    });

    const response = await createBooking(app, { date: TODAY, deskId: DESK_ID });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('desk_not_found');
  });

  it('422s desk_inactive for a deskId naming an inactive desk, even when posted directly (US-007/AC-12)', async () => {
    const inactive = inactiveDeskRow();
    const app = appWith({
      availability: { ...emptyAvailabilityRepository, async getDeskById() { return inactive; } },
    });

    const response = await createBooking(app, { date: TODAY, deskId: inactive.id });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('desk_inactive');
  });

  it('422s desk_inactive for a booking request naming a desk that was just deactivated — AC-02 is already built, this is its own test (US-019/AC-02)', async () => {
    // US-019 design note §2.4: `bookings.service.ts:181`'s `if (!desk.is_active)` check and
    // `bookings.router.ts`'s `422 desk_inactive` mapping already answer this rule from the
    // booking side. This test names the desk "however constructed" per the story's own wording
    // (AC-02) — a desk deactivated moments ago, however that happened, is still just
    // `is_active: false` to this endpoint. No production code in `modules/bookings` changes for
    // this test to pass.
    const deactivated = inactiveDeskRow();
    const app = appWith({
      availability: { ...emptyAvailabilityRepository, async getDeskById() { return deactivated; } },
    });

    const response = await createBooking(app, { date: TODAY, deskId: deactivated.id });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('desk_inactive');
  });
});

describe('POST /api/bookings — the two conflict outcomes (US-007/AC-05, AC-08)', () => {
  it('409s desk_already_booked when the desk-per-day index fires (US-007/AC-08)', async () => {
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async getDeskById() {
          return DESK;
        },
        async insertConfirmedBooking() {
          return { kind: 'desk_conflict' };
        },
      },
    });

    const response = await createBooking(app, { date: TODAY, deskId: DESK_ID });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('desk_already_booked');
  });

  it('409s already_booked_that_date when the user-per-day index fires (US-007/AC-05)', async () => {
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async getDeskById() {
          return DESK;
        },
        async insertConfirmedBooking() {
          return { kind: 'user_conflict' };
        },
      },
    });

    const response = await createBooking(app, { date: TODAY, deskId: DESK_ID });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('already_booked_that_date');
  });
});

describe('POST /api/bookings — two sequential requests, same user and date (US-007/AC-09 — Architect design note §8, F-7; the real-Postgres arbitration lives in bookings.repository.concurrency.spec.ts)', () => {
  it('the first succeeds 201; the second — same user, same date, a different desk — is refused 409 already_booked_that_date', async () => {
    let attempts = 0;
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async getDeskById() {
          return DESK;
        },
        async insertConfirmedBooking() {
          attempts += 1;
          return attempts === 1 ? { kind: 'ok', id: `booking-${attempts}` } : { kind: 'user_conflict' };
        },
      },
    });

    const first = await createBooking(app, { date: TODAY, deskId: DESK_ID });
    expect(first.status).toBe(201);

    const second = await createBooking(app, { date: TODAY, deskId: DESK_ID });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('already_booked_that_date');
  });
});

describe('POST /api/bookings — a retried request never sends a second confirmation (US-028/AC-05, same shape as US-007/AC-09/AC-10)', () => {
  it('sends exactly one confirmation across two sequential identical requests, since only the first reaches outcome.kind === ok (US-028/AC-05)', async () => {
    let attempts = 0;
    const notifications = recordingNotifications();
    const app = appWith({
      notifications,
      availability: {
        ...emptyAvailabilityRepository,
        async getDeskById() {
          return DESK;
        },
        async insertConfirmedBooking() {
          attempts += 1;
          return attempts === 1 ? { kind: 'ok', id: `booking-${attempts}` } : { kind: 'user_conflict' };
        },
      },
    });

    const first = await createBooking(app, { date: TODAY, deskId: DESK_ID });
    expect(first.status).toBe(201);

    const second = await createBooking(app, { date: TODAY, deskId: DESK_ID });
    expect(second.status).toBe(409);

    expect(notifications.calls).toHaveLength(1);
  });
});

describe('POST /api/bookings — request validation and the session chain (defence, not a story AC)', () => {
  it('400s a malformed body', async () => {
    const app = appWith({});
    const response = await createBooking(app, { date: TODAY });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('400s an unknown field (bookingCreateSchema is .strict())', async () => {
    const app = appWith({});
    const response = await createBooking(app, { date: TODAY, deskId: DESK_ID, status: 'confirmed' });
    expect(response.status).toBe(400);
  });

  it('401s with no bearer token', async () => {
    const app = appWith({});
    const response = await request(app).post('/api/bookings').send({ date: TODAY, deskId: DESK_ID });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('no_session');
  });
});

/**
 * A single in-memory `bookings` row, mutated by a stub that reproduces the REAL repository's two
 * predicates (US-011 design note §4.2): `cancelOwnedBooking`'s `UPDATE ... WHERE id / user_id /
 * status='confirmed' / booking_date >= today` and `findMyBookingState`'s owner-scoped read. Used
 * where the fixture must behave like the actual write-then-explain sequence, not just return a
 * canned outcome — the cross-endpoint consistency and two-actor tests below both depend on that.
 */
function bookingRow(overrides: Partial<{
  id: string;
  user_id: string;
  desk_id: string;
  desk_number: string;
  booking_date: string;
  status: 'confirmed' | 'cancelled';
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_source: 'owner' | 'admin' | 'deactivation_cascade' | null;
}>) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: EMPLOYEE.id,
    desk_id: 'desk-1',
    desk_number: 'A-01',
    booking_date: TODAY,
    status: 'confirmed' as const,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_source: null,
    ...overrides,
  };
}

function repositoryOverRow(row: ReturnType<typeof bookingRow>): Partial<AvailabilityRepository> {
  return {
    async cancelOwnedBooking(userId, bookingId, cancelledAt, today) {
      if (row.id !== bookingId || row.user_id !== userId || row.status !== 'confirmed' || row.booking_date < today) {
        return undefined;
      }
      row.status = 'cancelled';
      row.cancelled_at = cancelledAt.toISOString();
      row.cancelled_by = userId;
      row.cancellation_source = 'owner';
      return { id: row.id, desk_id: row.desk_id, booking_date: row.booking_date };
    },
    // US-029/D-02 — `bookings.service.ts`'s `cancelBooking` resolves the desk number this way
    // on the success path.
    async getDeskById(deskId) {
      if (deskId !== row.desk_id) return undefined;
      return { id: row.desk_id, desk_number: row.desk_number, is_active: true };
    },
    async findMyBookingState(userId, bookingId) {
      if (row.id !== bookingId || row.user_id !== userId) return undefined;
      return { status: row.status, booking_date: row.booking_date };
    },
    async listMyBookingsInWindow() {
      return [{ id: row.id, booking_date: row.booking_date, status: row.status, desk_number: row.desk_number }];
    },
  };
}

describe('POST /api/bookings/:id/cancel — US-007/AC-07, FR-06, amended by US-011/AC-02, AC-09 (design note §3)', () => {
  it('cancels the caller\'s own confirmed booking and returns 200 with an empty body, and a second cancel of the same id returns 409 booking_already_cancelled (US-007/AC-07, US-011/AC-09)', async () => {
    const row = bookingRow({});
    const app = appWith({ availability: { ...emptyAvailabilityRepository, ...repositoryOverRow(row) } });

    const first = await cancelBooking(app, row.id);
    expect(first.status).toBe(200);
    expect(first.text).toBe('');

    // The SAME actor cancelling the SAME booking again is a single-actor, sequential repeat —
    // not a proof of AC-09's two-actor scenario (design note §10, item 2) — but it does exercise
    // the split D-03's amendment made: the row is now this caller's own already-cancelled
    // booking, so it is 409, not the old undiscriminated 404.
    const second = await cancelBooking(app, row.id);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('booking_already_cancelled');
  });

  it('refuses a past-dated Confirmed booking with 404, and the row is still confirmed afterwards (US-011/AC-02)', async () => {
    const row = bookingRow({ booking_date: PAST });
    const app = appWith({ availability: { ...emptyAvailabilityRepository, ...repositoryOverRow(row) } });

    const response = await cancelBooking(app, row.id);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('booking_not_found');
    // The assertion that proves the REFUSAL, not just the status code (the story's own QA note).
    expect(row.status).toBe('confirmed');
    expect(row.cancelled_at).toBeNull();
  });

  it('the cross-endpoint consistency check: cancel succeeds on exactly the ids GET /api/bookings reports as confirmed (US-011/AC-02, design note §2.1)', async () => {
    const rows = [
      bookingRow({ id: '11111111-1111-4111-8111-111111111111', booking_date: TODAY }), // confirmed today
      bookingRow({ id: '22222222-2222-4222-8222-222222222222', booking_date: '2026-09-20' }), // confirmed future
      bookingRow({ id: '33333333-3333-4333-8333-333333333333', booking_date: PAST }), // past — reads as 'completed'
      bookingRow({
        id: '44444444-4444-4444-8444-444444444444',
        booking_date: '2026-09-20',
        status: 'cancelled',
        cancelled_at: '2026-09-01T00:00:00.000Z',
        cancelled_by: EMPLOYEE.id,
        cancellation_source: 'owner',
      }),
    ];
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async listMyBookingsInWindow() {
          return rows.map((r) => ({ id: r.id, booking_date: r.booking_date, status: r.status, desk_number: r.desk_number }));
        },
        async cancelOwnedBooking(userId, bookingId, cancelledAt, today) {
          const row = rows.find((r) => r.id === bookingId);
          if (!row || row.user_id !== userId || row.status !== 'confirmed' || row.booking_date < today) return undefined;
          row.status = 'cancelled';
          row.cancelled_at = cancelledAt.toISOString();
          row.cancelled_by = userId;
          row.cancellation_source = 'owner';
          return { id: row.id, desk_id: row.desk_id, booking_date: row.booking_date };
        },
        async getDeskById(deskId) {
          const row = rows.find((r) => r.desk_id === deskId);
          return row ? { id: row.desk_id, desk_number: row.desk_number, is_active: true } : undefined;
        },
        async findMyBookingState(userId, bookingId) {
          const row = rows.find((r) => r.id === bookingId);
          if (!row || row.user_id !== userId) return undefined;
          return { status: row.status, booking_date: row.booking_date };
        },
      },
    });

    const listResponse = await myBookings(app);
    const confirmedIds: string[] = listResponse.body.items
      .filter((item: { status: string }) => item.status === 'confirmed')
      .map((item: { id: string }) => item.id);
    // Sanity on the fixture itself — only the today and future rows should read as confirmed.
    expect(confirmedIds.sort()).toEqual(['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']);

    for (const row of rows) {
      const response = await cancelBooking(app, row.id);
      const shouldSucceed = confirmedIds.includes(row.id);
      expect(response.status === 200).toBe(shouldSucceed);
    }
  });

  it('the two-actor test: an admin-style cancel wins first, then the owner\'s own cancel gets 409 with attribution unchanged (US-011/AC-09)', async () => {
    const adminCancelledAt = '2026-09-15T09:00:00.000Z';
    const row = bookingRow({
      status: 'cancelled',
      cancelled_at: adminCancelledAt,
      cancelled_by: 'admin-user-id',
      cancellation_source: 'admin',
    });
    const app = appWith({ availability: { ...emptyAvailabilityRepository, ...repositoryOverRow(row) } });

    const response = await cancelBooking(app, row.id);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('booking_already_cancelled');
    // AC-09's "no second cancellation" — the first actor's attribution must survive untouched.
    expect(row.cancelled_at).toBe(adminCancelledAt);
    expect(row.cancelled_by).toBe('admin-user-id');
    expect(row.cancellation_source).toBe('admin');
  });

  it('400s a non-uuid id', async () => {
    const app = appWith({});
    const response = await cancelBooking(app, 'not-a-uuid');
    expect(response.status).toBe(400);
  });

  it('401s with no bearer token', async () => {
    const app = appWith({});
    const response = await request(app).post('/api/bookings/11111111-1111-4111-8111-111111111111/cancel');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('no_session');
  });
});

describe('POST /api/bookings/:id/cancel — sends a cancellation email to the owner (US-029/AC-01, AC-02, AC-05)', () => {
  it('calls sendBookingCancellation once with the callers email, the cancelled booking, its desk and date, and cancellationSource owner (US-029/AC-01, US-029/AC-02, US-029/AC-05)', async () => {
    const row = bookingRow({});
    const notifications = recordingNotifications();
    const app = appWith({ notifications, availability: { ...emptyAvailabilityRepository, ...repositoryOverRow(row) } });

    const response = await cancelBooking(app, row.id);

    expect(response.status).toBe(200);
    expect(notifications.cancellationCalls).toEqual([
      {
        bookingId: row.id,
        userId: EMPLOYEE.id,
        email: EMPLOYEE.email,
        deskNumber: row.desk_number,
        date: row.booking_date,
        cancellationSource: 'owner',
      },
    ]);
  });

  it('sends no cancellation email when the booking was already cancelled (US-029/AC-09)', async () => {
    const row = bookingRow({
      status: 'cancelled',
      cancelled_at: '2026-09-15T09:00:00.000Z',
      cancelled_by: EMPLOYEE.id,
      cancellation_source: 'owner',
    });
    const notifications = recordingNotifications();
    const app = appWith({ notifications, availability: { ...emptyAvailabilityRepository, ...repositoryOverRow(row) } });

    const response = await cancelBooking(app, row.id);

    expect(response.status).toBe(409);
    expect(notifications.cancellationCalls).toHaveLength(0);
  });
});

describe('POST /api/bookings/:id/cancel — a mail failure never loses the cancellation (US-029/AC-10)', () => {
  it('still returns 200 when sendBookingCancellation reports a failure', async () => {
    const row = bookingRow({});
    const app = appWith({
      notifications: recordingNotifications({ ok: false, error: 'transport_unreachable', recorded: true }),
      availability: { ...emptyAvailabilityRepository, ...repositoryOverRow(row) },
    });

    const response = await cancelBooking(app, row.id);

    expect(response.status).toBe(200);
    expect(row.status).toBe('cancelled');
  });

  it('still returns 200 when sendBookingCancellation throws unexpectedly — the same D-05 defence as POST /', async () => {
    const row = bookingRow({});
    const app = appWith({
      notifications: throwingNotifications(),
      availability: { ...emptyAvailabilityRepository, ...repositoryOverRow(row) },
    });

    const response = await cancelBooking(app, row.id);

    expect(response.status).toBe(200);
    expect(row.status).toBe('cancelled');
  });
});

describe('GET /api/bookings — the default page (US-010/AC-01, AC-03)', () => {
  it('returns items booking_date DESC, and the wire invariant holds: no confirmed item has a date before today (design note §1.4)', async () => {
    const rows = [
      { id: 'upcoming', booking_date: '2026-09-20', status: 'confirmed' as const, desk_number: 'B-02' },
      { id: 'today', booking_date: TODAY, status: 'confirmed' as const, desk_number: 'A-01' },
      { id: 'past', booking_date: '2026-09-10', status: 'confirmed' as const, desk_number: 'A-01' },
    ];
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async listMyBookingsInWindow() {
          return rows;
        },
      },
    });

    const response = await myBookings(app);

    expect(response.status).toBe(200);
    expect(response.body.items.map((i: { id: string }) => i.id)).toEqual(['upcoming', 'today', 'past']);
    for (const item of response.body.items) {
      if (item.status === 'confirmed') expect(item.date >= response.body.today).toBe(true);
    }
    // The past row's status was derived to 'completed', server-side, over the fixed clock.
    expect(response.body.items.find((i: { id: string }) => i.id === 'past').status).toBe('completed');
  });

  it("includes a booking dated exactly today − 30 and excludes one dated today − 31, with nextBefore non-null because of it (US-010/AC-03)", async () => {
    // Emulates the real repository's `.gte('booking_date', from)` over a fixed row set — this is
    // what actually proves the SERVICE passed the right `from`, not merely that the fixture says so.
    const allRows = [MY_BOOKINGS_AT_FLOOR_ROW, MY_BOOKINGS_BEFORE_FLOOR_ROW];
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async listMyBookingsInWindow(_userId, from) {
          return allRows.filter((row) => row.booking_date >= from);
        },
        async findMyNewestBookingBefore() {
          return { booking_date: MY_BOOKINGS_BEFORE_FLOOR_ROW.booking_date };
        },
      },
    });

    const response = await myBookings(app);

    expect(response.status).toBe(200);
    expect(response.body.items.map((i: { id: string }) => i.id)).toEqual([MY_BOOKINGS_AT_FLOOR_ROW.id]);
    expect(response.body.items.map((i: { id: string }) => i.id)).not.toContain(MY_BOOKINGS_BEFORE_FLOOR_ROW.id);
    expect(response.body.nextBefore).not.toBeNull();
  });

  it('a Cancelled booking dated in the future stays Cancelled, never promoted to Completed or Confirmed (design note §4.1, §7.1)', async () => {
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async listMyBookingsInWindow() {
          return [MY_BOOKINGS_FUTURE_CANCELLED_ROW];
        },
      },
    });

    const response = await myBookings(app);

    expect(response.body.items).toEqual([
      {
        id: MY_BOOKINGS_FUTURE_CANCELLED_ROW.id,
        deskNumber: MY_BOOKINGS_FUTURE_CANCELLED_ROW.desk_number,
        date: MY_BOOKINGS_FUTURE_CANCELLED_ROW.booking_date,
        status: 'cancelled',
      },
    ]);
  });

  it('returns nextBefore: null and items: [] for a caller who has never booked (US-010/AC-06)', async () => {
    const app = appWith({});

    const response = await myBookings(app);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], nextBefore: null });
  });

  it('sets Cache-Control: private, no-store (the whole body is one caller\'s)', async () => {
    const app = appWith({});

    const response = await myBookings(app);

    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('does not swallow a repository failure into an empty page — it 500s, distinguishable from a genuine "never booked" (design note §1.5)', async () => {
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async listMyBookingsInWindow() {
          throw new Error('database unreachable');
        },
      },
    });

    const response = await myBookings(app);

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('internal_error');
  });
});

describe('GET /api/bookings?before= — an older page (US-010/AC-03)', () => {
  it('anchors on the caller\'s newest booking strictly before the cursor and returns that window', async () => {
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async findMyNewestBookingBefore(_userId, before) {
          if (before === '2026-08-19') return { booking_date: '2026-08-10' };
          return undefined;
        },
        async listMyBookingsInWindow() {
          return [{ id: 'older', booking_date: '2026-08-10', status: 'cancelled' as const, desk_number: 'A-09' }];
        },
      },
    });

    const response = await myBookings(app, '?before=2026-08-19');

    expect(response.status).toBe(200);
    expect(response.body.items.map((i: { id: string }) => i.id)).toEqual(['older']);
  });

  it('returns nextBefore: null when the page reaches the caller\'s first booking (the story\'s own edge case)', async () => {
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async findMyNewestBookingBefore(_userId, before) {
          if (before === '2026-08-19') return { booking_date: '2026-08-10' };
          return undefined; // nothing older than the floor of that window
        },
      },
    });

    const response = await myBookings(app, '?before=2026-08-19');

    expect(response.body.nextBefore).toBeNull();
  });

  it('returns an empty page with nextBefore null, not an error, when the caller has nothing before the cursor', async () => {
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async findMyNewestBookingBefore() {
          return undefined;
        },
      },
    });

    const response = await myBookings(app, '?before=2026-08-19');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], nextBefore: null });
  });
});

describe('GET /api/bookings — request validation (defence, not a story AC)', () => {
  it('400s a malformed before date', async () => {
    const app = appWith({});
    const response = await myBookings(app, '?before=not-a-date');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('400s an unknown query field', async () => {
    const app = appWith({});
    const response = await myBookings(app, '?before=2026-08-19&limit=10');
    expect(response.status).toBe(400);
  });

  it('401s with no bearer token', async () => {
    const app = appWith({});
    const response = await request(app).get('/api/bookings');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('no_session');
  });
});
