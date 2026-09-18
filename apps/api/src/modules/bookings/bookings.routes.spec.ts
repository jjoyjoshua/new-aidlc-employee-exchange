import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { SessionVerifier } from '../../http/middleware/require-session.js';
import type { AvailabilityRepository } from './bookings.repository.js';
import { activeDesks, partiallyTakenDeskIds, RETIRED_DESK_NUMBER } from './bookings.fixtures.js';

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

const noRows: AvailabilityRepository = {
  async listActiveDesks() {
    return [];
  },
  async listConfirmedDeskIds() {
    return [];
  },
};

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

describe('GET /api/bookings/availability — US-006/AC-03 (taken desks shown, not hidden)', () => {
  it('returns a booked desk as taken, without shrinking the array from the free-day case (US-006/AC-03)', async () => {
    const desks = activeDesks();
    const takenIds = partiallyTakenDeskIds(desks);
    const app = appWith({
      availability: {
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
