import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { SessionVerifier } from '../../http/middleware/require-session.js';
import type { AvailabilityRepository } from './bookings.repository.js';
import {
  activeDeskRow,
  activeDesks,
  emptyAvailabilityRepository,
  inactiveDeskRow,
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

function appWith(options: { rows?: Row[]; availability?: AvailabilityRepository }) {
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

describe('POST /api/bookings/:id/cancel — US-007/AC-07, FR-06 (D-03: one undiscriminated 404)', () => {
  it('cancels the caller\'s own confirmed booking and returns 200 with an empty body, and a second cancel of the same id returns 404 booking_not_found (US-007/AC-07)', async () => {
    const bookingId = '22222222-2222-4222-8222-222222222222';
    let cancelled = false;
    const app = appWith({
      availability: {
        ...emptyAvailabilityRepository,
        async cancelOwnedBooking() {
          if (cancelled) return undefined;
          cancelled = true;
          return { id: bookingId };
        },
      },
    });

    const first = await cancelBooking(app, bookingId);
    expect(first.status).toBe(200);
    expect(first.text).toBe('');

    const second = await cancelBooking(app, bookingId);
    expect(second.status).toBe(404);
    expect(second.body.code).toBe('booking_not_found');
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
