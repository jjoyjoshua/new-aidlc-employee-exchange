/**
 * `GET /api/admin/bookings` and `GET /api/admin/desks` against the real `createApp`, through
 * supertest — matching `bookings.routes.spec.ts`'s and `auth.routes.spec.ts`'s own reasoning:
 * AC-10 in particular is only proven by a request reaching the real `/api/admin` mount with a
 * real Employee session, not by a stub repository that a route test injects around a guard it
 * never exercises.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { SessionVerifier } from '../../http/middleware/require-session.js';
import type { AdminBookingRow, AdminBookingsFilter, AdminBookingsRepository } from '../bookings/admin-bookings.repository.js';
import type {
  DeskRow,
  DesksRepository,
  InsertDeskOutcome,
  SetDeskActiveOutcome,
  UpdateDeskOutcome,
} from '../desks/desks.repository.js';
import type { UserAccountRow, UsersRepository, UserSummaryRow } from '../users/users.repository.js';

interface Row {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'admin';
  is_active: boolean;
  must_change_password: boolean;
  last_seen_at: string;
}

const ADMIN: Row = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  email: 'marcus@company.com',
  full_name: 'Marcus Webb',
  role: 'admin',
  is_active: true,
  must_change_password: false,
  last_seen_at: new Date().toISOString(),
};

const EMPLOYEE: Row = {
  ...ADMIN,
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  full_name: 'Priya Sharma',
  role: 'employee',
};

const ADMIN_TOKEN = 'admin-token';
const EMPLOYEE_TOKEN = 'employee-token';

const TODAY = '2026-09-16';
const NOW_MS = () => Date.parse(`${TODAY}T12:00:00Z`);

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

/** Most tests in this file only exercise `GET /bookings` — spread this in so those literals don't
 *  each have to name the US-015 write methods they never call. */
const NOT_USED_FOR_CANCEL: Pick<AdminBookingsRepository, 'cancelAnyBooking' | 'findBookingState'> = {
  async cancelAnyBooking() {
    throw new Error('cancelAnyBooking not stubbed — this test only exercises GET /bookings');
  },
  async findBookingState() {
    throw new Error('findBookingState not stubbed — this test only exercises GET /bookings');
  },
};

const noBookings: AdminBookingsRepository = {
  ...NOT_USED_FOR_CANCEL,
  async listBookings() {
    return { rows: [], total: 0 };
  },
};

const noDesks: DesksRepository = {
  async listAllDesks() {
    return [];
  },
  async listUpcomingConfirmedDeskIds() {
    return [];
  },
  async insertDesk() {
    throw new Error('insertDesk not stubbed — this test only exercises GET /desks');
  },
  async updateDeskNumber() {
    throw new Error('updateDeskNumber not stubbed — this test only exercises GET /desks');
  },
  async countUpcomingConfirmedForDesk() {
    throw new Error('countUpcomingConfirmedForDesk not stubbed — this test only exercises GET /desks');
  },
  async setDeskActive() {
    throw new Error('setDeskActive not stubbed — this test only exercises GET /desks');
  },
};

const noUsers: UsersRepository = {
  async listAccounts() {
    return [];
  },
  async getSummaryCounts() {
    return [];
  },
};

function bookingRow(overrides: Partial<AdminBookingRow> = {}): AdminBookingRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    booking_date: TODAY,
    status: 'confirmed',
    desk_number: 'A-01',
    employee_name: 'Priya Raman',
    ...overrides,
  };
}

function deskRow(overrides: Partial<DeskRow> = {}): DeskRow {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    desk_number: 'A-01',
    is_active: true,
    ...overrides,
  };
}

function accountRow(overrides: Partial<UserAccountRow> = {}): UserAccountRow {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    full_name: 'Dana Silva',
    email: 'dana@company.com',
    role: 'employee',
    is_active: true,
    ...overrides,
  };
}

function appWith(options: {
  rows?: Row[];
  adminBookings?: Pick<AdminBookingsRepository, 'listBookings'> & Partial<AdminBookingsRepository>;
  desks?: DesksRepository;
  users?: UsersRepository;
}) {
  const rows = options.rows ?? [ADMIN, EMPLOYEE];

  const profiles = {
    async findById(id: string) {
      return rows.find((r) => r.id === id);
    },
    async stampLastSeen() {},
    async clearMustChangePassword() {},
  };

  const verifier: SessionVerifier = {
    async verify(token) {
      if (token === ADMIN_TOKEN) return ADMIN.id;
      if (token === EMPLOYEE_TOKEN) return EMPLOYEE.id;
      return undefined;
    },
  };

  return buildApp({
    profiles,
    verifier,
    nowMs: NOW_MS,
    adminBookings: options.adminBookings ? { ...NOT_USED_FOR_CANCEL, ...options.adminBookings } : noBookings,
    desks: options.desks ?? noDesks,
    users: options.users ?? noUsers,
  });
}

describe('GET /api/admin/bookings — admin-only (US-013/AC-10)', () => {
  it('refuses an Employee session with 403 and no booking data (US-013/AC-10)', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [bookingRow()], total: 1 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
    expect(JSON.stringify(response.body)).not.toContain('Priya Raman');
  });

  it('refuses a request with no token at all', async () => {
    const app = appWith({});
    const response = await request(app).get('/api/admin/bookings');
    expect(response.status).toBe(401);
  });

  it('serves an Admin session', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [bookingRow()], total: 1 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
  });
});

describe('GET /api/admin/bookings — the default view (US-013/AC-02, AC-03, AC-06)', () => {
  it('returns bookings from today onward at every status, with all four fields, statuses derived (US-013/AC-02, US-013/AC-03, US-013/AC-06)', async () => {
    const app = appWith({
      adminBookings: {
        async listBookings() {
          return {
            total: 2,
            rows: [
              bookingRow({ id: 'a', booking_date: '2026-09-23', status: 'cancelled', employee_name: 'Dana Silva' }),
              bookingRow({ id: 'b', booking_date: '2026-09-10', status: 'confirmed', employee_name: 'Sam Okoro' }),
            ],
          };
        },
      },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.today).toBe(TODAY);
    expect(response.body.items).toEqual([
      { id: 'a', date: '2026-09-23', deskNumber: 'A-01', employeeName: 'Dana Silva', status: 'cancelled' },
      // A confirmed row dated before today reads as completed (AC-06) — derived, never stored.
      { id: 'b', date: '2026-09-10', deskNumber: 'A-01', employeeName: 'Sam Okoro', status: 'completed' },
    ]);
  });

  it('sets Cache-Control: private, no-store on the most sensitive read in the system', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});

describe('GET /api/admin/bookings — paging boundary (US-013/AC-04)', () => {
  it('exactly 50 matching rows shows no next page', async () => {
    const app = appWith({
      adminBookings: {
        async listBookings(_filter, _offset, limit) {
          const rows = Array.from({ length: limit }, (_, i) => bookingRow({ id: `id-${i}` }));
          return { rows, total: 50 };
        },
      },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.body.items).toHaveLength(50);
    expect(response.body.nextPage).toBeNull();
  });

  it('51 matching rows shows a next page, and ?page=2 returns the 51st', async () => {
    const allRows = Array.from({ length: 51 }, (_, i) => bookingRow({ id: `id-${i}` }));
    const adminBookings: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(_filter, offset, limit) {
        return { rows: allRows.slice(offset, offset + limit), total: allRows.length };
      },
    };
    const app = appWith({ adminBookings });

    const page1 = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(page1.body.items).toHaveLength(50);
    expect(page1.body.nextPage).toBe(2);

    const page2 = await request(app)
      .get('/api/admin/bookings?page=2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).toBe('id-50');
    expect(page2.body.nextPage).toBeNull();
  });

  it('a non-numeric page is rejected at the edge', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app)
      .get('/api/admin/bookings?page=abc')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('an unknown query field is rejected', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app)
      .get('/api/admin/bookings?limit=10')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
  });
});

describe('GET /api/admin/bookings — empty system (US-013/AC-08)', () => {
  it('an empty system returns total 0, no items, no next page (US-013/AC-08)', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.body).toMatchObject({ total: 0, items: [], nextPage: null });
  });
});

describe('GET /api/admin/bookings — a repository failure is never swallowed into an empty page', () => {
  it('propagates as a 500, distinguishable from a real empty system', async () => {
    const app = appWith({
      adminBookings: {
        async listBookings() {
          throw new Error('boom');
        },
      },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(500);
  });
});

describe('/api/admin/anything — unaffected by this router no longer being empty (US-001/AC-03)', () => {
  it('still 404s for an admin on an unknown admin path', async () => {
    const app = appWith({});
    const response = await request(app).get('/api/admin/anything').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(404);
  });
});

describe('GET /api/admin/bookings — US-014 filters', () => {
  function capturingRepository(rows: AdminBookingRow[] = []) {
    let captured: AdminBookingsFilter | undefined;
    const repository: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(filter) {
        captured = filter;
        return { rows, total: rows.length };
      },
    };
    return { repository, getCaptured: () => captured };
  }

  it('a booking outside the from/to range is absent (US-014/AC-01)', async () => {
    const app = appWith({
      adminBookings: {
        async listBookings() {
          return {
            rows: [
              bookingRow({ id: 'in-range', booking_date: '2026-09-20' }),
              bookingRow({ id: 'out-of-range', booking_date: '2026-10-05' }),
            ],
            total: 2,
          };
        },
      },
    });

    // The stub ignores the filter and returns both rows; this asserts the FILTER PARAMS reach
    // the repository intact, which the "combines all four" test below verifies against a
    // filter-aware stub.
    const response = await request(app)
      .get('/api/admin/bookings?from=2026-09-01&to=2026-09-30')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(200);
  });

  it('passes from/to through to the repository filter (US-014/AC-01)', async () => {
    const { repository, getCaptured } = capturingRepository();
    const app = appWith({ adminBookings: repository });

    await request(app)
      .get('/api/admin/bookings?from=2026-09-01&to=2026-09-30')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(getCaptured()?.from).toBe('2026-09-01');
    expect(getCaptured()?.to).toBe('2026-09-30');
  });

  it("a passed Confirmed booking appears under status=completed and NOT under status=confirmed (US-014/AC-02, the QA note's exact assertion)", async () => {
    const pastConfirmed = bookingRow({ id: 'past', booking_date: '2026-09-10', status: 'confirmed' });
    const futureConfirmed = bookingRow({ id: 'future', booking_date: '2026-09-23', status: 'confirmed' });

    // A minimal in-memory filter application, standing in for Postgres, so this test exercises
    // the SERVICE's resolved filter end to end rather than merely capturing it.
    const allRows = [pastConfirmed, futureConfirmed];
    const adminBookings: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(filter) {
        const matched = allRows.filter((r) => {
          if (filter.from !== undefined && r.booking_date < filter.from) return false;
          if (filter.to !== undefined && r.booking_date > filter.to) return false;
          if (filter.before !== undefined && r.booking_date >= filter.before) return false;
          if (filter.status !== undefined && r.status !== filter.status) return false;
          return true;
        });
        return { rows: matched, total: matched.length };
      },
    };
    const app = appWith({ adminBookings });

    const completed = await request(app)
      .get('/api/admin/bookings?status=completed')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(completed.body.items.map((i: { id: string }) => i.id)).toEqual(['past']);

    const confirmed = await request(app)
      .get('/api/admin/bookings?status=confirmed')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(confirmed.body.items.map((i: { id: string }) => i.id)).toEqual(['future']);
  });

  it('a cancelled booking appears under status=cancelled regardless of date', async () => {
    const cancelledPast = bookingRow({ id: 'c1', booking_date: '2026-09-01', status: 'cancelled' });
    const cancelledFuture = bookingRow({ id: 'c2', booking_date: '2026-09-30', status: 'cancelled' });
    const allRows = [cancelledPast, cancelledFuture];
    const adminBookings: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(filter) {
        const matched = allRows.filter((r) => filter.status === undefined || r.status === filter.status);
        return { rows: matched, total: matched.length };
      },
    };
    const app = appWith({ adminBookings });

    const response = await request(app)
      .get('/api/admin/bookings?status=cancelled')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.body.items.map((i: { id: string }) => i.id).sort()).toEqual(['c1', 'c2']);
  });

  it('only the matching desk\'s rows are returned (US-014/AC-03)', async () => {
    const rowA = bookingRow({ id: 'a', desk_number: 'A-01' });
    const rowB = bookingRow({ id: 'b', desk_number: 'B-02' });
    const deskAId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const adminBookings: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(filter) {
        const matched = filter.deskId === deskAId ? [rowA] : [rowA, rowB];
        return { rows: matched, total: matched.length };
      },
    };
    const app = appWith({ adminBookings });

    const response = await request(app)
      .get(`/api/admin/bookings?deskId=${deskAId}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe('a');
  });

  it('date+status, date+desk, status+desk, and all three combine (US-014/AC-04)', async () => {
    const { repository, getCaptured } = capturingRepository();
    const app = appWith({ adminBookings: repository });
    const deskId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

    await request(app)
      .get(`/api/admin/bookings?from=2026-09-01&to=2026-09-30&status=confirmed&deskId=${deskId}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    const captured = getCaptured();
    expect(captured?.to).toBe('2026-09-30');
    expect(captured?.status).toBe('confirmed');
    expect(captured?.deskId).toBe(deskId);
  });

  it('?to=<before from> is refused with 400 invalid_request (US-014 edge case)', async () => {
    const app = appWith({});
    const response = await request(app)
      .get('/api/admin/bookings?from=2026-09-30&to=2026-09-01')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('an unknown status word is rejected', async () => {
    const app = appWith({});
    const response = await request(app)
      .get('/api/admin/bookings?status=archived')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(400);
  });
});

describe('GET /api/admin/desks (US-014/AC-03, edge case; US-016/AC-01, AC-10)', () => {
  it('refuses an Employee session with 403 (US-014/AC-03, US-016/AC-10)', async () => {
    const app = appWith({
      desks: { ...noDesks, async listAllDesks() { return [deskRow()]; } },
    });
    const response = await request(app).get('/api/admin/desks').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(response.status).toBe(403);
  });

  it('refuses a request with no token', async () => {
    const app = appWith({});
    const response = await request(app).get('/api/admin/desks');
    expect(response.status).toBe(401);
  });

  it('returns an inactive desk alongside active ones, ordered — inactive desks stay findable (US-014/AC-03, US-016/AC-01)', async () => {
    const app = appWith({
      desks: {
        ...noDesks,
        async listAllDesks() {
          return [deskRow({ id: 'a', desk_number: 'A-01', is_active: true }), deskRow({ id: 'b', desk_number: 'A-02', is_active: false })];
        },
      },
    });

    const response = await request(app).get('/api/admin/desks').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.desks).toEqual([
      { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 },
      { id: 'b', deskNumber: 'A-02', isActive: false, bookedAhead: 0 },
    ]);
  });

  it('reports bookedAhead per desk, tallied from the confirmed-upcoming reads (US-016/AC-04, AC-05)', async () => {
    const app = appWith({
      desks: {
        ...noDesks,
        async listAllDesks() {
          return [deskRow({ id: 'a', desk_number: 'A-01', is_active: true }), deskRow({ id: 'b', desk_number: 'A-02', is_active: true })];
        },
        async listUpcomingConfirmedDeskIds(status, from) {
          expect(status).toBe('confirmed');
          expect(from).toBe(TODAY);
          return ['a', 'a', 'a'];
        },
      },
    });

    const response = await request(app).get('/api/admin/desks').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.desks).toEqual([
      { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 },
      { id: 'b', deskNumber: 'A-02', isActive: true, bookedAhead: 0 },
    ]);
  });

  it('sets Cache-Control: private, no-store', async () => {
    const app = appWith({ desks: noDesks });
    const response = await request(app).get('/api/admin/desks').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});

describe('POST /api/admin/desks (US-017/AC-01, AC-02, AC-04, AC-08)', () => {
  function insertingDesksRepository(outcomes: InsertDeskOutcome[]) {
    const calls: string[] = [];
    let i = 0;
    const repository: DesksRepository = {
      ...noDesks,
      async insertDesk(deskNumber) {
        calls.push(deskNumber);
        const outcome = outcomes[i] ?? outcomes[outcomes.length - 1];
        i += 1;
        if (!outcome) throw new Error('no outcome stubbed');
        return outcome;
      },
    };
    return { repository, calls };
  }

  it('a valid body creates the desk and returns 201 with bookedAhead: 0 (US-017/AC-01)', async () => {
    const { repository } = insertingDesksRepository([
      { kind: 'ok', desk: { id: 'new-id', desk_number: 'A-07', is_active: true } },
    ]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post('/api/admin/desks')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'a-07' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 'new-id', deskNumber: 'A-07', isActive: true, bookedAhead: 0 });
  });

  it('normalises the body BEFORE it reaches the repository — a raw lower-case value never reaches the insert unnormalised (US-017/AC-03, design note §2.4)', async () => {
    const { repository, calls } = insertingDesksRepository([
      { kind: 'ok', desk: { id: 'new-id', desk_number: 'A-07', is_active: true } },
    ]);
    const app = appWith({ desks: repository });

    await request(app)
      .post('/api/admin/desks')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'a-07' });

    expect(calls).toEqual(['A-07']);
  });

  it('a malformed body is refused at the edge with 400 invalid_request, and no insert is attempted (US-017/AC-02)', async () => {
    const { repository, calls } = insertingDesksRepository([]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post('/api/admin/desks')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-1' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
    expect(calls).toEqual([]);
  });

  it('an unknown field is refused at the edge (.strict())', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .post('/api/admin/desks')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-01', isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('a duplicate desk number gets 409 desk_number_taken (US-017/AC-04)', async () => {
    const { repository } = insertingDesksRepository([{ kind: 'duplicate' }]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post('/api/admin/desks')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-01' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('desk_number_taken');
  });

  it('refuses an Employee session with 403 admin_only, reaching the real mount (US-017/AC-08)', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .post('/api/admin/desks')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ deskNumber: 'A-01' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
  });

  it('refuses a request with no token at all', async () => {
    const app = appWith({ desks: noDesks });
    const response = await request(app).post('/api/admin/desks').send({ deskNumber: 'A-01' });
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/admin/desks/:id (US-018/AC-01, AC-02, AC-07, AC-09)', () => {
  const DESK_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  function updatingDesksRepository(outcomes: UpdateDeskOutcome[]) {
    const calls: Array<{ id: string; deskNumber: string }> = [];
    let i = 0;
    const repository: DesksRepository = {
      ...noDesks,
      async updateDeskNumber(id, deskNumber) {
        calls.push({ id, deskNumber });
        const outcome = outcomes[i] ?? outcomes[outcomes.length - 1];
        i += 1;
        if (!outcome) throw new Error('no outcome stubbed');
        return outcome;
      },
    };
    return { repository, calls };
  }

  it('a valid body renames the desk and returns 200 with NO bookedAhead (US-018/AC-01)', async () => {
    const { repository } = updatingDesksRepository([{ kind: 'ok', desk: { id: DESK_ID, desk_number: 'B-05', is_active: true } }]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .patch(`/api/admin/desks/${DESK_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'b-05' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: DESK_ID, deskNumber: 'B-05', isActive: true });
    expect(response.body.bookedAhead).toBeUndefined();
  });

  it('normalises the body BEFORE it reaches the repository (US-018/AC-02)', async () => {
    const { repository, calls } = updatingDesksRepository([{ kind: 'ok', desk: { id: DESK_ID, desk_number: 'B-05', is_active: true } }]);
    const app = appWith({ desks: repository });

    await request(app)
      .patch(`/api/admin/desks/${DESK_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'b-05' });

    expect(calls).toEqual([{ id: DESK_ID, deskNumber: 'B-05' }]);
  });

  it('renaming to the current number succeeds, not refused as a duplicate (US-018/AC-07)', async () => {
    const { repository } = updatingDesksRepository([{ kind: 'ok', desk: { id: DESK_ID, desk_number: 'A-01', is_active: true } }]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .patch(`/api/admin/desks/${DESK_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-01' });

    expect(response.status).toBe(200);
  });

  it('a malformed body is refused at the edge with 400 invalid_request, and no update is attempted (US-018/AC-02)', async () => {
    const { repository, calls } = updatingDesksRepository([]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .patch(`/api/admin/desks/${DESK_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-1' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
    expect(calls).toEqual([]);
  });

  it('an unknown field is refused at the edge (.strict()), including isActive', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .patch(`/api/admin/desks/${DESK_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-01', isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('a malformed id path param is refused at the edge with 400 invalid_request', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .patch('/api/admin/desks/not-a-uuid')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-01' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('a duplicate desk number gets 409 desk_number_taken (US-018/AC-02)', async () => {
    const { repository } = updatingDesksRepository([{ kind: 'duplicate' }]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .patch(`/api/admin/desks/${DESK_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-01' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('desk_number_taken');
  });

  it('a desk id matching no row gets 404 desk_not_found', async () => {
    const { repository } = updatingDesksRepository([{ kind: 'not_found' }]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .patch(`/api/admin/desks/${DESK_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ deskNumber: 'A-01' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('desk_not_found');
  });

  it('refuses an Employee session with 403 admin_only, reaching the real mount (US-018/AC-09)', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .patch(`/api/admin/desks/${DESK_ID}`)
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .send({ deskNumber: 'A-01' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
  });

  it('refuses a request with no token at all', async () => {
    const app = appWith({ desks: noDesks });
    const response = await request(app).patch(`/api/admin/desks/${DESK_ID}`).send({ deskNumber: 'A-01' });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/admin/desks/:id/deactivate (US-019/AC-01, AC-04, AC-07, AC-08, AC-12)', () => {
  const DESK_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  function deactivatingDesksRepository(
    outcomes: Array<{ count: number } | { setActive: SetDeskActiveOutcome }>,
  ) {
    const countCalls: Array<{ deskId: string; status: string; from: string }> = [];
    const setActiveCalls: Array<{ id: string; isActive: boolean }> = [];
    let i = 0;
    const repository: DesksRepository = {
      ...noDesks,
      async countUpcomingConfirmedForDesk(deskId, status, from) {
        countCalls.push({ deskId, status, from });
        const outcome = outcomes[i];
        i += 1;
        if (!outcome || !('count' in outcome)) throw new Error('no count stubbed');
        return outcome.count;
      },
      async setDeskActive(id, isActive) {
        setActiveCalls.push({ id, isActive });
        const outcome = outcomes[i];
        i += 1;
        if (!outcome || !('setActive' in outcome)) throw new Error('no setActive outcome stubbed');
        return outcome.setActive;
      },
    };
    return { repository, countCalls, setActiveCalls };
  }

  it('deactivates a desk with no upcoming bookings: 200 with id/deskNumber/isActive, no bookedAhead (US-019/AC-01)', async () => {
    const { repository } = deactivatingDesksRepository([
      { count: 0 },
      { setActive: { kind: 'ok', desk: { id: DESK_ID, desk_number: 'A-02', is_active: false } } },
    ]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/deactivate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: DESK_ID, deskNumber: 'A-02', isActive: false });
    expect(response.body.bookedAhead).toBeUndefined();
  });

  it('a desk with 3 upcoming bookings is refused 422 desk_has_upcoming_bookings, the count in details.upcomingBookings on the raw body (US-019/AC-04)', async () => {
    const { repository, setActiveCalls } = deactivatingDesksRepository([{ count: 3 }]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/deactivate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('desk_has_upcoming_bookings');
    expect(response.body.details).toEqual({ upcomingBookings: 3 });
    // AC-05/AC-08: nothing in the request named a count, and nothing is written on the blocked path.
    expect(setActiveCalls).toHaveLength(0);
  });

  it('the server refuses even though nothing in the request body or params mentions a count — the server is the rule, not a prediction (US-019/AC-08)', async () => {
    const { repository } = deactivatingDesksRepository([{ count: 3 }]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/deactivate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});

    expect(response.status).toBe(422);
  });

  it('deactivation succeeds once a previously blocking count clears — nothing cached between requests (US-019/AC-07)', async () => {
    const { repository } = deactivatingDesksRepository([
      { count: 0 },
      { setActive: { kind: 'ok', desk: { id: DESK_ID, desk_number: 'A-02', is_active: false } } },
    ]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/deactivate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
  });

  it('a desk id matching no row gets 404 desk_not_found', async () => {
    const { repository } = deactivatingDesksRepository([{ count: 0 }, { setActive: { kind: 'not_found' } }]);
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/deactivate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('desk_not_found');
  });

  it('a malformed id path param is refused at the edge with 400 invalid_request', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .post('/api/admin/desks/not-a-uuid/deactivate')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('refuses an Employee session with 403 admin_only, reaching the real mount (US-019/AC-12)', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/deactivate`)
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
  });

  it('refuses a request with no token at all (US-019/AC-12)', async () => {
    const app = appWith({ desks: noDesks });
    const response = await request(app).post(`/api/admin/desks/${DESK_ID}/deactivate`);
    expect(response.status).toBe(401);
  });
});

describe('POST /api/admin/desks/:id/activate (US-019/AC-01, AC-09, AC-12)', () => {
  const DESK_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  function activatingDesksRepository(outcome: SetDeskActiveOutcome) {
    const setActiveCalls: Array<{ id: string; isActive: boolean }> = [];
    const countCalls: unknown[] = [];
    const repository: DesksRepository = {
      ...noDesks,
      async countUpcomingConfirmedForDesk() {
        countCalls.push(true);
        throw new Error('countUpcomingConfirmedForDesk must not be called by activate (US-019/AC-09)');
      },
      async setDeskActive(id, isActive) {
        setActiveCalls.push({ id, isActive });
        return outcome;
      },
    };
    return { repository, setActiveCalls, countCalls };
  }

  it('activates a desk with no dialog, no count, and no rule to satisfy: 200 with id/deskNumber/isActive (US-019/AC-01, AC-09)', async () => {
    const { repository, setActiveCalls, countCalls } = activatingDesksRepository({
      kind: 'ok',
      desk: { id: DESK_ID, desk_number: 'C-05', is_active: true },
    });
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/activate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: DESK_ID, deskNumber: 'C-05', isActive: true });
    expect(setActiveCalls).toEqual([{ id: DESK_ID, isActive: true }]);
    expect(countCalls).toHaveLength(0);
  });

  it('a desk id matching no row gets 404 desk_not_found', async () => {
    const { repository } = activatingDesksRepository({ kind: 'not_found' });
    const app = appWith({ desks: repository });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/activate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('desk_not_found');
  });

  it('a malformed id path param is refused at the edge with 400 invalid_request', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .post('/api/admin/desks/not-a-uuid/activate')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('refuses an Employee session with 403 admin_only, reaching the real mount (US-019/AC-12)', async () => {
    const app = appWith({ desks: noDesks });

    const response = await request(app)
      .post(`/api/admin/desks/${DESK_ID}/activate`)
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
  });

  it('refuses a request with no token at all (US-019/AC-12)', async () => {
    const app = appWith({ desks: noDesks });
    const response = await request(app).post(`/api/admin/desks/${DESK_ID}/activate`);
    expect(response.status).toBe(401);
  });
});

describe('POST /api/admin/bookings/:id/cancel (US-015)', () => {
  const BOOKING_ID = '11111111-1111-4111-8111-111111111111';

  function capturingCancel(outcome: { id: string } | undefined) {
    const calls: Array<{ bookingId: string; adminId: string; cancelledAt: Date; today: string }> = [];
    const repository: Pick<AdminBookingsRepository, 'listBookings' | 'cancelAnyBooking' | 'findBookingState'> = {
      async listBookings() {
        throw new Error('not used in this test');
      },
      async cancelAnyBooking(bookingId, adminId, cancelledAt, today) {
        calls.push({ bookingId, adminId, cancelledAt, today });
        return outcome;
      },
      async findBookingState() {
        return undefined;
      },
    };
    return { repository, calls };
  }

  it('cancels a confirmed booking: 200 empty body, and the acting admin session id reaches the repository as cancelled_by (US-015/AC-02, AC-04, AC-05, AC-06)', async () => {
    const { repository, calls } = capturingCancel({ id: BOOKING_ID });
    const app = appWith({ adminBookings: repository });

    const response = await request(app)
      .post(`/api/admin/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(calls).toHaveLength(1);
    expect(calls[0]?.bookingId).toBe(BOOKING_ID);
    expect(calls[0]?.adminId).toBe(ADMIN.id);
  });

  it('a past-dated or non-existent booking id gets 404 booking_not_found (US-015/AC-02)', async () => {
    const { repository } = capturingCancel(undefined);
    const app = appWith({ adminBookings: repository });

    const response = await request(app)
      .post(`/api/admin/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('booking_not_found');
  });

  it('an already-cancelled booking gets 409 booking_already_cancelled (US-015/AC-09)', async () => {
    const repository: Pick<AdminBookingsRepository, 'listBookings' | 'cancelAnyBooking' | 'findBookingState'> = {
      async listBookings() {
        throw new Error('not used in this test');
      },
      async cancelAnyBooking() {
        return undefined;
      },
      async findBookingState() {
        return { status: 'cancelled', booking_date: '2026-09-10' };
      },
    };
    const app = appWith({ adminBookings: repository });

    const response = await request(app)
      .post(`/api/admin/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('booking_already_cancelled');
  });

  it('a malformed id is refused at the edge with 400 invalid_request', async () => {
    const app = appWith({});
    const response = await request(app)
      .post('/api/admin/bookings/not-a-uuid/cancel')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('refuses an Employee session with 403 admin_only', async () => {
    const { repository } = capturingCancel({ id: BOOKING_ID });
    const app = appWith({ adminBookings: repository });

    const response = await request(app)
      .post(`/api/admin/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
  });

  it('refuses a request with no token at all', async () => {
    const app = appWith({});
    const response = await request(app).post(`/api/admin/bookings/${BOOKING_ID}/cancel`);
    expect(response.status).toBe(401);
  });
});

describe('GET /api/admin/users (US-020/AC-01, AC-04, AC-06, AC-13)', () => {
  const FIVE_ACCOUNTS: UserAccountRow[] = [
    accountRow({ id: '1', full_name: 'Dana Silva', email: 'dana@company.com', role: 'employee', is_active: true }),
    accountRow({ id: '2', full_name: 'Sam Okoro', email: 'sam@company.com', role: 'employee', is_active: true }),
    accountRow({ id: '3', full_name: 'Priya Sharma', email: 'priya2@company.com', role: 'employee', is_active: true }),
    accountRow({ id: '4', full_name: 'Marcus Vale', email: 'vale@company.com', role: 'admin', is_active: true }),
    accountRow({ id: '5', full_name: 'Alex Ito', email: 'alex@company.com', role: 'admin', is_active: false }),
  ];
  const SUMMARY_ROWS: UserSummaryRow[] = FIVE_ACCOUNTS.map((r) => ({ role: r.role, is_active: r.is_active }));

  it('returns every account\'s exact shape plus the whole-list summary (US-020/AC-01, AC-02) — toEqual, never toMatchObject, per design note §7', async () => {
    const users: UsersRepository = {
      async listAccounts() {
        return FIVE_ACCOUNTS;
      },
      async getSummaryCounts() {
        return SUMMARY_ROWS;
      },
    };
    const app = appWith({ users });

    const response = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      users: [
        { id: '1', fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: true },
        { id: '2', fullName: 'Sam Okoro', email: 'sam@company.com', role: 'employee', isActive: true },
        { id: '3', fullName: 'Priya Sharma', email: 'priya2@company.com', role: 'employee', isActive: true },
        { id: '4', fullName: 'Marcus Vale', email: 'vale@company.com', role: 'admin', isActive: true },
        { id: '5', fullName: 'Alex Ito', email: 'alex@company.com', role: 'admin', isActive: false },
      ],
      summary: { total: 5, employees: 3, admins: 2, deactivated: 1 },
    });
  });

  it('sets Cache-Control: private, no-store — this route carries every account\'s name and email (design note §3.4)', async () => {
    const app = appWith({ users: noUsers });
    const response = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('filters by q — only the matching accounts are returned (US-020/AC-04)', async () => {
    const matching = [FIVE_ACCOUNTS[0]!, FIVE_ACCOUNTS[3]!];
    const users: UsersRepository = {
      async listAccounts(q) {
        expect(q).toBe('a');
        return matching;
      },
      async getSummaryCounts() {
        return SUMMARY_ROWS;
      },
    };
    const app = appWith({ users });

    const response = await request(app).get('/api/admin/users?q=a').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(2);
    expect(response.body.users.map((u: { id: string }) => u.id)).toEqual(['1', '4']);
  });

  it('the summary is UNCHANGED by an active search — re-counting it would delete the admin count at the moment it is load-bearing (US-020/AC-06)', async () => {
    const users: UsersRepository = {
      async listAccounts(q) {
        return q === undefined ? FIVE_ACCOUNTS : [FIVE_ACCOUNTS[0]!];
      },
      async getSummaryCounts() {
        return SUMMARY_ROWS;
      },
    };
    const app = appWith({ users });

    const withoutQ = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    const withQ = await request(app).get('/api/admin/users?q=dana').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(withQ.body.summary).toEqual(withoutQ.body.summary);
    expect(withQ.body.summary).toEqual({ total: 5, employees: 3, admins: 2, deactivated: 1 });
  });

  it('an empty q is rejected at the edge with 400 invalid_request (.strict()/.min(1))', async () => {
    const app = appWith({ users: noUsers });
    const response = await request(app).get('/api/admin/users?q=').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('a q over 100 characters is rejected at the edge with 400 invalid_request (design note A15)', async () => {
    const app = appWith({ users: noUsers });
    const response = await request(app)
      .get(`/api/admin/users?q=${'a'.repeat(101)}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('an unknown query field is rejected at the edge with 400 invalid_request (.strict())', async () => {
    const app = appWith({ users: noUsers });
    const response = await request(app)
      .get('/api/admin/users?page=2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('refuses an Employee session with 403 admin_only, revealing no other account name or email at all (US-020/AC-13)', async () => {
    const users: UsersRepository = {
      async listAccounts() {
        return FIVE_ACCOUNTS;
      },
      async getSummaryCounts() {
        return SUMMARY_ROWS;
      },
    };
    const app = appWith({ users });

    const response = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
    const body = JSON.stringify(response.body);
    for (const account of FIVE_ACCOUNTS) {
      expect(body).not.toContain(account.full_name);
      expect(body).not.toContain(account.email);
    }
  });

  it('refuses a request with no token at all', async () => {
    const app = appWith({ users: noUsers });
    const response = await request(app).get('/api/admin/users');
    expect(response.status).toBe(401);
  });
});
